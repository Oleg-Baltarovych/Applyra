// Shared body of the two infra smoke files (M0-07a AC 3–4). Two files so Vitest runs them on two workers in
// parallel: each must see only its own fresh database and Redis prefix.
import { Client, DatabaseError } from 'pg';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readPoolId } from '../../support/runner-env.js';
import { workerDbName } from '../../support/isolation.js';
import { STALE_CONTROL_KEY, STALE_KEY } from './infra-context.js';
import { testInfra } from './test-infra.js';

async function connect(url: string): Promise<Client> {
  const client = new Client({ connectionString: url });
  await client.connect();
  return client;
}

async function sqlState(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error) {
    if (error instanceof DatabaseError) return error.code;
    throw error;
  }
}

async function scanAll(redis: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';
  do {
    const [next, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 500);
    keys.push(...batch);
    cursor = next;
  } while (cursor !== '0');
  return keys;
}

export function defineInfraSmoke(label: string): void {
  describe(`integration infra (${label})`, () => {
    const infra = testInfra();
    let app: Client;
    let maintenance: Client;
    let redis: Redis;

    beforeAll(async () => {
      app = await connect(infra.databaseUrl);
      maintenance = await connect(infra.maintenanceUrl);
      redis = new Redis(infra.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 1 });
      await redis.connect();
    });

    afterAll(async () => {
      await app.end();
      await maintenance.end();
      redis.disconnect();
    });

    it('connects to its own worker database, owned by applyra_maintenance', async () => {
      const { rows } = await app.query<{ db: string; owner: string }>(
        `SELECT current_database() AS db, pg_get_userbyid(datdba) AS owner
           FROM pg_database WHERE datname = current_database()`,
      );

      expect(rows).toEqual([{ db: workerDbName(readPoolId()), owner: 'applyra_maintenance' }]);
    });

    it('builds applyra_template as a template nobody can connect to', async () => {
      const { rows } = await app.query<{ datistemplate: boolean; datallowconn: boolean }>(
        `SELECT datistemplate, datallowconn FROM pg_database WHERE datname = 'applyra_template'`,
      );

      expect(rows).toEqual([{ datistemplate: true, datallowconn: false }]);
    });

    it('has the same database ACL as the template (CREATE DATABASE … TEMPLATE does not copy it)', async () => {
      const { rows } = await app.query<{ datname: string; acl: string[] | null }>(
        `SELECT datname, datacl::text[] AS acl FROM pg_database
          WHERE datname IN (current_database(), 'applyra_template') ORDER BY datname = 'applyra_template'`,
      );
      const [clone, template] = rows;

      expect(template?.acl).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^applyra_app=c\//),
          expect.stringMatching(/^backup=c\//),
          expect.stringMatching(/^metrics=c\//),
        ]),
      );
      expect(clone?.acl?.slice().sort()).toEqual(template?.acl?.slice().sort());
    });

    it('starts empty: nothing another test file wrote is visible', async () => {
      const { rows } = await maintenance.query<{ found: string | null }>(
        `SELECT to_regclass('public.smoke_marker')::text AS found`,
      );
      expect(rows).toEqual([{ found: null }]);

      await maintenance.query('CREATE TABLE smoke_marker (label text NOT NULL)');
      await app.query('INSERT INTO smoke_marker (label) VALUES ($1)', [label]);
      const marker = await app.query<{ label: string }>('SELECT label FROM smoke_marker');
      expect(marker.rows).toEqual([{ label }]);
    });

    it('gives applyra_app DML only: no DDL, no TEMP, no TRUNCATE', async () => {
      await maintenance.query('CREATE TABLE IF NOT EXISTS smoke_grants (id int)');

      await expect(app.query('SELECT 1 AS one')).resolves.toMatchObject({ rows: [{ one: 1 }] });
      expect(await sqlState(app.query('CREATE TABLE app_owned (id int)'))).toBe('42501');
      expect(await sqlState(app.query('CREATE TEMP TABLE app_temp (id int)'))).toBe('42501');
      expect(await sqlState(app.query('TRUNCATE smoke_grants'))).toBe('42501');
      await app.query('INSERT INTO smoke_grants (id) VALUES (1)');
      await app.query('UPDATE smoke_grants SET id = 2');
      await expect(app.query('SELECT id FROM smoke_grants')).resolves.toMatchObject({
        rows: [{ id: 2 }],
      });
      await app.query('DELETE FROM smoke_grants');
    });

    it('flushes stale keys of its own prefix before the file, and only those', async () => {
      // globalSetup seeded `t<id>:stale` for every pool id and one control key outside all prefixes.
      await expect(scanAll(redis, `${infra.redisPrefix}*`)).resolves.toEqual([]);
      await expect(redis.exists(`${infra.redisPrefix}${STALE_KEY}`)).resolves.toBe(0);
      await expect(redis.get(STALE_CONTROL_KEY)).resolves.toBe('1');

      await redis.set(`${infra.redisPrefix}marker`, label);
      await expect(redis.get(`${infra.redisPrefix}marker`)).resolves.toBe(label);
      expect(infra.redisPrefix.startsWith(`${infra.bullPrefix}:`)).toBe(true);
    });

    it('rejects an unauthenticated Valkey connection (NOAUTH)', async () => {
      const url = new URL(infra.redisUrl);
      expect(url.password).not.toBe('');
      url.username = '';
      url.password = '';
      const anonymous = new Redis(url.toString(), {
        lazyConnect: true,
        maxRetriesPerRequest: 0,
        retryStrategy: () => null,
      });
      // ioredis 6 opens with HELLO, which Valkey answers with NOAUTH → surfaces as a connection 'error' event.
      const errors: Error[] = [];
      anonymous.on('error', (error: Error) => errors.push(error));
      try {
        await expect(anonymous.connect().then(() => anonymous.ping())).rejects.toThrow();
        expect(errors.map((e) => e.message)).toContainEqual(expect.stringMatching(/^NOAUTH/));
      } finally {
        anonymous.disconnect();
      }
    });
  });
}
