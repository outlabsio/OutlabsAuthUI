export function hasAnyPermission(
  permissionNames: Set<string>,
  candidates: string[]
) {
  return candidates.some((candidate) => permissionNames.has(candidate))
}
