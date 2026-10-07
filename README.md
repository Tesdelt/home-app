# Domácnost

Společný nákupní seznam (a brzy úkoly a peníze) pro naši domácnost. PWA bez build kroku,
funguje offline. Data se sdílí mezi telefony přes Supabase a vidí je jen přihlášení
členové domácnosti.

## Instalace na iPhone

1. Otevřít adresu appky v **Safari**.
2. **Sdílet** → **Přidat na plochu**.

3. Přihlásit se e-mailem a heslem. Účty zakládá správce v Supabase, registrace v appce není.

## Supabase

1. SQL Editor: spustit `supabase/schema.sql`.
2. Authentication → Users: založit oba účty.
3. SQL Editor: doplnit e-maily do `supabase/setup-household.sql` a spustit.
4. Ověřit: `sh supabase/check-anon.sh`.

## Vývoj

Statický web, stačí ho servírovat z kořene repozitáře:

```
python3 -m http.server 8000
```

Podrobnosti o struktuře a pravidlech jsou v [CLAUDE.md](CLAUDE.md).
