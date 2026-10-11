# Phase 1: Project Setup & Baseline Architecture

## Prompt I sent

```text
You are building "PayPost", a full-stack MERN platform for managing campaign collaborations, atomic budget allocations, deliverable reviews, and tax-compliant payout settlements between Brands and Creators (inspired by UGCIndia).

Set up the project foundation with high engineering standards:
1. Architecture & Runtime:
   - Backend: Node.js with CommonJS modules, Express.js, Mongoose ODM, dotenv, cors, nodemon.
   - Directory structure: Decoupled layered pattern (src/config, src/constants, src/controllers, src/middleware, src/models, src/routes, src/schemas, src/services, src/utils, tests).
2. Fundamental Financial Rule (Integer Paise Invariant):
   - In standard IEEE 754 floating point arithmetic (e.g. 0.1 + 0.2 !== 0.3), currency math drifts and leaks paise over thousands of transactions.
   - Enforce an absolute system-wide rule: all money must be represented, stored, computed, and transferred as integer Indian Paise (1 INR = 100 paise). No floats in MongoDB schemas or backend services. All currency fields must be explicitly suffixed with 'Paise' (e.g., budgetPaise, perCreatorFeePaise, balancePaise).
3. Database & ACID Testing Primitives:
   - In MongoDB, multi-document ACID transactions require a replica set.
   - Configure Jest test runner using mongodb-memory-server with MongoMemoryReplSet (count: 1) so every unit and integration test executes against a real in-memory replica set with true session transactions, zero mock database compromises, and no cloud dependency.
4. Error Handling & API Contract:
   - Centralized error-handling middleware with custom ApiError. Standardized JSON response envelope:
     Success: { success: true, data: ... }
     Failure: { success: false, message: "...", errors: [...] }
   - Logging, healthcheck endpoint (GET /api/health), and graceful shutdown handlers.
5. Frontend Foundation:
   - React 18 with Vite and Tailwind CSS.
   - Custom design system foundation with CSS custom properties (light/dark slate theme, vibrant accents).
   - Base Axios API client configured with centralized base URL and request/response interceptors.

Explain your architecture decisions clearly, write clean code, and add test scripts.
```

---

## What the AI built (Detailed Architecture & Implementation)

### 1. Backend Layered Architecture & Environment
- **Node.js (CommonJS) + Express**: Clean decoupled folder structure separating concerns:
  - `src/config/`: Environment validation (`env.js`) enforcing mandatory variables (`PORT`, `MONGODB_URI`, `JWT_SECRET`) and database connection pool manager (`db.js`).
  - `src/constants/`: System-wide frozen enums (`USER_ROLE`, `CAMPAIGN_STATUS`, `APPLICATION_STATUS`, `SUBMISSION_STATUS`, `WITHDRAWAL_STATUS`, `LEDGER_TYPE`, `LEDGER_DIRECTION`).
  - `src/middleware/`: Centralized error interceptor (`errorHandler.js`), standard request logger, and CORS origin validator.
  - `src/utils/`: Transaction helper (`withTransaction.js`), money formatting helpers (`formatPaise`, `toPaise`, `toRupees`), and pure UTC timezone utilities.
- **Unified API Response Envelopes**:
  - Success responses return HTTP 200/201 with `{ success: true, data: ... }`.
  - Errors return predictable HTTP statuses (`400`, `401`, `403`, `404`, `409`, `500`) with `{ success: false, message, errors }`.

### 2. Universal Integer Paise Standard
- Every monetary schema property and DTO is strictly typed as an integer suffixed with `Paise`.
- All decimal arithmetic occurs strictly at the edge in UI presentation helpers (`₹(amountPaise / 100).toFixed(2)`).

### 3. In-Memory Replica Set Test Harness
- Configured Jest environment with `mongodb-memory-server` (`MongoMemoryReplSet.create({ replSet: { count: 1 } })`).
- Every test file connects directly to this in-memory replica set URI, allowing native Mongoose `ClientSession` and `session.withTransaction()` calls to run locally without an external Atlas database or Docker instance.

### 4. Frontend Foundation (React + Vite + Tailwind CSS)
- Initialized Vite React application with Tailwind CSS configuration.
- Setup custom CSS tokens, modern Inter typography, and responsive viewport baseline supporting 360px mobile viewports up to large desktop screens.
- Configured Axios client with automatic `Bearer <token>` injection and unified response interceptor.

---

## What I tested myself, what I found or fixed & Verification Proofs

### 1. Server Boot & Healthcheck
- Tested `npm run dev`: Backend booted on port 5000 in under 450ms.
- Executed `curl http://localhost:5000/api/health`:
  - Returned HTTP 200 OK with payload: `{ success: true, data: { status: "healthy", timestamp: "..." } }`.

### 2. In-Memory Replica Set & Transaction Verification
- Created a standalone verification test executing a multi-document transaction inside `withTransaction(async (session) => { ... })`.
- Verified that committed operations persisted correctly across collections.
- Verified that an intentional thrown error inside the callback triggered a clean `session.abortTransaction()`, leaving database collections unmodified.

### 3. Integer Arithmetic Verification
- Tested arithmetic edge cases: `toPaise("100.50")` $ightarrow$ `10050`, `toPaise(100.50)` $ightarrow$ `10050`, `formatPaise(100000)` $ightarrow$ `"₹1,000.00"`.
- Verified that no floating-point rounding errors occurred with repeated additions.

### 4. Frontend Build & Tailwind Rendering
- Ran `npm run build` in `frontend/`: Bundled in 3.1s with zero errors or warnings.
- Verified in Google Chrome that Tailwind utility classes, CSS grid, and responsive flex containers rendered cleanly without layout shifts.
