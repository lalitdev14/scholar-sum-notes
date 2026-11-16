#!/usr/bin/env bash
# Restores an encrypted LectureLoop backup into a Supabase database.
#
#   scripts/backup/restore.sh lectureloop-db-2026-11-16.tar.gz.gpg "postgresql://…target…"
#
# The target should be a NEW (empty) Supabase project, e.g. the backup project when
# production is unavailable. Asks for the backup passphrase (or reads BACKUP_PASSPHRASE).
# Requires: gpg, tar, psql (PostgreSQL 17 client).
set -euo pipefail

FILE="${1:?usage: restore.sh <backup.tar.gz.gpg> <target-db-url>}"
TARGET="${2:?usage: restore.sh <backup.tar.gz.gpg> <target-db-url>}"

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  read -rsp "Backup passphrase: " BACKUP_PASSPHRASE; echo
fi

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 -d "$FILE" 3<<<"$BACKUP_PASSPHRASE" \
  | tar -C "$WORK" -xzf -
DIR="$(find "$WORK" -mindepth 1 -maxdepth 1 -type d | head -1)"
echo "Restoring $(basename "$DIR") into the target database…"

read -rp "This writes into the target database. Type RESTORE to continue: " ok
[ "$ok" = "RESTORE" ] || { echo "Cancelled."; exit 1; }

# Same steps as Supabase's "migrate between projects" guide.
psql "$TARGET" --single-transaction --variable ON_ERROR_STOP=1 \
  --file "$DIR/roles.sql" \
  --file "$DIR/schema.sql" \
  --command 'SET session_replication_role = replica' \
  --file "$DIR/data.sql"
echo "Done. Point the app's SUPABASE_URL / keys at the restored project if you are failing over."
