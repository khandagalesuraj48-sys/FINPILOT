# FINPILOT — Honest release backlog (after V2.2)

## Critical before real public launch (P0)
- Two-user RLS isolation, IDOR / foreign-key ownership tests and independent security assessment.
- Transaction correction/reversal and ledger invariants with concurrent edits, idempotent API operations, full audit history.
- Receipt malware scanning and secure content handling; prove restore/deletion of sensitive files.
- Auth email deliverability and rate limits, Google Play privacy disclosures, incident response and operational monitoring.
- Real-device end-to-end tests and accessibility/performance QA.

## High impact (P1)
- Native Android client: permission-conscious user opt-in notification-based bank event import, with pending/reversal detection and Play policy approval.
- Reliable scheduled push reminders (FCM/backend), opt-out, time zone handling and paid-state reconciliation.
- Authorised bank data connectivity where eligible; bank reconciliation and account-balance provenance.
- LLM-powered financial Q&A via secure backend with consent, least-privilege queries, bounded spending and no invented figures.
- Receipt OCR with review queue and invoice item extraction.
- Credit card statement reconciliation (minimum amount due, billed/unbilled, card EMI).
- Safe bulk importer with atomic/idempotent server posting, matching already-manual entries, rollback.

## Product differentiation (P2)
- Family and business books with membership/RLS policies.
- Offline-first native ledger and sync conflict resolution.
- Subscription cancellation suggestions, personalized goals and cash flow uncertainty bands.
- Marathi/Hindi language and voice expense entry, mobile widgets and accessibility.
- Support ticketing, fraud report & dispute workflows, lifecycle notifications, subscriptions.

**Do not describe this V2.2 patch as a fully automated Play Store financial app.**
