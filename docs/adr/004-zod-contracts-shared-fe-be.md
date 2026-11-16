# 004. Zod contracts shared between frontend and backend

- Status: Accepted
- Date: 2026-11-16

## Context
- The same shapes are validated in React forms (React Hook Form), in NestJS request handling, and in AI structured output.
- Duplicated DTOs drift; hand-written OpenAPI drifts even faster.
- Principle: validate external data once at the boundary, trust it inside (see `docs/spec/06-api.md`).
- Enums stored as strings were flagged in review A-12; contracts must be the single source for enum values.

## Decision
All API request/response schemas, enums and typed JSONB payloads live as **Zod 4** schemas in `packages/contracts`, consumed by both apps.
- Backend uses **`nestjs-zod` v5** (supports Zod 4) for request validation and `@ZodResponse` for response typing/serialisation.
- **OpenAPI is generated** from the same schemas via `nestjs-zod`; it is not hand-written.
- Frontend forms use React Hook Form with the Zod resolver and the same schemas.
- Every JSONB column (event payloads, raw source data, matching breakdown, typed config) has a Zod schema in `contracts`.
- AI task input/output schemas are Zod as well (ADR 017).
- Environment config is validated with Zod at startup.

## Alternatives considered
- `class-validator` + `class-transformer` DTOs — decorators cannot be shared with the browser; duplicate schemas on the frontend.
- OpenAPI-first with code generation — extra generation step; schemas less ergonomic in forms.
- tRPC / ts-rest — tight coupling to a TS client; a REST API with OpenAPI is the stated public interface.
- Valibot / ArkType — smaller ecosystem around NestJS and RHF.

## Consequences
- Positive: one schema per shape; compile-time and runtime agreement between FE and BE; OpenAPI always current.
- Negative / trade-offs: dependency on a community package (`nestjs-zod`) and its Zod-version support; Zod 4 migration nuances.
- Follow-ups: decide where generated OpenAPI is published (artifact in CI vs `/api/docs`); add contract tests (review T-03); pin versions in `docs/spec/04-architecture.md`.
