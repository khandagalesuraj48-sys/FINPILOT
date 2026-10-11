-- Run this only if V1 schema already exists. New projects run schema.sql instead.
-- Never use on a live database without a tested backup.
begin;
alter table public.transactions add column if not exists due_date date;
alter table public.transactions drop constraint if exists transactions_source_check;
alter table public.transactions add constraint transactions_source_check check(source in ('manual','csv','recurring'));
create table if not exists public.recurring_rules (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120),
 type text not null check(type in ('expense','income')),
 amount numeric(16,2) not null check(amount>0),category text not null default 'Other',
 account_id uuid not null references public.accounts(id) on delete restrict,
 day_of_month int not null check(day_of_month between 1 and 28),
 starts_on date not null,ends_on date,active boolean not null default true,
 created_at timestamptz not null default now(),
 constraint recurring_range check(ends_on is null or ends_on>=starts_on)
);
create or replace function public.check_recurring_ownership() returns trigger language plpgsql set search_path=public as $$
begin
 if not exists(select 1 from public.accounts where id=new.account_id and user_id=new.user_id) then raise exception 'Invalid recurring account'; end if;
 return new;
end $$;
drop trigger if exists tr_recurring_owner on public.recurring_rules;
create trigger tr_recurring_owner before insert or update on public.recurring_rules for each row execute function public.check_recurring_ownership();
alter table public.recurring_rules enable row level security;
drop policy if exists owner_select on public.recurring_rules;
drop policy if exists owner_insert on public.recurring_rules;
drop policy if exists owner_update on public.recurring_rules;
drop policy if exists owner_delete on public.recurring_rules;
create policy owner_select on public.recurring_rules for select to authenticated using(user_id=(select auth.uid()));
create policy owner_insert on public.recurring_rules for insert to authenticated with check(user_id=(select auth.uid()));
create policy owner_update on public.recurring_rules for update to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy owner_delete on public.recurring_rules for delete to authenticated using(user_id=(select auth.uid()));
commit;
