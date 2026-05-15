#!/bin/bash
# Database backup script — run via cron: 0 2 * * * /path/to/backup.sh
set -euo pipefail

DB_NAME="${DB_NAME:-Trai-main}"
DB_USER="${DB_USER:-Trai-main}"
DB_HOST="${DB_HOST:-localhost}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y%m%d_%H%M%S)
FILENAME="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.sql.gz"

echo "[$(date)] Starting backup of ${DB_NAME}..."

PGPASSWORD="${DB_PASSWORD:-Trai-main}" pg_dump \
  -h "$DB_HOST" \
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
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +${RETENTION_DAYS} -delete
echo "[$(date)] Cleaned up backups older than ${RETENTION_DAYS} days"
