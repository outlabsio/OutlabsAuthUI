# STYLING_RULES.md

## Purpose

This document defines the styling rules for the frontend.

The goal is not maximum visual creativity.
The goal is a UI that stays coherent as the codebase grows, even when many humans and AI agents are touching it.

This repo uses:

- Tailwind for utility styling
- shadcn/ui as the primitive component layer
- app-level wrappers for repeated product patterns
- shared design tokens as the source of truth

Without hard styling rules, the repo will drift into:

- arbitrary spacing
- inconsistent radii and shadows
- random color usage
- duplicate layout systems
- one-off overrides everywhere

That is what this document is meant to prevent.

---

## Core Principles

1. **Tokens are the source of truth.**
2. **Layout patterns should repeat.**
3. **Visual decisions belong in shared layers, not random feature files.**
4. **shadcn primitives should inherit the design system, not fight it.**
5. **Utility usage should be consistent, not improvised.**
6. **A small number of approved patterns is better than many almost-identical ones.**
7. **Do not solve product-wide styling problems in feature-local code.**

---

## Styling Stack Responsibilities

### Tailwind owns

- utility classes
- responsive utility behavior
- token-driven styling usage
- layout and spacing composition

### Shared token files own

- colors
- radii
- shadows
- semantic aliases
- app-level typography tokens if needed
- other reusable visual primitives

### shadcn/ui owns

- primitive component structure
- primitive variants where appropriate
- low-level styling tied to shared token usage

### `components/app` owns

- repeated product-level layout/styling patterns
- page shells
- section shells
- card shells
- state wrappers
- table/form shell styling

### Feature components own

- domain-specific application of approved styles
- domain-specific layout within the guardrails

Feature components do **not** own the design system.

---

## Design Token Rules

### Tokens are required

All reusable visual values must come from shared tokens.

Examples of tokenized concerns:

- surface/background colors
- text colors
- semantic colors
- border colors
- radius scale
- shadow scale
- ring/focus colors
- spacing conventions if custom app tokens are needed

### Token file placement

Shared style tokens live in:

- `src/styles/tokens.css`

Global style entry lives in:

- `src/styles/app.css`

### Token categories

Use token categories that reflect product semantics, not random implementation details.

Examples:

- brand
- background
- foreground
- muted
- accent
- destructive
- success
- warning
- border
- input
- ring
- card
- popover

### Rules

1. Product-wide visual values must be tokenized.
2. Do not hardcode recurring design values in feature files.
3. If a visual value is repeated or should be stable, move it into tokens.
4. Semantic token names are preferred over raw palette names for UI intent.

---

## Color Rules

### Use semantic colors first

Prefer color usage by purpose.

Examples:

- background
- foreground
- muted
- accent
- destructive
- success
- warning
- border
- ring

### Avoid raw color sprawl

Do not use raw hex values in feature code.
Do not scatter arbitrary Tailwind palette classes across the app without semantic control.

Bad:

- `text-red-600` for one error state, `text-rose-500` for another, `text-orange-600` for a warning invented ad hoc
- raw hex values in JSX class strings

Good:

- token-driven destructive text
- token-driven warning badge variant
- token-driven success state pattern

### Brand color rule

Brand colors should exist as tokens and be referenced through approved classes/variants.
Do not manually tint the brand color differently in every feature.

### State color rule

Success, warning, destructive, info, and neutral state styling should each have one approved visual approach.
Do not invent a different color treatment for every screen.

---

## Spacing Rules

Spacing drift is one of the fastest ways to make a UI feel messy.

### Rules

1. Use Tailwind spacing scale consistently.
2. Prefer approved spacing patterns in wrappers instead of page-by-page invention.
3. Do not use arbitrary spacing values unless a real exception is needed.
4. Page, section, card, and form spacing should come from shared patterns.

### Page spacing

Page shells should define default top-level spacing.
This belongs in `AppPage`, not repeated manually in every route.

### Section spacing

Section wrappers should define vertical rhythm.
This belongs in `AppSection`, not a new margin stack every time.

### Internal component spacing

Cards, toolbars, field groups, dialogs, and tables should each have stable spacing rules through wrappers or variants.

### Bad spacing patterns

Bad:

- arbitrary `p-[13px]`, `gap-[11px]`, `mt-[22px]`
- every feature inventing its own section spacing
- deeply nested margin stacking instead of wrapper-based layout

### Good spacing patterns

Good:

- standard `AppPage` / `AppSection` spacing
- stable card padding values
- stable toolbar gap patterns
- stable form field spacing through shared wrappers

---

## Radius Rules

Rounded corners must feel intentional across the app.

### Rules

1. Use a small approved radius scale.
2. Radii should come from tokens or shared conventions.
3. Do not mix many similar radius sizes casually.

### Suggested scale

Keep the scale tight.

Examples:

- small
- medium
- large

### Bad radius usage

Bad:

