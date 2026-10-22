const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { builtinModules } = require('node:module');

const root = path.resolve(__dirname, '..');
const ignored = new Set(['.git', 'node_modules', 'dist', 'coverage', '.angular', '.cache', 'generated']);
const sourceExtensions = new Set(['.cjs', '.mjs', '.js', '.jsx', '.ts', '.tsx']);

function walk(directory, accept) {
  if (!fs.existsSync(directory)) return [];
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && !ignored.has(entry.name)) found.push(...walk(path.join(directory, entry.name), accept));
    else if (entry.isFile() && accept(path.join(directory, entry.name))) found.push(path.join(directory, entry.name));
  }
  return found;
}

function packageName(specifier) {
  if (!specifier || specifier.startsWith('.') || specifier.startsWith('/') || specifier.startsWith('#') || specifier.startsWith('node:')) return null;
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

function importsIn(source) {
  const imports = new Set();
  const patterns = [
    /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
    /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g,
    /\b(?:import|export)\s+(?:type\s+)?[\s\S]*?\bfrom\s*(['"])([^'"]+)\1/g,
    /\bimport\s*(['"])([^'"]+)\1/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const name = packageName(match[2]);
      if (name) imports.add(name);
    }
  }
  return [...imports];
}

function declaredPackages(manifests) {
  const names = new Set();
  for (const manifest of manifests) {
    const json = JSON.parse(fs.readFileSync(manifest, 'utf8'));
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const name of Object.keys(json[section] ?? {})) names.add(name);
    }
  }
  return names;
}

function scannedFiles() {
  const files = new Set();
  for (const folder of ['scripts', 'infra']) {
    for (const file of walk(path.join(root, folder), file => sourceExtensions.has(path.extname(file))) ) files.add(file);
  }
  for (const file of walk(root, file => sourceExtensions.has(path.extname(file)) && /(?:^|[.\\/])(?:test|tests|__tests__)(?:[.\\/]|$)|\.(?:test|spec)\.[^.]+$/i.test(file.slice(root.length)))) files.add(file);
  return [...files];
}

function missingDeclarations(sources, declarations) {
  const builtins = new Set(builtinModules.flatMap(name => [name, name.replace(/^node:/, '')]));
  const missing = [];
  for (const file of sources) {
    const source = fs.readFileSync(file, 'utf8');
    for (const name of importsIn(source)) {
      if (!builtins.has(name) && !declarations.has(name)) missing.push(`${path.relative(root, file)} -> ${name}`);
    }
  }
  return missing;
}

test('scripts, infrastructure and tests declare every imported third-party package', () => {
  const manifests = walk(root, file => path.basename(file) === 'package.json');
  const missing = missingDeclarations(scannedFiles(), declaredPackages(manifests));
  assert.deepEqual(missing, [], `Undeclared third-party imports:\n${missing.join('\n')}`);
});

test('dependency scan detects an undeclared package in a source fixture', () => {
  const missing = missingDeclarations([
    path.join(root, 'infra', 'backup-s3.cjs'),
  ], new Set(['dotenv']));
  assert.ok(missing.includes('infra\\backup-s3.cjs -> @aws-sdk/client-s3'));
});

test('S3 SDK is isolated to backup runtime and tooling; it is absent from the API image dependencies', () => {
  const rootPackage = require('../package.json');
  const apiPackage = require('../apps/api/package.json');
  const backupPackage = require('../infra/backup-runtime/package.json');
  const backupLock = require('../infra/backup-runtime/package-lock.json');
  const dockerfile = fs.readFileSync(path.join(root, 'infra/Dockerfile.backup.railway'), 'utf8');
  assert.equal(rootPackage.devDependencies['@aws-sdk/client-s3'], '3.1147.0');
  assert.equal(backupPackage.dependencies['@aws-sdk/client-s3'], '3.1147.0');
  assert.equal(backupLock.packages[''].dependencies['@aws-sdk/client-s3'], '3.1147.0');
  assert.equal(apiPackage.dependencies['@aws-sdk/client-s3'], undefined);
  assert.match(dockerfile, /infra\/backup-runtime\/package\.json infra\/backup-runtime\/package-lock\.json/);
  assert.match(dockerfile, /npm ci --omit=dev --omit=optional/);
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'infra/Dockerfile.api'), 'utf8'), /backup-runtime|@aws-sdk\/client-s3/);
});

test('runtime and tool packages are pinned exactly in their owning manifests', () => {
  const rootPackage = require('../package.json');
  const apiPackage = require('../apps/api/package.json');
  const backupPackage = require('../infra/backup-runtime/package.json');
  assert.equal(apiPackage.dependencies.dotenv, '16.6.1');
  assert.equal(rootPackage.devDependencies.dotenv, '16.6.1');
  assert.equal(rootPackage.devDependencies.playwright, '1.63.0');
  assert.equal(backupPackage.dependencies['@aws-sdk/client-s3'], '3.1147.0');
});

module.exports = { importsIn, packageName, missingDeclarations };
