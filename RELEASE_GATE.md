# FINPILOT AI — Public Release Gates (V1.1)

**Status:** deployable source candidate, **NOT** a production-certified personal-finance service. Owner must complete all these gates before inviting public users or launching a Play Store native Android client.

## Gates requiring owner credentials / infrastructure
1. `npm install && npm run check` on clean Node.js 22 environment; save build logs. Resolve all type errors and vulnerabilities before deployment.
2. Run fresh `supabase/schema.sql` in your own Supabase project; use upgrade migration only for old V1 schema. Confirm RLS for every table and private receipts storage with two real test users.
3. Configure Supabase Auth email provider, production SMTP, allowed callback/recovery URLs and email verification.
4. Deploy to Vercel; run full multi-user smoke tests on the actual production URL; use correct environment separation.
5. Configure user support contact, published privacy policy, terms, deletion request policy, backups, incident-response escalation, domain and HTTPS.
6. Test authenticated session expiry, rate limiting, bot/signup abuse, password reset, file MIME validation and all account deletion paths. Penetration-test public APIs/RLS.
7. Verify accuracy of opening balances, bank-to-bank transfers, lending, partial repayments, principal/interest splits, CSV duplicates, recurring proposals and changes made on two devices.
8. Verify error monitoring, backup restoration and operational alerts; load-test pagination and dashboards.

## Deliberately excluded from this Vercel web project
- No direct reading of Android SMS, UPI application alerts, bank statements behind logins or real-time bank balances.
- No automated payments or auto-confirmation that an expected recurring item really cleared the bank.
- No guaranteed push/email alerts when the website is closed. Calendar ICS download supports reminders through user's calendar app.
- No bank-authorized Account Aggregator connector or regulated advice.
- No bank-grade double-entry immutable journal, server-side financial aggregation, or audit certification yet.
- No native APK/AAB or Play Store publishing; a PWA manifest is not a Play Store Android app.

## Known engineering constraints
- PostgreSQL financial fields are `numeric(16,2)`; JavaScript UI uses `number`, not integer-paise for all calculations. Migrate to integer-paise/decimal-backed server authoritative journals before regulated/high-value scale.
- Transaction read is paged, but current client holds records in memory; add server-side aggregations and virtualization for large consumer accounts.
- Uploaded attachments use per-user private storage paths and short-lived signed URLs, but production teams should add malware scanning and content security for publicly exposed customer uploads.
- Changes to historic opening balances or EMI splits can rewrite projected historical calculations; detailed event sourcing and immutable ledger are future work.
- Source/smoke checks pass in the packaging environment; full npm install/build and real Vercel/Supabase tests require network access and owner infrastructure.
