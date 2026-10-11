-- FINPILOT V2 • additive migration. BACK UP DATABASE and test in staging FIRST.
-- Run only after schema.sql (and upgrade_v1_to_v1_1.sql for an existing V1 database).
-- Does not overwrite user transactions or receipts.
begin;

-- Liability accounts: negative tracked balance means amount payable to card issuer.
alter table public.accounts drop constraint if exists accounts_kind_check;
alter table public.accounts add constraint accounts_kind_check check (kind in ('bank','cash','wallet','credit_card'));

create table if not exists public.card_profiles (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 account_id uuid not null unique references public.accounts(id) on delete cascade,
 issuer text not null default '', last_four text not null default '' check (last_four ~ '^([0-9]{4})?$'),
 credit_limit numeric(16,2) not null check (credit_limit>0),
 statement_day int not null check (statement_day between 1 and 28),
 due_day int not null check (due_day between 1 and 28),
 annual_rate numeric(7,3) not null default 0 check (annual_rate between 0 and 200),
 created_at timestamptz not null default now()
);
create table if not exists public.savings_goals (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(trim(name)) between 1 and 120),
 target_amount numeric(16,2) not null check(target_amount>0),
 saved_amount numeric(16,2) not null default 0 check(saved_amount>=0),
 target_date date, color text not null default 'mint', created_at timestamptz not null default now()
);
create index if not exists card_profiles_user_idx on public.card_profiles(user_id);
create index if not exists savings_goals_user_idx on public.savings_goals(user_id);

create or replace function public.validate_card_profile_owner() returns trigger
language plpgsql set search_path = '' as $$
begin
 if not exists (select 1 from public.accounts a where a.id=new.account_id and a.user_id=new.user_id and a.kind='credit_card') then
  raise exception 'Card profile must reference a credit-card account belonging to this user';
 end if;
 return new;
end $$;
drop trigger if exists tr_card_profile_owner on public.card_profiles;
create trigger tr_card_profile_owner before insert or update on public.card_profiles for each row execute function public.validate_card_profile_owner();

alter table public.card_profiles enable row level security;
alter table public.savings_goals enable row level security;
do $$ declare t text; begin
 foreach t in array array['card_profiles','savings_goals'] loop
  execute format('drop policy if exists owner_select on public.%I',t);
  execute format('drop policy if exists owner_insert on public.%I',t);
  execute format('drop policy if exists owner_update on public.%I',t);
  execute format('drop policy if exists owner_delete on public.%I',t);
  execute format('create policy owner_select on public.%I for select to authenticated using (user_id=(select auth.uid()))',t);
  execute format('create policy owner_insert on public.%I for insert to authenticated with check (user_id=(select auth.uid()))',t);
  execute format('create policy owner_update on public.%I for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()))',t);
  execute format('create policy owner_delete on public.%I for delete to authenticated using (user_id=(select auth.uid()))',t);
 end loop;
end $$;

-- Append-only event ledger. Clients have SELECT only; all writes occur through
-- transaction triggers executing with a locked search path.
create table if not exists public.journal_events (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 transaction_ref uuid not null, event_kind text not null check(event_kind in ('post','reverse')),
 source_type text not null, occurred_at timestamptz not null,
 recorded_at timestamptz not null default now()
);
create table if not exists public.journal_lines (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 journal_id uuid not null references public.journal_events(id) on delete cascade,
 ledger_key text not null,
 debit numeric(16,2) not null default 0 check(debit>=0),
 credit numeric(16,2) not null default 0 check(credit>=0),
 constraint journal_line_one_side check ((debit>0 and credit=0) or (credit>0 and debit=0))
);
create index if not exists journal_events_user_time_idx on public.journal_events(user_id,recorded_at desc);
create index if not exists journal_events_tx_idx on public.journal_events(user_id,transaction_ref);
create index if not exists journal_lines_journal_idx on public.journal_lines(journal_id);
create index if not exists journal_lines_user_key_idx on public.journal_lines(user_id,ledger_key);
alter table public.journal_events enable row level security;
alter table public.journal_lines enable row level security;
drop policy if exists journal_events_reader on public.journal_events;
drop policy if exists journal_lines_reader on public.journal_lines;
create policy journal_events_reader on public.journal_events for select to authenticated using (user_id=(select auth.uid()));
create policy journal_lines_reader on public.journal_lines for select to authenticated using (user_id=(select auth.uid()));
revoke all on public.journal_events, public.journal_lines from anon, authenticated;
grant select on public.journal_events, public.journal_lines to authenticated;

