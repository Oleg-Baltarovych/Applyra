# infra/postgres

`init/10-roles.sql` creates the database roles and grants from `docs/spec/12-infra-ops.md` §4
(`applyra_app`, `applyra_maintenance`, `backup`, `metrics`). Verified on PostgreSQL 18 in M0-03.

## How it runs

- **Compose (M0-04):** mount `infra/postgres/init` read-only at `/docker-entrypoint-initdb.d`. The official
  image runs it once, on the first start with an empty data volume, as `POSTGRES_USER` against `POSTGRES_DB`.
- **Manually / cloud-init:** `psql -v ON_ERROR_STOP=1 -d applyra -f infra/postgres/init/10-roles.sql` as a superuser.
- **Testcontainers (M0-07a):** run it before `prisma migrate deploy` — migrations reference `applyra_app`
  (e.g. the AuditLog `REVOKE`, `05-data-model.md` §7.5) and fail on a cluster without the roles.

## Passwords

The script reads them with psql `\getenv` from the environment of the `psql` process (not argv, not git):
`APPLYRA_APP_PASSWORD`, `APPLYRA_MAINTENANCE_PASSWORD`, `APPLYRA_BACKUP_PASSWORD`, `APPLYRA_METRICS_PASSWORD`.
In Compose pass them as `environment:` of the `postgres` service (from the untracked env file / secrets).
A missing value, one shorter than 16 characters, or two equal values abort the script with a non-zero exit.
Re-running the script is safe: it rotates passwords, re-applies grants and revokes hand-granted
`pg_read_all_data` / `pg_write_all_data` / `pg_monitor` from `applyra_app` (`pg_write_all_data` from `backup`/`metrics`).

Plaintext passwords stay out of logs: the session sets `log_statement = 'none'`, `log_min_error_statement = 'panic'`,
`log_min_duration_statement = -1` (server log) and psql `VERBOSITY terse` (psql would otherwise echo a failing
statement into `docker logs`). `password_encryption = 'scram-sha-256'` → stored verifiers are `SCRAM-SHA-256$…`.
Verified in M0-03 with server-wide `log_statement = all` and a forced error.
The statement text is also kept out of `pg_stat_activity` (readable by `metrics` via `pg_monitor`) with
`track_activities = off`, and out of `pg_stat_statements` (if enabled later) with `pg_stat_statements.track_utility = off`
— verified: a running statement in a session with `track_activities = off` is invisible to `metrics`.

## Notes

- **Run migrations as `applyra_maintenance`.** The app's DML comes from `ALTER DEFAULT PRIVILEGES FOR ROLE
applyra_maintenance`; a table created by any other role gives `applyra_app` nothing.
- **`_prisma_migrations`** is created by Prisma on the first `migrate deploy`, so it is not covered here: every
  deploy step runs `REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON "_prisma_migrations" FROM applyra_app;` as
  maintenance afterwards (M0-08, M0-14).
- **`statement_timeout = 30s`** for `applyra_app` is a role default, not a hard limit — a session can `SET` it higher.
- **`pg_read_all_data` is not `BYPASSRLS`**: if row-level security is ever introduced, `backup` would need
  `BYPASSRLS` for complete dumps.
- **`backup` is `NOREPLICATION`** until WAL-G (R1, M5-17), which grants `REPLICATION` and restricts replication
  connections in `pg_hba.conf` to the backup host.

## What the roles can do

| Role                  | Can                                                                                           | Cannot                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| `applyra_app`         | `CONNECT`; DML on every table created by `applyra_maintenance` (default privileges)           | DDL, `TRUNCATE`, temp tables; AuditLog `UPDATE`/`DELETE` (R1 migration) |
| `applyra_maintenance` | owns the database and `public` schema: migrations, trusted extensions (`pg_trgm`, `unaccent`) | create databases (shadow DB → `SHADOW_DATABASE_URL`)                    |
| `backup`              | `pg_read_all_data` (`pg_dump`); `REPLICATION` from M5-17                                      | write                                                                   |
| `metrics`             | `pg_monitor` (postgres_exporter)                                                              | read application tables                                                 |

`applyra_app` also gets `statement_timeout = 30s` and `idle_in_transaction_session_timeout = 60s`.
