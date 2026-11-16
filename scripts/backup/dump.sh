#!/usr/bin/env bash
# Dumps the production database (roles, schema, data incl. auth accounts) with the Supabase
# CLI, checks it, and writes one encrypted archive: lectureloop-db-<UTC date>.tar.gz.gpg
# Env: PROD_DB_URL, BACKUP_PASSPHRASE. Exports BACKUP_FILE / BACKUP_NAME to GITHUB_ENV.
set -euo pipefail

: "${PROD_DB_URL:?PROD_DB_URL is required}"
: "${BACKUP_PASSPHRASE:?BACKUP_PASSPHRASE is required}"

STAMP="$(date -u +%Y-%m-%d)"
NAME="lectureloop-db-${STAMP}"
DIR="backup/${NAME}"
mkdir -p "$DIR"

echo "Dumping roles, schema and data…"
supabase db dump --db-url "$PROD_DB_URL" -f "$DIR/roles.sql" --role-only
supabase db dump --db-url "$PROD_DB_URL" -f "$DIR/schema.sql"
supabase db dump --db-url "$PROD_DB_URL" -f "$DIR/data.sql" --use-copy --data-only

# Sanity checks: refuse to keep an empty or partial backup.
for f in roles.sql schema.sql data.sql; do
  [ -s "$DIR/$f" ] || { echo "::error::$f is empty"; exit 1; }
done
for table in public.notes public.classes public.profiles auth.users; do
  grep -q "COPY \"\?${table%%.*}\"\?\.\"\?${table#*.}\"\?" "$DIR/data.sql" \
    || { echo "::error::data.sql has no data section for $table"; exit 1; }
done
grep -q "CREATE TABLE" "$DIR/schema.sql" || { echo "::error::schema.sql has no tables"; exit 1; }

cat > "$DIR/README.txt" <<EOF
LectureLoop database backup — ${STAMP} (UTC)
Files: roles.sql, schema.sql, data.sql (Supabase CLI dump of the production database).
Restore into a NEW Supabase project with scripts/backup/restore.sh (see DEPLOYMENT.md).
EOF

FILE="${NAME}.tar.gz.gpg"
tar -C backup -czf - "$NAME" \
  | gpg --batch --yes --pinentry-mode loopback --passphrase-fd 3 \
        --symmetric --cipher-algo AES256 -o "$FILE" 3<<<"$BACKUP_PASSPHRASE"
rm -rf "$DIR"

SIZE=$(stat -c %s "$FILE")
echo "Encrypted backup: $FILE ($(numfmt --to=iec "$SIZE"))"
[ "$SIZE" -gt 10240 ] || { echo "::error::Backup is suspiciously small"; exit 1; }

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "BACKUP_FILE=$FILE" >> "$GITHUB_ENV"
  echo "BACKUP_NAME=$NAME" >> "$GITHUB_ENV"
fi
