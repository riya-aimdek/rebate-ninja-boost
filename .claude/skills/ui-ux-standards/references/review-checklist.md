# UI/UX review checklist

Run this per page/flow before calling work done. Each line must be ✅ or have a written reason.

## Purpose & linkage
- [ ] Page has one clear job; `h1` names it; `<title>` set (`<Page> · Rebate Ninja`).
- [ ] Reachable from `APP_NAV` (or from its parent list) and breadcrumb leads back.
- [ ] Record names link to detail; KPIs link to the list they summarise; after create/save the user lands somewhere logical with feedback.
- [ ] No dead buttons/links, no fake data presented as real, no duplicated actions.

## Consistency
- [ ] Uses kit components (`Btn`, `Field`, `DataTable`, `Modal`, `StatusPill`, …) — no hand-rolled equivalents.
- [ ] Standard verbs (see ux-writing.md), sentence case, primary action right-most, one primary per region.
- [ ] Semantic colour tokens only (no `bg-blue-500`, `text-amber-700`, `bg-lime-500`).

## Status & feedback
- [ ] Every async action shows loading and ends with toast/inline feedback.
- [ ] Lists have empty, filtered-empty, loading and error states.
- [ ] Unsaved changes are indicated on editable forms.

## Control & error handling
- [ ] Cancel/Back/Esc everywhere; destructive single actions have Undo; bulk/irreversible have `ConfirmDialog`; no `window.confirm/alert`.
- [ ] Inputs constrained (type/min/max/select); inline validation; errors say how to fix; input preserved on error.

## Accessibility
- [ ] Keyboard: everything reachable & operable, logical order, visible focus, Esc closes overlays, focus returns.
- [ ] Labels bound to inputs; icon-only buttons have `aria-label`; tabs/switches/toggles expose state.
- [ ] Status not colour-only; contrast AA; headings in order; tables have `th scope`.

## Layout & responsiveness
- [ ] Spacing on the 8-pt scale; aligned edges; numbers right-aligned & tabular.
- [ ] 360 px: single column, no horizontal page scroll, header actions wrap, tables scroll in card.
- [ ] Touch targets ≥ 40 px.

## Efficiency
- [ ] Enter submits forms; `/` focuses page search; Ctrl/⌘+K works; bulk actions where users act on many rows.
- [ ] Advanced/rarely used options behind progressive disclosure.

## Verify
- [ ] `node node_modules/typescript/bin/tsc --noEmit -p .` passes with no new errors.
