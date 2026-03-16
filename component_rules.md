# COMPONENT_RULES.md

## Purpose

This document defines the component architecture rules for the frontend.

The goal is to stop UI drift, duplicated compositions, and raw primitive sprawl.
This repo uses shadcn/ui as the primitive layer, but product UI should not be built as uncontrolled piles of primitives across feature folders.

Component structure must remain predictable for both humans and AI agents.

---

## Component Layers

This frontend has three component layers:

1. `components/ui` → primitive layer
2. `components/app` → reusable product UI layer
3. `features/*/components` → feature/domain UI layer

These layers have different jobs.
Do not blur them.

---

## Layer 1: `components/ui`

### What it is

`components/ui` contains **primitive UI building blocks**.
In this repo, that means shadcn/ui primitives and closely related low-level adaptations.

Examples:

- `button.tsx`
- `input.tsx`
- `textarea.tsx`
- `dialog.tsx`
- `sheet.tsx`
- `dropdown-menu.tsx`
- `table.tsx`
- `tooltip.tsx`
- `badge.tsx`

### What it is for

Use `components/ui` for:

- low-level reusable UI primitives
- accessible interaction primitives
- styling foundations shared across the app
- low-level building blocks that many higher components compose

### What it is not for

Do not use `components/ui` for:

- feature/domain components
- API hooks
- backend data fetching
- business logic
- domain-specific labels and mapping
- product workflows
- ad hoc one-off UI hacks

### Hard rules

1. `components/ui` must remain low-level.
2. Do not put feature/domain language in primitive files.
3. Do not create files like `project-card.tsx` or `user-toolbar.tsx` in `components/ui`.
4. Do not import feature hooks into `components/ui`.
5. Prefer minimal edits to shadcn primitives.
6. If a pattern is product-specific, it does not belong here.

---

## Layer 2: `components/app`

### What it is

`components/app` contains **approved app-level reusable compositions**.

This is the real product-facing design layer.
It is built on top of `components/ui` and stops feature folders from rebuilding the same visual patterns differently.

Examples:

- `app-page.tsx`
- `app-section.tsx`
- `app-card.tsx`
- `app-toolbar.tsx`
- `app-empty-state.tsx`
- `app-error-state.tsx`
- `app-loading-state.tsx`
- `app-confirm-dialog.tsx`
- `app-table.tsx`
- `app-form-field.tsx`
- `app-status-badge.tsx`

### What it is for

Use `components/app` for:

- reusable product UI patterns
- consistent shells and layout structures
- repeated compositions of primitives
- standardized empty/error/loading states
- standardized table/list shells
- standardized confirm/destructive action patterns
- standardized form wrappers

### What it is not for

Do not use `components/app` for:

- feature-specific domain views
- data ownership
- feature-specific API hooks
- product logic tied to one feature only

### Hard rules

1. `components/app` is for concrete, repeated product patterns.
2. If multiple features are rebuilding the same layout or state wrapper, it should probably live here.
3. App components may compose `components/ui`, but should remain UI-focused.
4. App components must not quietly become hidden business-logic containers.
5. Do not dump one-off feature code here just because it looks reusable.

---

## Layer 3: `features/*/components`

### What it is

Feature component folders contain **domain-specific UI**.

Examples:

- `features/projects/components/project-table.tsx`
- `features/projects/components/project-form.tsx`
- `features/projects/components/project-detail-header.tsx`
- `features/auth/components/login-form.tsx`

### What it is for

Use feature component folders for:

- domain-specific views
- domain-specific forms
- domain-specific detail headers/cards
- domain-specific tables or list items
- domain-specific compositions that are not yet reused elsewhere

### What it is not for

Do not use feature component folders for:

- app shell patterns
- low-level primitives
- generic confirm dialog patterns
- generic table shell patterns
- duplicate versions of existing app-level wrappers

### Hard rules

1. New UI should start in the feature unless it is obviously primitive or already app-wide.
2. Keep feature UI inside the feature until reuse is proven.
3. Do not pull code up into shared layers too early.
4. Do not duplicate app-level patterns in multiple features.

---

## Default Composition Order

When building UI, follow this order:

1. existing feature component
2. existing `components/app` wrapper
3. existing `components/ui` primitive
4. create a new feature component
5. promote a repeated pattern into `components/app` only when reuse is real

