# Phase 8: Quiet Hours Notification Outbox

## Prompt I sent

```text
Build Transactional Notification Outbox with TRAI-compliant Quiet Hours:
1. Model NotificationJob. Enqueue via outbox pattern inside the same DB transaction as business events.
2. Quiet Hours Rule: No messages sent between 9:00 PM and 9:00 AM IST. Pure UTC arithmetic (UTC+5:30) with no server timezone dependency.
3. Scheduling: If event occurs in quiet hours, scheduleFor = 9:00:00 AM IST of the next allowed window.
4. Channels: Email and WhatsApp. Honor channel opt-outs at queue time and again at dispatch time.
5. Background Worker: notificationWorker.js polls pending jobs where scheduledFor <= now. Atomic job claiming.
6. Dev Tools: Virtual clock offset in clock.js and dev.routes.js (ENABLE_DEV_TOOLS=true) to test quiet hours during daytime. Write tests in tests/notification.test.js and tests/quietHours.test.js.
```

---

## What the AI built (short)

- quietHours.js pure UTC time calculator with 100% line coverage.
- notificationService.js inserting outbox jobs inside transaction sessions.
- notificationTemplates.js providing structured messages for application, submission, and payout events.
- notificationWorker.js polling every 5 seconds with exponential backoff on retries.
- Virtual clock service (clock.js) allowing simulated time manipulation in test environments.
- Automated tests in tests/quietHours.test.js and tests/notification.test.js.

---

## What I tested myself and what I found or fixed

1. Tested quiet hours boundary: 20:59:59 IST allowed; 21:00:00 IST scheduled to next day 09:00:00 IST.
2. Tested opt-out after queueing: verified that toggling off email preference suppresses dispatch at send time.
3. Tested outbox transaction rollback: verified that if a business action fails, zero notification jobs are saved.
4. Ran 'npm run test:risky:out' - 100% passed.
