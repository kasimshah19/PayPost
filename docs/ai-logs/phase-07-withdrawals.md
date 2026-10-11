# Phase 7: Two-Phase UPI Withdrawals

## Prompt I sent

```text
Build Two-Phase UPI Withdrawal system with background worker and reconciliation:
1. Endpoints: POST /api/withdrawals (request), GET /api/withdrawals/my, GET /api/withdrawals/:id.
2. Rules: Minimum withdrawal ₹100 (10000 paise). Exactly one active withdrawal allowed per creator (enforced by partial unique index).
3. Two-Phase Pattern:
   - Phase 1 (Request): Atomic shift from balancePaise to heldPaise. LedgerEntry 'withdrawal_hold' (debit). Status 'pending'.
   - Worker: Polling worker (withdrawalWorker.js) atomically claims job ('processing'). Calls mock payout provider outside DB transaction.
   - Finalize Success: Status 'succeeded', decrement heldPaise, clear isActive.
   - Finalize Failure: Status 'failed', return heldPaise to balancePaise, LedgerEntry 'withdrawal_reversal' (credit), clear isActive.
4. Deterministic Mock Payout Provider: success@mock succeeds, fail@mock fails.
5. Reconcile stuck withdrawals (>60s processing) after server crash. Write tests in tests/withdrawal.test.js.
```

---

## What the AI built (short)

- withdrawalService.js implementing hold-and-settle architecture.
- mockPayoutProvider.js supporting deterministic simulation via UPI ID and hash-based idempotency.
- withdrawalWorker.js running every 3 seconds to poll, process, and reconcile stuck requests.
- Reconcile mechanism querying provider status with idempotency keys for crash recovery.
- Test suite tests/withdrawal.test.js testing success, failure reversal, idempotency, and concurrent request rejection.

---

## What I tested myself and what I found or fixed

1. Tested withdrawal request with ₹50: rejected with 400 (minimum is ₹100).
2. Tested successful withdrawal to success@mock: verified balance decremented, held cleared, status SUCCEEDED.
3. Tested failed withdrawal to fail@mock: verified held balance restored to available balance with withdrawal_reversal ledger entry.
4. Tested concurrent second withdrawal request while one is pending: blocked by partial unique index.
