const { PrismaClient, PersonRoleName } = require('../apps/api/src/generated/prisma');

if (process.env.APP_ENVIRONMENT !== 'staging') {
  process.stderr.write('Refus : ce script accepte uniquement APP_ENVIRONMENT=staging.\n');
  process.exit(2);
}
let stagingUrl;
try { stagingUrl = new URL(process.env.STAGING_DATABASE_URL || ''); }
catch {
  process.stderr.write('STAGING_DATABASE_URL est absente ou invalide.\n');
  process.exit(2);
}
if (!/(stage|staging|test)/i.test(stagingUrl.hostname) || !stagingUrl.hostname.endsWith('.railway.internal')) {
  process.stderr.write('Refus : cible hors réseau privé Railway ou nom de base non marqué staging/test.\n');
  process.exit(2);
}

const prisma = new PrismaClient({ datasourceUrl: stagingUrl.toString() });
const fakePeople = [
  { id: 'staging-fake-person-001', firstName: 'TEST-FICTIF-001', lastName: 'DONNEE-DEMO', grade: 'DONNEE FICTIVE', roles: [PersonRoleName.MONITEUR_TABLE] },
  { id: 'staging-fake-person-002', firstName: 'TEST-FICTIF-002', lastName: 'DONNEE-DEMO', grade: 'DONNEE FICTIVE', roles: [PersonRoleName.PRESENTATION_THEME] },
];

(async () => {
  for (const person of fakePeople) {
    await prisma.person.upsert({
      where: { id: person.id },
      update: { firstName: person.firstName, lastName: person.lastName, grade: person.grade, active: true, roles: { deleteMany: {}, create: person.roles.map(role => ({ role })) } },
      create: { id: person.id, firstName: person.firstName, lastName: person.lastName, grade: person.grade, roles: { create: person.roles.map(role => ({ role })) } },
    });
  }
  process.stdout.write('Deux personnes visiblement fictives préparées dans la base staging isolée.\n');
})().catch(() => {
  process.stderr.write('Échec du chargement des données fictives staging ; aucune donnée réelle ne doit être utilisée.\n');
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
