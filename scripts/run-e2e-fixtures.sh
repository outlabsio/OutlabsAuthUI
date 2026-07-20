#!/usr/bin/env bash
# Run enterprise then SimpleRBAC Playwright suites sequentially.
# Requires both backends reachable:
#   enterprise → http://localhost:8004
#   simple_rbac → http://localhost:8003
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

check_backend() {
  local url="$1"
  local label="$2"
  if ! curl -fsS "$url" >/dev/null 2>&1; then
    echo "error: ${label} is not reachable at ${url}" >&2
    echo "Start it before running bun run test:e2e:fixtures" >&2
    exit 1
  fi
}

check_backend "http://localhost:8004/v1/auth/config" "Enterprise RBAC backend (:8004)"
check_backend "http://localhost:8003/v1/auth/config" "SimpleRBAC backend (:8003)"

echo "==> Enterprise fixture suite"
# Clear ambient DATABASE_URL so enterprise reset uses its script default.
env -u DATABASE_URL bun run test:e2e "$@"

echo "==> SimpleRBAC fixture suite (frontend :3001)"
# Separate port so this pass can start while an enterprise Vite server is still up.
# Force the SimpleRBAC database explicitly — ambient DATABASE_URL often points at enterprise.
E2E_PORT=3001 \
E2E_BASE_URL=http://localhost:3001 \
E2E_REUSE_EXISTING_SERVER=0 \
E2E_DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/blog_simple_rbac \
env -u DATABASE_URL bun run test:e2e:simple "$@"

echo "==> Both fixture suites finished"
