# 004. Cross-site repeats matched by the full title when the company is unknown

- Status: Accepted
- Date: 2026-11-21

## Context

The same vacancy is often posted on DOU and Djinni. The fuzzy dedup key is `company | title words`, but the
Djinni RSS rarely names the company (the "Про компанію X" block is missing in most items), so such pairs reached
the digest twice (seen in the first digests: the same NerdySoft and Zeely AI posts from both sites).

## Decision

- An extra key per vacancy from the **full** title (bracketed words included, noise words such as "remote"
  dropped, word order ignored): `tk:` when the company is known, `tu:` when it is not.
- A vacancy is a repeat when a matching title key was seen **in the last 7 days** (or earlier in the batch) and
  **at least one side has no company**: a company-less post matches `tk:` and `tu:`, a post with a company
  matches only `tu:`. Two posts that both name a company never merge by title.
- Titles with fewer than 4 words get no title key ("Senior Node.js Developer" is too generic).
- Within a batch, posts with a company are considered first, so the version with the company is the one shown.

## Consequences

- DOU/Djinni duplicates disappear without new requests or fields.
- A different company's vacancy with exactly the same ≥ 4-word title within a week, where one of the two posts
  has no company, is skipped. Accepted: rare, and the window is short.
