const argon2 = require('argon2');
let prismaModule;
try { prismaModule = require('../src/generated/prisma'); }
catch { prismaModule = require('../dist/apps/api/src/generated/prisma'); }
const { PrismaClient, UserRole } = prismaModule;

const prisma = new PrismaClient();
let failureStage = 'initialisation';

function hiddenPrompt(label) {
  return new Promise((resolve, reject) => {
    const input = process.stdin;
    if (!input.isTTY || typeof input.setRawMode !== 'function') {
      reject(new Error('Utilisez un terminal interactif sécurisé pour saisir le mot de passe.'));
      return;
    }
    process.stdout.write(label);
    let value = '';
    const finish = error => {
      input.setRawMode(false);
      input.pause();
      input.off('data', onData);
      process.stdout.write('\n');
      error ? reject(error) : resolve(value);
    };
    const onData = buffer => {
      for (const character of buffer.toString('utf8')) {
        if (character === '\u0003') return finish(new Error('Procédure interrompue.'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f' || character === '\b') value = value.slice(0, -1);
        else value += character;
      }
    };
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function main() {
  failureStage = 'validation de l’adresse';
  const email = process.argv.slice(2).find(value => value.startsWith('--email='))?.slice(8)?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage : npm run admin:bootstrap -- --email=administrateur@paroisse.example');
  }

  // Never alter or reset an existing administrator, including on a repeated run.
  failureStage = 'vérification du SUPER_ADMIN existant';
  const existingSuperAdmin = await prisma.user.findFirst({ where: { role: UserRole.SUPER_ADMIN }, select: { id: true } });
  if (existingSuperAdmin) {
    process.stdout.write('Un SUPER_ADMIN existe déjà ; aucune modification effectuée.\n');
    return;
  }

  failureStage = 'saisie du mot de passe';
  const password = await hiddenPrompt('Saisissez un mot de passe initial (au moins 16 caractères) : ');
  const confirmation = await hiddenPrompt('Confirmez le mot de passe initial : ');
  if (password.length < 16 || password !== confirmation) throw new Error('Le mot de passe est trop court ou les saisies ne correspondent pas.');

  failureStage = 'hachage du mot de passe';
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  failureStage = 'transaction de création';
  const created = await prisma.$transaction(async tx => {
    // Keep the void-returning lock function inside a CTE and return a normal
    // scalar to Prisma, which cannot deserialize PostgreSQL's `void` type.
    failureStage = 'verrouillage de création';
    await tx.$queryRaw`WITH bootstrap_lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(202610200)) SELECT TRUE AS locked FROM bootstrap_lock`;
    failureStage = 'nouvelle vérification du SUPER_ADMIN';
    if (await tx.user.findFirst({ where: { role: UserRole.SUPER_ADMIN }, select: { id: true } })) return false;
    failureStage = 'vérification de l’adresse';
    if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new Error('Cette adresse est déjà associée à un compte ; aucun compte n’a été modifié.');
    }
    failureStage = 'insertion du SUPER_ADMIN';
    const createdUser = await tx.user.create({
      data: { email, passwordHash, role: UserRole.SUPER_ADMIN, active: true, mustChangePassword: true },
      select: { id: true },
    });
    failureStage = 'écriture du journal d’audit';
    await tx.auditLog.create({ data: { userId: createdUser.id, action: 'SUPER_ADMIN_BOOTSTRAPPED_CLI', entity: 'User', entityId: createdUser.id } });
    return true;
  });
  if (!created) {
    process.stdout.write('Un SUPER_ADMIN existe déjà ; aucune modification effectuée.\n');
    return;
  }
  process.stdout.write('Premier SUPER_ADMIN créé. Le changement du mot de passe est obligatoire à la première connexion. Enrôlez immédiatement la 2FA avec la commande admin:enroll-2fa.\n');
}

main()
  .catch(error => {
    const expectedMessage = error instanceof Error && /SUPER_ADMIN|adresse|mot de passe|Usage|terminal|interrompue/.test(error.message);
    if (expectedMessage) {
      process.stderr.write(`${error.message}\n`);
    } else {
      const errorName = typeof error?.name === 'string' && /^[A-Za-z0-9_]+$/.test(error.name) ? error.name : 'Error';
      const errorCode = typeof error?.code === 'string' && /^[A-Z0-9]+$/.test(error.code) ? error.code : undefined;
      const databaseCode = typeof error?.meta?.code === 'string' && /^[A-Z0-9]+$/.test(error.meta.code) ? error.meta.code : undefined;
      const codes = [errorCode, databaseCode].filter(Boolean).join('/');
      process.stderr.write(`Création du compte initial impossible (étape : ${failureStage} ; erreur : ${errorName}${codes ? ` ; code : ${codes}` : ''}).\n`);
    }
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
