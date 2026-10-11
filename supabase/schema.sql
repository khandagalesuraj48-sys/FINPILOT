-- FINPILOT AI database migration. Run ONCE in Supabase SQL Editor.
-- Uses browser-safe publishable key + RLS. NEVER ship service_role keys to the client.
create extension if not exists pgcrypto;

create table if not exists public.accounts (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 100),kind text not null check(kind in ('bank','cash','wallet')),
 opening_balance numeric(16,2) not null default 0,created_at timestamptz not null default now()
);
create table if not exists public.contacts (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120),phone text,notes text,created_at timestamptz not null default now()
);
create table if not exists public.loans (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 name text not null,lender text not null default '',principal numeric(16,2) not null check(principal>0),
 annual_rate numeric(8,4) not null default 0 check(annual_rate>=0 and annual_rate<=200),
 emi_amount numeric(16,2) not null check(emi_amount>0),due_day integer not null check(due_day between 1 and 28),
 start_date date not null,created_at timestamptz not null default now()
);
create table if not exists public.transactions (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 type text not null check(type in ('expense','income','transfer','receivable','payable','repayment_in','repayment_out','loan_payment')),
 amount numeric(16,2) not null check(amount>0),description text not null default '',category text not null default 'Other',
 occurred_at timestamptz not null,from_account_id uuid references public.accounts(id) on delete restrict,
 to_account_id uuid references public.accounts(id) on delete restrict,contact_id uuid references public.contacts(id) on delete restrict,
 loan_id uuid references public.loans(id) on delete restrict,
 principal_component numeric(16,2) not null default 0 check(principal_component>=0),
 interest_component numeric(16,2) not null default 0 check(interest_component>=0),
 source text not null default 'manual' check(source in ('manual','csv','recurring')),
 import_hash text,due_date date,created_at timestamptz not null default now(),
 constraint financial_flow_shape check (
  (type in ('expense','receivable','repayment_out','loan_payment') and from_account_id is not null and to_account_id is null)
  or (type in ('income','payable','repayment_in') and to_account_id is not null and from_account_id is null)
  or (type='transfer' and from_account_id is not null and to_account_id is not null and from_account_id<>to_account_id)
 ),
 constraint financial_party_shape check ((type in ('receivable','payable','repayment_in','repayment_out') and contact_id is not null) or (type not in ('receivable','payable','repayment_in','repayment_out') and contact_id is null)),
 constraint financial_emi_shape check (
  (type='loan_payment' and loan_id is not null and principal_component+interest_component=amount)
  or (type<>'loan_payment' and loan_id is null and principal_component=0 and interest_component=0)
 )
);
create table if not exists public.attachments (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 transaction_id uuid not null references public.transactions(id) on delete cascade,
 storage_path text not null unique,file_name text not null,mime_type text not null,
 file_size integer not null check(file_size>0 and file_size<=10485760),created_at timestamptz not null default now(),
 constraint attachment_type_check check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf'))
);
create table if not exists public.budgets (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 category text not null,month text not null check(month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
 amount numeric(16,2) not null check(amount>0),created_at timestamptz not null default now(),unique(user_id,category,month)
);
-- Recurring rule templates are proposals, not authorization to transfer money.
create table if not exists public.recurring_rules (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(length(trim(name)) between 1 and 120),
 type text not null check(type in ('expense','income')),
 amount numeric(16,2) not null check(amount>0), category text not null default 'Other',
 account_id uuid not null references public.accounts(id) on delete restrict,
 day_of_month int not null check(day_of_month between 1 and 28),
 starts_on date not null, ends_on date, active boolean not null default true,
 created_at timestamptz not null default now(),
 constraint recurring_range check(ends_on is null or ends_on>=starts_on)
);
create or replace function public.check_recurring_ownership() returns trigger language plpgsql set search_path=public as $$
begin
 if not exists (select 1 from public.accounts where id=new.account_id and user_id=new.user_id) then raise exception 'Invalid recurring account'; end if;
 return new;
end $$;
drop trigger if exists tr_recurring_owner on public.recurring_rules;
create trigger tr_recurring_owner before insert or update on public.recurring_rules
for each row execute function public.check_recurring_ownership();

create index if not exists transactions_user_date_idx on public.transactions(user_id,occurred_at desc);
create index if not exists transactions_contact_idx on public.transactions(user_id,contact_id);
create index if not exists transactions_loan_idx on public.transactions(user_id,loan_id);
create unique index if not exists transactions_import_hash_unique on public.transactions(user_id,import_hash) where import_hash is not null;
create index if not exists attachments_tx_idx on public.attachments(user_id,transaction_id);

-- Validate foreign keys refer to records owned by the SAME user.
create or replace function public.check_transaction_ownership() returns trigger language plpgsql set search_path=public as $$
begin
 if new.from_account_id is not null and not exists (select 1 from public.accounts a where a.id=new.from_account_id and a.user_id=new.user_id) then raise exception 'Invalid source account'; end if;
 if new.to_account_id is not null and not exists (select 1 from public.accounts a where a.id=new.to_account_id and a.user_id=new.user_id) then raise exception 'Invalid destination account'; end if;
 if new.contact_id is not null and not exists (select 1 from public.contacts a where a.id=new.contact_id and a.user_id=new.user_id) then raise exception 'Invalid contact'; end if;
 if new.loan_id is not null and not exists (select 1 from public.loans a where a.id=new.loan_id and a.user_id=new.user_id) then raise exception 'Invalid loan'; end if;
 return new;
end $$;
drop trigger if exists tr_finance_references on public.transactions;
create trigger tr_finance_references before insert or update on public.transactions for each row execute function public.check_transaction_ownership();
create or replace function public.check_attachment_ownership() returns trigger language plpgsql set search_path=public as $$
begin
 if not exists (select 1 from public.transactions t where t.id=new.transaction_id and t.user_id=new.user_id) then raise exception 'Invalid attachment transaction'; end if;
 if split_part(new.storage_path,'/',1)<>new.user_id::text then raise exception 'Invalid storage path'; end if;
 return new;
end $$;
drop trigger if exists tr_attachment_owner on public.attachments;
create trigger tr_attachment_owner before insert or update on public.attachments for each row execute function public.check_attachment_ownership();

alter table public.accounts enable row level security;
alter table public.contacts enable row level security;
alter table public.loans enable row level security;
alter table public.transactions enable row level security;
alter table public.attachments enable row level security;
alter table public.budgets enable row level security;
alter table public.recurring_rules enable row level security;

-- Each workspace in V1 = one private user's book. All access requires auth.uid().
do $$ declare tab text; begin
 foreach tab in array array['accounts','contacts','loans','transactions','attachments','budgets','recurring_rules'] loop
  execute format('drop policy if exists owner_select on public.%I',tab);
  execute format('drop policy if exists owner_insert on public.%I',tab);
  execute format('drop policy if exists owner_update on public.%I',tab);
  execute format('drop policy if exists owner_delete on public.%I',tab);
  execute format('create policy owner_select on public.%I for select to authenticated using (user_id=(select auth.uid()))',tab);
  execute format('create policy owner_insert on public.%I for insert to authenticated with check (user_id=(select auth.uid()))',tab);
  execute format('create policy owner_update on public.%I for update to authenticated using (user_id=(select auth.uid())) with check (user_id=(select auth.uid()))',tab);
  execute format('create policy owner_delete on public.%I for delete to authenticated using (user_id=(select auth.uid()))',tab);
 end loop;
end $$;

-- Private receipt bucket. Supabase Storage applies size and MIME limits at upload.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('receipts','receipts',false,10485760,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists receipt_read on storage.objects;
drop policy if exists receipt_upload on storage.objects;
drop policy if exists receipt_remove on storage.objects;
create policy receipt_read on storage.objects for select to authenticated
 using(bucket_id='receipts' and split_part(name,'/',1)=(select auth.uid())::text);
create policy receipt_upload on storage.objects for insert to authenticated
 with check(bucket_id='receipts' and split_part(name,'/',1)=(select auth.uid())::text);
create policy receipt_remove on storage.objects for delete to authenticated
 using(bucket_id='receipts' and split_part(name,'/',1)=(select auth.uid())::text);

-- Optional account deletion: app first deletes the user's files through Storage API.
-- Does NOT delete raw storage.objects records (doing so is unsupported).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path=public as $$
declare who uuid := auth.uid();
begin
 if who is null then raise exception 'Not authenticated'; end if;
 if exists(select 1 from storage.objects where bucket_id='receipts' and split_part(name,'/',1)=who::text) then
  raise exception 'Delete all uploaded receipts before deleting your account';
 end if;
 delete from auth.users where id=who;
end $$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
