# 18. Withdrawal Two-Phase Hold-and-Settle State Transitions

This state transition chart explains how creator funds move between available balance, held balance, and final settlement during a UPI withdrawal.

---

```mermaid
stateDiagram-v2
    [*] --> Available: Creator has balance in Wallet (e.g. ₹1,746)
    
    Available --> Held: Creator Requests Withdrawal of ₹1,000\n[balancePaise -= 100000, heldPaise += 100000]\n[LedgerEntry: withdrawal_hold (debit)]\n[Withdrawal: status = pending, isActive = true]
    
    state In_Transit {
        Held --> Processing: Worker Claims Job\n[status = processing]
        Processing --> Gateway_Call: Calls mockPayoutProvider.payout()\n[Outside DB transaction]
    }

    Gateway_Call --> Succeeded: Gateway Returns Success (e.g. success@mock)\n[heldPaise -= 100000]\n[status = succeeded, isActive = false]
    
    Gateway_Call --> Failed: Gateway Returns Error (e.g. fail@mock)\n[heldPaise -= 100000, balancePaise += 100000]\n[LedgerEntry: withdrawal_reversal (credit)]\n[status = failed, isActive = false]

    Succeeded --> [*]
    Failed --> Available: Money Returned to Available Balance
```

---

### What Is Happening in This Diagram:
- At no point during the payout process can a creator double-spend funds. Money moves to `heldPaise` immediately upon request. If the bank fails, the funds are automatically reversed back to `balancePaise`.
