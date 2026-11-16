---
paths:
  - "apps/api/src/modules/ai/**"
---
# AI module rules — `docs/spec/07-ai.md`

- New AI capability = `ai/tasks/<name>.task.ts` via `defineTask` with Zod input/output, `promptVersion` (date string), tier `fast|smart`, limits (`maxOutputTokens`, `timeoutMs`, `retries`). Use `/ai-task`.
- Concrete model names live in config mapped from the tier, never in task files.
- Executor order: budget check → cache (`task + promptVersion + inputHash`) → call → Zod validation (1 repair attempt, then `INVALID_OUTPUT`) → `AiRun` record.
- Minimal context; strip PII (emails, phones, links) unless the task needs it. Untrusted text only inside delimited data blocks.
- No tools/function calling in R3 tasks. Output schemas forbid URL/HTML fields unless required.
- Any prompt change bumps `promptVersion` and adds/adjusts golden-set cases in `ai/evals/`.
