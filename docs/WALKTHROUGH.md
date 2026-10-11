# PayPost Live Call Cheat Sheet & Architecture Walkthrough

This document is your preparation guide for the live technical review. It explains how the code is structured, walks through every critical flow line by line, provides a 5-minute live demo script, and lists answers to expected architectural questions.

---

## 1. One-Page Architecture

```
Client (React SPA)
       │
       ▼ (HTTP JSON / Bearer JWT)
Express Middleware (cors, express.json, auth.middleware, roleGuard, validate(Zod))
       │
       ▼
Controllers (req/res translation, HTTP status mapping)
       │
       ▼
Services (Business logic, ACID transactions with withTransaction(session))
       │
       ├── Models (Mongoose Schemas & Pre-save validations)
       │      │
       │      ▼
       │   MongoDB Database (Replica Set ACID Transactions)
       │
       └── Jobs / Polling Workers (Atomic Claim -> Process -> Reconcile)
              ├── withdrawalWorker.js (Every 3s)
              └── notificationWorker.js (Every 5s)
```

### Request Lifecycle
1. **Route Definition** (`src/routes/*.js`): Defines endpoint path, attaches authentication middleware and validation schema.
2. **Middleware** (`src/middleware/auth.middleware.js`): Verifies JWT from `Authorization: Bearer <token>`, looks up user, attaches `req.user`.
3. **Validation** (`src/middleware/validate.js`): Uses Zod schemas to sanitize and validate `req.body` or `req.query` before the controller is reached.
4. **Controller** (`src/controllers/*.js`): Extracts parameters, calls service layer, formats response JSON with standard status codes (`200`, `201`, `400`, `404`, `409`).
5. **Service Layer** (`src/services/*.js`): Houses all business rules. Multi-document changes wrap operations inside `withTransaction(async (session) => { ... })`.
6. **Background Workers** (`src/jobs/*.js`): Started inside `src/server.js` when `WORKER_ENABLED=true`. Workers atomically claim pending jobs (`$set: { status: 'processing' }`) to ensure multiple worker threads never duplicate executions.

---

## 2. Critical Flows: Code Breakdown

### Flow 1: Auth & Role Guard
- **Files**: `src/controllers/auth.controller.js`, `src/middleware/auth.middleware.js`, `src/middleware/roleGuard.js`.
- **Functions**:
  - `authController.signup`: Hashes password with `bcryptjs` and creates `User`. A fixed `role` (`'brand'` or `'creator'`) is chosen at signup. If creator, auto-creates `Wallet` (`balancePaise: 0, heldPaise: 0`).
  - `authMiddleware`: Extracts Bearer token, verifies using `jwt.verify(token, JWT_SECRET)`.
  - `roleGuard(...roles)`: Verifies `req.user.role`. Returns HTTP 403 if unauthorized.

### Flow 2: Campaign Creation & Rules
- **Files**: `src/services/campaign.service.js`, `src/models/Campaign.js`.
- **Functions**:
  - `campaignService.create`: Validates that `submissionDeadline > applicationDeadline`, `budgetPaise > 0`, `slots > 0`, and `budgetPaise >= perCreatorFeePaise`. Sets `reservedPaise: 0`, `paidOutPaise: 0`, `approvedCount: 0`.
  - `campaignService.updateCampaign`: If creators are already approved, enforces that budget cannot decrease below `reservedPaise + paidOutPaise` and slots cannot decrease below `approvedCount`.
  - `campaignService.cancel`: Checks if any submission is pending review (`submitted` or active `revision_requested`). If work is in progress, rejects with HTTP 409. If clear, transitions to `cancelled`, freeing unspent reservations.

### Flow 3: Application Submission & Withdrawal
- **Files**: `src/services/application.service.js`.
- **Functions**:
  - `applicationService.applyToCampaign`: Checks creator hasn't already applied. Creator can re-apply only if prior application was `withdrawn` from `applied` status before the deadline.
  - `applicationService.withdrawApplication`: Creator can withdraw before deliverable is submitted. If status was `applied`, simply marks `withdrawn`. If creator was already `approved`, atomically decrements `approvedCount` and releases `reservedPaise` back to campaign.

