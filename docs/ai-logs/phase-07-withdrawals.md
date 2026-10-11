# Phase 7: Two-Phase Hold-and-Settle UPI Withdrawals & Worker Reconciliation

## Prompt I sent

```text
Implement Two-Phase Hold-and-Settle UPI Withdrawal architecture with background processing:
1. Endpoints & Operations:
   - POST /api/withdrawals: Creator requests UPI withdrawal.
   - GET /api/withdrawals/my: Creator views withdrawal history with status history.
   - GET /api/withdrawals/:id: View withdrawal detail and provider reference.
2. Business Rules:
   - Minimum withdrawal amount: ₹100 (10000 paise).
   - Creators can only withdraw available wallet balance (held funds cannot be withdrawn).
   - Only ONE active withdrawal allowed per creator at a time (enforced by partial unique index { user: 1, isActive: true }).
3. Two-Phase Hold-and-Settle Architecture:
   - External payout provider APIs should NEVER be called inside an open database transaction.
   - Phase 1 (Request - DB Transaction):
     a) Verify balancePaise >= amount.
     b) Atomically shift: balancePaise -= amount, heldPaise += amount.
     c) Append LedgerEntry (type: 'withdrawal_hold', direction: 'debit').
     d) Create Withdrawal document (status: 'pending', isActive: true).
   - Worker Phase (Background Polling):
     a) withdrawalWorker.js polls pending jobs every 3 seconds.
     b) Atomically claims job: status -> 'processing'.
     c) Calls mock payout provider OUTSIDE database transaction with unique idempotencyKey.
   - Phase 2 (Finalization - DB Transaction):
     - On Provider Success: Mark status 'succeeded', decrement heldPaise -= amount, clear isActive = false.
     - On Provider Failure: Mark status 'failed', refund balance: heldPaise -= amount, balancePaise += amount, append LedgerEntry (type: 'withdrawal_reversal', direction: 'credit'), clear isActive = false.
4. Deterministic Mock Provider (mockPayoutProvider.js):
   - UPI IDs ending in 'success@mock' always succeed.
   - UPI IDs ending in 'fail@mock' always fail.
   - Random mode follows MOCK_PAYOUT_SUCCESS_RATE (default 0.7).
5. Crash Recovery (Reconcile Worker):
   - If server crashes while a withdrawal is in 'processing' status for >60s, worker automatically checks provider status using idempotencyKey and finalizes the transaction safely.
6. Write tests in tests/withdrawal.test.js.
```

---

## What the AI built (Detailed Architecture & Implementation)

### 1. Withdrawal Service Layer (`src/services/withdrawalService.js`)
- **`requestWithdrawal({ userId, amountPaise, upiId, clientKey })`**:
  - Validates minimum amount (`amountPaise >= 10000`) and UPI format (`user@bank`).
  - Checks available balance (`balancePaise >= amountPaise`).
  - Atomically deducts `balancePaise` and increments `heldPaise`.
  - Creates `LedgerEntry` (`withdrawal_hold`, `debit`).
  - Creates `Withdrawal` in `pending` state with `isActive: true`.
- **`finalizeWithdrawal({ withdrawalId, status, providerRef, failureReason })`**:
  - If `succeeded`: clears `isActive`, decrements `heldPaise`.
  - If `failed`: clears `isActive`, refunds `heldPaise` back to `balancePaise`, and appends `withdrawal_reversal` credit to ledger.
  - Safe to execute multiple times (idempotent).

### 2. Asynchronous Polling Worker (`src/jobs/withdrawalWorker.js`)
- Runs every 3 seconds via `setInterval`.
- Atomically claims pending jobs using `findOneAndUpdate({ status: 'pending' }, { status: 'processing' })`.
- Calls `mockPayoutProvider.payout()` outside database transactions.
- Finalizes status and notifies creator.
- **Reconciliation Engine**: Finds withdrawals stuck in `processing` for >60s, queries provider status with `idempotencyKey`, and finalizes state.

### 3. Deterministic Mock Payout Provider (`src/services/mockPayoutProvider.js`)
- Deterministic routing based on UPI handle: `success@mock` $ightarrow$ success, `fail@mock` $ightarrow$ failure.
- In-memory idempotency cache simulating payment gateway API responses.

### 4. Test Suite (`tests/withdrawal.test.js`)
- 27 tests covering hold shifts, worker execution, failure refunds, idempotency, and concurrent request locks.

---

## What I tested myself, what I found or fixed & Verification Proofs

### 1. Minimum Amount & Single Active Withdrawal Lock
- Attempted withdrawal of ₹50: Rejected with HTTP 400 (*"Amount must be at least ₹100"*).
- Initiated valid ₹500 withdrawal: Succeeded, status marked `pending`.
- Attempted to submit a second withdrawal while first was active: Rejected with HTTP 409 (*"You already have an active withdrawal in progress"*).

### 2. Successful Withdrawal Flow
- Requested withdrawal of ₹1,000 to `success@mock`:
  - Phase 1: `balancePaise` dropped by 100000, `heldPaise` increased by 100000.
  - Worker ran: Payout succeeded, `heldPaise` decremented by 100000, status marked `succeeded`.
  - Ledger contained `withdrawal_hold` debit. Final balance matched ledger net.

### 3. Failed Withdrawal & Reversal Flow
- Requested withdrawal of ₹500 to `fail@mock`:
  - Phase 1: ₹500 moved to `heldPaise`.
  - Worker ran: Provider rejected transaction (*"Bank server down"*).
  - Phase 2: Held balance cleared, ₹500 returned to available balance, `withdrawal_reversal` ledger entry created.
  - Available balance restored to exact original figure.

### 4. Crash Recovery (Reconciliation) Test
- Manually placed withdrawal into `processing` status with timestamp 2 minutes in the past.
- Triggered `reconcileStuckWithdrawals()`:
  - Worker identified orphaned transaction, queried provider with idempotency key, completed payout, and cleared active flag.
