// This file intentionally violates the "@/lib/api/client outside feature
// api/ or lib/" architecture rule. It exists to prove the guardrail in
// eslint.config.js actually fires.
// Run `bash scripts/check-architecture-fixtures.sh` to verify.

import { apiClient } from '@/lib/api/client'

export function useDirectClientAccess() {
  return apiClient.get('/widgets')
}
