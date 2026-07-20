# NAMING_CONVENTIONS.md

## Purpose

This document defines naming conventions for the frontend repository.

The goal is not style purity.
The goal is to make file purpose obvious, reduce ambiguity, improve searchability, and stop humans and agents from creating vague junk names that rot the repo.

If a file name does not tell the truth about what the file does, the name is wrong.

---

## Global Rules

### 1) File names are always `kebab-case`

Examples:

- `project-table.tsx`
- `app-confirm-dialog.tsx`
- `use-project-filters.ts`
- `project-ui.store.ts`
- `project.schema.ts`

Do not use:

- `camelCase.ts`
- `PascalCase.tsx` for file names
- mixed separators like `project_table.tsx`

### 2) Exported component names are `PascalCase`

Examples:

- `ProjectTable`
- `AppConfirmDialog`
- `LoginForm`

### 3) Hooks start with `use`

Examples:

- `useProjectFilters`
- `useSession`
- `useProjectActions`

### 4) Prefer named exports

Named exports are the default for most feature code.

Avoid default exports in normal feature code unless there is a strong reason.

### 5) Name by exact purpose, not vague category

Good:

- `get-projects.ts`
- `map-project.ts`
- `project-table.tsx`
- `project-ui.store.ts`

Bad:

- `helpers.ts`
- `utils.ts`
- `common.ts`
- `service.ts`
- `state.ts`

---

## Naming Philosophy

A name should answer at least one of these clearly:

- what domain does this belong to?
- what does this file do?
- what pattern is this file implementing?
- what kind of thing is exported from this file?

If the name hides the answer, the name is bad.

---

## Components

### File naming

Use:

- `<thing>.tsx`
- `app-<thing>.tsx` for app-level reusable UI
- `<feature>-<thing>.tsx` for feature-specific components

Examples:

- `project-table.tsx`
- `project-form.tsx`
- `project-detail-header.tsx`
- `app-page.tsx`
- `app-toolbar.tsx`
- `login-form.tsx`

### Component export naming

Use `PascalCase` and match the file purpose.

Examples:

- `project-table.tsx` → `ProjectTable`
- `app-toolbar.tsx` → `AppToolbar`
- `login-form.tsx` → `LoginForm`

### Component naming rules

- components should be named by what they render or represent
- do not use meaningless suffixes like `Component`
- do not add `New`, `Final`, `Updated`, `V2`, `Better`, `Temp`

Bad:

- `ProjectComponent`
- `BetterDialog`
- `ProjectTableV2`
- `NewLogin`

Good:

- `ProjectTable`
- `AppConfirmDialog`
- `LoginForm`

---

## App-Level UI Components

Files in `components/app/` should start with `app-` unless the project deliberately adopts a different strict convention later.

Examples:

- `app-page.tsx`
- `app-section.tsx`
- `app-card.tsx`
- `app-table.tsx`
- `app-confirm-dialog.tsx`

Reason:

This makes app-level reusable UI immediately distinguishable from feature UI.

Exports:

- `AppPage`
- `AppSection`
- `AppCard`
- `AppTable`
- `AppConfirmDialog`

---

## shadcn Primitive Components

Files in `components/ui/` keep the primitive name.

Examples:

- `button.tsx`
- `input.tsx`
- `dialog.tsx`
- `table.tsx`
- `tooltip.tsx`

Rules:

- do not prefix primitives with feature names
- do not create files like `project-button.tsx` in `components/ui/`
- feature-specific UI does not belong in `components/ui/`

---

## Feature Components

Feature component files should be named by feature + function.

Pattern:

- `<feature>-<thing>.tsx`
- `<feature>-<thing>-<subthing>.tsx` when needed

Examples:

- `project-table.tsx`
- `project-form.tsx`
- `project-detail-header.tsx`
- `project-status-badge.tsx`
- `user-profile-card.tsx`

Rules:

- be specific
- avoid overly broad names like `project-view.tsx` unless it is truly a full view
- avoid repeating folder names unnecessarily in exports if clarity is already good

---

## Hooks

### File naming

Hook files must start with `use-`.

Pattern:

- `use-<thing>.ts`
- `use-<feature>-<thing>.ts`

Examples:

- `use-session.ts`
- `use-project-filters.ts`
- `use-project-actions.ts`
- `use-project-search-params.ts`

### Hook export naming

Use `camelCase` with `use` prefix.

Examples:

- `useSession`
- `useProjectFilters`
- `useProjectActions`
- `useProjectSearchParams`

### Hook rules

- one main hook per file
- the name should describe the hook’s actual role
- do not hide broad behavior behind vague hook names

