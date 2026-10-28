#!/usr/bin/env bash
# TIER 2 — the product a bootstrap produces builds, migrates, deploys (dry)
# and serves.
#
# placement.test.sh proves the tree a bootstrap ends with is the right tree.
# This proves it WORKS, by doing to it what its own pipelines will:
#
#   1. at the 01-product landing (the commit its one pull request merges),
#      install with the lockfile the product ships, render the wrangler
#      fixture and check the committed config IS that render, typecheck,
#      lint, test, build. The landing's own PR runs `plan` alone (an
#      `orun/BASE-*` branch), so THIS is where a product those steps refuse
#      is caught: before the tag, not after a build has merged it;
#   2. the stage lanes' own steps, rendered by `orun plan` in the product and
#      run IN THE TREE THE RUNNER STAGES for each job (testing/lib/stage-job.py),
#      with the dependency layout the pinned composition produces and with the
#      job's secrets in its environment as the platform resolves them (the
#      component's secretEnv):
#      - web, from a pull request's plan (the verify profile: the deploy
#        profile has no dry run) — `verify-app-structure` (which checks the
#        wrangler config exists BEFORE anything is built), `build-app` (the
#        component's buildCommand: the live wiring render, then the build),
#        `verify-build-output` and `deploy-dry-run` (`wrangler deploy
#        --dry-run --name <reponame>-web-stage`), the database id in the built
#        config asserted to be the stage document's, not the fixture's, and an
#        environment's STATUS_PAGE_PASSWORD kept out of every built file;
#      - db-migrate: its install and build, the pull request's `plan` (offline,
#        every checksum verified), then the merge's `apply` — the step a push
#        to main runs — against a stand-in for D1's REST API over real SQLite
#        (testing/lib/d1-api.py), which refuses any account, database or token
#        but the ones the job resolves: the `monitor_state` table created and every
#        migration recorded; then the apply again, which applies nothing;
#   3. serve the built Worker with `wrangler dev --test-scheduled` (a local D1
#      behind the same binding) — the page and the checker in one Worker:
#      with no schema the API says so and the component's OWN `smokeCommand`
#      REFUSES it, and a fired trigger fails; after the product's own
#      `db:migrate:local` a fired trigger checks every monitor into D1 and the
#      smoke passes, verbatim — the check the real deploy ends with — and then
#      every route the site promises: the page's title carries the product's
#      name and hands the browser only each monitor's safe fields, the client
#      bundle links the product's repository and carries no monitor target
#      (CVE-2026-29779), /api/data answers every configured monitor, the
#      badge answers, /incidents and the favicon are served, an unknown path
#      is a 404; then the same Worker with a STATUS_PAGE_PASSWORD asks for it,
#      and the smoke, given it, passes.
#
# What it cannot do is the platform's half: create the repository, mint the
# brokered Cloudflare tokens, apply the database, migrate it and deploy for
# real, fire the trigger on Cloudflare's clock, and probe workers.dev. The D1
# root is verified to `terraform validate`
# and its plan is part of every pull request's lanes; the apply needs an
# account.
#
# Needs: orun, node, pnpm, python3 (+PyYAML), git, curl, and the network for
# `pnpm install` and the build's Google Font (or a warm store). A few minutes:
# three installs and two builds.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/.." && pwd)"
# shellcheck source=lib/bootstrap.sh
source "$here/lib/bootstrap.sh"

for bin in orun node pnpm python3 git curl; do
  command -v "$bin" >/dev/null || { echo "e2e.test.sh needs $bin on PATH" >&2; exit 1; }
done

