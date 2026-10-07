const { spawnSync } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const script = path.join(__dirname, 'test-db-diagnose.cjs');
const node = process.execPath;

function run(testUrl, devUrl = 'postgresql://dev:pw@localhost:5432/paroisse') {
  return spawnSync(node, [script], { encoding: 'utf8', env: { ...process.env, TEST_DATABASE_URL: testUrl, DATABASE_URL: devUrl } });
}

test('diagnostic accepts an isolated test database without printing credentials', () => {
  const result = run('postgresql://tester:pw@localhost:5432/paroisse_test');
  assert.equal(result.status, 0);
  assert.match(result.stdout, /\/paroisse_test/);
  assert.doesNotMatch(result.stdout, /pw/);
});

test('diagnostic rejects the development database and does not print its URL', () => {
  const url = 'postgresql://tester:pw@localhost:5432/paroisse';
  const result = run(url, url);
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /pw/);
});

test('diagnostic rejects unescaped URL password delimiters without disclosing them', () => {
  const result = run('postgresql://tester:part@secret@localhost:5432/paroisse_test');
  assert.equal(result.status, 1);
  assert.doesNotMatch(result.stderr, /part@secret/);
});
