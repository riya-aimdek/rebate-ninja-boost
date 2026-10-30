# Accessibility — WCAG 2.1 AA checklist (applied to this stack)

## Perceivable
- **Text alternatives (1.1.1):** decorative icons `aria-hidden`; icon-only buttons need `aria-label` ("Close", "Remove filter: Region North", "Export CSV"). Charts get a text summary or accessible table nearby.
- **Info & relationships (1.3.1):** real semantics — `h1`→`h2`→`h3` without skipping; `<table>` with `<th scope="col">`; `<label htmlFor>` bound to inputs (kit `Field` does this automatically); lists as `ul/ol`; landmarks `header`, `nav aria-label`, `main id="main-content"`, `aside`.
- **Use of colour (1.4.1):** never colour-only status — text/icon too.
- **Contrast (1.4.3 / 1.4.11):** body text ≥ 4.5:1; large text (≥ 18.66 px bold / 24 px) and UI borders/focus rings ≥ 3:1. `text-muted-foreground` is the lightest allowed text colour; never `text-muted-foreground/60` for meaningful text. White text on `brand` orange: use `font-semibold` ≥ 14 px.
- **Reflow & resize (1.4.4 / 1.4.10):** works at 320 px CSS width and 200 % zoom; no horizontal page scroll (tables scroll inside their container with `overflow-x-auto` and a `tabIndex={0}` + `aria-label` region).
- **Non-text content / motion:** honour `prefers-reduced-motion`.

## Operable
- **Keyboard (2.1.1):** everything clickable is a `<button>` or `<a>` (never `div onClick`). Clickable table rows must also have a focusable link/button in the row (kit `RecordLink`) or `tabIndex={0}` + Enter/Space handler.
- **No keyboard trap (2.1.2):** modals trap focus *inside* while open and return focus to the trigger on close (kit `Modal`/`Drawer`/`ConfirmDialog` do this). Esc always closes.
- **Shortcuts (2.1.4):** single-key shortcuts (`/`, `?`) only fire when focus is not in an input/textarea/contenteditable.
- **Skip link (2.4.1):** "Skip to main content" is the first focusable element (root layout).
- **Page titled (2.4.2):** each route sets `head: () => ({ meta: [{ title: "<Page> · Rebate Ninja" }] })`.
- **Focus order & visible (2.4.3 / 2.4.7):** DOM order = visual order; global `:focus-visible` ring (brand, 2 px, offset 2) — never `outline-none` without a replacement ring.
- **Link purpose (2.4.4):** "View list" links include context via `aria-label` ("View all pending approvals").
- **Target size:** ≥ 40×40 px (aim 44 px on touch-first controls).
- **Current location:** active nav link has `aria-current="page"`; breadcrumb last item `aria-current="page"`.

## Understandable
- **Language (3.1.1):** `<html lang="en">`.
- **Predictable (3.2):** no context change on focus or on select change alone (except obvious filters); navigation identical across pages.
- **Input assistance (3.3):** labels + required marker `*` with legend "* required"; errors identified in text, linked with `aria-describedby`, field has `aria-invalid="true"`; suggestions for fixing; confirm/review step for financial or bulk changes (3.3.4).

## Robust
- **Name, role, value (4.1.2):** custom controls expose role & state — tabs `role="tablist/tab"` + `aria-selected` + `aria-controls` + arrow-key navigation; toggles `role="switch"` + `aria-checked`; segmented filters `aria-pressed`; disclosure buttons `aria-expanded` + `aria-controls`; dialogs `role="dialog" aria-modal="true" aria-labelledby`.
- **Status messages (4.1.3):** toasts (sonner) are live regions; inline async results use `role="status"` (polite) or `role="alert"` (errors).

## Screen-reader quick test
1. Tab from top: skip link → sidebar → top bar → page. Every stop announced with a sensible name.
2. Open/close each dialog: focus moves in, Esc closes, focus returns.
3. Submit an invalid form: error announced, focus moves to first invalid field.
4. Trigger a save: toast announced.