This order is deliberate.
It keeps product logic in features, shared patterns in app-level wrappers, and primitives low-level.

---

## Promotion Rules

Promotion is when code moves from a narrow layer to a broader one.
Promotion must be earned.

### Promote from feature to `components/app` when

All of these are true:

1. the component is used across multiple features or clearly will be immediately
2. the pattern is part of the product UI language, not one domain only
3. the abstraction has a concrete name
4. the behavior is mostly presentational or composition-level, not domain-specific

Examples of good promotion:

- multiple features need the same toolbar shell
- multiple features need the same empty state pattern
- multiple features need the same destructive confirm dialog pattern
- multiple features need the same table wrapper and header actions layout

### Do not promote when

- reuse is speculative
- the abstraction only exists in one domain
- the name becomes vague when generalized
- moving it upward would drag domain logic into shared layers

Bad promotions:

- moving `project-summary-card.tsx` to `components/app` just because it might be reused later
- moving a domain-specific header with project logic into `components/app`

### Promote from `components/ui` to `components/app`

This is usually not a real “promotion.”
It means you should **compose** primitives into a stable app-level wrapper instead of having features repeat that composition.

Example:

- repeated `Card + CardHeader + CardContent + Button + Badge` pattern across features
- result → `app-card.tsx` or `app-toolbar.tsx`

---

## Reuse Rules

### Rule 1: Reuse app-level patterns before raw primitives

If `AppTable`, `AppToolbar`, or `AppConfirmDialog` exists, use it before composing raw primitives again.

### Rule 2: Reuse feature components only within their real domain

A feature component can be reused inside the same feature freely.
Do not use a feature component as a pseudo-shared component across unrelated features.

Bad:

- `features/projects/components/project-table.tsx` imported into unrelated `users` or `billing` flows because it “kind of works”

### Rule 3: Do not create near-duplicate wrappers

Bad:

- `app-card.tsx`
- `app-content-card.tsx`
- `app-section-card.tsx`
- `app-panel-card.tsx`

when all of them solve basically the same problem.

One pattern should win.

### Rule 4: Prefer composition over new abstraction names

If a stable wrapper already exists, compose it.
Do not invent a differently named wrapper that is just a slightly rearranged version.

---

## Base App Components That Should Exist Early

These are the minimum reusable product wrappers that help stop UI drift.

- `app-page.tsx`
- `app-section.tsx`
- `app-card.tsx`
- `app-toolbar.tsx`
- `app-empty-state.tsx`
- `app-error-state.tsx`
- `app-loading-state.tsx`
- `app-confirm-dialog.tsx`
- `app-table.tsx`
- `app-form-field.tsx`
- `app-status-badge.tsx`

### Why these exist

They solve the most common repetition problems early:

- page spacing drift
- inconsistent section spacing
- multiple card styles
- random toolbar layouts
- inconsistent empty/error/loading UI
- inconsistent destructive action handling
- inconsistent form field composition
- inconsistent status badge styling

---

## Page Composition Rules

### Pages should compose, not reinvent

A page should usually be built from:

- `AppPage`
- one or more `AppSection`
- feature components
- shared wrappers like `AppToolbar`, `AppTable`, `AppEmptyState`

### Pages should not do this

Bad:

- build a new layout spacing system from scratch
- assemble raw primitives in a brand new way every time
- directly re-implement empty/error/loading patterns
- deeply nest shadcn primitives with one-off spacing everywhere

### Good page shape

Typical page structure:

- page shell
- toolbar/filter row
- primary content card/table/list area
- empty/error/loading states through shared wrappers

---

## Table and List Rules

Tables and lists are high-risk for duplication.

### App-level ownership

Use `components/app` for common table/list shells when these patterns repeat:

- header area
- toolbar area
- empty state
- loading state
- error state
- row spacing/density handling
- bulk action framing

### Feature ownership

Keep feature-specific row rendering, columns, domain labels, and domain actions inside the feature.

Good split:

- `components/app/app-table.tsx` → generic table shell
- `features/projects/components/project-table.tsx` → project-specific columns and table config

Bad split:

- every feature composes its own different table container from raw primitives

---

## Form Rules

Forms also create duplication fast.

### App-level ownership

Put reusable field composition patterns in `components/app`.

Examples:

- `app-form-field.tsx`
- field label + control + description + error layout
- standard submit row composition if used broadly

### Feature ownership

Keep feature-specific forms and schemas inside the feature.

