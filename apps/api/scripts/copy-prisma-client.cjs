const fs = require('node:fs');
const path = require('node:path');

const apiRoot = path.resolve(__dirname, '..');
const source = path.join(apiRoot, 'dist', 'generated', 'prisma');
const target = path.join(apiRoot, 'dist', 'apps', 'api', 'src', 'generated', 'prisma');

if (!fs.existsSync(path.join(source, 'index.js'))) {
  throw new Error('Prisma Client généré absent du dossier de compilation Nest.');
}

function copyChangedFiles(sourceDir, targetDir) {
  fs.mkdirSync(targetDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);

    if (entry.isDirectory()) {
      copyChangedFiles(sourcePath, targetPath);
      continue;
    }

    if (!entry.isFile()) continue;

    let alreadyCurrent = false;
    try {
      const sourceStat = fs.statSync(sourcePath);
      const targetStat = fs.statSync(targetPath);
      if (targetStat.isFile() && sourceStat.size === targetStat.size) {
        alreadyCurrent = fs.readFileSync(sourcePath).equals(fs.readFileSync(targetPath));
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }

    // Avoid replacing loaded Prisma native binaries on Windows during a rebuild.
    if (!alreadyCurrent) fs.copyFileSync(sourcePath, targetPath);
  }
}

copyChangedFiles(source, target);
