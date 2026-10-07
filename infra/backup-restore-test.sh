#!/bin/sh
set -eu
: "${TEST_SOURCE_DATABASE_URL:?TEST_SOURCE_DATABASE_URL doit cibler une base PostgreSQL de test dédiée}"
: "${TEST_RESTORE_DATABASE_URL:?TEST_RESTORE_DATABASE_URL doit cibler une autre base PostgreSQL de test dédiée}"
: "${BACKUP_KEY_HEX:?BACKUP_KEY_HEX est requis}"
src=$(node -e 'const u=new URL(process.argv[1]);process.stdout.write(u.hostname+":"+u.port+u.pathname)' "$TEST_SOURCE_DATABASE_URL")
dst=$(node -e 'const u=new URL(process.argv[1]);process.stdout.write(u.hostname+":"+u.port+u.pathname)' "$TEST_RESTORE_DATABASE_URL")
case "$src:$dst" in *test*:*test*) ;; *) echo 'Les deux noms de bases doivent contenir test.' >&2; exit 2;; esac
[ "$src" != "$dst" ] || { echo 'Les bases source et restauration doivent être distinctes.' >&2; exit 2; }
if [ -n "${DATABASE_URL:-}" ]; then
  live=$(node -e 'const u=new URL(process.argv[1]);process.stdout.write(u.hostname+":"+u.port+u.pathname)' "$DATABASE_URL")
  [ "$src" != "$live" ] && [ "$dst" != "$live" ] || { echo 'Refus : une cible correspond à DATABASE_URL.' >&2; exit 2; }
fi
tmpdir=$(mktemp -d)
trap 'rm -rf "$tmpdir"' EXIT HUP INT TERM
pg_dump "$TEST_SOURCE_DATABASE_URL" --format=custom --no-owner --file="$tmpdir/source.dump"
node "$(dirname "$0")/backup-crypto.cjs" encrypt "$tmpdir/source.dump" "$tmpdir/source.backup"
node "$(dirname "$0")/backup-crypto.cjs" decrypt "$tmpdir/source.backup" "$tmpdir/restored.dump"
pg_restore --clean --if-exists --no-owner --exit-on-error --dbname="$TEST_RESTORE_DATABASE_URL" "$tmpdir/restored.dump"
echo 'Test de chiffrement, authentification et restauration PostgreSQL réussi.'
