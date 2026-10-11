# Phase 2b: Database Models, Financial Schemas & Immutability Rules

## Prompt I sent

```text
Architect and implement the complete Mongoose domain data models for PayPost:
1. Core Entities:
   - Campaign: brand (ref User), title, description, budgetPaise, perCreatorFeePaise, slots, approvedCount, reservedPaise, paidOutPaise, status (draft, active, completed, cancelled), applicationDeadline, submissionDeadline.
   - Application: campaign, creator, pitch, status (applied, approved, rejected, withdrawn, cancelled), lockedFeePaise, appliedAt, reviewedAt.
   - Submission: campaign, application, creator, instagramUrl, creatorNotes, status (submitted, revision_requested, approved, rejected), version, revisionCount, payoutBreakdown snapshot, revisionDueAt.
   - Wallet: user (ref User, unique), balancePaise, heldPaise.
   - LedgerEntry: wallet, user, type (payout_credit, withdrawal_hold, withdrawal_reversal), direction (credit, debit), amountPaise, balanceAfterPaise, refType, refId, idempotencyKey (unique).
   - Withdrawal: user, wallet, amountPaise, status (pending, processing, succeeded, failed), upiId, providerRef, failureReason, isActive.
   - NotificationJob: recipient, event, channel (email, whatsapp), payload, status, scheduledFor, attempts, lastAttemptAt.
2. Financial Safeguards & Constraints:
   - LedgerEntry Immutability: In accounting, financial ledgers must be strictly append-only. Attach Mongoose pre-hooks on LedgerEntry schema to block updateOne, updateMany, replaceOne, and deleteOne with an error.
   - Exactly One Active Withdrawal: Prevent a creator from spamming parallel withdrawal requests. Add a partial unique index on Withdrawal: { user: 1, isActive: true } where isActive == true.
   - Campaign Constraints: Validate that budgetPaise >= perCreatorFeePaise, slots >= 1, and submissionDeadline > applicationDeadline.
3. Database Initialization Script:
   - Create scripts/initDb.js to ensure all indexes are built deterministically.
```

---

## What the AI built (Detailed Architecture & Implementation)

### 1. Schema Specifications & Mongoose Models
- **Campaign Model (`src/models/Campaign.js`)**:
  - Validates budget and fee integer ranges.
  - Enforces `budgetPaise >= perCreatorFeePaise` and `slots >= 1`.
  - Enforces date constraint: `submissionDeadline > applicationDeadline`.
  - Indexes on `brand`, `status`, and deadlines for fast aggregation queries.
- **Application Model (`src/models/Application.js`)**:
  - Tracks creator application status transitions.
  - Compound index `{ campaign: 1, creator: 1 }` enforces one application per creator per campaign.
  - `lockedFeePaise` preserves agreed creator compensation at approval time.
- **Submission Model (`src/models/Submission.js`)**:
  - Enforces `revisionCount <= 2`.
  - Embedded `payoutBreakdown` schema storing immutable tax breakdown snapshot (`platformFeePaise`, `gstPaise`, `tdsPaise`, `netPayoutPaise`).
  - Index `{ campaign: 1, instagramUrl: 1 }` for URL deduplication.
- **Wallet Model (`src/models/Wallet.js`)**:
  - Tracks creator available balance (`balancePaise`) and funds currently in transit (`heldPaise`).
- **LedgerEntry Model (`src/models/LedgerEntry.js`)**:
  - Strict append-only financial journal.
  - Pre-save and query middleware blocks `updateOne`, `updateMany`, `findOneAndUpdate`, `deleteOne`, and `deleteMany`.
  - Unique index on `idempotencyKey` prevents duplicate credits or debits.
- **Withdrawal Model (`src/models/Withdrawal.js`)**:
  - Tracks hold-and-settle UPI disbursements.
  - Partial unique index `{ user: 1, isActive: 1 }` with filter `{ isActive: true }` guarantees that a creator can only have one active withdrawal at any given time.
- **NotificationJob Model (`src/models/NotificationJob.js`)**:
  - Outbox job storage with compound index on `{ status: 1, scheduledFor: 1 }` for fast worker polling.

### 2. Initialization Script (`src/scripts/initDb.js`)
- Script that runs `syncIndexes()` across all 8 models to guarantee index alignment in development and production environments.

---

## What I tested myself, what I found or fixed & Verification Proofs

### 1. Ledger Immutability Verification
- Created a test attempting to modify a saved `LedgerEntry` document using `LedgerEntry.updateOne({ _id }, { amountPaise: 99999 })`.
- Verified that Mongoose pre-hook intercepted the query and threw: `Error: Ledger entries are immutable and cannot be modified`.
- Tested `LedgerEntry.deleteOne()`: Intercepted and blocked with `Error: Ledger entries are immutable and cannot be deleted`.

### 2. Partial Unique Index on Active Withdrawals
- Created a `Withdrawal` with `isActive: true`.
- Immediately attempted to create a second `Withdrawal` for the same creator with `isActive: true`.
- Verified that MongoDB rejected the write with duplicate key error code `E11000`.
- Marked the first withdrawal `isActive: false` (completed): verified that a new active withdrawal could now be created without conflict.

### 3. Campaign Schema Validation
- Tested saving a Campaign where `budgetPaise < perCreatorFeePaise`: Mongoose validation threw `ValidationError: Budget must be at least equal to per-creator fee`.
- Tested saving a Campaign where `submissionDeadline <= applicationDeadline`: Threw `ValidationError: Submission deadline must be after application deadline`.
