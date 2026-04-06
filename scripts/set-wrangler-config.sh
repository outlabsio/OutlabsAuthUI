#!/bin/bash

# Script to set the correct wrangler.toml based on environment parameter
# Usage: ./scripts/set-wrangler-config.sh [beta]

set -e  # Exit on any error

# Load .env file if it exists
if [ -f .env ]; then
  set -a  # Automatically export all variables
  source .env
  set +a
fi

# Get environment from parameter
ENVIRONMENT=${1:?Usage: set-wrangler-config.sh <environment>}

echo "Target environment: $ENVIRONMENT"
echo "Current branch: $(git branch --show-current)"
echo ""

# Validate Cloudflare Account ID
if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
  echo "Error: CLOUDFLARE_ACCOUNT_ID environment variable is not set"
  echo ""
  echo "   To find your Account ID:"
  echo "   1. Log in to Cloudflare Dashboard"
  echo "   2. Go to Workers & Pages"
  echo "   3. Your Account ID is shown in the right sidebar"
  echo ""
  echo "   Add it to your .env file:"
  echo "   CLOUDFLARE_ACCOUNT_ID=your_account_id_here"
  echo ""
  exit 1
fi

# Validate Cloudflare Authentication
if [ -z "$CLOUDFLARE_API_KEY" ] && [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "Error: Cloudflare authentication not configured"
  echo ""
  echo "   Set CLOUDFLARE_API_TOKEN in your .env file"
  echo ""
  exit 1
fi

if [ -n "$CLOUDFLARE_API_TOKEN" ]; then
  echo "Using API Token authentication"
else
  echo "Using API Key authentication"
fi

echo "Target Account ID: $CLOUDFLARE_ACCOUNT_ID"
echo ""

# Determine which config to use based on environment parameter
case "$ENVIRONMENT" in
  beta)
    CONFIG_FILE="wrangler.beta.toml"
    WORKER_NAME="auth-ui-beta"
    ;;
  *)
    echo "Error: Invalid environment '$ENVIRONMENT'"
    echo "   Valid options: beta"
    exit 1
    ;;
esac

# Copy the appropriate config
if [ -f "$CONFIG_FILE" ]; then
  cp "$CONFIG_FILE" wrangler.toml
  echo "Set wrangler.toml to use: $WORKER_NAME"
  echo "   (from $CONFIG_FILE)"
else
  echo "Error: $CONFIG_FILE not found"
  exit 1
fi
