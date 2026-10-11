# 03. Atomic Slot & Budget Reservation (Concurrency Race Protection)

This flowchart illustrates how PayPost completely prevents slot over-allocation and budget over-subscription when multiple approvals occur in parallel at the exact same millisecond.

---

### The Problem: Read-Then-Write Vulnerability
In a naive implementation:
1. Thread A reads: `slots available = 1, budget available = ₹2,000`.
2. Thread B reads: `slots available = 1, budget available = ₹2,000`.
3. Thread A writes: Approves Creator 1 (`slots = 2/2`, budget used = ₹2,000).
4. Thread B writes: Approves Creator 2 (`slots = 3/2` 💥 **OVER-ALLOCATION!**, budget exceeded).

---

### The PayPost Solution: Single Atomic Conditional Update

```mermaid
flowchart TD
    Start([Concurrent Approval Requests Arrive Simultaneously]) --> Split{Parallel Threads}
    
    Split -->|Request 1: Approve Creator A| QueryA["Atomic Campaign.findOneAndUpdate()"]
    Split -->|Request 2: Approve Creator B| QueryB["Atomic Campaign.findOneAndUpdate()"]
    
    subgraph Atomic DB Engine [MongoDB Replica Set Document Write Lock]
        QueryA --> Lock[Acquires Document Write Lock]
        Lock --> EvalA{"Evaluate Atomic Query Filter:<br/>1. status == 'active'<br/>2. approvedCount < slots<br/>3. (budget - reserved - paidOut) >= fee"}
        
        EvalA -- Matches Criteria --> ExecA["Execute Atomic Update:<br/>$inc: { approvedCount: +1, reservedPaise: +fee }"]
        ExecA --> ReleaseA[Release Write Lock]
        
        ReleaseA --> LockB[Request B Acquires Write Lock]
        LockB --> EvalB{"Evaluate Atomic Query Filter:<br/>1. status == 'active'<br/>2. approvedCount < slots<br/>3. (budget - reserved - paidOut) >= fee"}
        
        EvalB -- Condition Failed! (Slots Full or Budget Depleted) --> RejectB["Returns null (No Document Modified)"]
        RejectB --> ReleaseB[Release Write Lock]
    end
    
    ExecA --> SuccessA["Application A Marked 'approved'<br/>lockedFeePaise Saved<br/>HTTP 200 OK"]
    RejectB --> ErrorB["Abort Mongoose Session<br/>Throw ApiError.conflict(409)<br/>'Campaign slots full or budget exhausted'"]

    style ExecA fill:#d4edda,stroke:#28a745,stroke-width:2px;
    style RejectB fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
    style SuccessA fill:#d4edda,stroke:#28a745,stroke-width:2px;
    style ErrorB fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
```

---

### Exact Mongoose Query Implementation
```javascript
const updatedCampaign = await Campaign.findOneAndUpdate(
  {
    _id: campaignId,
    status: CAMPAIGN_STATUS.ACTIVE,
    approvedCount: { $lt: campaign.slots },
    $expr: {
      $gte: [
        { $subtract: ["$budgetPaise", { $add: ["$reservedPaise", "$paidOutPaise"] }] },
        feePaise
      ]
    }
  },
  {
    $inc: { approvedCount: 1, reservedPaise: feePaise }
  },
  { new: true, session }
);

if (!updatedCampaign) {
  const err = new Error('Campaign has no available slots or insufficient budget');
  err.status = 409;
  throw err;
}
```
