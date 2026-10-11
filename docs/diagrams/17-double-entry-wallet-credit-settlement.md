# 17. Deliverable Approval & Double-Entry Settlement Pipeline

This diagram shows the atomic multi-document database transaction executed when a brand clicks "Approve Submission".

---

```mermaid
sequenceDiagram
    autonumber
    actor Brand
    participant Service as Payout & Submission Service
    participant Session as Mongoose ClientSession (ACID)
    participant Camp as Campaign Collection
    participant Sub as Submission Collection
    participant Wallet as Wallet Collection
    participant Ledger as LedgerEntry Collection
    participant Outbox as NotificationJob Collection

    Brand->>Service: POST /api/submissions/:id/approve
    Service->>Session: Start Multi-Document Transaction
    
    rect rgb(240, 248, 255)
        Service->>Sub: Update status -> 'approved'
        Service->>Sub: Save embedded payoutBreakdown snapshot
        
        Service->>Camp: Atomically shift: reservedPaise -= grossFee, paidOutPaise += grossFee
        
        Service->>Wallet: Atomically increment: balancePaise += netPayoutPaise
        
        Service->>Ledger: Insert LedgerEntry {<br/>  type: 'payout_credit',<br/>  direction: 'credit',<br/>  amountPaise: netPayoutPaise,<br/>  idempotencyKey: 'payout:' + submissionId<br/>}
        
        Service->>Outbox: Insert NotificationJob (payout.credited)
        
        Service->>Session: session.commitTransaction()
    end
    
    Service-->>Brand: HTTP 200 OK (Settlement Finalized)
```

---

### What Is Happening in This Diagram:
- All 5 operations (marking submission approved, shifting campaign funds, crediting wallet, writing the ledger entry, and enqueuing the outbox alert) occur inside a single atomic ACID transaction. If the server crashes or power fails halfway through, all 5 writes abort cleanly.
