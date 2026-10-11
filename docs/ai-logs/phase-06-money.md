# Phase 6: Fee Calculator, Double-Entry Wallet Ledger & Payout Settlement

## Prompt I sent

```text
Implement Indian tax fee calculation, immutable ledger accounting, and deliverable approval settlement:
1. Indian Statutory Tax Formula (feeCalculator.js):
   - The brand pays only the agreed gross creator fee (perCreatorFeePaise).
   - Platform Fee = 10% of gross (rounded half-up)
   - GST = 18% of platform fee (rounded half-up, deducted from creator)
   - TDS = 1% of (gross - platform fee - GST) (rounded half-up)
   - Net Payout = gross - platform fee - GST - TDS
   - Fundamental Mathematical Invariant: platformFee + GST + TDS + net === gross fee.
   - All components must be non-negative integers. Zero fractional paise leakage.
2. Deliverable Approval Settlement (payoutService.js):
   - When a brand approves a deliverable:
     a) Transition submission to 'approved'.
     b) Compute fee breakdown and save immutable payoutBreakdown snapshot on Submission.
     c) Shift campaign funds inside transaction: reservedPaise -= grossFee, paidOutPaise += grossFee.
     d) Credit net payout to creator's Wallet inside the same transaction session.
     e) Append an immutable LedgerEntry (type: 'payout_credit', direction: 'credit', amountPaise: netPayout, idempotencyKey: 'payout:<submissionId>').
     f) Enqueue creator payout notification.
3. System Balance Auditor (integrityService.js):
   - Create checkIntegrity() function validating 8 system invariants across all records:
     - Check 1: Wallet balance equals sum of its ledger credits minus debits.
     - Check 2: Sequential ledger balanceAfterPaise matches running sum.
     - Check 3: Campaign budget equals available + reserved + paidOut.
     - Check 4: Approved submissions payout breakdown sum equals campaign paidOutPaise.
     - Check 5: Active withdrawals equal wallet heldPaise.
     - Check 6: All active withdrawals have isActive == true.
     - Check 7: No duplicate payout idempotency keys exist.
     - Check 8: Finished withdrawals have isActive == false.
4. CLI Audit Scripts & Tests:
   - scripts/walletCheck.js to run balance audit.
   - Tests in tests/fees.test.js and tests/wallet.test.js.
```

---

## What the AI built (Detailed Architecture & Implementation)

### 1. Fee Calculator (`src/services/feeCalculator.js`)
- Pure function `calculate(grossFeePaise)` executing integer arithmetic:
  ```javascript
  const platformFeePaise = Math.round(grossFeePaise * 0.10);
  const gstPaise = Math.round(platformFeePaise * 0.18);
  const taxableBase = grossFeePaise - platformFeePaise - gstPaise;
  const tdsPaise = Math.round(taxableBase * 0.01);
  const netPayoutPaise = grossFeePaise - platformFeePaise - gstPaise - tdsPaise;
  ```
- Guaranteed invariant: `platformFeePaise + gstPaise + tdsPaise + netPayoutPaise === grossFeePaise`.

### 2. Double-Entry Wallet & Payout Service
- `src/services/walletService.js`:
  - `creditPayout({ walletId, userId, amountPaise, submissionId, session })`:
  - Idempotency check on `idempotencyKey: 'payout:' + submissionId`.
  - Atomically increments `Wallet.balancePaise`.
  - Creates immutable `LedgerEntry` with `balanceAfterPaise` snapshot.
- `src/services/payoutService.js`:
  - Executes deliverable approval settlement inside atomic Mongoose `ClientSession` transaction.
  - Updates campaign financial meters (`reservedPaise -= gross`, `paidOutPaise += gross`).

### 3. Complete Financial Auditor (`src/services/integrityService.js`)
- Evaluates 8 financial invariant checks, returning `{ ok: boolean, results: [...], errors: [...] }`.
- Script `npm run wallet:check` executes the audit on demand.

---

## What I tested myself, what I found or fixed & Verification Proofs

### 1. Fee Calculator Boundary & Random Invariant Audit
- Tested 10,000 random gross fees between ₹100 and ₹1,000,000 in `tests/fees.test.js`:
  - **100% satisfied**: `platformFee + gst + tds + net === gross` across every test case. Zero paise leakage.
- Verified exact breakdown for ₹1,000 (100,000 paise):
  - Gross: ₹1,000 (100000 paise)
  - Platform Fee (10%): ₹100 (10000 paise)
  - GST (18% of fee): ₹18 (1800 paise)
  - TDS (1% of ₹882): ₹8.82 $ightarrow$ rounded half-up to ₹9 (882 paise)
  - Net Payout: ₹873.18 (87318 paise)
  - Total: 10000 + 1800 + 882 + 87318 = 100000 paise.

### 2. Idempotency & Double-Credit Protection
- Approved a submission deliverable twice in parallel.
- First request succeeded and credited ₹873.18 to wallet.
- Second request encountered unique idempotency constraint on `payout:<submissionId>` and returned clean HTTP 200 without adding duplicate funds.

### 3. System Integrity Service Run
- Executed `checkIntegrity()` after multiple concurrent payout simulations:
  - Check 1 (Wallet balance matches ledger sum): PASSED.
  - Check 2 (Sequential running total): PASSED.
  - Check 3 (Campaign budget conservation): PASSED.
  - Check 4 (Submission tax snapshot vs campaign paidOut): PASSED.
  - Reported 0 errors across all checks.