### Flow 4: Application Approval (Atomic Slot & Budget Reservation)
- **Files**: `src/services/application.service.js` (`approveApplication`).
- **Why it matters**: Protects against concurrent approval race conditions without read-then-write locks.
- **Code Logic**:
  ```javascript
  // Atomically claim slot & reserve budget in ONE query
  const updatedCampaign = await Campaign.findOneAndUpdate(
    {
      _id: campaignId,
      status: CAMPAIGN_STATUS.ACTIVE,
      approvedCount: { $lt: campaign.slots },
      $expr: {
        $gte: [
          { $subtract: ["$budgetPaise", { $add: ["$reservedPaise", "$paidOutPaise"] }] },
          feePaise
        ]
      }
    },
    {
      $inc: { approvedCount: 1, reservedPaise: feePaise }
    },
    { new: true, session }
  );
  ```
  If another request claimed the last slot or budget in parallel, `updatedCampaign` returns `null` and throws HTTP 409 Conflict.

### Flow 5: Deliverable Submission & Mutual Exclusion
- **Files**: `src/services/submissionService.js` (`submitDeliverable`).
- **Why it matters**: A creator cannot withdraw an application and submit a deliverable simultaneously.
- **Code Logic**: Validates Instagram URL regex. Uses atomic update on `Application` checking `status: APPROVED`. Creates `Submission` in `submitted` state and sets `version: 1`. Deduplicates URL per campaign to avoid shared links.

### Flow 6: Deliverable Review & Payout Settlement
- **Files**: `src/services/submissionService.js` (`approveSubmission`, `requestRevision`, `rejectSubmission`).
- **Functions**:
  - `requestRevision`: Increments `revisionCount`. Enforces cap of 2 revisions max. Mandatory feedback note. Sets `revisionDueAt = max(submissionDeadline, now + 48h)`.
  - `rejectSubmission`: Rejection is final. Frees the slot (`approvedCount - 1`) and releases `reservedPaise` back to campaign budget.
  - `approveSubmission`:
    1. Locks submission into `approved` state.
    2. Computes tax breakdown via `feeCalculator.calculate(feePaise)`.
    3. Saves immutable snapshot `payoutBreakdown` directly on submission.
    4. Transitions campaign money: `reservedPaise -= fee`, `paidOutPaise += fee`.
    5. Calls `walletService.creditPayout` inside same session.

### Flow 7: Fee Calculation & Wallet Ledger
- **Files**: `src/services/feeCalculator.js`, `src/services/walletService.js`.
- **Functions**:
  - `feeCalculator.calculate`:
    - `platformFee = round(gross * 0.10)`
    - `gst = round(platformFee * 0.18)`
    - `tds = round((gross - platformFee - gst) * 0.01)`
    - `net = gross - platformFee - gst - tds`
    - Invariant: `platformFee + gst + tds + net === gross` (zero fractional leakage).
  - `walletService.creditPayout`:
    - Idempotency check using `idempotencyKey: 'payout:<submissionId>'`.
    - Creates immutable `LedgerEntry` (`type: 'payout_credit'`, `direction: 'credit'`).
    - Atomically increments cached `balancePaise` on `Wallet`.

### Flow 8: Withdrawal Request, Hold, Worker & Reconcile
- **Files**: `src/services/withdrawalService.js`, `src/jobs/withdrawalWorker.js`.
- **Two-Phase Pattern**:
  - **Phase 1 (Request)**: Minimum ₹100. Enforces partial unique index for active withdrawal. Inside DB transaction: shifts amount from `balancePaise` to `heldPaise`, creates `LedgerEntry` (`withdrawal_hold`, `debit`), marks withdrawal `pending`.
  - **Phase 2 (Worker execution)**: `withdrawalWorker` polls pending withdrawals. Sets `processing`. Calls mock payout provider **outside** database transaction.
  - **Finalize Success**: Marks `succeeded`, decrements `heldPaise`, clears `isActive`.
  - **Finalize Failure**: Marks `failed`, shifts `heldPaise` back to `balancePaise`, creates `LedgerEntry` (`withdrawal_reversal`, `credit`), clears `isActive`.
  - **Reconcile**: If server crashes while a withdrawal is in `processing` state for >60s, worker automatically checks provider status using idempotency key and recovers state.

