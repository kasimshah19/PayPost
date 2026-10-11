# 25. Seeded Concurrency Chaos Test Engine Architecture

This diagram illustrates how the `tests/chaos.test.js` concurrency test uses a deterministic `mulberry32` pseudo-random generator to stress-test real services in parallel.

---

```mermaid
flowchart TD
    StartChaos[Start Chaos Concurrency Test] --> ReadSeed["Read Seed: process.env.CHAOS_SEED || 424242"]
    ReadSeed --> InitPRNG["Initialize mulberry32(seed) Generator:<br/>Zero-dependency deterministic random numbers"]
    
    InitPRNG --> SetupData["Setup Campaign: 3 slots, budget for 2 creators (₹4,000)<br/>Setup 8 Creator Accounts & Wallets"]
    
    SetupData --> RoundLoop[Execute 5 Consecutive Stress Rounds]
    
    subgraph Round Execution [Inside Each Round: 10 to 14 Concurrent Actions]
        RoundLoop --> PickActions["Select 10-14 Random Action Promises:<br/>- applyToCampaign<br/>- withdrawApplication<br/>- approveApplication<br/>- submitDeliverable<br/>- approve / revise / reject submission<br/>- requestWithdrawal<br/>- processWithdrawalsOnce<br/>- processNotificationsOnce"]
        
        PickActions --> FireParallel["Fire Simultaneously via Promise.allSettled()"]
        FireParallel --> AwaitResults[Await All Settled Results]
        
        AwaitResults --> AssertErrors{"Assert Rejection Error Codes:<br/>Are all errors expected business codes?<br/>(400 Bad Request, 404 Not Found, 409 Conflict)"}
        AssertErrors -- Any 500 Crash --> FailTest[FAIL: Unexpected Server Crash!]
        
        AssertErrors -- All Business Errors --> RunIntegrity["Run checkIntegrity():<br/>Evaluate 8 System Invariant Checks"]
        RunIntegrity --> IntegrityOk{"integrity.ok == true<br/>AND errors.length == 0?"}
        IntegrityOk -- Violations Found --> FailInvariant[FAIL: Invariant Corrupted!]
        
        IntegrityOk -- Clean --> DirectCheck["Check Invariant I2:<br/>reserved + paidOut <= budget<br/>AND 0 <= approvedCount <= slots"]
    end
    
    DirectCheck --> NextRound{Round < 5?}
    NextRound -- Yes --> RoundLoop
    NextRound -- No --> PassTest[PASS: All 5 Rounds Survived with Zero Invariant Drift]

    style PassTest fill:#d4edda,stroke:#28a745,stroke-width:2px;
    style FailTest fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
    style FailInvariant fill:#f8d7da,stroke:#dc3545,stroke-width:2px;
```
