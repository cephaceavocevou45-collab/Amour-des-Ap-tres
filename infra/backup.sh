#!/bin/sh
set -eu
umask 077
: "${DATABASE_URL:?DATABASE_URL est requis}"
: "${BACKUP_KEY_HEX:?BACKUP_KEY_HEX est requis (32 octets aléatoires en hexadécimal)}"
days=${BACKUP_RETENTION_DAYS:-35}
case "$days" in ''|*[!0-9]*) echo 'BACKUP_RETENTION_DAYS doit être un entier positif.' >&2; exit 2;; esac
[ "$days" -ge 1 ] && [ "$days" -le 3650 ] || { echo 'BACKUP_RETENTION_DAYS doit être compris entre 1 et 3650.' >&2; exit 2; }
dir=${BACKUP_DIR:-./backups}
mkdir -p "$dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT HUP INT TERM
pg_dump "$DATABASE_URL" --format=custom --no-owner --file="$tmp"
node "$(dirname "$0")/backup-crypto.cjs" encrypt "$tmp" "$dir/paroisse-${stamp}.backup"
find "$dir" -maxdepth 1 -type f -name 'paroisse-*.backup' -mtime "+$days" -delete
echo "Sauvegarde chiffrée créée ; rétention appliquée : ${days} jours."
