# 23. Creator Dashboard Next Actions & Deadline Urgency Engine

This diagram illustrates how the creator dashboard computes urgent action items and renders color-coded urgency countdown chips.

---

```mermaid
flowchart TD
    CreatorClient[Creator Opens Dashboard: /creator/dashboard] --> FetchItems[Fetch Creator Applications & Submissions]
    
    FetchItems --> EvaluateItems{Evaluate Each Active Item}
    
    EvaluateItems --> CheckRevision{"Status == 'revision_requested'?"}
    CheckRevision -- Yes --> Priority1["Priority 1 (Urgent): Revision Feedback Note<br/>Chip: 'Revision Requested'<br/>Action: 'View Feedback & Resubmit'"]
    
    EvaluateItems --> CheckSubDue{"Status == 'approved' AND No Submission?"}
    CheckSubDue -- Yes --> CalcDeadline["Calculate Hours to submissionDeadline"]
    CalcDeadline --> DeadlineRange{Hours Remaining?}
    
    DeadlineRange -- Overdue --> Priority2A["Priority 2A: Overdue Deliverable<br/>Chip: Red 'Overdue'<br/>Action: 'Submit Deliverable Immediately'"]
    DeadlineRange -- Under 24h --> Priority2B["Priority 2B: Due Today<br/>Chip: Orange 'Due Today'<br/>Action: 'Submit Deliverable'"]
    DeadlineRange -- Over 24h --> Priority2C["Priority 2C: Upcoming<br/>Chip: Blue 'Due in X Days'<br/>Action: 'Submit Deliverable'"]
    
    EvaluateItems --> CheckWithdrawal{"Latest Withdrawal == 'failed'?"}
    CheckWithdrawal -- Yes --> Priority3["Priority 3: Failed Payout Alert<br/>Chip: Red 'Payout Failed'<br/>Action: One-Tap 'Try Again'"]
    
    Priority1 --> AssembleStrip[Assemble Next Actions Banner Component]
    Priority2A --> AssembleStrip
    Priority2B --> AssembleStrip
    Priority2C --> AssembleStrip
    Priority3 --> AssembleStrip
    
    AssembleStrip --> RenderUI[Render Top Alert Strip on Mobile & Desktop]

    style Priority1 fill:#fff3cd,stroke:#ffc107,stroke-width:2px;
    style Priority2A fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
    style RenderUI fill:#d4edda,stroke:#28a745,stroke-width:2px;
```
