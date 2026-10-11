# 08. Complete Database Entity-Relationship (ER) Diagram & Deep Schema Audit

This document provides the authoritative Entity-Relationship (ER) model of PayPost, complete with field types, relationship cardinalities, unique indexes, foreign key references, and an exhaustive explanation of every entity and design choice.

---

## 1. Visual Entity-Relationship Diagram

```mermaid
erDiagram
    USER ||--o{ CAMPAIGN : "creates (brand role)"
    USER ||--o{ APPLICATION : "submits (creator role)"
    USER ||--o| WALLET : "owns (creator role, 1-to-1)"
    USER ||--o{ WITHDRAWAL : "initiates (creator role)"
    USER ||--o{ NOTIFICATION_JOB : "receives"

    CAMPAIGN ||--o{ APPLICATION : "receives applicants"
    CAMPAIGN ||--o{ SUBMISSION : "tracks deliverables"
    
    APPLICATION ||--o| SUBMISSION : "produces work (1-to-1)"
    
    WALLET ||--o{ LEDGER_ENTRY : "contains double-entry ledger"
    WALLET ||--o{ WITHDRAWAL : "holds and settles disbursements"

    USER {
        ObjectId _id PK "Unique identifier"
        string name "User full name"
        string email UK "Case-insensitive unique login"
        string passwordHash "Bcrypt salt rounds 10 (select false)"
        string role "Immutable enum: brand | creator"
        object notificationPreferences "email: bool, whatsapp: bool"
        date createdAt "Registration timestamp"
    }

    CAMPAIGN {
        ObjectId _id PK "Unique campaign ID"
        ObjectId brand FK "Ref User (role: brand)"
        string title "Campaign title"
        string description "Detailed campaign brief"
        int budgetPaise "Total budget in integer paise (>= fee)"
        int perCreatorFeePaise "Gross payout per creator (>= 10,000)"
        int slots "Maximum creator slots (>= 1)"
        int approvedCount "Currently approved creators (0 <= n <= slots)"
        int reservedPaise "Locked budget for approved creators"
        int paidOutPaise "Settled budget for completed work"
        string status "Enum: draft | active | completed | cancelled"
        date applicationDeadline "Cutoff for applying"
        date submissionDeadline "Cutoff for submitting (> appDeadline)"
    }

    APPLICATION {
        ObjectId _id PK "Unique application ID"
        ObjectId campaign FK "Ref Campaign"
        ObjectId creator FK "Ref User (role: creator)"
        string pitch "Creator application note"
        string status "Enum: applied | approved | rejected | withdrawn | cancelled"
        int lockedFeePaise "Frozen gross fee at approval time"
        date appliedAt "Application timestamp"
        date reviewedAt "Brand decision timestamp"
    }

    SUBMISSION {
        ObjectId _id PK "Unique submission ID"
        ObjectId campaign FK "Ref Campaign"
        ObjectId application FK "Ref Application (Unique)"
        ObjectId creator FK "Ref User (role: creator)"
        string instagramUrl "Instagram post or reel URL"
        string creatorNotes "Creator deliverable notes"
        string status "Enum: submitted | revision_requested | approved | rejected"
        int version "Version counter (starts at 1, increments on resubmit)"
        int revisionCount "Strict limit: 0, 1, or 2 max"
        date revisionDueAt "max(subDeadline, now + 48h)"
        object payoutBreakdown "Immutable snapshot: platformFee, gst, tds, net"
    }

    WALLET {
        ObjectId _id PK "Unique wallet ID"
        ObjectId user FK "Ref User (Unique 1-to-1 with creator)"
        int balancePaise "Available spendable balance"
        int heldPaise "Funds held during active withdrawal"
        date updatedAt "Last balance modification"
    }

    LEDGER_ENTRY {
        ObjectId _id PK "Unique journal record"
        ObjectId wallet FK "Ref Wallet"
        ObjectId user FK "Ref User (creator)"
        string type "Enum: payout_credit | withdrawal_hold | withdrawal_reversal"
        string direction "Enum: credit | debit"
        int amountPaise "Integer paise moved (> 0)"
        int balanceAfterPaise "Wallet balance snapshot after operation"
        string refType "Reference domain: submission | withdrawal"
        ObjectId refId "Target reference ID"
        string idempotencyKey UK "Unique constraint (prevents double-entry)"
        date createdAt "Append-only timestamp (Immutable)"
    }

    WITHDRAWAL {
        ObjectId _id PK "Unique withdrawal ID"
        ObjectId user FK "Ref User"
        ObjectId wallet FK "Ref Wallet"
        int amountPaise "Withdrawal amount (>= 10,000 paise / ₹100)"
        string status "Enum: pending | processing | succeeded | failed"
        string upiId "Target VPA: user@bank"
        string providerRef "Gateway payment reference"
        string failureReason "Error explanation on failure"
        bool isActive "Partial UK: { user: 1, isActive: true } enforces 1 active"
        date requestedAt "Initiation timestamp"
        date processedAt "Gateway settlement timestamp"
    }

    NOTIFICATION_JOB {
        ObjectId _id PK "Unique outbox job ID"
        ObjectId recipient FK "Ref User"
        string event "Domain event name"
        string channel "Enum: email | whatsapp"
        object payload "Event metadata (amounts, links, names)"
        string status "Enum: pending | processing | sent | failed | skipped"
        date scheduledFor "IST quiet-hours deferred send time"
        int attempts "Attempt counter (max 3 with backoff)"
    }
```

