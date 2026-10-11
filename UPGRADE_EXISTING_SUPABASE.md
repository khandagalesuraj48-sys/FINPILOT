# Updating existing FINPILOT on Vercel + Supabase

The project was deployed earlier. **Do not run the old base schema again on your live database.**

## 0 — Prevent accidental data loss

1. Take a real Supabase backup (and confirm it can restore). If the project is on a plan without point-in-time backup, export tables, receipts and configuration to a protected location.
2. Clone the database to a staging project or disposable test project containing anonymized sample records.
3. Test this migration there first. Disable public signup while testing if needed.

## 1 — Choose your database starting point

- If the live database already supports `recurring_rules` and `transactions.due_date`, then it is on the V1.1 schema. **Run only `supabase/v2_production_upgrade.sql`.**
- If the live database is older V1 (no recurring_rules), run `supabase/upgrade_v1_to_v1_1.sql` first, then `supabase/v2_production_upgrade.sql`.
- If starting with a completely NEW Supabase database, run `supabase/schema.sql` and then `supabase/v2_production_upgrade.sql`.

**Do not overwrite or delete existing transactions, accounts, loans, users, storage buckets or database schema.**

## 2 — Verify on staging with SQL Editor

Run `supabase/v2_verification.sql` and confirm all checks return expected data. Inspect any past transactions that look invalid and reconcile their balances.

## 3 — Deploy code

The ZIP contains the full source project (not only changed files). Back up the GitHub repo first; replace source after staging validation, not the other way around. `npm install`, `npm run lint`, `npm run test:smoke`, `node scripts/v2-engine-tests.cjs`, `npm run build` must all pass in the development environment. Review failures rather than ignoring them.

Vercel environment variables remain:

- `NEXT_PUBLIC_SUPABASE_URL`: your Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: publishable/anon key ONLY; never a secret key.

## 4 — Real user testing checklist

- Account A signs in, creates bank account/loan/card and updates a savings goal.
- Account B signs in and cannot see, modify or download A's transactions/receipts/goals/card details.
- Add credit card with existing due as NEGATIVE opening balance, purchase on card, then bill payment from bank as transfer; only purchase appears as expense, card debt decreases on repayment.
- Delete/edit transaction; query journal_events & journal_lines to confirm compensating reversal and new posting.
- Compare `my_account_balances()` against App account balances. Test fractional rupees, high-volume imports, duplicates, concurrency, failures and recovery.
- Upload valid PDF & image, verify signed download, delete, sign out and verify access denied.
- Confirm existing old receipts, contacts, EMIs and user financial data remain intact.
- Test account deletion, restore from backup and support escalation before public release.

## 5 — Hold Play Store release

This ZIP is a substantial **web application update**. It is **not** a native Android APK/AAB or a certified financial product. Android permissions and payment/bank connectors require separate approved implementation. The pending integrations are enumerated in `V2_RELEASE_NOTES.md`.
