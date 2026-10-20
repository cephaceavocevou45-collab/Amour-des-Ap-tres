const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

function run(command, args, options = {}) {
  const useWindowsShell = process.platform === 'win32' && command.toLowerCase().endsWith('.cmd');
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, shell: useWindowsShell, ...options });
  if (result.error || result.status !== 0) {
    process.stderr.write(result.stderr || 'Production dependency smoke test failed.\n');
    process.exit(result.status || 1);
  }
  return result.stdout;
}

const root = path.resolve(__dirname, '..');
const apiManifest = path.join(root, 'apps/api/package.json');
const generated = path.join(root, 'apps/api/src/generated/prisma');
if (!fs.existsSync(generated)) {
  const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  run(npm, ['run', 'prisma:generate', '--workspace', '@paroisse/api'], { cwd: root });
}

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'paroisse-production-deps-'));
try {
  fs.copyFileSync(path.join(root, 'package.json'), path.join(temp, 'package.json'));
  fs.copyFileSync(path.join(root, 'package-lock.json'), path.join(temp, 'package-lock.json'));
  for (const relative of ['apps/api/package.json', 'packages/shared/package.json']) {
    const destination = path.join(temp, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(path.join(root, relative), destination);
  }
  fs.mkdirSync(path.join(temp, 'apps/api/prisma'), { recursive: true });
  fs.copyFileSync(path.join(root, 'apps/api/prisma/schema.prisma'), path.join(temp, 'apps/api/prisma/schema.prisma'));
  fs.cpSync(generated, path.join(temp, 'apps/api/src/generated/prisma'), { recursive: true });
  fs.writeFileSync(path.join(temp, 'smoke.cjs'), `
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const argon2 = require('argon2');
const { PrismaClient } = require('./apps/api/src/generated/prisma');
(async () => {
  const password = crypto.randomBytes(32).toString('hex');
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  assert.equal(await argon2.verify(hash, password), true);
  assert.equal(await argon2.verify(hash, 'different-password'), false);
  const client = new PrismaClient({ datasourceUrl: 'postgresql://smoke:smoke@127.0.0.1:1/smoke' });
  try {
    const connectionError = await client.$connect().then(() => null, error => error);
    assert.ok(connectionError, 'test endpoint must remain unavailable');
    assert.ok(connectionError.name.startsWith('PrismaClient') && /127\.0\.0\.1:1/.test(connectionError.message), 'Prisma engine must report only the isolated closed endpoint');
  } finally { await client.$disconnect(); }
  process.stdout.write('Production install: Argon2 hash/verify passed; generated Prisma engine loaded and reached the expected isolated unavailable endpoint.\\n');
})().catch(error => {
  const safeCode = typeof error?.code === 'string' && /^[A-Z0-9_]{1,24}$/.test(error.code) ? error.code : 'unknown';
  const safeName = typeof error?.name === 'string' && /^[A-Za-z0-9_]{1,40}$/.test(error.name) ? error.name : 'Error';
  process.stderr.write('Production dependency smoke test failed: ' + safeName + ' (' + safeCode + '), no connection details shown.\\n');
  process.exitCode = 1;
});
`);
  const npmEnvironment = { ...process.env, npm_config_cache: path.join(temp, '.npm-cache') };
  const npmArguments = ['ci', '--omit=dev', '--omit=optional', '--workspace', '@paroisse/api', '--include-workspace-root=false'];
  const npmCli = process.env.npm_execpath;
  if (npmCli && fs.existsSync(npmCli)) run(process.execPath, [npmCli, ...npmArguments], { cwd: temp, env: npmEnvironment });
  else run(process.platform === 'win32' ? 'npm.cmd' : 'npm', npmArguments, { cwd: temp, env: npmEnvironment });
  const smokeEnvironment = { ...process.env };
  delete smokeEnvironment.DATABASE_URL;
  delete smokeEnvironment.TEST_DATABASE_URL;
  process.stdout.write(run(process.execPath, ['smoke.cjs'], { cwd: temp, env: smokeEnvironment }));
} finally {
  fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
