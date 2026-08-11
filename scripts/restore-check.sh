#!/bin/bash
#
# Proves the newest backup can actually be restored.
#
# A backup nobody has restored is a guess. This copies the latest snapshot to a
# scratch file, opens it, and reads the tables that matter. It never touches
# the live databases.
#
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/backups"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

check_latest() {
  local name="$1"
  local newest
  newest="$(ls -t "$OUT/$name"-*.db 2>/dev/null | head -1)"
  if [ -z "$newest" ]; then echo "  FAIL  $name — no backup found"; return 1; fi

  cp "$newest" "$TMP/$name.db"
  local integrity
  integrity="$(sqlite3 "$TMP/$name.db" "PRAGMA integrity_check;" 2>&1)"
  if [ "$integrity" != "ok" ]; then echo "  FAIL  $name — $integrity"; return 1; fi

  local users age
  users="$(sqlite3 "$TMP/$name.db" "SELECT count(*) FROM User;" 2>&1)"
  age="$(( ($(date +%s) - $(stat -f %m "$newest" 2>/dev/null || stat -c %Y "$newest")) / 3600 ))"
  if ! [[ "$users" =~ ^[0-9]+$ ]] || [ "$users" -eq 0 ]; then
    echo "  FAIL  $name — restored but holds no accounts"; return 1
  fi
  echo "  PASS  $name — $users accounts, ${age}h old, $(basename "$newest")"
  [ "$age" -gt 48 ] && echo "        (warning: more than two days old — is the daily job running?)"
  return 0
}

echo "Restoring the newest backups into a scratch copy:"
status=0
check_latest workspace || status=1
check_latest chat || status=1
exit "$status"
