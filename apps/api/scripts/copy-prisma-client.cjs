const fs = require('node:fs');
const path = require('node:path');

const apiRoot = path.resolve(__dirname, '..');
const source = path.join(apiRoot, 'dist', 'generated', 'prisma');
const target = path.join(apiRoot, 'dist', 'apps', 'api', 'src', 'generated', 'prisma');

if (!fs.existsSync(path.join(source, 'index.js'))) {
  throw new Error('Prisma Client généré absent du dossier de compilation Nest.');
}
fs.mkdirSync(path.dirname(target), { recursive: true });
fs.cpSync(source, target, { recursive: true, force: true });
