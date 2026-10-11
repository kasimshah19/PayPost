# PayPost: Campaign Deliverables & Payout Settlement System

PayPost is a production-grade campaign collaboration and payout marketplace built for Indian creator platforms (inspired by UGCIndia). It manages the entire creator-brand lifecycle: structured campaign briefs, atomic budget & slot reservations, mutually-exclusive submission workflows, two-revision caps, and transparent Indian tax calculations (Platform Fee, GST, and TDS). Payouts are backed by an immutable, append-only financial ledger with two-phase hold-and-settle withdrawals and a TRAI-compliant IST quiet-hours notification outbox.

---

## 1. What It Does

1. **Campaign Creation & Budget Guardrails**: Brands publish campaign briefs specifying slots, creator payout fees, deadlines, and requirements. The platform guarantees that budget and slot reservations happen atomically.
2. **One-Click Application**: Creators browse open campaigns, view transparent take-home earnings before applying, and submit applications with an optional pitch.
3. **Atomic Slot & Budget Reservation**: When a brand approves an applicant, the gross fee is atomically locked from the campaign budget without read-then-write race conditions.
4. **Deliverable Submission & Race Protection**: Approved creators submit Instagram deliverables with real-time format validation. Application withdrawal and deliverable submission are mutually exclusive.
5. **Brand Review & Controlled Revisions**: Brands review deliverables with an Action Center. Brands can approve, request a revision (strictly capped at 2, with mandatory feedback), or reject.
6. **Automatic Tax Math & Instant Wallet Credit**: Approving a deliverable triggers deterministic fee breakdown calculations (10% platform fee, 18% GST on platform fee, 1% TDS) and credits the net amount to the creator's wallet with an append-only ledger entry.
7. **Two-Phase Hold-and-Settle UPI Withdrawals**: Creators withdraw earnings (minimum ₹100) to UPI. Balance is moved to `heldPaise` in phase one, dispatched to the provider with an idempotency key, and finalized or refunded back safely.
8. **TRAI-Compliant Quiet Hours Notification Outbox**: System events enqueue notifications within the same database transaction as the business state change, withholding non-urgent delivery between 9:00 PM and 9:00 AM IST.

---

## 2. Tech Stack and Why

- **Node.js & CommonJS Backend**: Clean, synchronous module execution matching standard Node enterprise deployments.
- **Express.js**: Lightweight HTTP routing with modular architecture (`routes -> controllers -> services -> models`).
- **MongoDB Atlas & Mongoose**: Document-oriented database providing multi-document ACID transactions across replica sets for all financial operations.
- **React (Vite) & Tailwind CSS**: Fast, modern frontend without heavy third-party UI libraries, custom-built for responsive 360px mobile viewports up to wide desktop screens.
- **In-Memory Testing (`mongodb-memory-server`)**: Full test suite runs real replica set transactions and race conditions in memory with zero cloud database dependency.

---

## 3. Quick Start

### Prerequisites
- Node.js `>= 18.x`
- npm `>= 9.x`
- MongoDB Atlas cluster URI (or local MongoDB replica set for production/dev running)

> **MongoDB Replica Set Note**: MongoDB multi-document transactions require a replica set. Atlas clusters provide this out of the box. For local standalone MongoDB instances, transactions will fail unless configured as a single-node replica set. Note that all backend tests automatically provision an in-memory replica set via `MongoMemoryReplSet`.

### Environment Configuration

1. **Backend**:
   Create `backend/.env` (copy from `backend/.env.example`):
   ```env
   PORT=5000
   MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/paypost?retryWrites=true&w=majority
   JWT_SECRET=your_super_secret_jwt_key_at_least_32_characters_long
   CLIENT_URL=http://localhost:5173
   ENABLE_DEV_TOOLS=false
   ```
   *Optional worker & mock parameters:*
   - `MOCK_PAYOUT_MODE`: `random` (default) | `always_success` | `always_fail` | `deterministic`
   - `MOCK_PAYOUT_DELAY_MS`: simulated provider latency (default `4000`)
   - `MOCK_NOTIFY_MODE`: `random` | `always_success` | `always_fail` | `deterministic`
   - `WORKER_ENABLED`: `true` (runs background withdrawal processor)
   - `NOTIFICATION_WORKER_ENABLED`: `true` (runs background notification dispatcher)