scratch="$(mktemp -d)"
dev_pid=""
api_pid=""
# wrangler dev runs under pnpm, node and two workerd processes; a TERM to the
# first does not reach the rest, and waiting on it then never returns. So it is
# started as its own process group (setsid) and the whole group is stopped.
stop_group() {
  kill -TERM -- "-$1" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do kill -0 -- "-$1" 2>/dev/null || break; sleep 0.5; done
  kill -KILL -- "-$1" 2>/dev/null || true
}
cleanup() {
  [ -z "$dev_pid" ] || stop_group "$dev_pid"
  [ -z "$api_pid" ] || stop_group "$api_pid"
  rm -rf "$scratch"
}
trap cleanup EXIT
values="$here/fixtures/acme.json"
repo="$(python3 -c "import json,sys;print(json.load(open(sys.argv[1]))['reponame'])" "$values")"
export CI=1 WRANGLER_SEND_METRICS=false NEXT_TELEMETRY_DISABLED=1 TURBO_TELEMETRY_DISABLED=1

# The landing's own checks, step for step: what a pull request in the product
# verifies through its lanes, run here at once on the whole tree.
LANDING_CHECKS=(
  "pnpm install --frozen-lockfile"
  "pnpm run wire:fixture"
  "git diff --exit-code"
  "pnpm typecheck"
  "pnpm lint"
  "pnpm test"
  "pnpm build"
)
checks() { # DIR LOG
  local dir="$1" log="$2" cmd
  for cmd in "${LANDING_CHECKS[@]}"; do
    echo "   \$ $cmd" | tee -a "$log"
    if ! (cd "$dir" && bash -c "$cmd") >> "$log" 2>&1; then
      echo "FAIL: \`$cmd\` failed in $dir" >&2; tail -40 "$log" >&2; return 1
    fi
  done
}

# A job's steps out of a plan, by component and environment: each step's
# script (named by its id, or by a fixed name for the composition steps this
# file runs), the job's path, its env and the names of its secrets.
extract() { # PLAN COMPONENT ENV OUTDIR
  python3 - "$@" <<'PY'
import json, pathlib, re, sys
plan, comp, env, out = json.load(open(sys.argv[1])), sys.argv[2], sys.argv[3], pathlib.Path(sys.argv[4])
out.mkdir(parents=True, exist_ok=True)
job = next(j for j in plan["jobs"] if j["component"] == comp and j["environment"] == env)
for s in job["steps"]:
    run = s.get("run") or ""
    if not run:
        continue
    sid = s["id"]
    if "dist/runner/cli.js apply" in run:
        sid = "migrate-apply"
    elif "dist/runner/cli.js plan" in run:
        sid = "migrate-plan"
    (out / f"{re.sub(r'[^A-Za-z0-9_-]', '_', sid)}.sh").write_text(run)
    if s["id"] in ("install-workspace-dependencies", "install-dependencies"):
        (out / "install.sh").write_text(run)
        (out / "install.wd").write_text(s.get("working-directory") or ".")
        (out / "install.scope").write_text(s.get("scope") or "job")
(out / "path").write_text(job.get("path") or ".")
(out / "env").write_text("".join(f"export {k}={json.dumps(v)}\n" for k, v in (job.get("env") or {}).items()))
(out / "secrets").write_text("\n".join(r["asEnv"] for r in job.get("secretRefs") or []))
PY
}

# A job's private tree, staged as orun stages it. The source checkout carries
# no build output (nothing was built in it), and its dependencies are what the
# pinned composition says: a lane-scoped install ran once in the source tree
# and is linked in, or the job installs its own.
stage_job() { # STEPS-DIR WORK-DIR LOG
  local steps="$1" work="$2" log="$3"
  [ -f "$steps/install.sh" ] || { echo "FAIL: the lane has no install step" >&2; return 1; }
  if [ "$(cat "$steps/install.scope")" = lane ]; then
    (cd "$tree" && bash -e "$steps/install.sh") > "$log" 2>&1 \
      || { echo "FAIL: the lane's install step" >&2; tail -30 "$log" >&2; return 1; }
    python3 "$here/lib/stage-job.py" "$tree" "$work" --shared-deps
    [ -L "$work/node_modules" ] || { echo "FAIL: the staged tree's node_modules is not the lane's symlink" >&2; return 1; }
    echo "   staged: $(realpath --relative-to="$tree" "$work"); install scope: lane — node_modules → the source tree's"
  else
    python3 "$here/lib/stage-job.py" "$tree" "$work"
    echo "   staged: $(realpath --relative-to="$tree" "$work"); install scope: job — installing inside it"
    (cd "$work/$(cat "$steps/path")/$(cat "$steps/install.wd")" && bash -e "$steps/install.sh") > "$log" 2>&1 \
      || { echo "FAIL: the lane's install step" >&2; tail -30 "$log" >&2; return 1; }
    [ -d "$work/node_modules" ] && [ ! -L "$work/node_modules" ] \
      || { echo "FAIL: the job's install did not land inside its own tree" >&2; return 1; }
  fi
}

