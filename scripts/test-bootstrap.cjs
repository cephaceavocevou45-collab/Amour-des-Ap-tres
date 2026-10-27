#!/usr/bin/env node
'use strict';

const { randomBytes } = require('node:crypto');
const { spawnSync, spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function parsePostgresUrl(value) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('protocol');
  return url;
}

function databaseIdentity(url) {
  return `${url.hostname.toLowerCase()}:${url.port || '5432'}:${decodeURIComponent(url.pathname.slice(1))}`;
}

function assertSafeTarget(testValue, developmentValue) {
  if (!testValue) throw new Error('TEST_DATABASE_URL manquante.');
  let testUrl;
  try { testUrl = parsePostgresUrl(testValue); }
  catch { throw new Error('TEST_DATABASE_URL invalide. Vérifiez localement sa configuration.'); }
  const databaseName = decodeURIComponent(testUrl.pathname.slice(1)).toLowerCase();
  if (!/(test|bootstrap)/.test(databaseName)) {
    throw new Error('Refus : le nom de la base de TEST_DATABASE_URL doit contenir « test » ou « bootstrap ».');
  }
  if (developmentValue) {
    let developmentUrl;
    try { developmentUrl = parsePostgresUrl(developmentValue); }
    catch { throw new Error('DATABASE_URL est invalide; aucune connexion n’a été tentée.'); }
    if (databaseIdentity(testUrl) === databaseIdentity(developmentUrl)) {
      throw new Error('Refus : TEST_DATABASE_URL désigne la même base que DATABASE_URL.');
    }
  }
  return testUrl;
}

