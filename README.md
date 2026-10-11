# FINPILOT AI V2 — Web Upgrade (Vercel + Supabase)

> **Read `V2_RELEASE_NOTES.md` and `UPGRADE_EXISTING_SUPABASE.md` first.** This is an upgrade to the working web MVP, not a completed native Play Store application and not a production-certified fintech system. The new credit-card, goal, planner, assistant and vault modules are coded. Independent integrations and live release gates remain open.

**Existing deployed database?** Take backup, test `supabase/v2_production_upgrade.sql` in staging first. Do **not** run `schema.sql` against your live existing project.

# FINPILOT AI · Premium Finance Tracker

**A functional full-stack MVP source package** for a Vercel-hosted Next.js 15 web application with Supabase Authentication, PostgreSQL, Row Level Security and private receipt storage. Android-friendly responsive layout, installable manifest, and built-in interactive demo.

> **Scope:** This is an actual coded V1.1 MVP, not an audited or certified fintech product, APK, or Play Store-ready native Android release. It does **not** read SMS, UPI notifications, or directly connect to live bank balances. Those require separate Android development, Play Store permission review, and/or authorized financial integrations. Background reminders while the site is closed are **not** implemented. Financial figures are derived from user-entered/imported data, not verified bank balances.

## Included now

- Polished responsive dark dashboard, income/expense summary, 6-month charts and spending donut
- Supabase email/password authentication (if environment variables are configured)
- Multiple financial accounts (bank/cash/wallet), opening balances, transfer tracking
- Expenses, income, person-to-person lending/borrowing, due dates and partial settlements
- Edit/delete transactions, detailed transaction panel, source/category/time search, filters
- Multiple **private photo/PDF attachments per transaction**; 10 MB/file; signed viewing URLs
- EMI loan tracking, interest/principal allocations, outstanding calculation and in-app due indicators and downloadable 12-month calendar reminder files
- Person-wise balances, ledger history, monthly budgets, rule-based insight cards
- Recurring income/expense rules with user-approved monthly posting (never automatically debits bank)
- Password reset via Supabase recovery email (SMTP and redirect allowlist required)
- Day book, financial summaries, CSV export, print/save-as-PDF via browser
- CSV import with preview, column mapping, basic category suggestions and duplicate signatures
- In-app account deletion with receipt cleanup, downloadable JSON data export
- Sample demo workspace when no configuration is present, or via login screen

## 1. Create Supabase project (required for persistent accounts)

1. Go to https://supabase.com/dashboard and create a project.
2. Open **SQL Editor**. Paste and run **`supabase/schema.sql`** once. It creates tables, RLS policies, triggers and the private `receipts` Storage bucket.
3. Navigate to **Authentication → Providers → Email**. Enable email authentication and configure confirmation email / SMTP for production.
4. Open **Project Settings / Connect → API credentials** and copy the **Project URL** and **publishable (`sb_publishable_...`) or anon key**.
5. In **Authentication → URL Configuration**, set the Site URL to your deployed Vercel URL, and add your production URL to redirect allowlist.

**Security:** Never put a Supabase `service_role` / secret key into a `NEXT_PUBLIC_...` variable. Only the publishable/anon key belongs in a browser app. RLS is required and already provided by the SQL schema.

## 2. Run locally

Requires Node.js **20.9+**, preferably Node.js 22, and access to npm registry.

```bash
cp .env.example .env.local
# Replace the 2 placeholders inside .env.local with Supabase credentials.
npm install
npm run dev
```

Visit **http://localhost:3000**. Or simply run `npm install && npm run dev` without Supabase configuration to explore local browser-only demo mode.

**Windows:** Copy `.env.example` to `.env.local` manually, then enter the same `npm` commands in Terminal or PowerShell.

## 3. Deploy to Vercel

