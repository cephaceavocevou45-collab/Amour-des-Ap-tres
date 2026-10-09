const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { createServer } = require('../../apps/web/scripts/serve-playwright.cjs');

module.exports = async function globalSetup() {
  const repoRoot = path.resolve(__dirname, '../..');
  const webRoot = path.join(repoRoot, 'apps', 'web');
  const cli = path.join(repoRoot, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
  execFileSync(process.execPath, [cli, 'build'], {
    cwd: webRoot,
    env: process.env,
    stdio: 'inherit',
  });
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(4310, '127.0.0.1', resolve);
  });
  return async () => new Promise(resolve => {
    server.close();
    server.closeAllConnections?.();
    resolve();
  });
};