2. **Frontend**:
   Create `frontend/.env` (copy from `frontend/.env.example`):
   ```env
   VITE_API_URL=http://localhost:5000/api
   ```

### Installation & Execution

```bash
# 1. Install dependencies
cd backend && npm install
cd ../frontend && npm install

# 2. Initialize database indexes
cd ../backend
npm run db:init

# 3. Seed demo accounts & campaigns (optional)
npm run seed:demo

# 4. Start backend (API server and workers start together)
npm run dev

# 5. Start frontend (in a separate terminal)
cd ../frontend
npm run dev
```

### Demo Accounts & Testing Tricks
When seeded with `npm run seed:demo`:
- **Brand Account**: `brand@demo.com` / `Password123!`
- **Creator 1**: `creator1@demo.com` / `Password123!`
- **Creator 2**: `creator2@demo.com` / `Password123!`

**Mock UPI Payment Routing**:
- Enter a VPA ending in `@mock` with username `success` (e.g. `success@mock`, `raj@mock`) to guarantee instant payout success.
- Enter `fail@mock` or `declined@mock` to simulate provider failure and trigger an automatic balance refund back to creator wallet.

**Dev Tools Flag (`ENABLE_DEV_TOOLS=true`)**:
Mounts `/api/dev/clock` allowing simulated time-shifts in test/staging to test quiet-hours notification delivery during daylight hours.

**Run on Your Phone (Local Network)**:
1. Find your computer's local IP address (e.g. `192.168.1.15`).
2. Update `frontend/.env`: `VITE_API_URL=http://192.168.1.15:5000/api`.
3. In `backend/.env`, set `CLIENT_URL=http://192.168.1.15:5173,http://localhost:5173`.
4. Run frontend with host exposure: `npm run dev -- --host`.
5. Open `http://192.168.1.15:5173` on your mobile browser.

---

## 4. Project Structure

```
PayPost/
├── backend/
│   ├── src/
│   │   ├── config/          # Environment loader & validation (env.js, db.js)
│   │   ├── constants/       # Frozen domain enums, status maps, tax rates
│   │   ├── controllers/     # Express route handlers
│   │   ├── jobs/            # Polling workers (withdrawalWorker.js, notificationWorker.js)
│   │   ├── middleware/      # Auth JWT verification, role guards, input validation
│   │   ├── models/          # Mongoose schemas (User, Campaign, Application, Submission, Wallet, LedgerEntry, Withdrawal, NotificationJob)
│   │   ├── routes/          # API route definitions
│   │   ├── schemas/         # Zod request payload schemas
│   │   ├── services/        # Business logic, fee math, transactional services
│   │   └── utils/           # Time arithmetic, quiet hours, currency formatting, withTransaction
│   ├── scripts/             # DB indexing, secret scanner, seeders, balance check
│   └── tests/               # 15 Jest test suites with MongoMemoryReplSet
├── frontend/
│   ├── src/
│   │   ├── components/      # UI components, modals, bottom sheets, form inputs
│   │   ├── context/         # AuthContext and NotificationContext
│   │   ├── hooks/           # Polling hooks, responsive hooks, page titles
│   │   ├── pages/           # Brand & Creator Dashboards, Campaign Details, Action Centers
│   │   └── services/        # Axios API client functions
└── docs/                    # Architecture, Walkthrough, Testing guides, AI logs
```

---

## 5. PART 1: Assumptions

- **A1: Indian Tax & Fee Deduction Formula**:
  *Unclear in brief*: Who pays fees and whether GST/TDS are deducted from creator earnings or added on top.
  *Assumption*: The brand pays only the gross creator fee (`perCreatorFeePaise`). Platform fee is 10% of gross fee; GST is 18% of platform fee (both deducted from creator payout); TDS is 1% of net payout before TDS. Integer paise rounding half-up ensures `platformFee + GST + TDS + net === grossFee` without any leaked paise.
  *Code*: `backend/src/services/feeCalculator.js`.