### Flow 9: Transactional Notification Outbox & Quiet Hours
- **Files**: `src/services/notificationService.js`, `src/utils/quietHours.js`, `src/jobs/notificationWorker.js`.
- **Functions**:
  - `notify`: Inserts `NotificationJob` inside the same Mongoose session as the trigger event. Evaluates `isQuietHours(now)` in IST (+5:30). If quiet (9 PM - 9 AM IST), sets `scheduledFor` to 9:00:00 AM IST of the next allowed window.
  - `notificationWorker`: Claims jobs where `scheduledFor <= now` and `status: 'pending'`. Re-verifies quiet hours and channel preferences (`optOuts`). Dispatches to mock Email/WhatsApp.

---

## 3. 5-Minute Live Demo Script

Follow this script to demonstrate the complete lifecycle during the live call:

1. **Log in as Brand** (`brand@demo.com` / `Password123!`):
   - Navigate to **Brand Dashboard**.
   - Show active campaigns and click **+ New Campaign**.
   - Fill in details: Fee ₹2,000, Slots 3, Budget ₹4,000 (note the warning: "Budget funds 2 of 3 creators"). Point out the live fee preview.
   - Publish campaign.
2. **Log in as Creator 1** (`creator1@demo.com` / `Password123!` in incognito window):
   - Go to **Browse Campaigns**.
   - Point out the clear take-home pay card: *"Gross ₹2,000 -> Net ₹1,746 (₹200 fee + ₹36 GST + ₹18 TDS)"*.
   - Click **Apply**, enter a short pitch, and submit.
3. **Log in as Creator 2** (`creator2@demo.com` / `Password123!`):
   - Apply to the same campaign.
4. **Switch back to Brand**:
   - Go to **Action Center** (`/brand/attention`).
   - Show the two pending applicants grouped on one screen.
   - Approve both Creator 1 and Creator 2.
   - Point out: Campaign budget reserved is now ₹4,000 / ₹4,000. All slots funded.
5. **Switch to Creator 1**:
   - Notice **Next Actions** banner: *"Deliverable due for Summer Campaign"*.
   - Click **Submit Deliverable**, paste Instagram link: `https://www.instagram.com/p/demo1234/`.
6. **Switch to Brand**:
   - Click into campaign submissions.
   - Click **Request Revision**, select quick note chip *"Need better lighting"*, and confirm.
7. **Switch to Creator 1**:
   - Notice revision alert and feedback note.
   - Resubmit with updated link: `https://www.instagram.com/p/demo1234_v2/`.
8. **Switch to Brand**:
   - Click **Approve Submission**.
9. **Show the Money Conservation & Ledger**:
   - Switch to Creator 1's **Wallet** (`/creator/wallet`).
   - Balance shows ₹1,746.36.
   - Open **Ledger History**: Show immutable `payout_credit` entry with reference to the submission ID.
   - Initiate a withdrawal of ₹1,000 to `success@mock`.
   - Point out that ₹1,000 moves immediately to `heldPaise`, leaving ₹746.36 available.
   - Wait 4 seconds for worker log: Status changes to `Succeeded`.
   - Request another withdrawal of ₹500 to `fail@mock`.
   - Watch the worker fail and immediately refund ₹500 back to available balance with a `withdrawal_reversal` ledger entry.

---

## 4. Likely Technical Questions & Answers

1. **Q: What happens if two brand managers approve different creators at the exact same millisecond?**
   - *A*: Handled in `application.service.js` (`approveApplication`). We use a single conditional `Campaign.findOneAndUpdate` where the check `approvedCount < slots` and budget availability are part of the query criteria. MongoDB replica set executes document updates atomically; one update succeeds, the other gets `null` and throws HTTP 409 Conflict.

2. **Q: What happens if the server crashes after calling the payout provider?**
   - *A*: Covered in `withdrawalWorker.js` (`reconcileStuckWithdrawals`). Because the provider call is assigned an idempotency key before dispatch, any withdrawal stuck in `processing` state for >60s is polled by the worker. The worker queries the provider with the idempotency key and completes or reverses the transaction safely.

