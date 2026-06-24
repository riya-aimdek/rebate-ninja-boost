
This is a large restructure of the calculator (`src/routes/index.tsx`). I'll do it in scoped phases so each phase is verifiable. All changes are UI/presentation + calculation-formula updates — no backend.

## Phase 1 — Header & toolbar cleanup
- Rename header "Import" button → "Upload Excel" (same icon/position/handler).
- Remove the older action toolbar row (Upload Excel / Template / Reset / Export CSV / Print / Recalculate) if still rendered; header buttons (Save · Saved · Upload Excel · Calculate) become the only action surface.

## Phase 2 — Account selector with sub-account group
- Add accounts: AWEBB, ANEW, Edmundson, CEF, YESSS, FEGIME, LEW, Huws Gray (Rexel), Crossfold, Jewsons (matches modelling workbook).
- Under the selected account name show sub-label e.g. "Includes AWEBB/YESSS combined EW".
- Add tab toggle inside selector: "AWEBB only" | "AWEBB including YESSS"; toggling swaps baseline figures.

## Phase 3 — Rebate Rate Configuration (replaces "Global EW Configuration")
New grouped sections inside one card:
- **EW**: Fixed EW %, Target EW %, Target Turnover Threshold £
- **NBU + SOC**: NBU Rebate %, SOC Rebate %
- **MVHR**: MVHR Rebate % (+ helper "Applied to MVHR product lines only…")
- **Marketing**: Marketing Rebate % (+ helper)
- **Settlement**: Settlement Discount £ per period (+ helper)

## Phase 4 — Baseline Financial Inputs (EW split)
EW card adds:
- Total EW Turnover (locked), Total EW Cost (locked)
- Of which MVHR Turnover (locked, helper "MVHR rebate applies to this portion only")
- Of which Other EW Turnover (auto = Total EW − MVHR, read-only)
SOC and NBU unchanged.

## Phase 5 — Growth Scenario table rows
- Rename "National Growth Rebate %" → "National Growth Rate %" (helper "Applied only if Turnover ≥ Target Turnover").
- New row: **Target EW Turnover Threshold £** (editable per scenario, Actual from prior year).
- New row: **Regional Growth Rate %** (helper about regional tier; default 0).
- New row: **Marketing Rebate %** (default from Global config).
- Rename "MVHR Rebate (£)" → **MVHR Rebate %** (% input; helper).
- Keep: Growth %, Branch Growth Rebate % (+ helper "Applied per qualifying branch…"), Settlement Discount (£), Layer scope, Sale type.

## Phase 6 — Results tables
EW results row order:
1. Turnover  2. *Of which MVHR Turnover* (muted/indented)  3. Cost
4. Fixed EW Rebate  5. Target EW Rebate (amber "Threshold not met" when £0)
6. National Growth Rebate (+ Qualification ✓/✗ sub-row)
7. Regional Growth Rebate (hidden when 0)  8. Branch Growth Incentive (tooltip: "Sum of payments from all branches…")
9. Marketing Rebate  10. MVHR Rebate (= MVHR Turnover × MVHR %)
11. Settlement Discount  — divider — **Total Rebate** (orange) — divider — **Gross Profit** (green), **GP %** (green).

SOC / NBU tables:
Turnover, Cost, SOC/NBU Rebate, Settlement Discount (proportional) → Total Rebate (orange) → GP (green), GP % (green).

Summary table: insert Settlement Discount row above Total Rebate.

## Phase 7 — Calculation formulas
Update formulas + footnote text:
```
Projected Turnover = Prior-Year Turnover × (1 + Growth %)
GP (£) = Turnover − Cost + Total Rebate + Settlement Discount
GP % = GP (£) ÷ Turnover
MVHR Rebate = MVHR Turnover × MVHR Rate (not on full EW)
National Growth Rebate: retrospective — if growth ≥ threshold then Rate × full Turnover, else £0
Models isolated per account.
```

## Phase 8 — Variance Analysis Column A
Pre-populate AWEBB 2025 actuals from the brief (EW £1,194,312 / cost £597,834; SOC £4,098,722 / £1,591,683; NBU £357,780 / £203,516; Fixed EW £59,716; Target EW £59,716; Nat Growth £11,943; Settlement £29,858; Total Rebate £384,057; Net GP £2,873,724; GP% 50.9%). Values pulled from same baseline source so they match.

## Preserved (no change)
National/Regional/Branch tabs, Sage synced + Live badges, Save (0/5) flow, Scenario/Variance tabs, type chips, threshold labels, best-scenario green accent, footnote presence, Export Proposal/Print, sticky bottom bar, left sidebar, design tokens.

## Technical notes
- All work confined to `src/routes/index.tsx` (plus possibly small data file `src/routes/index-data.ts` for baseline constants if needed for clarity).
- Baseline numbers (per account) stored as a typed constant map so the AWEBB / AWEBB+YESSS toggle and Variance Column A read the same source — guarantees consistency.
- No new dependencies. TypeScript stays clean; will run `bunx tsgo --noEmit` after each phase.
- I will NOT parse the uploaded XLSX into the app at runtime — those are reference/source-of-truth for the numbers I hardcode into the baseline data map.

Confirm to proceed and I'll implement all phases.
