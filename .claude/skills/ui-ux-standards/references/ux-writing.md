# UX writing rules

## Voice
Clear, specific, calm, British English (en-GB): "organisation", "colour" in prose; keep domain terms as the business uses them.
Sentence case everywhere (buttons, titles, labels, tabs) — "Create price list", not "Create Price List". Proper nouns and acronyms keep their case (EW, SOC, NBU, MVHR, GP).

## Standard verbs (use exactly these)
| Verb | Meaning |
|---|---|
| Create | make a new record |
| Save | persist edits to an existing/new record |
| Cancel | discard changes and close/leave |
| Delete | permanent removal (confirm or undo) |
| Archive / Restore | reversible hide/unhide |
| Edit | enter edit mode |
| Export | download a file (say format: "Export CSV") |
| Import / Upload | bring a file in ("Upload Excel") |
| Apply / Clear | filters |
| Calculate / Recalculate | run a model |
| Approve / Reject / Submit for approval | workflow |
| Back / Next / Finish | wizards |

Don't mix synonyms (Add/New/Create; Remove/Delete; Close/Dismiss/Cancel) for the same action.

## Messages
- **Success toast:** `<Object> <past-tense verb>` — "Price list saved", "3 rules deleted". Optional description with what's next.
- **Error:** what happened + why (if known) + how to fix. "Couldn't save the price list. The effective date overlaps 'Q3 Trade'. Choose a date after 30 Sep 2026."
- **Field error:** state the rule, not the blame. "Enter a percentage between 0 and 100" (not "Invalid input").
- **Empty state:** title = what's missing ("No saved views yet"), body = why/benefit, CTA = first action.
- **Confirmation:** title is the question with the object; body states consequence; buttons are verbs ("Delete rule" / "Cancel"), never "Yes/No/OK".
- **Loading:** "Loading products…", "Calculating scenarios…" (ellipsis character `…`).

## Labels & helpers
- Labels are nouns (≤ 4 words), no colon. Units in label or adornment: "Target turnover (£)".
- Placeholders show format examples only ("e.g. 12.5"), never replace labels.
- Helper text explains impact: "Applied only if turnover ≥ target threshold".
- Abbreviations: expand on first use or in tooltip ("GP — gross profit").

## Numbers & dates
- Currency `£1,234.56` (kit `money`); large KPIs may compact (`£1.2m`) with full value in tooltip.
- Percent `12.5%`; deltas signed `+3.2%` / `−1.1%`.
- Dates `29 Oct 2026`; date-time `29 Oct 2026, 14:15`; relative time for recent activity ("5 min ago") with absolute in `title`.
