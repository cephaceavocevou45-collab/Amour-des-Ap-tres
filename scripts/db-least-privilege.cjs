const { spawnSync } = require('node:child_process');

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error('Configuration de provisionnement manquante.');
  return value;
}
function identifier(value) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/i.test(value)) throw new Error('Nom de base ou de rôle invalide.');
  return `"${value}"`;
}
function literal(value) { return `'${value.replaceAll("'", "''")}'`; }

try {
  const adminUrl = new URL(required('PG_ADMIN_URL'));
  if (adminUrl.protocol !== 'postgres:' && adminUrl.protocol !== 'postgresql:') throw new Error();
  const dbName = required('PAROISSE_APP_DATABASE');
  const appName = process.env.PAROISSE_APP_USER?.trim() || 'paroisse_app';
  const migrationName = process.env.PAROISSE_MIGRATION_USER?.trim() || 'paroisse_migrator';
  const appPassword = required('PAROISSE_APP_PASSWORD');
  const migrationPassword = required('PAROISSE_MIGRATION_PASSWORD');
  if (appPassword.length < 32 || migrationPassword.length < 32 || appPassword === migrationPassword) throw new Error();
  const host = adminUrl.hostname;
  const port = adminUrl.port || '5432';
  const adminUser = decodeURIComponent(adminUrl.username);
  const args = ['--no-psqlrc', '--set=ON_ERROR_STOP=1', '--host', host, '--port', port, '--username', adminUser, '--dbname', dbName];
  const env = { ...process.env, PGPASSWORD: decodeURIComponent(adminUrl.password) };
  const emptyCheck = spawnSync('psql', [...args, '--tuples-only', '--no-align', '--command', "SELECT COUNT(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')"], { encoding: 'utf8', env, windowsHide: true });
  if (emptyCheck.error || emptyCheck.status !== 0 || emptyCheck.stdout.trim() !== '0') throw new Error('Provisionnement refusé : base cible absente, inaccessible ou non vide.');
  const sql = `
DO $roles$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${literal(appName)}) THEN
    EXECUTE format('ALTER ROLE %I WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', ${literal(appName)});
  ELSE
    EXECUTE format('CREATE ROLE %I WITH LOGIN NOINHERIT PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', ${literal(appName)}, ${literal(appPassword)});
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${literal(migrationName)}) THEN
    EXECUTE format('ALTER ROLE %I WITH LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', ${literal(migrationName)});
  ELSE
    EXECUTE format('CREATE ROLE %I WITH LOGIN NOINHERIT PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', ${literal(migrationName)}, ${literal(migrationPassword)});
  END IF;
END $roles$;
GRANT CONNECT ON DATABASE ${identifier(dbName)} TO ${identifier(appName)}, ${identifier(migrationName)};
GRANT USAGE, CREATE ON SCHEMA public TO ${identifier(migrationName)};
GRANT USAGE ON SCHEMA public TO ${identifier(appName)};
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${identifier(appName)};
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${identifier(appName)};
ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(migrationName)} IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${identifier(appName)};
ALTER DEFAULT PRIVILEGES FOR ROLE ${identifier(migrationName)} IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${identifier(appName)};
`;
  const result = spawnSync('psql', args, { input: sql, encoding: 'utf8', env, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error('Provisionnement PostgreSQL impossible. Vérifiez les droits de l’administrateur et que la base existe et est vide.');
  process.stdout.write('Rôles PostgreSQL configurés : application sans privilège de création, migrations séparées. Aucun secret affiché.\n');
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Provisionnement PostgreSQL impossible.'}\n`);
  process.exitCode = 1;
}
