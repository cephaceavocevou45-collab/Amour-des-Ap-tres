#!/bin/sh
set -eu
umask 077
: "${BACKUP_FILE:?Définissez BACKUP_FILE vers une sauvegarde chiffrée}"
: "${BACKUP_DATABASE_URL:?Définissez la base source pour le contrôle anti-écrasement}"
: "${RESTORE_DATABASE_URL:?Définissez RESTORE_DATABASE_URL vers une base neuve}"
: "${BACKUP_KEY_HEX:?BACKUP_KEY_HEX est requis}"
[ "${RESTORE_CONFIRM:-}" = 'RESTORE_TO_EMPTY_DATABASE' ] || { echo 'Confirmation de restauration absente.' >&2; exit 2; }
node - "$BACKUP_DATABASE_URL" "$RESTORE_DATABASE_URL" <<'NODE'
const a=new URL(process.argv[2]),b=new URL(process.argv[3]);
const db=u=>decodeURIComponent(u.pathname.replace(/^\//,''));
if(!/(restore|archive)/i.test(db(b))||(a.hostname===b.hostname&&(a.port||'5432')===(b.port||'5432')&&db(a)===db(b)))process.exit(2);
NODE
tables=$(psql "$RESTORE_DATABASE_URL" --no-password --tuples-only --no-align --command "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'") || { echo 'Impossible de vérifier la base cible.' >&2; exit 2; }
[ "$tables" = '0' ] || { echo 'Refus : la base cible doit être vide; aucune table ne sera supprimée.' >&2; exit 2; }
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT HUP INT TERM
node "$(dirname "$0")/backup-crypto.cjs" decrypt "$BACKUP_FILE" "$tmp"
pg_restore --no-owner --exit-on-error --dbname="$RESTORE_DATABASE_URL" "$tmp"
echo 'Restauration terminée sur une base neuve et isolée.'
