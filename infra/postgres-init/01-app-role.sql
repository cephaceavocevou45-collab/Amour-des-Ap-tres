\getenv app_password POSTGRES_APP_PASSWORD
\getenv migration_password POSTGRES_MIGRATION_PASSWORD
\getenv app_database POSTGRES_APP_DATABASE
CREATE ROLE paroisse_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE paroisse_migrator LOGIN PASSWORD :'migration_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
SELECT format('CREATE DATABASE %I OWNER %I', :'app_database', 'paroisse_migrator') \gexec
\connect :app_database
ALTER SCHEMA public OWNER TO paroisse_migrator;
GRANT USAGE ON SCHEMA public TO paroisse_app;
ALTER DEFAULT PRIVILEGES FOR ROLE paroisse_migrator IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO paroisse_app;
ALTER DEFAULT PRIVILEGES FOR ROLE paroisse_migrator IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO paroisse_app;
