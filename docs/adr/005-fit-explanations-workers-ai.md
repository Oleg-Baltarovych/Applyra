# 005. Fit explanations by an LLM on Cloudflare Workers AI (free plan)

- Status: Accepted
- Date: 2026-11-23

## Context

The deterministic filter (spec §4) decides what reaches the digest, but its reasons are keyword labels
("node.js · nestjs · remote"). A short human sentence on why a vacancy fits, and what may not fit, saves opening
weak matches. Constraints: zero cost (no paid API, no card on file), secrets only in env, feed text is untrusted,
a run must never fail or stall because of an optional step. Spec §7 deferred any LLM step to its own ADR.

## Decision

An optional **explain** step after ranking: one LLM call per digest vacancy returns
`{ fit, risk }` (Ukrainian, ≤ 160 / ≤ 100 chars), shown as line 4 of the vacancy message
`💡 <fit> · ⚠️ <risk>`. The LLM never filters or reorders: ranking stays deterministic.

- Provider: **Cloudflare Workers AI** REST (`/accounts/<id>/ai/run/<model>`), model
  `@cf/meta/llama-3.3-70b-instruct-fp8-fast`, JSON mode (`response_format: json_schema`), no streaming.
- Free plan: 10 000 Neurons/day; past it requests fail (no charge). Measured on a 50-item digest
  (2026-11-23): ~1 050 input + ~32 output tokens ≈ 35 Neurons per vacancy, ~1 750 per run (≈ $0.02 at paid
  rates), latency p50 ~1.5 s / p95 ~3–4 s.
- Behind an interface `LlmClient` (`complete(request, signal) → { value, inputTokens, outputTokens }`, `explain.ts`); the Workers AI adapter
  (`workers-ai.ts`) is the only I/O. Another provider (e.g. Claude) = another adapter, nothing else changes.
- Enabled when `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_AI_TOKEN` are set (token scoped to Workers AI only).
- Failure never blocks the digest: timeout 30 s per call, 3 calls at a time, 3 min for the whole step,
  a limit/auth error stops further calls for the run; an invalid or missing answer = the vacancy goes without line 4. Nothing explained, a run cut short
  by a limit/budget, or half-set variables → one line in the run's alert (spec §6).
- Accepted risk: a vacancy can still steer the wording (e.g. overstate the fit). Line 4 is marked 💡 as a hint;
  fields with links, e-mails, bare domains, phones or `tg:` are dropped, not rewritten.
- Untrusted input: the vacancy goes in a delimited user message, the system prompt says it is data, not
  instructions; description cut to 3 000 chars; the output is schema-checked, stripped of urls and markup,
  length-capped and escaped like any feed field. No tools, no links from the model.
- Sent to the model: profile preferences only (no personal data) + the public vacancy text.
- Logged per run (stdout + Actions step summary): model, calls ok/failed/skipped, input/output tokens,
  latency p50/p95/max, Neurons and their price-list $ equivalent. Never the token or account id.

## Alternatives considered

- GitHub Models (free via `GITHUB_TOKEN`) — retired on 2026-07-30.
- Claude API — best quality, but paid only (prepaid credits); kept as a future adapter.
- Gemini free tier — Flash cut to ~20 requests/day in 2026, limits not guaranteed.
- Groq free tier — workable, but a new account and inconsistent published limits; Cloudflare is already used (ADR 003).
- LLM re-ranking / filtering — less predictable and harder to test; explanations add value without that risk.

## Consequences

- Positive: richer messages at $0; a provider-agnostic, tested LLM layer with cost and latency numbers.
- Negative: ~1–2 min longer runs; Llama's Ukrainian is decent, not perfect; free limits may change
  (the step then degrades to no explanations).
- Follow-ups: a small eval set (real vacancies + expected fit/risk) before tuning the prompt; a Claude adapter
  if a paid key ever exists.
