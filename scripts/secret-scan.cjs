const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const textExtensions = new Set(['.ts', '.js', '.cjs', '.mjs', '.json', '.map', '.yml', '.yaml', '.sql', '.sh', '.md', '.html', '.css', '.prisma', '.toml', '.log', '.conf', '.example']);
const ignoredDirectories = new Set(['.git', 'node_modules', 'coverage', '.angular', 'uploads', 'backups', 'backup', 'test-results', '.playwright-browsers', '.jest-cache', 'dist']);
const detectors = [
  { name: 'clé de fournisseur API', pattern: /\b(?:re|rk|sk)_[A-Za-z0-9_-]{24,}\b/ },
  { name: 'clé privée', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'identifiant PostgreSQL avec mot de passe', pattern: /postgres(?:ql)?:\/\/[^:/\s]+:([^@\s]+)@[^\s"']+/i },
  { name: 'jeton GitHub', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,}\b/ },
  { name: 'clé AWS', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'jeton Slack', pattern: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/ },
  { name: 'JWT signé', pattern: /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/ },
  { name: 'valeur de secret affectée en clair', pattern: /\b(?:JWT_ACCESS_SECRET|RESEND_API_KEY|BACKUP_KEY_HEX|S3_SECRET_KEY|(?:APP|POSTGRES|PAROISSE)_?(?:DB|DATABASE|MIGRATION|APP)?_?PASSWORD)[ \t]*[:=][ \t]*["']?([A-Za-z0-9/+_.=-]{24,})/i },
];
const detected = [];

function findSecretKinds(contents) {
  return detectors.filter(({ pattern }) => {
    const match = contents.match(pattern);
    if (!match) return false;
    const value = match[1];
    if (value && /^(?:change[-_ ]?me|example|placeholder|replace[-_ ]?me|test(?:[-_ ]|$)|your(?:[-_ ]|$)|password$|secret$|sample|\$\{)/i.test(value)) return false;
    if (value && value.length < 24) return false;
    return true;
  }).map(({ name }) => name);
}

function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) {
      if (!ignoredDirectories.has(item.name)) walk(path.join(dir, item.name));
      continue;
    }
    if (!item.isFile()) continue;
    const full = path.join(dir, item.name);
    const relative = path.relative(root, full).replaceAll(path.sep, '/');
    if (item.name === '.env' || (item.name.startsWith('.env.') && item.name !== '.env.example')) continue;
    if (!textExtensions.has(path.extname(item.name).toLowerCase())) continue;
    const contents = fs.readFileSync(full, 'utf8');
    const kinds = findSecretKinds(contents);
    if (kinds.length) detected.push({ relative, kinds });
  }
}

if (require.main === module) {
  walk(root);
  const webDist = path.join(root, 'apps', 'web', 'dist');
  if (fs.existsSync(webDist)) walk(webDist);
  const historyPattern = 're_[A-Za-z0-9_-]{24,}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|postgres(ql)?://[^:/[:space:]]+:[^@[:space:]]+@|gh[pousr]_[A-Za-z0-9]{36,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{20,}|eyJ[A-Za-z0-9_-]{12,}\\.[A-Za-z0-9_-]{12,}\\.[A-Za-z0-9_-]{12,}';
  const history = spawnSync('git', ['log', '--all', '--format=%h', '--name-only', '-G', historyPattern], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const historyFiles = [...new Set((history.stdout ?? '').split(/\r?\n/).filter((line) => line && !/^[0-9a-f]{7,}$/i.test(line)))];
  if (detected.length) {
    console.error('Éléments à vérifier (valeurs non affichées) :');
    for (const { relative, kinds } of detected) console.error(`- ${relative} (${kinds.join(', ')})`);
    process.exit(1);
  }
  if (history.error || history.status !== 0) {
    console.error('Scan de l’historique Git impossible; le contrôle est incomplet.');
    process.exit(2);
  }
  const historicalFindings = [];
  for (const file of historyFiles) {
    // The current .env.example is scanned as a template; history contains only its documented placeholders.
    if (file === '.env.example') continue;
    const patch = spawnSync('git', ['log', '--all', '-p', '--format=', '--', file], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    if (patch.error || patch.status !== 0) {
      console.error('Scan d’une partie de l’historique Git impossible; le contrôle est incomplet.');
      process.exit(2);
    }
    const kinds = new Set();
    for (const line of patch.stdout.split(/\r?\n/)) {
      if (!line.startsWith('+') || line.startsWith('+++')) continue;
      for (const kind of findSecretKinds(line.slice(1))) kinds.add(kind);
    }
    if (kinds.size) historicalFindings.push({ file, kinds: [...kinds] });
  }
  if (historicalFindings.length) {
    console.error('Modifications historiques à examiner (valeurs non affichées) :');
    for (const { file, kinds } of historicalFindings) console.error(`- ${file} (${kinds.join(', ')})`);
    process.exit(1);
  }
  console.log('Scan du code courant, des bundles textuels et de l’historique Git terminé : aucun secret détecté. Les fichiers .env sont ignorés et ne sont pas suivis.');
}

module.exports = { findSecretKinds };
