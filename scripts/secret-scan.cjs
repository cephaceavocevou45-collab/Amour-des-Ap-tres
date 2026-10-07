const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const textExtensions = new Set(['.ts', '.js', '.cjs', '.mjs', '.json', '.yml', '.yaml', '.sql', '.sh', '.md', '.html', '.css', '.prisma', '.toml']);
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'coverage', '.angular', 'uploads', 'backups', 'backup']);
const detectors = [
  /\bre_[A-Za-z0-9_]{24,}\b/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\b(?:sk_live|rk_live)_[A-Za-z0-9]{16,}\b/,
  /postgres(?:ql)?:\/\/[^:/\s]+:([^@\s]+)@[^\s"']+/i,
];
const detected = [];

function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (item.isDirectory()) {
      if (!ignoredDirectories.has(item.name)) walk(path.join(dir, item.name));
      continue;
    }
    if (!item.isFile()) continue;
    const full = path.join(dir, item.name);
    const relative = path.relative(root, full).replaceAll(path.sep, '/');
    if (item.name === '.env.example' || item.name.startsWith('.env.') || item.name === '.env') continue;
    if (!textExtensions.has(path.extname(item.name).toLowerCase())) continue;
    const contents = fs.readFileSync(full, 'utf8');
    if (detectors.some((pattern) => {
      const match = contents.match(pattern);
      if (!match) return false;
      if (pattern === detectors[3]) {
        const password = match[1];
        if (/^(?:change-me|example|placeholder|replace|test-only|\$\{\{)/i.test(password)) return false;
        if (password.startsWith('${') || password.length < 8) return false;
      }
      return true;
    })) detected.push(relative);
  }
}

walk(root);
if (detected.length) {
  console.error('Éléments à vérifier (valeurs non affichées) :');
  for (const name of detected) console.error(`- ${name}`);
  process.exit(1);
}
console.log('Scan ciblé terminé : aucun secret manifeste détecté. Les fichiers .env sont exclus et restent hors Git.');
