# FINPILOT AI smoke-test checklist

Run after `npm install && npm run build` and after connecting Supabase and Vercel.

- [ ] User can sign up, confirm email, sign in, sign out and sign in again.
- [ ] User A cannot view User B's accounts/transactions/attachments (RLS).
- [ ] User creates Bank account and Cash account, edits opening balances.
- [ ] Expense decreases one account, income increases one account.
- [ ] Internal transfer decreases one account and increases another; total tracked balances unchanged.
- [ ] Person money lent reduces bank and increases receivable, not expense total.
- [ ] Partial settlement adjusts person ledger net correctly.
- [ ] Loan payment splits principal and interest; outstanding reduces only by principal.
- [ ] User creates monthly category budget; expenses update progress.
- [ ] User uploads JPG, PNG, WEBP and PDF to transaction; each opens with signed URL.
- [ ] User cannot upload >10MB or unsupported MIME; private receipts inaccessible without auth.
- [ ] User can remove one attachment, edit transaction, and delete transaction plus attachments.
- [ ] CSV preview maps headers correctly; import duplicate row twice and confirm duplicate skipped.
- [ ] Date/amount/type filters and CSV export work.
- [ ] Browser print can save a report as PDF.
- [ ] Dashboard and screens work at 360px, 768px, 1440px widths.
- [ ] Account deletion cleans receipts, personal tables and authentication identity.
- [ ] Verify expected behavior on slow network, stale session, invalid data and incorrect permissions.
- [ ] Verify signup rate limits, email SMTP, backups, incident handling and legal disclosures before public launch.


### V1.1 added tests

- [ ] Account has more than 500 transactions: all pages load; totals are not silently truncated.
- [ ] Recurring bill: add, edit, disable, due date, post once, duplicate month blocked, old posts remain after rule deletion.
- [ ] Supabase RLS: User A cannot read/write User B recurring rules or receipt storage.
- [ ] Person ledger: due date persists and overdue reminder is shown only when net receivable remains.
- [ ] Export EMI ICS, import to a calendar, verify twelve events and reminders.
- [ ] Forgot-password email and recovery via production Supabase redirect allowlist.
- [ ] Validate CSV impossible dates (e.g., 2026-02-31) are rejected.
- [ ] Receipt upload error preserves transaction and warns rather than creating accidental duplicate.
- [ ] Vercel preview environment and production environment variables differ appropriately.
