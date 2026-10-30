# NN/g 10 Heuristics → concrete Rebate Ninja rules

Each heuristic lists **Do**, **Don't**, and the **kit component** that implements it.

## 1. Visibility of system status
- **Do:** spinner + disabled state inside the button that started the action (`<Btn loading>`); skeleton rows (`Skeleton`) while lists load; `ProgressBar` / `Stepper` for multi-step jobs; toast on completion (`toast.success("Price list saved")`); "Data as of HH:mm" on synced data (`DataAsOf`); unsaved-changes indicator ("Unsaved changes" pill) on editable forms; counts next to tabs/filters.
- **Don't:** silent saves, fake counters, spinners with no label, progress bars that never complete.

## 2. Match between system and the real world
- **Do:** use the business's own vocabulary (Turnover, Rebate, Accrual, Settlement Discount, Price List, Guardrail); currency always with symbol and 2 dp (`money`, `Price`); dates `dd MMM yyyy` (en-GB); percentages with `%` and sign for deltas (`pct`); sort/order lists in the natural order users expect (newest first for logs, A–Z for master data).
- **Don't:** expose enum keys (`PENDING_APPROVAL`) — run through `humanize` / `StatusPill`; developer jargon (UUID, payload, null) in UI.

## 3. User control and freedom
- **Do:** Cancel next to every Save; Esc closes modals/drawers/palette; undo toast for delete/archive/remove (`notifyUndo`); wizards have Back; edit mode has "Discard changes"; filters have "Clear all"; breadcrumbs to parent; leaving a dirty form asks to confirm.
- **Don't:** trap users in modals without a close button; auto-advance without a way back; destructive action as default focused button.

## 4. Consistency and standards
- **Do:** same verb for same action across app — *Create* (new record), *Save* (persist edits), *Cancel* (discard & close), *Delete* (permanent), *Archive* (reversible), *Export* (download file), *Apply* (filters), *Clear* (reset filters), *Back*. Same icon set (lucide). Primary button right-most. Tables use `DataTable` (navy header). Status uses `StatusPill` colour map. Page header uses `ListHeader` (lists) / `DetailTitle` (details) / `ReportShell` (reports).
- **Don't:** "Add" on one page and "New" on another for the same thing; mixed button heights in one row; custom one-off colours (`bg-blue-500`) instead of tokens.

## 5. Error prevention
- **Do:** typed inputs (`type="number"`, `inputMode="decimal"`, `min`, `max`, `step`); selects/radios over free text where values are finite; sensible defaults; inline validation on blur; confirm before bulk/irreversible actions with a summary of impact ("Update 248 prices by +3.5%"); preview before publish (diff/before-after); disable impossible options with a tooltip explaining why.
- **Don't:** validate only on submit; allow negative prices/percent > 100 where invalid; let users submit an empty required form without saying which fields.

## 6. Recognition rather than recall
- **Do:** visible labels (never placeholder-only); show selected filters as chips (`FilterChip`); show current account/context in header; recently used / saved views; tooltips (`title` + `aria-describedby` or Radix Tooltip) for abbreviations (GP, EW, SOC, NBU, MVHR); show units next to inputs (`£`, `%`).
- **Don't:** require users to remember IDs from another page; hide current state inside a menu.

## 7. Flexibility and efficiency of use
- **Do:** Ctrl/⌘+K command palette for jumping to any page; `/` to focus page search; `?` for shortcut help; Enter submits, Esc cancels; bulk select + bulk actions on tables; saved views; keyboard-reachable everything; remember last used tab/filter where helpful.
- **Don't:** require mouse-only interactions (drag only, hover-only menus).

## 8. Aesthetic and minimalist design
- **Do:** one primary action per region; group secondary actions in a "More" menu when > 3; progressive disclosure (Advanced sections, tabs, drawers); white space on the 8-pt grid; limit accent colour to actionable or key-metric elements.
- **Don't:** duplicate the same action in toolbar and header; decorative gradients that compete with data; placeholder/mock data shown as real (e.g. "99+" notifications).

## 9. Help users recognise, diagnose, and recover from errors
- **Do:** plain-language message + cause + fix ("Margin is below the 12% guardrail. Raise the price to at least £14.20 or request an override."); field-level error under the field with `aria-invalid` + `aria-describedby`; page-level `ErrorBanner` with `role="alert"` for server/business errors; keep user input after an error; offer Retry.
- **Don't:** "Something went wrong" alone; error codes without explanation; clearing the form after failure.

## 10. Help and documentation
- **Do:** inline hints under complex fields (`Field hint=`); info icons with tooltip for domain terms; empty states that explain what the page is for and give the first action; shortcut help dialog (`?`); formula footnotes on calculators.
- **Don't:** long instruction paragraphs above forms; help that lives only in external docs.
