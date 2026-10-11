# 19. Withdrawal Worker Polling & Crash Reconciliation Engine

This flowchart shows how the background worker polls jobs and automatically recovers transactions stuck in `processing` status due to a server crash or network failure.

---

```mermaid
flowchart TD
    Timer([Worker Interval: Every 3 Seconds]) --> CheckStuck{"Are Any Withdrawals Stuck?<br/>(status == 'processing' AND updated < now - 60s)"}
    
    CheckStuck -- Yes (Crashed Transactions Found) --> ReconcileLoop["Query Provider by idempotencyKey:<br/>mockPayoutProvider.checkStatus()"]
    ReconcileLoop --> ProviderStatus{Provider Outcome?}
    ProviderStatus -- Settled --> FinalizeSuccess[Finalize as Succeeded]
    ProviderStatus -- Failed --> FinalizeFail[Finalize as Failed & Refund]
    ProviderStatus -- Not Found --> FinalizeFail
    
    CheckStuck -- No --> PollPending["Claim Next Pending Job:<br/>findOneAndUpdate({ status: 'pending' }, { status: 'processing' })"]
    
    PollPending --> FoundJob{Job Found?}
    FoundJob -- No --> Sleep([Sleep Until Next Tick])
    FoundJob -- Yes --> CallGateway["Call mockPayoutProvider.payout()<br/>outside DB transaction"]
    
    CallGateway --> GatewayRes{Outcome?}
    GatewayRes -- Success --> FinalizeSuccess
    GatewayRes -- Failure --> FinalizeFail
    
    FinalizeSuccess --> NotifyCreator[Enqueue Notification: withdrawal.succeeded]
    FinalizeFail --> NotifyCreatorFail[Enqueue Notification: withdrawal.failed]

    style FinalizeSuccess fill:#d4edda,stroke:#28a745,stroke-width:2px;
    style FinalizeFail fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
```
