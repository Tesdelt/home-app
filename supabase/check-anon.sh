#!/bin/sh
# Kontrola soukromí: nepřihlášený dotaz nesmí z žádné tabulky nic přečíst
# ani do ní zapsat. Používá jen veřejný (publishable) klíč z js/config.js.
#
#   sh supabase/check-anon.sh
#
# Každá nová tabulka patří do TABLES.

cd "$(dirname "$0")/.." || exit 1

URL=$(sed -n "s/.*SUPABASE_URL = '\(.*\)'.*/\1/p" js/config.js)
KEY=$(sed -n "s/.*SUPABASE_KEY = '\(.*\)'.*/\1/p" js/config.js)
TABLES="households household_members shopping_items shopping_history tasks payments shops push_subscriptions payment_reminders task_comments recipes wishes recipe_photos"
FAIL=0

for T in $TABLES; do
  OUT=$(curl -s -w '\n%{http_code}' "$URL/rest/v1/$T?select=*&limit=1" -H "apikey: $KEY")
  CODE=$(printf '%s' "$OUT" | tail -n 1)
  BODY=$(printf '%s' "$OUT" | sed '$d')
  case "$CODE" in
    404) echo "CHYBÍ  $T: tabulka neexistuje, spusťte nejdřív supabase/schema.sql"; FAIL=1 ;;
    200) if [ "$BODY" = "[]" ]; then echo "OK     $T: čtení vrací prázdný výsledek"
         else echo "POZOR  $T: nepřihlášený dotaz vrátil data!"; FAIL=1; fi ;;
    401|403) echo "OK     $T: čtení odmítnuto ($CODE)" ;;
    *)   echo "POZOR  $T: nečekaná odpověď ($CODE), databáze možná neběží"; FAIL=1 ;;
  esac

  CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$URL/rest/v1/$T" \
    -H "apikey: $KEY" -H "Content-Type: application/json" -d '{}')
  case "$CODE" in
    2*)  echo "POZOR  $T: nepřihlášený zápis prošel!"; FAIL=1 ;;
    404) ;;
    401|403) echo "OK     $T: zápis odmítnut ($CODE)" ;;
    *)   echo "POZOR  $T: nečekaná odpověď na zápis ($CODE)"; FAIL=1 ;;
  esac
done

[ "$FAIL" = 0 ] && echo "Vše v pořádku." || echo "Kontrola NEPROŠLA."
exit $FAIL
