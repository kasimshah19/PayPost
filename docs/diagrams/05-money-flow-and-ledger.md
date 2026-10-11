# 05. Money Flow, Tax Breakdown & Double-Entry Ledger

This diagram details the mathematical formulas, fund allocations, and double-entry ledger bookkeeping used throughout PayPost.

---

### The Statutory Indian Tax Deduction Formula

$$\text{Gross Fee} = \text{Platform Fee} + \text{GST} + \text{TDS} + \text{Net Payout}$$

1. **Platform Fee (10%)**: $\text{Round}(\text{Gross Fee} \times 0.10)$
2. **GST on Platform Fee (18%)**: $\text{Round}(\text{Platform Fee} \times 0.18)$ (deducted from creator)
3. **TDS (1%)**: $\text{Round}((\text{Gross Fee} - \text{Platform Fee} - \text{GST}) \times 0.01)$
4. **Net Creator Payout**: $\text{Gross Fee} - \text{Platform Fee} - \text{GST} - \text{TDS}$

*Invariant Check*: All parts are non-negative integers; their sum **strictly equals** the gross fee (zero fractional paise leakage).

---

```mermaid
flowchart TD
    subgraph Campaign Budget Lifecycle [Campaign Level Money Movement]
        TotalBudget[Total Campaign Budget: ₹10,000 / 1,000,000 paise]
        AvailBudget[Available Unreserved Budget: ₹6,000]
        ReservedBudget[Reserved Budget: ₹2,000 / 200,000 paise]
        PaidOutBudget[Paid Out Budget: ₹2,000 / 200,000 paise]

        TotalBudget -->|Creator 1 Approved| ReservedBudget
        TotalBudget --> AvailBudget
        ReservedBudget -->|Deliverable Approved| PaidOutBudget
    end

    subgraph Fee Calculation Engine [Statutory Deductions for ₹2,000 Gross]
        Gross[Gross Creator Fee: ₹2,000.00 / 200,000 paise]
        
        PlatFee["Platform Fee (10%): ₹200.00 (20,000 paise)"]
        GST["GST (18% of Fee): ₹36.00 (3,600 paise)"]
        TaxBase["Taxable Base: ₹1,764.00 (176,400 paise)"]
        TDS["TDS (1% of Base): ₹17.64 -> ₹18.00 (1,764 paise rounded to 1,764)"]
        NetPayout["Net Creator Payout: ₹1,746.36 (174,636 paise)"]

        Gross --> PlatFee
        PlatFee --> GST
        Gross --> TaxBase
        TaxBase --> TDS
        Gross --> NetPayout
    end

    PaidOutBudget ==> Gross

    subgraph Double-Entry Accounting [Immutable Ledger & Wallet Balance]
        Snapshot[(Submission Payout Snapshot)]
        Ledger[(Append-Only LedgerEntry Collection)]
        Wallet[(Creator Wallet Cache)]

        NetPayout ==>|Store Snapshot| Snapshot
        NetPayout ==>|direction: CREDIT, type: payout_credit| Ledger
        Ledger ==>|Atomic $inc: { balancePaise: +174636 }| Wallet
    end

    subgraph Withdrawal Phase [Funds Outflow]
        ReqWithdraw[Withdrawal Request: ₹1,000]
        HeldBal[Wallet.heldPaise: ₹1,000]
        AvailBal[Wallet.balancePaise: ₹746.36]
        Disbursed[Bank Account via UPI]

        Wallet --> ReqWithdraw
        ReqWithdraw -->|balancePaise -= 100000| AvailBal
        ReqWithdraw -->|heldPaise += 100000| HeldBal
        HeldBal -->|Worker Settles with Provider| Disbursed
    end

    style Gross fill:#e2e3e5,stroke:#383d41,stroke-width:2px;
    style NetPayout fill:#d4edda,stroke:#28a745,stroke-width:2px;
    style Ledger fill:#cfe2ff,stroke:#0d6efd,stroke-width:2px;
    style Wallet fill:#fff3cd,stroke:#ffc107,stroke-width:2px;
```

---

### Ledger Immutability Schema Hooks (`src/models/LedgerEntry.js`)
```javascript
ledgerEntrySchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne'], function() {
  throw new Error('Ledger entries are strictly immutable and cannot be updated.');
});

ledgerEntrySchema.pre(['deleteOne', 'deleteMany', 'findOneAndDelete'], function() {
  throw new Error('Ledger entries are strictly immutable and cannot be deleted.');
});
```
