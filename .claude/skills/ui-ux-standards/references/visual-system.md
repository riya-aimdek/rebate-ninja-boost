# Visual system — tokens, type, spacing, layout

All values come from `src/styles.css` tokens. **Never** use raw Tailwind palette colours
(`bg-blue-500`, `text-amber-600`, `bg-lime-500`, `from-amber-500`) — use semantic tokens so meaning stays consistent.

## Colour tokens & meaning

| Token | Use for | Never use for |
|---|---|---|
| `brand` (vivid orange) | non-text marks only: active-nav bar, focus ring, icons, progress fill, dots, accent stripes (3.1:1 — fails for text) | any text, fills behind text |
| `brand-strong` / `primary` (deep orange) | brand-coloured text & links (`text-brand-strong`), primary button fill with white text (`bg-brand-strong` / `bg-primary`) | errors, large background fills |
| `brand-soft` | selected row, chip, hover on outline button | text |
| `navy` | table headers, active pill tab, sidebar | body text blocks |
| `success` / `success-soft` | completed, approved, positive delta, GP / profit | decoration |
| `warning` / `warning-soft` (text: `text-warning-foreground`) | pending, at-risk, threshold not met | errors |
| `destructive` / `danger-soft` | errors, destructive buttons, blocked | warnings |
| `info` / `info-soft` | neutral notices, running/queued | success |
| `muted` / `muted-foreground` | secondary text, helper text, disabled | primary content |
| `foreground` on `background`/`card` | body text | — |

Rules:
- Status is **never** colour-only: pair with text and/or icon (`StatusPill` has a dot + label; `Flag` has icon).
- Positive/negative numbers: colour **and** sign (`+3.2%`, `−£1,240`).
- Only one accent (brand) per region for emphasis; data colours stay semantic.

## Typography (Inter)

| Role | Class | Element |
|---|---|---|
| Page title | `text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-[1.2]` | `h1` (exactly one per page) |
| Section / card title | `text-xl lg:text-2xl font-semibold tracking-tight leading-[1.2]` | `h2` |
| Sub-section | `text-lg lg:text-xl font-semibold leading-[1.2]` | `h3` |
| Subtitle / lead | `text-base lg:text-lg text-muted-foreground` | page/section intro |
| Body | `text-base leading-normal` (16 px / 24 px) | `p` |
| Form inputs, selects, textareas | `text-base` (16 px — never smaller, prevents mobile zoom) | `input`, `select` |
| Buttons | `text-sm sm:text-base font-semibold` | `button` |
| Dense table cells | `text-sm` (14 px) | `td` |
| Helper / meta / captions | `text-xs text-muted-foreground` (12 px) | hints, timestamps, footnotes |
| Overline label | `text-xs font-semibold uppercase tracking-wide text-muted-foreground` | field labels, KPI labels |
| Numbers | add `tabular-nums`; right-align in tables | money, %, counts |

- Full desktop/mobile scale and rules: see **Typography** in `SKILL.md` (it wins on any conflict).
- Max **3 weights** per view (400/600/700), max **2 typefaces** (Inter + monospace for codes). No text below 12 px. Text fills its container — never cap with `max-w-prose`/`max-w-2xl`/`max-w-3xl` (only centred `mx-auto` blocks).
- Line height: body 1.5× (`leading-normal`), headings 1.2× (`leading-[1.2]`).
- Use rem-based Tailwind sizes so browser zoom/Dynamic Type scales to 200 %.

## Spacing — 8-point grid

Tailwind step × 4 px. Allowed steps: `0.5 (2) 1 (4) 1.5 (6, icon gaps only) 2 (8) 3 (12) 4 (16) 5 (20) 6 (24) 8 (32) 10 (40) 12 (48) 16 (64)`.

| Context | Spacing |
|---|---|
| Icon ↔ label inside button | `gap-2` |
| Field label ↔ input | `gap-1.5` |
| Between fields in a form | `gap-4` (row) / `gap-x-6 gap-y-4` (grid) |
| Card padding | `p-5`/`p-6` |
| Between cards / sections | `gap-6` / `mb-6` |
| Page gutter | `px-4 sm:px-6 lg:px-8`, `py-6` |

Avoid arbitrary values (`mt-[13px]`, `py-[7px]`). Exception: fixed shell heights (`h-[72px]` top bar).

## Sizing & shape

- Controls height: `h-10` (default), `h-8` (sm, dense tables), `h-11/h-12` (lg / touch-primary). All interactive targets ≥ 40×40 px; icon buttons `size-10` min (`size-9` only in dense table rows with ≥ 8 px spacing).
- Radius: inputs/buttons `rounded-lg`, cards `rounded-xl`, pills `rounded-full`, modals `rounded-xl`.
- Elevation (Material): card `shadow-sm`, dropdown/popover `shadow-lg`, modal `shadow-2xl`. Don't stack shadows.

## Layout

- Shell: sidebar (desktop ≥ lg) + sticky top bar (72 px) + `main#main-content` max `1600px` centered.
- Page anatomy top→bottom: breadcrumb → page header (`h1`, context, primary action right) → filters/tabs → KPIs (max 4 per row) → content cards → sticky action bar (only for long editable forms).
- Grid: `grid gap-6 md:grid-cols-2 xl:grid-cols-3/4`. Under `md` everything is single column.
- Align numbers right, text left, status/actions center or right consistently per table.
- Important info top-left (F-pattern). Primary CTA top-right of page header **or** bottom-right of form — not both unless the form is very long (then sticky footer).

## Motion

- Duration 150–250 ms, `ease-out` for enter, `ease-in` for exit. Only animate opacity/transform.
- Respect `prefers-reduced-motion` (global rule in `styles.css` disables animations).
- No motion that conveys info alone.