1. Extract this ZIP into a new directory. Initialize a **private** GitHub repository and push the source (do not commit `.env.local`).
2. At https://vercel.com/new select **Import Git Repository**. Import the repo (Framework Preset: Next.js).
3. Add **two Environment Variables** for Production/Preview/Development:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_PUBLISHABLE_OR_ANON_KEY
```

4. Click **Deploy**. Vercel runs `npm install` and `npm run build`.
5. Add the actual Vercel domain to Supabase Auth URL Configuration, and test email signup, adding accounts, expense, receipt upload, logout, login, signed receipt view, deleting a record.
6. For a custom domain, set up the domain in Vercel and update Supabase Site URL/redirect allowlist as appropriate.

**Why not truly one click?** A deployable Vercel app needs **your** Supabase project, database schema and credentials. The ZIP includes all app code and SQL, but cannot create or connect your private external accounts automatically.

## 4. Database model

`accounts`, `contacts`, `loans`, `transactions`, `attachments`, `budgets`, `recurring_rules`, `recurring_rules` are all scoped by `user_id`. RLS verifies `user_id = auth.uid()`. Reference-validation triggers prevent cross-user relationships. Private Storage object keys follow `{user_id}/{transaction_id}/{uuid}-{safe_name}`. Signed URLs are only generated for authenticated users who may SELECT their own storage objects.

Amounts are `NUMERIC(16,2)` in PostgreSQL. Client uses JS Number for rendering and convenient forms; **for institution-grade precision and auditability**, move all financial calculations to integer-paise or decimal-library server functions before regulated scale. V1.1 does not claim a complete audited double-entry journal engine. `financial_flow_shape`, `financial_party_shape` and `financial_emi_shape` CHECK constraints enforce basic cash flow integrity.

Data is fetched through **500-row pages per table**, with an explicit error above 20,000 rows/table rather than silently misreporting totals. For high-volume production onboarding add server-side financial aggregation and virtualized lists.

## 5. How to use

1. **Accounts → New account**: Add each tracked bank/cash/wallet and its **opening** balance.
2. **Transactions → New transaction**: Choose type, amount, account, category and date. Attach photo/PDF receipts on the same form (or later via Edit).
3. **People & ledgers**: Add people, then record `Money lent`, `Money borrowed`, `Received back`, `Repaid`. Money lent is not categorized as consumption expense.
4. **Loans & EMIs**: Enter **current outstanding principal** as of tracking start, EMI, annual rate and due day. Log EMI with principal/interest split. Check the split against lender statement.
5. **Budgets**: Set a monthly category cap and monitor spending.
6. **Import CSV**: Use a header row `Date,Description,Amount,Type`; `Type` values should be `debit` or `credit`. Date format `YYYY-MM-DD` or `DD/MM/YYYY`. Supported up to 500 rows per import.
7. **Recurring bills**: Create monthly salary, rent or subscription rules; open the page and approve records once due.
8. **Loans & EMIs → Calendar**: Download 12 monthly reminders as an ICS calendar file (import into your calendar app).
9. **Reports**: Export CSV or Print → Save as PDF.

### CSV example

```csv
Date,Description,Amount,Type
2026-10-01,Monthly salary,65000,credit
2026-10-02,Grocery Store,2400,debit
2026-10-03,Electricity bill,1700,debit
```

### Demo limitations

The interactive sample uses **localStorage**, not Supabase. It is NOT secure multi-user storage and should be used only for exploration. Demo attachments are limited to **1 MB** because of browser storage quotas. Real-user data and receipts remain in Supabase, with RLS/private storage.

## 6. Important release notes & known limits

- Vercel/Next.js cannot directly read Android SMS or notifications; **no automatic UPI ingestion** in this ZIP.
- EMI reminders appear **inside the app when opened**; actual background push, schedule and email reminders require a notification delivery service + worker.
- AI Insights are deterministic financial heuristics; no external LLM, personalized regulated advice, or automation that modifies balances without transaction input.
- CSV bank formats vary; map/normalize and verify each import. Automatic categories are suggestions, not definitive proof of merchant/type. Multi-format bank connectors are future work.
- Loan balance is a projection from **entered opening outstanding principal** less recorded principal allocations; verify against lender records, especially moratoria, fees and variable interest.
- Accounts referenced by transactions and contacts referenced by ledgers cannot be deleted until related transactions are deleted. This protects relational integrity.
- Account deletion tries to remove private receipt objects before deleting the user's Auth identity and database rows. Test this with your storage workflows before public release.
- Browser print-to-PDF depends on the browser's Print / Save as PDF functionality.
- Need production email SMTP, rate limiting, abuse monitoring, backups, penetration testing, legal/privacy review, data-retention policy, accessible UI QA, browser/device testing, disaster recovery, improved money precision, pagination and accounting audit trail before significant financial production usage.
- No tests against a live Supabase/Vercel project were performed in this packaging environment; static syntax validation was run. Run `npm install`, `npm run lint`, `npm run build` and an end-to-end smoke test in your environment.

## Future roadmap

P1: server-verified financial journaling; bank statement connectors; separate Android notification receiver, opt-in permissions and Google Play review; true scheduled reminders; background job queue, reconciliation.

P2: family workspaces with per-member roles, AI assistant, recurring transactions, receipt OCR, real bank integrations via authorized partners, multi-language support and subscription billing.

## Architecture

```text
app/                 Next.js App Router, metadata, CSS
components/          Premium UI, dashboard views, forms, CSV importer
lib/types.ts         Domain types
lib/logic.ts         Financial calculations and deterministic insight rules
lib/finance.tsx      Supabase auth, CRUD, receipts, demo state
lib/demo.ts          Local sample data
supabase/schema.sql  Postgres migration, RLS, validation and private storage
public/              Brand icon and installable manifest
```

## License

This project is provided as an implementation starting point for the requested FINPILOT AI concept. Confirm third-party library licenses and brand ownership before commercial publication.


## V1.1 validation and handoff

- Run `npm install`, then `npm run check` (TypeScript type check, source/math smoke suite, Next.js production build).
- `scripts/smoke-check.cjs` validates source syntax, demo finance calculations, CSV parser and expected RLS definition.
- `preview/` contains **static UI references based on the same app CSS and markup**, not screenshots of a running Next.js deployment. `FINPILOT_AI_UI_*.png` previews ship beside the ZIP.
- For a fresh Supabase deployment use `supabase/schema.sql` once. **If you previously ran the older V1 SQL**, run `supabase/upgrade_v1_to_v1_1.sql` instead of repeating the full file.
- Before any public users join: configure custom SMTP, Supabase project backups, monitoring, Terms/Privacy legal pages and a real support contact; complete live integration and security testing. See `RELEASE_GATE.md`.
- The environment in which this ZIP was prepared could not reach npm registry; **full Next.js build and live Supabase/Vercel smoke testing have not been completed here**. The source/smoke tests are not a substitute for deployment QA.
