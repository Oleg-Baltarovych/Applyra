---
paths:
  - "packages/contracts/**"
---
# Contracts rules — `docs/spec/04-architecture.md`, `06-api.md`

- Single source of truth for request/response schemas, enums and JSONB shapes. Web and API import from here; nothing is re-declared elsewhere.
- Export both the schema and the inferred type: `export const X = z.object(...); export type X = z.infer<typeof X>;`
- No runtime dependencies besides `zod`. No Node or browser APIs.
- Changing a schema is a contract change: find all consumers (`grep -rn "<SchemaName>" apps/`) and update both sides in the same change.
- Prefer discriminated unions for states/statuses; mirror DB enums exactly.
- AI output schemas: no URL/HTML fields unless the task needs them (`07-ai.md`).
