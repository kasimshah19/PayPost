# PayPost — System Architecture, Workflow & Technical Diagrams

This directory contains **25 authoritative technical diagrams** documenting every layer, workflow, concurrency guard, and financial invariant in **PayPost**.

---

## Complete Index of Diagrams (25 Files)

| # | Diagram Document | Category | Core Concept Illustrated |
|---|---|---|---|
| **01** | [01-system-topology.md](file:///d:/PayPost/docs/diagrams/01-system-topology.md) | Architecture | Decoupled layered architecture, middleware, controllers, services, and workers |
| **02** | [02-campaign-lifecycle.md](file:///d:/PayPost/docs/diagrams/02-campaign-lifecycle.md) | Lifecycle | End-to-end chronological sequence diagram from brief creation to UPI payout |
| **03** | [03-atomic-reservation-race.md](file:///d:/PayPost/docs/diagrams/03-atomic-reservation-race.md) | Concurrency | Single atomic `$expr` conditional update preventing slot & budget races |
| **04** | [04-submission-revision-state-machine.md](file:///d:/PayPost/docs/diagrams/04-submission-revision-state-machine.md) | State Machine | Deliverable review transitions, 2-revision hard cap, and dynamic deadlines |
| **05** | [05-money-flow-and-ledger.md](file:///d:/PayPost/docs/diagrams/05-money-flow-and-ledger.md) | Financial | Statutory tax deductions (Platform fee 10%, GST 18%, TDS 1%) & double-entry ledger |
| **06** | [06-two-phase-withdrawals.md](file:///d:/PayPost/docs/diagrams/06-two-phase-withdrawals.md) | Financial | Asynchronous hold-and-settle UPI payouts and failure reversal sequence |
| **07** | [07-notification-outbox-quiet-hours.md](file:///d:/PayPost/docs/diagrams/07-notification-outbox-quiet-hours.md) | Messaging | Transactional Outbox pattern eliminating dual-write bugs & TRAI quiet hours |
| **08** | [08-database-er-model.md](file:///d:/PayPost/docs/diagrams/08-database-er-model.md) | Data Model | **Complete Database Entity-Relationship (ER) diagram** with exhaustive schema audit |
| **09** | [09-auth-and-rbac-flow.md](file:///d:/PayPost/docs/diagrams/09-auth-and-rbac-flow.md) | Security | Registration, bcrypt hashing, JWT issuance, and role isolation middleware |
| **10** | [10-campaign-creation-and-funding-logic.md](file:///d:/PayPost/docs/diagrams/10-campaign-creation-and-funding-logic.md) | Domain | Campaign brief creation, deadline validation, and underfunded warning flag |
| **11** | [11-campaign-post-approval-edit-rules.md](file:///d:/PayPost/docs/diagrams/11-campaign-post-approval-edit-rules.md) | Domain | Post-approval modification constraints protecting approved creator commitments |
| **12** | [12-campaign-cancellation-and-creator-protection.md](file:///d:/PayPost/docs/diagrams/12-campaign-cancellation-and-creator-protection.md) | Domain | Cancellation guardrails preventing brands from cancelling work pending review |
| **13** | [13-creator-reapplication-decision-matrix.md](file:///d:/PayPost/docs/diagrams/13-creator-reapplication-decision-matrix.md) | State Machine | Re-application decision matrix preventing creator slot-grabbing |
| **14** | [14-submit-vs-withdraw-race-condition.md](file:///d:/PayPost/docs/diagrams/14-submit-vs-withdraw-race-condition.md) | Concurrency | Mutual exclusion race between deliverable submission and application withdrawal |
| **15** | [15-instagram-url-validation-and-deduplication.md](file:///d:/PayPost/docs/diagrams/15-instagram-url-validation-and-deduplication.md) | Validation | Instagram post/reel regex validation and campaign-wide link deduplication |
| **16** | [16-statutory-tax-and-fee-deduction-engine.md](file:///d:/PayPost/docs/diagrams/16-statutory-tax-and-fee-deduction-engine.md) | Financial | Exact integer paise tax formula ensuring zero fractional paise drift |
| **17** | [17-double-entry-wallet-credit-settlement.md](file:///d:/PayPost/docs/diagrams/17-double-entry-wallet-credit-settlement.md) | Financial | Multi-document ACID session executing deliverable approval settlement |
| **18** | [18-withdrawal-two-phase-hold-and-settle.md](file:///d:/PayPost/docs/diagrams/18-withdrawal-two-phase-hold-and-settle.md) | State Machine | Two-phase withdrawal state transitions from available balance to bank disbursement |
| **19** | [19-withdrawal-worker-polling-and-reconciliation.md](file:///d:/PayPost/docs/diagrams/19-withdrawal-worker-polling-and-reconciliation.md) | Workers | Polling worker loops, provider dispatch, and crash recovery reconciliation |
| **20** | [20-pure-utc-quiet-hours-time-arithmetic.md](file:///d:/PayPost/docs/diagrams/20-pure-utc-quiet-hours-time-arithmetic.md) | Time & Math | Pure UTC time arithmetic (+330 mins) for TRAI India Standard Time (IST) |
| **21** | [21-notification-dispatch-and-opt-out-pipeline.md](file:///d:/PayPost/docs/diagrams/21-notification-dispatch-and-opt-out-pipeline.md) | Messaging | Worker outbox polling, quiet-hours deferral, and send-time channel opt-out |
| **22** | [22-brand-action-center-aggregation-query.md](file:///d:/PayPost/docs/diagrams/22-brand-action-center-aggregation-query.md) | UI & Query | Single-query aggregation pipeline for the Brand Action Center dashboard |
| **23** | [23-creator-next-actions-urgency-engine.md](file:///d:/PayPost/docs/diagrams/23-creator-next-actions-urgency-engine.md) | UI & UX | Dynamic prioritization engine generating the Creator Next Actions banner |
| **24** | [24-deep-link-auto-focus-and-scroll-flow.md](file:///d:/PayPost/docs/diagrams/24-deep-link-auto-focus-and-scroll-flow.md) | Frontend | Deep-link tab switching, smooth scroll, and pulse highlight navigation hook |
| **25** | [25-seeded-concurrency-chaos-test-engine.md](file:///d:/PayPost/docs/diagrams/25-seeded-concurrency-chaos-test-engine.md) | Testing | Deterministic mulberry32 PRNG chaos test engine running parallel stress rounds |