Examples:

- `project-form.tsx`
- `login-form.tsx`
- `project.schema.ts`

### Form anti-patterns

Bad:

- multiple inconsistent field shells
- each feature inventing its own spacing/label/error pattern
- business logic embedded into app-level generic form wrappers

---

## Dialog and Overlay Rules

Dialogs, sheets, popovers, and menus create easy inconsistency.

### Primitive ownership

Low-level dialog/sheet/popover primitives stay in `components/ui`.

### App-level ownership

Common app-wide interaction patterns should move to `components/app`.

Examples:

- confirm dialog
- destructive action dialog
- standard detail drawer shell
- standard action menu composition if reused widely

### Feature ownership

Domain-specific dialogs stay in features until reuse across features is real.

Examples:

- `project-archive-dialog.tsx`
- `user-permission-dialog.tsx`

---

## Empty, Loading, and Error State Rules

These states should be standardized early.

### App-level ownership

Use:

- `AppEmptyState`
- `AppLoadingState`
- `AppErrorState`

These should be the default.

### Feature ownership

Feature folders may pass domain-specific copy, actions, and illustrations/icons, but should not rebuild the whole pattern each time.

### Anti-pattern

Bad:

- each page has a different empty-state spacing system
- each list invents different loading skeleton behavior
- errors are rendered ad hoc from raw primitives

---

## Styling Rules for Components

### Hard rules

- use tokens only
- no raw hex colors in feature component code
- no random shadows/radii/spacing values unless approved
- no inline style objects for normal UI work
- no one-off layout inventions when a shared wrapper exists

### shadcn styling rule

If a style difference is product-wide, solve it in tokens, variants, or shared wrappers.
Do not patch it separately in five features.

### App component styling rule

App-level wrappers should enforce consistent spacing, alignment, and state rendering.
That is one of their main purposes.

---

## Data and Logic Boundaries Inside Components

### Presentational components

Presentational components should mostly:

- receive props
- render UI
- emit callbacks

They should not:

- fetch backend data directly
- own global client state patterns unnecessarily
- perform domain orchestration that belongs in hooks or feature containers

### Feature components

Feature components may coordinate feature hooks, feature query results, and domain UI.
But even here, do not hide everything in one giant god-component.

### App components

App components must stay mostly presentational/compositional.
They should not become disguised feature controllers.

### Primitive components

Primitive components must remain low-level and generic.

---

## Container vs Presentational Guidance

This repo does not require strict “container/presentational” dogma, but the boundary should still be clear.

### Good split

- hooks handle data/state wiring
- feature components assemble domain UI
- app components provide reusable layout patterns
- ui components provide primitives

### Bad split

- every component does fetch + transform + render + mutation + layout
- app-level wrappers secretly call feature hooks
- primitives become semi-domain-aware

---

## Anti-Patterns

These are component architecture violations:

- putting `project-card.tsx` in `components/ui`
- rebuilding the same toolbar pattern in three features
- feature code bypassing `components/app` and composing raw primitives repeatedly
- promoting domain-specific code to shared layers too early
- app wrappers containing feature-specific API calls
- giant page components that mix layout, data wiring, mutation logic, and domain rendering into one file
- creating several almost-identical wrappers for the same pattern

---

## Decision Rules

When creating a component, decide in this order:

### 1. Is it a primitive?
If yes, `components/ui`.

### 2. Is it a repeated product-level composition?
If yes, `components/app`.

### 3. Is it domain-specific?
If yes, `features/<feature>/components`.

### 4. Is reuse still speculative?
If yes, keep it inside the feature.

### 5. Is an existing app wrapper already close enough?
If yes, reuse or extend it instead of creating a sibling abstraction.

---

## Review Checklist for New Components

Before adding a new component, check:

- does a component already exist for this pattern?
- is this primitive, app-level, or feature-level?
- is the name concrete and honest?
- is this reusing existing wrappers where appropriate?
- am I creating duplicate composition patterns?
- am I putting domain logic into a shared layer?
- would keeping this inside the feature be cleaner for now?

---

## Final Rule

UI should grow from narrow to broad:

- primitive if truly primitive
- feature-local by default
- promoted to app-level only when repetition is proven

Do not start broad.
Do not abstract out of fear.
Do not let features freestyle product patterns from raw primitives forever.

That is how the UI stays consistent without becoming rigid.

