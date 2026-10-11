# Phase 5: Deliverable Submissions, Instagram URL Validation & Controlled Revisions

## Prompt I sent

```text
Build the Deliverable Submission and Brand Review system with strict workflow constraints:
1. Endpoints & Operations:
   - POST /api/submissions: Approved creator submits Instagram link with notes.
   - GET /api/submissions/:id: View deliverable details, version history, and revision notes.
   - POST /api/submissions/:id/revision: Brand requests revision with mandatory feedback.
   - POST /api/submissions/:id/resubmit: Creator resubmits updated deliverable link.
   - POST /api/submissions/:id/reject: Brand rejects deliverable.
   - POST /api/submissions/:id/approve: Brand approves deliverable (triggers settlement in Phase 6).
2. Instagram URL Validation & Deduplication:
   - Validate URL format via regex supporting Instagram post and reel links:
     /^https?://(www.)?instagram.com/(p|reel|tv)/[a-zA-Z0-9_-]+/?.*$/
   - URL Deduplication: Enforce that the same Instagram post URL cannot be submitted twice within the same campaign.
3. Mutual Exclusion Between Submit and Withdraw (Race Guard):
   - A creator must never be able to withdraw an application while deliverable submission is processing.
   - Protect via atomic condition update on Application verifying status is 'approved' before creating Submission.
4. Revision Limit & Deadline Calculation:
   - Enforce a strict maximum of 2 revisions (revisionCount <= 2). Attempting a 3rd revision must fail with HTTP 400.
   - Brand feedback note is strictly mandatory (minimum 10 characters).
   - Dynamic Resubmission Deadline: set revisionDueAt to max(campaign.submissionDeadline, now + 48 hours).
5. Rejection Consequences:
   - Rejection is final. Frees the campaign slot (approvedCount - 1) and releases reservedPaise back to campaign budget so the brand can approve another creator. Rejected creator cannot re-apply.
6. Approved Creators Cannot Be Removed:
   - There is no brand endpoint to delete or un-approve creators; only deliverable rejection on actual work frees a slot.
7. Write tests in tests/submission.test.js.
```

---

## What the AI built (Detailed Architecture & Implementation)

### 1. Deliverable Service (`src/services/submissionService.js`)
- **`submitDeliverable({ applicationId, creatorId, instagramUrl, creatorNotes })`**:
  - Validates Instagram URL using `src/utils/instagram.js` regex.
  - Checks URL uniqueness across campaign submissions.
  - Verifies application is in `approved` status.
  - Creates `Submission` in `submitted` status with `version: 1`, `revisionCount: 0`.
  - Links submission to Application document.
- **`requestRevision({ submissionId, brandId, feedback })`**:
  - Verifies ownership and validates feedback text.
  - Checks `submission.revisionCount < 2`. If equal to 2, throws HTTP 400 (*"Maximum 2 revisions allowed"*).
  - Increments `revisionCount` by 1.
  - Sets `revisionDueAt = new Date(Math.max(campaign.submissionDeadline.getTime(), Date.now() + 48 * 3600 * 1000))`.
  - Appends to `revisionHistory` array and transitions status to `revision_requested`.
  - Enqueues notification to creator.
- **`resubmitDeliverable({ submissionId, creatorId, instagramUrl, creatorNotes })`**:
  - Verifies submission is in `revision_requested` status and `revisionDueAt > now`.
  - Increments `version` and resets status to `submitted`.
- **`rejectSubmission({ submissionId, brandId, reason })`**:
  - Transitions submission to `rejected`.
  - Atomically decrements campaign `approvedCount` and releases `reservedPaise` back to budget.
- **`approveSubmission({ submissionId, brandId })`**:
  - Marks submission `approved` and invokes payout settlement workflow.

### 2. Test Suite (`tests/submission.test.js`)
- 33 tests verifying format validation, revision caps, deadline extension math, mutual exclusion races, and rejection slot recycling.

---

## What I tested myself, what I found or fixed & Verification Proofs

### 1. Instagram Regex Validation & Deduplication
- Submitted valid formats (`https://www.instagram.com/p/C3x9_12/`, `https://instagram.com/reel/D9a12_/`): Accepted.
- Submitted invalid formats (Twitter links, profile URLs, non-URL text): Rejected with HTTP 400 Bad Request.
- Submitted identical URL from two different creators in the same campaign: Second submission rejected with duplicate URL error.

### 2. Revision Limit & 48-Hour Deadline Extension
- Requested Revision 1: Accepted, `revisionCount = 1`.
- Requested Revision 2: Accepted, `revisionCount = 2`.
- Attempted Revision 3: Rejected with HTTP 400 (*"Maximum 2 revisions allowed"*).
- Verified `revisionDueAt` math: when submission deadline was only 12 hours away, `revisionDueAt` was correctly calculated as `now + 48 hours`.

### 3. Submit vs Withdraw Race Condition Test
- Fired `withdrawApplication()` and `submitDeliverable()` simultaneously via `Promise.allSettled`.
- **Result**: Exactly one succeeded; the other failed cleanly with HTTP 409 Conflict. Zero inconsistent partial state.

### 4. Deliverable Rejection Slot Recycling
- Brand rejected poor deliverable:
  - Submission marked `rejected`.
  - Campaign `approvedCount` decremented from 3 to 2, and ₹2,000 was restored to available budget.
  - Brand immediately approved a new applicant using the recycled slot.
