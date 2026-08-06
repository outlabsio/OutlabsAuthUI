#!/bin/bash

# Deploy the generated static SPA to Cloudflare Workers with explicit env-var auth
# (avoids using cached OAuth creds). Mirrors the React app's deploy script.
# Run `nuxt generate` first (the deploy:cloudflare npm script does both).

set -e

# Load .env if present.
if [ -f .env ]; then
  set -a
  source .env
  set +a
fi

if [ ! -d ".output/public" ]; then
  echo "Error: .output/public not found. Run 'bun run generate' first." >&2
  exit 1
fi

echo "Deploying to Cloudflare Workers..."
echo "Target Account ID: $CLOUDFLARE_ACCOUNT_ID"
echo ""

if [ -n "$CLOUDFLARE_API_TOKEN" ]; then
  echo "Using API Token authentication"

  ACTUAL_ACCOUNT=$(CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" bunx wrangler whoami --format json 2>/dev/null | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")

  if [ -n "$ACTUAL_ACCOUNT" ] && [ -n "$CLOUDFLARE_ACCOUNT_ID" ] && [ "$ACTUAL_ACCOUNT" != "$CLOUDFLARE_ACCOUNT_ID" ]; then
    echo "ERROR: Account mismatch detected!"
    echo "   Expected: $CLOUDFLARE_ACCOUNT_ID"
    echo "   Got:      $ACTUAL_ACCOUNT"
    echo "   Run 'bunx wrangler logout' to clear cached OAuth, or use a token for the correct account."
    exit 1
  fi

  echo "Account verified"
  echo ""

  CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
  CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
  bunx wrangler deploy

else
  echo "Error: No CLOUDFLARE_API_TOKEN found in the environment or .env." >&2
  echo "   Set CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID) before deploying." >&2
  exit 1
fi