# One step, in the runner's per-job environment: the job's env (intent
# environment `env:`), its resolved secrets (exported by the caller) and
# ORUN_ENVIRONMENT; the step runs in the component's directory.
run_step() { # STEPS-DIR WORK-DIR STEP LOG
  local steps="$1" work="$2" step="$3" log="$4"
  [ -f "$steps/$step.sh" ] || { echo "FAIL: the stage lane has no $step step" >&2; return 1; }
  echo "   ▸ $step"
  if ! (cd "$work/$(cat "$steps/path")" && source "$steps/env" && export ORUN_ENVIRONMENT=stage \
        && bash -e "$steps/$step.sh") > "$log" 2>&1; then
    echo "FAIL: the lane's $step step" >&2; tail -40 "$log" >&2; return 1
  fi
}

echo "── the offline bootstrap (testing/lib/bootstrap.sh)"
tree="$scratch/$repo"
bootstrap_offline "$root" "$tree" "$values" "$scratch/logs" > "$scratch/bootstrap.log" 2>&1 || {
  echo "FAIL: the offline bootstrap stopped" >&2; tail -40 "$scratch/bootstrap.log" >&2; exit 1; }
echo "   2 phases placed and landed"
s01="$(git -C "$tree" rev-parse HEAD~1)"

# ── 1. the product's one pull request ──────────────────────────────────────
echo "── 01-product's landing: install, the fixture render, typecheck, lint, test, build"
git -C "$tree" worktree add -q "$scratch/at-01" "$s01"
checks "$scratch/at-01" "$scratch/checks-01.log"
# The landing's build is done; its tree is not needed again, and the disk is shared.
git -C "$tree" worktree remove --force "$scratch/at-01"

# ── 2. the stage lanes' steps, in each job's own tree ─────────────────────
# A pull request that changes the site and the migration component: the lanes
# `orun plan` gives it. And the merge's plan, for the step only a merge runs.
git -C "$tree" checkout -q -b e2e-pr
echo "<!-- a change to the site's component -->" >> "$tree/apps/web/README.md"
echo "# a change to the migration component" >> "$tree/infra/db-migrate/component.yaml"
git -C "$tree" -c user.email=e2e@example.invalid -c user.name=e2e commit -qam "a pull request"
(cd "$tree" && orun plan --intent intent.yaml --trigger github-pull-request --changed \
   --base main --head HEAD --env stage --output "$scratch/plan.json") > "$scratch/plan.log" 2>&1 \
  || { echo "FAIL: orun plan (pull request)" >&2; tail -15 "$scratch/plan.log" >&2; exit 1; }
(cd "$tree" && orun plan --intent intent.yaml --trigger github-push-main --env stage \
   --output "$scratch/plan-main.json") > "$scratch/plan-main.log" 2>&1 \
  || { echo "FAIL: orun plan (push to main)" >&2; tail -15 "$scratch/plan-main.log" >&2; exit 1; }
extract "$scratch/plan.json" web stage "$scratch/web"
extract "$scratch/plan.json" db-migrate stage "$scratch/mig"
extract "$scratch/plan-main.json" db-migrate stage "$scratch/mig-main"