Bad:

- `use-app.ts`
- `use-utils.ts`
- `use-project.ts` when it actually handles filters, actions, and mutations

Good:

- `use-project-filters.ts`
- `use-project-actions.ts`
- `use-project-table-state.ts`

---

## Zustand Stores

### File naming

Store files must use `.store.ts` suffix.

Pattern:

- `<thing>.store.ts`
- `<feature>-ui.store.ts`

Examples:

- `app-ui.store.ts`
- `preferences.store.ts`
- `session.store.ts`
- `project-ui.store.ts`
- `report-builder.store.ts`

### Store hook naming

Exported store hooks use `useXxxStore`.

Examples:

- `useAppUiStore`
- `usePreferencesStore`
- `useSessionStore`
- `useProjectUiStore`

### Store naming rules

- include `ui` in the name when the store is clearly UI-oriented
- use the domain name when feature-scoped
- avoid generic names

Bad:

- `store.ts`
- `global-state.ts`
- `project-state.ts`
- `main.store.ts`

Good:

- `project-ui.store.ts`
- `preferences.store.ts`
- `session.store.ts`

---

## Reducers

### File naming

Reducer files must use `.reducer.ts` suffix.

Examples:

- `project-editor.reducer.ts`
- `report-builder.reducer.ts`
- `bulk-selection.reducer.ts`

### Reducer naming rules

- name by workflow or state machine role
- do not name a reducer as if it were a store
- do not use vague names like `reducer.ts`

---

## Query Keys and Query Options

### Query key files

Use `<feature>.keys.ts`.

Examples:

- `project.keys.ts`
- `auth.keys.ts`
- `user.keys.ts`

Export name:

- `projectKeys`
- `authKeys`
- `userKeys`

### Query options files

Use `<feature>.query-options.ts`.

Examples:

- `project.query-options.ts`
- `auth.query-options.ts`

Rules:

- one feature owns its own keys
- one feature owns its own query option builders
- do not create global query key dumping files

Bad:

- `query-keys.ts` containing every feature in the app
- `queries.ts`
- `react-query.ts`

---

## API Files

### File naming

API files are named by action.

Pattern:

- `get-<item>.ts`
- `get-<items>.ts`
- `create-<item>.ts`
- `update-<item>.ts`
- `delete-<item>.ts`
- `<action>-<thing>.ts` when more specific

Examples:

- `get-project.ts`
- `get-projects.ts`
- `create-project.ts`
- `update-project.ts`
- `delete-project.ts`
- `archive-project.ts`
- `reorder-project-columns.ts`

### API export naming

Use verb-based exported functions.

Examples:

- `getProject`
- `getProjects`
- `createProject`
- `updateProject`
- `deleteProject`
- `archiveProject`

### API naming rules

- one file should do one thing
- names should match backend intent clearly
- avoid generic `service` naming

Bad:

- `api.ts`
- `project-api.ts`
- `project-service.ts`
- `requests.ts`

---

## Schemas

### File naming

Schema files must use `.schema.ts` suffix.

Examples:

- `project.schema.ts`
- `login.schema.ts`
- `project-filter.schema.ts`

### Export naming

Use `camelCase` with `Schema` suffix.

> Correction: earlier revisions of this doc said `PascalCase` here. That was
> wrong. Every schema actually shipped in this repo uses `camelCase` (e.g.
> `loginSchema`, `createUserSchema`, `createEntityFormSchema`). Code is canon;
> this doc was fixed to match it, not the other way around.

Examples:

- `projectSchema`
- `loginSchema`
- `projectFilterSchema`

If a schema models form input specifically, the export may be more explicit.

Examples:

- `loginFormSchema`
- `projectFormSchema`

---

## Types

### File naming

Type files must use `.types.ts` suffix.

Examples:

- `project.types.ts`
- `auth.types.ts`
- `api.types.ts`
- `common.types.ts`

### Export naming

Use `PascalCase`.

Examples:

- `Project`
- `ProjectSummary`
- `ProjectFormValues`
- `AuthSession`
- `ApiErrorResponse`

### Type naming rules

- use names that reflect actual domain meaning
- prefer domain nouns over technical filler
- suffix with `Response`, `Input`, `Values`, `Params`, `Filters` only when it adds real clarity

Bad:

- `Data`
- `Item`
- `Info`
- `Obj`
- `Payload` when the shape is actually more specific

Good:

- `Project`
- `ProjectListItem`
- `ProjectDetailResponse`
- `ProjectFilters`
- `LoginInput`

---

## Utilities

### File naming

Utility files must be named by exact purpose.