- **A2: Atomic Budget Reservation**:
  *Assumption*: Approving a creator reserves `perCreatorFeePaise` from campaign budget immediately. Upon deliverable approval, the funds transition from `reservedPaise` to `paidOutPaise`.
  *Code*: `backend/src/services/application.service.js`, `backend/src/services/submissionService.js`.
- **A3: Budget vs Slot Warnings**:
  *Assumption*: A campaign budget does not strictly have to cover all slots at creation (e.g. brand sets 5 slots but only funds ₹4,000 when fee is ₹2,000). The UI shows an explicit warning, and the backend halts approvals when budget runs out.
  *Code*: `backend/src/services/campaign.service.js`, `backend/src/services/application.service.js`.
- **A4: Campaign Editing Rules After Approvals**:
  *Assumption*: A brand can edit an active campaign, but budget cannot drop below `reservedPaise + paidOutPaise`, slots cannot drop below `approvedCount`, deadlines can only be extended, and fee edits only apply to future applicants.
  *Code*: `backend/src/services/campaign.service.js` (`updateCampaign`).
- **A5: Campaign Cancellation Protection**:
  *Assumption*: A brand can cancel a campaign with approved creators, but cancellation is strictly rejected with HTTP 409 if any submission is awaiting review or inside an active revision window. Paid funds remain paid; pending reservations and slots are freed.
  *Code*: `backend/src/services/campaign.service.js` (`cancel`).
- **A6: Approved Creators Cannot Be Removed**:
  *Assumption*: Brands cannot un-approve or kick out an approved creator. Deliverable rejection is a final evaluation on finished work that frees the slot; creators cannot re-apply once rejected.
  *Code*: `backend/src/services/submissionService.js`.
- **A7: Re-Application Restrictions**:
  *Assumption*: A creator who withdrew while their application was in `applied` state may re-apply before deadline. A creator who withdrew after approval or was rejected/cancelled cannot re-apply.
  *Code*: `backend/src/services/application.service.js` (`applyToCampaign`).
- **A8: Approval Window Extension**:
  *Assumption*: Brands can approve pending applicants after `applicationDeadline` has passed, as long as `submissionDeadline` remains in the future.
  *Code*: `backend/src/services/application.service.js`.
- **A9: Revision Window Limit & Deadlines**:
  *Assumption*: Maximum 2 revisions allowed. A note is mandatory. Resubmission deadline is set to `max(submissionDeadline, now + 48h)`.
  *Code*: `backend/src/services/submissionService.js` (`requestRevision`).
- **A10: Instagram Deliverable Verification**:
  *Assumption*: Deliverable links are validated via regex format (`https://www.instagram.com/p/...|/reel/...`). URL deduplication prevents two creators from submitting the identical post link within the same campaign.
  *Code*: `backend/src/utils/instagram.js`, `backend/src/services/submissionService.js`.
- **A11: Real-Time Wallet Settlement**:
  *Assumption*: The net payout is credited to creator wallet instantly when the brand approves deliverable.
  *Code*: `backend/src/services/submissionService.js`, `backend/src/services/walletService.js`.
- **A12: UPI Withdrawal Rules**:
  *Assumption*: Minimum withdrawal is ₹100 (10000 paise). Only one active withdrawal is allowed per creator at a time. The amount is immediately held in wallet (`heldPaise`). Failures refund the held balance; retries are not automatic.
  *Code*: `backend/src/services/withdrawalService.js`.
- **A13: Notification Opt-Out & Quiet Hours**:
  *Assumption*: Every event queues both Email and WhatsApp notifications. Channel opt-out suppresses dispatch even if toggled after queueing. Messages scheduled between 9 PM and 9 AM IST are held until 9 AM IST.
  *Code*: `backend/src/utils/quietHours.js`, `backend/src/services/notificationService.js`, `backend/src/jobs/notificationWorker.js`.
