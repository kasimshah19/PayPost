# 02. End-to-End Campaign & Deliverable Lifecycle

This sequence diagram depicts the chronological interactions between the **Brand**, **Creator**, **Backend API**, **Database**, and **Background Workers** from campaign creation through deliverable review, wallet settlement, and UPI withdrawal.

---

```mermaid
sequenceDiagram
    autonumber
    actor Brand as Brand User
    actor Creator as Creator User
    participant API as PayPost API (Express)
    participant DB as MongoDB (ACID Replica Set)
    participant Worker as Background Workers
    participant Provider as Mock UPI Gateway

    %% 1. Campaign Creation
    Note over Brand, DB: Step 1: Campaign Creation
    Brand->>API: POST /api/campaigns (Slots: 3, Fee: ₹2,000, Budget: ₹4,000)
    API->>DB: Insert Campaign (status: active, reserved: 0, paidOut: 0)
    API-->>Brand: 201 Created (isUnderfunded: true warning)

    %% 2. Application
    Note over Creator, DB: Step 2: Creator Applies
    Creator->>API: POST /api/applications (pitch, campaignId)
    API->>DB: Insert Application (status: applied)
    API-->>Creator: 201 Created

    %% 3. Atomic Approval & Reservation
    Note over Brand, DB: Step 3: Atomic Approval & Budget Reservation
    Brand->>API: POST /api/applications/:id/approve
    API->>DB: Atomic findOneAndUpdate: approvedCount < slots & budget >= reserved + fee
    DB-->>API: Campaign updated: approvedCount: 1, reservedPaise: +200000
    API->>DB: Application status -> approved, lockedFee: 200000
    API->>DB: Enqueue NotificationJob in Outbox
    API-->>Brand: 200 OK

    %% 4. Submission
    Note over Creator, DB: Step 4: Deliverable Submission
    Creator->>API: POST /api/submissions (instagramUrl, creatorNotes)
    API->>DB: Check Application is approved & not withdrawn
    API->>DB: Insert Submission (status: submitted, version: 1, revisionCount: 0)
    API-->>Creator: 201 Created

    %% 5. Revision Loop
    Note over Brand, Creator: Step 5: Controlled Revision Window
    Brand->>API: POST /api/submissions/:id/revision (feedback: "Fix lighting")
    API->>DB: Increment revisionCount (1/2), set revisionDueAt = max(deadline, +48h)
    API->>DB: Submission status -> revision_requested
    API-->>Brand: 200 OK
    Creator->>API: POST /api/submissions/:id/resubmit (updated link)
    API->>DB: Increment version: 2, status -> submitted
    API-->>Creator: 200 OK

    %% 6. Approval & Payout Settlement
    Note over Brand, DB: Step 6: Approval & Double-Entry Settlement
    Brand->>API: POST /api/submissions/:id/approve
    rect rgb(240, 248, 255)
        Note over API, DB: Atomic Mongoose Session (Multi-Doc ACID)
        API->>DB: Submission status -> approved
        API->>DB: Calculate Tax Math: Fee ₹200, GST ₹36, TDS ₹18, Net ₹1,746
        API->>DB: Save payoutBreakdown snapshot on Submission
        API->>DB: Campaign reservedPaise -= 200000, paidOutPaise += 200000
        API->>DB: Wallet balancePaise += 174600
        API->>DB: Insert LedgerEntry (payout_credit, idempotency: payout:sub_id)
        API->>DB: Enqueue NotificationJob in Outbox
    end
    API-->>Brand: 200 OK

    %% 7. Two-Phase Withdrawal
    Note over Creator, Provider: Step 7: Two-Phase UPI Withdrawal
    Creator->>API: POST /api/withdrawals (amount: ₹1,000, upiId: "success@mock")
    rect rgb(255, 250, 240)
        Note over API, DB: Phase 1: Immediate Balance Hold
        API->>DB: Wallet balancePaise -= 100000, heldPaise += 100000
        API->>DB: Insert LedgerEntry (withdrawal_hold, debit)
        API->>DB: Insert Withdrawal (status: pending, isActive: true)
    end
    API-->>Creator: 200 OK (Held in transit)

    %% 8. Worker Processing
    Note over Worker, Provider: Step 8: Worker Polling & Settlement
    Worker->>DB: Claim pending withdrawal -> status: processing
    Worker->>Provider: Call mockPayoutProvider.payout() (outside DB session)
    Provider-->>Worker: HTTP 200 Success (providerRef: "mock_123")
    rect rgb(240, 255, 240)
        Note over Worker, DB: Phase 2: Finalize Success
        Worker->>DB: Wallet heldPaise -= 100000
        Worker->>DB: Withdrawal status -> succeeded, isActive -> false
        Worker->>DB: Enqueue payout success notification
    end
```