# What the platform resolves into the jobs before their first step: the
# wiring document the D1 root lease-published (the components' secretEnv),
# with a database id no fixture carries, so the built config and the
# migrated database prove which document they came from.
d1_id="5ca1ab1e-0000-4000-8000-00000000a001"
export WIRING_CLOUDFLARE_D1_STAGE='{"d1_database_id":"'"$d1_id"'","d1_database_name":"stg-'"$repo"'-stage"}'
export WIRING_CLOUDFLARE_D1_PROD='{"d1_database_id":"5ca1ab1e-0000-4000-8000-00000000a003","d1_database_name":"prod-'"$repo"'-prod"}'

echo "── the stage web lane: verify-app-structure, build-app, verify-build-output, deploy-dry-run"
for key in WIRING_CLOUDFLARE_D1_STAGE WIRING_CLOUDFLARE_D1_PROD; do
  grep -qx "$key" "$scratch/web/secrets" || { echo "FAIL: the stage web lane does not resolve $key" >&2; exit 1; }
done
work="$tree/.orun/runs/e2e/web.stage.verify-deploy/work"
stage_job "$scratch/web" "$work" "$scratch/install-web.log"
[ ! -e "$work/apps/web/.open-next" ] || { echo "FAIL: the staged tree carries build output" >&2; exit 1; }
# The environment's optional STATUS_PAGE_PASSWORD, as the job resolves it:
# the build keeps it out of every bundle (`env -u`), and a verify lane — no
# Cloudflare credential — hands it to no Worker.
grep -qx STATUS_PAGE_PASSWORD "$scratch/web/secrets" \
  || { echo "FAIL: the stage web lane does not resolve the optional STATUS_PAGE_PASSWORD" >&2; exit 1; }
pw_value="e2e-owner:pw-$(date +%s)-never-bundled"
for step in verify-app-structure build-app verify-build-output deploy-dry-run; do
  (export STATUS_PAGE_PASSWORD="$pw_value" && run_step "$scratch/web" "$work" "$step" "$scratch/$step.log") || exit 1
done
if grep -rqF -- "${pw_value#*:}" "$work/apps/web/.open-next" "$work/apps/web/.next" 2>/dev/null; then
  echo "FAIL: the environment's STATUS_PAGE_PASSWORD reached a built file" >&2; exit 1
fi
grep -q "worker-secrets: no Cloudflare credential in this job" "$scratch/build-app.log" \
  || { echo "FAIL: the verify lane's build did not leave the password for the deploy lane" >&2; tail -5 "$scratch/build-app.log" >&2; exit 1; }
grep -q "\"$d1_id\"" "$work/apps/web/wrangler.jsonc" \
  || { echo "FAIL: the lane's build did not render the stage database id from its wiring document" >&2; exit 1; }
# wrangler's dry run names a D1 binding's database by name, not id.
grep -Eq "env\.DB \(stg-$repo-stage\) +D1 Database" "$scratch/deploy-dry-run.log" \
  || { echo "FAIL: the dry run does not bind DB to the stage database" >&2; tail -20 "$scratch/deploy-dry-run.log" >&2; exit 1; }
grep -Eq '"main": "worker.ts"' "$work/apps/web/wrangler.jsonc" && grep -Eq '"crons": \["\* \* \* \* \*"\]' "$work/apps/web/wrangler.jsonc" \
  || { echo "FAIL: the built config lost the custom entry or its Cron Trigger" >&2; exit 1; }
echo "   the built config binds DB to the stage document's database ($d1_id), enters through worker.ts with"
echo "   one every-minute trigger; the dry run accepts it; the password reached no built file"

echo "── the stage db-migrate lane: install, build, the PR's plan, the merge's apply (a stand-in D1 API)"
for key in CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID WIRING_CLOUDFLARE_D1; do
  grep -qx "$key" "$scratch/mig-main/secrets" || { echo "FAIL: the stage db-migrate lane does not resolve $key" >&2; exit 1; }
