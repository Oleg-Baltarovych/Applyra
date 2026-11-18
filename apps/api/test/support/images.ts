// Container images for integration tests (M0-07a). Must equal infra/compose/compose.yml — guarded by
// test/images.test.ts. Tag + multi-arch index digest; Renovate (M0-06b) bumps compose and here together.
export const POSTGRES_IMAGE =
  'postgres:18.7@sha256:2ea8630df176ad090ec92136dee850397c5af8781e4bcf2e4162593691c61bbc';
export const VALKEY_IMAGE =
  'valkey/valkey:9.1.3@sha256:3add1a336a920ea54770a001ab6feb3da5fceea96a40373a3a2cd469b815f0b7';
