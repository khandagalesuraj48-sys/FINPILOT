# FINPILOT V2 — Accurate release status

## Implemented and code-packaged

- Original Next.js / Supabase web app: dashboard, auth, financial accounts, transactions, contacts, receivable/payable ledgers, EMI, budgets, recurring rules, reports, CSV import, private JPG/PNG/WEBP/PDF receipt attachments.
- New navigation pages and forms: **Credit Cards**, **Savings Goals**, **Financial Planner**, **Finance Insights**, **Document Vault**.
- Credit cards: negative balances represent card debt; record purchases as expense paid with the credit card, bill repayment as **transfer from bank to card**. Optional card profile stores limit, issuer, last four digits, billing and due days. Card statement settlement is not automatically fetched.
- Savings goals with manual progress and deterministic suggested monthly saving.
- 30/60/90-day planning based on manually recorded loan/recurring rules. Estimates are **not bank-verified**.
- Rule-based finance assistant: asks limited English/Marathi keyword queries about spending, EMI, budgets, receivables, and cards. **No LLM integration**.
- Searchable receipt vault; files use existing private Supabase storage.
- Money utilities using integer paise for supported computations, loan amortization & optional prepayment scenario calculations.
- Existing-database **additive** V2 SQL migration: new tables, RLS policies, credit card kind, append-only-to-client journal event/lines with post/reverse on inserts/updates/deletes, backfill, server balance RPC.
- Sign-up confirmation email resend; subject to Supabase/SMTP sending limits.

## Explicitly NOT implemented, blocked on integration or additional engineering

- Native Kotlin Android app / signed Android App Bundle / Play Store approval.
- Reading UPI app notifications, bank SMS, real-time banking or Account Aggregator feeds.
- Actual scheduled push/email reminders while website closed.
- LLM AI chat, OCR bill extraction, receipt malware scan.
- Family/household shared roles, bank-grade reconciliation across numerous financial providers.
- Commercial subscription billing, production SMTP infrastructure, large-scale operations dashboard.
- Complete audited financial books: event journal tracks transaction movements; opening balances and loan origin are not fully journalized. Financial computations in some UI views still use JavaScript numbers.

## Tests run in this build environment

- `node scripts/smoke-check.cjs`: PASS (12 TS/TSX syntax modules and financial/parser/RLS structure checks).
- `node scripts/v2-engine-tests.cjs`: PASS (28 assertions, basic financial posting/balance/card/loan/goal scenarios).
- `.github/workflows/ci.yml`: included. The GitHub Actions job will run real type checking and Next.js build when source is pushed.
- `npm install`: BLOCKED (npm registry DNS EAI_AGAIN). **Therefore neither `tsc --noEmit` nor `next build` nor Supabase integration tests have been run in this packaging session.**

## Production decision

**Do not enroll the public or accept sensitive real-world financial documents until:** `npm ci`/`npm install`, typecheck, production build, staging migration, RLS isolation and attachment tests, account recovery/deletion tests, mobile UX test, penetration/security review, proper privacy policy and SMTP readiness have passed.