done
[ -f "$scratch/mig/migrate-plan.sh" ] && [ ! -f "$scratch/mig/migrate-apply.sh" ] \
  || { echo "FAIL: a pull request's db-migrate lane must plan and not apply" >&2; ls "$scratch/mig" >&2; exit 1; }
[ -f "$scratch/mig-main/migrate-apply.sh" ] && [ ! -f "$scratch/mig-main/migrate-plan.sh" ] \
  || { echo "FAIL: the merge's db-migrate lane must apply" >&2; ls "$scratch/mig-main" >&2; exit 1; }
mwork="$tree/.orun/runs/e2e/db-migrate.stage.migrate/work"
stage_job "$scratch/mig" "$mwork" "$scratch/install-mig.log"
run_step "$scratch/mig" "$mwork" build-db-package "$scratch/mig-build.log"
run_step "$scratch/mig" "$mwork" migrate-plan "$scratch/mig-plan.log"
grep -q '"010_monitor_state"' "$scratch/mig-plan.log" \
  || { echo "FAIL: the plan does not list 010_monitor_state as pending" >&2; cat "$scratch/mig-plan.log" >&2; exit 1; }
# The stand-in D1 API: only this account, this database (the stage
# document's id) and this token are answered.
(exec setsid python3 "$here/lib/d1-api.py" "$scratch/d1.sqlite" "$scratch/d1.port" \
   --account e2e-account --database "$d1_id" --token e2e-d1-token) > "$scratch/d1-api.log" 2>&1 < /dev/null &
api_pid=$!
for _ in $(seq 1 50); do [ -s "$scratch/d1.port" ] && break; sleep 0.1; done
[ -s "$scratch/d1.port" ] || { echo "FAIL: the stand-in D1 API did not start" >&2; cat "$scratch/d1-api.log" >&2; exit 1; }
export CLOUDFLARE_API_BASE_URL="http://127.0.0.1:$(cat "$scratch/d1.port")/client/v4"
# The job's own secrets: the D1 token as CLOUDFLARE_API_TOKEN, the account id,
# and this environment's wiring document.
for pass in first again; do
  (export CLOUDFLARE_API_TOKEN=e2e-d1-token CLOUDFLARE_ACCOUNT_ID=e2e-account \
          WIRING_CLOUDFLARE_D1="$WIRING_CLOUDFLARE_D1_STAGE" \
   && run_step "$scratch/mig-main" "$mwork" migrate-apply "$scratch/mig-apply-$pass.log") || exit 1
done
python3 - "$scratch/d1.sqlite" "$scratch/mig-apply-first.log" "$scratch/mig-apply-again.log" <<'PY'
import json, re, sqlite3, sys
db = sqlite3.connect(sys.argv[1])
def result(path):
    text = open(path).read()
    return json.loads(text[text.index("{"):text.rindex("}") + 1])
first, again = result(sys.argv[2]), result(sys.argv[3])
problems = []
if first["applied"] != ["000_control_baseline", "010_monitor_state"]:
    problems.append(f"the first apply applied {first['applied']}")
if again["applied"] or again["skipped"] != ["000_control_baseline", "010_monitor_state"]:
    problems.append(f"the second apply applied {again['applied']} and skipped {again['skipped']} — it must apply nothing")
cols = [(r[1], r[2], r[3], r[5]) for r in db.execute("PRAGMA table_info(monitor_state)")]
if cols != [("key", "VARCHAR(255)", 0, 1), ("value", "BLOB", 1, 0)]:
    problems.append(f"the monitor_state table is {cols}")
ledger = [r[0] for r in db.execute("SELECT id FROM _migrations_applied ORDER BY id")]
if ledger != ["000_control_baseline", "010_monitor_state"]:
    problems.append(f"the ledger records {ledger}")
