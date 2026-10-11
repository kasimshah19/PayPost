# Phase 3: Campaigns & Budget Engine

## Prompt I sent

```text
Build Campaign management service, controllers, and validation:
1. Endpoints: POST /api/campaigns (create), GET /api/campaigns (brand's own list / creator browse list), GET /api/campaigns/:id, PUT /api/campaigns/:id (edit rules), POST /api/campaigns/:id/cancel.
2. Validation: submissionDeadline must be strictly after applicationDeadline. budgetPaise must be >= perCreatorFeePaise.
3. If budget does not cover all slots, allow creation but return warning flag in API response.
4. Edit restrictions: budget cannot be reduced below (reservedPaise + paidOutPaise). Slots cannot be reduced below approvedCount. Deadlines can only move later.
5. Cancellation rules: cannot cancel if any deliverable is in 'submitted' or active 'revision_requested' status. Free unspent reservations upon cancellation.
6. Write test suite in tests/campaign.test.js.
```

---

## What the AI built (short)

- campaign.service.js and campaign.controller.js with Zod schema validation.
- Atomic campaign updates and cancel methods wrapped in withTransaction.
- Strict checks preventing brands from decreasing budget below committed reservations.
- Tenant isolation: brands querying non-owned campaigns receive 404 (preventing ID enumeration).
- Automated test suite tests/campaign.test.js covering creation, validation, deadline checks, update constraints, and cancellation guards.

---

## What I tested myself and what I found or fixed

1. Tested creating a campaign where submissionDeadline is earlier than applicationDeadline: correctly rejected with 400 Bad Request.
2. Tested editing budget below reservedPaise: correctly returned 409 Conflict.
3. Tested campaign cancellation when deliverables are submitted: correctly blocked with 409 until deliverables are reviewed.
4. Ran 'npm test -- tests/campaign.test.js' - all tests passing.
