# Phase 1: Project Setup & Baseline

## Prompt I sent

```text
Initialize PayPost project workspace:
1. Backend: Node.js (CommonJS), Express, Mongoose, dotenv, cors, nodemon. Setup layered architecture: routes -> controllers -> services -> models -> utils.
2. Core rule: All monetary amounts must be stored and computed as integer paise (1 INR = 100 paise) across all schemas and services. No floating point money.
3. Setup Jest test runner with in-memory MongoDB replica set (mongodb-memory-server) to support real multi-document ACID transactions without requiring an external DB.
4. Frontend: React + Vite + Tailwind CSS with clean responsive viewport support.
5. Create environment configuration, central error handling, and baseline healthcheck endpoints.
```

---

## What the AI built (short)

- Backend scaffold with CommonJS module system and Express REST server.
- Universal Integer Paise naming convention (all currency fields suffixed with 'Paise').
- MongoMemoryReplSet integration in Jest configuration for real ACID transaction testing without external database dependencies.
- Standardized API response envelopes ({ success: true, data } / { success: false, message, errors }).
- Frontend Vite + Tailwind CSS setup with base layouts and Axios API client.

---

## What I tested myself and what I found or fixed

1. Verified backend boots on port 5000 with GET /api/health responding with 200 OK.
2. Verified MongoMemoryReplSet starts a single-node replica set in tests and supports mongoose sessions and withTransaction.
3. Ran initial test runner to ensure zero environment crashes and clean teardown.
4. Tested Vite dev server and verified Tailwind utility classes compile correctly in browser.
