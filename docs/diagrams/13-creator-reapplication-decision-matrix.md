# 13. Creator Application, Withdrawal & Re-Application Rules

This decision tree shows whether a creator is eligible to re-apply to a campaign depending on their previous application history.

---

```mermaid
flowchart TD
    CreatorReq[Creator Taps Apply: POST /api/applications] --> CheckPrior{Prior Application Record Exists?}
    
    CheckPrior -- No (First Time Applying) --> CheckDeadline{"Is applicationDeadline > now?"}
    CheckDeadline -- Yes --> CreateApp[Status: 'applied' -> HTTP 201 Created]
    CheckDeadline -- No --> ErrDeadline[HTTP 400: Applications are closed for this campaign]
    
    CheckPrior -- Yes (Prior Application Exists) --> PriorStatus{What Was the Prior Status?}
    
    PriorStatus -- applied --> AlreadyApplied[HTTP 400: You have already applied and your application is pending]
    
    PriorStatus -- withdrawn --> WithdrawnWhen{Withdrawn while 'applied' OR after 'approved'?}
    WithdrawnWhen -- While 'applied' --> AllowReapply[Eligible to Re-apply: Reset status to 'applied' -> HTTP 200 OK]
    WithdrawnWhen -- After 'approved' --> BlockReapply1[HTTP 400: Creators who withdrew after approval cannot re-apply]
    
    PriorStatus -- rejected --> BlockReapply2[HTTP 400: Re-application is not allowed after rejection]
    PriorStatus -- cancelled --> BlockReapply3[HTTP 400: Re-application is not allowed on cancelled applications]

    style CreateApp fill:#d4edda,stroke:#28a745,stroke-width:2px;
    style AllowReapply fill:#d4edda,stroke:#28a745,stroke-width:2px;
    style BlockReapply1 fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
    style BlockReapply2 fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
```

---

### What Is Happening in This Diagram:
- Prevents **"slot grabbing"**: A creator who applied and withdrew before the brand reviewed it can change their mind and re-apply. However, a creator who was approved (which locked a slot and budget) and then withdrew cannot re-apply, preventing creators from repeatedly holding up campaign slots.