for p in problems:
    print(f"  ✕ {p}", file=sys.stderr)
sys.exit(1 if problems else 0)
PY
grep -q 'POST /client/v4/accounts/e2e-account/d1/database/'"$d1_id"'/query' "$scratch/d1-api.log" \
  || { echo "FAIL: the runner did not call the stage database's query endpoint" >&2; exit 1; }
echo "   the stage document's database: monitor_state (key VARCHAR(255) PRIMARY KEY, value BLOB) created, both migrations"
echo "   recorded; the second apply applied nothing"
stop_group "$api_pid"; api_pid=""
unset CLOUDFLARE_API_BASE_URL


# ── 3. serve it, fire its trigger, and smoke it as the deploy does ────────
# The page and the checker are one Worker: `--test-scheduled` adds
# /__scheduled, which runs its `scheduled` handler as the Cron Trigger would.
serve() { # PORT LOG — wrangler dev over the built Worker, its own process group
  (cd "$work/apps/web" && exec setsid pnpm exec wrangler dev --config wrangler.jsonc --ip 127.0.0.1 --port "$1" \
     --name "$repo-web-stage" --test-scheduled --show-interactive-dev-session=false) > "$2" 2>&1 < /dev/null &
  dev_pid=$!
  local u="http://127.0.0.1:$1" _
  for _ in $(seq 1 90); do
    curl -s -o /dev/null "$u/favicon.png" && return 0
    kill -0 "$dev_pid" 2>/dev/null || { echo "FAIL: wrangler dev exited" >&2; tail -30 "$2" >&2; return 1; }
    sleep 1
  done
  echo "FAIL: wrangler dev never answered" >&2; tail -30 "$2" >&2; return 1
}
free_port() { python3 -c "import socket;s=socket.socket();s.bind(('127.0.0.1',0));print(s.getsockname()[1]);s.close()"; }
fire() { curl -s -o /dev/null -w '%{http_code}' --max-time 120 "$1/__scheduled?cron=*+*+*+*+*"; }

echo "── wrangler dev over the built Worker (a local D1 behind DB, the test scheduler on)"
[ ! -e "$work/apps/web/.dev.vars" ] || { echo "FAIL: the staged tree carries a .dev.vars" >&2; exit 1; }
port="$(free_port)"
serve "$port" "$scratch/dev.log" || exit 1
url="http://127.0.0.1:$port"
smoke="$(python3 -c "import yaml,sys;print(yaml.safe_load(open(sys.argv[1]))['spec']['parameters']['smokeCommand'])" "$tree/apps/web/component.yaml")"

echo "   ▸ no schema yet: the API says so, a fired trigger fails, and the deploy's smoke refuses it"
body="$(curl -s -w '\n%{http_code}' "$url/api/data")"
[ "${body##*$'\n'}" = 500 ] && grep -q '"error":"Monitor state unavailable"' <<<"$body" \
  || { echo "FAIL: without the monitor_state table /api/data did not answer 500 'Monitor state unavailable': $body" >&2; exit 1; }
code="$(fire "$url" || true)"
# wrangler dev writes its log as it goes, not when the request returns.
for _ in $(seq 1 30); do grep -q "no such table: monitor_state" "$scratch/dev.log" && break; sleep 1; done
grep -q "no such table: monitor_state" "$scratch/dev.log" \
  || { echo "FAIL: a trigger fired before the migrations (HTTP $code) did not fail on the missing table" >&2; tail -20 "$scratch/dev.log" >&2; exit 1; }
if DEPLOYED_URL="$url" bash -c "set -u; $smoke"; then
  echo "FAIL: the deploy's smoke passed a Worker that could not read its table" >&2; exit 1
fi

echo "   ▸ the product's own db:migrate:local; still no check, and the smoke still refuses"
(cd "$work/apps/web" && pnpm run db:migrate:local) > "$scratch/migrate-local.log" 2>&1 \
  || { echo "FAIL: db:migrate:local" >&2; tail -20 "$scratch/migrate-local.log" >&2; exit 1; }
