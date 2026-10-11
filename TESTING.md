# PayPost — Comprehensive Quality Assurance & Testing Engineering Reference

This document provides an exhaustive, authoritative technical guide to the quality assurance, automated test architecture, concurrency verification, and database integrity audits implemented across **PayPost**. 

As a financial infrastructure application handling real monetary transactions and escrow balances, testing is designed to guarantee zero floating-point leakage, absolute concurrency safety, and full compliance with double-entry accounting invariants.

---

## 1. Testing Philosophy: Financial Systems vs. Standard CRUD Applications

Standard web applications typically verify basic CRUD routes and HTTP 200 responses. Financial platforms demand a fundamentally higher tier of verification: **strict idempotency, lock-free concurrency safety, mathematical conservation of value, and audit-trail immutability**.

### Quality Assurance Paradigm Comparison Matrix

| Dimension | Standard Web Application Testing | PayPost Financial Testing Architecture | Technical Implementation in PayPost |
| :--- | :--- | :--- | :--- |
| **Monetary Precision** | Floating-point numbers (`Number`) with basic checks | **Strict Integer Arithmetic:** Zero floating-point math; 100% evaluated in paise | Fuzz tested across 2,000 random inputs; mathematical conservation asserted |
| **Race Conditions** | Ignored or assumed low-risk | **Active Concurrency Testing:** Simulates concurrent burst requests and dual-clicks | Concurrent `Promise.all()` tests verify single-winner atomic updates |
| **Escrow Integrity** | Basic form validation checks | **Runtime Invariant Locks:** Atomic database-level conditional mutations | Asserts $\text{reserved} + \text{paidOut} \le \text{budget}$ under rapid approval bursts |
| **Data Mutability** | Tests verify `UPDATE` and `DELETE` queries | **Append-Only Immutability:** Tests verify that ledger rows can *never* be altered | Unit tests confirm Mongoose pre-hooks block `updateOne`, `deleteOne`, etc. |
| **Transaction Failure** | Unhandled or standard catch block | **ACID Rollback Verification:** Deliberate mid-flight crashes tested | Pre-inserted duplicate key triggers full MongoDB transaction rollback |
| **Audit Verification** | None; trusted at runtime | **Continuous Reconciliation:** Live database integrity audit script | `npm run wallet:check` reconciles 100% of wallets against ledger sums |

---

## 2. Testing Frameworks & Infrastructure Topology

```
┌────────────────────────────────────────────────────────────────────────┐
│                        PAYPOST TEST HARNESS TOPOLOGY                   │
└────────────────────────────────────────────────────────────────────────┘

    [Jest Test Runner] ────────── executes ──────────► 9 Test Suites
            │                                                │
            ▼                                                ▼
     [Supertest] (HTTP)                             [Unit Math Assertions]
            │                                                │
            ▼                                                ▼
    [Express API App]                              [feeCalculator pure math]
            │
            ▼
 [MongoMemoryReplSet] ◄─── In-Memory Ephemeral MongoDB Replica Set
      (3 Replica Nodes)     - Supports full multi-document ACID transactions
                            - Isolated per test suite (zero state pollution)
                            - Never touches real MongoDB Atlas database
```

### Infrastructure & Tooling Evaluation Matrix

| Tool / Technology | Specific Version & Role | Architecture Rationale | Alternative Considered & Why Rejected |
| :--- | :--- | :--- | :--- |
| **Jest** | Test Runner & Assertion Framework | Fast execution, built-in assertion matching, snapshot testing, and native code coverage reports | Mocha / Chai: Requires manual assembly of multiple libraries and extra runners |
| **Supertest** | HTTP Integration Testing Library | Binds directly to the Express `app` instance without binding to network ports; fast and deterministic | Axios against live local server: Slow, port collision risks, difficult teardown |
| **`mongodb-memory-server`** | In-Memory MongoDB Binary Provider | Spawns a dedicated in-memory MongoDB process per test run; 100% compatible with real BSON | Mock Mongoose / Sinclair: Fails to validate real MongoDB query operators (`$expr`, `$inc`) |
| **`MongoMemoryReplSet`** | Replica Set Configuration | **Mandatory:** Multi-document transactions (`session.withTransaction()`) require a replica set | Standalone MongoDB: MongoDB strictly disallows transactions on standalone nodes |
| **Custom Audit Engine (`walletCheck.js`)** | Standalone Production Reconciler | Connects directly to the live cloud MongoDB Atlas database to assert real-world ledger parity | Third-party reporting tools: Custom script directly accesses raw BSON documents |

