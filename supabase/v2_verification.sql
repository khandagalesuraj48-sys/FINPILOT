-- READ-ONLY FINPILOT V2 migration checks. Run in staging SQL editor.
-- These queries verify structure/consistency, not full security or accounting correctness.
select tablename, rowsecurity from pg_tables
where schemaname='public' and tablename in ('accounts','transactions','card_profiles','savings_goals','journal_events','journal_lines')
order by tablename;

-- All event postings must balance in INR and have at least two rows.
select e.id,e.transaction_ref,e.event_kind,
       count(l.id) as line_count,
       coalesce(sum(l.debit),0) as debit,
       coalesce(sum(l.credit),0) as credit
from public.journal_events e left join public.journal_lines l on l.journal_id=e.id
 group by e.id,e.transaction_ref,e.event_kind
having count(l.id)<2 or coalesce(sum(l.debit),0)<>coalesce(sum(l.credit),0);
-- EXPECT: ZERO ROWS.

-- Transactions without any journal post. Should be empty after backfill.
select t.id,t.user_id,t.type,t.amount from public.transactions t
where not exists (select 1 from public.journal_events e where e.transaction_ref=t.id and e.event_kind='post');
-- EXPECT: ZERO ROWS.

select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and proname in ('my_account_balances','record_financial_event');