---

## 2. Exhaustive Schema Explanation & Entity Purpose

### Entity 1: `User` (Core Identity & RBAC)
- **Purpose**: Represents brands and creators on the platform.
- **Key Design Decision**: The `role` field (`'brand'` or `'creator'`) is chosen at registration and is completely **immutable**. A brand can never become a creator and vice versa, which prevents privilege escalation and simplifies route authorization middleware.
- **Indexes**: Unique index on `email` (case-insensitive).

### Entity 2: `Campaign` (Collaboration Brief & Budget Meter)
- **Purpose**: Created by brands to solicit promotional Instagram posts.
- **Key Design Decision**: Maintains two real-time financial tracking counters: `reservedPaise` (funds committed to approved creators who haven't finished work yet) and `paidOutPaise` (funds finalized on deliverable approval). The fundamental invariant `reservedPaise + paidOutPaise <= budgetPaise` is strictly enforced via atomic conditional queries.
- **Validation**: `submissionDeadline` must always be strictly after `applicationDeadline`.

### Entity 3: `Application` (Creator Bidding & Commitment)
- **Purpose**: Records a creator's application to a campaign.
- **Key Design Decision**: Contains `lockedFeePaise`. When an applicant is approved, the campaign's current `perCreatorFeePaise` is copied here permanently. If the brand later updates the campaign fee for future applicants, the approved creator is legally insulated and receives their locked fee.

### Entity 4: `Submission` (Deliverable & Review State)
- **Purpose**: Stores the creator's submitted work (Instagram post or reel link).
- **Key Design Decision**: Enforces a strict two-revision limit (`revisionCount <= 2`). Stores an embedded `payoutBreakdown` object snapshot upon brand approval. This freezes statutory tax deductions (Platform fee, GST, TDS) permanently.

### Entity 5: `Wallet` (Balance Cache)
- **Purpose**: Represents the creator's current financial balance.
- **Key Design Decision**: Contains two separate buckets: `balancePaise` (available for withdrawal) and `heldPaise` (locked while an external payment gateway processes an active withdrawal). Wallet balance is technically a cached view of the ledger; `integrityService` validates that `balancePaise === sum(ledger credits) - sum(ledger debits)`.

### Entity 6: `LedgerEntry` (The Single Source of Truth)
- **Purpose**: Double-entry financial journal.
- **Key Design Decision**: **Strict Immutability**. Mongoose schema pre-hooks intercept and throw an exception on any `updateOne`, `updateMany`, or `deleteOne` call. Financial history can never be modified. A unique index on `idempotencyKey` prevents duplicate entries.

### Entity 7: `Withdrawal` (Hold-and-Settle Disbursements)
- **Purpose**: Tracks UPI disbursements to the creator's bank account.
- **Key Design Decision**: Enforces a **partial unique index** `{ user: 1, isActive: true }`. When a withdrawal is active, `isActive` is `true`. This guarantees at the database engine level that a creator cannot spawn concurrent parallel withdrawals.

### Entity 8: `NotificationJob` (Transactional Outbox)
- **Purpose**: Ensures reliable, audit-compliant messaging.
- **Key Design Decision**: Notification jobs are created inside the exact same database transaction session as the triggering business event. If a transaction aborts, zero messages are saved. Scheduled timestamps (`scheduledFor`) respect TRAI India Standard Time (IST) quiet hours (9:00 PM to 9:00 AM).
