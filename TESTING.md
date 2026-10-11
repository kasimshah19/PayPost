# PayPost — Testing Strategy & Quality Assurance Guide

This document outlines the complete testing architecture, frameworks, methodologies, and audit tooling utilized across **PayPost** to ensure 100% financial correctness, concurrency safety, and zero data corruption.

---

## 1. Testing Pyramid & Multi-Tier Architecture

PayPost employs a **5-tier testing strategy** ranging from pure mathematical property tests to real-world cloud database integrity audits:

```
                  ┌─────────────────────────────────────────┐
                  │ Tier 5: Manual Multi-Role Browser E2E   │
                  │ (Brand vs Creator concurrent workflows) │
                  ├─────────────────────────────────────────┤
                  │ Tier 4: Live Cloud DB Integrity Audits  │
                  │ (npm run wallet:check - 5 audit checks) │
                  ├─────────────────────────────────────────┤
                  │ Tier 3: Concurrency & Rollback Tests    │
                  │ (Dual-click race & transaction aborts)  │
                  ├─────────────────────────────────────────┤
                  │ Tier 2: Integration REST API Testing    │
                  │ (Supertest + MongoMemoryReplSet)        │
                  ├─────────────────────────────────────────┤
                  │ Tier 1: Unit & Fuzz Math Property Tests │
                  │ (2,000 random gross amounts fuzzing)    │
                  └─────────────────────────────────────────┘
```

---

## 2. Testing Frameworks & Tooling Stack

| Tool / Library | Role in Testing | Why Selected |
| :--- | :--- | :--- |
| **Jest** | Test runner, assertions, and mock engine | Standard Node.js test runner with parallel execution and snapshot support |
| **Supertest** | HTTP integration testing | Simulates full Express HTTP requests without binding to network ports |
| **`mongodb-memory-server` (`MongoMemoryReplSet`)** | In-memory ephemeral MongoDB replica set | **Critical:** Enables real MongoDB multi-document ACID transactions in tests without polluting the production Atlas database |
| **Custom Audit Scripts (`walletCheck.js`)** | Production database integrity reconciler | Mathematically proves that ledger entries match wallet balances in the cloud DB |

---

## 3. Automated Test Suites Manifest (128 / 128 Passing)

The repository contains **9 dedicated automated test suites** covering every layer of the system:

| # | Test Suite File | Layer Tested | Tests Count | Core Invariants Verified |
| :-: | :--- | :--- | :-: | :--- |
| **1** | `backend/tests/auth.test.js` | Authentication & User Management | 14 tests | Password hashing (bcrypt), JWT validity (3 days), **Role immutability** post-registration |
| **2** | `backend/tests/campaign.test.js` | Campaigns & Discovery | 18 tests | Soft budget validation warning, **404 multi-tenant isolation**, post-approval strict mutation rules |
| **3** | `backend/tests/application.test.js` | Applications & Approvals | 20 tests | 1-Click apply, **Atomic conditional approval queries**, TOCTOU race condition defense, re-apply blocking |
| **4** | `backend/tests/submission.test.js` | Deliverables & Revisions | 22 tests | Instagram link regex validation, **Campaign-scoped URL uniqueness**, 48h dynamic revision window |
| **5** | `backend/tests/fees.test.js` | Fee Calculator & Vectors | 12 tests | Official vector tests (₹1,000 $\rightarrow$ ₹873.18, ₹499.50 $\rightarrow$ ₹436.15), non-integer error handling |
| **6** | `backend/tests/feeMath.test.js` | Financial Property & Fuzzing | 6 tests | **Fuzz testing across 2,000 random amounts** (₹0.01 to ₹100,000.00); $\text{Platform} + \text{GST} + \text{TDS} + \text{Net} \equiv \text{Gross}$ |
| **7** | `backend/tests/payout.test.js` | Settlement & Idempotency | 16 tests | Atomic wallet credit, **Idempotency key duplicate prevention**, **ACID transaction rollback on error** |
| **8** | `backend/tests/wallet.test.js` | Wallet & Ledger APIs | 12 tests | Paginated ledger history, running balance continuity, **403 Forbidden for Brand accounts** |
| **9** | `backend/tests/integrity.test.js` | Balance Reconciliation | 8 tests | Automated ledger vs wallet parity checks across complex multi-creator flows |

---

## 4. Specialized Testing Methodologies

### A. Mathematical Property & Fuzz Testing (Zero Paisa Leakage)
In financial ledgers, edge cases usually occur at fractional boundaries (e.g. ₹0.99, ₹12.50). 
- **Method:** `backend/tests/feeMath.test.js` generates **2,000 pseudo-random integer paise amounts** ranging from 1 paisa to 10,000,000 paise.
- **Assertion:** For every iteration, the test asserts:
  $$\text{platformFeePaise} + \text{gstPaise} + \text{tdsPaise} + \text{netPayoutPaise} \equiv \text{grossFeePaise}$$
  $$\text{All sub-components} \ge 0 \quad \text{and} \quad \text{All values are strictly integers}$$
