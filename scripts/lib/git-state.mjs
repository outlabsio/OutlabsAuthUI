// The git facts the release check records and the deploy preflight compares: HEAD and whether
// the console's tree (the repository root, where these scripts run) has uncommitted changes.
// Ignored files (build output, reports, .release/) do not count; untracked ones do, since a new
// file under app/ changes the build.

import { execFileSync } from 'node:child_process'

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
}

/** HEAD's full commit id, or null outside a git checkout. */
export function headSha(cwd) {
  try {
    return git(['rev-parse', '--verify', 'HEAD'], cwd).trim()
  } catch {
    return null
  }
}

/** `git status --porcelain` lines for the tree under cwd (empty when clean). */
export function uncommittedPaths(cwd) {
  return git(['status', '--porcelain', '--untracked-files=normal', '--', '.'], cwd).split('\n').filter(Boolean)
}

/** Remote-tracking branches that contain sha (empty when it was never pushed, or on error). */
export function remoteBranchesContaining(sha, cwd) {
  try {
    return git(['branch', '-r', '--contains', sha], cwd).split('\n').map(line => line.trim()).filter(Boolean)
  } catch {
    return []
  }
}