3. **Q: Why integer paise instead of floating point rupees?**
   - *A*: IEEE 754 floating-point numbers cannot accurately represent decimal fractions like `0.1` and `0.2`. In financial systems, accumulating rounding errors leak money. Using integer paise (`10000 paise = ₹100.00`) eliminates floating-point inaccuracy.

4. **Q: Why is the ledger immutable?**
   - *A*: `LedgerEntry.js` has Mongoose schema pre-hooks blocking `updateOne`, `updateMany`, and `deleteOne`. Double-entry accounting requires that history is never rewritten. If a correction is needed, a compensatory entry (such as `withdrawal_reversal`) is appended.

5. **Q: How do you prevent double payouts on deliverable approval?**
   - *A*: In `walletService.js` (`creditPayout`), an `idempotencyKey` formatted as `payout:<submissionId>` is recorded on the `LedgerEntry`. Additionally, `Submission` status transition from `submitted` to `approved` is guarded by an atomic state query.

6. **Q: Why do notifications use an outbox pattern?**
   - *A*: Dual-write problem: if you make a database change and call an external email/SMS API directly, an error or network drop creates inconsistency (either DB commits and notification fails, or notification sends and DB rolls back). With an outbox, `NotificationJob` is inserted in the exact same ACID transaction as the business change.

7. **Q: How do you test quiet hours during the daytime?**
   - *A*: In `services/clock.js` and `dev.routes.js`, there is a simulated virtual clock offset (`setOffsetMs`). When `ENABLE_DEV_TOOLS=true`, test scripts can shift system time into nighttime (e.g. 11 PM IST) to verify scheduling without waiting for actual night hours.

8. **Q: Why return HTTP 404 instead of 403 when a brand accesses another brand's resource?**
   - *A*: Information disclosure protection. Returning 403 confirms to an attacker that an ID exists in the database. Returning 404 makes non-owned resources completely invisible.

9. **Q: What would you change with more time?**
   - *A*: Move from MongoDB polling workers to Redis-backed queues (BullMQ), implement httpOnly cookie sessions with refresh tokens, and integrate live RazorpayX / Twilio webhooks.

10. **Q: What is the weakest part of the codebase?**
    - *A*: The background worker architecture relies on polling every few seconds (`setInterval`). In a high-traffic production system with tens of thousands of simultaneous users, polling queries place unnecessary read load on the database. A dedicated pub/sub or event-driven queue would be required.

---

## 5. Live Code Modification Cheatsheet

If the reviewers ask you to change configuration values live:

- **Change Fee Percentages (e.g. Platform Fee to 15% or GST to 12%)**:
  - File: `backend/src/constants/index.js` (Lines 18–25)
  - Variable: `FEE_CONFIG.PLATFORM_FEE_PERCENT`, `FEE_CONFIG.GST_PERCENT`.
- **Change Maximum Allowed Revisions (e.g. from 2 to 3)**:
  - File: `backend/src/constants/index.js` (Line 23)
  - Variable: `SUBMISSION_LIMITS.MAX_REVISIONS = 3`.
- **Change Quiet Hours Window (e.g. 10 PM to 8 AM)**:
  - File: `backend/src/constants/index.js` (Line 30)
  - Variables: `QUIET_HOURS.START_HOUR_IST = 22`, `QUIET_HOURS.END_HOUR_IST = 8`.
- **Change Minimum Withdrawal Amount (e.g. to ₹500)**:
  - File: `backend/src/constants/index.js` (Line 27)
  - Variable: `MIN_WITHDRAWAL_PAISE = 50000`.
- **Add a New Notification Event**:
  1. Add event key to `NOTIFICATION_EVENTS` in `src/constants/index.js`.
  2. Add template text generator to `src/services/notificationTemplates.js`.
  3. Call `notificationService.notify({ recipientId, event, payload, session })` in the relevant service function.
- **Add a New Field to Campaign Schema (e.g. `category`)**:
  1. Add field definition to `backend/src/models/Campaign.js`.
  2. Add validation rule to `backend/src/schemas/campaign.schemas.js`.
  3. Include in frontend form `frontend/src/pages/BrandNewCampaignPage.jsx`.
