#!/usr/bin/env bash
# THE REBRAND WRITES EACH VALUE ONCE, AND WHAT IT WROTE STAYS WRITTEN.
#
# Drives the real tooling/rebrand/rebrand.mjs over one-file trees and compares
# the file. This baseline's slug is the upstream project's name lower-cased, so
# three cases hold the line between them: `UptimeFlare` (the credit, the user
# agent) and `monitor_state` (the table) are not this tree's identity and
# survive a rebrand, and upstream's `UPTIMEFLARE_D1` would be refused. Each case is a shape this baseline's identity actually takes in the
# tree — the source link, the site-name seam, the worker name in the component
# and the wrangler config, the D1 database names and the terraform `repo` they
# are built from, the migration runner's `repo`, the placeholder domain, a
# secret ref — and the
# survival cases run through three passes, so a value an earlier rebrand
# wrote (a re-run phase re-runs the rebrand over everything placed) comes
# out of every later one unchanged.
#
# The identity is PINNED (fixtures/baseline-identity.uptimeflare.json)
# rather than read from .baseline/identity.json: what this tests is the engine,
# and its fixtures spell the identity out literally.
#
# Needs: node, git. No network.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
rebrand="$here/../tooling/rebrand/rebrand.mjs"
identity="$here/fixtures/baseline-identity.uptimeflare.json"

fail=0
# check NAME VALUES-JSON FILE CONTENT WANT [PASSES]
check() {
  local name="$1" values="$2" file="$3" content="$4" want="$5" passes="${6:-1}"
  local tmp got out i
  tmp="$(mktemp -d)"
  git -C "$tmp" init -q
  mkdir -p "$tmp/$(dirname "$file")" "$tmp/.rebrand"
  printf '%s\n' "$content" > "$tmp/$file"
  printf '%s\n' "$values" > "$tmp/.rebrand/values.json"
  for ((i = 1; i <= passes; i++)); do
    git -C "$tmp" add -A
    if ! out="$(cd "$tmp" && node "$rebrand" --baseline-identity "$identity" --values .rebrand/values.json --allow-dirty 2>&1)"; then
      echo "   ✕  $name: rebrand pass $i failed:" >&2
      printf '%s\n' "$out" | sed 's/^/        /' >&2
      fail=1
      rm -rf "$tmp"
      return
    fi
  done
  got="$(cat "$tmp/$file")"
  rm -rf "$tmp"
  if [ "$got" = "$want" ]; then
    echo "   ok  $name"
  else
    echo "   ✕  $name:" >&2
    echo "        got:  $got" >&2
    echo "        want: $want" >&2
    fail=1
  fi
}

acme='{"reponame":"acme-status","productname":"Acme Status","productdomain":"acme.dev","githuborg":"acme-inc","subdomain":"acme","orunWorkspace":"ws_79BDXAZQ"}'

echo "── rebrand: the site's own identity"
check "the source link names the product's owner and repository" \
  "$acme" apps/web/lib/site.ts \
  'export const SOURCE_URL = "https://github.com/sourceplane/uptimeflare";' \
  'export const SOURCE_URL = "https://github.com/acme-inc/acme-status";'
check "the site-name seam takes the product's name" \
  "$acme" apps/web/lib/site.ts 'export const SITE_NAME = "My Status Page";' \
  'export const SITE_NAME = "Acme Status";'
check "…and stays a valid string for a name with an apostrophe and an ampersand" \
  '{"reponame":"sams-status","productname":"Sam'"'"'s Status & Uptime","productdomain":"sam.dev"}' \
  apps/web/lib/site.ts 'export const SITE_NAME = "My Status Page";' \
  'export const SITE_NAME = "Sam'"'"'s Status & Uptime";'
check "the display name elsewhere is content, and is left alone" \
  "$acme" apps/web/README.md 'My Status Page, on D1. My Status Page.' \
  'My Status Page, on D1. My Status Page.'
check "the worker name is re-prefixed, the environment suffix kept" \
  "$acme" apps/web/component.yaml 'workerName: uptimeflare-web' \
  'workerName: acme-status-web'
check "the wrangler config's worker name, template and render alike" \
  "$acme" apps/web/wrangler.template.jsonc '  "name": "uptimeflare-web",' \
  '  "name": "acme-status-web",'
check "the environment URLs: worker name and subdomain" \
  "$acme" intent.yaml '    url: https://uptimeflare-web-stage.your-workers-subdomain.workers.dev' \
  '    url: https://acme-status-web-stage.acme.workers.dev'
