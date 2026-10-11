# Phase 5: Submissions & Revisions

## Prompt I sent

```text
Build Deliverable Submission and Brand Review system:
1. Endpoints: POST /api/submissions (submit Instagram URL), GET /api/submissions/:id, POST /api/submissions/:id/approve, POST /api/submissions/:id/revision, POST /api/submissions/:id/reject.
2. Instagram URL validation: regex format checking for Instagram post or reel.
3. Mutual exclusion: creator cannot withdraw application and submit deliverable simultaneously.
4. Revision rules: maximum 2 revisions allowed. Brand must provide feedback text. Resubmit deadline set to max(submissionDeadline, now + 48 hours).
5. Deliverable rejection: final action that frees the campaign slot and releases reserved funds.
6. Approved creator cannot be removed by brand. Write tests in tests/submission.test.js.
```

---

## What the AI built (short)

- submissionService.js managing deliverable lifecycle and review transitions.
- Regex format checker and URL deduplication preventing identical Instagram posts within a campaign.
- Revision tracker incrementing revisionCount and enforcing the hard limit of 2 revisions.
- Deadline calculator setting revisionDueAt to either the campaign submission deadline or 48 hours from request (whichever is later).
- Concurrency race test verifying submit and withdraw mutual exclusion.

---

## What I tested myself and what I found or fixed

1. Tested submitting an invalid Instagram link: rejected with 400 Bad Request.
2. Tested requesting a 3rd revision: rejected with 400 (max revisions exceeded).
3. Tested submit vs withdraw race condition: verified that only one action succeeds and the other fails cleanly.
4. Ran 'npm test -- tests/submission.test.js' - 100% passed.