-- A journal event must contain exactly balanced, positive posting lines.
-- `reverse` swaps debits and credits and never destroys original evidence.
-- Journal events describe transaction movements; opening balances and original
-- loan disbursements remain separate book-opening inputs, NOT full audited equity.
create or replace function public.record_financial_event(p_tx public.transactions, p_reverse boolean)
returns void language plpgsql security definer set search_path = '' as $$
declare
 eid uuid; asset_out text; asset_in text; contact_ledger text; loan_ledger text;
 from_kind text; to_kind text;
 debits numeric(16,2); credits numeric(16,2); rows_count int;
begin
 insert into public.journal_events(user_id,transaction_ref,event_kind,source_type,occurred_at)
 values(p_tx.user_id,p_tx.id,case when p_reverse then 'reverse' else 'post' end,p_tx.type,p_tx.occurred_at)
 returning id into eid;
 -- A credit-card balance is a liability, while cash/bank/wallet are assets.
 if p_tx.from_account_id is not null then
  select a.kind into from_kind from public.accounts a where a.id=p_tx.from_account_id and a.user_id=p_tx.user_id;
  if from_kind is null then raise exception 'Unknown transaction source account'; end if;
 end if;
 if p_tx.to_account_id is not null then
  select a.kind into to_kind from public.accounts a where a.id=p_tx.to_account_id and a.user_id=p_tx.user_id;
  if to_kind is null then raise exception 'Unknown transaction destination account'; end if;
 end if;
 asset_out:=(case when from_kind='credit_card' then 'liability:card:' else 'asset:' end)||coalesce(p_tx.from_account_id::text,'');
 asset_in:=(case when to_kind='credit_card' then 'liability:card:' else 'asset:' end)||coalesce(p_tx.to_account_id::text,'');
 contact_ledger:='counterparty:'||coalesce(p_tx.contact_id::text,'');
 loan_ledger:='liability:loan:'||coalesce(p_tx.loan_id::text,'');

 -- First build the non-reversed ledger positions (balanced by construction).
 if p_tx.type='expense' then
  insert into public.journal_lines(user_id,journal_id,ledger_key,debit) values(p_tx.user_id,eid,'expense:'||p_tx.category,p_tx.amount);
  insert into public.journal_lines(user_id,journal_id,ledger_key,credit) values(p_tx.user_id,eid,asset_out,p_tx.amount);
 elsif p_tx.type='income' then
  insert into public.journal_lines(user_id,journal_id,ledger_key,debit) values(p_tx.user_id,eid,asset_in,p_tx.amount);
  insert into public.journal_lines(user_id,journal_id,ledger_key,credit) values(p_tx.user_id,eid,'income:'||p_tx.category,p_tx.amount);
 elsif p_tx.type='transfer' then
  insert into public.journal_lines(user_id,journal_id,ledger_key,debit) values(p_tx.user_id,eid,asset_in,p_tx.amount);
  insert into public.journal_lines(user_id,journal_id,ledger_key,credit) values(p_tx.user_id,eid,asset_out,p_tx.amount);
 elsif p_tx.type='receivable' then
  insert into public.journal_lines(user_id,journal_id,ledger_key,debit) values(p_tx.user_id,eid,'receivable:'||contact_ledger,p_tx.amount);
  insert into public.journal_lines(user_id,journal_id,ledger_key,credit) values(p_tx.user_id,eid,asset_out,p_tx.amount);
 elsif p_tx.type='repayment_in' then
  insert into public.journal_lines(user_id,journal_id,ledger_key,debit) values(p_tx.user_id,eid,asset_in,p_tx.amount);
  insert into public.journal_lines(user_id,journal_id,ledger_key,credit) values(p_tx.user_id,eid,'receivable:'||contact_ledger,p_tx.amount);
 elsif p_tx.type='payable' then
  insert into public.journal_lines(user_id,journal_id,ledger_key,debit) values(p_tx.user_id,eid,asset_in,p_tx.amount);
  insert into public.journal_lines(user_id,journal_id,ledger_key,credit) values(p_tx.user_id,eid,'payable:'||contact_ledger,p_tx.amount);
 elsif p_tx.type='repayment_out' then
  insert into public.journal_lines(user_id,journal_id,ledger_key,debit) values(p_tx.user_id,eid,'payable:'||contact_ledger,p_tx.amount);
  insert into public.journal_lines(user_id,journal_id,ledger_key,credit) values(p_tx.user_id,eid,asset_out,p_tx.amount);
 elsif p_tx.type='loan_payment' then
  if p_tx.principal_component>0 then
   insert into public.journal_lines(user_id,journal_id,ledger_key,debit) values(p_tx.user_id,eid,loan_ledger,p_tx.principal_component);
  end if;
  if p_tx.interest_component>0 then
   insert into public.journal_lines(user_id,journal_id,ledger_key,debit) values(p_tx.user_id,eid,'expense:Loan Interest',p_tx.interest_component);
  end if;
  insert into public.journal_lines(user_id,journal_id,ledger_key,credit) values(p_tx.user_id,eid,asset_out,p_tx.amount);
 else
  raise exception 'Unknown transaction type %', p_tx.type;
 end if;

 if p_reverse then
  -- Only the trusted definer can update these immutable-to-users rows.
  update public.journal_lines set debit=credit,credit=debit where journal_id=eid;
 end if;
 select coalesce(sum(debit),0),coalesce(sum(credit),0),count(*) into debits,credits,rows_count from public.journal_lines where journal_id=eid;
 if debits<>credits or rows_count<2 or debits<=0 then raise exception 'Unbalanced financial event %',eid; end if;
