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

-- 0.4.0: poznámka, důležitost 1-3 a kdo už odškrtl úkol pro oba
-- (assignee = 'both', hotovo je až po odškrtnutí všemi členy)
alter table public.tasks add column if not exists note text;
alter table public.tasks add column if not exists priority integer not null default 2;
alter table public.tasks add column if not exists done_parts text[] not null default '{}';

-- 0.6.0: kroky úkolu, pole objektů { id, title, due, done, doneAt, doneBy }.
-- Termín úkolu (due) se řídí prvním nesplněným krokem.
alter table public.tasks add column if not exists steps jsonb not null default '[]';

-- Komentáře k úkolům. Vlastní tabulka, aby se komentáře obou lidí
-- napsané ve stejnou chvíli navzájem nepřepsaly.
create table if not exists public.task_comments (
  id           uuid primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  task_id      uuid not null,
  author       text,
  body         text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false
);

create index if not exists task_comments_household_idx on public.task_comments (household_id);

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

-- 0.4.0: druh platby a odškrtávání "zaplaceno"
--   kind        'recurring' pravidelná, 'once' jednorázová, 'term' pravidelná po dobu X
--   next_due    nejbližší splatnost, zaplacením se posune o period
--   total_count / remaining   kolik plateb celkem a kolik zbývá (jen 'term')
--   done        jednorázová zaplacena, nebo 'term' doplacena
alter table public.payments add column if not exists kind text not null default 'recurring';
alter table public.payments add column if not exists next_due date;
alter table public.payments add column if not exists total_count integer;
alter table public.payments add column if not exists remaining integer;
alter table public.payments add column if not exists done boolean not null default false;
alter table public.payments add column if not exists paid_at timestamptz;
alter table public.payments add column if not exists paid_by text;

-- Obchody: pořadí kategorií nákupu podle toho, jak se obchod prochází.
-- key je buď vestavěný obchod z appky ('albert', 'lidl'), nebo vlastní id.
create table if not exists public.shops (
  household_id uuid not null references public.households (id) on delete cascade,
  key          text not null,
  name         text not null,
  category_order text[] not null default '{}',
  updated_at   timestamptz not null default now(),
  deleted      boolean not null default false,
  primary key (household_id, key)
);

-- Push notifikace: adresy, na které se telefonům posílají upozornění.
-- Každý vidí a mění jen své vlastní odběry.
create table if not exists public.push_subscriptions (
  endpoint     text primary key,
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  p256dh       text not null,
  auth         text not null,
  created_at   timestamptz not null default now()
);

create index if not exists push_subscriptions_household_idx
  on public.push_subscriptions (household_id);

-- Které platbě už dnes šlo upozornění (ať nechodí dvakrát). Zapisuje jen
-- funkce send-reminders servisním klíčem, z appky se sem nikdo nedostane:
-- RLS je zapnuté a žádná politika neexistuje.
create table if not exists public.payment_reminders (
  payment_id uuid not null references public.payments (id) on delete cascade,
  day        date not null,
  primary key (payment_id, day)
);

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

drop trigger if exists shops_keep_newer on public.shops;
create trigger shops_keep_newer
  before update on public.shops
  for each row execute function private.keep_newer();

drop trigger if exists task_comments_keep_newer on public.task_comments;
create trigger task_comments_keep_newer
  before update on public.task_comments
  for each row execute function private.keep_newer();

-- ---------- Oprávnění rolí ----------
-- Nepřihlášený nesmí nic. Přihlášený jen to, co mu navíc dovolí RLS níže.

revoke all on public.households        from public, anon, authenticated;
revoke all on public.household_members from public, anon, authenticated;
revoke all on public.shopping_items    from public, anon, authenticated;
revoke all on public.shopping_history  from public, anon, authenticated;
revoke all on public.tasks             from public, anon, authenticated;
revoke all on public.payments          from public, anon, authenticated;
revoke all on public.shops             from public, anon, authenticated;
revoke all on public.task_comments     from public, anon, authenticated;
revoke all on public.push_subscriptions from public, anon, authenticated;
revoke all on public.payment_reminders  from public, anon, authenticated;

grant select on public.households        to authenticated;
grant select on public.household_members to authenticated;
grant select, insert, update, delete on public.shopping_items   to authenticated;
grant select, insert, update, delete on public.shopping_history to authenticated;
grant select, insert, update, delete on public.tasks            to authenticated;
grant select, insert, update, delete on public.payments         to authenticated;
grant select, insert, update, delete on public.shops            to authenticated;
grant select, insert, update, delete on public.task_comments    to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ---------- RLS ----------

alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.shopping_items    enable row level security;
alter table public.shopping_history  enable row level security;
alter table public.tasks             enable row level security;
alter table public.payments          enable row level security;
alter table public.shops             enable row level security;
alter table public.task_comments     enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.payment_reminders  enable row level security;

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

drop policy if exists "clen cte a zapisuje obchody" on public.shops;
create policy "clen cte a zapisuje obchody" on public.shops
  for all to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

drop policy if exists "clen cte a zapisuje komentare" on public.task_comments;
create policy "clen cte a zapisuje komentare" on public.task_comments
  for all to authenticated
  using (household_id in (select private.my_household_ids()))
  with check (household_id in (select private.my_household_ids()));

drop policy if exists "kazdy jen sve odbery" on public.push_subscriptions;
create policy "kazdy jen sve odbery" on public.push_subscriptions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and household_id in (select private.my_household_ids()));

-- ---------- Realtime ----------
-- Živé změny chodí jen z datových tabulek a jen členům domácnosti (platí RLS).

do $$
declare
  t text;
begin
  foreach t in array array['shopping_items', 'shopping_history', 'tasks', 'payments', 'shops', 'task_comments'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
