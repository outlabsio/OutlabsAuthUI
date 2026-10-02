import { useTemplateRef } from 'vue'
import type { ActionForm } from '~/composables/useApiAction'

/** What <AppFormDialog> exposes: its inner UForm (null while the dialog is closed). */
export type FormDialogHandle = { form: ActionForm | null }

/** AppFormDialog `conflict`: the labels of the fields someone else changed underneath it. */
export type FormConflict = { fields: string[] }

/**
 * The UForm inside the <AppFormDialog ref="…"> of the calling component, as useApiAction's
 * `form` option: server validation issues land on its fields and stay until edited. Call it in
 * the composable the page (or component) calls in setup, with the dialog's template ref name:
 *
 *   const createForm = useDialogForm('createDialog')
 *   await run(() => create.mutateAsync(input), { …, form: createForm, inline: createError })
 *   <AppFormDialog ref="createDialog" …>
 *
 * It resolves the form each time it is read, so it follows the dialog closing and reopening.
 */
export function useDialogForm(refName: string): () => ActionForm | null {
  const dialog = useTemplateRef<FormDialogHandle>(refName)
  return () => dialog.value?.form ?? null
}
