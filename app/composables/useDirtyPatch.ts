import { computed, shallowRef } from 'vue'
import { changedKeys, cloneBody, conflictingKeys, diffPatch, type WireBody } from '~/utils/dirty-patch'

// Diff-only writes for edit dialogs. `toWire` maps the form state to the request body the dialog
// would send; `snapshot()` records that body once the form is filled for the record being edited.
// From then on:
//   - `patch` holds only the fields that changed (PATCH semantics), so an edit never re-sends,
//     and so never truncates or re-validates, a field the admin did not touch (a membership's role
//     set, a date the form can only show at day precision). Keys in `always` (an audit note) ride
//     along when anything else changed;
//   - `dirty` is false until something changed: bind the submit button's disabled state to it and
//     pass it to AppFormDialog (`:dirty` + `require-changes`);
//   - `conflicts(serverBody)` names the fields someone else changed on the server since the
//     snapshot that this dialog also changed (refetch the record before saving; see ARCHITECTURE).
//
//   const edit = useDirtyPatch(state, s => ({
//     status: s.status,
//     valid_from: startOfDayIso(s.validFrom),
//     valid_until: endOfDayIso(s.validUntil)
//   }))
//   function openEdit(m) { Object.assign(state, formFrom(m)); edit.snapshot(); open.value = true }
//   run(() => update({ id, input: edit.patch.value }), …)
export function useDirtyPatch<S extends object, W extends WireBody>(
  state: S,
  toWire: (state: S) => W,
  options: { always?: ReadonlyArray<keyof W & string> } = {}
) {
  const always = options.always ?? []
  const baseline = shallowRef<W | null>(null)
  const current = computed(() => toWire(state))

  /** Record the current state as the unchanged baseline (call after filling the form). */
  function snapshot() {
    baseline.value = cloneBody(toWire(state))
  }

  /** Fields that differ from the baseline (not counting the `always` keys). */
  const changed = computed<Array<keyof W & string>>(() => {
    if (!baseline.value) return []
    return changedKeys(baseline.value, current.value).filter(key => !always.includes(key))
  })
  const dirty = computed(() => changed.value.length > 0)
  /** The request body: changed fields only, plus the `always` keys when anything changed. */
  const patch = computed<Partial<W>>(() => (baseline.value ? diffPatch(baseline.value, current.value, always) : {}))

  /**
   * The fields this dialog changed that the server's record also changed, to a different value,
   * since the snapshot. `serverState` is the record as the server has it now, mapped to form
   * state the same way the dialog was filled.
   */
  function conflicts(serverState: S): Array<keyof W & string> {
    if (!baseline.value) return []
    return conflictingKeys(baseline.value, current.value, toWire(serverState))
      .filter(key => !always.includes(key))
  }

  return { dirty, changed, patch, snapshot, conflicts, baseline }
}
