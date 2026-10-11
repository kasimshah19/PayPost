# 06. Two-Phase Hold-and-Settle UPI Withdrawal & Reconciliation

This diagram shows how PayPost handles creator payouts using an asynchronous two-phase hold-and-settle pattern to ensure external gateway delays never hold open database locks, and crashes are self-healing.

---

```mermaid
sequenceDiagram
    autonumber
    actor Creator
    participant API as Express API
    participant DB as MongoDB Transaction
    participant Worker as Background Worker (Every 3s)
    participant Gateway as Mock UPI Gateway (Bank)

    %% Phase 1: Request & Balance Hold
    Note over Creator, DB: Phase 1: Request & Immediate Hold (DB Transaction)
    Creator->>API: POST /api/withdrawals { amount: ₹1,000, upiId: "success@mock" }
    API->>DB: Check balancePaise >= 100000 & amount >= ₹100
    API->>DB: Check no existing active withdrawal (isActive == true)
    rect rgb(255, 250, 240)
        API->>DB: Atomically shift: balancePaise -= 100000, heldPaise += 100000
        API->>DB: Insert LedgerEntry (type: withdrawal_hold, direction: DEBIT)
        API->>DB: Insert Withdrawal (status: pending, isActive: true)
    end
    API-->>Creator: HTTP 200 OK { status: "pending", heldPaise: 100000 }

    %% Worker Execution
    Note over Worker, Gateway: Background Worker Polling Loop
    Worker->>DB: findOneAndUpdate({ status: "pending" }, { status: "processing" })
    DB-->>Worker: Claimed Job (status: processing)
    
    Note over Worker, Gateway: Provider called OUTSIDE any DB transaction
    Worker->>Gateway: POST /disburse { amount, upiId, idempotencyKey }
    
    alt Payout Succeeded (e.g. success@mock)
        Gateway-->>Worker: HTTP 200 { status: "SUCCESS", providerRef: "mock_tx_99" }
        rect rgb(240, 255, 240)
            Note over Worker, DB: Phase 2A: Settle Success (DB Transaction)
            Worker->>DB: Withdrawal status -> succeeded, isActive -> false
            Worker->>DB: Wallet heldPaise -= 100000
            Worker->>DB: Enqueue payout success notification
        end
    else Payout Failed (e.g. fail@mock / Bank Outage)
        Gateway-->>Worker: HTTP 400 { status: "FAILED", reason: "Bank server timeout" }
        rect rgb(255, 240, 240)
            Note over Worker, DB: Phase 2B: Settle Failure & Automatic Refund
            Worker->>DB: Withdrawal status -> failed, isActive -> false
            Worker->>DB: Refund Wallet: heldPaise -= 100000, balancePaise += 100000
            Worker->>DB: Insert LedgerEntry (type: withdrawal_reversal, direction: CREDIT)
            Worker->>DB: Enqueue payout failed alert
        end
    else Server Crashed While Processing
        Note over Worker, DB: Recovery Mechanism: Reconciliation (Every 60s)
        Worker->>DB: Query withdrawals where status == "processing" & updated < now - 60s
        Worker->>Gateway: Query payout status by idempotencyKey
        Gateway-->>Worker: Returns settled status
        Worker->>DB: Finalizes withdrawal safely
    end
```
