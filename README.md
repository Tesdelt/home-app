# Domácnost

Společný nákupní seznam (a brzy úkoly a peníze) pro naši domácnost. PWA bez build kroku,
data v prohlížeči (IndexedDB), funguje offline.

## Instalace na iPhone

1. Otevřít adresu appky v **Safari**.
2. **Sdílet** → **Přidat na plochu**.

## Vývoj

Statický web, stačí ho servírovat z kořene repozitáře:

```
python3 -m http.server 8000
```

Podrobnosti o struktuře a pravidlech jsou v [CLAUDE.md](CLAUDE.md).
