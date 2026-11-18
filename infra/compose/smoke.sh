#!/usr/bin/env bash
# Production-stack smoke (M0-14 AC 2, 3, 7): the same script runs locally (infra/README.md) and in CI deploy-ready.
#   infra/compose/smoke.sh <env-file>        (SMOKE_PROJECT=<name> → another compose project, e.g. a fresh stack)
# Needs the images applyra/api:local + applyra/caddy:local (or API_IMAGE/CADDY_IMAGE), host ports 80/443 free,
# docker compose, curl, node (≥ 20, for apps/web/scripts/headers.mjs). Starts project `applyra-prod`, leaves it
# running; clean up with `docker compose -f … -f … --env-file <env> down -v` (infra/README.md).
set -euo pipefail

env_file="${1:?usage: smoke.sh <env-file>}"
env_file="$(cd "$(dirname "$env_file")" && pwd)/$(basename "$env_file")"
cd "$(dirname "$0")/../.."

compose=(docker compose ${SMOKE_PROJECT:+-p "$SMOKE_PROJECT"} -f infra/compose/compose.yml -f infra/compose/compose.prod.yml
  --env-file "$env_file")
value() { sed -n "s/^$1=//p" "$env_file" | tail -n 1; }
app="$(value APP_DOMAIN)"
api="$(value API_DOMAIN)"
root="$(value ROOT_DOMAIN)"
tmp="$(mktemp -d)"
# Any non-zero exit (fail or an unexpected error under set -e): dump state; always remove the scratch dir.
on_exit() {
  local status=$?
  if [ "$status" -ne 0 ]; then
    "${compose[@]}" ps -a >&2 || true
    "${compose[@]}" logs --tail 50 api caddy >&2 || true
  fi
  rm -rf "$tmp"
}
trap on_exit EXIT
fail() {
  echo "smoke: FAIL — $*" >&2
  exit 1
}

echo "smoke: start postgres + redis"
"${compose[@]}" up -d --wait postgres redis

echo "smoke: migrate (internal network, no egress)"
"${compose[@]}" run --rm migrate 2>&1 | tee "$tmp/migrate.log"
grep -q 'applyra_app has no privileges on "_prisma_migrations"' "$tmp/migrate.log" || fail "migrate did not lock _prisma_migrations"

echo "smoke: start api + caddy"
"${compose[@]}" up -d --wait api caddy || fail "api/caddy not healthy"

# *.localhost: Caddy's internal CA issues the certificates → curl trusts exactly that root (Caddy writes it shortly
# after start; poll with a deadline). Public domains: the system trust store applies.
tls=()
case "$root" in
  localhost | *.localhost)
    for _ in $(seq 1 30); do
      "${compose[@]}" cp caddy:/data/caddy/pki/authorities/local/root.crt "$tmp/root.crt" >/dev/null 2>&1 && break
      sleep 1
    done
    [ -s "$tmp/root.crt" ] || fail "Caddy internal CA root.crt not found after 30 s"
    tls=(--cacert "$tmp/root.crt")
    ;;
esac
curl_() {
  # --ssl-no-revoke: Windows (Schannel) cannot check revocation for a private CA; other TLS backends ignore it.
  curl -sS --ssl-no-revoke --retry 5 --retry-all-errors --retry-delay 1 "${tls[@]}" \
    --resolve "$app:443:127.0.0.1" --resolve "$api:443:127.0.0.1" --resolve "$root:443:127.0.0.1" "$@"
}

echo "smoke: api readiness via Caddy"
[ "$(curl_ -o /dev/null -w '%{http_code}' "https://$api/health/ready")" = 200 ] || fail "/health/ready is not 200"
curl_ -o /dev/null -D "$tmp/api.h" "https://$api/health/ready"
grep -qi '^server:' "$tmp/api.h" && fail "api response carries a Server header"

echo "smoke: SPA"
curl_ -o "$tmp/index.html" -D "$tmp/root.h" "https://$app/"
grep -q '<div id="root">' "$tmp/index.html" || fail "/ did not serve index.html"
curl_ -o "$tmp/fallback.html" -D "$tmp/page.h" "https://$app/applications"
cmp -s "$tmp/index.html" "$tmp/fallback.html" || fail "/applications did not fall back to index.html"
asset="$(grep -o '/assets/[^"]*\.js' "$tmp/index.html" | head -n 1)"
[ -n "$asset" ] || fail "no hashed asset in index.html"
curl_ -o /dev/null -D "$tmp/asset.h" "https://$app$asset"
[ "$(curl_ -o /dev/null -w '%{http_code}' "https://$app/assets/missing-0000.js")" = 404 ] || fail "missing asset is not a 404"
[ "$(curl_ -o /dev/null -w '%{http_code} %{redirect_url}' "https://$root/x")" = "301 https://$app/x" ] ||
  fail "root domain does not redirect to the app"

echo "smoke: headers = apps/web/public/_headers"
API_ORIGIN="https://$api" node --input-type=module - "$tmp" "$asset" <<'EOF' || fail "SPA headers differ from _headers"
import { readFileSync } from 'node:fs';
import { headersFor, parseHeadersFile, renderHeaders } from './apps/web/scripts/headers.mjs';
const [dir, asset] = process.argv.slice(2);
const rules = parseHeadersFile(renderHeaders(readFileSync('apps/web/public/_headers', 'utf8'), process.env));
const served = (file) => {
  const lines = readFileSync(`${dir}/${file}`, 'utf8').split(/\r?\n/).filter((l) => l.includes(':'));
  return Object.fromEntries(lines.map((l) => [l.slice(0, l.indexOf(':')).trim().toLowerCase(), l.slice(l.indexOf(':') + 1).trim()]));
};
let ok = true;
for (const [file, path] of [['root.h', '/'], ['page.h', '/applications'], ['asset.h', asset]]) {
  const got = served(file);
  for (const [name, want] of Object.entries(headersFor(rules, path))) {
    if (got[name] !== want) { ok = false; console.error(`${path} ${name}: want "${want}", got "${got[name] ?? '(missing)'}"`); }
  }
  if ('server' in got) { ok = false; console.error(`${path}: Server header present`); }
  // A header sent twice would be joined by browsers (e.g. two Cache-Control values) — must not happen.
  const names = readFileSync(`${dir}/${file}`, 'utf8').split(/\r?\n/).filter((l) => /^[A-Za-z0-9-]+:/.test(l)).map((l) => l.slice(0, l.indexOf(':')).toLowerCase());
  for (const name of new Set(names)) {
    if (names.filter((n) => n === name).length > 1) { ok = false; console.error(`${path}: duplicate ${name} header`); }
  }
}
process.exit(ok ? 0 : 1);
EOF

echo "smoke: OK"