check "the D1 root's terraform repo — every database name is built on it" \
  "$acme" infra/terraform/cloudflare-d1/terraform/main.tf '  default = "uptimeflare"' \
  '  default = "acme-status"'
check "the per-environment terraform repo parameter" \
  "$acme" intent.yaml '        repo: uptimeflare' \
  '        repo: acme-status'
check "the D1 root's own repo parameter" \
  "$acme" infra/terraform/cloudflare-d1/component.yaml '    repo: uptimeflare' \
  '    repo: acme-status'
check "the migration runner's repo parameter" \
  "$acme" infra/db-migrate/component.yaml '    repo: uptimeflare' \
  '    repo: acme-status'
check "a fixture's database name follows the same rule" \
  "$acme" apps/web/wiring.fixture.json '    "d1_database_name": "stg-uptimeflare-stage"' \
  '    "d1_database_name": "stg-acme-status-stage"'
check "the placeholder domain is the product's domain, not a renamed slug" \
  "$acme" intent.yaml '      BASE_DOMAIN: uptimeflare.example.com' \
  '      BASE_DOMAIN: acme.dev'
check "no domain given: the reserved placeholder, for an owner to replace later" \
  '{"reponame":"acme-status","productname":"Acme Status","githuborg":"acme-inc","subdomain":"acme"}' \
  intent.yaml '      BASE_DOMAIN: uptimeflare.example.com' \
  '      BASE_DOMAIN: acme-status.example.com'
check "an empty domain is no domain" \
  '{"reponame":"acme-status","productname":"Acme Status","productdomain":""}' \
  intent.yaml '      BASE_DOMAIN: uptimeflare.example.com' \
  '      BASE_DOMAIN: acme-status.example.com'
check "the repo slug" \
  "$acme" package.json '  "name": "uptimeflare",' \
  '  "name": "acme-status",'
check "a wiring secret ref names the product's workspace and project" \
  "$acme" apps/web/component.yaml \
  '    WIRING_CLOUDFLARE_D1_STAGE: "secret://uptimeflare/uptimeflare/stage/WIRING_CLOUDFLARE_D1"' \
  '    WIRING_CLOUDFLARE_D1_STAGE: "secret://ws_79BDXAZQ/acme-status/stage/WIRING_CLOUDFLARE_D1"'
check "a templated provider secret ref too (the D1 token the root and the runner bind)" \
  "$acme" infra/db-migrate/component.yaml \
  '    CLOUDFLARE_API_TOKEN: "secret://uptimeflare/uptimeflare/{{ .environment }}/CLOUDFLARE_D1_TOKEN"' \
  '    CLOUDFLARE_API_TOKEN: "secret://ws_79BDXAZQ/acme-status/{{ .environment }}/CLOUDFLARE_D1_TOKEN"'
check "the upstream project's name is credit, and is left alone" \
  "$acme" apps/web/components/Footer.tsx 'powered by <a href="https://github.com/lyc8503/UptimeFlare">UptimeFlare</a>' \
  'powered by <a href="https://github.com/lyc8503/UptimeFlare">UptimeFlare</a>'
check "the checker's user agent names the upstream, not the product" \
  "$acme" apps/web/monitor/monitor.ts "headers.set('user-agent', 'UptimeFlare/1.0 (+https://github.com/lyc8503/UptimeFlare)')" \
  "headers.set('user-agent', 'UptimeFlare/1.0 (+https://github.com/lyc8503/UptimeFlare)')"
check "the state's table keeps its name: it is not the slug" \
  "$acme" apps/web/monitor/store.ts "env.DB.prepare('SELECT value FROM monitor_state WHERE key = ?')" \
  "env.DB.prepare('SELECT value FROM monitor_state WHERE key = ?')"
check "org-owned identity is not renamed" \
  "$acme" intent.yaml 'apiVersion: sourceplane.io/v1 # mail ops@sourceplane.ai' \
  'apiVersion: sourceplane.io/v1 # mail ops@sourceplane.ai'
check "without githuborg the source link keeps the baseline's owner" \
  '{"reponame":"acme-status","productname":"Acme Status","productdomain":"acme.dev"}' \
  apps/web/lib/site.ts 'const SOURCE_URL = "https://github.com/sourceplane/uptimeflare";' \
  'const SOURCE_URL = "https://github.com/sourceplane/acme-status";'

