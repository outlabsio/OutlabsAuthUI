// This file intentionally violates the "features must use AppDataTable, not
// the raw @/components/ui/table primitive" architecture rule. It exists to
// prove the guardrail in eslint.config.js actually fires.
// Run `bash scripts/check-architecture-fixtures.sh` to verify.

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export function ForbiddenFeatureTable() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Example</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  )
}
