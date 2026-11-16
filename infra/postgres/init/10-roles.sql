-- Applyra database roles and grants (docs/spec/12-infra-ops.md §4, 05-data-model.md §7.5, ADR 012/016).
--
-- Runs as a superuser against the application database:
--   * docker: mounted into /docker-entrypoint-initdb.d (first start of an empty volume only);
--     the entrypoint runs it with `psql -v ON_ERROR_STOP=1 --dbname "$POSTGRES_DB"`.
--   * manually / cloud-init: `psql -v ON_ERROR_STOP=1 -d applyra -f 10-roles.sql`.
-- Passwords are read from the environment of the psql process via \getenv (never on argv, never in git):
--   APPLYRA_APP_PASSWORD, APPLYRA_MAINTENANCE_PASSWORD, APPLYRA_BACKUP_PASSWORD, APPLYRA_METRICS_PASSWORD
-- Idempotent: re-running updates passwords (rotation) and re-applies grants.

\set ON_ERROR_STOP on
-- Client side too: psql's default error output echoes the failing statement ("LINE 1: ..."), which in the
-- docker entrypoint lands in `docker logs`. Terse errors print only the message.
\set VERBOSITY terse
\set SHOW_CONTEXT never

-- Keep plaintext passwords out of the server log for this session, whatever the server-wide settings are:
-- no statement logging, no "STATEMENT:" line on errors, no slow-statement logging. Superuser-only SETs.
-- Force SCRAM verifiers (never md5) for the passwords set below.
SET log_statement = 'none';
SET log_min_error_statement = 'panic';
SET log_min_duration_statement = -1;
SET password_encryption = 'scram-sha-256';

\getenv app_password APPLYRA_APP_PASSWORD
\getenv maintenance_password APPLYRA_MAINTENANCE_PASSWORD
\getenv backup_password APPLYRA_BACKUP_PASSWORD
\getenv metrics_password APPLYRA_METRICS_PASSWORD

-- Fail fast (non-zero exit) when a password is missing or shorter than 16 characters.
\if :{?app_password}
\else
  DO $$ BEGIN RAISE EXCEPTION 'APPLYRA_APP_PASSWORD is not set'; END $$;
\endif
\if :{?maintenance_password}
\else
  DO $$ BEGIN RAISE EXCEPTION 'APPLYRA_MAINTENANCE_PASSWORD is not set'; END $$;
\endif
\if :{?backup_password}
\else
  DO $$ BEGIN RAISE EXCEPTION 'APPLYRA_BACKUP_PASSWORD is not set'; END $$;
\endif
\if :{?metrics_password}
\else
  DO $$ BEGIN RAISE EXCEPTION 'APPLYRA_METRICS_PASSWORD is not set'; END $$;
\endif

SELECT length(:'app_password') >= 16
   AND length(:'maintenance_password') >= 16
   AND length(:'backup_password') >= 16
   AND length(:'metrics_password') >= 16 AS passwords_ok \gset
\if :passwords_ok
\else
  DO $$ BEGIN RAISE EXCEPTION 'APPLYRA_*_PASSWORD values must be at least 16 characters'; END $$;
\endif

SELECT count(DISTINCT p) = 4 AS passwords_distinct
FROM (VALUES (:'app_password'), (:'maintenance_password'), (:'backup_password'), (:'metrics_password')) AS v(p) \gset
\if :passwords_distinct
\else
  DO $$ BEGIN RAISE EXCEPTION 'APPLYRA_*_PASSWORD values must be pairwise distinct'; END $$;
\endif

-- Roles: CREATE if missing, otherwise ALTER (password rotation). Attributes are explicit on both paths.
SELECT format('%s ROLE %I WITH %s PASSWORD %L',
              CASE WHEN EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r.name) THEN 'ALTER' ELSE 'CREATE' END,
              r.name, r.attrs, r.password)
FROM (VALUES
  ('applyra_app',         'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'app_password'),
  ('applyra_maintenance', 'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'maintenance_password'),
  -- NOREPLICATION until WAL-G (R1, M5-17 grants REPLICATION + pg_hba restriction to the backup host).
  ('backup',              'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'backup_password'),
  ('metrics',             'LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS', :'metrics_password')
) AS r(name, attrs, password)
\gexec

-- Forget the plaintext values for the rest of the session.
\unset app_password
\unset maintenance_password
\unset backup_password
\unset metrics_password

-- applyra_maintenance owns the database (CREATE EXTENSION of trusted pg_trgm/unaccent, migrations)
-- and the public schema (DDL). Nobody else may create objects.
SELECT format('ALTER DATABASE %I OWNER TO applyra_maintenance', current_database()) \gexec
SELECT format('REVOKE ALL ON DATABASE %I FROM PUBLIC', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO applyra_app, backup, metrics', current_database()) \gexec
ALTER SCHEMA public OWNER TO applyra_maintenance;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO applyra_app;

-- applyra_app: DML only, on every table/sequence the maintenance role creates (i.e. every migration).
-- AuditLog INSERT/SELECT-only is a table-level REVOKE in the R1 migration that creates it (05 §7.5).
ALTER DEFAULT PRIVILEGES FOR ROLE applyra_maintenance IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO applyra_app;
ALTER DEFAULT PRIVILEGES FOR ROLE applyra_maintenance IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO applyra_app;
-- No `GRANT ... ON ALL TABLES` catch-up on purpose: a re-run would re-grant UPDATE/DELETE on "AuditLog".
ALTER ROLE applyra_app SET statement_timeout = '30s';
ALTER ROLE applyra_app SET idle_in_transaction_session_timeout = '60s';

-- Convergence on re-runs: strip predefined roles that would widen access if someone granted them by hand.
-- Only existing memberships are revoked (a REVOKE of a missing one would print a WARNING on every run).
SELECT format('REVOKE %I FROM %I', g.rolname, m.rolname)
FROM pg_auth_members am
JOIN pg_roles g ON g.oid = am.roleid
JOIN pg_roles m ON m.oid = am.member
WHERE (m.rolname = 'applyra_app' AND g.rolname IN ('pg_read_all_data', 'pg_write_all_data', 'pg_monitor'))
   OR (m.rolname IN ('backup', 'metrics') AND g.rolname = 'pg_write_all_data')
\gexec

-- backup (pg_dump now; WAL-G from R1): read everything.
GRANT pg_read_all_data TO backup;

-- metrics (postgres_exporter).
GRANT pg_monitor TO metrics;