- `rounded-sm`, `rounded-md`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-[18px]` all mixed randomly across nearby components

### Good radius usage

Good:

- one normal control radius
- one card/dialog radius
- one badge/pill radius pattern where justified

If the UI should feel softer or sharper, adjust tokens and shared wrappers, not individual features one by one.

---

## Shadow Rules

Shadows must be scarce and consistent.

### Rules

1. Use a small approved shadow scale.
2. Prefer border + subtle surface separation over heavy shadow noise.
3. Do not assign random custom shadow values in features.
4. Dialogs, popovers, cards, and overlays should use approved shadow levels only.

### Bad shadow usage

Bad:

- every card has a different shadow
- arbitrary custom shadow classes in feature code
- using stronger shadows to compensate for poor spacing/border hierarchy

### Good shadow usage

Good:

- one default card surface shadow or none
- one popover/dialog elevation level
- one hover elevation pattern if needed

---

## Border Rules

Borders should be part of a consistent surface system.

### Rules

- use tokenized border colors
- do not invent border intensity per feature
- surface boundaries should use the same border language across cards, panels, dialogs, and inputs
- border-heavy styling should not replace proper layout or hierarchy

### Input border rule

Inputs should use one standard border treatment and one standard focus treatment.
Do not let each feature alter input borders ad hoc.

---

## Typography Rules

Typography should be simple and stable.

### Rules

1. Define a small, repeatable type scale.
2. Use semantic text roles where possible.
3. Do not improvise font sizes/weights page by page.
4. Heading/body/muted/meta styles should have stable usage patterns.

### Common roles

Examples:

- page title
- section title
- body text
- muted/supporting text
- label text
- table cell text
- small meta text

### Font weight rules

Use a restrained weight system.
Do not solve emphasis problems by escalating weight everywhere.

### Bad typography usage

Bad:

- every page title uses a different size
- muted text uses random grays or opacities per feature
- labels and helper text change style unpredictably

### Good typography usage

Good:

- `AppPage` defines page heading treatment
- form field wrappers define label and message treatment
- tables use one stable content scale

---

## Layout Rules

Layout patterns should be standardized early.

### Approved layout primitives

These should exist as reusable app-level wrappers:

- `AppPage`
- `AppSection`
- `AppCard`
- `AppToolbar`
- `AppEmptyState`
- `AppErrorState`
- `AppLoadingState`
- `AppTable`
- `AppFormField`

### Rule

If a layout pattern repeats, it should become a wrapper.
Do not keep rebuilding it from raw primitives.

### Page layout rule

Pages should use a stable outer container width, spacing rhythm, and section structure.
Do not let every route invent its own content width and gutter logic.

### Card layout rule

Cards should use one approved surface system.
Do not let each feature define its own card padding, title spacing, and footer spacing.

### Toolbar rule

Toolbars should use one or a few approved layouts.
Do not rebuild filters/actions/search rows differently on every screen.

---

## Responsive Design Rules

Responsive behavior should be intentional, not accidental.

### Rules

1. Build from mobile-safe layouts upward unless the product clearly dictates otherwise.
2. Use a small number of repeatable breakpoint patterns.
3. Do not solve responsive issues with one-off class explosions everywhere.
4. App-level wrappers should absorb common responsive layout concerns when possible.

### Good responsive patterns

- page shell controls max width and horizontal padding
- toolbar stacks consistently on small screens
- cards and sections use predictable breakpoint changes
- tables have a defined mobile behavior strategy

### Bad responsive patterns

- each page invents its own breakpoint logic
- arbitrary breakpoint combinations for similar patterns
- fixing overflow issues ad hoc in many places instead of addressing the shell/component pattern

---

## Dark Mode Rules

If dark mode is supported, it must be treated as a first-class token system concern.

### Rules

1. Dark mode values come from shared tokens.
2. Do not patch dark mode in feature files one-off unless unavoidable.
3. Background, foreground, border, input, popover, card, and state colors must all have coherent dark mode mapping.
4. Dark mode should not rely on random inverted Tailwind palette usage across the app.

### Good pattern

- shared tokens define both light and dark values
- primitives and wrappers automatically inherit the theme system

### Bad pattern

- adding dark classes manually in isolated features to compensate for missing shared theming
- different dark surfaces using unrelated values with no system

---

## Focus and Interaction Rules

Interaction states are part of the design system.

### Focus rules

- all interactive controls must have a consistent focus treatment
- focus styles should be token-driven
- do not remove focus indication without an accessible replacement
- inputs, buttons, selects, menus, dialogs, and links should follow one focus language

### Hover rules

- hover states should be subtle and predictable
- hover style intensity should not vary wildly across similar components

### Disabled rules

- disabled controls should use one clear visual pattern
- do not invent separate disabled treatments per feature

### Active/selected rules

- selected state styling should be consistent for tabs, menu items, toggles, list selections, and row selections where possible

---

## Motion and Transition Rules

Motion should be restrained.

### Rules

1. Use motion only where it improves clarity.
2. Prefer short, subtle transitions.
3. Do not animate layout or opacity everywhere just because you can.
4. Dialogs, sheets, dropdowns, and accordions should use a consistent motion language.
5. Respect reduced-motion preferences when applicable.

### Bad motion patterns

Bad:

- different transition durations on similar components
- decorative animation added ad hoc in feature code
- excessive motion on routine form/table interactions

### Good motion patterns

Good:

- consistent overlay/dialog entrance
- consistent dropdown/sheet motion
- subtle hover/focus transitions only where useful

---

## Tailwind Utility Rules

Tailwind is powerful, which means it can create chaos fast.

### Hard rules

1. Prefer semantic/shared class usage through wrappers when repetition exists.
2. Do not use arbitrary values unless there is a real exception.
3. Do not create giant unreadable class strings when a wrapper/component should exist.
4. Do not create style duplication across features when a shared wrapper should absorb it.

### Arbitrary value rule

Arbitrary values are allowed only when:

- the design need is real and uncommon
- there is no good token/scale match
- the value is unlikely to repeat
- it does not indicate a missing shared token that should be added

If the same arbitrary value appears twice, it probably should not be arbitrary anymore.

### Utility grouping rule

If the same long class composition appears in multiple places, move it into:

- an app-level wrapper
- a shared variant
- a utility helper only if it is truly about class composition, not domain styling

---

## shadcn/ui Styling Rules

shadcn primitives should conform to the app’s styling system.

### Rules

1. Primitive styling changes should be deliberate and low-level.
2. Use tokens, variants, and wrapper composition before patching features individually.
3. If multiple features need the same styling fix, solve it in a shared layer.
4. Do not fork primitives unnecessarily for domain-specific styling.

### Variant rule

Use variants for real repeated primitive-level differences.
Do not add endless primitive variants to cover every feature-specific styling desire.

### Wrapper rule

If the difference is product-level rather than primitive-level, prefer `components/app` wrappers over bloating primitive variants.

---

## Tables, Forms, and Empty States

These are the three biggest styling drift zones.

### Tables

- standardize header, cell padding, row hover, selected state, empty state, and loading treatment
- domain-specific columns stay in features, table shell styling belongs in `AppTable`

### Forms

- standardize labels, descriptions, errors, field spacing, section spacing, action row layout
- use `AppFormField` and related wrappers

### Empty/error/loading states

- use one consistent visual system
- do not let each feature invent its own spacing, icon treatment, and message layout

---

## Icon Rules

Icons should be used consistently.

### Rules

- use one icon library consistently
- standardize common icon sizes
- icons should align with text/layout predictably
- do not mix many icon sizes/styles in similar contexts
- decorative icons should be sparse

### State icon rule

If empty/error/success/warning states use icons, the styling and size treatment should be consistent through shared wrappers.

---

## Visual Density Rules

Density should be a conscious product choice, not accidental drift.

### Rules

- controls should share one default density
- tables/cards/forms should visually feel related
- if multiple density modes exist, they should be driven by a clear app-level setting and shared wrappers, not one-off tweaks

### Bad density pattern

Bad:

- one page feels airy, another cramped, another oversized with no intentional reason

---

## Override Rules

Overrides are allowed, but they are not free.

### Allowed override cases

- the feature has a real domain-specific need
- the override does not fight the global system
- the override is narrow and understandable
- the override does not indicate a missing shared abstraction that should be added

### Bad override cases

- patching a shared component visually in one feature because the underlying wrapper is weak
- stacking override classes on top of already inconsistent wrappers
- using overrides to avoid fixing the design system properly

---

## Styling Anti-Patterns

These are violations:

- raw hex colors in feature code
- random arbitrary spacing/radius/shadow values
- different card/layout patterns across similar screens
- duplicate toolbar/form/table shells
- product-wide style problems solved in feature-local hacks
- giant unreadable Tailwind class strings repeated across features
- dark mode patched ad hoc screen by screen
- inconsistent focus/hover/disabled treatments
- adding new variants or wrappers when an existing one should be reused

---

## Review Checklist

Before adding or changing styling, check:

- am I using shared tokens instead of raw values?
- does a wrapper already exist for this layout/state pattern?
- am I repeating a class pattern that should move into `components/app`?
- am I introducing a new spacing/radius/shadow behavior without reason?
- is this a feature-local need or a shared system need?
- am I solving a product-wide issue in the wrong layer?
- does this respect responsive and dark mode rules?
- is the interaction state consistent with the rest of the app?

---

## Default Decision Summary

### Use tokens when

- the value is part of the design system
- the value repeats or should remain stable
- the value expresses semantic UI meaning

### Use `components/app` when

- the styling pattern is repeated at the product level
- layout/state treatment needs to stay consistent across features

### Use `components/ui` when

- the concern is primitive-level
- the styling should apply to the primitive layer globally

### Keep styling local to a feature when

- the need is genuinely domain-specific
- the pattern is not reused elsewhere
- the override is narrow and does not indicate a broader system problem

---

## Final Rule

The UI should feel like one product built by one team.

That means:

- same token system
- same spacing rhythm
- same surface language
- same state treatment
- same wrapper patterns
- same interaction language

If styling decisions are happening independently in every feature, the system is already breaking.

