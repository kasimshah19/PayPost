# Testing Guide: Invariants, Risky Tests & Coverage

PayPost enforces strict financial conservation, race-free state transitions, and deterministic outbox processing. This document details the 9 core system invariants, how the test suites are structured, and how to reproduce results.

---

## 1. Core Invariants & Audit Table

| Invariant | Description | Why This Is Risky | Proven By Test Names (from real test files) |
|---|---|---|---|
| **I1** | `platformFee + GST + TDS + net === gross fee`, all integer paise and `>= 0`. | Rounding errors or fractional paise could leak money on every single payout, causing financial discrepancies over time. | `tests/fees.test.js`:<br>• *"always satisfies: platformFee + gst + tds + net === grossFee"*<br>• *"all outputs are non-negative integers"*<br>• *"handles boundary amounts correctly"*<br>• *"exact math for gross = 100000 paise"* |
| **I2** | `reservedPaise + paidOutPaise <= budgetPaise` and `0 <= approvedCount <= slots`, even under high concurrency. | Approving more creators than slots or over-allocating budget leaves creators unpaid or bankrupts campaigns. | `tests/application.test.js`:<br>• *"concurrent approvals never exceed campaign slot limit"*<br>• *"concurrent approvals never exceed remaining budget"*<br>`tests/e2e.lifecycle.test.js`:<br>• *"complete business story with real services, invariant verification, and money conservation"* |
| **I3** | Concurrent approvals never exceed slots or budget. | Simultaneous clicks or parallel API calls can race to approve applicants before the campaign budget/slot is updated. | `tests/application.test.js`:<br>• *"concurrent approvals never exceed campaign slot limit"*<br>• *"concurrent approvals never exceed remaining budget"*<br>`tests/chaos.test.js`:<br>• *"runs 5 rounds of concurrent actions and maintains all invariants"* |
| **I4** | One submission can never be paid twice (idempotency). | Network retries, duplicate clicks, or parallel webhook arrivals could trigger double wallet credits. | `tests/wallet.test.js`:<br>• *"rejects duplicate credit for the same submission (idempotency)"*<br>`tests/submission.test.js`:<br>• *"cannot review an already approved submission"* |
| **I5** | Submit and withdraw are mutually exclusive (race-protected). | A creator might withdraw an application at the exact millisecond they submit deliverable, claiming funds while canceling obligation. | `tests/submission.test.js`:<br>• *"race condition: creator cannot withdraw and submit simultaneously"*<br>`tests/application.test.js`:<br>• *"creator can withdraw an APPLIED application"* |
| **I6** | Revisions never exceed 2; approved creators cannot be removed by brand. | Brands might trap creators in endless revision loops or remove approved creators without paying for work done. | `tests/submission.test.js`:<br>• *"cannot request more than 2 revisions"*<br>• *"brand cannot remove approved creator"*<br>• *"calculates correct resubmit deadline (later of submission deadline or +48h)"* |
| **I7** | Wallet balance equals sum of its ledger; ledger entries are strictly immutable. | Cached balances getting out of sync with ledger records leads to phantom money or unbacked withdrawals. | `tests/wallet.test.js`:<br>• *"wallet balance equals the sum of ledger entries"*<br>• *"ledger entries cannot be updated"*<br>• *"ledger entries cannot be deleted"*<br>`tests/e2e.lifecycle.test.js`:<br>• *"complete business story with real services, invariant verification, and money conservation"* |
| **I8** | Failed withdrawal returns money exactly once; `heldPaise` equals active withdrawals; only one active withdrawal per creator. | Payout provider outages could destroy creator balances if reversal fails, or double-refund if retried twice. | `tests/withdrawal.test.js`:<br>• *"only one active withdrawal allowed per creator"*<br>• *"worker processes pending withdrawal with mock success"*<br>• *"worker handles mock failure, marks FAILED, refunds held balance"*<br>• *"finalizing an already finalized withdrawal is a no-op (idempotency)"* |
| **I9** | No notification sent between 9 PM and 9 AM IST; opt-out is honored (even after queuing); outbox ensures zero lost notifications. | Nighttime spam violates TRAI regulations and frustrates users; outbox guarantees that committed DB transactions always queue messages without ghost notifications on rollback. | `tests/quietHours.test.js`:<br>• *"correctly identifies quiet hours (>= 21:00 or < 09:00 IST)"*<br>• *"schedules quiet hour jobs to next 09:00:00 IST"*<br>`tests/notification.test.js`:<br>• *"drops notification if user opted out of email channel"*<br>• *"drops notification if user opted out between queue time and send time"*<br>• *"notifies recipient using transactional session and idempotent dedupe"* |
| **I10** | No real-time event emitted before database commit; zero cross-user/role leakage; payloads contain only allowlisted keys without sensitive fields. | Emitting before commit leaks false updates on transaction abort; leaking foreign events or balances exposes financial/private data. | `tests/realtime.test.js`:<br>• *"transaction rollback emits nothing"*<br>• *"successful transaction flushes events exactly once"*<br>• *"retried withTransaction clears intermediate attempts and flushes once"*<br>• *"a brand cannot receive another brand's events"*<br>• *"creator B cannot receive creator A's private wallet/application events"*<br>• *"discover:changed reaches creators but not brands"*<br>• *"payloads contain only allowlisted keys and never sensitive fields"* |


---

## 2. Test Groups & Risky Test Mapping

We group the three riskiest domains of the application into targeted test runners:

### R1: "Money In" (Budget, Fees, & Payout Settlement)
*Focus*: Fee calculation precision, atomic campaign budget/slot reservations, and idempotent wallet credits upon deliverable approval.
*Files*:
- `tests/fees.test.js`
- `tests/application.test.js` (approval & budget race tests)
- `tests/wallet.test.js` (settlement & ledger immutability tests)

*Run*:
```bash
npm run test:risky:money
```

### R2: "State Machine and Races" (Application & Deliverable Transitions)
*Focus*: Two-phase state transitions (`apply`, `withdraw`, `approve`, `submit`, `revise`, `reject`), mutual exclusion between submit and withdraw, revision counters, and brand cancellation guards.
*Files*:
- `tests/application.test.js`
- `tests/submission.test.js`

*Run*:
```bash
npm run test:risky:state
```

### R3: "Money Out and Messaging" (Withdrawals & Outbox Notifications)
*Focus*: Two-phase withdrawal holds, asynchronous worker polling, failure refund idempotency, crash reconciliation, quiet hours IST scheduling, and channel opt-out enforcement.
*Files*:
- `tests/withdrawal.test.js`
- `tests/notification.test.js`
- `tests/quietHours.test.js`

*Run*:
```bash
npm run test:risky:out
```

### R4: "Real-Time Synchronization" (Socket.IO Invariants & Privacy)
*Focus*: Socket handshake authentication, connection limits (max 5), room isolation (`user:<id>`, `role:<role>`), strict payload filtering via `buildPayload`, post-commit queue flush via `WeakMap`, rollback discard, retry clearance, and business flow emits.
*Files*:
- `tests/realtime.test.js`

*Run*:
```bash
npx jest tests/realtime.test.js --runInBand
```

### Running All Risky Tests Together
```bash
npm run test:risky
```


---

## 3. High-Confidence Full Lifecycle & Chaos Tests

In addition to targeted tests, two dedicated end-to-end tests rigorously exercise the system:

### 1. Full Business Lifecycle Test (`tests/e2e.lifecycle.test.js`)
Simulates the full multi-actor workflow end-to-end:
1. 1 Brand registers and creates a campaign with 3 slots and budget for 2 creators.
2. 4 Creators register and apply.
3. 2 Creators are approved (slots & budget reserved).
4. 3rd approval is denied due to budget exhaustion.
5. 1 Approved creator withdraws application before submitting deliverable (releasing 1 slot and fee reservation).
6. 2nd creator submits deliverable, receives revision request with note, resubmits, and is approved (payout settlement).
7. Another creator applies, gets approved, submits deliverable, and is rejected by brand (slot released).
8. Paid creator withdraws funds: first withdrawal succeeds via `success@mock`, second fails and reverses via `fail@mock`.
9. Brand cancels the campaign (allowed since no deliverables are pending review).
10. **Final Audits**:
    - `campaign.budgetPaise === available + reserved + paidOut`
    - Sum of `platformFee + GST + TDS + net` across approved submissions equals `paidOutPaise`.
    - Total ledger credits match total net payouts.
    - `checkIntegrity()` runs 8 system checks with 0 errors.
    - No notification jobs have `scheduledFor` timestamps inside IST quiet hours.
    - Ledger entries are verified to be immutable against updates and deletions.

### 2. Seeded Concurrency Chaos Test (`tests/chaos.test.js`)
- Uses a deterministic, zero-dependency `mulberry32` pseudo-random generator.
- Reads seed from environment variable `CHAOS_SEED` (defaults to `424242`).
- Prints the active seed on run so any failure is reproducible.
- **Scenario**: 1 brand, 1 campaign (3 slots, budget for 2), 8 creators.
- **Rounds**: Executes 5 consecutive rounds. Each round fires 10–14 random actions simultaneously via `Promise.allSettled`:
  - `applyToCampaign`
  - `withdrawApplication`
  - `approveApplication`
  - `submitDeliverable`
  - `approveSubmission` / `requestRevision` / `rejectSubmission`
  - `requestWithdrawal`
  - `processWithdrawalsOnce`
  - `processNotificationsOnce`
- After each round, verifies that:
  - Every rejected action failed with an expected business code (`400`, `404`, or `409`), never an unhandled server crash.
  - Invariants **I2**, **I7**, and **I8** remain 100% intact via `checkIntegrity()`.
- Runs cleanly in under 5 seconds.

---

## 4. Test Suite Coverage Summary

Generated with `npx jest --coverage`:

| Metric | Overall Coverage |
|---|---|
| **Statements** | **79.97%** |
| **Branches** | **63.78%** |
| **Functions** | **89.50%** |
| **Lines** | **83.36%** |

*Core service coverage*:
- `feeCalculator.js`: 100% Statements / 100% Branches / 100% Lines
- `quietHours.js`: 100% Statements / 100% Branches / 100% Lines
- `withTransaction.js`: 100% Statements / 100% Branches / 100% Lines
- `walletService.js`: 89.70% Statements / 95.16% Lines
- `notificationService.js`: 91.89% Statements / 100% Lines
- `creator.service.js`: 88.37% Statements / 90.24% Lines
- `backfillService.js`: 89.13% Statements / 88.88% Lines
- `payoutService.js`: 89.18% Statements / 88.88% Lines
- `campaign.service.js`: 74.66% Statements / 81.72% Lines
- `withdrawalService.js`: 77.22% Statements / 80.20% Lines
- `integrityService.js`: 71.32% Statements / 70.71% Lines

All 15 test suites and 203 automated tests run purely in-memory using `MongoMemoryReplSet` without requiring external database connections or active network calls.
