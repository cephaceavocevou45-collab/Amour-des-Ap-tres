const test = require('node:test');
const assert = require('node:assert/strict');
const { config, pgEnvironment, prune } = require('./backup-s3.cjs');
const fs = require('node:fs');
const path = require('node:path');

const names = ['BACKUP_DATABASE_URL','BACKUP_KEY_HEX','S3_ENDPOINT','S3_REGION','S3_BUCKET','S3_ACCESS_KEY','S3_SECRET_KEY','BACKUP_RETENTION_DAYS'];
function withEnvironment(values, callback) {
  const previous = Object.fromEntries(names.map(name => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  Object.assign(process.env, values);
  try { return callback(); }
  finally { for (const name of names) { if (previous[name] === undefined) delete process.env[name]; else process.env[name] = previous[name]; } }
}

test('S3 backup requires remote HTTPS storage and never returns credentials in diagnostics', () => {
  withEnvironment({BACKUP_DATABASE_URL:'postgresql://safe-user:test-only@db.example.invalid:5432/paroisse',BACKUP_KEY_HEX:'a'.repeat(64),S3_ENDPOINT:'http://localhost:9000',S3_REGION:'test-1',S3_BUCKET:'paroisse-backups',S3_ACCESS_KEY:'access-private',S3_SECRET_KEY:'secret-private'}, () => {
    assert.throws(()=>config(),/HTTPS/);
  });
});

test('backup password is passed to libpq environment, never included in PostgreSQL argument strings', () => {
  const database = new URL('postgresql://safe-user:p%40ssword@db.example.invalid:5432/paroisse?sslmode=require');
  const env = withEnvironment({},()=>pgEnvironment(database));
  assert.equal(env.PGUSER,'safe-user');
  assert.equal(env.PGPASSWORD,'p@ssword');
  assert.equal(env.PGSSLMODE,'require');
  assert.equal(env.PGHOST,'db.example.invalid');
});

test('remote restore refuses non-empty targets and counts rows after restore', () => {
  const source = fs.readFileSync(path.join(__dirname, 'backup-s3.cjs'), 'utf8');
  assert.match(source, /pg_class c JOIN pg_namespace n/);
  assert.match(source, /SELECT count\(\*\) FROM public\.\$\{quoted\}/);
  assert.match(source, /restoredRows \+= BigInt\(restoredCount\)/);
  assert.match(source, /tables, \$\{restoredRows\} lignes comptées/);
  assert.match(source, /pg_restore.*--no-owner.*--exit-on-error/s);
  assert.doesNotMatch(source, /pg_restore[^\n]*(?:--clean|--create)/);
});

test('backup retention removes expired objects and old versions, including delete markers', async () => {
  const { ListObjectsV2Command, ListObjectVersionsCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
  const deleted = [];
  const s3 = { async send(command) {
    if (command instanceof ListObjectsV2Command) return { Contents: [{ Key: 'paroisse-backups/old.enc', LastModified: new Date(Date.now() - 40 * 86400_000) }] };
    if (command instanceof ListObjectVersionsCommand) return {
      Versions: [
        { Key: 'paroisse-backups/old.enc', VersionId: 'old-version', LastModified: new Date(Date.now() - 40 * 86400_000) },
        { Key: 'paroisse-backups/recent.enc', VersionId: 'recent-version', LastModified: new Date() },
      ],
      DeleteMarkers: [{ Key: 'paroisse-backups/old.enc', VersionId: 'old-marker', LastModified: new Date(Date.now() - 40 * 86400_000) }],
    };
    if (command instanceof DeleteObjectsCommand) { deleted.push(...command.input.Delete.Objects); return { Errors: [] }; }
    throw new Error('Unexpected S3 operation');
  } };
  const previous = process.env.S3_BUCKET;
  process.env.S3_BUCKET = 'fake-test-bucket';
  try { await prune(s3, 35); }
  finally { if (previous === undefined) delete process.env.S3_BUCKET; else process.env.S3_BUCKET = previous; }
  assert.deepEqual(deleted, [
    { Key: 'paroisse-backups/old.enc' },
    { Key: 'paroisse-backups/old.enc', VersionId: 'old-version' },
    { Key: 'paroisse-backups/old.enc', VersionId: 'old-marker' },
  ]);
});
