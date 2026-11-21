# Applyra

A daily Telegram digest of relevant vacancies from Ukrainian job sites, filtered and ranked by your profile.
Runs on a GitHub Actions cron: no server, no database.

```
fetch (public feeds) → normalize → dedup (already sent?) → filter + score (profile.json) → Telegram message(s)
```

> Status: v1 — sources DOU and Djinni (public RSS). Next: Work.ua, robota.ua, LinkedIn via e-mail alerts.
> Spec: [docs/spec.md](docs/spec.md).

## Setup

1. **Create a bot**: in Telegram, talk to [@BotFather](https://t.me/BotFather) → `/newbot` → copy the token.
2. **Get your chat id**: send any message to your new bot, then open
   `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser and copy `result[].message.chat.id`.
   (For a channel: add the bot as an admin; the id looks like `-100…`.)
3. **Create the Environment `digest`** (Settings → Environments → New environment), restrict its deployment
   branches to `main`, and add there:
   - environment secrets `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` (not repository secrets)
   - variable `DIGEST_SOURCES` — comma-separated source names (empty = the run does nothing); an environment
     or repository variable both work
4. **Optional — Work.ua / robota.ua / LinkedIn** (no public feeds): create a dedicated Gmail box, enable 2FA, create
   an App Password; subscribe that address to the job alerts on those sites (filters: Node.js / Full-stack, remote);
   add environment secrets `IMAP_USER` (the address) and `IMAP_PASSWORD` (the App Password) to `digest`, and add
   `email` to `DIGEST_SOURCES` (e.g. `dou,djinni,email`). The digest only reads that inbox.
5. **Status buttons** (optional, free Cloudflare account): `cd apps/bot`, `pnpm exec wrangler login`,
   `pnpm exec wrangler d1 create applyra` (put the id into `wrangler.toml`), `pnpm db:migrate`, `pnpm run deploy`,
   then `node --env-file=../../.env scripts/setup.ts https://applyra-bot.<subdomain>.workers.dev` (sets the Worker
   secrets and the bot webhook). Buttons under each vacancy then work, and `/status` lists your applications.
6. **Edit your profile**: `apps/digest/profile.json` (keywords, exclusions, level, remote, salary floor).
   No personal data in it — it is committed. Format: [docs/spec.md](docs/spec.md#profile).
7. The workflow [`digest.yml`](.github/workflows/digest.yml) runs daily at 06:00 UTC; run it by hand from the
   Actions tab (optionally as a dry run).

## Run locally

Requires Node 26 and pnpm 11 (`npm i -g pnpm`).

```sh
pnpm install
pnpm --filter @applyra/digest dry-run           # fake source + example profile, prints the digest
pnpm check
```

A real local send: put `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` into a root `.env` (see `.env.example`),
then from `apps/digest`: `node --env-file=../../.env src/main.ts --source=<name>`.
Sent ids are remembered in `apps/digest/.state/sent.json` (git-ignored).

## Rules

Public feeds/APIs only — no scraping that bypasses a site's ToS, auth or CAPTCHA. Secrets live only in env /
GitHub secrets.
