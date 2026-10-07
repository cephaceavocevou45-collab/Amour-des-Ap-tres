#!/usr/bin/env node
const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

const raw = process.env.TEST_DATABASE_URL;
const devRaw = process.env.DATABASE_URL;
if (!raw) {
  fail('TEST_DATABASE_URL est absente. Ajoutez une URL PostgreSQL dédiée aux tests dans .env.');
  process.exit();
}

let test;
let dev;
try {
  test = new URL(raw);
  if (devRaw) dev = new URL(devRaw);
} catch {
  fail('TEST_DATABASE_URL ou DATABASE_URL est mal formée. Encodez les caractères spéciaux du mot de passe en %XX.');
  process.exit();
}

const database = decodeURIComponent(test.pathname.replace(/^\//, '')).toLowerCase();
if (!database.includes('test')) fail('Le nom de la base de test doit contenir « test ».');
if (!['postgres:', 'postgresql:'].includes(test.protocol)) fail('TEST_DATABASE_URL doit utiliser PostgreSQL.');
if (!test.hostname || !test.port && dev && test.hostname !== dev.hostname) {
  fail('L’hôte ou le port de test semble incohérent. Vérifiez l’hôte et le port PostgreSQL avant de continuer.');
}
if (dev && test.hostname.toLowerCase() === dev.hostname.toLowerCase()
  && (test.port || '5432') === (dev.port || '5432')
  && test.pathname.toLowerCase() === dev.pathname.toLowerCase()) {
  fail('Refus : TEST_DATABASE_URL pointe sur la même base que DATABASE_URL. Utilisez une base dédiée.');
}
const authority = raw.match(/^[a-z]+:\/\/([^/]+)/i)?.[1] ?? '';
if ((authority.match(/@/g) ?? []).length > 1) {
  fail('Un caractère @ dans les identifiants doit être encodé en %40. Vérifiez la chaîne localement sans la partager.');
}
const rawAuthority = authority.match(/^([^@]+)@/)?.[1];
const rawPassword = rawAuthority?.slice(rawAuthority.indexOf(':') + 1);
if (rawPassword && /[:/?#@\[\]\\\s]/.test(rawPassword)) {
  fail('Le mot de passe contient un caractère spécial non encodé. Encodez-le en UTF-8 puis en %XX dans l’URL.');
}

if (!process.exitCode) console.log(`Configuration analysée sans afficher d’identifiant. Cible : ${test.hostname}:${test.port || '5432'}/${database}.`);
