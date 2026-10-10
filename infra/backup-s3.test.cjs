const test = require('node:test');
const assert = require('node:assert/strict');
const { config, pgEnvironment } = require('./backup-s3.cjs');

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