---

## 3. Master Test Suites Directory (128 / 128 Passing)

The repository contains **9 dedicated automated test suites** encompassing 128 automated unit, integration, and stress tests.

### Comprehensive Test Suites Specification Matrix

| # | Test Suite File | Phase Alignment | Test Count | Primary Invariant Protected | Key Failure Modes & Edge Cases Covered |
| :-: | :--- | :---: | :-: | :--- | :--- |
| **1** | `backend/tests/auth.test.js` | Phase 2 | **14** | Role Immutability & JWT Validity | Duplicate email signup, missing required fields, password hashing with bcrypt, token expiration, role tampering attempts |
| **2** | `backend/tests/campaign.test.js` | Phase 3 | **18** | Multi-Tenant Privacy & Mutation Bounds | Soft budget warning when `budget < slots * fee`, `404 Not Found` for rival brand campaigns, post-approval budget reduction blocks |
| **3** | `backend/tests/application.test.js` | Phase 4 | **20** | Atomic Slot Booking & Escrow Solvency | Concurrent double approval requests, budget exhaustion blocks, 1-click apply, re-application blocking post-approval withdrawal |
| **4** | `backend/tests/submission.test.js` | Phase 5 | **22** | Deliverable Quality & Link Anti-Fraud | Invalid Instagram regex, duplicate post URL within same campaign, 48h dynamic revision deadline ($\max(\text{deadline}, \text{now}+48\text{h})$) |
| **5** | `backend/tests/fees.test.js` | Phase 6 | **12** | Statutory Tax Formula Vectors | Exact vector verification (₹1,000 $\rightarrow$ ₹873.18, ₹499.50 $\rightarrow$ ₹436.15), float/string rejection, negative fee handling |
| **6** | `backend/tests/feeMath.test.js` | Phase 6 | **6** | Conservation of Value across Fuzzing | **Fuzz test across 2,000 random amounts** (₹0.01 to ₹100,000.00); $\text{Platform} + \text{GST} + \text{TDS} + \text{Net} \equiv \text{Gross}$ |
| **7** | `backend/tests/payout.test.js` | Phase 6 | **16** | Idempotency & Transaction Atomicity | Concurrent double approval clicks, duplicate idempotency keys, ACID rollback on mid-flight failure, campaign escrow balance shifts |
| **8** | `backend/tests/wallet.test.js` | Phase 6 | **12** | Access Control & Running Balances | Running balance calculation across 3 consecutive payouts, `403 Forbidden` for Brands, paginated ledger lookups, creator isolation |
| **9** | `backend/tests/integrity.test.js` | Phase 6 | **8** | End-to-End Financial Reconciliation | Multi-creator flow simulation; programmatic validation that ledger sum matches wallet balance exactly |

---

## 4. Concurrency & Race Condition Verification

Financial market systems are highly susceptible to concurrency bugs such as double-spending and overbooking. PayPost includes explicit automated race-condition tests simulating high-frequency concurrent operations.

### Concurrency Stress Test Scenarios

| Concurrency Scenario | Threat / Failure Vector | Test Simulation Technique | Atomic Defense Mechanism | Verified Outcome |
| :--- | :--- | :--- | :--- | :--- |
| **Dual-Click Payout Approval** | Brand clicks "Approve" twice rapidly; creator could receive double payment | `Promise.all([approveReq(1), approveReq(2)])` executed concurrently | Compound unique index on `idempotencyKey: "payout:<submissionId>"` inside transaction | **1 succeeds (200 OK), 1 aborts (400/409)**; creator wallet credited exactly once |
| **Concurrent Creator Approvals** | Two brand admins approve different creators when only 1 slot remains | Multiple approval requests fired simultaneously via concurrent threads | Single-query atomic update with filter condition `approvedCount: { $lt: slots }` | **Only 1 creator approved**; second request rejected with "Slots filled" |
| **Simultaneous Submit & Withdraw** | Creator submits deliverable in Tab A while withdrawing in Tab B | Concurrent PATCH requests to transition state from `approved` | Atomic conditional update on `{ _id, status: 'approved' }` | **Only 1 state transition succeeds**; zero orphan submissions created |
| **Mid-Flight Database Crash / Rollback** | Database connection drops or ledger insert crashes during settlement | Test pre-inserts a colliding ledger row to force a duplicate key failure | Multi-document transaction session `session.abortTransaction()` | **Full ACID Rollback:** Campaign reserved funds, submission status, and wallet balance remain 100% untouched |

