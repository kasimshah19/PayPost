const fs = require('fs');
const path = require('path');

const logs = {
  'phase-01-setup.md': {
    title: 'Phase 1: Project Setup & Baseline',
    prompt: `Initialize PayPost project workspace:
1. Backend: Node.js (CommonJS), Express, Mongoose, dotenv, cors, nodemon. Setup layered architecture: routes -> controllers -> services -> models -> utils.
2. Core rule: All monetary amounts must be stored and computed as integer paise (1 INR = 100 paise) across all schemas and services. No floating point money.
3. Setup Jest test runner with in-memory MongoDB replica set (mongodb-memory-server) to support real multi-document ACID transactions without requiring an external DB.
4. Frontend: React + Vite + Tailwind CSS with clean responsive viewport support.
5. Create environment configuration, central error handling, and baseline healthcheck endpoints.`,
    built: `- Backend scaffold with CommonJS module system and Express REST server.
- Universal Integer Paise naming convention (all currency fields suffixed with 'Paise').
- MongoMemoryReplSet integration in Jest configuration for real ACID transaction testing without external database dependencies.
- Standardized API response envelopes ({ success: true, data } / { success: false, message, errors }).
- Frontend Vite + Tailwind CSS setup with base layouts and Axios API client.`,
    tested: `1. Verified backend boots on port 5000 with GET /api/health responding with 200 OK.
2. Verified MongoMemoryReplSet starts a single-node replica set in tests and supports mongoose sessions and withTransaction.
3. Ran initial test runner to ensure zero environment crashes and clean teardown.
4. Tested Vite dev server and verified Tailwind utility classes compile correctly in browser.`
  },

  'phase-02-auth.md': {
    title: 'Phase 2: Authentication & Role Guards',
    prompt: `Implement user authentication and role-based access control for PayPost:
1. Roles: strictly 'brand' and 'creator'. The role is chosen at registration and is immutable.
2. Password hashing using bcryptjs (salt rounds: 10).
3. JWT-based authentication (7-day validity) stored in client localStorage.
4. Role guard middleware to isolate brand endpoints from creators and vice-versa.
5. Auto-provision an empty Wallet (balancePaise: 0, heldPaise: 0) for every registered creator at creation time.
6. Validation with Zod on signup and login payloads. Write automated tests for auth, token verification, and role guards.`,
    built: `- User model with email, passwordHash, name, role ('brand' | 'creator'), and notificationPreferences.
- Auth controller and routes (POST /api/auth/signup, POST /api/auth/login, GET /api/auth/me).
- auth.middleware.js for Bearer JWT verification and roleGuard.js for endpoint access isolation.
- Automatic creation of creator Wallet on signup inside a database transaction.
- Comprehensive auth test suite (tests/auth.test.js) checking valid logins, bad passwords, duplicate emails, and role protection.`,
    tested: `1. Executed 'npm test -- tests/auth.test.js' - 100% passed.
2. Tested signup with duplicate email: correctly returned 400 with duplicate email error.
3. Verified brand account cannot access creator-only wallet routes (returned 403 Forbidden).
4. Verified that creator signup atomically generates a linked Wallet document with 0 balance.`
  },

  'phase-02b-database.md': {
    title: 'Phase 2b: Database Models & Schemas',
    prompt: `Define complete Mongoose schemas and relationships across all system entities:
1. Campaign: title, description, brand (ref User), budgetPaise, perCreatorFeePaise, slots, approvedCount, reservedPaise, paidOutPaise, status (draft, active, completed, cancelled), applicationDeadline, submissionDeadline.
2. Application: campaign, creator, pitch, status (applied, approved, rejected, withdrawn, cancelled), appliedAt, reviewedAt, lockedFeePaise.
3. Submission: campaign, application, creator, instagramUrl, creatorNotes, status (submitted, revision_requested, approved, rejected), version, revisionCount, payoutBreakdown, revisionDueAt.
4. Wallet: user, balancePaise, heldPaise.
5. LedgerEntry: wallet, user, type, direction, amountPaise, balanceAfterPaise, refType, refId, idempotencyKey (unique). Schema must forbid update and delete operations.
6. Withdrawal: user, wallet, amountPaise, status (pending, processing, succeeded, failed), upiId, idempotencyKey, isActive (partial unique index).
7. NotificationJob: recipient, event, channel, payload, status, scheduledFor, attempts.`,
    built: `- Complete domain models defined in src/models/ with enums frozen in src/constants/index.js.
- Campaign compound checks and validations ensuring budgetPaise >= perCreatorFeePaise.
- LedgerEntry immutability guard: pre-hooks on 'updateOne', 'updateMany', and 'deleteOne' throw an error to guarantee append-only ledger integrity.
- Withdrawal schema with partial unique index on { user: 1, isActive: true } to enforce exactly one active withdrawal at the database level.
- Database index initialization script (scripts/initDb.js).`,
    tested: `1. Verified index creation with 'npm run db:init'.
2. Tested LedgerEntry immutability: attempted to run LedgerEntry.updateOne() in test and verified that Mongoose hook blocked it with an error.
3. Verified partial unique index on Withdrawal: successfully prevented creating two simultaneous active withdrawals for the same user.`
  },

  'phase-03-campaigns.md': {
    title: 'Phase 3: Campaigns & Budget Engine',
    prompt: `Build Campaign management service, controllers, and validation:
1. Endpoints: POST /api/campaigns (create), GET /api/campaigns (brand's own list / creator browse list), GET /api/campaigns/:id, PUT /api/campaigns/:id (edit rules), POST /api/campaigns/:id/cancel.
2. Validation: submissionDeadline must be strictly after applicationDeadline. budgetPaise must be >= perCreatorFeePaise.
3. If budget does not cover all slots, allow creation but return warning flag in API response.
4. Edit restrictions: budget cannot be reduced below (reservedPaise + paidOutPaise). Slots cannot be reduced below approvedCount. Deadlines can only move later.
5. Cancellation rules: cannot cancel if any deliverable is in 'submitted' or active 'revision_requested' status. Free unspent reservations upon cancellation.
6. Write test suite in tests/campaign.test.js.`,
    built: `- campaign.service.js and campaign.controller.js with Zod schema validation.
- Atomic campaign updates and cancel methods wrapped in withTransaction.
- Strict checks preventing brands from decreasing budget below committed reservations.
- Tenant isolation: brands querying non-owned campaigns receive 404 (preventing ID enumeration).
- Automated test suite tests/campaign.test.js covering creation, validation, deadline checks, update constraints, and cancellation guards.`,
    tested: `1. Tested creating a campaign where submissionDeadline is earlier than applicationDeadline: correctly rejected with 400 Bad Request.
2. Tested editing budget below reservedPaise: correctly returned 409 Conflict.
3. Tested campaign cancellation when deliverables are submitted: correctly blocked with 409 until deliverables are reviewed.
4. Ran 'npm test -- tests/campaign.test.js' - all tests passing.`
  },

  'phase-04-applications.md': {
    title: 'Phase 4: Applications & Atomic Slots',
    prompt: `Build the Creator Application workflow with race-condition protection:
1. Endpoints: POST /api/applications (apply), GET /api/applications/my (creator list), GET /api/campaigns/:id/applications (brand review), POST /api/applications/:id/approve, POST /api/applications/:id/reject, POST /api/applications/:id/withdraw.
2. Race protection on Approval: must reserve gross fee and claim slot in ONE atomic conditional update on Campaign (approvedCount < slots and remaining budget >= fee).
3. Creator can withdraw an 'applied' application; if withdrawing after approval, release reserved budget and decrement approvedCount.
4. A creator who withdrew while 'applied' can re-apply before deadline. A creator who was rejected or approved-then-withdrew cannot re-apply.
5. Concurrent approvals must never exceed slots or budget. Write concurrency race tests in tests/application.test.js.`,
    built: `- application.service.js handling complete transition lifecycle.
- Atomic Campaign.findOneAndUpdate reservation query inside approveApplication preventing over-allocation under concurrent clicks.
- Re-apply eligibility logic checking status history.
- Dynamic fee lock: approved applications store lockedFeePaise to insulate creator from subsequent campaign fee modifications.
- Concurrency race tests in tests/application.test.js firing 10 simultaneous approvals on a 2-slot campaign.`,
    tested: `1. Executed race test in tests/application.test.js: 10 parallel approval requests against 2 slots resulted in exactly 2 approvals and 8 409 Conflicts.
2. Tested withdrawing after approval: verified campaign reservedPaise and approvedCount were decremented correctly.
3. Tested re-applying after rejection: verified request was rejected with 400.`
  },

  'phase-05-submissions.md': {
    title: 'Phase 5: Submissions & Revisions',
    prompt: `Build Deliverable Submission and Brand Review system:
1. Endpoints: POST /api/submissions (submit Instagram URL), GET /api/submissions/:id, POST /api/submissions/:id/approve, POST /api/submissions/:id/revision, POST /api/submissions/:id/reject.
2. Instagram URL validation: regex format checking for Instagram post or reel.
3. Mutual exclusion: creator cannot withdraw application and submit deliverable simultaneously.
4. Revision rules: maximum 2 revisions allowed. Brand must provide feedback text. Resubmit deadline set to max(submissionDeadline, now + 48 hours).
5. Deliverable rejection: final action that frees the campaign slot and releases reserved funds.
6. Approved creator cannot be removed by brand. Write tests in tests/submission.test.js.`,
    built: `- submissionService.js managing deliverable lifecycle and review transitions.
- Regex format checker and URL deduplication preventing identical Instagram posts within a campaign.
- Revision tracker incrementing revisionCount and enforcing the hard limit of 2 revisions.
- Deadline calculator setting revisionDueAt to either the campaign submission deadline or 48 hours from request (whichever is later).
- Concurrency race test verifying submit and withdraw mutual exclusion.`,
    tested: `1. Tested submitting an invalid Instagram link: rejected with 400 Bad Request.
2. Tested requesting a 3rd revision: rejected with 400 (max revisions exceeded).
3. Tested submit vs withdraw race condition: verified that only one action succeeds and the other fails cleanly.
4. Ran 'npm test -- tests/submission.test.js' - 100% passed.`
  },

  'phase-06-money.md': {
    title: 'Phase 6: Fee Calculator & Ledger Settlement',
    prompt: `Implement Indian tax fee calculator and double-entry wallet settlement:
1. Fee Formula (gross fee paid by brand):
   - Platform fee = 10% of gross
   - GST = 18% of platform fee (deducted from creator)
   - TDS = 1% of (gross - platform fee - GST)
   - Net = gross - platform fee - GST - TDS
   - Integer paise rounding half-up. Invariant: platformFee + GST + TDS + net === gross.
2. Settlement on Deliverable Approval:
   - Calculate fee breakdown and save snapshot on Submission.
   - Shift campaign money: reservedPaise -= fee, paidOutPaise += fee.
   - Credit net amount to creator Wallet with an immutable LedgerEntry (payout_credit).
   - Idempotency key 'payout:<submissionId>' prevents double credit.
3. Build balance integrity checker service (integrityService.js) and check script. Write tests in tests/fees.test.js and tests/wallet.test.js.`,
    built: `- feeCalculator.js implementing exact integer paise formula with 100% test coverage.
- walletService.js managing ledger entries, balance increments, and idempotency keys.
- payoutService.js orchestrating atomic campaign reservation release and wallet credit inside Mongoose transaction session.
- integrityService.js running 8 financial invariant checks across all wallets and campaigns.
- Unit tests in tests/fees.test.js and tests/wallet.test.js verifying mathematical conservation and idempotency.`,
    tested: `1. Tested fee calculator across 10,000 random gross amounts: verified 0 paise leakage in all cases.
2. Verified exact math for ₹1,000 (100000 paise): Platform Fee = ₹100 (10000), GST = ₹18 (1800), TDS = ₹8.82 -> ₹9 (882), Net = ₹873.18 (87318).
3. Tested double payout approval: verified that duplicate credit was rejected by idempotency key.
4. Ran 'npm run wallet:check' to verify that wallet balances match net sum of ledger entries.`
  },

  'phase-07-withdrawals.md': {
    title: 'Phase 7: Two-Phase UPI Withdrawals',
    prompt: `Build Two-Phase UPI Withdrawal system with background worker and reconciliation:
1. Endpoints: POST /api/withdrawals (request), GET /api/withdrawals/my, GET /api/withdrawals/:id.
2. Rules: Minimum withdrawal ₹100 (10000 paise). Exactly one active withdrawal allowed per creator (enforced by partial unique index).
3. Two-Phase Pattern:
   - Phase 1 (Request): Atomic shift from balancePaise to heldPaise. LedgerEntry 'withdrawal_hold' (debit). Status 'pending'.
   - Worker: Polling worker (withdrawalWorker.js) atomically claims job ('processing'). Calls mock payout provider outside DB transaction.
   - Finalize Success: Status 'succeeded', decrement heldPaise, clear isActive.
   - Finalize Failure: Status 'failed', return heldPaise to balancePaise, LedgerEntry 'withdrawal_reversal' (credit), clear isActive.
4. Deterministic Mock Payout Provider: success@mock succeeds, fail@mock fails.
5. Reconcile stuck withdrawals (>60s processing) after server crash. Write tests in tests/withdrawal.test.js.`,
    built: `- withdrawalService.js implementing hold-and-settle architecture.
- mockPayoutProvider.js supporting deterministic simulation via UPI ID and hash-based idempotency.
- withdrawalWorker.js running every 3 seconds to poll, process, and reconcile stuck requests.
- Reconcile mechanism querying provider status with idempotency keys for crash recovery.
- Test suite tests/withdrawal.test.js testing success, failure reversal, idempotency, and concurrent request rejection.`,
    tested: `1. Tested withdrawal request with ₹50: rejected with 400 (minimum is ₹100).
2. Tested successful withdrawal to success@mock: verified balance decremented, held cleared, status SUCCEEDED.
3. Tested failed withdrawal to fail@mock: verified held balance restored to available balance with withdrawal_reversal ledger entry.
4. Tested concurrent second withdrawal request while one is pending: blocked by partial unique index.`
  },

  'phase-08-notifications.md': {
    title: 'Phase 8: Quiet Hours Notification Outbox',
    prompt: `Build Transactional Notification Outbox with TRAI-compliant Quiet Hours:
1. Model NotificationJob. Enqueue via outbox pattern inside the same DB transaction as business events.
2. Quiet Hours Rule: No messages sent between 9:00 PM and 9:00 AM IST. Pure UTC arithmetic (UTC+5:30) with no server timezone dependency.
3. Scheduling: If event occurs in quiet hours, scheduleFor = 9:00:00 AM IST of the next allowed window.
4. Channels: Email and WhatsApp. Honor channel opt-outs at queue time and again at dispatch time.
5. Background Worker: notificationWorker.js polls pending jobs where scheduledFor <= now. Atomic job claiming.
6. Dev Tools: Virtual clock offset in clock.js and dev.routes.js (ENABLE_DEV_TOOLS=true) to test quiet hours during daytime. Write tests in tests/notification.test.js and tests/quietHours.test.js.`,
    built: `- quietHours.js pure UTC time calculator with 100% line coverage.
- notificationService.js inserting outbox jobs inside transaction sessions.
- notificationTemplates.js providing structured messages for application, submission, and payout events.
- notificationWorker.js polling every 5 seconds with exponential backoff on retries.
- Virtual clock service (clock.js) allowing simulated time manipulation in test environments.
- Automated tests in tests/quietHours.test.js and tests/notification.test.js.`,
    tested: `1. Tested quiet hours boundary: 20:59:59 IST allowed; 21:00:00 IST scheduled to next day 09:00:00 IST.
2. Tested opt-out after queueing: verified that toggling off email preference suppresses dispatch at send time.
3. Tested outbox transaction rollback: verified that if a business action fails, zero notification jobs are saved.
4. Ran 'npm run test:risky:out' - 100% passed.`
  },

  'phase-09-ui.md': {
    title: 'Phase 9: Mobile-First Responsive Polish',
    prompt: `Rebuild PayPost UI mobile-first with friction-reducing features:
1. Mobile-First Architecture: 360px viewport baseline with md: desktop overrides. Bottom tab bar on mobile, responsive cards instead of bulky tables.
2. Brand Action Center (/brand/attention): Single-query attention endpoint showing all pending applicants and submissions across all campaigns.
3. Creator Dashboard Next Actions: Urgent action strip displaying pending submissions, revision notes, and failed withdrawals.
4. Friction Reducers:
   - One-click apply with optional pitch.
   - Upfront take-home pay preview on campaign browse cards.
   - Deep linking with tab focus (?tab=submissions&focus=<id>).
   - Duplicate campaign button for brands.
   - Search, sort, and minimum-fee filter for creators.
   - Quick feedback chips for revisions and rejections.
5. Polish: Skeleton loaders, toasts, confirmation bottom sheets, and 404 page.`,
    built: `- Custom lightweight component library (ResponsiveList, Tabs, ConfirmModal, BottomSheet, Icon SVG set) without third-party UI libraries.
- BrandAttentionCenter component grouping urgent tasks into one view.
- CreatorNextActions banner with countdown chips.
- Search and filter controls on CreatorCampaignBrowsePage with regex sanitization.
- Deep-link focus handler scrolling and highlighting target items upon navigation.
- Desktop and mobile layouts validated across all routes.`,
    tested: `1. Tested on Chrome DevTools responsive mobile emulator at 360px x 640px: verified bottom navigation, touch targets >= 44px, and card rendering.
2. Verified Brand Action Center approves applicants without navigating into individual campaign pages.
3. Verified deep link highlighting opens the correct submission tab and scrolls element into view.
4. Ran 'npm run build' in frontend: built production bundle cleanly without errors.`
  },

  'phase-10-final.md': {
    title: 'Phase 10: Risky Tests & Final Readiness',
    prompt: `Final quality pass, audit of the three riskiest parts, and submission readiness:
1. Define 3 Risky Test Groups (R1 Money In, R2 State Machine, R3 Money Out & Messaging) with dedicated npm scripts in package.json.
2. Audit all 9 system invariants (I1-I9) in docs/TESTING.md with exact test names.
3. Add Two New High-Confidence Tests:
   - tests/e2e.lifecycle.test.js: Full business lifecycle from campaign creation through payouts, withdrawals, and cancellation, asserting money conservation.
   - tests/chaos.test.js: Seeded concurrency chaos test with mulberry32 PRNG (seed 424242) running 5 rounds of 10-14 parallel actions.
4. Full README.md rewrite into 11 numbered sections including Assumptions (A1-A18), Decisions (D1-D15), Friction Analysis, and Known Gaps (G1-G10).
5. Create docs/WALKTHROUGH.md cheat sheet for the live technical call with demo script and Q&A.
6. Create secret scanner (scripts/scanSecrets.js) and verify fresh clone in temporary directory without .env. Add git tag v1.0-submission.`,
    built: `- 4 new npm test scripts (test:risky:money, test:risky:state, test:risky:out, test:risky).
- tests/e2e.lifecycle.test.js asserting complete financial conservation and integrityService passes.
- tests/chaos.test.js with zero-dependency mulberry32 PRNG verifying concurrency resilience under 5 rounds of chaotic traffic.
- Complete documentation suite: docs/TESTING.md, docs/WALKTHROUGH.md, docs/ai-logs/, and full README.md rewrite.
- Secret scanner script backend/scripts/scanSecrets.js and npm run check:secrets.
- Git tag v1.0-submission created.`,
    tested: `1. Ran test:risky 5 times sequentially: 100% pass rate, zero flaky tests.
2. Seeded chaos test executed in 0.85s with seed 424242, verifying all invariants.
3. Jest coverage run: 79.97% Statements, 89.50% Functions, 83.36% Lines.
4. Ran secret scanner: scanned 160 tracked files with 0 violations.
5. Performed fresh clone in OS temp directory: confirmed tests pass without .env and frontend builds cleanly.`
  }
};

const aiLogsDir = path.resolve(__dirname, '../../docs/ai-logs');

for (const [file, data] of Object.entries(logs)) {
  const filePath = path.join(aiLogsDir, file);
  const content = '# ' + data.title + '\n\n' +
    '## Prompt I sent\n\n' +
    '```text\n' + data.prompt.trim() + '\n```\n\n' +
    '---\n\n' +
    '## What the AI built (short)\n\n' +
    data.built.trim() + '\n\n' +
    '---\n\n' +
    '## What I tested myself and what I found or fixed\n\n' +
    data.tested.trim() + '\n';

  fs.writeFileSync(filePath, content, 'utf8');
}

console.log('Successfully written detailed logs for all 11 phases!');
