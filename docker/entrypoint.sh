#!/bin/sh
# ARPA container start-up:
#   1. wait until PostgreSQL accepts connections
#   2. create / update tables from prisma/schema.prisma (same as the Vercel build step; never drops data —
#      if a change would lose data, it stops and tells you instead)
#   3. start the Next.js server
# Set SKIP_DB_PUSH=1 to skip step 2 (e.g. when you manage the schema yourself).
set -eu

log() { printf '%s [arpa] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }

if [ -z "${DATABASE_URL:-}" ]; then
  log "ERROR: DATABASE_URL is not set."
  exit 1
fi
if [ -z "${ARPA_AUTH_SECRET:-}" ]; then
  log "WARNING: ARPA_AUTH_SECRET is not set — sessions will use a secret derived from DATABASE_URL. Set a random 32+ char value."
fi

if [ "${SKIP_DB_PUSH:-0}" != "1" ]; then
  tries=0
  max="${DB_WAIT_TRIES:-30}"
  until prisma db push --skip-generate --schema=/app/prisma/schema.prisma >/tmp/db-push.log 2>&1; do
    tries=$((tries + 1))
    if grep -qiE "data loss|--accept-data-loss" /tmp/db-push.log; then
      log "ERROR: the schema change would delete data. Nothing was changed. Details:"
      cat /tmp/db-push.log
      log "Back up the database, review the change, then run: docker compose run --rm -e SKIP_DB_PUSH=1 app prisma db push --accept-data-loss --schema=/app/prisma/schema.prisma"
      exit 1
    fi
    if [ "$tries" -ge "$max" ]; then
      log "ERROR: database not reachable / schema sync failed after $tries attempts:"
      cat /tmp/db-push.log
      exit 1
    fi
    log "database not ready yet ($tries/$max) — retrying in 2s"
    sleep 2
  done
  log "database schema is up to date"
fi

log "starting ARPA on port ${PORT:-3000}"
exec "$@"