Examples:

- `map-project.ts`
- `format-project-name.ts`
- `project-labels.ts`
- `parse-project-filters.ts`
- `build-project-breadcrumbs.ts`

### Utility naming rules

- use verbs for transformations or construction
- use nouns for constant/lookup-style helpers
- avoid dumping multiple unrelated concerns into one file

Bad:

- `helpers.ts`
- `utils.ts`
- `common.ts`
- `misc.ts`

Good:

- `map-project.ts`
- `format-currency.ts`
- `parse-date-range.ts`
- `status-labels.ts`

---

## Route Files

The router is TanStack Router.
Route files should be named to reflect route structure clearly.

### Route naming patterns

Examples:

- `index.tsx`
- `__root.tsx`
- `auth/login.tsx`
- `app/dashboard.tsx`
- `app/projects.index.tsx`
- `app/projects.$projectId.tsx`
- `app/settings.tsx`

### Route rules

- use the router’s route naming conventions consistently
- dynamic segments should be obvious in the filename
- do not create custom naming schemes that fight the router
- route file names are not general component names

If a route needs a page-level composed component separate from the route file, name that component clearly in the feature or app layer.

Examples:

- `projects-page.tsx`
- `project-detail-page.tsx`

---

## Pages

If standalone page components exist outside route files, use `-page` suffix.

Examples:

- `projects-page.tsx`
- `project-detail-page.tsx`
- `settings-page.tsx`
- `not-found-page.tsx`

Rules:

- use `-page` for page-level compositions
- do not use `screen` and `page` interchangeably unless a deliberate system is documented
- prefer one convention only

---

## Layouts

Use `-shell` or `-layout` consistently by purpose.

Recommended split:

- `-shell` for full app framing
- `-layout` only if needed for internal layout compositions

Examples:

- `app-shell.tsx`
- `auth-shell.tsx`
- `settings-layout.tsx`

Do not mix names casually.

---

## Providers

Provider file names must end with `-provider.tsx`.

Examples:

- `query-provider.tsx`
- `theme-provider.tsx`
- `router-provider.tsx`
- `auth-provider.tsx`

Exports:

- `QueryProvider`
- `ThemeProvider`
- `RouterProvider`
- `AuthProvider`

---

## Constants

Constant files should be noun-based and narrow.

Examples:

- `routes.ts`
- `app-config.ts`
- `status-options.ts`
- `date-formats.ts`

Avoid:

- `constants.ts`
- `config.ts` for unrelated concerns mixed together unless it is truly one config domain

---

## Tests

If test files are colocated, use one of these patterns consistently:

- `<file>.test.ts`
- `<file>.test.tsx`
- `<file>.spec.ts`
- `<file>.spec.tsx`

Pick one and keep it global.

Recommended:

- `.test.ts`
- `.test.tsx`

Examples:

- `project-table.test.tsx`
- `use-project-filters.test.ts`
- `project.schema.test.ts`

---

## Examples of Approved Names

### Good component names

- `project-table.tsx`
- `project-form.tsx`
- `project-detail-header.tsx`
- `app-toolbar.tsx`
- `app-empty-state.tsx`

### Good hook names

- `use-project-filters.ts`
- `use-project-actions.ts`
- `use-session.ts`

### Good store names

- `app-ui.store.ts`
- `preferences.store.ts`
- `project-ui.store.ts`

### Good API names

- `get-project.ts`
- `get-projects.ts`
- `archive-project.ts`

### Good utility names

- `map-project.ts`
- `format-project-name.ts`
- `build-project-breadcrumbs.ts`

---

## Blacklist: Names That Should Almost Never Exist

These names are banned by default because they hide purpose:

- `helpers.ts`
- `utils.ts`
- `common.ts`
- `misc.ts`
- `state.ts`
- `store.ts`
- `service.ts`
- `api.ts`
- `types.ts` inside a feature with mixed unrelated contents unless the feature has a single obvious type file and the team explicitly allows it
- `index.ts` as a dumping/export barrel unless there is a documented reason
- `new-*.tsx`
- `better-*.tsx`
- `final-*.tsx`
- `temp-*.tsx`
- `v2-*.tsx`

If one of these appears, there should be a strong documented reason.

---

## Refactoring Rule

When renaming a file, the new name should improve at least one of these:

- domain clarity
- action clarity
- searchability
- pattern consistency
- folder-to-file relationship

Do not rename files just for churn.

---

## Final Rule

A good name should let someone scanning the tree answer this immediately:

- what is this?
- where does it belong?
- why does it exist?

If the name fails that test, rename it.