end $$;

create or replace function public.journal_on_transaction_change()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if tg_op='INSERT' then
  perform public.record_financial_event(new,false);
 elsif tg_op='UPDATE' then
  if old is distinct from new then
   perform public.record_financial_event(old,true);
   perform public.record_financial_event(new,false);
  end if;
 elsif tg_op='DELETE' then
  perform public.record_financial_event(old,true);
 end if;
 return null;
end $$;
revoke all on function public.record_financial_event(public.transactions,boolean) from public, anon, authenticated;
revoke all on function public.journal_on_transaction_change() from public, anon, authenticated;
drop trigger if exists tr_finance_journal on public.transactions;
create trigger tr_finance_journal after insert or update or delete on public.transactions
for each row execute function public.journal_on_transaction_change();

-- Backfill only records not yet posted. Safe if a migration is re-run.
do $$ declare row_tx public.transactions%rowtype; begin
 for row_tx in select t.* from public.transactions t
 where not exists (select 1 from public.journal_events e where e.transaction_ref=t.id and e.event_kind='post')
 loop perform public.record_financial_event(row_tx,false); end loop;
end $$;

-- Queryable financial position computed on server, using PostgreSQL NUMERIC arithmetic.
create or replace function public.my_account_balances()
returns table(account_id uuid, balance numeric) language sql stable security invoker set search_path = '' as $$
 select a.id, a.opening_balance + coalesce((
  select sum(case when t.to_account_id=a.id then t.amount else -t.amount end)
  from public.transactions t
  where t.user_id=auth.uid() and (t.to_account_id=a.id or t.from_account_id=a.id)
 ),0) as balance
 from public.accounts a where a.user_id=auth.uid()
$$;
revoke all on function public.my_account_balances() from public, anon;
grant execute on function public.my_account_balances() to authenticated;

commit;
