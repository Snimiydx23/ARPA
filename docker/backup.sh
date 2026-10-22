#!/bin/sh
# ARPA — daily PostgreSQL backups (runs inside the "backup" service of docker-compose.yml).
# Writes /backups/arpa-YYYYMMDD-HHMMSS.sql.gz every BACKUP_INTERVAL_HOURS (default 24) and keeps BACKUP_KEEP_DAYS (default 14).
# Restore:  gunzip -c backups/arpa-....sql.gz | docker compose exec -T db psql -U arpa -d arpa
set -eu
: "${PGHOST:=db}" "${PGUSER:=arpa}" "${PGDATABASE:=arpa}"
interval=$(( ${BACKUP_INTERVAL_HOURS:-24} * 3600 ))
keep="${BACKUP_KEEP_DAYS:-14}"
mkdir -p /backups
while true; do
  f="/backups/arpa-$(date +%Y%m%d-%H%M%S).sql.gz"
  # pg_dump compresses itself (-Z 9) so a failed dump is reported as a failure (no pipe hiding its exit code)
  if pg_dump --no-owner --no-privileges -Z 9 -f "$f.tmp"; then
    mv "$f.tmp" "$f"
    echo "$(date -u +%FT%TZ) backup ok: $f ($(du -h "$f" | cut -f1))"
  else
    rm -f "$f.tmp"
    echo "$(date -u +%FT%TZ) backup FAILED" >&2
  fi
  find /backups -name 'arpa-*.sql.gz' -mtime +"$keep" -delete
  sleep "$interval"
done
