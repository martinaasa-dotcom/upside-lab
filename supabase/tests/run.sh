#!/usr/bin/env bash
#
# Builds the database from the migrations and runs the SQL tests against it.
#
#   ./supabase/tests/run.sh
#
# Needs a plain Postgres and nothing else: no Docker, no hosted project, no
# credentials. `shim.sql` supplies the parts of Supabase the migrations lean
# on, so this is the same schema production runs, applied in the same order.
#
# The point of running it at all is that reading a policy cannot tell you
# whether it holds. `rls.test.sql` asks the database, as the `authenticated`
# role with a real claim, whether one person can reach another's book.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DB="${TEST_DB:-portfell_test}"
PSQL="${PSQL:-psql}"

echo "== a database, as the migrations build it"
$PSQL -q -c "drop database if exists $DB;" -c "create database $DB;"
$PSQL -q -d "$DB" -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/shim.sql" > /dev/null

applied=0
for migration in "$ROOT"/supabase/migrations/*.sql; do
  $PSQL -q -d "$DB" -v ON_ERROR_STOP=1 -f "$migration" > /dev/null
  applied=$((applied + 1))
done
echo "   $applied migrations applied"

for test in "$ROOT"/supabase/tests/*.test.sql; do
  echo "== $(basename "$test")"
  $PSQL -q -d "$DB" -v ON_ERROR_STOP=1 -f "$test"
done

echo "== all SQL tests passed"
