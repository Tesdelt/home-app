-- Jednorázově: založí domácnost a přidá do ní oba účty podle e-mailu.
--
-- 1. Účty musí už existovat (Authentication -> Users -> Add user).
-- 2. Dole doplňte oba e-maily místo TOM@EXAMPLE.COM a DOMI@EXAMPLE.COM.
-- 3. Spusťte v SQL Editoru. Když některý e-mail neexistuje, nic se nezaloží
--    a skript skončí chybou.
--
-- E-maily sem doplňujte jen v SQL Editoru, do repozitáře je neukládejte.

do $$
declare
  people constant jsonb := '[
    { "email": "TOM@EXAMPLE.COM",  "name": "Tom"  },
    { "email": "DOMI@EXAMPLE.COM", "name": "Domi" }
  ]';
  person jsonb;
  uid uuid;
  hid uuid;
begin
  select id into hid from public.households where name = 'Domácnost' limit 1;
  if hid is null then
    insert into public.households (name) values ('Domácnost') returning id into hid;
  end if;

  for person in select * from jsonb_array_elements(people) loop
    select id into uid from auth.users where lower(email) = lower(person->>'email');
    if uid is null then
      raise exception 'Účet s e-mailem % neexistuje. Založte ho v Authentication -> Users.', person->>'email';
    end if;

    insert into public.household_members (user_id, household_id, display_name)
    values (uid, hid, person->>'name')
    on conflict (user_id, household_id) do update set display_name = excluded.display_name;
  end loop;
end;
$$;

-- Kontrola: měly by vyjít dva řádky.
select h.name as domacnost, m.display_name, u.email
from public.household_members m
join public.households h on h.id = m.household_id
join auth.users u on u.id = m.user_id
order by m.display_name;