body="$(curl -s -w '\n%{http_code}' "$url/api/data")"
[ "${body##*$'\n'}" = 500 ] && grep -q '"error":"No data available"' <<<"$body" \
  || { echo "FAIL: before the first check /api/data did not answer 500 'No data available': $body" >&2; exit 1; }
if DEPLOYED_URL="$url" bash -c "set -u; $smoke"; then
  echo "FAIL: the deploy's smoke passed before any check was recorded" >&2; exit 1
fi

echo "   ▸ the trigger fires: every monitor checked into D1; the component's own smokeCommand, DEPLOYED_URL=$url"
code="$(fire "$url")"
[ "$code" = 200 ] || { echo "FAIL: the fired trigger answered $code" >&2; tail -30 "$scratch/dev.log" >&2; exit 1; }
DEPLOYED_URL="$url" bash -c "set -u; $smoke" || { echo "FAIL: the deploy's smoke refused the checked Worker" >&2; exit 1; }

echo "   ▸ every route the status page promises"
python3 - "$url" "$values" "$work/apps/web" <<'PY'
import html, json, pathlib, re, sys, time, urllib.error, urllib.request
base, values, app = sys.argv[1], json.load(open(sys.argv[2])), pathlib.Path(sys.argv[3])
name, repo, org = values["productname"], values["reponame"], values["githuborg"]
problems = []
def bad(m): problems.append(m)
def get(path):
    try:
        with urllib.request.urlopen(base + path, timeout=30) as r:
            return r.status, r.headers.get("content-type", ""), r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.headers.get("content-type", ""), e.read()

# The monitors the product ships with, read from its own config: the ids the
# API must answer, and the targets that must never reach a browser.
config = (app / "uptime.config.ts").read_text()
ids = re.findall(r"^\s{6}id: '([^']+)'", config, re.M)
targets = re.findall(r"^\s{6}target: '([^']+)'", config, re.M)
if not ids or len(ids) != len(targets):
    bad(f"could not read the monitors from uptime.config.ts: ids {ids}, targets {targets}")

status, _, body = get("/")
page = body.decode()
if status != 200:
    bad(f"/ answered {status}")
title = re.search(r"<title[^>]*>(.*?)</title>", page, re.S)
if not title or html.unescape(title.group(1)) != name:
    bad(f"the page's <title> is {title and title.group(1)!r}, not {name!r}")
if "uptimeflare" in page or "My Status Page" in page:
    bad("the page still carries the baseline's name")
data = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', page, re.S)
props = json.loads(data.group(1))["props"]["pageProps"] if data else {}
safe = {"id", "name", "tooltip", "statusPageLink", "hideLatencyChart"}
monitors = props.get("monitors") or []
if [m.get("id") for m in monitors] != ids:
    bad(f"the page hands the browser monitors {[m.get('id') for m in monitors]}, not {ids}")
for m in monitors:
    if set(m) - safe:
        bad(f"the page hands the browser {sorted(set(m) - safe)} of monitor {m.get('id')} (CVE-2026-29779)")
if not props.get("compactedStateStr"):
    bad("the page carries no state after a check")

# The browser's bundle: the product's repository link, and no monitor target.
static = app / ".open-next/assets/_next/static"
chunks = [p.read_text(errors="replace") for p in static.rglob("*.js")]
if not any(f"https://github.com/{org}/{repo}" in c for c in chunks):
    bad(f"no client chunk links github.com/{org}/{repo}")
if any("github.com/sourceplane/uptimeflare" in c for c in chunks):
    bad("a client chunk still links the baseline's repository")