- **A14: Simplified Authentication**:
  *Assumption*: Email/password signup with fixed role (`brand` or `creator`), no OTP or email verification steps required for this prototype.
  *Code*: `backend/src/controllers/auth.controller.js`.
- **A15: Deterministic Mock Services**:
  *Assumption*: UPI VPAs `success@mock` always succeed; `fail@mock` always fail; otherwise follows configured `MOCK_PAYOUT_MODE`.
  *Code*: `backend/src/services/mockPayoutProvider.js`.
- **A16: Currency & Date Representation**:
  *Assumption*: All money values are stored as integer paise in database and API logic. All dates are stored as UTC and rendered formatted in IST (+05:30) on UI.
  *Code*: `backend/src/utils/money.js`, `backend/src/utils/quietHours.js`.
- **A17: Virtual Campaign Budget**:
  *Assumption*: The campaign budget is a tracked numerical allocation on the campaign document. No escrow deposit or bank account top-up is modeled.
  *Code*: `backend/src/models/Campaign.js`.
- **A18: Manual Brand Actions on Overdue Deliverables**:
  *Assumption*: Approved creators who fail to submit before the deadline are not auto-expired by background workers; the brand can reject or cancel.
  *Code*: `backend/src/services/submissionService.js`.

---

## 6. PART 2: Key Decisions and Why

- **D1: MongoDB Atlas Multi-Document ACID Transactions**:
  *Why*: Financial operations (budget reservation, payout settlement, withdrawal holds) require atomic updates across multiple collections (Campaigns, Submissions, Wallets, LedgerEntries).
  *Trade-off*: Requires replica set support and slight latency overhead compared to single-document writes.
- **D2: Single Conditional Atomic Updates for Races**:
  *Why*: Campaign budget and slots are reserved using single `findOneAndUpdate` operations where condition checks (`slots: { $gt: approvedCount }`, `budgetPaise: { $gte: reserved + fee }`) are part of the query filter.
  *Trade-off*: Avoids read-then-write locks; requests that exceed capacity fail cleanly with HTTP 409.
- **D3: Integer Paise Standard**:
  *Why*: JavaScript floating-point numbers (`0.1 + 0.2 !== 0.3`) introduce rounding bugs in currency arithmetic.
  *Trade-off*: Amounts must be multiplied/divided by 100 for display, handled cleanly via `formatPaise`.
- **D4: Append-Only Immutable Wallet Ledger**:
  *Why*: The `LedgerEntry` collection is the source of truth for all balances. Wallet balance is an updated cache verified by `integrityService`. Ledger schema middleware forbids updates and deletions.
  *Trade-off*: Higher disk storage; absolute financial auditability.
- **D5: Immutable Fee Breakdown Snapshots**:
  *Why*: Payout breakdowns are computed and saved directly onto the `Submission` document at approval time.
  *Trade-off*: Changing platform fee settings in the future does not alter historic payout records.
- **D6: Centralized State Machine for Applications**:
  *Why*: All application status transitions flow through `transitionApplicationStatus` with an explicit state matrix.
  *Trade-off*: Disallows ad-hoc status mutations; eliminates impossible states.
- **D7: Mutual Exclusion Between Submit and Withdraw**:
  *Why*: Creators cannot withdraw an application while deliverable submission is processing. Handled by atomic status checks.
  *Trade-off*: A creator cannot back out once they submit deliverable.
- **D8: Two-Phase Hold-and-Settle Withdrawal Pattern**:
  *Why*: External payout providers should never be called inside an open database transaction. Phase 1 holds funds; Provider is called; Phase 2 finalizes or refunds.
  *Trade-off*: Requires background worker reconciliation to recover stuck transfers if server crashes during API call.
- **D9: Transactional Outbox for Notifications**:
  *Why*: Notification jobs are inserted in the same DB transaction as business logic. If transaction rolls back, no notification is sent. If committed, message delivery is guaranteed.
  *Trade-off*: Asynchronous delivery via polling worker introduces brief (1-3 second) delivery latency.
