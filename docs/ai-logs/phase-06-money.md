# Phase 6: Fee Calculator & Ledger Settlement

## Prompt I sent

```text
Implement Indian tax fee calculator and double-entry wallet settlement:
1. Fee Formula (gross fee paid by brand):
   - Platform fee = 10% of gross
   - GST = 18% of platform fee (deducted from creator)
   - TDS = 1% of (gross - platform fee - GST)
   - Net = gross - platform fee - GST - TDS
   - Integer paise rounding half-up. Invariant: platformFee + GST + TDS + net === gross.
2. Settlement on Deliverable Approval:
   - Calculate fee breakdown and save snapshot on Submission.
   - Shift campaign money: reservedPaise -= fee, paidOutPaise += fee.
   - Credit net amount to creator Wallet with an immutable LedgerEntry (payout_credit).
   - Idempotency key 'payout:<submissionId>' prevents double credit.
3. Build balance integrity checker service (integrityService.js) and check script. Write tests in tests/fees.test.js and tests/wallet.test.js.
```

---

## What the AI built (short)

- feeCalculator.js implementing exact integer paise formula with 100% test coverage.
- walletService.js managing ledger entries, balance increments, and idempotency keys.
- payoutService.js orchestrating atomic campaign reservation release and wallet credit inside Mongoose transaction session.
- integrityService.js running 8 financial invariant checks across all wallets and campaigns.
- Unit tests in tests/fees.test.js and tests/wallet.test.js verifying mathematical conservation and idempotency.

---

## What I tested myself and what I found or fixed

1. Tested fee calculator across 10,000 random gross amounts: verified 0 paise leakage in all cases.
2. Verified exact math for ₹1,000 (100000 paise): Platform Fee = ₹100 (10000), GST = ₹18 (1800), TDS = ₹8.82 -> ₹9 (882), Net = ₹873.18 (87318).
3. Tested double payout approval: verified that duplicate credit was rejected by idempotency key.
4. Ran 'npm run wallet:check' to verify that wallet balances match net sum of ledger entries.
