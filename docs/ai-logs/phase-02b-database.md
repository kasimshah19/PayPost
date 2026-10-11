# Phase 2b: Database Models & Schemas

## Prompt I sent

```text
Define complete Mongoose schemas and relationships across all system entities:
1. Campaign: title, description, brand (ref User), budgetPaise, perCreatorFeePaise, slots, approvedCount, reservedPaise, paidOutPaise, status (draft, active, completed, cancelled), applicationDeadline, submissionDeadline.
2. Application: campaign, creator, pitch, status (applied, approved, rejected, withdrawn, cancelled), appliedAt, reviewedAt, lockedFeePaise.
3. Submission: campaign, application, creator, instagramUrl, creatorNotes, status (submitted, revision_requested, approved, rejected), version, revisionCount, payoutBreakdown, revisionDueAt.
4. Wallet: user, balancePaise, heldPaise.
5. LedgerEntry: wallet, user, type, direction, amountPaise, balanceAfterPaise, refType, refId, idempotencyKey (unique). Schema must forbid update and delete operations.
6. Withdrawal: user, wallet, amountPaise, status (pending, processing, succeeded, failed), upiId, idempotencyKey, isActive (partial unique index).
7. NotificationJob: recipient, event, channel, payload, status, scheduledFor, attempts.
```

---

## What the AI built (short)

- Complete domain models defined in src/models/ with enums frozen in src/constants/index.js.
- Campaign compound checks and validations ensuring budgetPaise >= perCreatorFeePaise.
- LedgerEntry immutability guard: pre-hooks on 'updateOne', 'updateMany', and 'deleteOne' throw an error to guarantee append-only ledger integrity.
- Withdrawal schema with partial unique index on { user: 1, isActive: true } to enforce exactly one active withdrawal at the database level.
- Database index initialization script (scripts/initDb.js).

---

## What I tested myself and what I found or fixed

1. Verified index creation with 'npm run db:init'.
2. Tested LedgerEntry immutability: attempted to run LedgerEntry.updateOne() in test and verified that Mongoose hook blocked it with an error.
3. Verified partial unique index on Withdrawal: successfully prevented creating two simultaneous active withdrawals for the same user.
