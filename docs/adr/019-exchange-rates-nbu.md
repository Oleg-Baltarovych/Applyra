# 019. Exchange rates from the National Bank of Ukraine (NBU)

- Status: Accepted (Q7 resolved in `docs/spec/01-product.md`; technical verification in R2)
- Date: 2026-11-16

## Context
- Salaries are normalised to USD/month (`salaryMinUsdMonth`, `salaryMaxUsdMonth`) for filters and matching (see `docs/spec/08-ingestion-matching.md`).
- Jobs quote USD, EUR, UAH and others; normalisation needs daily rates stored in `ExchangeRate(base, quote, date, rate)`.
- Open question Q7: NBU or ECB public API.

## Decision
Use the **NBU public exchange-rate API** as the source, fetched by the `fx:fetch` job scheduler (twice daily, `docs/spec/08-ingestion-matching.md` §7.2) into `ExchangeRate` (R2).
- UAH is the NBU base currency; USD conversions are derived via cross rates.
- `salary*UsdMonth` is computed on write and recalculated nightly for open jobs; year → /12, hour → ×168.
- UI always shows the original salary; the normalised value is secondary (tooltip/brackets).

## Alternatives considered
- ECB reference rates — EUR base; UAH is believed not to be in the reference set (to verify), and UAH matters for the Ukrainian market.
- Commercial FX APIs — keys, cost, rate limits; unnecessary precision for salary filtering.
- Static rates in config — stale quickly.

## Consequences
- Positive: free, official source covering UAH directly.
- Negative / trade-offs: cross rates via UAH introduce small rounding differences; dependency on NBU API availability.
- Follow-ups: confirm in R2 — verify API format, update time, and currency coverage; define fallback when the daily fetch fails (use last known rate, alert via ADR 013); confirm ECB has no UAH before rejecting it.
