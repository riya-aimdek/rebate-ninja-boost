# Interaction patterns

Use these exact patterns so every module behaves the same.

## Navigation
- **Single source of truth:** `APP_NAV` in `src/components/AppShell.tsx`. Every routed page appears there once. Unbuilt modules are listed only under the collapsed "Coming soon" group, non-interactive.
- **Desktop:** persistent sidebar, collapsible (state remembered). **Mobile/tablet (< lg):** hamburger in top bar opens the same nav in a drawer; closes on route change and Esc.
- **Active state:** brand-highlighted item + `aria-current="page"`; parent section of a detail page is active (`/pricing/products/123` → Products).
- **Breadcrumbs:** on every page below top level: `Section › List › Record`. Each non-last crumb is a link.
- **Command palette:** Ctrl/⌘+K opens "Jump to…" (all nav pages + key actions). The top-bar search field is the palette trigger.
- **Page-level search** filters the current list only, lives in the page header (`ListHeader` / `SearchInput`), `/` focuses it.
- **Back behaviour:** detail → list keeps previous filters (store filters in URL search params when feasible).

## Page headers
- **List page:** `ListHeader` — `h1` + count ("248 products"), search, filter button with active count, actions (primary right-most: "Create …").
- **Detail page:** breadcrumb + `DetailTitle` — name, `StatusPill`, meta subtitle, chips, actions (Edit / More ▾ / primary).
- **Report page:** `ReportShell` — breadcrumb, icon + title + one-line purpose, Export, KPIs, filters (`FilterBar`), results.

## Buttons
| Variant | When |
|---|---|
| `primary` | the single main action of the region (Save, Create, Calculate, Apply) |
| `outline` | important secondary (Export, Preview, Refresh) |
| `subtle` | neutral secondary (Cancel, Back, Clear) |
| `ghost` | tertiary / inline (Show more, Edit in row) |
| `danger` | destructive confirm button inside `ConfirmDialog` only (not on page surface unless the page is about deleting) |
| `dark` | reserved for navy contexts (tab-like actions) |

- Order in a group: `[tertiary] [secondary…] [primary]` — primary right-most. Cancel immediately left of primary.
- Label = verb + object when ambiguous ("Save price list", "Export CSV"). Max 3 words.
- Loading: `<Btn loading>` → spinner, `aria-busy`, disabled, label stays.
- Disabled: only when action is impossible *and* the reason is shown (tooltip or helper text).

## Forms
- Labels above inputs (kit `Field`), always visible; `required` adds `*` and `aria-required`; a "* Required" note at top of long forms.
- Group related fields in `Card`s with `h2` titles; ≤ 2 columns on desktop, 1 on mobile.
- Units inside or next to input (£ prefix, % suffix). Numbers right-aligned in tables, left in inputs.
- Validate on blur + on submit; on submit failure focus first invalid field and show `ErrorBanner` summary when > 2 errors.
- Long forms: sticky footer with Cancel + Save, and an "Unsaved changes" indicator. Warn on navigation away with unsaved changes.
- Read-only computed values look different from inputs (no border, `bg-muted`, lock icon + "Calculated" hint).

## Tables (`DataTable`)
- Navy header, `scope="col"`; numeric columns right-aligned + `tabular-nums`.
- Record name column is a `RecordLink` (keyboard reachable) — row click is an enhancement, not the only path.
- Empty: `EmptyState` with explanation + next action ("No price lists yet — Create price list"). Filtered-empty: "No results for “x”" + "Clear filters".
- Loading: 5 `Skeleton` rows. Pagination or "Showing 1–25 of 248" footer for long lists.
- Bulk selection: checkbox column + sticky bulk-action bar showing "3 selected · Clear".
- Table wrapper scrolls horizontally inside its card on small screens.

## Feedback & system status
| Situation | Pattern |
|---|---|
| Save/create/update success | `toast.success("<Object> saved")` — past tense, object named |
| Delete/archive/remove | `notifyUndo("<Object> deleted", undoFn)` — toast with **Undo** action, 6 s |
| Background job started | `toast("Repricing run started", { description: "You'll be notified when it completes" })` + status pill in list |
| Server/business error | `ErrorBanner` (page) or `toast.error` with cause + fix; keep input |
| Field error | inline under field via `Field error=` |
| Long load | `Skeleton` (layout-shaped), never blank |
| Calculation result changed | brief highlight or "Updated just now" + `role="status"` |

Only **one** toaster exists (root layout). Don't build custom toast divs.

## Confirmation vs undo
- **Undo** (preferred): reversible single actions — delete row, remove filter, archive, dismiss.
- **ConfirmDialog**: irreversible, bulk (> 1 record), financial publish/approve, overwrite. Title = question with object ("Publish 'Q4 Trade' price list?"), body = consequence + count, confirm button = specific verb ("Publish", "Delete 12 rules"), danger tone for destructive, Cancel focused by default for destructive.
- Never use `window.confirm` / `window.alert`.

## Modals & drawers
- `Modal` for short focused tasks (≤ 6 fields) or confirmations; `Drawer` for record previews / longer side tasks keeping list context.
- Header: title + optional subtitle + close (X). Footer: Cancel + primary. Esc and backdrop close (backdrop disabled when form is dirty).
- Focus moves into dialog on open, trapped, restored on close.

## Tabs & segmented controls
- `PillTabs` for switching views of the same object (full keyboard: ←/→/Home/End). Show counts when meaningful.
- `Segmented` for quick filters (`aria-pressed`).
- Don't use tabs for sequential steps — use `Stepper` + Back/Next.

## Empty, loading, error states — every data region needs all three
- **Empty (first use):** icon, what this is, why empty, primary action.
- **Loading:** skeleton matching final layout.
- **Error:** message + Retry button.

## Responsive
| Breakpoint | Behaviour |
|---|---|
| < 640 (mobile) | single column, sidebar in drawer, header actions wrap below title, KPI grid 1–2 col, tables scroll |
| 640–1023 (tablet) | 2-col grids, sidebar in drawer |
| ≥ 1024 (desktop) | persistent sidebar, 3–4 col KPI grid |
| ≥ 1440 | content max-width 1600, centred |

- Test 360, 768, 1280, 1600 widths. No fixed widths > viewport (`min-w-[…]` only inside scrolling containers).
- Sticky bottom bars must not cover content (add matching bottom padding).
