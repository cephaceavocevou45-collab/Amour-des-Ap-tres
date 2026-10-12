const test = require('node:test');
const assert = require('node:assert/strict');
const { findSecretKinds } = require('./secret-scan.cjs');

test('detects secret-shaped values without returning their contents', () => {
  const findings = findSecretKinds([
    'RESEND_API_KEY=re_' + 'a'.repeat(28),
    'DATABASE_URL=postgresql://app:' + 'p'.repeat(32) + '@db.example/app',
    '-----BEGIN ' + 'PRIVATE KEY-----',
  ].join('\n'));
  assert.deepEqual(findings, ['clé de fournisseur API', 'clé privée', 'identifiant PostgreSQL avec mot de passe', 'valeur de secret affectée en clair']);
});

test('does not flag an explicit environment placeholder', () => {
  assert.deepEqual(findSecretKinds('JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET:?required}'), []);
});
