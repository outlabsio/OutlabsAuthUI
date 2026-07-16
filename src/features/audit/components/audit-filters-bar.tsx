import { AppDateTimePicker } from '@/components/app/app-date-time-picker'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { AuditFilters } from '@/features/audit/types/audit.types'

type AuditFiltersBarProps = {
  filters: AuditFilters
  onChange: (next: AuditFilters) => void
  onApply: () => void
  onReset: () => void
}

export function AuditFiltersBar({
  filters,
  onChange,
  onApply,
  onReset,
}: AuditFiltersBarProps) {
  return (
    <form
      className="grid gap-3 md:grid-cols-2 xl:grid-cols-4"
      onSubmit={(event) => {
        event.preventDefault()
        onApply()
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="audit-category">Category</Label>
        <Input
          id="audit-category"
          value={filters.category}
          onChange={(event) =>
            onChange({
              ...filters,
              category: event.target.value,
            })
          }
          placeholder="e.g. auth"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-event-type">Event type</Label>
        <Input
          id="audit-event-type"
          value={filters.eventType}
          onChange={(event) =>
            onChange({
              ...filters,
              eventType: event.target.value,
            })
          }
          placeholder="e.g. user.login"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-subject-user-id">Subject user ID</Label>
        <Input
          id="audit-subject-user-id"
          value={filters.subjectUserId}
          onChange={(event) =>
            onChange({
              ...filters,
              subjectUserId: event.target.value,
            })
          }
          placeholder="Optional UUID"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-actor-user-id">Actor user ID</Label>
        <Input
          id="audit-actor-user-id"
          value={filters.actorUserId}
          onChange={(event) =>
            onChange({
              ...filters,
              actorUserId: event.target.value,
            })
          }
          placeholder="Optional UUID"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-entity-id">Entity ID</Label>
        <Input
          id="audit-entity-id"
          value={filters.entityId}
          onChange={(event) =>
            onChange({
              ...filters,
              entityId: event.target.value,
            })
          }
          placeholder="Optional UUID"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-occurred-from">Occurred from</Label>
        <AppDateTimePicker
          id="audit-occurred-from"
          value={filters.occurredFrom}
          onChange={(value) =>
            onChange({
              ...filters,
              occurredFrom: value,
            })
          }
          placeholder="Pick a start date"
          layout="inline"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="audit-occurred-to">Occurred to</Label>
        <AppDateTimePicker
          id="audit-occurred-to"
          value={filters.occurredTo}
          onChange={(value) =>
            onChange({
              ...filters,
              occurredTo: value,
            })
          }
          placeholder="Pick an end date"
          layout="inline"
        />
      </div>
      <div className="flex items-end gap-2">
        <Button type="submit" className="flex-1">
          Apply filters
        </Button>
        <Button type="button" variant="outline" onClick={onReset}>
          Reset
        </Button>
      </div>
    </form>
  )
}