- **D10: Pure UTC Arithmetic for IST Quiet Hours**:
  *Why*: TRAI regulations mandate no promotional alerts between 9 PM and 9 AM IST. Evaluated using pure UTC timestamp math (`UTC + 330 mins`) regardless of host machine timezone.
  *Trade-off*: Server local time is irrelevant, avoiding daylight saving and container timezone bugs.
- **D11: MongoDB Polling Queue Instead of Redis**:
  *Why*: Keeps stack dependencies minimal for a prototype without introducing Redis or BullMQ.
  *Trade-off*: Polling query every 3–5 seconds; handles up to hundreds of concurrent jobs cleanly with atomic `$set: { status: 'processing' }` locks.
- **D12: Zod Request Validation & 404 Privacy Guards**:
  *Why*: Every request body is validated against explicit Zod schemas. Unauthorized access to another brand's campaign returns 404 rather than 403 to avoid ID probing.
  *Trade-off*: Slightly less descriptive error for attackers; superior security hygiene.
- **D13: JWT in LocalStorage**:
  *Why*: Simple client authentication for React SPA without complex CORS cookie proxy configuration.
  *Trade-off*: Vulnerable to XSS if malicious scripts are injected; noted in Known Gaps.
- **D14: Mobile-First Handcrafted UI**:
  *Why*: Creator workflows in India happen overwhelmingly on mobile devices. Custom Tailwind components, responsive cards, and bottom action sheets replace bulky table UIs.
  *Trade-off*: More CSS utility classes; zero dependency on bloated third-party UI libraries.
- **D15: In-Memory Replica Set Testing**:
  *Why*: `mongodb-memory-server` replica set allows real ACID transactions and concurrency race tests to run locally and in CI without an external database.
  *Trade-off*: Slower initial test startup (~3-4 seconds to spin up replica set); 100% faithful transaction behavior.

---

## 7. PART 3: What I Would Do Differently to Reduce Friction

[KASIM: after checking ugccontent.in, edit this paragraph to name 1 or 2 real friction points you saw]

In typical campaign marketplaces, creator onboarding and brand review workflows suffer from high communication latency, ambiguous payment timing, and rigid desktop-only interfaces. Here is how PayPost addresses these friction points:

### Implemented Friction Reducers
- **One-Click Apply with Pitch**: Creators can apply instantly with an optional pitch note directly from the campaign view (`/campaigns/:id`, endpoint: `POST /api/applications`).
- **Creator Upfront Take-Home Pay Preview**: Creators see exact net earnings (after 10% fee, GST, and TDS) on campaign cards before deciding to apply (`/creator/browse`, endpoint: `POST /api/fees/calculate`).
- **Brand Budget Reservation Breakdown**: Brands preview complete tax breakdowns when setting fees during campaign creation (`/brand/campaigns/new`).
- **Brand Action Center**: Aggregates all pending applicants and submissions across every campaign into one prioritized dashboard (`/brand/attention`, endpoint: `GET /api/creator/attention`).
- **Creator Next Actions Strip**: Urgent banner on the creator dashboard displaying deliverables due, active revision notes, and failed withdrawal alerts (`/creator/dashboard`).
- **Deep Links & Tab Focus**: URL parameters (e.g. `?tab=submissions&focus=<id>`) highlight specific submissions or applicants directly from notifications.
- **Duplicate Campaign Utility**: Brands can clone campaign briefs with one click to re-run successful campaigns (`POST /api/campaigns/:id/duplicate`).
- **Creator Search, Sort & Fee Filters**: Real-time filtering by minimum take-home fee and search with regex-safe sanitization (`/creator/browse`).
- **Quick-Feedback Note Chips**: Preset feedback chips ("Need better lighting", "Product logo not clear") speed up revision and rejection reviews (`BrandSubmissionsTab.jsx`).
- **Deadline Urgency Badges**: Visual countdown chips ("Due today", "Overdue") prioritize pending deliverables.
- **One-Tap Withdrawal & Retry**: Pre-filled UPI VPAs and instant "Try again" buttons for failed withdrawals (`/creator/wallet`).
- **Transparent Notification Audit Log**: Notification center displays delivery status, explaining why messages were delayed for quiet hours or dropped due to opt-out (`/creator/notifications`).