echo "── rebrand: a written value is not rewritten, in any later pass"
contains='{"reponame":"uptimeflare-2","productname":"My Status Page 2","productdomain":"uptimeflare.example.com.au","githuborg":"sourceplane","subdomain":"your-workers-subdomain-2"}'
check "a repo slug containing the baseline's slug survives three passes" \
  "$contains" package.json '  "name": "uptimeflare",' \
  '  "name": "uptimeflare-2",' 3
check "a worker name built on it survives three passes" \
  "$contains" apps/web/component.yaml 'workerName: uptimeflare-web' \
  'workerName: uptimeflare-2-web' 3
check "a database name built on it survives three passes" \
  "$contains" apps/web/wiring.fixture.json '"d1_database_name": "prod-uptimeflare-prod"' \
  '"d1_database_name": "prod-uptimeflare-2-prod"' 3
check "a domain containing the baseline's domain survives three passes" \
  "$contains" intent.yaml 'BASE_DOMAIN: uptimeflare.example.com' \
  'BASE_DOMAIN: uptimeflare.example.com.au' 3
check "a subdomain containing the placeholder survives three passes" \
  "$contains" apps/web/component.yaml 'workersDevSubdomain: your-workers-subdomain' \
  'workersDevSubdomain: your-workers-subdomain-2' 3
check "a site name containing the baseline's name survives three passes" \
  "$contains" apps/web/lib/site.ts 'export const SITE_NAME = "My Status Page";' \
  'export const SITE_NAME = "My Status Page 2";' 3

# --verify runs in every phase. Without the product's values it cannot tell
# the product's own identity from a leftover; with them it can. A real
# leftover must fail it either way.
verify() { # NAME VALUES FILE CONTENT WANT(pass|fail) [--values]
  local name="$1" values="$2" file="$3" content="$4" want="$5" withvalues="${6:-}" tmp got
  tmp="$(mktemp -d)"
  git -C "$tmp" init -q
  mkdir -p "$tmp/$(dirname "$file")" "$tmp/.rebrand"
  printf '%s\n' "$content" > "$tmp/$file"
  printf '%s\n' "$values" > "$tmp/.rebrand/values.json"
  git -C "$tmp" add -A
  if (cd "$tmp" && node "$rebrand" --baseline-identity "$identity" --verify ${withvalues:+--values .rebrand/values.json} >/dev/null 2>&1); then got=pass; else got=fail; fi
  rm -rf "$tmp"
  if [ "$got" = "$want" ]; then echo "   ok  $name"; else echo "   ✕  $name: --verify ${got}ed, want $want" >&2; fail=1; fi
}
echo "── rebrand --verify: the product's own identity is not residue"
verify "given the values, a slug containing the baseline's passes" \
  "$contains" package.json '"name": "uptimeflare-2"' pass --values
verify "without them it cannot know, and fails" \
  "$contains" package.json '"name": "uptimeflare-2"' fail
verify "given the values, a real leftover still fails" \
  "$acme" package.json '"name": "uptimeflare"' fail --values
verify "a leftover worker name fails" \
  "$acme" apps/web/wrangler.jsonc '"name": "uptimeflare-web",' fail --values
verify "a leftover database name fails" \
  "$acme" apps/web/wiring.fixture.json '"d1_database_name": "stg-uptimeflare-stage"' fail --values
verify "a leftover runner parameter fails" \
  "$acme" infra/db-migrate/component.yaml '    repo: uptimeflare' fail --values
verify "a leftover code identifier fails (no rule renames it — so nothing may spell it)" \
  "$acme" apps/web/app/x.ts 'export class Uptimeflare {}' fail --values
verify "a clean product passes" \
  "$acme" package.json '"name": "acme-status"' pass --values

echo "── rebrand: a residue it cannot rename fails the rebrand itself"
tmp="$(mktemp -d)"; git -C "$tmp" init -q; mkdir -p "$tmp/.rebrand" "$tmp/apps/web"
printf '%s\n' "$acme" > "$tmp/.rebrand/values.json"
printf 'const db = env.UPTIMEFLARE_D1\n' > "$tmp/apps/web/x.ts"
git -C "$tmp" add -A
if (cd "$tmp" && node "$rebrand" --baseline-identity "$identity" --values .rebrand/values.json --allow-dirty >/dev/null 2>&1); then
  echo "   ✕  an unrenamable env-var prefix passed the rebrand" >&2; fail=1
else
  echo "   ok  an unrenamable env-var prefix (upstream's UPTIMEFLARE_D1) fails the rebrand, naming the file"
fi
rm -rf "$tmp"

[ "$fail" -eq 0 ] || exit 1
echo "rebrand.test.sh: ok"
