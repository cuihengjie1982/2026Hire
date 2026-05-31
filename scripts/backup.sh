#!/bin/bash
# Database backup script — run via cron: 0 2 * * * /path/to/backup.sh
# All credentials come from environment variables — no hardcoded defaults.
#
# Required env vars:
#   DB_NAME       — database name
#   DB_USER       — database user
#   DB_PASSWORD   — database password
#   DB_HOST       — database host (e.g. eqdfyhqeqkbjvivscjau.supabase.co)
#
# Optional:
#   DB_PORT       — database port (default: 5432)
#   BACKUP_DIR    — where to store backups (default: ./backups)
#   RETENTION_DAYS — how long to keep backups (default: 30)
set -euo pipefail

# ── Validate required env vars ─────────────────────────────
: "${DB_NAME:?DB_NAME is required}"
: "${DB_USER:?DB_USER is required}"
: "${DB_PASSWORD:?DB_PASSWORD is required}"
: "${DB_HOST:?DB_HOST is required}"

DB_PORT="${DB_PORT:-5432}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup of ${DB_NAME}@${DB_HOST}:${DB_PORT}..."

PGPASSWORD="${DB_PASSWORD}" pg_dump \
  -h "$DB_HOST" \
  -p "$DB_PORT" \
  -U "$DB_USER" \
  -d "$DB_NAME" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  | gzip > "$FILENAME"

SIZE=$(du -h "$FILENAME" | cut -f1)
echo "[$(date)] Backup complete: ${FILENAME} (${SIZE})"

# Delete backups older than retention period
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +"${RETENTION_DAYS}" -delete
echo "[$(date)] Cleaned up backups older than ${RETENTION_DAYS} days"