function runNode(args, env) {
  return spawnSync(process.execPath, args, { cwd: path.resolve(__dirname, '..'), env, encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
}

async function run() {
  let testBaseUrl;
  try { testBaseUrl = assertSafeTarget(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL); }
  catch (error) { console.error(error.message); return 2; }

  let PrismaClient;
  try { ({ PrismaClient } = require('../apps/api/src/generated/prisma')); }
  catch { console.error('Client Prisma indisponible. Lancez d’abord npm run prisma:generate --workspace @paroisse/api.'); return 2; }

  const schema = `bootstrap_test_${randomBytes(12).toString('hex')}`;
  const controlUrl = new URL(testBaseUrl);
  controlUrl.searchParams.set('schema', 'public');
  const scopedUrl = new URL(testBaseUrl);
  scopedUrl.searchParams.set('schema', schema);
  const control = new PrismaClient({ datasources: { db: { url: controlUrl.toString() } } });
  let schemaCreated = false;
  let schemaRemoved = false;
  let scoped;
  let apiProcess;
  const originalDatabaseUrl = process.env.DATABASE_URL;
  const originalTsNodeProject = process.env.TS_NODE_PROJECT;
  const originalJwtSecret = process.env.JWT_ACCESS_SECRET;
  const applicationLogs = [];
  const commandOutputs = [];
  const sensitiveValues = [];
  let exitCode = 1;
  let checksPassed = false;
  let phase = 'connexion à la base TEST';

  try {
    await control.$connect();
    const identity = await control.$queryRaw`SELECT current_database() AS database_name, current_schema() AS schema_name`;
    const actualDatabase = String(identity[0]?.database_name ?? '').toLowerCase();
    if (!/(test|bootstrap)/.test(actualDatabase)) throw new Error('La base réellement jointe ne porte pas un nom de test autorisé.');
    if (actualDatabase !== decodeURIComponent(testBaseUrl.pathname.slice(1)).toLowerCase()) throw new Error('La base réellement jointe ne correspond pas à TEST_DATABASE_URL.');

    const prior = await control.$queryRaw`SELECT schema_name FROM information_schema.schemata WHERE schema_name = ${schema}`;
    if (prior.length !== 0) throw new Error('Collision du schéma temporaire; aucune donnée n’a été supprimée.');
    phase = 'création du schéma isolé';
    schemaCreated = true;
    await control.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);

    const root = path.resolve(__dirname, '..');
    const childEnv = {
      ...process.env,
      DATABASE_URL: scopedUrl.toString(),
      NODE_ENV: 'test',
      TS_NODE_PROJECT: path.join(root, 'apps/api/tsconfig.json'),
      JWT_ACCESS_SECRET: randomBytes(48).toString('base64url'),
    };
    phase = 'application des migrations dans le schéma isolé';
    const migrate = runNode([
      path.join(root, 'apps/api/scripts/prisma-cli.cjs'),
      'migrate', 'deploy', '--schema', 'apps/api/prisma/schema.prisma',
    ], childEnv);
    commandOutputs.push(migrate.stdout ?? '', migrate.stderr ?? '');
    if (migrate.error || migrate.status !== 0) throw new Error('Échec de prisma migrate deploy sur le schéma temporaire. Consultez localement le statut de PostgreSQL; aucune cible hors schéma temporaire n’a été utilisée.');

    phase = 'vérification du client Prisma migré';
    scoped = new PrismaClient({ datasources: { db: { url: scopedUrl.toString() } } });
    await scoped.$connect();
    const migratedDb = await scoped.$queryRaw`SELECT current_database() AS database_name, current_schema() AS schema_name`;
    if (String(migratedDb[0]?.schema_name) !== schema) throw new Error('Prisma n’utilise pas le schéma temporaire attendu.');

    const email = `bootstrap-${randomBytes(10).toString('hex')}@test.invalid`;
    const password = `${randomBytes(30).toString('base64url')}A9!`;
    const rerunPassword = `${randomBytes(30).toString('base64url')}B7!`;
    sensitiveValues.push(email, password, rerunPassword, childEnv.JWT_ACCESS_SECRET, testBaseUrl.toString(), scopedUrl.toString(), controlUrl.toString());
    const seedEnv = { ...childEnv, BOOTSTRAP_ADMIN_EMAIL: email, BOOTSTRAP_ADMIN_PASSWORD: password };
    const seedFile = path.join(root, 'apps/api/prisma/seed.ts');
    const tsNode = path.join(root, 'node_modules/ts-node/dist/bin.js');
    const seedArgs = [tsNode, seedFile];
    phase = 'création initiale par le seed';
    const firstSeed = runNode(seedArgs, seedEnv);
    commandOutputs.push(firstSeed.stdout ?? '', firstSeed.stderr ?? '');
    if (firstSeed.error || firstSeed.status !== 0) throw new Error('La procédure de seed initial a échoué. Sa sortie est masquée pour éviter toute divulgation.');

    const initial = await scoped.user.findUnique({ where: { email } });
    if (!initial || initial.role !== 'SUPER_ADMIN' || !initial.active || !initial.mustChangePassword) throw new Error('Le compte initial n’a pas les propriétés attendues.');
    const argon2 = require('argon2');
    if (!await argon2.verify(initial.passwordHash, password)) throw new Error('Le mot de passe initial n’a pas été stocké correctement.');

    // L'API de test reçoit explicitement l'URL du schéma jetable. La valeur
    // DATABASE_URL du processus parent est restaurée dans finally.
    process.env.DATABASE_URL = scopedUrl.toString();
    process.env.TS_NODE_PROJECT = path.join(root, 'apps/api/tsconfig.json');
    process.env['JWT_ACCESS_SECRET'] = childEnv.JWT_ACCESS_SECRET;
    phase = 'démarrage de l’API isolée';
    phase = 'chargement de l’application Nest';
    const { createServer } = net;
    require('ts-node/register/transpile-only');
    const apiEntry = path.join(root, 'apps/api/dist/apps/api/src/main.js');
    if (!require('node:fs').existsSync(apiEntry)) throw new Error('Le build API doit être exécuté avant le test bootstrap.');
    const portProbe = createServer();
    await new Promise((resolve, reject) => { portProbe.once('error', reject); portProbe.listen(0, '127.0.0.1', resolve); });
    const port = portProbe.address().port;
    await new Promise(resolve => portProbe.close(resolve));
    phase = 'démarrage de l’API isolée';
    apiProcess = spawn(process.execPath, [apiEntry], {
      cwd: root,
      env: { ...childEnv, HOST: '127.0.0.1', PORT: String(port), DATABASE_URL: scopedUrl.toString() },
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const captureProcessLog = chunk => {
      if (applicationLogs.length < 1000) applicationLogs.push(chunk.toString('utf8'));
    };
    apiProcess.stdout.on('data', captureProcessLog);
    apiProcess.stderr.on('data', captureProcessLog);
    const loginUrl = `http://127.0.0.1:${port}/api/v1/auth/admin/login`;
    phase = 'attente de disponibilité de l’API isolée';
    let listening = false;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (apiProcess.exitCode !== null) throw new Error('Le processus API s’est arrêté au démarrage.');
      try {
        const response = await fetch(`http://127.0.0.1:${port}/ready`, { signal: AbortSignal.timeout(500) });
        if (response.status < 500) { listening = true; break; }
      } catch { /* démarrage en cours */ }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!listening) throw new Error('L’API isolée n’a pas répondu dans le délai prévu.');
    const login = async () => fetch(loginUrl, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    phase = 'vérification de la connexion par adresse e-mail et mot de passe';
    const authenticated = await login();
    if (authenticated.status !== 201) throw new Error('La connexion par adresse e-mail et mot de passe a échoué.');
    const authResponse = await authenticated.json();
    if (authResponse.user?.role !== 'SUPER_ADMIN') throw new Error('La session ne correspond pas au rôle SUPER_ADMIN attendu.');

    const beforeRerun = await scoped.user.findUniqueOrThrow({ where: { id: initial.id } });
    const seededHash = beforeRerun.passwordHash;
    phase = 'seconde exécution du seed et intégrité du compte';
    const secondSeed = runNode(seedArgs, { ...childEnv, BOOTSTRAP_ADMIN_EMAIL: email, BOOTSTRAP_ADMIN_PASSWORD: rerunPassword });
    commandOutputs.push(secondSeed.stdout ?? '', secondSeed.stderr ?? '');
    if (secondSeed.error || secondSeed.status !== 0) throw new Error('La seconde exécution du seed a échoué. Sa sortie est masquée.');
    const after = await scoped.user.findUniqueOrThrow({ where: { id: initial.id } });
    if (after.passwordHash !== seededHash || after.role !== beforeRerun.role || after.active !== beforeRerun.active || after.mustChangePassword !== beforeRerun.mustChangePassword || after.sessionVersion !== beforeRerun.sessionVersion) {
      throw new Error('La seconde exécution a modifié le mot de passe, le rôle ou l’état du compte initial.');
    }
    if (!await argon2.verify(after.passwordHash, password) || await argon2.verify(after.passwordHash, rerunPassword)) throw new Error('Le mot de passe initial n’a pas été préservé après réexécution.');
    if ((await login()).status !== 201) throw new Error('L’authentification avec le compte initial n’est plus valide après réexécution.');

    phase = 'vérification des journaux';
    const allLogs = [...commandOutputs, ...applicationLogs].join('\n');
    for (const sensitive of [password, rerunPassword, email]) {
      if (sensitive && allLogs.includes(sensitive)) throw new Error('Une valeur sensible a été détectée dans les journaux capturés.');
    }
    exitCode = 0;
    checksPassed = true;
  } catch (error) {
    let detail = error instanceof Error ? error.message : 'Erreur inconnue';
    for (const value of sensitiveValues) if (value) detail = detail.split(value).join('[masqué]');
    detail = detail.replace(/postgres(?:ql)?:\/\/[^\s"'`]+/gi, '[URL PostgreSQL masquée]');
    console.error(`Échec durant la phase « ${phase} » : ${detail.slice(0, 400)}`);
  } finally {
    if (apiProcess && apiProcess.exitCode === null) {
      apiProcess.kill();
      await Promise.race([new Promise(resolve => apiProcess.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 5000))]);
      if (apiProcess.exitCode === null && apiProcess.signalCode === null) exitCode = 1;
    }
    try { if (scoped) await scoped.$disconnect(); } catch { exitCode = 1; }
    if (schemaCreated) {
      try {
        const exists = await control.$queryRaw`SELECT schema_name FROM information_schema.schemata WHERE schema_name = ${schema}`;
        if (exists.length === 1) await control.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
        const remains = await control.$queryRaw`SELECT schema_name FROM information_schema.schemata WHERE schema_name = ${schema}`;
        if (remains.length !== 0) throw new Error('temporary schema still exists');
        schemaRemoved = true;
      } catch {
        console.error('ATTENTION : suppression du schéma temporaire impossible. Le nom du schéma est masqué; vérifiez uniquement les schémas bootstrap_test_* de la base de test.');
        exitCode = 1;
      }
    }
    try { await control.$disconnect(); } catch { exitCode = 1; }
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    if (originalTsNodeProject === undefined) delete process.env.TS_NODE_PROJECT;
    else process.env.TS_NODE_PROJECT = originalTsNodeProject;
    if (originalJwtSecret === undefined) delete process.env['JWT_ACCESS_SECRET'];
    else process.env['JWT_ACCESS_SECRET'] = originalJwtSecret;
    applicationLogs.length = 0;
    commandOutputs.length = 0;
    sensitiveValues.length = 0;
  }
  if (exitCode === 0 && checksPassed && schemaRemoved) console.log('Bootstrap vérifié et nettoyé : migrations dans un schéma jetable supprimé, création SUPER_ADMIN, connexion par e-mail et mot de passe, seconde exécution sans changement du mot de passe/rôle/état, aucun mot de passe dans les sorties capturées.');
  return exitCode;
}

if (require.main === module) run().then(code => { process.exitCode = code; }).catch(() => {
  console.error('Échec du test bootstrap; détails masqués pour protéger les identifiants.');
  process.exitCode = 1;
});

module.exports = { assertSafeTarget, databaseIdentity };
