const path = require('node:path');
const dotenv = require('dotenv');
const { spawnSync } = require('node:child_process');

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const cli = path.resolve(__dirname, '../../../node_modules/prisma/build/index.js');
const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  env: process.env,
  stdio: 'inherit',
});
process.exitCode = result.status ?? 1;
