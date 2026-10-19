const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const read = file => fs.readFileSync(require('node:path').join(__dirname, file), 'utf8');

test('Railway web is the configurable public Nginx edge and forwards only its edge IP to private API', () => {
  const web = read('railway-web.conf.template');
  const dockerfile = read('Dockerfile.web.railway');
  const nginxMain = read('nginx-main.railway.conf');
  assert.notEqual(web.charCodeAt(0), 0xfeff, 'nginx template must not have a UTF-8 BOM');
  assert.notEqual(nginxMain.charCodeAt(0), 0xfeff, 'nginx main config must not have a UTF-8 BOM');
  assert.match(web, /listen 8080;/);
  assert.equal((web.match(/proxy_pass http:\/\/\$\{API_PRIVATE_HOST\}/g) || []).length, 3);
  assert.equal((web.match(/proxy_set_header X-Forwarded-For \$http_x_real_ip;/g) || []).length, 3);
  assert.equal((web.match(/proxy_set_header CF-Connecting-IP "";/g) || []).length, 3);
  assert.doesNotMatch(web, /set_real_ip_from|CF-Connecting-IP \$remote_addr|proxy_pass http:\/\/api:3000/);
  assert.match(web, /if \(\$http_x_real_ip = ""\) \{ return 400; \}/);
  assert.equal((nginxMain.match(/limit_(?:req|conn)_zone \$http_x_real_ip/g) || []).length, 3);
  assert.doesNotMatch(nginxMain, /limit_(?:req|conn)_zone \$binary_remote_addr/);
  assert.match(dockerfile, /NGINX_ENVSUBST_FILTER=\^API_PRIVATE_HOST\$/);
  assert.match(dockerfile, /USER 101:101/);
});

test('Railway API runtime omits development and optional packages and keeps migrations separate', () => {
  const api = read('Dockerfile.api');
  const migrate = read('Dockerfile.migrate.railway');
  assert.match(api, /npm ci --omit=dev --omit=optional/);
  assert.match(api, /AS runtime/);
  assert.match(migrate, /USER node/);
  assert.match(migrate, /prisma:deploy/);
  assert.doesNotMatch(migrate, /EXPOSE\s+\d/);
});
