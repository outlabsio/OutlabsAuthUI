# FORM\_RULES.md

## Purpose

This document defines the approved form architecture for the frontend.

The goal is to stop form handling from fragmenting into multiple competing patterns. Forms are one of the fastest ways for a React codebase to become inconsistent: different validation libraries, different field wrappers, and different ideas about where form state lives.

This repo uses one default form stack and one default validation strategy.

---

## Locked Default

### Form library

Use **React Hook Form** as the default form state library.

### Schema/validation library

Use **Zod** as the default schema and validation library.

### UI layer

Use **shadcn/ui** primitives and **app-level form wrappers** for field presentation.

### Submit/backend integration

Use **TanStack Query mutations** for async backend submission.

This is the default stack for forms in this repo:

- React Hook Form
- Zod
- shadcn/ui
- TanStack Query

---

## Why This Is the Default

### Why React Hook Form

React Hook Form is the safer default because:

- it is mature and widely used in React apps
- shadcn’s official React form docs directly show React Hook Form integration
- shadcn’s React Hook Form guide uses `zodResolver` with Zod schemas
- it keeps the basic form mental model straightforward for most CRUD/product forms

### Why Zod

Zod is the default schema layer because:

- it is TypeScript-first
- it provides runtime validation plus inferred types
- it is directly supported in shadcn form docs
- it is also supported by TanStack Form through Standard Schema support
- Zod 4 is stable and includes features like JSON Schema conversion, which may be useful later for tooling or schema reuse

### Why not TanStack Form as the default

TanStack Form is valid and officially supported by shadcn, and its docs position it as scalable, type-safe, and composable. But its own docs also make clear that it optimizes for long-term scalability and accepts a higher learning curve. That makes it a weaker default for a repo that wants boring, repeatable, agent-friendly CRUD/product forms. TanStack Form can still be adopted later by explicit decision for special cases, but it is not the baseline pattern.

---

## Core Principles

1. **Use one form pattern by default.**
2. **Validation rules belong in Zod schemas.**
3. **Form submission is not the same thing as form state.**
4. **Forms do not own backend caching. Query mutations do.**
5. **Field presentation must be consistent across the app.**
6. **Form state should stay local unless there is a real cross-step or cross-route requirement.**
7. **Do not invent a new form architecture per feature.**

---

## Approved Form Stack Responsibilities

### React Hook Form owns

- local form state
- field registration
- touched/dirty/error tracking
- submit lifecycle inside the form component
- field-level interaction state

### Zod owns

- schema definition
- runtime validation rules
- type inference from form schema
- input normalization/coercion when intentionally used

### TanStack Query owns

- backend write lifecycle
- mutation loading/error/success state
- invalidation/cache updates after success

### Router owns

- route params/search params when the form depends on URL state
- deep-linkable form context only when intentionally designed

### Zustand owns

- only client-owned multi-step or cross-route draft state when clearly justified

### React local state owns

- truly local UI around the form that should not live inside RHF or URL state

---

## Form File Structure

Feature forms live inside the owning feature.

```txt
features/<feature>/
  components/
    <feature>-form.tsx
  schemas/
    <feature>.schema.ts
  api/
    create-<feature>.ts
    update-<feature>.ts
  types/
    <feature>.types.ts
```

### Typical example

```txt
features/projects/
  components/
    project-form.tsx
  schemas/
    project.schema.ts
  api/
    create-project.ts
    update-project.ts
  types/
    project.types.ts
```

### Reusable form UI

Reusable field composition patterns belong in `components/app/`.

Examples:

- `app-form-field.tsx`
- `app-form-actions.tsx` if the pattern becomes stable
- `app-form-section.tsx` if repeated across features

Primitive inputs remain in `components/ui/`.

---

## Naming Rules

### Form components

Use:

- `<feature>-form.tsx`
- `<feature>-filter-form.tsx`
- `<feature>-settings-form.tsx`

Examples:

- `project-form.tsx`
- `login-form.tsx`
- `profile-settings-form.tsx`

### Schema files

Use `.schema.ts` suffix.

Examples:

- `project.schema.ts`
- `login.schema.ts`
- `project-filter.schema.ts`

### Schema exports

Use `PascalCase` with `Schema` suffix.

Examples:

- `ProjectSchema`
- `LoginSchema`
- `ProjectFilterSchema`
- `ProjectFormSchema`

### Form value types

If an explicit form value type is needed, name it clearly.

Examples:

- `ProjectFormValues`
- `LoginFormValues`
- `ProfileSettingsFormValues`

---

## Zod Rules

Zod is the default schema layer for forms.

### Use Zod for

- form input validation
- field constraints
- cross-field validation when needed
- coercion when HTML inputs require it and the behavior is explicit
- inferred TypeScript form value types

### Zod file placement

Put feature form schemas in `features/<feature>/schemas/`.

### Zod export pattern

Good:

```ts
export const ProjectFormSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  status: z.enum(['draft', 'active', 'archived']),
})

export type ProjectFormValues = z.infer<typeof ProjectFormSchema>
```

