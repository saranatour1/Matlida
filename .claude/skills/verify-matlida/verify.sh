#!/bin/sh
# Runs Matilda against a local Convex backend for verification. See SKILL.md.
# Usage: verify.sh launch | doctor | account | email-link <to> | convex <args> | cleanup
set -eu

ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
PORT=3100
URL="http://localhost:$PORT"
RUNS="$ROOT/test-results/verify"
RUN="$RUNS/latest"

# The session env can carry the shared cloud deployment, and it beats .env.local.
unset CONVEX_DEPLOYMENT CONVEX_DEPLOY_KEY CONVEX_SELF_HOSTED_URL CONVEX_SELF_HOSTED_ADMIN_KEY VITE_CONVEX_URL VITE_CONVEX_SITE_URL
export CONVEX_AGENT_MODE=anonymous

convex() { pnpm exec convex "$@"; }
is_local() { grep -q '^CONVEX_DEPLOYMENT=anonymous:' .env.local 2>/dev/null; }
cwd_of() { lsof -a -p "$1" -d cwd -Fn 2>/dev/null | sed -n 's/^n//p'; }
listener() { lsof -tiTCP:"$1" -sTCP:LISTEN 2>/dev/null | head -1; }
kill_tree() {
  for child in $(pgrep -P "$1"); do kill_tree "$child"; done
  kill "$1" 2>/dev/null || true
}

set_env() {
  # Names only: the values include the signing key.
  have=$(convex env list | cut -d= -f1)
  setv() { echo "$have" | grep -qx "$1" || convex env set "$1" "$2" >/dev/null; }
  setv SITE_URL "$URL"
  # ponytail: a fake key, so no email leaves the machine. email-link reads the stored message.
  setv RESEND_API_KEY verify-no-send
  setv AUTH_EMAIL_FROM 'Matilda <auth@example.com>'
  for k in AUTH_GOOGLE_CLIENT_ID AUTH_GOOGLE_CLIENT_SECRET AUTH_GITHUB_CLIENT_ID AUTH_GITHUB_CLIENT_SECRET; do
    setv "$k" verify-dummy
  done
  if ! echo "$have" | grep -qx AUTH_PRIVATE_KEY; then
    keys=$(node -e '
      const c = require("node:crypto")
      const { publicKey, privateKey } = c.generateKeyPairSync("rsa", { modulusLength: 2048 })
      console.log(Buffer.from(privateKey.export({ type: "pkcs8", format: "pem" })).toString("base64"))
      console.log(JSON.stringify({ keys: [{ ...publicKey.export({ format: "jwk" }), kid: c.randomUUID(), alg: "RS256", use: "sig" }] }))')
    convex env set AUTH_PRIVATE_KEY "$(echo "$keys" | sed -n 1p)" >/dev/null
    convex env set AUTH_JWKS "$(echo "$keys" | sed -n 2p)" >/dev/null
  fi
}

launch() {
  if [ -f .env.local ] && ! is_local; then
    echo "refusing: .env.local points at a cloud deployment. Run from a git worktree without one." >&2
    exit 1
  fi
  for p in 3210 3211 "$PORT"; do
    pid=$(listener "$p")
    [ -z "$pid" ] || { echo "refusing: port $p is taken by pid $pid in $(cwd_of "$pid")" >&2; exit 1; }
  done
  [ -d node_modules ] || pnpm install --frozen-lockfile
  if [ ! -f .env.local ]; then
    # Creates the local deployment and .env.local. Its push fails until set_env runs.
    convex dev --once >/dev/null 2>&1 || true
    is_local || { echo "could not create the local deployment" >&2; exit 1; }
  fi
  set_env
  id=$(date +%Y%m%d-%H%M%S)
  mkdir -p "$RUNS/$id"
  ln -sfn "$id" "$RUN"
  nohup pnpm exec convex dev --tail-logs always --start "vite dev --port $PORT --strictPort" \
    >"$RUN/dev.log" 2>&1 &
  echo $! >"$RUN/dev.pid"
  i=0
  until grep -q 'Convex functions ready' "$RUN/dev.log" && curl -sf "$URL/sign-in" | grep -q '<title>Matilda'; do
    kill -0 "$(cat "$RUN/dev.pid")" 2>/dev/null || { echo "dev server exited, see $RUN/dev.log" >&2; exit 1; }
    i=$((i + 1))
    [ "$i" -le 180 ] || { echo "not ready after 180s, see $RUN/dev.log" >&2; exit 1; }
    sleep 1
  done
  echo "ready: $URL"
  echo "run dir: $RUNS/$id"
}

doctor() {
  ok=0
  fail() { echo "FAIL $*"; ok=1; }
  echo "checkout: $ROOT @ $(git rev-parse --short HEAD) ($(git branch --show-current))"
  if is_local; then echo "deployment: $(sed -n 's/^CONVEX_DEPLOYMENT=//p' .env.local) (local)"; else fail "deployment: .env.local is missing or not local"; fi
  for p in 3210 "$PORT"; do
    pid=$(listener "$p")
    if [ -z "$pid" ]; then fail "port $p: nothing listening"; continue; fi
    case "$(cwd_of "$pid")" in
      "$ROOT"*) echo "port $p: pid $pid in this checkout" ;;
      *) fail "port $p: pid $pid belongs to $(cwd_of "$pid")" ;;
    esac
  done
  if [ "$ok" = 0 ]; then
    site=$(convex env get SITE_URL 2>/dev/null || true)
    [ "$site" = "$URL" ] && echo "SITE_URL: $site" || fail "SITE_URL is '$site', want $URL"
    curl -sf "$URL/sign-in" | grep -q '<title>Matilda' && echo "http: $URL/sign-in serves Matilda" || fail "http: $URL/sign-in"
  fi
  return "$ok"
}

# A fresh email and password for this run, saved in the run dir.
account() {
  [ -f "$RUN/account.env" ] || {
    echo "email=verify-$(date +%s)@example.com"
    echo "password=$(openssl rand -base64 18)"
  } >"$RUN/account.env"
  cat "$RUN/account.env"
}

# The newest link the app emailed to $1. Sends fail on purpose; the message stays in the resend component.
email_link() {
  id=$(convex data --component resend emails --format jsonl --limit 50 |
    node -e 'const to = process.argv[1]; const rows = require("fs").readFileSync(0, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse)
      const hit = rows.find((r) => [r.to].flat().includes(to)); if (!hit) process.exit(1); console.log(hit._id)' "$1") ||
    { echo "no email to $1" >&2; exit 1; }
  convex run --component resend lib:get "{\"emailId\":\"$id\"}" |
    node -e 'const e = JSON.parse(require("fs").readFileSync(0, "utf8")); const m = `${e.text ?? ""} ${e.html ?? ""}`.match(/https?:\/\/[^\s"<>]+/)
      if (!m) process.exit(1); console.log(m[0].replaceAll("&amp;", "&"))'
}

cleanup() {
  [ -f "$RUN/dev.pid" ] && kill_tree "$(cat "$RUN/dev.pid")"
  # Wipe the local deployment, so the next launch starts from an empty database.
  if is_local; then rm -rf .convex/local .env.local; fi
  echo "evidence kept in $(cd "$RUN" && pwd -P)"
}

case "${1:-}" in
  launch) launch ;;
  doctor) doctor ;;
  account) account ;;
  email-link) email_link "${2:?usage: verify.sh email-link <to>}" ;;
  cleanup) cleanup ;;
  convex) shift; convex "$@" ;;
  *) echo "usage: verify.sh launch | doctor | account | email-link <to> | convex <args> | cleanup" >&2; exit 2 ;;
esac
