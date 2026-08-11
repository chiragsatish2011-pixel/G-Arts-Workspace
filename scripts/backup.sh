#!/bin/bash
#
# Backs up both databases.
#
# `VACUUM INTO` is used rather than `cp`: it takes a consistent snapshot of a
# live database, including anything still sitting in the write-ahead log. A
# plain copy of a database being written to can capture a torn page, and the
# copy would look fine until the day you needed it.
#
# Run daily. Add to crontab with:
#   0 2 * * * "/Users/artsbanglore/Documents/G-arts Workspace/scripts/backup.sh"
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/backups"
STAMP="$(date +%Y%m%d-%H%M%S)"
KEEP_DAYS=30
LOG="$OUT/backup.log"

mkdir -p "$OUT"

note() { printf '%s  %s\n' "$(date '+%Y-%m-%d %H:%M:%S')" "$1" | tee -a "$LOG"; }

backup_one() {
  local name="$1" src="$2" dest="$OUT/$1-$STAMP.db"
  if [ ! -f "$src" ]; then note "SKIP $name — no database at $src"; return 1; fi
  if ! sqlite3 "$src" "VACUUM INTO '$dest'" 2>>"$LOG"; then
    note "FAILED $name — VACUUM INTO did not complete"; return 1
  fi
  # A backup that cannot be opened is not a backup. Check it before trusting it.
  local check rows
  check="$(sqlite3 "$dest" "PRAGMA integrity_check;" 2>>"$LOG")"
  if [ "$check" != "ok" ]; then note "FAILED $name — integrity check said: $check"; rm -f "$dest"; return 1; fi
  rows="$(sqlite3 "$dest" "SELECT count(*) FROM User;" 2>/dev/null || echo '?')"
  note "OK $name — $(du -h "$dest" | cut -f1), $rows accounts, integrity ok"
}

status=0
backup_one workspace "$ROOT/apps/api/prisma/dev.db" || status=1
backup_one chat "$ROOT/packages/chat-db/prisma/dev.db" || status=1

# Uploaded files are not in either database.
if [ -d "$ROOT/apps/chat-api/uploads" ]; then
  tar -czf "$OUT/uploads-$STAMP.tar.gz" -C "$ROOT/apps/chat-api" uploads 2>>"$LOG" \
    && note "OK uploads — $(du -h "$OUT/uploads-$STAMP.tar.gz" | cut -f1)" \
    || { note "FAILED uploads"; status=1; }
fi

find "$OUT" -name '*.db' -mtime "+$KEEP_DAYS" -delete 2>/dev/null
find "$OUT" -name '*.tar.gz' -mtime "+$KEEP_DAYS" -delete 2>/dev/null
note "kept $(find "$OUT" -name '*.db' | wc -l | tr -d ' ') database snapshots (last $KEEP_DAYS days)"

if [ "$status" -ne 0 ]; then note "FINISHED WITH FAILURES"; fi
exit "$status"
