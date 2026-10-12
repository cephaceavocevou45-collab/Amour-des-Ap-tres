const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createGzip } = require('node:zlib');

const webRoot = path.resolve(__dirname, '..');
const dist = path.join(webRoot, 'dist', 'web', 'browser');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.json': 'application/json; charset=utf-8', '.ico': 'image/x-icon' };

function createServer() {
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('Le build Angular Playwright doit être réussi avant le démarrage du serveur.');
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    const candidate = path.resolve(dist, `.${pathname}`);
    const safe = candidate === dist || candidate.startsWith(`${dist}${path.sep}`);
    const file = safe && fs.existsSync(candidate) && fs.statSync(candidate).isFile() ? candidate : path.join(dist, 'index.html');
    if (!fs.existsSync(file)) { response.writeHead(503); response.end('Application Angular non compilée.'); return; }
    const contentType = types[path.extname(file)] ?? 'application/octet-stream';
    const compressible = /^(text\/|application\/(javascript|json)|image\/svg\+xml)/.test(contentType);
    const wantsGzip = compressible && request.headers['accept-encoding']?.includes('gzip');
    response.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(compressible ? { Vary: 'Accept-Encoding' } : {}),
      ...(wantsGzip ? { 'Content-Encoding': 'gzip' } : {}),
    });
    const stream = fs.createReadStream(file);
    if (wantsGzip) stream.pipe(createGzip({ level: 6 })).pipe(response);
    else stream.pipe(response);
  });
}

if (require.main === module) {
  const server = createServer();
  server.listen(4310, '127.0.0.1');
  const stop = () => { server.close(); server.closeAllConnections?.(); process.exit(0); };
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

module.exports = { createServer };
