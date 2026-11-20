# Applyra — Vacancy Digest Spec

- Version: 3.0 (pivot, ADR 026) · Date: 2026-11-19 · Owner: solo
- Previous spec v2.1 (CRM) is archived under the git tag `archive/crm-plan-v0`.

## 1. Goal

Once a day, send the owner one Telegram digest of **new** vacancies from Ukrainian job sites that match the
owner's profile, ranked by relevance, each with 1–3 short reasons. Zero hosting: GitHub Actions cron, no DB.

Success = the owner stops opening job sites by hand; ≤ 1 false positive in 5; no vacancy is sent twice.

## 2. Sources (v1 — confirm per site before adding)

Only public feeds/APIs, one request per feed per run, generic User-Agent, timeouts. Never bypass ToS,
robots rules, auth or CAPTCHA; never use a logged-in session.

| Source | Feed | Id for dedup | Notes |
|---|---|---|---|
| DOU (`dou`) | RSS `jobs.dou.ua/vacancies/feeds/?category=<C>&remote`, C = `Node.js`, `Fullstack` | numeric id in the link | `guid` has a changing `?timestamp` suffix; company, cities, remote and salary are packed into the (double-escaped) title: "Role в Company, cities, $X–Y, віддалено" — split at the last " в "; `exp` takes one value only, so experience is left to the profile; an unknown category returns an empty feed |
| Djinni (`djinni`) | RSS `djinni.co/jobs/rss/?primary_keyword=<K>&exp_level=2y&exp_level=3y&exp_level=5y&employment=remote`, K = `Node.js`, `Fullstack` | number in the link | no company/salary/location fields: company from "Про компанію X" in the description, location = remote (request filter); an unknown keyword silently returns the **unfiltered** feed → the feed is rejected when any item lacks the requested `<category>` |

Each feed (site × key) is its own source: one request per run; a broken feed only drops itself.
Requests: User-Agent `ApplyraDigest/1.0 (personal daily job digest; RSS reader)`, 20 s timeout, body streamed
with a 2 MB cap, redirects refused; a non-RSS response (e.g. an anti-bot page) fails the feed. The parser is linear
(no backtracking regex over feed text) and reads at most 300 items; items whose link is not https on the site's own
host are dropped. Source-side pre-filtering keeps feeds small; the profile filter still runs.
Other sites (Work.ua, robota.ua, LinkedIn…) only after a spike confirms a public feed and permitted use.

## 3. Pipeline (`apps/digest/src`)

1. **fetch** — `Source.fetch(): RawItem[]` per adapter (`sources/`), in parallel; a failing source is logged
   and skipped; all failing → the run fails.
2. **normalize** — `RawItem → Vacancy` (`normalize/`): canonical url (no fragment/tracking params, sorted
   query), salary (`$X–Y`, `від/from`, `до/up to`, USD/EUR/UAH), remote mode (remote/hybrid/office/unknown),
   cities, experience years. Items without a title or http(s) url are dropped.
3. **dedup** (`dedup.ts`) — keys: canonical url + fuzzy `company|sorted title tokens` (no fuzzy key without a
   company). Skips anything in the sent state and repeats within the batch (first wins).
4. **filter + score** (`filter.ts`) — hard rejects, then a score with reasons and caveats (§4).
5. **format** (`format.ts`) — Telegram HTML, every field escaped, http(s) links only, field sizes capped
   in escaped characters (title 200, company 100, city 50 × 3, href 1000 else no link), a block that still
   does not fit becomes title-only; split into messages ≤ 4096 chars without breaking an item; header with
   date and count.
6. **send** (`telegram.ts`) — Bot API `sendMessage` via `fetch`, `parse_mode: HTML`, previews off, one retry
   on 429. The token never appears in logs or errors.
7. **remember** — after each delivered message its vacancies are added to the state. A 400 content error
   (too long, can't parse entities, empty) quarantines that message's vacancies (remembered, counted as
   `rejected`) and the run continues; any other send error stops the run. The state is saved even after a
   failure (a save error is logged and never hides the send error; nothing is saved if loading failed).
   `--dry-run` prints the messages inside a `::stop-commands::` block and leaves the state untouched.
   Source errors are logged through a redactor (urls without query/userinfo, one line, ≤ 300 chars).

## 4. Profile (`apps/digest/profile.json`) {#profile}

Committed, preferences only (no personal data). Keyword lists are `label|alt|alt` specs: case-insensitive,
Unicode word boundaries ("ts" ≠ "tests", "java" ≠ "javascript"), the label is what reasons show.

| Field | Meaning |
|---|---|
| `titleKeywords` | role/stack words; +3 each when in the title |
| `required` | at least one in title or description, else reject; +2 in title / +1 in description |
| `bonus` | +1 each anywhere (e.g. nestjs, postgresql, crypto) |
| `excludeStacks` | reject when the **title** names one and has no `required` keyword ("Node.js + Go" stays) |
| `excludeTitles` | management titles, always rejected ("head of", "team lead"; "tech lead" stays) |
| `level.exclude` / `level.allow` | reject only if the title has an excluded level and no allowed one ("Junior/Middle" stays) |
| `level.minExperienceYears` | title without a level: allowed level or ≥ N years in the description → +2; fewer years → caveat "N+ year exp"; nothing → caveat "level unclear" |
| `remote` | allowed work modes (`remote`, `hybrid`, `office`); a known other mode → reject; +2 when allowed |
| `remoteUnknown` | `keep` (caveat "remote unclear", no bonus) or `drop` |
| `languages` | `uk`, `en`, `ru`; detected text language outside the list → reject (undetectable → keep) |
| `salary.minUsdMonth` | floor in USD/month or `null`; only a known upper bound below the floor rejects ("від $X" never does); no upper cap |
| `salary.uahPerUsd`, `salary.uahTolerance` | UAH conversion rate and tolerance (0.1 = reject only below 90 % of the floor) |
| `maxItems` | digest size (top N by score, newer first on ties) |

Salary bonus when the best known value ≥ floor: `1 + (best − floor) / 1000`, capped at 4 — higher pay ranks
first among equal posts but never outweighs a stack match. Missing salary: no penalty. Domains (gambling,
crypto…) are never excluded by default.

## 5. State

`apps/digest/.state/sent.json` = `{ version: 1, sent: { <dedup key>: <ISO sentAt> } }`, entries pruned after
30 days. Missing file = first run; a corrupt file fails the run (rather than resending everything).
In Actions the directory is restored from / saved to the Actions cache (`digest-state-<run id>`, restored by
prefix). Cache entries unused for 7 days are evicted → a long pause may resend up to 30 days of vacancies
once. If that becomes a problem: a state branch or a gist (new ADR).

## 6. Schedule & config

`.github/workflows/digest.yml`: daily 06:00 UTC (08:00/09:00 Kyiv) + manual run (optional dry run);
`permissions: contents: read`; concurrency group `digest`, never cancelled.
Job `environment: digest` (restricted to main). Env: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (environment
secrets), `DIGEST_SOURCES` (variable),
`DIGEST_PROFILE_PATH`, `DIGEST_STATE_PATH` (optional). CLI: `--dry-run`, `--source=a,b`, `--profile=path`.

## 7. Non-goals

No web UI, no database, no hosting, no multi-user, no application tracking/CRM, no auto-apply, no scraping
behind login/CAPTCHA, no LLM in v1 (an optional LLM re-ranking step may come later behind its own ADR).
