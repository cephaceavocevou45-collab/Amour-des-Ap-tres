const { spawnSync } = require('node:child_process');
const crypto = require('node:crypto');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, ...options });
  if (result.error || result.status !== 0) {
    process.stderr.write(result.stderr || `Command failed: ${command}\n`);
    process.exit(result.status || 1);
  }
  return result.stdout;
}

const docker = spawnSync('docker', ['--version'], { encoding: 'utf8', windowsHide: true });
if (docker.error || docker.status !== 0) {
  process.stderr.write('non exécuté par moi : Docker est indisponible. Commande à lancer sur une machine avec Docker : node scripts/test-railway-image-runtime.cjs\n');
  process.exit(2);
}

const image = `paroisse-api-runtime-smoke:${crypto.randomBytes(6).toString('hex')}`;
try {
  process.stdout.write(run('docker', ['build', '--file', 'infra/Dockerfile.api', '--target', 'runtime', '--tag', image, '.']));
  const smoke = String.raw`
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const argon2 = require('argon2');
const { PrismaClient } = require('./apps/api/src/generated/prisma');
(async () => {
  const password = crypto.randomBytes(32).toString('hex');
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  assert.equal(await argon2.verify(hash, password), true);
  assert.equal(await argon2.verify(hash, 'not-the-password'), false);
  const client = new PrismaClient({ datasourceUrl: 'postgresql://smoke:smoke@127.0.0.1:1/smoke' });
  try {
    const error = await client.$connect().then(() => null, value => value);
    assert.ok(error && error.name.startsWith('PrismaClient'));
  } finally { await client.$disconnect(); }
  process.stdout.write('Image Railway API Alpine/Node 22 : Argon2id et moteur Prisma vérifiés.\n');
})().catch(() => { process.stderr.write('Échec du smoke test image (détails masqués).\n'); process.exitCode = 1; });
`;
  process.stdout.write(run('docker', ['run', '--rm', '--entrypoint', 'node', image, '-e', smoke]));
} finally {
  spawnSync('docker', ['image', 'rm', image], { encoding: 'utf8', windowsHide: true });
}
