# 21. Notification Dispatch Worker & Dynamic Channel Opt-Out

This diagram shows how the notification worker dispatches jobs from the outbox and respects user channel opt-outs at the moment of send.

---

```mermaid
flowchart TD
    PollWorker([Notification Worker Tick: Every 5s]) --> ClaimJob["Atomically Claim Job:<br/>status == 'pending' AND scheduledFor <= now<br/>status -> 'processing'"]
    
    ClaimJob --> FoundJob{Job Claimed?}
    FoundJob -- No --> Sleep([Sleep Until Next Tick])
    FoundJob -- Yes --> RecheckQuiet{"Re-Verify Quiet Hours at Dispatch Time:<br/>isQuietHours(now)?"}
    
    RecheckQuiet -- Yes (Entered Quiet Hours) --> Reschedule["Reschedule for next 09:00:00 IST<br/>status -> 'pending'"]
    
    RecheckQuiet -- No (Daylight Active) --> FetchPrefs[Fetch Recipient User Preferences]
    FetchPrefs --> CheckOptOut{"Has User Opted Out of Channel?<br/>(e.g. user.notificationPreferences[channel] == false)"}
    
    CheckOptOut -- Opted Out --> MarkSkipped["Mark Job: status = 'skipped'<br/>Drop message cleanly without sending"]
    
    CheckOptOut -- Subscribed --> DispatchGateway[Call mockEmailProvider or mockWhatsappProvider]
    DispatchGateway --> DispatchSuccess{Success?}
    DispatchSuccess -- Yes --> MarkSent["Mark Job: status = 'sent'"]
    DispatchSuccess -- No --> RetryCheck{"attempts < 3?"}
    RetryCheck -- Yes --> RetryDelay["Increment attempts, schedule retry with backoff<br/>status -> 'pending'"]
    RetryCheck -- No --> MarkFailed["Mark Job: status = 'failed'"]

    style MarkSent fill:#d4edda,stroke:#28a745,stroke-width:2px;
    style MarkSkipped fill:#e2e3e5,stroke:#6c757d,stroke-width:2px;
    style MarkFailed fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
```
