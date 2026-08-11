# Backup

Backup verification begins in Phase 9. A job hashes a backup copy and compares it to the
original SHA-256 hash; its result is `PENDING`, `VERIFIED`, or `FAILED`.

## What is actually in place

- `backups/` holds a copy of both databases, taken before any recovery work.
- SQLite runs in WAL mode, which is what made it possible to recover accounts
  and messages after they were deleted on 11 Aug 2026.

## What is not in place, and matters

**There is no scheduled backup.** The recovery above worked because the
write-ahead log had not yet been checkpointed — that is luck, not a strategy,
and it will not work a second time.

Before this holds real production history it needs:

1. A nightly `VACUUM INTO` of both databases to a dated file.
2. Those files copied off this machine.
3. **A restore actually tested.** A backup nobody has restored is a guess.

This is the same point the plan makes: "A backup that has never been
restored/tested isn't something we should blindly trust."
