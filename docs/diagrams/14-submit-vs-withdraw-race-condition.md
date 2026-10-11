# 14. Mutual Exclusion Race: Deliverable Submission vs Application Withdrawal

This diagram demonstrates how PayPost prevents a race condition where a creator attempts to submit a deliverable and withdraw their application at the exact same millisecond.

---

```mermaid
sequenceDiagram
    autonumber
    actor Creator
    participant ThreadA as Thread A: submitDeliverable()
    participant ThreadB as Thread B: withdrawApplication()
    participant DB as MongoDB Application Document

    Note over Creator, DB: Concurrent Race Condition Scenario
    Creator->>ThreadA: POST /api/submissions (Deliverable)
    Creator->>ThreadB: POST /api/applications/:id/withdraw (Withdrawal)

    Note over ThreadA, DB: Both operations acquire database locks on Application
    ThreadA->>DB: findOneAndUpdate({ _id: appId, status: 'approved' }, { status: 'approved' })
    DB-->>ThreadA: Matches status 'approved'!

    ThreadB->>DB: findOneAndUpdate({ _id: appId, status: 'approved' }, { status: 'withdrawn' })
    
    rect rgb(240, 255, 240)
        Note over ThreadA, DB: Thread A wins and inserts Submission document
        ThreadA->>DB: Insert Submission (status: 'submitted', version: 1)
        ThreadA-->>Creator: HTTP 201 Created (Submission Successful)
    end

    rect rgb(255, 240, 240)
        Note over ThreadB, DB: Thread B evaluates after Thread A creates submission
        ThreadB->>DB: Check if Submission document exists for Application
        DB-->>ThreadB: Submission exists!
        ThreadB-->>Creator: HTTP 409 Conflict: Cannot withdraw application after deliverable is submitted!
    end
```

---

### What Is Happening in This Diagram:
- If a creator could withdraw while submitting, they could trigger budget releases while still expecting a payout. Mutual exclusion ensures that once a deliverable exists, the application is locked into the review pipeline and cannot be withdrawn.
