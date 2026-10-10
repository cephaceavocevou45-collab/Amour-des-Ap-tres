\getenv app_password POSTGRES_APP_PASSWORD
\getenv app_database POSTGRES_APP_DATABASE
CREATE ROLE paroisse_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
SELECT format('CREATE DATABASE %I OWNER %I', :'app_database', 'paroisse_app') \gexec
