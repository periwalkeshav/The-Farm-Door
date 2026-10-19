#!/bin/sh
# Starts/stops the project-local PostgreSQL used for development (Postgres.app binaries).
set -e
cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-/Applications/Postgres.app/Contents/Versions/latest/bin}"
case "$1" in
  start) "$PGBIN/pg_ctl" -D .pgdata -o "-p 54329 -k /tmp -c listen_addresses=localhost" -l .pgdata/server.log -w start ;;
  stop) "$PGBIN/pg_ctl" -D .pgdata -m fast stop ;;
  status) "$PGBIN/pg_ctl" -D .pgdata status ;;
  *) echo "usage: $0 start|stop|status"; exit 1 ;;
esac