- **Result:** Proven zero rounding drift down to the individual paisa.

---

### B. Concurrency & Race Condition Testing
In a marketplace with multiple admins or fast clicks, concurrent requests can cause double payouts or oversubscribed campaign slots.
- **Race Condition Test (Dual Approval):** Two concurrent HTTP requests attempt to approve the same submission simultaneously using `Promise.all()`.
  - *Assertion:* Exactly one request succeeds with `200 OK`; the other fails with a duplicate key conflict (`E11000`) or state mismatch (`400 Bad Request`).
  - *Outcome:* Wallet is credited **exactly once**; ledger receives **exactly one** record.
- **Rollback Test (ACID Invariant):** The test pre-inserts a colliding idempotency key to deliberately crash the transaction during settlement.
  - *Assertion:* The whole transaction aborts; campaign reserved budget, submission status, and wallet balance remain **100% untouched**.

---

### C. Live Cloud Database Integrity Audits (`wallet:check`)
Testing does not stop at mock databases. PayPost includes a continuous production reconciliation script ([walletCheck.js](file:///d:/PayPost/backend/src/scripts/walletCheck.js)) that connects directly to the real MongoDB Atlas database and executes **5 automated audits**:

1. **Wallet Parity Audit:** Recomputes $\sum(\text{credits}) - \sum(\text{debits})$ for every creator in the database and asserts exact equality with `wallet.balancePaise`.
2. **Double-Spend Audit:** Confirms zero duplicate `idempotencyKey` entries across the entire ledger.
3. **Escrow Solvency Audit:** Confirms $\text{reservedPaise} + \text{paidOutPaise} \le \text{budgetPaise}$ for every campaign.
4. **Conservation of Value Audit:** Confirms that for every historical payout, $\text{Platform} + \text{GST} + \text{TDS} + \text{Net} \equiv \text{Gross}$.
5. **Dangling Transaction Audit:** Verifies that all ledger rows link to valid, existing Users and Submissions.

---

## 5. How to Run the Tests

### 1. Run All Automated Unit & Integration Tests
```bash
cd backend
npm test
```
*Executes all 128 tests using an isolated, in-memory MongoDB replica set. Zero network dependency, zero cloud database impact.*

### 2. Run Tests with Coverage Report
```bash
cd backend
npm test -- --coverage
```

### 3. Run Specific Test Suites
```bash
# Test only the Fee Math & Tax Engine
npm test fees.test.js

# Test only Concurrency & Wallet Logic
npm test wallet.test.js
```

### 4. Run Cloud Database Audit on Real MongoDB Atlas
```bash
cd backend
npm run wallet:check
```
*Output prints OK/FAIL per assertion and exits with code 0 if 100% reconciled, or non-zero on failure.*

### 5. Run Legacy Data Backfill
```bash
cd backend
npm run wallet:backfill
```
*Safely migrates historical approved submissions into the ledger with idempotent keys.*

---

## 6. Manual Browser Verification Protocol

For human evaluators and QA testing in the browser:

| Test Scenario | Steps to Execute | Expected Behavior |
| :--- | :--- | :--- |
| **Brand Fee Preview** | Open `http://localhost:5173/brand/campaigns/new`, type `1000` in Fee | Instant advisory card: *"Creator will receive ₹873.18"* |
| **Creator Take-Home** | Open marketplace, inspect campaign card before applying | Prominently displays: *"You will receive about: ₹873.18"* with expandable calculation drawer |
| **Escrow Lock** | Brand approves creator application | Campaign `Reserved` increases by ₹1,000.00; `Available` drops by ₹1,000.00 |
| **Deliverable Submission** | Creator inputs Instagram link | Regex checks valid Instagram permalink; duplicate links in same campaign blocked |
| **Payout Release Modal** | Brand clicks "Approve Deliverable" | Modal displays itemized breakdown (Platform: ₹100, GST: ₹18, TDS: ₹8.82, Net: ₹873.18) |
| **Wallet & Navbar Sync** | Brand confirms payout | Creator Navbar wallet chip updates immediately; `Reserved` drops, `Paid Out` increases by ₹1,000 |
| **Ledger Row Drilldown** | Open `/creator/wallet`, click "View" on ledger row | Row expands to display permanent tax breakdown snapshot |
| **RBAC Route Guard** | Log in as Brand, navigate to `/creator/wallet` | Blocked and redirected to dashboard (`403 Forbidden`) |
