#!/bin/sh
set -eu
umask 077
: "${BACKUP_FILE:?Définissez BACKUP_FILE vers une sauvegarde .backup}"
: "${RESTORE_DATABASE_URL:?Définissez RESTORE_DATABASE_URL vers une base isolée}"
: "${DATABASE_URL:?DATABASE_URL source est requis pour le garde-fou}"
: "${BACKUP_KEY_HEX:?BACKUP_KEY_HEX est requis}"
[ "${RESTORE_CONFIRM:-}" = 'RESTORE_TO_ISOLATED_TARGET' ] || { echo 'Définissez RESTORE_CONFIRM=RESTORE_TO_ISOLATED_TARGET après avoir vérifié la cible.' >&2; exit 2; }
node -e 'const a=new URL(process.argv[1]),b=new URL(process.argv[2]);const db=x=>x.pathname.replace(/^\//,"");if(!/(test|restore)/i.test(db(b)))process.exit(4);if(a.hostname===b.hostname&&a.port===b.port&&db(a)===db(b))process.exit(3)' "$DATABASE_URL" "$RESTORE_DATABASE_URL" || { echo 'La cible doit être une base distincte dont le nom indique clairement test ou restore.' >&2; exit 2; }
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT HUP INT TERM
node "$(dirname "$0")/backup-crypto.cjs" decrypt "$BACKUP_FILE" "$tmp"
pg_restore --clean --if-exists --no-owner --exit-on-error --dbname="$RESTORE_DATABASE_URL" "$tmp"
echo 'Restauration terminée sur la cible isolée.'
