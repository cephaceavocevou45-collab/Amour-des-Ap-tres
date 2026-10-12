const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function evaluateAudit(report, exceptions, now = new Date()) {
  const active = new Set();
  const violations = [];
  const vulnerabilities = report?.metadata?.vulnerabilities;
  if (!vulnerabilities || typeof vulnerabilities !== 'object') return ['Le rapport npm audit est invalide.'];
  const advisoryIdsFor = (packageName, seen = new Set()) => {
    if (seen.has(packageName)) return [];
    seen.add(packageName);
    return [...new Set((report.vulnerabilities?.[packageName]?.via ?? []).flatMap((via) => {
      if (typeof via === 'object' && via.source) return [String(via.url?.match(/GHSA-[\w-]+/)?.[0] ?? via.source)];
      return typeof via === 'string' ? advisoryIdsFor(via, seen) : [];
    }))];
  };
  for (const [packageName, finding] of Object.entries(report.vulnerabilities ?? {})) {
    if (!['high', 'critical'].includes(finding.severity)) continue;
    const ids = advisoryIdsFor(packageName);
    if (!ids.length) {
      violations.push(`${packageName}: avis ${finding.severity} sans identifiant exploitable; correction requise.`);
      continue;
    }
    for (const advisoryId of ids) {
      active.add(`${advisoryId}:${packageName}`);
      const exception = exceptions.find((item) => item.advisoryId === advisoryId && item.packages?.includes(packageName));
      if (!exception) violations.push(`${packageName}: avis ${advisoryId} (${finding.severity}) sans exception documentée.`);
      else if (!exception.justification?.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(exception.expiresOn ?? '') || Number.isNaN(Date.parse(`${exception.expiresOn}T23:59:59.999Z`))) violations.push(`${packageName}: exception ${advisoryId} sans justification ou date d'expiration valide.`);
      else if (new Date(`${exception.expiresOn}T23:59:59.999Z`) < now) violations.push(`${packageName}: exception ${advisoryId} expirée le ${exception.expiresOn}.`);
    }
  }
  for (const exception of exceptions) for (const packageName of exception.packages ?? []) if (!active.has(`${exception.advisoryId}:${packageName}`)) violations.push(`Exception obsolète à retirer : ${exception.advisoryId} (${packageName}).`);
  return violations;
}

if (require.main === module) {
  const audit = process.platform === 'win32'
    ? spawnSync('cmd.exe', ['/d', '/s', '/c', 'npm audit --omit=dev --omit=optional --json'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024, windowsHide: true })
    : spawnSync('npm', ['audit', '--omit=dev', '--omit=optional', '--json'], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  let report;
  try { report = JSON.parse(audit.stdout); } catch { console.error('Échec : npm audit n’a pas fourni de JSON valide (vérifier le registre npm).'); process.exit(2); }
  if (audit.error || (audit.status !== 0 && !report?.metadata?.vulnerabilities)) { console.error('Échec : audit de production indisponible.'); process.exit(2); }
  const exceptionFile = path.join(__dirname, '..', '.github', 'audit-production-exceptions.json');
  const exceptions = JSON.parse(fs.readFileSync(exceptionFile, 'utf8'));
  const violations = evaluateAudit(report, exceptions);
  console.log(`Audit production : ${report.metadata.vulnerabilities.total} avis; ${report.metadata.vulnerabilities.critical} critique(s), ${report.metadata.vulnerabilities.high} haut(s).`);
  if (violations.length) { for (const message of violations) console.error(`BLOQUANT: ${message}`); process.exit(1); }
  console.log('Aucun avis critique ou haut sans exception valide.');
}

module.exports = { evaluateAudit };
