// What globalSetup hands to every worker via `project.provide('infra', …)` (serialisable, M0-07a).
// Passwords are generated per run and live only in memory (never env files, never argv, never logged).

export interface IntegrationInfra {
  readonly host: string;
  readonly pgPort: number;
  readonly valkeyUrl: string;
  readonly superuserPassword: string;
  readonly appPassword: string;
  readonly maintenancePassword: string;
}

export const TEMPLATE_DB = 'applyra_template';
/** Seeded by globalSetup under every worker prefix (`t<id>:stale`); the per-file flush must remove it. */
export const STALE_KEY = 'stale';
/** Seeded outside every worker prefix; the flush must leave it alone. */
export const STALE_CONTROL_KEY = 'tcontrol:stale';

declare module 'vitest' {
  interface ProvidedContext {
    infra: IntegrationInfra;
  }
}

export function postgresUrl(
  infra: IntegrationInfra,
  user: string,
  password: string,
  database: string,
): string {
  const url = new URL(`postgresql://${infra.host}:${String(infra.pgPort)}`);
  url.username = user;
  url.password = password;
  url.pathname = `/${database}`;
  return url.toString();
}
