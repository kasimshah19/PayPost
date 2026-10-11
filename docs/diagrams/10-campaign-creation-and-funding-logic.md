# 10. Campaign Creation, Funding Verification & Slot Math

This diagram illustrates how PayPost processes campaign creation, calculates funded slot capacities, detects underfunded campaigns without halting creation, and enforces deadline hierarchy constraints.

---

```mermaid
flowchart TD
    CreateReq[Brand Submits Campaign Form] --> ValDates{Validate Deadlines:<br/>1. appDeadline > now<br/>2. subDeadline > appDeadline}
    ValDates -- Invalid --> ErrDates[HTTP 400: Dates are invalid or out of order]
    
    ValDates -- Valid --> ValBudget{Validate Budget Floors:<br/>1. slots >= 1<br/>2. feePaise >= 10,000<br/>3. budgetPaise >= feePaise}
    ValBudget -- Invalid --> ErrBudget[HTTP 400: Budget must cover at least 1 creator]
    
    ValBudget -- Valid --> CalcSlots["Calculate Funded Slots Math:<br/>fundedSlots = floor(budgetPaise / perCreatorFeePaise)"]
    CalcSlots --> FundingCheck{"Is budget < slots * fee?"}
    
    FundingCheck -- Yes --> SetWarning["Set Flag: isUnderfunded = true<br/>UI Warning: 'Budget only covers N of M creators'"]
    FundingCheck -- No --> FullyFunded["Set Flag: isUnderfunded = false<br/>Campaign Fully Funded"]
    
    SetWarning --> InsertCamp["Insert Campaign Document:<br/>reservedPaise = 0<br/>paidOutPaise = 0<br/>approvedCount = 0<br/>status = 'active'"]
    FullyFunded --> InsertCamp
    
    InsertCamp --> ReturnCamp[HTTP 201 Created: Return Campaign with isUnderfunded Metadata]

    style SetWarning fill:#fff3cd,stroke:#ffc107,stroke-width:2px;
    style FullyFunded fill:#d4edda,stroke:#28a745,stroke-width:2px;
    style InsertCamp fill:#cfe2ff,stroke:#0d6efd,stroke-width:2px;
```

---

### What Is Happening in This Diagram:
- **Product Empathy vs. Financial Safety**: A brand might want to list 5 slots to gauge creator interest but only fund ₹4,000 upfront (enough for 2 creators at ₹2,000 each). PayPost **does not block creation**. It allows the campaign to publish, gives an informative warning in the UI, and relies on Phase 4's atomic approval guard to halt approvals once the budget runs dry.
