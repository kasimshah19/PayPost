# AI Prompts & Interaction Logs

This directory contains the prompt records, design reviews, and engineering logs generated during the build of PayPost.

---

## Engineering Methodology

The PayPost system was built following a structured, phase-by-phase pair-programming methodology:
1. **Planning & Prompt Design (Claude)**: Architecture design, domain data modeling, tax formula invariants, and phase-by-phase prompt planning were designed with Claude.
2. **Code Generation & Implementation (Antigravity)**: Antigravity IDE served as the agentic coding partner, implementing backend controllers, Mongoose transaction services, frontend Tailwind layouts, and Jest test suites phase by phase.
3. **Manual Validation & Testing**: Each phase was verified hands-on:
   - Backend APIs tested via automated Jest suites using in-memory MongoDB replica sets.
   - Frontend layouts tested on desktop viewports and simulated 360px mobile device viewports in Google Chrome.

---

## Log Navigation

- [Phase 1: Project Setup & Baseline](file:///d:/PayPost/docs/ai-logs/phase-01-setup.md)
- [Phase 2: Authentication & Role Guards](file:///d:/PayPost/docs/ai-logs/phase-02-auth.md)
- [Phase 2b: Database Models & Schema Design](file:///d:/PayPost/docs/ai-logs/phase-02b-database.md)
- [Phase 3: Campaigns & Budget Engine](file:///d:/PayPost/docs/ai-logs/phase-03-campaigns.md)
- [Phase 4: Applications & Atomic Slots](file:///d:/PayPost/docs/ai-logs/phase-04-applications.md)
- [Phase 5: Submissions & Revisions](file:///d:/PayPost/docs/ai-logs/phase-05-submissions.md)
- [Phase 6: Fee Calculator & Ledger Settlement](file:///d:/PayPost/docs/ai-logs/phase-06-money.md)
- [Phase 7: Two-Phase UPI Withdrawals](file:///d:/PayPost/docs/ai-logs/phase-07-withdrawals.md)
- [Phase 8: Quiet Hours Notification Outbox](file:///d:/PayPost/docs/ai-logs/phase-08-notifications.md)
- [Phase 9: Mobile-First Responsive Polish](file:///d:/PayPost/docs/ai-logs/phase-09-ui.md)
- [Phase 10: Risky Tests & Final Readiness](file:///d:/PayPost/docs/ai-logs/phase-10-final.md)

---

## Note on Antigravity Conversation Transcripts

Antigravity automatically maintains full session transcripts on the local machine under:
`%USERPROFILE%\.gemini\antigravity-ide\brain\<conversation-id>\.system_generated\logs\transcript.jsonl`

Before copying external chat logs into public repositories, review the [Sanitization Checklist](file:///d:/PayPost/docs/ai-logs/CHECKLIST.md).
