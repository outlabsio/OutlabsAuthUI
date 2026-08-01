#!/bin/bash

# Script to deploy with explicit environment variable authentication
# This ensures wrangler uses env vars instead of OAuth credentials

set -e  # Exit on any error

# Load .env file if it exists
if [ -f .env ]; then
  set -a  # Automatically export all variables
  source .env
  set +a
fi

echo "Deploying to Cloudflare Workers..."
echo "Target Account ID: $CLOUDFLARE_ACCOUNT_ID"
echo ""

# Preflight: Verify wrangler will use the correct account
# This prevents deploying to the wrong account even if OAuth is cached
if [ -n "$CLOUDFLARE_API_TOKEN" ]; then
  echo "Using API Token authentication"

  # Check what account wrangler sees
  ACTUAL_ACCOUNT=$(CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" bunx wrangler whoami --format json 2>/dev/null | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4 || echo "")

  if [ -n "$ACTUAL_ACCOUNT" ] && [ "$ACTUAL_ACCOUNT" != "$CLOUDFLARE_ACCOUNT_ID" ]; then
    echo "ERROR: Account mismatch detected!"
    echo "   Expected: $CLOUDFLARE_ACCOUNT_ID"
    echo "   Got:      $ACTUAL_ACCOUNT"
    echo ""
    echo "   Your API token is for a different account."
    echo "   Run 'bunx wrangler logout' to clear cached OAuth, or create a new token for the correct account."
    exit 1
  fi

  echo "Account verified"
  echo ""

  # Deploy with explicit token
  CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
  CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
  bunx wrangler deploy

elif [ -n "$CLOUDFLARE_API_KEY" ] && [ -n "$CLOUDFLARE_EMAIL" ]; then
  echo "Using API Key authentication (legacy)"
  echo "Consider switching to API Token for better security"
  echo ""

  # Deploy with explicit API key
  CLOUDFLARE_API_KEY="$CLOUDFLARE_API_KEY" \
  CLOUDFLARE_EMAIL="$CLOUDFLARE_EMAIL" \
  CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
  bunx wrangler deploy

else
  echo "Error: No authentication credentials found"
  echo ""
  echo "   Set one of:"
  echo "   - CLOUDFLARE_API_TOKEN (recommended)"
  echo "   - CLOUDFLARE_API_KEY + CLOUDFLARE_EMAIL (legacy)"
  echo ""
  echo "   Run 'bunx wrangler logout' to clear any cached OAuth credentials"
  exit 1
fi
