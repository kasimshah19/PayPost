# Phase 8: Transactional Notification Outbox & TRAI-Compliant IST Quiet Hours

## Prompt I sent

```text
Build a Transactional Notification Outbox with TRAI-compliant Quiet Hours scheduling:
1. Transactional Outbox Pattern:
   - When a business event occurs (application approved, deliverable submitted, revision requested, payout credited, withdrawal succeeded/failed), do NOT call external notification APIs directly.
   - Insert a NotificationJob document inside the EXACT SAME database transaction session as the business state change.
   - If the business transaction commits, the message is guaranteed to exist. If it aborts, no ghost notification is sent.
2. TRAI-Compliant Quiet Hours (India Standard Time):
   - In accordance with Telecom Regulatory Authority of India (TRAI) guidelines, promotional and marketplace notifications must NOT be delivered to users between 9:00 PM and 9:00 AM IST.
   - Implement pure UTC time arithmetic in src/utils/quietHours.js (IST = UTC + 5:30 = 330 minutes).
   - NEVER use local server getHours() or timezone-dependent libraries.
   - Rule: If event timestamp falls inside 21:00:00 - 08:59:59 IST, set scheduledFor = 09:00:00.000 IST of the next allowed morning.
3. Multi-Channel Support & Dynamic Opt-Out:
   - Channels: Email and WhatsApp.
   - Check user channel preferences at queue time AND re-check at send time.
   - If user opted out after the message was enqueued, drop the message cleanly at send time without error.
4. Background Worker (notificationWorker.js):
   - Polls jobs where status == 'pending' and scheduledFor <= now every 5 seconds.
   - Atomically claims jobs (status -> 'processing').
   - Dispatches via mockEmailProvider and mockWhatsappProvider.
   - Handles retries with exponential backoff (max 3 attempts). Retries must NEVER be scheduled during quiet hours.
5. Developer Tools & Time Shifting:
   - Provide virtual clock service (src/services/clock.js) and routes (src/routes/dev.routes.js) mounted only when ENABLE_DEV_TOOLS=true, allowing test suites to simulate nighttime without waiting for 9 PM.
6. Write tests in tests/quietHours.test.js and tests/notification.test.js.
```

---

## What the AI built (Detailed Architecture & Implementation)

### 1. Pure UTC Quiet Hours Calculator (`src/utils/quietHours.js`)
- **`isQuietHours(date)`**:
  - Adds 330 minutes (5 hours 30 mins) to UTC timestamp.
  - Checks IST hour: `hour >= 21 || hour < 9`.
  - Evaluates `21:00:00` as quiet and `09:00:00` as allowed.
- **`nextAllowedSendTime(date)`**:
  - If not quiet hours: returns current date.
  - If quiet hours: calculates exact `09:00:00.000 IST` (converted to UTC timestamp) for the next allowed window across month and year boundaries.

### 2. Transactional Outbox Service (`src/services/notificationService.js`)
- **`notify({ recipientId, event, payload, session, dedupeRefId })`**:
  - Fetches recipient preferences.
  - Evaluates `isQuietHours(now)`. If quiet, schedules for `nextAllowedSendTime(now)`.
  - Inserts `NotificationJob` records inside the passed Mongoose session.
  - Deduplication via `$setOnInsert` prevents duplicate event creation.

### 3. Background Notification Worker (`src/jobs/notificationWorker.js`)
- Polls pending jobs where `scheduledFor <= now` every 5 seconds.
- Atomically claims batch using `findOneAndUpdate`.
- Re-checks quiet hours at dispatch time (ensuring daylight validity).
- Re-checks recipient channel opt-out settings at dispatch time.
- Dispatches to `mockEmailProvider` and `mockWhatsappProvider`.

### 4. Dev Tools Virtual Clock (`src/services/clock.js`)
- Centralized `clock.now()` wrapper allowing `setOffsetMs()` and `resetClock()`.
- Guarded by `ENABLE_DEV_TOOLS=true` environment flag.

### 5. Automated Tests
- `tests/quietHours.test.js`: 22 tests verifying boundary hours, midnight rollover, and leap years.
- `tests/notification.test.js`: 23 tests testing outbox transactions, quiet-hours deferrals, and opt-outs.

---

## What I tested myself, what I found or fixed & Verification Proofs

### 1. Pure UTC Quiet Hours Boundary Audit
- Evaluated 20:59:59 IST: `isQuietHours` $ightarrow$ `false` (dispatched immediately).
- Evaluated 21:00:00 IST: `isQuietHours` $ightarrow$ `true` (deferred).
- Evaluated 03:00:00 IST: Deferred to 09:00:00 IST of the same calendar day.
- Evaluated 22:30:00 IST on Dec 31: Deferred to Jan 1 09:00:00 IST of the next year.

### 2. Transactional Rollback Verification
- Initiated a business action that queued a notification inside a transaction session.
- Intentionally threw an error to trigger `session.abortTransaction()`.
- Queried `NotificationJob` collection: verified that zero jobs were created (no phantom alerts).

### 3. Channel Opt-Out Suppression
- Queued notification while creator had Email enabled.
- Toggled off Email preference in user settings while job was still pending.
- Ran notification worker:
  - Worker detected updated preference at send time and skipped email dispatch with status `skipped`.

### 4. Virtual Clock Time-Shift Verification
- Shifted clock by +6 hours to simulate 11:30 PM IST.
- Triggered application approval notification: verified job `scheduledFor` was set to 9:00 AM IST next morning.
