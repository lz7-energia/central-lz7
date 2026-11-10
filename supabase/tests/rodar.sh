#!/usr/bin/env bash
# Roda as migrações, o seed e os testes num Postgres 16 local descartável.
# Uso: bash supabase/tests/rodar.sh
set -euo pipefail
B=${PG_BIN:-/usr/lib/postgresql/16/bin}
D=$(mktemp -d)
cd "$(dirname "$0")/.."
"$B/initdb" -D "$D/data" -U postgres -A trust >/dev/null
"$B/pg_ctl" -D "$D/data" -o "-k $D -c listen_addresses=" -l "$D/log" start >/dev/null
trap '"$B/pg_ctl" -D "$D/data" stop >/dev/null; rm -rf "$D"' EXIT
P="psql -h $D -U postgres -v ON_ERROR_STOP=1 -q"
$P -f tests/stub_supabase.sql 2>/dev/null
for f in migrations/*.sql; do $P -f "$f"; done
$P -f seed.sql
$P -f tests/testes.sql
