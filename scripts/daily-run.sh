#!/bin/zsh
# TiivisKoti — aamun kuntotarkistus (launchd ajaa tämän joka aamu klo 8).
#
# Ajaa: npm run check (sivusto, linkit, varausrajapinta, CRM, Meta- ja Google-mainokset)
#       npm run check:varaus (varauspolku oikeassa Chromessa, EI tee oikeaa varausta)
# Raportti: ~/Library/Logs/tiiviskoti-check/YYYY-MM-DD.txt
# Ilmoitus: macOS-ilmoitus aina; jos FAIL, raportti avautuu myös näytölle.
#
# Asennus/poisto: ks. scripts/fi.tiiviskoti.daily-check.plist

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
ROOT="$HOME/projects/loppusiivous-main-new"
LOGDIR="$HOME/Library/Logs/tiiviskoti-check"
mkdir -p "$LOGDIR"
OUT="$LOGDIR/$(date +%F).txt"

cd "$ROOT" || exit 1
{
  node scripts/daily-check.mjs --verbose
  echo
  node scripts/varaus-testi.mjs
} 2>&1 | sed -E 's/\x1b\[[0-9;]*m//g' > "$OUT"

FAILS=$(grep -cE '^FAIL' "$OUT")
WARNS=$(grep -cE '^WARN' "$OUT")
# Kaatunut skripti ei tulosta FAIL-rivejä → tunnista puuttuvasta yhteenvedosta.
SUMMARIES=$(grep -cE '[0-9]+ FAIL · [0-9]+ WARN' "$OUT")
if [ "$SUMMARIES" -lt 2 ]; then FAILS=$((FAILS + 1)); echo "\nFAIL tarkistus kaatui kesken — katso yllä" >> "$OUT"; fi

if [ "$FAILS" -gt 0 ]; then
  osascript -e "display notification \"$FAILS virhettä, $WARNS varoitusta — raportti auki\" with title \"TiivisKoti: VIKA\" sound name \"Basso\""
  open -a TextEdit "$OUT"
else
  osascript -e "display notification \"Kaikki kunnossa ($WARNS huomautusta). Raportti: $OUT\" with title \"TiivisKoti: OK\""
fi
