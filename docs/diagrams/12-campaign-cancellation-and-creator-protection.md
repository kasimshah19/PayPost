# 12. Campaign Cancellation Guardrails & Creator Protection

This diagram illustrates the checks enforced when a brand attempts to cancel a campaign, protecting creators who have active deliverables awaiting review.

---

```mermaid
flowchart TD
    CancelReq[Brand Calls POST /api/campaigns/:id/cancel] --> CheckOwner{Is Brand the Owner?}
    CheckOwner -- No --> Return404[HTTP 404 Not Found]
    
    CheckOwner -- Yes --> CheckPendingWork{"Are Any Submissions Pending Review?<br/>1. status == 'submitted'<br/>2. status == 'revision_requested' AND revisionDueAt > now"}
    
    CheckPendingWork -- Yes (Work in Progress) --> BlockCancel["HTTP 409 Conflict: Cannot cancel campaign while<br/>creators have deliverables awaiting review!"]
    
    CheckPendingWork -- No (No Work in Review) --> StartTx[Start Mongoose Transaction Session]
    StartTx --> MarkCampCancelled["Set Campaign status = 'cancelled'"]
    MarkCampCancelled --> FreeReserved["Release Unspent reservedPaise: set reservedPaise = 0"]
    FreeReserved --> UpdateApps["Cancel Applied & Approved Applications:<br/>status -> 'cancelled'"]
    UpdateApps --> KeepPaidOut["Preserve paidOutPaise:<br/>Completed work remains paid!"]
    KeepPaidOut --> NotifyCreators["Enqueue Outbox Notification to Affected Creators"]
    NotifyCreators --> CommitTx[session.commitTransaction()]
    CommitTx --> Return200[HTTP 200 OK: Campaign Cancelled Cleanly]

    style BlockCancel fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
    style FreeReserved fill:#d4edda,stroke:#28a745,stroke-width:2px;
    style KeepPaidOut fill:#cfe2ff,stroke:#0d6efd,stroke-width:2px;
```

---

### What Is Happening in This Diagram:
- A malicious brand cannot cancel a campaign to avoid reviewing finished work and paying creators. If any submission is currently `submitted` or inside an active revision window, cancellation is blocked with HTTP 409 until the brand approves or rejects the deliverable.
