#!/usr/bin/env bash
# Local Postgres 16 with the Supabase shim, for rehearsing migrations and running supabase/tests/*.sql
# before anything touches production.
#
#   scripts/pg-rehearse/pg.sh init      # one-off per machine: init the cluster under /var/tmp, start it, load the shim
#   scripts/pg-rehearse/pg.sh start     # start a cluster that exists (after a container restart)
#   scripts/pg-rehearse/pg.sh reset     # drop + recreate the database, shim, every migration in order (each in one txn), seed
#   scripts/pg-rehearse/pg.sh test [N]  # run supabase/tests/*.sql (or just NNNN_*.sql); each test rolls itself back
#   scripts/pg-rehearse/pg.sh psql      # a psql prompt (or: pg.sh psql -c '...')
#   scripts/pg-rehearse/pg.sh stop
#
# Runs as the `postgres` OS user (initdb refuses root). Port 5499 so it never collides with `supabase start`.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
BIN=/usr/lib/postgresql/16/bin
DATA=/var/tmp/pg16-rehearse
PORT=5499
DB=eye_today
export PGHOST=/tmp PGPORT=$PORT PGUSER=postgres PGDATABASE=$DB

as_pg() { if [ "$(id -u)" = 0 ]; then su postgres -s /bin/bash -c "$*"; else bash -c "$*"; fi; }
psql_() { psql -v ON_ERROR_STOP=1 -q "$@"; }

case "${1:-}" in
  init)
    as_pg "rm -rf $DATA && $BIN/initdb -D $DATA -U postgres --auth=trust >/dev/null"
    as_pg "$BIN/pg_ctl -D $DATA -o '-p $PORT -k /tmp -c max_connections=20' -l $DATA/log start >/dev/null"
    sleep 1
    "$0" reset
    ;;
  start)
    as_pg "$BIN/pg_ctl -D $DATA -o '-p $PORT -k /tmp -c max_connections=20' -l $DATA/log start >/dev/null" || true
    sleep 1
    ;;
  stop)
    as_pg "$BIN/pg_ctl -D $DATA stop >/dev/null" || true
    ;;
  reset)
    psql_ -d postgres -c "drop database if exists $DB" -c "create database $DB"
    psql_ -f "$here/shim.sql"
    for f in "$root"/supabase/migrations/*.sql; do
      n="$(basename "$f")"
      psql_ -1 -f "$f"
      psql_ -c "insert into supabase_migrations.schema_migrations (version, name) values ('${n%%_*}', '${n#*_}') on conflict do nothing"
      echo "applied $n"
    done
    if [ "${NO_SEED:-}" != 1 ]; then psql_ -1 -f "$root/supabase/seed.sql" && echo "seeded"; fi
    ;;
  test)
    shift
    pass=0; fail=0
    for f in "$root"/supabase/tests/${1:-}*.sql; do
      if psql_ -f "$f" >/tmp/pg-rehearse-test.log 2>&1; then pass=$((pass+1)); echo "pass  $(basename "$f")"
      else fail=$((fail+1)); echo "FAIL  $(basename "$f")"; tail -5 /tmp/pg-rehearse-test.log | sed 's/^/      /'; fi
    done
    echo "$pass passed, $fail failed"; [ "$fail" = 0 ]
    ;;
  psql)
    shift; psql "$@"
    ;;
  *)
    sed -n 2,12p "$0"; exit 1
    ;;
esac
