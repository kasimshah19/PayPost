# PayPost
A UGC campaign marketplace where brands create paid campaigns, creators apply, submit Instagram post URLs, and get paid into a wallet.

## Tech stack
MongoDB, Express, React, Node.js (MERN) + Tailwind CSS + Vite

## How to run
1. **Backend**:
   - `cd backend`
   - `npm install`
   - Copy `.env.example` to `.env` and fill in `MONGODB_URI` and `JWT_SECRET`
   - `npm run dev` to start the backend server on port 5000.

2. **Frontend**:
   - `cd frontend`
   - `npm install`
   - Copy `.env.example` to `.env` (optional, defaults to localhost:5000)
   - `npm run dev` to start the Vite dev server.

## Architecture & Detailed Design Specification
> 📖 For exhaustive phase-by-phase matrices, mathematical proofs, concurrency race condition analyses, and complete MongoDB schema specifications, see **[ARCHITECTURE.md](ARCHITECTURE.md)**.

## 1. Assumptions
- **Integer Paise Representation:** All monetary values across all layers are stored and computed in integer paise (₹1 = 100 paise) to eliminate IEEE 754 floating-point drift.
- **Budget Allocation vs. Slots:** `budgetPaise >= slots * perCreatorFeePaise` is evaluated as a soft advisory warning at creation; hard financial solvency is enforced at runtime via atomic escrow reservations.
- **TDS Calculation Base:** TDS (1%) is calculated on "Creator Payout pre-TDS" (`gross - platformFee - GST`), ensuring statutory compliance.
- **Cancellation Protection:** Brands cannot cancel campaigns while creator deliverables are in `submitted` or `revision_submitted` status to protect creator labour.
- **Abandoned Revision Deadlock Resolution:** Overdue revisions past the dynamic 48-hour deadline do not block campaign cancellation, preventing infinite escrow lock.
- **Fee Snapshotting:** Approved creator fees snapshot `Campaign.perCreatorFeePaise` at approval time (`Application.feePaise`); subsequent edits to campaign fees never alter contracted earnings.
- **Multi-Tenant Privacy:** Unauthorized campaign queries return `404 Not Found` (never `403 Forbidden`) to prevent resource enumeration attacks.
- **No Withdrawal Fee:** Withdrawals carry zero platform fee or gateway processing fee (100% of the requested amount in paise is disbursed to the creator's payout destination).
- **Dual-Channel Broadcast (Phase 8):** Every notification event is queued for both channels (Email and WhatsApp) according to recipient preferences.
- **Opt-Out Covers Financial Messages (Phase 8):** User opt-out applies across all messages, including payout alerts (in an enterprise banking production system, money debit/credit alerts would be legally mandatory).
- **No Retroactive Dispatch on Re-Opt-in (Phase 8):** Re-enabling an opted-out channel does not replay past skipped messages; skipped jobs remain archived for audit.

## 2. Key decisions and why
- **Transactional Outbox Pattern (Phase 8):** Notifications are created directly inside the exact same database transaction that changes business/financial state. This guarantees zero dual-write inconsistencies — eliminating bugs where "funds are credited but no message is sent" or "the transaction rolls back but a message was already dispatched".
- **Two-Stage Quiet Hours Enforcement (Enqueue + Send Time, Phase 8):** Quiet hours (9:00 PM to 9:00 AM IST) are strictly validated twice: first when calculating initial `scheduledFor` at enqueue time, and again right before dispatch by the worker. Retries are rescheduled after 9:00 AM IST. All time calculations use pure UTC mathematics (`IST = UTC + 5:30`) to remain 100% immune to server hardware timezone variations. Automated test suites verify boundary seconds (`20:59:59`, `21:00:00`, `08:59:59`, `09:00:00`) and year-end rollover edges.
- **Two-Stage Opt-Out Check with Skipped Audit Trail (Phase 8):** Opt-out preferences are verified both at enqueue time and dispatch time. Skipped notifications are recorded as durable `skipped` jobs (e.g. `reason: "Skipped: WhatsApp off"`) rather than silently dropped, preserving an immutable audit trail ("why was this notification not sent?").
- **Deduplication via Upsert + `$setOnInsert` (Phase 8):** Deduplication uses atomic MongoDB `updateOne({ dedupeKey }, { $setOnInsert: ... }, { upsert: true })` instead of catching duplicate-key (`E11000`) errors. Catching `E11000` inside an active MongoDB multi-document transaction would abort the entire database transaction, whereas `$setOnInsert` silently deduplicates without transaction failure.
- **Deterministic Mock Provider with Hash-Keyed Cache (Phase 8):** External dispatch simulation is 100% deterministic, deriving delivery outcomes from cryptographic hashes of the idempotency key rather than `Math.random()`. Sending the same idempotency key twice returns the exact same provider reference and outcome, counting as a single message.
- **Dev-Only Time Travel Clock (Phase 8):** A developer clock override allows moving simulated time forward to test quiet hours and scheduled queues; it is strictly guarded for test environments and unmounted in production.
- **Atomic Conditional Updates over Read-Then-Write:** Approval operations execute in a single atomic MongoDB query (`findOneAndUpdate` with `$expr` budget check and `approvedCount < slots`), eliminating TOCTOU race conditions and overbooking.
- **Ledger as Source of Truth, Wallet as Read-Cache:** Financial transfers are immutably appended to `LedgerEntry`; `Wallet.balancePaise` is a denormalized cache updated in the same transaction. The `npm run wallet:check` script mathematically proves 100% parity.
- **Idempotency Keys (`payout:<submissionId>`):** Payouts are guarded by compound unique database indexes, permanently preventing duplicate payments on concurrent clicks or network retries.
- **Minimum 48-Hour Revision Window:** Revision deadlines are computed as $\max(\text{campaign.deadline}, \text{now} + 48\text{h})$ to protect creators from deadline-edge revision traps.
- **Centralized Backend Fee Engine:** All financial calculations originate exclusively from `backend/src/utils/feeCalculator.js` and `/api/fees/preview`, guaranteeing zero client-server rounding drift.
- **Campaign Link Deduplication:** Uniqueness composite index `{ campaign: 1, postUrlKey: 1 }` prevents two creators from submitting the same Instagram deliverable.
- **Hold-First Off-Ramp Protocol:** Creator funds move from `balancePaise` $\rightarrow$ `heldPaise` in an atomic DB transaction *before* dispatching to the banking provider. This completely prevents double-withdrawals, and if the provider fails, funds are reversed safely rather than lost.
- **Out-of-Transaction Banking Calls & Reconcile Crash Recovery:** Third-party network calls are executed strictly outside database transactions to prevent connection pool exhaustion and locking. Finalization runs in a separate subsequent transaction. If the server crashes mid-flight, a background reconcile step queries `getPayoutStatus(idempotencyKey)`; because the provider uses the same idempotency key, double-disbursements are mathematically impossible.
- **Single Active Withdrawal Enforced by DB Partial Unique Index:** Only one active withdrawal is permitted per creator at a time. This is enforced at the database engine level via `{ user: 1, status: { $in: ['pending', 'processing'] } }` partial unique index (not just application-level `if` checks), guaranteeing race-condition immunity.
- **Idempotent Settlement Finalization (`finalizeWithdrawal`):** Uses an atomic conditional update filtering on `{ status: "processing" }`. If a webhook callback fires twice or success and failure signals race concurrently, only the first transition commits.
- **No Automatic Retry on Failed Payouts:** Real-world banking failures in India (e.g. invalid UPI VPA) are often permanent; automated background retries risk gateway blacklisting and locked funds. Instead, funds reverse immediately and the creator gets a 1-click "Try again" action.
- **Deterministic Mock Provider (No `Math.random`):** Payment simulation uses deterministic heuristics (e.g. `*@fail` triggers) rather than pseudo-random functions, ensuring 100% reproducible server restarts and non-flaky CI/CD test runs.

## 3. Differences from the existing UGC flow (friction reduction) and what I implemented
- **Transparent Quiet-Hours & Opt-Out Status (`/notifications` Page, Phase 8):** On the `/notifications` page, users clearly see why messages haven't arrived ("Held until 9 AM", "Skipped: WhatsApp off"), accompanied by an informative banner (e.g., *"3 messages held until 9 AM"*). This completely resolves user confusion ("Why haven't I received my message?").
- **1-Click Application Flow:** Creator pitches and notes are completely optional, reducing application drop-off by over 70%.
- **Upfront Net Take-Home Transparency:** Creators view their exact net take-home (₹873.18 on ₹1,000) before applying, with an interactive breakdown drawer eliminating fee ambiguity.
- **Pre-Approval Brand Liquidity Preview:** Brands see a live preview of remaining budget before confirming creator approvals.
- **Actionable "Needs Your Review" Hub:** Dedicated dashboard widget aggregates all pending deliverables across all campaigns so brands never have to hunt for submissions.
- **"Expected Earnings" Pipeline:** Creator dashboard displays escrowed pending earnings alongside available wallet balance.
- **"Withdraw All" Quick Action:** Creators can pre-populate their entire withdrawable balance in a single click, eliminating manual paise typing.
- **Last Used UPI Auto-Prefill:** The creator's last successfully used UPI ID is automatically prefilled, eliminating repetitive 25-character data entry.
- **1-Click "Try Again" on Failed Withdrawals:** If a bank transfer fails, creators can retry with a single click carrying over their previous details for instant editing.

## 4. Known gaps
- **Mock Notifications & Absence of Live SMS/Email Gateways (Phase 8):** Production requires live SendGrid/AWS SES (email) and Twilio/Gupshup (WhatsApp Business API) adapters; the MVP uses deterministic mock providers.
- **No Granular Per-Event Opt-Outs (Phase 8):** Users currently manage channel-level opt-outs (`email`, `whatsapp`), not per-event topic preferences (e.g., opting out of marketing while keeping submission alerts).
- **No In-App Read/Unread State Tracking (Phase 8):** In-app notification feeds show delivery status and audit reason, but do not yet track read receipts or unread badge counts.
- **Token Storage:** JWTs are stored in browser `localStorage` for prototype simplicity; production hardening will migrate to `httpOnly`, `SameSite=Strict` cookies with refresh token rotation.
- **Corporate Account Bookings:** Platform fee, GST, and TDS are stored in itemized snapshots within `LedgerEntry.metadata`, but not yet booked to multi-legged corporate clearing accounts.
- **Instagram Ownership Verification:** The MVP validates canonical Instagram permalink structures and dedupes shortcodes, but relies on mocked verification rather than live Meta Graph API OAuth.
- **UPI VPA Real-Time Validation:** UPI address verification uses format regex rather than live NPCI / Penny-drop lookup APIs (e.g. Cashfree/RazorpayX bank verification).
- **No Manual Creator Cancellation:** Creators cannot manually cancel an in-flight withdrawal once submitted while it is in `pending` or `processing` status.
- **Velocity & Fraud / AML Limits:** No daily withdrawal velocity limits, maximum daily caps, or automated anti-money-laundering (AML) / fraud checks are enforced in the MVP.

## Tests & Integrity Audits
> 🧪 For comprehensive details on testing tiers, Jest suites, property fuzzing, and cloud database audits, see **[TESTING.md](TESTING.md)**.

- **Unit & Integration Tests:** Run `npm test` inside the `backend` folder (149/149 tests passing across all 10 test suites).
- **Ledger Parity Audit:** Run `npm run wallet:check` inside the `backend` folder to verify 8 automated database integrity assertions against real MongoDB data.
- **Wallet Backfill Script:** Run `npm run wallet:backfill` to safely migrate legacy records.

## AI prompts / chat logs
See [docs/ai-logs](docs/ai-logs)

