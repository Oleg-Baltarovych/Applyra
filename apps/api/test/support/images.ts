// Container images for integration tests (M0-07a). Must equal infra/compose/compose.yml — guarded by
// test/images.test.ts. Tags for now; digests arrive with Renovate (M0-06b) in compose and here together.
export const POSTGRES_IMAGE = 'postgres:18.7';
export const VALKEY_IMAGE = 'valkey/valkey:9.1.3';
