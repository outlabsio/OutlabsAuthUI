#!/bin/bash

# Deploy one console deployment to Cloudflare Workers.
#
#   bun run deploy:cloudflare --config <path/to/app-config.json> [--env <name>] [--wrangler-config <file>]
#
#   --config           that deployment's app-config.json (required; keep it out of this repo)
#   --env              wrangler environment ([env.<name>] in wrangler.toml); omitted = the
#                      top-level workers.dev preview
#   --wrangler-config  a wrangler file of your own (paths inside it resolve from its folder)
#
# 1. Reads Cloudflare credentials from .env.deploy (or the environment). Never .env: that
#    file holds dev-server settings, and nothing from it may reach a deployment.
# 2. Verifies the token's account: `wrangler whoami --json` must list CLOUDFLARE_ACCOUNT_ID
#    (scripts/check-cloudflare-account.mjs). CLOUDFLARE_ACCOUNT_ID is required with --env; a
#    workers.dev preview without it skips the check with a warning. A whoami that fails, or
#    whose output cannot be read, stops the deploy.
# 3. Builds a fresh artifact: `bun run generate` (nuxt generate + CSP script hashes).
# 4. Runs scripts/deploy-preflight.mjs: validates the config with the console's production
#    rules, verifies the artifact, pins connect-src/img-src, stages app-config.json and, with
#    --require-release-gate, requires a clean HEAD that passed `bun run release:check`
#    (.release/gate.json: same commit, clean tree, both presets, at most 7 days old).
#    DEPLOY_SKIP_RELEASE_GATE=1 skips only the release-gate requirement, with a warning.
# 5. Runs `wrangler deploy`.

set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
  sed -n '3,10p' "$0" | sed 's/^# \{0,1\}//'
}

CONFIG=""
WRANGLER_ENV=""
WRANGLER_CONFIG=""
while [ $# -gt 0 ]; do
  case "$1" in
    --) shift ;;
    --config) CONFIG="${2:-}"; shift 2 ;;
    --env) WRANGLER_ENV="${2:-}"; shift 2 ;;
    --wrangler-config) WRANGLER_CONFIG="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown argument: $1" >&2; usage >&2; exit 2 ;;
  esac
done

if [ -z "$CONFIG" ]; then
  echo "Error: --config <path/to/app-config.json> is required." >&2
  usage >&2
  exit 2
fi

if [ ! -f "$CONFIG" ]; then
  echo "Error: config file $CONFIG does not exist." >&2
  exit 2
fi

if [ -f .env.deploy ]; then
  set -a
  # shellcheck disable=SC1091
  source .env.deploy
  set +a
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN is not set (put it in .env.deploy; see .env.deploy.example)." >&2
  exit 1
fi

if [ -n "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "Checking that the token can reach account ${CLOUDFLARE_ACCOUNT_ID}..."
  # Exit status first: a whoami that fails (not logged in, no network) must stop the deploy.
  if ! WHOAMI_JSON=$(bunx wrangler whoami --json); then
    echo "ERROR: 'wrangler whoami --json' failed, so the token's account cannot be verified. Not deploying." >&2
    exit 1
  fi
  if ! printf '%s' "$WHOAMI_JSON" | node scripts/check-cloudflare-account.mjs; then
    exit 1
  fi
elif [ -n "$WRANGLER_ENV" ]; then
  echo "Error: CLOUDFLARE_ACCOUNT_ID is required with --env (put it in .env.deploy; see .env.deploy.example)." >&2
  exit 2
else
  echo "WARNING: CLOUDFLARE_ACCOUNT_ID is not set: the token's account was NOT checked (workers.dev preview only)." >&2
fi

echo "Building a fresh artifact..."
bun run generate

PREFLIGHT_ARGS=(--config "$CONFIG")
if [ "${DEPLOY_SKIP_RELEASE_GATE:-}" = "1" ]; then
  echo "WARNING: DEPLOY_SKIP_RELEASE_GATE=1 — deploying without a passing release check for this commit." >&2
else
  PREFLIGHT_ARGS+=(--require-release-gate)
fi
node scripts/deploy-preflight.mjs "${PREFLIGHT_ARGS[@]}"

WRANGLER_ARGS=()
if [ -n "$WRANGLER_CONFIG" ]; then
  WRANGLER_ARGS+=(--config "$WRANGLER_CONFIG")
fi
if [ -n "$WRANGLER_ENV" ]; then
  WRANGLER_ARGS+=(--env "$WRANGLER_ENV")
else
  echo "Note: no --env given; deploying the top-level workers.dev preview." >&2
fi

echo "Deploying to Cloudflare Workers (account ${CLOUDFLARE_ACCOUNT_ID:-unset})..."
bunx wrangler deploy ${WRANGLER_ARGS[@]+"${WRANGLER_ARGS[@]}"}
