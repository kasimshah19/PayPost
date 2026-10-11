# Phase 4: Applications & Atomic Slots

## Prompt I sent

```text
Build the Creator Application workflow with race-condition protection:
1. Endpoints: POST /api/applications (apply), GET /api/applications/my (creator list), GET /api/campaigns/:id/applications (brand review), POST /api/applications/:id/approve, POST /api/applications/:id/reject, POST /api/applications/:id/withdraw.
2. Race protection on Approval: must reserve gross fee and claim slot in ONE atomic conditional update on Campaign (approvedCount < slots and remaining budget >= fee).
3. Creator can withdraw an 'applied' application; if withdrawing after approval, release reserved budget and decrement approvedCount.
4. A creator who withdrew while 'applied' can re-apply before deadline. A creator who was rejected or approved-then-withdrew cannot re-apply.
5. Concurrent approvals must never exceed slots or budget. Write concurrency race tests in tests/application.test.js.
```

---

## What the AI built (short)

- application.service.js handling complete transition lifecycle.
- Atomic Campaign.findOneAndUpdate reservation query inside approveApplication preventing over-allocation under concurrent clicks.
- Re-apply eligibility logic checking status history.
- Dynamic fee lock: approved applications store lockedFeePaise to insulate creator from subsequent campaign fee modifications.
- Concurrency race tests in tests/application.test.js firing 10 simultaneous approvals on a 2-slot campaign.

---

## What I tested myself and what I found or fixed

1. Executed race test in tests/application.test.js: 10 parallel approval requests against 2 slots resulted in exactly 2 approvals and 8 409 Conflicts.
2. Tested withdrawing after approval: verified campaign reservedPaise and approvedCount were decremented correctly.
3. Tested re-applying after rejection: verified request was rejected with 400.