---

## 5. Mathematical Precision & Property-Based Fuzz Testing

In calculating statutory deductions (Platform fee: 10%, GST: 18% on platform fee, TDS: 1% on creator payout), fractional paise will inevitably occur. Standard division can lead to rounding drift.

### Statutory Formula & Rounding Specification

$$\text{platformFeePaise} = \lfloor \frac{\text{grossFeePaise} \times 10 + 50}{100} \rfloor$$
$$\text{gstPaise} = \lfloor \frac{\text{platformFeePaise} \times 18 + 50}{100} \rfloor$$
$$\text{payoutBeforeTdsPaise} = \text{grossFeePaise} - \text{platformFeePaise} - \text{gstPaise}$$
$$\text{tdsPaise} = \lfloor \frac{\text{payoutBeforeTdsPaise} \times 1 + 50}{100} \rfloor$$
$$\text{netPayoutPaise} = \text{payoutBeforeTdsPaise} - \text{tdsPaise}$$

### Formula Test Vectors & Invariant Assertions

| Gross Fee Input | Platform Fee (10%) | GST (18% of Platform) | Payout pre-TDS | TDS (1% of Payout) | Creator Net Take-Home | Conservation Check ($\Sigma \equiv \text{Gross}$) |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **₹1,000.00** (`100000`) | ₹100.00 (`10000`) | ₹18.00 (`1800`) | ₹882.00 (`88200`) | ₹8.82 (`882`) | **₹873.18** (`87318`) | $100 + 18 + 8.82 + 873.18 \equiv 1000.00$ |
| **₹499.50** (`49950`) | ₹49.95 (`4995`) | ₹8.99 (`899`) | ₹440.56 (`44056`) | ₹4.41 (`441`) | **₹436.15** (`43615`) | $49.95 + 8.99 + 4.41 + 436.15 \equiv 499.50$ |
| **₹100.00** (`10000`) | ₹10.00 (`1000`) | ₹1.80 (`180`) | ₹88.20 (`8820`) | ₹0.88 (`88`) | **₹87.32** (`8732`) | $10.00 + 1.80 + 0.88 + 87.32 \equiv 100.00$ |
| **₹1.00** (`100`) | ₹0.10 (`10`) | ₹0.02 (`2`) | ₹0.88 (`88`) | ₹0.01 (`1`) | **₹0.87** (`87`) | $0.10 + 0.02 + 0.01 + 0.87 \equiv 1.00$ |

### Fuzz Testing Mechanics (`feeMath.test.js`)
- **Sample Size:** 2,000 pseudo-random values generated uniformly between 1 paisa (₹0.01) and 10,000,000 paise (₹100,000.00).
- **Assertions:**
  1. `typeof val === 'number' && Number.isInteger(val)` for every single output field.
  2. `platformFeePaise + gstPaise + tdsPaise + netPayoutPaise === grossFeePaise` without exception.
  3. Every sub-component is non-negative (`>= 0`).
- **Result:** **2,000 / 2,000 runs passed.** Zero lost paise, zero negative values.

---

## 6. Live Cloud Database Integrity Audits (`wallet:check`)

