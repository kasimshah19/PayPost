# 11. Post-Approval Campaign Modification & Constraint Pipeline

This diagram shows the safety guards that prevent brands from editing campaigns in ways that would disenfranchise already-approved creators or invalidate financial reservations.

---

```mermaid
flowchart TD
    EditReq[Brand Submits Campaign Update: PUT /api/campaigns/:id] --> CheckBrand{Is Brand the Owner?}
    CheckBrand -- No --> Err404[HTTP 404 Not Found: Tenant Privacy Defense]
    CheckBrand -- Yes --> HasApproved{"Has Campaign Approved Creators?<br/>(approvedCount > 0)"}
    
    HasApproved -- No (0 Creators Approved) --> AllowAll[Allow All Edits: Freely adjust budget, slots, fee, deadlines]
    
    HasApproved -- Yes (Creators Already Approved) --> CheckBudget{"Proposed budget >=<br/>(reservedPaise + paidOutPaise)?"}
    CheckBudget -- No --> ErrBudget[HTTP 409 Conflict: Cannot reduce budget below locked commitments]
    
    CheckBudget -- Yes --> CheckSlots{"Proposed slots >= approvedCount?"}
    CheckSlots -- No --> ErrSlots[HTTP 409 Conflict: Cannot reduce slots below current approved creators]
    
    CheckSlots -- Yes --> CheckDeadlines{"Proposed deadlines >= existing deadlines?"}
    CheckDeadlines -- No --> ErrDeadlines[HTTP 409 Conflict: Deadlines can only be extended, never shortened]
    
    CheckDeadlines -- Yes --> CheckFeeChange{"Was perCreatorFeePaise Changed?"}
    CheckFeeChange -- Yes --> FeeNote["Fee update applies ONLY to future applicants.<br/>Existing approved creators retain lockedFeePaise."]
    CheckFeeChange -- No --> ApplyUpdate
    
    FeeNote --> ApplyUpdate[Execute Campaign Update in Database]
    AllowAll --> ApplyUpdate
    ApplyUpdate --> ReturnSuccess[HTTP 200 OK: Updated Campaign Returned]

    style ErrBudget fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
    style ErrSlots fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
    style ErrDeadlines fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
    style ApplyUpdate fill:#d4edda,stroke:#28a745,stroke-width:2px;
```

---

### What Is Happening in This Diagram:
- Once creators are approved, a campaign is bound by commitments. If 2 creators are approved for ₹2,000 each (₹4,000 reserved), the brand cannot drop the budget to ₹3,000 or reduce slots to 1. Deadlines can only move forward into the future to give creators more time, never backwards.
