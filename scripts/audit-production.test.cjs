const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateAudit } = require('./audit-production.cjs');

const report = (via = [{ source: 1, url: 'https://github.com/advisories/GHSA-test-1234-5678', name: 'leaf', severity: 'high' }]) => ({
  metadata: { vulnerabilities: { total: 1, critical: 0, high: 1, moderate: 0, low: 0 } },
  vulnerabilities: { bad: { severity: 'high', via } },
});
const now = new Date('2026-10-11T00:00:00Z');

test('production audit blocks unexcepted high findings', () => {
  assert.match(evaluateAudit(report(), [], now)[0], /sans exception/);
});
test('production audit accepts a documented, unexpired exact exception', () => {
  assert.deepEqual(evaluateAudit(report(), [{ advisoryId: 'GHSA-test-1234-5678', packages: ['bad'], justification: 'Mitigation documented.', expiresOn: '2026-10-20' }], now), []);
});
test('production audit rejects exceptions without expiry or after expiry', () => {
  assert.match(evaluateAudit(report(), [{ advisoryId: 'GHSA-test-1234-5678', packages: ['bad'], justification: 'Reason.' }], now)[0], /date d'expiration/);
  assert.match(evaluateAudit(report(), [{ advisoryId: 'GHSA-test-1234-5678', packages: ['bad'], justification: 'Reason.', expiresOn: '2026-99-99' }], now)[0], /date d'expiration/);
  assert.match(evaluateAudit(report(), [{ advisoryId: 'GHSA-test-1234-5678', packages: ['bad'], justification: 'Reason.', expiresOn: '2026-10-01' }], now)[0], /expirée/);
});