# A target is a URL the page may well link for another reason (the footer
# links github.com), so what is looked for is the CONFIG's own shape — a
# `target:` key with that value — and the keys only workerConfig carries.
leaks = ["kvWriteCooldownMinutes", "TCP_PING"] + [f'target:{q}{t}{q}' for t in targets for q in "\"'"]
for leak in leaks:
    if any(leak in c for c in chunks):
        bad(f"{leak} is in the client bundle — the checker's config reached the browser (CVE-2026-29779)")

status, ctype, body = get("/api/data")
state = json.loads(body) if status == 200 else {}
if status != 200 or not ctype.startswith("application/json"):
    bad(f"/api/data answered {status} {ctype}")
if abs(time.time() - state.get("updatedAt", 0)) > 600:
    bad(f"/api/data's updatedAt {state.get('updatedAt')} is not a check from the last ten minutes")
if sorted((state.get("monitors") or {}).keys()) != sorted(ids):
    bad(f"/api/data answers monitors {sorted((state.get('monitors') or {}).keys())}, not {sorted(ids)}")
for mid, m in (state.get("monitors") or {}).items():
    if not isinstance(m.get("up"), bool) or not isinstance(m.get("latency"), int) or not m.get("message"):
        bad(f"/api/data's {mid} is {m}")
if state.get("up", 0) + state.get("down", 0) != len(ids):
    bad(f"/api/data counts {state.get('up')} up and {state.get('down')} down, for {len(ids)} monitors")

status, _, body = get(f"/api/badge?id={ids[0]}" if ids else "/api/badge")
badge = json.loads(body) if status == 200 else {}
if status != 200 or badge.get("schemaVersion") != 1 or badge.get("message") not in ("UP", "DOWN"):
    bad(f"/api/badge answered {status} {body[:120]!r}")

for path, want, ctype in (("/incidents", 200, "text/html"), ("/favicon.png", 200, "image/"),
                          ("/no-such-page", 404, "text/html")):
    s_, ct, _ = get(path)
    if s_ != want or not ct.startswith(ctype):
        bad(f"{path} answered {s_} {ct}, want {want} {ctype}")

if problems:
    for p in problems:
        print(f"  ✕ {p}", file=sys.stderr)
    sys.exit(1)
up = sum(1 for m in state["monitors"].values() if m["up"])
print(f"   / (the product's name; only {sorted(safe)} of each monitor), the bundle links its repository and no")
print(f"   target; /api/data: {len(ids)} monitors checked ({up} up from here), updatedAt fresh; the badge, /incidents,")
print("   the favicon and a 404 — the product's own")
PY
stop_group "$dev_pid"; dev_pid=""

echo "   ▸ the same Worker with a STATUS_PAGE_PASSWORD: it asks, and the smoke, given it, passes"
printf 'STATUS_PAGE_PASSWORD="%s"\n' "e2e-owner:s3cret" > "$work/apps/web/.dev.vars"
port="$(free_port)"
serve "$port" "$scratch/dev-private.log" || exit 1
url="http://127.0.0.1:$port"
code="$(curl -s -o /dev/null -w '%{http_code}' "$url/api/data")"
[ "$code" = 401 ] || { echo "FAIL: a private status page answered $code without credentials" >&2; exit 1; }
code="$(curl -s -o /dev/null -w '%{http_code}' -u e2e-owner:wrong "$url/")"
[ "$code" = 401 ] || { echo "FAIL: a private status page answered $code to the wrong password" >&2; exit 1; }
if DEPLOYED_URL="$url" bash -c "set -u; $smoke"; then
  echo "FAIL: the smoke passed a private page without its password" >&2; exit 1
fi
STATUS_PAGE_PASSWORD="e2e-owner:s3cret" DEPLOYED_URL="$url" bash -c "set -u; $smoke" \
  || { echo "FAIL: the smoke, given the password, refused the private page" >&2; exit 1; }
rm -f "$work/apps/web/.dev.vars"
echo "   401 without it and with the wrong one; the smoke sends it and passes"

echo "e2e.test.sh: ok"