### Zod rules

1. Schemas must be named explicitly.
2. Keep validation close to the feature.
3. Use one schema per form concern unless a split is clearly needed.
4. Do not duplicate validation rules in components if the schema should own them.
5. If the backend shape differs from the form input shape, keep the form schema aligned to the form input, not transport weirdness.

### Coercion rule

Use Zod coercion deliberately, not blindly.

Good:

- numeric input that arrives as a string from HTML form controls and should become a number
- date/text normalization where the behavior is explicit and expected

Bad:

- broad coercion that hides bad input assumptions
- coercing everything “just in case”

### Cross-field validation rule

Use schema-level validation for cross-field rules when the rule genuinely belongs to the form model. Do not scatter cross-field checks through button handlers and view logic.

---

## React Hook Form Rules

React Hook Form is the default form-state layer.

### Approved baseline pattern

```ts
const form = useForm<ProjectFormValues>({
  resolver: zodResolver(ProjectFormSchema),
  defaultValues,
  mode: 'onSubmit',
})
```

### Rules

1. Use `zodResolver` with the owning Zod schema.
2. Use explicit typed `defaultValues`.
3. Keep form initialization close to the form component or a thin form hook.
4. Do not create multiple unrelated RHF wrapper patterns across the codebase.
5. Do not mix RHF with ad hoc uncontrolled/manual validation patterns in the same form.

### Validation mode rule

Default to conservative validation behavior.

Recommended default:

- `mode: 'onSubmit'` for most forms

Use more aggressive modes intentionally:

- `onBlur` when early field feedback is clearly useful
- `onChange` only when the UX truly benefits and the form is not noisy

Do not set validation modes randomly per form without reason.

### Field registration rule

Use the approved field/wrapper pattern consistently. Do not invent a new way to connect inputs and error messages in every feature.

---

## Field Composition Rules

### Primitive layer

Use `components/ui` for low-level inputs:

- `input.tsx`
- `textarea.tsx`
- `select.tsx`
- `checkbox.tsx`
- `switch.tsx`
- `radio-group.tsx`

### App layer

Use `components/app` for repeated field composition.

Examples:

- label
- description
- validation message
- spacing/alignment shell
- field group shell

Recommended base wrapper:

- `app-form-field.tsx`
- `app-tags-input.tsx` for list-of-string fields that would otherwise become CSV textareas
- `app-choice-cards.tsx` for small enum fields that read better as selectable cards than selects or plain checkbox stacks

### Feature layer

Feature forms own:

- the actual field set
- domain-specific copy
- domain-specific conditional logic
- domain-specific submit behavior

### Rule

Do not let each feature invent its own field spacing, label layout, and error rendering pattern. That is exactly what `components/app` should stabilize.

### List-of-string field rule

If a form field represents an array of strings, model it as `string[]` in the schema and form state.

Use `AppTagsInput` for the interaction.

Do not model array fields as comma-separated `string` textareas unless the backend or UX explicitly requires raw freeform text.

---

## Default Submit Flow

The approved submit flow is:

1. form state handled by React Hook Form
2. validation handled by Zod via resolver
3. submit handler calls a TanStack Query mutation
4. mutation success/error side effects handled explicitly

### Good pattern

- validate locally through RHF + Zod
- call `mutate` / `mutateAsync`
- on success: invalidate or patch Query caches, close dialog if needed, reset form if appropriate, navigate if appropriate
- on error: surface errors through approved UI pattern

### Bad pattern

- raw `fetch` inside submit handler
- form submit directly manipulating global stores for backend truth
- bypassing feature API and Query mutation patterns

---

## Form + Query Rules

Forms and Query must stay in their lanes.

### Form owns

- inputs
- client-side validation
- dirty/touched state
- local form lifecycle

### Query mutation owns

- backend submission lifecycle
- pending/success/error mutation state
- invalidation/cache update logic

### Rule

Do not treat RHF as the owner of backend success/error cache lifecycle. Do not treat Query as the owner of live field values.

---

## Form + Router Rules

Use Router only when form context genuinely belongs in the URL.

### Good uses

- edit page route param (`projectId`)
- filter form state that should be shareable/bookmarkable
- current step in a wizard when deep linking matters

### Bad uses

- pushing all normal form inputs into search params
- using URL state for ordinary text inputs with no real need

### Rule

Most normal create/edit form field values should not live in the URL.

---

## Form + Zustand Rules

Zustand is not the default owner of form state.

### Do not use Zustand for normal forms

Bad:

- standard create/edit forms stored in Zustand
- every input mirrored into a store by default
- using Zustand as a workaround for poor form architecture

### Zustand is allowed only when

all of these are true:

1. the workflow is multi-step or cross-route
2. draft persistence is a real requirement
3. the state is clearly client-owned
4. React Hook Form alone is no longer a clean fit
5. the choice is documented or obvious from the workflow

### Example allowed case

