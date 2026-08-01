#!/bin/bash

# Verifies the architecture-fixtures/ negative fixtures still fail lint.
# See architecture-fixtures/README.md for what each fixture proves.
#
# architecture-fixtures/ is excluded from the normal `bun run lint` run via
# globalIgnores in eslint.config.js, so we lint it directly here with
# --no-ignore and expect ESLint to exit non-zero (i.e. find errors).

set -euo pipefail

cd "$(dirname "$0")/.."

echo "Linting architecture-fixtures/ (expecting lint errors)..."

if bunx eslint --no-ignore architecture-fixtures; then
  echo ""
  echo "ERROR: architecture-fixtures/ passed lint with zero errors."
  echo "The architecture guardrail rules in eslint.config.js did not catch"
  echo "the intentional violations in architecture-fixtures/. One of the"
  echo "boundary rules has regressed - fix it before trusting it again."
  exit 1
fi

echo ""
echo "OK: architecture-fixtures/ failed lint as expected. Guardrail rules are active."
