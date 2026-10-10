const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { pipeline } = require('node:stream/promises');
const { createCipheriv } = require('node:crypto');
const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');

const magic = Buffer.from('PAROISSE-BACKUP-AES256GCM-V1\n', 'ascii');
const required = ['BACKUP_DATABASE_URL', 'BACKUP_KEY_HEX', 'S3_ENDPOINT', 'S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY', 'S3_SECRET_KEY'];
function config() {
  for (const name of required) if (!process.env[name]) throw new Error('Une variable requise pour la sauvegarde distante est absente.');
  if (!/^[a-fA-F0-9]{64}$/.test(process.env.BACKUP_KEY_HEX)) throw new Error('La clé de sauvegarde doit contenir 32 octets en hexadécimal.');
  const endpoint = new URL(process.env.S3_ENDPOINT);
  if (!['https:'].includes(endpoint.protocol) || ['localhost', '127.0.0.1', '::1'].includes(endpoint.hostname)) throw new Error('Le stockage distant doit utiliser HTTPS et être distinct de cette machine.');
  const retention = Number(process.env.BACKUP_RETENTION_DAYS ?? 35);
  if (!Number.isInteger(retention) || retention < 1 || retention > 3650) throw new Error('La rétention doit être comprise entre 1 et 3650 jours.');
  const database = new URL(process.env.BACKUP_DATABASE_URL);
  const s3 = new S3Client({ endpoint: endpoint.toString(), region: process.env.S3_REGION, forcePathStyle: true, credentials: { accessKeyId: process.env.S3_ACCESS_KEY, secretAccessKey: process.env.S3_SECRET_KEY } });
  return { database, s3, retention };
}

function pgEnvironment(database) {
  const env = { ...process.env, PGHOST: database.hostname, PGPORT: database.port || '5432', PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: decodeURIComponent(database.pathname.slice(1)) };
  const sslmode = database.searchParams.get('sslmode');
  if (sslmode) env.PGSSLMODE = sslmode;
  return env;
}

async function makeEncryptedDump(target, database) {
  const iv = crypto.randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.BACKUP_KEY_HEX, 'hex'), iv);
  await fsp.writeFile(target, Buffer.concat([magic, iv]), { flag: 'wx', mode: 0o600 });
  const child = spawn('pg_dump', ['--format=custom', '--no-owner', '--no-password'], { env: pgEnvironment(database), stdio: ['ignore', 'pipe', 'ignore'] });
  const exit = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', code => resolve(code));
  });
  try {
    await pipeline(child.stdout, cipher, fs.createWriteStream(target, { flags: 'a', mode: 0o600 }));
    if (await exit !== 0) throw new Error('La création du dump PostgreSQL a échoué.');
    await fsp.appendFile(target, cipher.getAuthTag(), { mode: 0o600 });
  } catch (error) {
    child.kill('SIGTERM');
    await fsp.rm(target, { force: true });
    throw error;
  }
}

async function prune(s3, retention) {
  const cutoff = Date.now() - retention * 86400_000;
  let continuationToken;
  do {
    const result = await s3.send(new ListObjectsV2Command({ Bucket: process.env.S3_BUCKET, Prefix: 'paroisse-backups/', ContinuationToken: continuationToken }));
    const expired = (result.Contents ?? []).filter(item => item.Key && item.LastModified && item.LastModified.getTime() < cutoff).map(item => ({ Key: item.Key }));
    for (let i = 0; i < expired.length; i += 1000) {
      const deleted = await s3.send(new DeleteObjectsCommand({ Bucket: process.env.S3_BUCKET, Delete: { Objects: expired.slice(i, i + 1000), Quiet: true } }));
      if (deleted.Errors?.length) throw new Error('La rétention distante n’a pas pu être entièrement appliquée.');
    }
    continuationToken = result.IsTruncated ? result.NextContinuationToken : undefined;
  } while (continuationToken);
}

async function create() {
  const { database, s3, retention } = config();
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'paroisse-backup-'));
  try {
    const file = path.join(temp, 'backup.enc');
    await makeEncryptedDump(file, database);
    const now = new Date();
    const key = `paroisse-backups/${now.toISOString().slice(0, 10)}/paroisse-${now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}.backup.enc`;
    await s3.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key, Body: fs.createReadStream(file), ContentLength: (await fsp.stat(file)).size, ContentType: 'application/octet-stream', ServerSideEncryption: 'AES256' }));
    await prune(s3, retention);
    process.stdout.write('Sauvegarde chiffrée envoyée au stockage distant; rétention appliquée.\n');
  } finally {
    await fsp.rm(temp, { recursive: true, force: true });
  }
}

async function restoreEncrypted(key, encryptedOutput) {
  const { s3 } = config();
  const object = await s3.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  if (!object.Body) throw new Error('La sauvegarde distante est vide.');
  await pipeline(object.Body, fs.createWriteStream(encryptedOutput, { flags: 'wx', mode: 0o600 }));
}

async function restore(key) {
  key = key || process.env.S3_BACKUP_KEY;
  const targetUrl = process.env.RESTORE_DATABASE_URL;
  if (!key || !targetUrl || process.env.RESTORE_CONFIRM !== 'RESTORE_TO_EMPTY_DATABASE') throw new Error('La clé de sauvegarde, la cible isolée et la confirmation explicite sont requises.');
  const target = new URL(targetUrl);
  const source = new URL(process.env.BACKUP_DATABASE_URL);
  const targetName = decodeURIComponent(target.pathname.slice(1));
  if (!/(restore|archive)/i.test(targetName) || (target.hostname === source.hostname && (target.port || '5432') === (source.port || '5432') && targetName === decodeURIComponent(source.pathname.slice(1)))) throw new Error('La base cible doit être distincte et porter un nom restore ou archive.');
  const env = pgEnvironment(target);
  const check = spawnSync('psql', ['--no-password', '--tuples-only', '--no-align', '--command', "SELECT count(*) FROM pg_tables WHERE schemaname = 'public'",], { env, encoding: 'utf8' });
  if (check.status !== 0 || check.stdout.trim() !== '0') throw new Error('Refus de restaurer : la cible doit être une base neuve sans table publique.');
  const temp = await fsp.mkdtemp(path.join(os.tmpdir(), 'paroisse-restore-'));
  try {
    const encrypted = path.join(temp, 'backup.enc'), dump = path.join(temp, 'backup.dump');
    await restoreEncrypted(key, encrypted);
    const decrypt = spawnSync(process.execPath, [path.join(__dirname, 'backup-crypto.cjs'), 'decrypt', encrypted, dump], { env: process.env, stdio: 'ignore' });
    if (decrypt.status !== 0) throw new Error('La vérification cryptographique de la sauvegarde a échoué.');
    const child = spawnSync('pg_restore', ['--no-owner', '--exit-on-error', `--dbname=${targetName}`, dump], { env, stdio: 'ignore' });
    if (child.status !== 0) throw new Error('La restauration PostgreSQL a échoué sur la base vide.');
    process.stdout.write('Restauration vérifiée sur la base isolée vide.\n');
  } finally {
    await fsp.rm(temp, { recursive: true, force: true });
  }
}

const [operation, key] = process.argv.slice(2);
if (require.main === module) {
  (operation === 'create' ? create() : operation === 'restore' && key ? restore(key) : Promise.reject(new Error('Usage : backup-s3.cjs create | restore <clé-objet>')))
    .catch(() => { process.stderr.write('Opération de sauvegarde/restauration échouée; vérifier la configuration sans afficher ses secrets.\n'); process.exitCode = 1; });
}

module.exports = { config, pgEnvironment, makeEncryptedDump };