- long multi-step wizard that spans routes and must survive navigation/reload intentionally

### Even then

Prefer keeping the live field layer inside RHF and syncing only the necessary draft state outward. Do not create two equal sources of truth.

---

## Local State Rules Around Forms

Local React state is allowed for:

- showing/hiding optional sections
- UI-only toggles around the form
- dialog open state
- local preview behavior
- client-only helper UI not worth adding to RHF

Do not move these into Zustand unless they truly become shared/global.

---

## Server Error Handling Rules

### Validation errors from the backend

If the backend returns field-level validation errors, map them into the form layer deliberately. Do not invent a different error mapping pattern in each feature.

### Transport/domain errors

Transport-level error normalization belongs below the form layer. The form decides how to display the resulting error state.

### Rules

- do not hide all submit errors in toasts only
- field-specific errors should appear near fields when appropriate
- form-level errors should have a consistent location/pattern
- do not let every form invent its own error presentation layout

---

## Default Values Rules

Default values must be explicit and predictable.

### Rules

- pass explicit `defaultValues`
- for edit forms, map fetched data into form defaults intentionally
- do not rely on scattered fallback logic deep in fields
- keep default value shape aligned with the form schema

### Edit form rule

For edit forms:

- Query fetches the entity
- feature maps entity data to form defaults if needed
- form initializes with the correct default value shape

Do not leak raw transport shape into the form just because it is convenient.

---

## Controlled vs Uncontrolled Rules

React Hook Form works well with uncontrolled inputs, but some components need controllers/adapters.

### Rule

Use the approved adapter pattern when an input cannot be wired cleanly through simple registration. Keep that pattern consistent.

Do not let every complex input invent its own one-off integration style.

---

## Form Sections and Large Forms

Large forms should still be structured.

### Rules

- split big forms into feature-local subcomponents when needed
- keep one owner for the form instance
- pass the form context or field props intentionally
- do not split one logical form into unrelated mini-forms unless the UX truly requires it

### Good split

- `project-form.tsx` as the owner
- `project-form-details-section.tsx`
- `project-form-status-section.tsx`
- `project-form-actions.tsx`

### Bad split

- unrelated hidden form instances in child components
- multiple libraries or ownership patterns inside the same form

---

## Special Cases: Filter Forms

Filter/search forms are different from create/edit forms.

### Rule

If filter state should be shareable/bookmarkable, Router should own the final applied state. The form can still help collect/edit inputs before syncing to the URL.

### Good pattern

- filter controls use a small local or RHF-managed form layer
- apply action syncs the relevant filter state into Router search params
- Query reads from Router-owned params

### Bad pattern

- filters hidden in Zustand when users should be able to share links
- filter state duplicated across Router, Zustand, and local form state with no clear owner

---

## Allowed Exception: TanStack Form

TanStack Form is allowed only by explicit decision when the workflow clearly benefits from it.

Examples where it may be justified:

- unusually dynamic, highly composable form systems
- very complex field graphs where the headless model is clearly superior
- a later project-wide decision to standardize on TanStack Form instead of RHF

### Until then

Do not mix React Hook Form and TanStack Form casually across features. The default is RHF + Zod.

---

## Anti-Patterns

These are form architecture violations:

- multiple form libraries used casually across features
- validation rules duplicated in component code instead of schema
- field spacing/error rendering reinvented in each feature
- normal CRUD forms stored in Zustand
- raw `fetch` in submit handlers
- backend response shape leaking directly into presentational field code
- form and Query both trying to own the same lifecycle concerns
- pushing normal form inputs into the URL without reason
- random validation modes per form with no UX reason

---

## Review Checklist

Before adding or changing a form, check:

- is this using React Hook Form by default?
- is validation defined in Zod?
- is the schema named clearly and placed in the feature?
- is the form component named clearly and placed in the feature?
- is submission going through a Query mutation?
- are field wrappers consistent with app-level form UI patterns?
- am I using Zustand only if the workflow genuinely requires it?
- am I leaking transport shape too deep into the form?
- do field-level and form-level errors follow a consistent pattern?

---

## Default Decision Summary

### Use React Hook Form when

- building normal create/edit/product forms
- building login/profile/settings forms
- building most CRUD forms in the app

### Use Zod when

- defining form validation rules
- inferring form value types
- validating and normalizing form input shape

### Use Query mutation when

- submitting to the backend
- handling async submit lifecycle
- invalidating or updating server cache after success

### Use Router with forms when

- applied filter/search state should live in the URL
- the form context is genuinely route-linked

### Use Zustand only when

- the workflow is multi-step or cross-route
- draft persistence is intentional
- the form state is clearly client-owned and RHF alone is not enough

---

## Final Rule

Forms should feel repetitive in a good way:

- same form library
- same schema library
- same field wrapper pattern
- same submit flow
- same error presentation philosophy
- same ownership boundary with Query, Router, and Zustand

If every feature invents a different form pattern, the codebase will rot fast.