### Not Implemented (And Why)
- **Auto-Approval of Inactive Deliverables**: Auto-approving work after 7 days of brand silence was omitted to prevent unreviewed deliverable payouts without explicit human confirmation.
- **Automated Deadline Expiry Worker**: Automatically canceling approved creators who miss submission deadlines requires a scheduled cron manager and could penalize creators facing valid brand delays.
- **Bulk Application Approval**: Multi-select approvals introduce complex partial-failure race conditions when remaining budget only covers a subset of selected creators.
- **Real WhatsApp & Email Gateway**: Kept as deterministic mock providers per assignment specifications to avoid external third-party API credentials.

---

## 8. PART 4: Known Gaps

- **G1: No Auto-Expiry for Overdue Deliverables**: Approved creators who never submit remain in `approved` status, tying up reserved budget until the brand manually cancels the campaign.
- **G2: Mock Payment & Messaging Providers**: UPI payouts, Emails, and WhatsApp messages are simulated in memory; production requires integrations like RazorpayX/Cashfree and Twilio/Gupshup.
- **G3: Platform & Tax Accounting Ledger Entries**: Platform fee, GST, and TDS are saved on the submission breakdown snapshot, but are not credited to dedicated company or tax wallet accounts.
- **G4: No External UPI Validation**: UPI IDs are checked for format regex (`user@bank`), but are not verified against real NPCI bank routing APIs prior to withdrawal initiation.
- **G5: LocalStorage JWT Authentication**: Access tokens are stored in browser `localStorage`. A production architecture should use `httpOnly` secure cookies with token rotation to prevent token exfiltration via XSS.
- **G6: No Rate Limiting on Public Endpoints**: Login and registration endpoints do not have IP-based rate limiting (e.g. `express-rate-limit`), leaving them susceptible to brute-force attempts.
- **G7: Mock Instagram Post Verification**: The system verifies Instagram URL format and ensures unique posts per campaign, but cannot verify if the post exists or contains required brand hashtags.
- **G8: Simplified Notification Preferences**: Users can toggle entire channels (Email/WhatsApp), but cannot configure granular per-event notification preferences.
- **G9: Single Polling Worker Architecture**: Background workers poll MongoDB every few seconds. In high-throughput distributed production environments, dedicated distributed task queues like Redis BullMQ or AWS SQS are recommended.
- **G10: Developer Tools Mounted in Codebase**: Phase 8 time-shift testing tools exist in `dev.routes.js`. While guarded by `ENABLE_DEV_TOOLS=true`, they should be decoupled from production builds.

---

## 9. Tests

The build is covered by 15 test suites and 203 automated tests covering money conservation, state machine races, withdrawal reconciliation, and quiet hours scheduling.

To run the three riskiest test groups:
```bash
# Money In: Fee calculation, atomic reservation, settlement
npm run test:risky:money

# State Machine: Two-phase status transitions and concurrency races
npm run test:risky:state

# Money Out & Messaging: Withdrawals, reconciliation, quiet hours
npm run test:risky:out

# All Risky Tests Together
npm run test:risky
```

For complete invariant definitions, testing methodology, and code coverage breakdowns, see [docs/TESTING.md](file:///d:/PayPost/docs/TESTING.md).

---

## 10. AI Usage Disclosure

- **Claude**: Used for high-level architecture planning, reviewing edge-case state machines, and generating phase prompts.
- **Antigravity**: Used as the agentic coding environment to generate, refactor, and audit full codebase implementations across Phases 1 to 10.
- **Manual Verification**: Every phase was manually inspected, built, and verified in Google Chrome (mobile viewport and desktop) and backed by automated Jest test suites.
- Detailed logs and prompt templates can be found in [docs/ai-logs/](file:///d:/PayPost/docs/ai-logs/).
