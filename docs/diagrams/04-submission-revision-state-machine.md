# 04. Deliverable Review & 2-Revision State Machine

This state chart outlines the allowed lifecycle states, transitions, guard conditions, and financial consequences of deliverable reviews in PayPost.

---

```mermaid
stateDiagram-v2
    [*] --> Applied: Creator Applies (Pitch)
    
    Applied --> Withdrawn: Creator Withdraws (Before Approval)
    Applied --> Rejected_App: Brand Rejects Applicant
    Applied --> Approved: Brand Approves Applicant\n[Atomic Budget & Slot Reservation]

    Approved --> Withdrawn_Post: Creator Withdraws (Before Deliverable)\n[Slot & Reserved Budget Released]
    
    Approved --> Submitted: Creator Submits Deliverable\n[Valid Instagram URL, Version: 1]

    state Deliverable_Review {
        Submitted --> Revision_1: Brand Requests Revision 1\n[Feedback Note Mandatory]\n[Deadline = max(subDeadline, now + 48h)]
        Revision_1 --> Submitted_v2: Creator Resubmits Link\n[Version: 2, revisionCount: 1]
        
        Submitted_v2 --> Revision_2: Brand Requests Revision 2\n[Feedback Note Mandatory]\n[Deadline = max(subDeadline, now + 48h)]
        Revision_2 --> Submitted_v3: Creator Resubmits Link\n[Version: 3, revisionCount: 2]
        
        Submitted_v3 --> Revision_Blocked: Brand Attempts Revision 3\n[BLOCKED: 400 Bad Request]
        Revision_Blocked --> Submitted_v3: State Remains Submitted v3
    }

    Submitted --> Approved_Final: Brand Approves Deliverable
    Submitted_v2 --> Approved_Final: Brand Approves Deliverable
    Submitted_v3 --> Approved_Final: Brand Approves Deliverable

    Submitted --> Rejected_Final: Brand Rejects Deliverable\n[Final Decision: Slot & Reserved Budget Released]
    Submitted_v2 --> Rejected_Final: Brand Rejects Deliverable
    Submitted_v3 --> Rejected_Final: Brand Rejects Deliverable

    state Settlement {
        Approved_Final --> Wallet_Credit: Calculate Tax Breakdown\n(Platform Fee 10%, GST 18%, TDS 1%, Net)\nCredit Net to Creator Wallet\nAppend Immutable LedgerEntry
    }

    Wallet_Credit --> [*]
    Rejected_Final --> [*]
    Withdrawn --> [*]
    Withdrawn_Post --> [*]
    Rejected_App --> [*]
```

---

### Transition Rules & Financial Consequences Matrix

| Transition | Actor | Pre-Conditions | Financial & Slot Consequence |
|---|---|---|---|
| **Apply** | Creator | Campaign active, before deadline | None |
| **Withdraw (Applied)** | Creator | Status is `applied` | None. Eligible to re-apply before deadline. |
| **Approve Application** | Brand | Available slots & remaining budget | `reservedPaise += fee`, `approvedCount += 1`. |
| **Withdraw (Approved)** | Creator | Status is `approved`, no deliverable | `reservedPaise -= fee`, `approvedCount -= 1`. Cannot re-apply. |
| **Submit Deliverable** | Creator | Status is `approved`, valid Instagram link | Application locked; withdrawal blocked. |
| **Request Revision** | Brand | `revisionCount < 2`, mandatory feedback | Resubmit deadline extended to `max(deadline, now + 48h)`. |
| **Resubmit** | Creator | Status is `revision_requested`, before `revisionDueAt` | `version += 1`, resets to `submitted`. |
| **Reject Deliverable** | Brand | Deliverable in review | Final rejection. `reservedPaise -= fee`, `approvedCount -= 1`. Slot recycled. |
| **Approve Deliverable** | Brand | Deliverable in review | `reservedPaise -= fee`, `paidOutPaise += fee`. Net credited to creator wallet. |
