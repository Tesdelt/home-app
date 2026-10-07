-- Domácnost: schéma databáze pro Supabase.
--
-- Spustit celé v Supabase -> SQL Editor. Skript se dá pustit opakovaně,
-- existující data nemaže.
--
-- Pravidla soukromí:
--   * RLS je zapnuté na KAŽDÉ tabulce.
--   * Číst i zapisovat smí jen přihlášený člen dané domácnosti.
--   * Role anon (nepřihlášený) nemá žádná práva.
--   * Domácnosti a jejich členy spravuje jen majitel projektu v SQL Editoru,
--     z appky je nejde měnit.

-- ---------- Tabulky ----------

create table if not exists public.households (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.household_members (
  user_id      uuid not null references auth.users (id) on delete cascade,
  household_id uuid not null references public.households (id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, household_id)
);

create index if not exists household_members_household_idx
  on public.household_members (household_id);

-- Nákupní seznam. Smazání je jen příznak deleted (kvůli offline frontě a Zpět).
create table if not exists public.shopping_items (
  id           uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null,
  qty          text not null default '',
  category     text,
  done         boolean not null default false,
  done_at      timestamptz,
  added_by     text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false
);

create index if not exists shopping_items_household_idx
  on public.shopping_items (household_id);

-- Historie nakupovaných věcí (našeptávač, často kupované, zapamatované kategorie)
create table if not exists public.shopping_history (
  household_id uuid not null references public.households (id) on delete cascade,
  key          text not null,
  name         text not null,
  category     text,
  count        integer not null default 0,
  last_at      timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (household_id, key)
);

-- Úkoly. Opakovaný úkol se dokončením neuzavře, jen se mu posune termín
-- (due) a zapíše se, kdo a kdy ho naposledy splnil. prev_due je termín před
-- posledním splněním, aby šlo odškrtnutí vrátit.
create table if not exists public.tasks (
  id           uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  title        text not null,
  assignee     text,
  due          date,
  repeat_every integer,
  repeat_unit  text check (repeat_unit in ('day', 'week', 'month', 'year')),
  repeat_mode  text check (repeat_mode in ('fixed', 'after')),
  done         boolean not null default false,
  done_at      timestamptz,
  done_by      text,
  prev_due     date,
  created_by   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false
);

create index if not exists tasks_household_idx on public.tasks (household_id);

-- Pravidelné platby. payer je jméno člena, nebo 'split' (napůl).
create table if not exists public.payments (
  id           uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null,
  amount       numeric(12, 2) not null default 0,
  period       text not null default 'month' check (period in ('month', 'quarter', 'year')),
  payer        text,
  due_day      integer check (due_day between 1 and 31),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false
);

create index if not exists payments_household_idx on public.payments (household_id);

-- ---------- Pomocné funkce ----------

-- Schéma private není vystavené přes API, funkce v něm nejdou volat zvenku.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

-- Domácnosti přihlášeného uživatele. SECURITY DEFINER, aby politika na
-- household_members nemusela číst sama sebe (nekonečná rekurze).
create or replace function private.my_household_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select household_id
  from public.household_members
  where user_id = (select auth.uid())
$$;

revoke all on function private.my_household_ids() from public, anon;
grant execute on function private.my_household_ids() to authenticated;

-- Konflikty: vyhrává novější updated_at. Starší zápis se tiše zahodí.
create or replace function private.keep_newer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at < old.updated_at then
    return null;
  end if;
  return new;
end;
$$;

drop trigger if exists shopping_items_keep_newer on public.shopping_items;
create trigger shopping_items_keep_newer
  before update on public.shopping_items
  for each row execute function private.keep_newer();

drop trigger if exists shopping_history_keep_newer on public.shopping_history;
create trigger shopping_history_keep_newer
  before update on public.shopping_history
  for each row execute function private.keep_newer();

drop trigger if exists tasks_keep_newer on public.tasks;
create trigger tasks_keep_newer
  before update on public.tasks
  for each row execute function private.keep_newer();

drop trigger if exists payments_keep_newer on public.payments;
create trigger payments_keep_newer
  before update on public.payments
  for each row execute function private.keep_newer();

-- ---------- Oprávnění rolí ----------
-- Nepřihlášený nesmí nic. Přihlášený jen to, co mu navíc dovolí RLS níže.

revoke all on public.households        from public, anon, authenticated;
revoke all on public.household_members from public, anon, authenticated;
revoke all on public.shopping_items    from public, anon, authenticated;
revoke all on public.shopping_history  from public, anon, authenticated;
revoke all on public.tasks             from public, anon, authenticated;
revoke all on public.payments          from public, anon, authenticated;

grant select on public.households        to authenticated;
grant select on public.household_members to authenticated;
grant select, insert, update, delete on public.shopping_items   to authenticated;
grant select, insert, update, delete on public.shopping_history to authenticated;
grant select, insert, update, delete on public.tasks            to authenticated;
grant select, insert, update, delete on public.payments         to authenticated;

-- ---------- RLS ----------

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.shopping_items    enable row level security;
alter table public.shopping_history  enable row level security;
alter table public.tasks             enable row level security;
alter table public.payments          enable row level security;

drop policy if exists "clen vidi svou domacnost" on public.households;
create policy "clen vidi svou domacnost" on public.households
  for select to authenticated
  using (id in (select private.my_household_ids()));

drop policy if exists "clen vidi cleny sve domacnosti" on public.household_members;
create policy "clen vidi cleny sve domacnosti" on public.household_members
  for select to authenticated
  using (household_id in (select private.my_household_ids()));

drop policy if exists "clen cte a zapisuje nakup" on public.shopping_items;
create policy "clen cte a zapisuje nakup" on public.shopping_items
  for all to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

drop policy if exists "clen cte a zapisuje historii" on public.shopping_history;
create policy "clen cte a zapisuje historii" on public.shopping_history
  for all to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

drop policy if exists "clen cte a zapisuje ukoly" on public.tasks;
create policy "clen cte a zapisuje ukoly" on public.tasks
  for all to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

drop policy if exists "clen cte a zapisuje platby" on public.payments;
create policy "clen cte a zapisuje platby" on public.payments
  for all to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

-- ---------- Realtime ----------
-- Živé změny chodí jen z datových tabulek a jen členům domácnosti (platí RLS).

do $$
declare
  t text;
begin
  foreach t in array array['shopping_items', 'shopping_history', 'tasks', 'payments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
