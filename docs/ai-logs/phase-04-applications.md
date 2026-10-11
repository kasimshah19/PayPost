# Phase 4: Creator Applications, Atomic Budget Reservations & Concurrency Race Protection

## Prompt I sent

```text
Implement the Creator Application lifecycle with atomic race-condition protection:
1. Endpoints & Operations:
   - POST /api/applications: Creator applies to an active campaign with optional pitch.
   - GET /api/applications/my: Creator's application list with current status.
   - GET /api/campaigns/:id/applications: Brand queries applicants for their campaign.
   - POST /api/applications/:id/approve: Brand approves applicant.
   - POST /api/applications/:id/reject: Brand rejects applicant.
   - POST /api/applications/:id/withdraw: Creator withdraws application.
2. Race-Condition Protection on Approval (Critical Invariant):
   - When multiple brand managers or parallel API calls attempt to approve creators simultaneously, approvals must NEVER exceed the remaining slots or budget.
   - Do NOT use read-then-write logic. Execute approval using ONE atomic conditional update on Campaign:
     Filter: {
       _id: campaignId,
       status: 'active',
       approvedCount: { $lt: campaign.slots },
       $expr: { $gte: [ { $subtract: ["$budgetPaise", { $add: ["$reservedPaise", "$paidOutPaise"] }] }, feePaise ] }
     }
     Update: { $inc: { approvedCount: 1, reservedPaise: feePaise } }
   - If the update returns null, throw HTTP 409 Conflict.
3. Locked Creator Fee:
   - Upon approval, lock the creator's fee directly onto Application (lockedFeePaise). Subsequent campaign fee changes must not alter approved creator compensation.
4. Withdrawal & Re-Application Rules:
   - Creator can withdraw an 'applied' application before approval.
   - Creator can withdraw after approval (before deliverable submission): atomically decrements approvedCount and releases reservedPaise back to campaign budget.
   - Re-Application: A creator who withdrew while in 'applied' status can re-apply before deadline. A creator who withdrew after approval or was rejected/cancelled cannot re-apply (prevents slot grabbing).
5. Concurrency Testing:
   - Write race tests in tests/application.test.js firing 10 simultaneous approvals on a 2-slot campaign using Promise.allSettled.
```

---

## What the AI built (Detailed Architecture & Implementation)

### 1. Application Service Layer (`src/services/application.service.js`)
- **`applyToCampaign(campaignId, creatorId, pitch)`**:
  - Validates campaign is `active` and `applicationDeadline > now`.
  - Checks previous application history:
    - If never applied: creates new Application in `applied` status.
    - If previously `withdrawn` from `applied` state: resets status to `applied`.
    - If previously `approved`, `rejected`, or `cancelled`: rejects with HTTP 400.
- **`approveApplication(applicationId, brandId)`**:
  - Verifies application is currently in `applied` state.
  - Executes single atomic query on `Campaign` using `$expr` to check both slot ceiling and remaining budget headroom:
    ```javascript
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
      { $inc: { approvedCount: 1, reservedPaise: feePaise } },
      { new: true, session }
    );
    ```
  - If null, throws HTTP 409 Conflict (*"Campaign has no available slots or insufficient budget"*).
  - Transitions application to `approved` and locks `lockedFeePaise = feePaise`.
  - Enqueues notification to creator inside the same transaction session.
- **`withdrawApplication(applicationId, creatorId)`**:
  - If status is `applied`: transitions to `withdrawn`.
  - If status is `approved`: transitions to `withdrawn`, atomically decrements `approvedCount` by 1, and releases `reservedPaise` back to campaign.
  - If deliverable is already submitted: blocks withdrawal with HTTP 409.

### 2. Concurrency Race Test Suite (`tests/application.test.js`)
- Tests parallel approval requests fired via `Promise.allSettled` against limited slots and constrained budgets.

---

## What I tested myself, what I found or fixed & Verification Proofs

### 1. High-Concurrency Slot Race Test
- Setup campaign with 2 slots, ₹4,000 budget, and 10 applicant creators.
- Fired 10 simultaneous `approveApplication()` calls via `Promise.allSettled`.
- **Result**:
  - Exactly 2 approvals succeeded with HTTP 200.
  - Exactly 8 approvals were rejected with HTTP 409 Conflict.
  - Final campaign state: `approvedCount === 2`, `reservedPaise === 400000`. Zero slot over-allocation.

### 2. High-Concurrency Budget Depletion Test
- Setup campaign with 5 slots, but budget for only 2 creators (₹4,000 budget @ ₹2,000 fee).
- Fired 5 simultaneous approval calls.
- **Result**:
  - Exactly 2 approvals succeeded.
  - Remaining 3 approvals failed with HTTP 409 (*"Insufficient budget"*).
  - `reservedPaise` capped at exactly ₹4,000.

### 3. Withdrawal & Reservation Release
- Creator withdrew an approved application:
  - Verified application status changed to `withdrawn`.
  - Verified campaign `approvedCount` dropped from 2 to 1 and `reservedPaise` dropped from ₹4,000 to ₹2,000.
  - Brand was then able to approve a 3rd applicant using the released slot and budget.

### 4. Re-Application Guard Verification
- Creator withdrew from `applied` status $ightarrow$ Successfully re-applied.
- Creator withdrew after `approved` status $ightarrow$ Re-application blocked with 400 (*"Creators who withdrew after approval cannot re-apply"*).