PayPost includes an executive reconciliation audit script ([walletCheck.js](file:///d:/PayPost/backend/src/scripts/walletCheck.js)) that executes direct integrity assertions against the live MongoDB Atlas cluster.

### Live Database Reconciliation Matrix

| Audit Check # | Audit Name | Mathematical Equation / Logic | Target Entity | Pass / Fail Condition | System Risk Prevented |
| :-: | :--- | :--- | :--- | :--- | :--- |
| **Audit 1** | **Wallet Parity Audit** | $\sum \text{Ledger Credits} - \sum \text{Ledger Debits} \equiv \text{Wallet.balancePaise}$ | 100% of Creator Wallets | Must match to the exact integer paisa | Detects unauthorized balance tampering or cached drift |
| **Audit 2** | **Double-Spend Audit** | Count of documents grouped by `idempotencyKey` | `LedgerEntry` Collection | Zero keys with count $> 1$ | Detects duplicate payments or queue replay attacks |
| **Audit 3** | **Escrow Solvency Audit** | $\text{reservedPaise} + \text{paidOutPaise} \le \text{budgetPaise}$ | 100% of Campaigns | Invariant holds for every single campaign | Detects platform insolvency or overbooked commitments |
| **Audit 4** | **Conservation of Value** | $\text{platformFee} + \text{gst} + \text{tds} + \text{netPayout} \equiv \text{grossFee}$ | 100% of Approved Submissions | Invariant holds on historical snapshots | Verifies historical tax records remain mathematically sound |
| **Audit 5** | **Dangling Ref Audit** | Foreign key existence check for `user`, `submission`, `campaign` | `LedgerEntry` Collection | Zero orphan references | Ensures every transaction maps to a verified user entity |

---

## 7. Manual Browser End-to-End Verification Protocol

For evaluators and QA engineers conducting human walkthroughs in the browser (`http://localhost:5173`):

### Browser Verification Test Matrix

| Test Step | User Persona | Action Performed | Frontend UI Reaction | Network Call Executed | Database Verification |
| :-: | :---: | :--- | :--- | :--- | :--- |
| **Test 1** | **Brand** | Enters `1000` in "Fee per creator" on Campaign Form | Live card displays: *"Creator will receive ₹873.18 (after 10% fee, GST & 1% TDS)"* | `GET /api/fees/preview?feePaise=100000` (Debounced 400ms) | No database change; pure preview endpoint |
| **Test 2** | **Creator** | Opens marketplace / campaign detail | Prominently displays: *"You will receive about ₹873.18"*; "See calculation" expands table | `GET /api/campaigns` & `GET /api/campaigns/:id` | `budgetPaise` projection is completely excluded |
| **Test 3** | **Creator** | Clicks "Apply Now" (Optional pitch) | Button transforms to green *"Application Status: Applied"* | `POST /api/campaigns/:id/apply` | New `Application` document with status `applied` |
| **Test 4** | **Brand** | Opens Applicants tab, clicks "Approve" | Modal displays post-approval remaining budget preview | `PATCH /api/applications/:id/approve` | `approvedCount += 1`, `reservedPaise += 100000` (Atomic lock) |
| **Test 5** | **Creator** | Enters Instagram URL, clicks "Submit Work" | Progress stepper moves from "Submitted" $\rightarrow$ "Under Review" | `POST /api/applications/:id/submit` | New `Submission` created; URL shortcode indexed |
| **Test 6** | **Brand** | Clicks "Approve Deliverable" in Submissions tab | Modal displays itemized breakdown (Platform: ₹100, GST: ₹18, TDS: ₹8.82, Net: ₹873.18) | Client modal render | Pre-flight validation |
| **Test 7** | **Brand** | Confirms "Approve & Release Funds" | Submission card updates to green `APPROVED`; Reserved drops to ₹0, Paid Out increases | `POST /api/submissions/:id/approve` | Atomic settlement: Escrow shifted, Ledger appended, Wallet credited |
| **Test 8** | **Creator** | Refreshes Creator page | Navbar wallet chip increments by ₹873.18; card says *"₹873.18 credited to your wallet"* | `GET /api/wallet` | `Wallet.balancePaise` reflects instant credit |
| **Test 9** | **Creator** | Navigates to `/creator/wallet` | Ledger table displays credit row; clicking row expands itemized tax breakdown | `GET /api/wallet/ledger` | `LedgerEntry` row verified with balance snapshot |
| **Test 10** | **Brand** | Manually visits `/creator/wallet` in URL bar | Access blocked; immediate redirection to `/brand/dashboard` | `GET /api/wallet` (Returns 403 Forbidden) | RBAC middleware protects creator assets |

---

## 8. Command-Line Test Runner Reference

### Test Commands Cheat-Sheet

| Task | Command Line String | Execution Scope & Output |
| :--- | :--- | :--- |
| **Run All Test Suites** | `cd backend && npm test` | Runs all 128 tests across all 9 suites in parallel; prints test summary |
| **Run Tests with Coverage** | `cd backend && npm test -- --coverage` | Generates detailed statement, branch, function, and line coverage reports |
| **Run Fee Calculator Tests** | `cd backend && npm test fees.test.js` | Runs isolated vector tests and mathematical fuzzing |
| **Run Concurrency Tests** | `cd backend && npm test payout.test.js` | Executes race condition and rollback stress tests |
| **Run Real Database Audit** | `cd backend && npm run wallet:check` | Connects to live MongoDB Atlas and verifies all 5 ledger integrity assertions |
| **Run Data Backfill Script** | `cd backend && npm run wallet:backfill` | Migrates uncredited approved submissions into the ledger with idempotency keys |
