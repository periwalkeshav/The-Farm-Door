#!/bin/sh
# Starts/stops the project-local PostgreSQL used for development (Postgres.app binaries;
# set PGBIN to use another install). The first start creates the cluster in .pgdata.
set -e
cd "$(dirname "$0")/.."
PGBIN="${PGBIN:-/Applications/Postgres.app/Contents/Versions/latest/bin}"
case "$1" in
  start)
    if [ ! -d .pgdata ]; then
      echo "Creating a new local database cluster in .pgdata (user postgres, local connections only)..."
      "$PGBIN/initdb" -D .pgdata -U postgres --auth=trust --encoding=UTF8 --no-instructions > /dev/null
    fi
    "$PGBIN/pg_ctl" -D .pgdata -o "-p 54329 -k /tmp -c listen_addresses=localhost" -l .pgdata/server.log -w start ;;
  stop) "$PGBIN/pg_ctl" -D .pgdata -m fast stop ;;
  status) "$PGBIN/pg_ctl" -D .pgdata status ;;
  *) echo "usage: $0 start|stop|status"; exit 1 ;;
esac
