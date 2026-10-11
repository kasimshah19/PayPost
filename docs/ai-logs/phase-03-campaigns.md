# Phase 3: Campaign Lifecycle, Budget Guardrails & Tenant Isolation

## Prompt I sent

```text
Build the Campaign management module with strict budget validations and tenant security:
1. Endpoints & Operations:
   - POST /api/campaigns: Create new campaign brief.
   - GET /api/campaigns: Brand view (only brand's own campaigns) vs Creator browse view (active campaigns with open deadlines).
   - GET /api/campaigns/:id: Campaign details with populated brand profile and budget breakdown.
   - PUT /api/campaigns/:id: Edit campaign details with strict post-approval restrictions.
   - POST /api/campaigns/:id/cancel: Cancel campaign with deliverable protection.
   - POST /api/campaigns/:id/duplicate: Clone an existing campaign brief.
2. Business Validation Rules:
   - Application deadline must be in the future.
   - Submission deadline must be strictly after application deadline.
   - Slots must be >= 1; perCreatorFeePaise >= 10000 (₹100 minimum).
   - Budget vs Slots Warning: If budgetPaise < (slots * perCreatorFeePaise), do not block creation, but return a warning flag 'isUnderfunded' with fundedSlots count.
3. Edit Rules After Approvals:
   - If approvedCount > 0:
     - budgetPaise cannot be reduced below (reservedPaise + paidOutPaise).
     - slots cannot be reduced below approvedCount.
     - Deadlines can only be extended, never moved earlier.
     - Fee edits apply only to future approvals; existing approved creators keep locked fee.
4. Cancellation Guardrails:
   - Block cancellation with HTTP 409 Conflict if any deliverable is in 'submitted' status or inside an active 'revision_requested' window (protect creators from unpaid work).
   - If no deliverables are pending, allow cancellation: mark campaign 'cancelled', release all unspent reservedPaise and slots, and mark applied/approved applications 'cancelled'.
5. Tenant Privacy (Security Rule):
   - When a brand queries a campaign ID owned by another brand, return HTTP 404 Not Found (not 403) so resource existence is not leaked to unauthorized tenants.
6. Write test suite in tests/campaign.test.js.
```

---

## What the AI built (Detailed Architecture & Implementation)

### 1. Service Layer (`src/services/campaign.service.js`)
- **`create(data, brandId)`**:
  - Validates input via Zod schema `createCampaignSchema`.
  - Calculates `fundedSlots = Math.floor(budgetPaise / perCreatorFeePaise)`.
  - Sets `isUnderfunded = fundedSlots < slots`.
  - Initializes `reservedPaise: 0`, `paidOutPaise: 0`, `approvedCount: 0`, `status: 'active'`.
- **`updateCampaign(id, updateData, brandId)`**:
  - Verifies ownership (returns 404 if campaign belongs to another brand).
  - Enforces financial floor: `updateData.budgetPaise >= (campaign.reservedPaise + campaign.paidOutPaise)`.
  - Enforces slot floor: `updateData.slots >= campaign.approvedCount`.
  - Verifies deadline extensions: new deadlines must be `>= existing deadlines`.
- **`cancel(id, cancelReason, brandId)`**:
  - Checks for pending deliverables (`submitted` or active `revision_requested`).
  - Throws HTTP 409 Conflict if creators are currently awaiting review.
  - If clear, transitions campaign to `cancelled` and updates related applications inside an atomic Mongoose transaction.
- **`duplicate(id, brandId)`**:
  - Clones title, description, budget, fee, and slots, resetting counters and resetting deadlines to future defaults.

### 2. Tenant Isolation Controller
- `src/controllers/campaign.controller.js`: Automatically filters `GET /api/campaigns` by `brand: req.user._id` for brands, and `status: 'active'` for creators.
- Brand operations check `campaign.brand.toString() === req.user._id.toString()`. If mismatched, immediately throws `ApiError.notFound('Campaign not found')`.

### 3. Automated Test Suite (`tests/campaign.test.js`)
- 20 unit and integration tests covering creation, edge-case date validations, edit restrictions, cancellation locks, and tenant isolation.

---

## What I tested myself, what I found or fixed & Verification Proofs

### 1. Validation & Underfunded Campaign Tests
- Created a campaign with 5 slots @ ₹2,000 each (needed ₹10,000) with a budget of ₹6,000:
  - Verified campaign was created successfully.
  - API response included: `{ isUnderfunded: true, fundedSlots: 3, totalSlots: 5 }`.
- Attempted to set submission deadline before application deadline:
  - Rejected with HTTP 400 Bad Request.

### 2. Post-Approval Edit Guardrails
- Created campaign with ₹10,000 budget and approved 2 creators (₹4,000 reserved).
- Attempted to reduce budget to ₹3,000:
  - Intercepted and rejected with HTTP 409: *"Budget cannot be reduced below reserved + paid amount (₹4,000)"*.
- Attempted to reduce slots from 5 to 1:
  - Rejected with HTTP 409: *"Slots cannot be reduced below current approved count (2)"*.

### 3. Deliverable Cancellation Lock
- Created approved submission in `submitted` state.
- Attempted to cancel campaign:
  - Rejected with HTTP 409: *"Cannot cancel campaign while deliverables are pending review"*.
- Reviewed and approved submission, then called cancel:
  - Campaign cancelled cleanly; paid funds remained intact; remaining budget was released.

### 4. Tenant Isolation Verification
- Brand B attempted to fetch Brand A's campaign details via `GET /api/campaigns/:id`:
  - Returned HTTP 404 Not Found (confirming zero resource leakage).
