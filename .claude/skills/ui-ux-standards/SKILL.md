---
name: ui-ux-standards
description: Rebate Ninja UI/UX design standards — consistency, WCAG 2.1 AA accessibility, system-status feedback, user control (undo/cancel), error prevention, 8-pt visual hierarchy, keyboard accelerators, navigation, responsive layout and minimalism, grounded in NN/g heuristics, Material Design and Apple HIG. Use BEFORE building or changing any screen, component, flow, form, table, modal, toast, copy or navigation in this app, and when asked to review/audit UI, "make it consistent", "fix UX", "improve accessibility" or "apply design standards".
---

# Rebate Ninja — UI/UX Design Standards

Every element on screen must earn its place: it has a **purpose**, a **predictable behaviour**,
and a **link to the rest of the flow** (where it came from, where it leads, what changed).
If you cannot answer "why is this here, what happens when I use it, how do I get back?" — remove or fix it.

## How to use this skill

1. Read this file fully (it is the contract).
2. Open the reference that matches the task:
   | Task | Read |
   |---|---|
   | Any UI work — the 10 heuristics mapped to concrete rules | [references/heuristics.md](references/heuristics.md) |
   | Colour, type, spacing, tokens, layout grid | [references/visual-system.md](references/visual-system.md) |
   | Keyboard, screen reader, contrast, focus, ARIA | [references/accessibility.md](references/accessibility.md) |
   | Forms, tables, modals, toasts, empty/loading/error states, navigation | [references/patterns.md](references/patterns.md) |
   | Labels, buttons, errors, confirmations, empty states copy | [references/ux-writing.md](references/ux-writing.md) |
   | Before you finish / when reviewing | [references/review-checklist.md](references/review-checklist.md) |
3. **Reuse the shared kit — never hand-roll** a button, field, modal, table, pill or banner
   that already exists. Shared building blocks live in:
   - `src/components/AppShell.tsx` — `AppLayout`, `Sidebar`, `TopBar`, unified `APP_NAV`, command palette (Ctrl/⌘+K), shortcuts help (`?`), mobile nav drawer, skip link target `#main-content`.
   - `src/components/pricing/kit.tsx` — `Btn`, `LinkBtn`, `Field`, `inputCls`, `SearchInput`, `ListHeader`, `DetailTitle`, `PillTabs`, `Segmented`, `Card`, `DetailGrid`, `KpiTile`, `StatusPill`, `Tag`, `Flag`, `DataTable`, `RecordLink`, `Modal`, `Drawer`, `ConfirmDialog`, `ErrorBanner`, `InfoBanner`, `EmptyState`, `Skeleton`, `Stepper`, `ProgressBar`, `Toggle`, `money`, `Price`, `pct`, `notifySuccess` / `notifyUndo`.
   - `src/components/ReportShell.tsx` — report page frame (`ReportShell`, `FilterBar`, `Field`).
   - `src/components/ui/*` — shadcn/Radix primitives (Select, Popover, Tooltip, Command, etc.).
4. Run the review checklist before declaring done. Type-check: `node node_modules/typescript/bin/tsc --noEmit -p .`

## The 12 non-negotiables

1. **One pattern per job.** Same action → same word, same icon, same position, same colour on every page.
   Primary action is always the right-most button in a footer/header group and is `variant="primary"` (brand orange). Only **one** primary per view region.
2. **No dead controls.** Every button/link does something real. Unbuilt features are hidden or shown
   disabled with a visible reason ("Coming soon"), never a clickable no-op.
3. **Always show status.** Any action > 300 ms shows progress (spinner in button + disabled, skeleton, or progress bar).
   Every completed mutation gets feedback (toast or inline). Live/synced data shows "as of" time.
4. **Every destructive or bulk action is reversible or confirmed.** Prefer **undo toast** (5–8 s) for
   single-item deletes/archives; use `ConfirmDialog` naming the object and consequence for irreversible / bulk / publish actions.
   Every modal, drawer, wizard and edit mode has Cancel + Esc + a way back.
5. **Prevent errors first.** Constrain inputs (type, min/max, select over free text), give defaults,
   validate inline on blur, disable submit only while invalid **and** say why. Errors say what happened + how to fix, next to the field.
6. **Accessible by default (WCAG 2.1 AA).** Text contrast ≥ 4.5:1 (3:1 large/UI), visible focus ring,
   full keyboard operation, labels bound to inputs, icon-only buttons have `aria-label`, status never by colour alone, `prefers-reduced-motion` respected.
7. **8-point grid.** Spacing uses Tailwind steps that land on 4/8 px multiples (`1,2,3,4,6,8,10,12`). No arbitrary `px` margins.
8. **Clear hierarchy.** One `h1` per page, sections `h2`, cards `h2/h3`. Most important number/action largest and top-left of its region. Max 3 type weights per view.
9. **Familiar navigation.** Persistent sidebar (desktop) / drawer (mobile), breadcrumbs on every page deeper than level 1, active item highlighted, browser Back always works (state lives in URL where it matters).
10. **Accelerators for experts, invisible for novices.** Ctrl/⌘+K command palette, `/` focuses page search, `?` shows shortcuts, Enter submits forms, Esc closes overlays. Shortcuts are listed in the help dialog and in tooltips/`aria-keyshortcuts`.
11. **Responsive 360 px → 1600 px.** No horizontal page scroll; wide tables scroll inside their card; touch targets ≥ 40 px (44 px on touch-primary controls); multi-column layouts collapse to one column under `md`.
12. **Minimalist + progressive disclosure.** Show what is needed for the current decision; advanced options go behind "Advanced", tabs, accordions or drawers. Remove decorative noise, duplicate actions, and fake data (e.g. hard-coded "99+" badges).

## Industry frameworks this skill encodes

- **NN/g 10 Usability Heuristics** — primary lens; each mapped to rules in `references/heuristics.md`.
- **Google Material Design 3** — elevation, state layers (hover/focus/pressed/disabled), snackbar (toast) with single action, 8 dp grid, responsive breakpoints.
- **Apple HIG** — clarity/deference/depth, 44 pt touch targets, Dynamic Type friendliness (rem units), concise copy, destructive actions in red and never default.
- **WCAG 2.1 AA** — perceivable, operable, understandable, robust.

## Linking rule (relatable & connected UI)

Every screen answers three questions visibly:
- **Where am I?** → page `h1` + breadcrumb + active nav item + document `<title>`.
- **What can I do here?** → one primary action, secondary actions grouped, contextual help hints.
- **Where does this lead / come from?** → record names link to their detail page (`RecordLink`), KPIs link to the filtered list they summarise, detail pages link back to parent list, after create/save land on the created record or return to origin with a toast.
