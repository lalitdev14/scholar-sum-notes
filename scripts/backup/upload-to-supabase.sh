#!/usr/bin/env bash
# Uploads an encrypted backup to the backup Supabase project's private "db-backups" bucket
# and deletes backups older than KEEP_DAYS (default 30).
# Usage: upload-to-supabase.sh <file>
# Env: BACKUP_SUPABASE_URL, BACKUP_SUPABASE_SERVICE_KEY, KEEP_DAYS
set -euo pipefail

FILE="${1:?usage: upload-to-supabase.sh <file>}"
: "${BACKUP_SUPABASE_URL:?BACKUP_SUPABASE_URL is required}"
: "${BACKUP_SUPABASE_SERVICE_KEY:?BACKUP_SUPABASE_SERVICE_KEY is required}"
KEEP_DAYS="${KEEP_DAYS:-30}"
BUCKET="db-backups"
URL="${BACKUP_SUPABASE_URL%/}"
KEY="$BACKUP_SUPABASE_SERVICE_KEY"

# New "sb_secret_" keys go in the apikey header only; legacy JWT keys also as a bearer token.
AUTH=(-H "apikey: $KEY")
if [[ "$KEY" != sb_secret_* ]]; then AUTH+=(-H "Authorization: Bearer $KEY"); fi

api() { curl -sS --fail-with-body --retry 3 "${AUTH[@]}" "$@"; }

# Create the private bucket on first run (an "already exists" answer is fine).
curl -sS "${AUTH[@]}" -H "Content-Type: application/json" -X POST "$URL/storage/v1/bucket" \
  -d "{\"id\":\"$BUCKET\",\"name\":\"$BUCKET\",\"public\":false}" >/dev/null || true

echo "Uploading $(basename "$FILE")…"
api -X POST "$URL/storage/v1/object/$BUCKET/$(basename "$FILE")" \
  -H "x-upsert: true" -H "Content-Type: application/octet-stream" \
  --data-binary @"$FILE" >/dev/null

# Confirm it's there with the right size.
REMOTE_SIZE=$(api -X POST "$URL/storage/v1/object/list/$BUCKET" -H "Content-Type: application/json" \
  -d "{\"prefix\":\"\",\"limit\":1000,\"search\":\"$(basename "$FILE")\"}" \
  | python3 -c "import sys,json; r=json.load(sys.stdin); print(r[0]['metadata']['size'] if r else 0)")
LOCAL_SIZE=$(stat -c %s "$FILE")
[ "$REMOTE_SIZE" = "$LOCAL_SIZE" ] || { echo "::error::Upload check failed ($REMOTE_SIZE vs $LOCAL_SIZE bytes)"; exit 1; }
echo "Stored in $BUCKET ($LOCAL_SIZE bytes)."

# Prune backups older than KEEP_DAYS (names carry the UTC date).
CUTOFF=$(date -u -d "-$KEEP_DAYS days" +%Y-%m-%d)
OLD=$(api -X POST "$URL/storage/v1/object/list/$BUCKET" -H "Content-Type: application/json" \
  -d '{"prefix":"","limit":1000,"sortBy":{"column":"name","order":"asc"}}' \
  | python3 -c "
import sys, json, re
cutoff = sys.argv[1]
old = [o['name'] for o in json.load(sys.stdin)
       if (m := re.match(r'lectureloop-db-(\d{4}-\d{2}-\d{2})', o['name'])) and m.group(1) < cutoff]
print(json.dumps(old))" "$CUTOFF")
if [ "$OLD" != "[]" ]; then
  echo "Removing backups older than $CUTOFF: $OLD"
  api -X DELETE "$URL/storage/v1/object/$BUCKET" -H "Content-Type: application/json" \
    -d "{\"prefixes\":$OLD}" >/dev/null
fi
