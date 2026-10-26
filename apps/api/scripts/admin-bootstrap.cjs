const argon2 = require('argon2');
let prismaModule;
try { prismaModule = require('../src/generated/prisma'); }
catch { prismaModule = require('../dist/apps/api/src/generated/prisma'); }
const { PrismaClient, UserRole } = prismaModule;

const prisma = new PrismaClient();

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
  const email = process.argv.slice(2).find(value => value.startsWith('--email='))?.slice(8)?.trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Usage : npm run admin:bootstrap -- --email=administrateur@paroisse.example');
  }

  // Never alter or reset an existing administrator, including on a repeated run.
  const existingSuperAdmin = await prisma.user.findFirst({ where: { role: UserRole.SUPER_ADMIN }, select: { id: true } });
  if (existingSuperAdmin) {
    process.stdout.write('Un SUPER_ADMIN existe déjà ; aucune modification effectuée.\n');
    return;
  }

  const password = await hiddenPrompt('Saisissez un mot de passe initial (au moins 16 caractères) : ');
  const confirmation = await hiddenPrompt('Confirmez le mot de passe initial : ');
  if (password.length < 16 || password !== confirmation) throw new Error('Le mot de passe est trop court ou les saisies ne correspondent pas.');

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  const created = await prisma.$transaction(async tx => {
    // Keep the void-returning lock function inside a CTE and return a normal
    // scalar to Prisma, which cannot deserialize PostgreSQL's `void` type.
    await tx.$queryRaw`WITH bootstrap_lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(202610200)) SELECT TRUE AS locked FROM bootstrap_lock`;
    if (await tx.user.findFirst({ where: { role: UserRole.SUPER_ADMIN }, select: { id: true } })) return false;
    if (await tx.user.findUnique({ where: { email }, select: { id: true } })) {
      throw new Error('Cette adresse est déjà associée à un compte ; aucun compte n’a été modifié.');
    }
    const createdUser = await tx.user.create({
      data: { email, passwordHash, role: UserRole.SUPER_ADMIN, active: true, mustChangePassword: true },
      select: { id: true },
    });
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
    // Error details from the driver can include connection metadata; keep operational output generic.
    process.stderr.write(`${error instanceof Error && /SUPER_ADMIN|adresse|mot de passe|Usage|terminal|interrompue/.test(error.message) ? error.message : 'Création du compte initial impossible ; vérifier la configuration privée du job.'}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
