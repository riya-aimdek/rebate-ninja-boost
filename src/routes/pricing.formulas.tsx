import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { CheckCircle2, ChevronDown, FlaskConical, Plus, RefreshCw, Save, Trash2, Undo2, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorBanner,
  Field,
  Flag,
  InfoBanner,
  ListHeader,
  PricingLayout,
  StatusPill,
  Tag,
  humanize,
  inputCls,
  money,
  notifyUndo,
  type ApiError,
} from "@/components/pricing/kit";
import { FORMULAS, FORMULA_RECALC_LOG, FORMULA_SOURCE_TYPES, RECALC_TRIGGERS, ROUNDING_MODES, type Formula, type FormulaVar } from "@/lib/pricing/data";
import { applyRounding, divideByZeroRisks, evaluate, FormulaError, parse, toText, topTerms, variablesUsed } from "@/lib/pricing/formula";

export const Route = createFileRoute("/pricing/formulas")({
  head: () => ({ meta: [{ title: "Formula pricing · Rebate Ninja" }] }),
  component: Page,
});

const CURRENCY_UNITS = ["GBP", "USD", "EUR", "INR"];
const EXAMPLE = "CommodityIndex + Freight + MAX(ProcessingCost, 0.5) * 1.1";

type TestResult = { ok: boolean; terms: Array<{ label: string; sign: string; value: number }>; raw: number; final: number; capped: boolean; floored?: boolean; error?: string };
type RecalcEntry = (typeof FORMULA_RECALC_LOG)[number];

function blankFormula(): Formula {
  return {
    id: `F-${String(FORMULAS.length + 1).padStart(2, "0")}`,
    name: "",
    expression: "",
    variables: [],
    rounding: { decimals: 2, mode: "NEAREST" },
    trigger: "ON_INPUT_CHANGE",
    status: "DRAFT",
    testsPassed: 0,
    currency: "GBP",
    affectedLines: 0,
    lastUpdated: "2026-10-29 14:15",
  };
}

/** Variables of source type PRICE_LIST whose source starts with "Formula F-xx" depend on that formula. */
function deps(f: Formula): string[] {
  return f.variables.filter((v) => v.sourceType === "PRICE_LIST" && /^Formula F-\d+/.test(v.source)).map((v) => v.source.match(/F-\d+/)![0]);
}

function hasCycle(all: Formula[], start: string): boolean {
  const map = new Map(all.map((f) => [f.id, deps(f)]));
  const seen = new Set<string>();
  const walk = (id: string): boolean => {
    for (const d of map.get(id) ?? []) {
      if (d === start) return true;
      if (!seen.has(d)) {
        seen.add(d);
        if (walk(d)) return true;
      }
    }
    return false;
  };
  return walk(start);
}

function Page() {
  const [formulas, setFormulas] = useState<Formula[]>(FORMULAS);
  const [selectedId, setSelectedId] = useState<string>(FORMULAS[0].id);
  const [draft, setDraft] = useState<Formula>(structuredClone(FORMULAS[0]));
  const [error, setError] = useState<ApiError | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [samples, setSamples] = useState<Record<string, number>>(Object.fromEntries(FORMULAS[0].variables.map((v) => [v.name, v.sample])));
  const [test, setTest] = useState<TestResult | null>(null);
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [exprTouched, setExprTouched] = useState(false);
  const [busy, setBusy] = useState<"save" | "activate" | "test" | null>(null);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [confirmSwitch, setConfirmSwitch] = useState<Formula | "new" | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [recalcLog, setRecalcLog] = useState<RecalcEntry[]>(FORMULA_RECALC_LOG);
  const [recalculating, setRecalculating] = useState(false);

  const savedVersion = formulas.find((f) => f.id === draft.id);
  const dirty = savedVersion ? JSON.stringify({ ...savedVersion, testsPassed: 0 }) !== JSON.stringify({ ...draft, testsPassed: 0 }) : draft.name !== "" || draft.expression !== "" || draft.variables.length > 0;

  const load = (f: Formula) => {
    setSelectedId(f.id);
    setDraft(structuredClone(f));
    setSamples(Object.fromEntries(f.variables.map((v) => [v.name, v.sample])));
    setTest(null);
    setError(null);
    setIssues([]);
    setSubmitted(false);
    setExprTouched(false);
  };

  const loadNew = () => {
    const f = blankFormula();
    setSelectedId(f.id);
    setDraft(f);
    setSamples({});
    setTest(null);
    setError(null);
    setIssues([]);
    setSubmitted(false);
    setExprTouched(false);
  };

  // Switching away from unsaved edits asks first (user control).
  const select = (f: Formula) => (dirty && f.id !== draft.id ? setConfirmSwitch(f) : load(f));
  const newFormula = () => (dirty ? setConfirmSwitch("new") : loadNew());

  // Any change to the variables invalidates earlier test runs (US-ST-04 AC#7).
  const updateVar = (i: number, patch: Partial<FormulaVar>) =>
    setDraft((d) => ({ ...d, testsPassed: 0, variables: d.variables.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));

  const removeVar = (i: number) => {
    const before = draft.variables;
    const name = before[i]?.name || `variable ${i + 1}`;
    setDraft((d) => ({ ...d, testsPassed: 0, variables: d.variables.filter((_, j) => j !== i) }));
    notifyUndo(`${name} removed`, () => setDraft((d) => ({ ...d, variables: before })));
  };

  /** True when the expression or variables differ from the saved version — the parts a test covers. */
  const logicChanged = !savedVersion || savedVersion.expression !== draft.expression || JSON.stringify(savedVersion.variables) !== JSON.stringify(draft.variables);

  /** Live syntax check — shown inline under the expression with an example of valid syntax. */
  const syntaxError = useMemo(() => {
    if (!draft.expression.trim()) return null;
    try {
      parse(draft.expression);
      return null;
    } catch (e) {
      return (e as FormulaError).message;
    }
  }, [draft.expression]);

  const fieldErrs: Record<string, string> = {};
  if (!draft.name.trim()) fieldErrs["formula-name"] = "Enter a formula name, e.g. Commodity pricing.";
  if (!draft.expression.trim()) fieldErrs["formula-expression"] = `Enter an expression, e.g. ${EXAMPLE}.`;
  else if (syntaxError) fieldErrs["formula-expression"] = `${syntaxError} Example: ${EXAMPLE}`;
  if (!Number.isInteger(draft.rounding.decimals) || draft.rounding.decimals < 0 || draft.rounding.decimals > 6) fieldErrs["formula-decimals"] = "Enter whole decimals between 0 and 6.";
  if (draft.minResult !== undefined && draft.minResult < 0) fieldErrs["formula-min"] = "The minimum price can't be negative.";
  if (draft.maxResult !== undefined && draft.maxResult < 0) fieldErrs["formula-max"] = "The maximum price can't be negative.";
  else if (draft.minResult !== undefined && draft.maxResult !== undefined && draft.minResult > draft.maxResult)
    fieldErrs["formula-max"] = `Max result must be at least the min result (${draft.minResult}).`;
  const fe = (k: string) => (submitted || (k === "formula-expression" && exprTouched) ? fieldErrs[k] : undefined);
  const limitsInvalid = !!(fieldErrs["formula-decimals"] || fieldErrs["formula-min"] || fieldErrs["formula-max"]);

  /** Save-time validation (US-ST-04): unknown variable, circular reference, divide-by-zero risk, currency & unit mismatch. */
  const validate = (f: Formula): { error: ApiError | null; issues: string[] } => {
    const found: string[] = [];
    let tree;
    try {
      tree = parse(f.expression);
    } catch {
      return { error: null, issues: [] }; // shown inline under the expression
    }
    const defined = new Set(f.variables.map((v) => v.name));
    const unknown = [...variablesUsed(tree)].filter((n) => !defined.has(n));
    if (unknown.length) found.push(`Unknown variable — ${unknown.join(", ")} is not defined in the variables table. Add it below or fix the spelling.`);
    const all = formulas.some((x) => x.id === f.id) ? formulas.map((x) => (x.id === f.id ? f : x)) : [...formulas, f];
    if (hasCycle(all, f.id)) {
      return {
        error: { errorClass: "BUSINESS_RULE", code: "FORMULA_CIRCULAR_REFERENCE", message: `${f.id} depends on a formula that depends back on ${f.id}. Remove one of the formula references in Variables.`, field: "variables" },
        issues: [],
      };
    }
    const risks = divideByZeroRisks(tree);
    if (risks.length) found.push(`Divide-by-zero risk — divisor "${risks[0]}" can be zero. Wrap it as MAX(${risks[0]}, 0.01).`);
    const hasFx = f.variables.some((v) => v.sourceType === "FX_RATE");
    const foreign = f.variables.filter((v) => CURRENCY_UNITS.includes(v.unit) && v.unit !== f.currency);
    if (foreign.length && !hasFx) found.push(`Currency mismatch — ${foreign.map((v) => `${v.name} (${v.unit})`).join(", ")} vs formula currency ${f.currency}. Add an FX rate variable.`);
    const badUnit = f.variables.filter((v) => !CURRENCY_UNITS.includes(v.unit) && !["rate", "%", "factor"].includes(v.unit));
    if (badUnit.length) found.push(`Unit mismatch — ${badUnit.map((v) => `${v.name} (${v.unit})`).join(", ")} can't be added to a price. Use a currency, rate, % or factor.`);
    return { error: null, issues: found };
  };

  /** Field checks first (focus first invalid), then engine validation. */
  const check = () => {
    setSubmitted(true);
    const first = Object.keys(fieldErrs)[0];
    if (first) {
      if (first === "formula-decimals" || first === "formula-min" || first === "formula-max") setAdvancedOpen(true);
      window.setTimeout(() => document.getElementById(first)?.focus(), 0);
      return null;
    }
    const r = validate(draft);
    setError(r.error);
    setIssues(r.issues);
    return r.error ? null : r;
  };

  const save = (ev?: FormEvent) => {
    ev?.preventDefault();
    const r = check();
    if (!r) return;
    // An active formula prices live lines, so changed logic must be valid and tested before it is saved.
    if (draft.status === "ACTIVE" && logicChanged) {
      if (r.issues.length) {
        setError({ errorClass: "BUSINESS_RULE", code: "FORMULA_INVALID", message: "This formula is active. Fix the validation issues below before saving changes.", field: "expression" });
        return;
      }
      if (draft.testsPassed === 0) {
        setError({ errorClass: "BUSINESS_RULE", code: "FORMULA_TEST_REQUIRED", message: "This formula is active. Run a passing test in the test panel before saving the changed expression or variables.", field: "testsPassed" });
        return;
      }
    }
    setBusy("save");
    window.setTimeout(() => {
      const saved: Formula = { ...draft, status: draft.status === "ACTIVE" ? "ACTIVE" : "DRAFT", lastUpdated: "2026-10-29 14:15" };
      setFormulas((fs) => (fs.some((f) => f.id === saved.id) ? fs.map((f) => (f.id === saved.id ? saved : f)) : [...fs, saved]));
      setDraft(saved);
      setBusy(null);
      setSubmitted(false);
      if (r.issues.length) toast.warning(`${saved.name} saved as draft`, { description: "Activation is blocked until the validation issues are fixed." });
      else toast.success(`${saved.name} saved as draft`);
    }, 400);
  };

  const runTest = () => {
    setBusy("test");
    window.setTimeout(() => {
      setBusy(null);
      try {
        const tree = parse(draft.expression);
        const terms = topTerms(tree).map((t) => ({ label: toText(t.node), sign: t.sign, value: evaluate(t.node, samples) }));
        const raw = evaluate(tree, samples);
        let final = applyRounding(raw, draft.rounding.decimals, draft.rounding.mode);
        let capped = false;
        if (draft.maxResult !== undefined && final > draft.maxResult) {
          final = draft.maxResult;
          capped = true;
        }
        let floored = false;
        if (draft.minResult !== undefined && final < draft.minResult) {
          final = draft.minResult;
          floored = true;
        }
        setTest({ ok: true, terms, raw, final, capped, floored });
        setDraft((d) => ({ ...d, testsPassed: d.testsPassed + 1 }));
        toast.success(`Test passed — result ${money(final, draft.currency)}`);
      } catch (e) {
        setTest({ ok: false, terms: [], raw: NaN, final: NaN, capped: false, error: (e as Error).message });
      }
    }, 300);
  };

  const requestActivate = () => {
    const r = check();
    if (!r || r.issues.length) return;
    setConfirmActivate(true);
  };

  const activate = () => {
    setBusy("activate");
    window.setTimeout(() => {
      const saved: Formula = { ...draft, status: "ACTIVE" };
      setFormulas((fs) => (fs.some((f) => f.id === saved.id) ? fs.map((f) => (f.id === saved.id ? saved : f)) : [...fs, saved]));
      setDraft(saved);
      setBusy(null);
      setConfirmActivate(false);
      toast.success(`${saved.name} activated`, {
        description: `Affected prices recalculate ${saved.trigger === "ON_INPUT_CHANGE" ? "on every input change" : humanize(saved.trigger).toLowerCase()}.`,
      });
    }, 400);
  };

  /** MANUAL recalculation trigger (US-ST-04) — recalculates affected lines and logs the run. */
  const recalculate = () => {
    setRecalculating(true);
    window.setTimeout(() => {
      const at = new Date().toISOString().slice(0, 19).replace("T", " ");
      setRecalcLog((l) => [{ at, formula: draft.id, trigger: "MANUAL · requested by Riya Shah", linesAffected: draft.affectedLines, sample: "—", status: "SUCCEEDED" }, ...l]);
      setRecalculating(false);
      toast.success(`${draft.name} recalculated`, { description: `${draft.affectedLines.toLocaleString("en-GB")} price lines checked against guardrails and logged.` });
    }, 600);
  };

  const discard = () => {
    if (savedVersion) load(savedVersion);
    else load(formulas[0]);
    toast("Changes discarded");
  };

  const canActivate = draft.testsPassed > 0 && draft.status !== "ACTIVE";
  const rows = useMemo(() => formulas.filter((f) => !search || `${f.id} ${f.name}`.toLowerCase().includes(search.toLowerCase())), [formulas, search]);

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Strategy & segmentation" }, { label: "Formula pricing" }]}>
      <ListHeader
        title="Formula pricing"
        count={rows.length}
        noun="formula"
        subtitle="Prices calculated from costs, indices and FX — tested before they go live."
        search={search}
        onSearch={setSearch}
        actions={
          <Btn icon={Plus} onClick={newFormula}>
            Create formula
          </Btn>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[360px_1fr] gap-6">
        <nav aria-label="Formulas" className="space-y-3 min-w-0">
          {rows.length === 0 && (
            <EmptyState title={search ? `No formulas match “${search}”` : "No formulas yet"} action={search ? <Btn variant="subtle" onClick={() => setSearch("")}>Clear search</Btn> : undefined} />
          )}
          {rows.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => select(f)}
              aria-current={selectedId === f.id ? "true" : undefined}
              className={`w-full text-left bg-card border rounded-xl p-4 shadow-sm transition ${selectedId === f.id ? "border-brand ring-2 ring-brand/20" : "border-border hover:border-brand/50"}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-xs text-muted-foreground">{f.id}</div>
                  <div className="font-semibold">{f.name || "Untitled formula"}</div>
                </div>
                <StatusPill status={f.status} />
              </div>
              <code className="block mt-2 text-xs bg-muted rounded px-2 py-1.5 truncate">{f.expression}</code>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{humanize(f.trigger)}</span>·<span>{f.affectedLines} lines</span>·<span>{f.testsPassed} tests passed</span>
              </div>
            </button>
          ))}
        </nav>

        <form onSubmit={save} noValidate className="space-y-6 min-w-0">
          <ErrorBanner error={error} onClose={() => setError(null)} />
          {issues.length > 0 && (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-danger-soft px-4 py-3 text-sm">
              <div className="font-semibold text-destructive mb-1">Activation blocked — fix {issues.length} validation {issues.length === 1 ? "issue" : "issues"}</div>
              <ul className="list-disc pl-5 space-y-0.5">
                {issues.map((i) => (
                  <li key={i}>{i}</li>
                ))}
              </ul>
            </div>
          )}

          <Card
            title={
              <span className="flex flex-wrap items-center gap-3">
                {draft.name || "New formula"} <StatusPill status={draft.status} />
                {dirty && <StatusPill status="PENDING" label="Unsaved changes" />}
              </span>
            }
            subtitle={`${draft.id} · last updated ${draft.lastUpdated}`}
            actions={
              <>
                {dirty && (
                  <Btn variant="subtle" icon={Undo2} onClick={discard} disabled={!!busy}>
                    {savedVersion ? "Discard changes" : "Cancel"}
                  </Btn>
                )}
                <Btn variant="outline" icon={Save} type="submit" loading={busy === "save"} disabled={!!busy && busy !== "save"}>
                  Save draft
                </Btn>
                {draft.status !== "ACTIVE" && (
                  <Btn icon={Zap} onClick={requestActivate} disabled={!canActivate || !!busy} aria-describedby={!canActivate ? "formula-activate-why" : undefined}>
                    Activate
                  </Btn>
                )}
              </>
            }
          >
            {!canActivate && draft.status !== "ACTIVE" && (
              <p id="formula-activate-why" className="text-xs text-muted-foreground -mt-2 mb-4">
                Run at least one passing test in the test panel before activating.
              </p>
            )}
            {draft.status === "ACTIVE" && logicChanged && draft.testsPassed === 0 && (
              <p className="text-xs text-muted-foreground -mt-2 mb-4">This formula is active. Run a passing test before saving changes to its expression or variables.</p>
            )}
            <p className="text-xs text-muted-foreground mb-4">
              <span className="text-destructive" aria-hidden>*</span> Required
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
              <Field label="Formula name" required className="md:col-span-2" error={fe("formula-name")}>
                <input id="formula-name" className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Commodity pricing" />
              </Field>
              <Field label="Currency" required>
                <select className={inputCls} value={draft.currency} onChange={(e) => setDraft({ ...draft, currency: e.target.value })}>
                  {CURRENCY_UNITS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Expression"
                required
                hint={`Arithmetic (+ − × ÷), parentheses, MIN, MAX, ROUND, IF. No scripting or external calls. Example: ${EXAMPLE}`}
                error={fe("formula-expression")}
                className="md:col-span-3"
              >
                <textarea
                  id="formula-expression"
                  rows={3}
                  spellCheck={false}
                  className={`${inputCls} h-auto py-2 font-mono`}
                  value={draft.expression}
                  onChange={(e) => setDraft({ ...draft, expression: e.target.value, testsPassed: 0 })}
                  onBlur={() => setExprTouched(true)}
                  placeholder={EXAMPLE}
                />
              </Field>
              {draft.expression.trim() && !syntaxError && (
                <p className="md:col-span-3 -mt-2 text-xs text-success flex items-center gap-1" role="status">
                  <CheckCircle2 className="size-3.5" aria-hidden /> Syntax OK
                </p>
              )}
              <Field label="Recalculation trigger" required>
                <select className={inputCls} value={draft.trigger} onChange={(e) => setDraft({ ...draft, trigger: e.target.value as Formula["trigger"] })}>
                  {RECALC_TRIGGERS.map((m) => (
                    <option key={m} value={m}>
                      {humanize(m)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="mt-6 border-t border-border pt-4">
              <button
                type="button"
                aria-expanded={advancedOpen || limitsInvalid}
                aria-controls="formula-advanced"
                onClick={() => setAdvancedOpen((o) => !o)}
                className="inline-flex items-center gap-2 min-h-10 text-sm font-semibold text-foreground hover:text-brand"
              >
                <ChevronDown className={`size-4 transition ${advancedOpen || limitsInvalid ? "rotate-180" : ""}`} aria-hidden />
                Advanced: rounding and price limits
              </button>
              {(advancedOpen || limitsInvalid) && (
                <div id="formula-advanced" className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 mt-4">
                  <Field label="Rounding decimals" error={fe("formula-decimals")}>
                    <input id="formula-decimals" type="number" inputMode="numeric" min={0} max={6} step={1} className={inputCls} value={draft.rounding.decimals} onChange={(e) => setDraft({ ...draft, rounding: { ...draft.rounding, decimals: Number(e.target.value) } })} />
                  </Field>
                  <Field label="Rounding mode">
                    <select className={inputCls} value={draft.rounding.mode} onChange={(e) => setDraft({ ...draft, rounding: { ...draft.rounding, mode: e.target.value as Formula["rounding"]["mode"] } })}>
                      {ROUNDING_MODES.map((m) => (
                        <option key={m} value={m}>
                          {humanize(m)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <div className="hidden md:block" aria-hidden />
                  <Field label={`Min result (${draft.currency})`} hint="Optional floor for the calculated price" error={fieldErrs["formula-min"]}>
                    <input id="formula-min" type="number" inputMode="decimal" min={0} step="0.01" className={inputCls} value={draft.minResult ?? ""} onChange={(e) => setDraft({ ...draft, minResult: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  </Field>
                  <Field label={`Max result (${draft.currency})`} hint="Optional cap for the calculated price" error={fieldErrs["formula-max"]}>
                    <input id="formula-max" type="number" inputMode="decimal" min={draft.minResult ?? 0} step="0.01" className={inputCls} value={draft.maxResult ?? ""} onChange={(e) => setDraft({ ...draft, maxResult: e.target.value === "" ? undefined : Number(e.target.value) })} />
                  </Field>
                </div>
              )}
            </div>
          </Card>

          <Card
            title="Variables"
            subtitle="To reference another formula, use source type Price list with source “Formula F-xx output”."
            actions={
              <Btn variant="outline" size="sm" icon={Plus} onClick={() => setDraft((d) => ({ ...d, testsPassed: 0, variables: [...d.variables, { name: "", sourceType: "CONSTANT", source: "", sample: 0, unit: d.currency }] }))}>
                Add variable
              </Btn>
            }
            padded={false}
          >
            <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Formula variables">
              <table className="w-full text-sm min-w-[640px]">
                <caption className="sr-only">Formula variables</caption>
                <thead>
                  <tr className="bg-navy text-navy-foreground">
                    {["Name", "Source type", "Source", "Unit"].map((h) => (
                      <th key={h} scope="col" className="px-4 py-3 text-left font-semibold">
                        {h}
                      </th>
                    ))}
                    <th scope="col" className="px-4 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {draft.variables.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                        No variables yet — add one for each name used in the expression.
                      </td>
                    </tr>
                  )}
                  {draft.variables.map((v, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2">
                        <input aria-label={`Variable ${i + 1} name`} className={`${inputCls} font-mono`} value={v.name} placeholder="e.g. Freight" onChange={(e) => updateVar(i, { name: e.target.value.replace(/\s/g, "") })} />
                      </td>
                      <td className="px-4 py-2">
                        <select aria-label={`Variable ${i + 1} source type`} className={inputCls} value={v.sourceType} onChange={(e) => updateVar(i, { sourceType: e.target.value as FormulaVar["sourceType"] })}>
                          {FORMULA_SOURCE_TYPES.map((s) => (
                            <option key={s} value={s}>
                              {humanize(s)}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="px-4 py-2">
                        <input aria-label={`Variable ${i + 1} source`} className={inputCls} value={v.source} onChange={(e) => updateVar(i, { source: e.target.value })} />
                      </td>
                      <td className="px-4 py-2 w-32">
                        <input aria-label={`Variable ${i + 1} unit`} className={inputCls} value={v.unit} onChange={(e) => updateVar(i, { unit: e.target.value })} />
                      </td>
                      <td className="px-4 py-2 w-14">
                        <button type="button" aria-label={`Remove variable ${v.name || i + 1}`} className="size-10 grid place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted" onClick={() => removeVar(i)}>
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card
            title={
              <span className="flex items-center gap-2">
                <FlaskConical className="size-5 text-brand" aria-hidden /> Test panel
              </span>
            }
            subtitle="Evaluate the formula on sample inputs. The formula can't be activated until at least one test has passed."
            actions={
              <Btn variant="outline" icon={FlaskConical} onClick={runTest} loading={busy === "test"} disabled={!!syntaxError || !draft.expression.trim()}>
                Run test
              </Btn>
            }
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {draft.variables.map((v, i) => (
                  <Field key={`${v.name}-${i}`} label={`${v.name || `Variable ${i + 1}`} (${v.unit})`}>
                    <input type="number" inputMode="decimal" step="any" className={inputCls} value={samples[v.name] ?? 0} onChange={(e) => setSamples({ ...samples, [v.name]: Number(e.target.value) })} />
                  </Field>
                ))}
                {draft.variables.length === 0 && <p className="text-sm text-muted-foreground">Add variables to enter sample inputs.</p>}
              </div>
              <div className="rounded-xl border border-border bg-muted/30 p-4" role="status" aria-live="polite">
                {!test && <p className="text-sm text-muted-foreground">Run a test to see each intermediate term and the result.</p>}
                {test && !test.ok && (
                  <div className="text-sm text-destructive">
                    <p className="font-semibold">Test failed</p>
                    <p className="text-foreground mt-1">{test.error ?? "The formula couldn't be evaluated."} Check the sample inputs and variable names, then run the test again.</p>
                  </div>
                )}
                {test?.ok && (
                  <div className="space-y-2 text-sm">
                    {test.terms.map((t, i) => (
                      <div key={i} className="flex justify-between gap-4">
                        <span className="font-mono text-muted-foreground">
                          {i === 0 ? "" : t.sign} {t.label}
                        </span>
                        <span className="tabular-nums">{t.value.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between border-t border-border pt-2">
                      <span>Raw result</span>
                      <span className="tabular-nums">{test.raw.toFixed(4)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>
                        Rounded ({draft.rounding.decimals} dp, {humanize(draft.rounding.mode).toLowerCase()})
                      </span>
                      <span className="tabular-nums">{applyRounding(test.raw, draft.rounding.decimals, draft.rounding.mode).toFixed(draft.rounding.decimals)}</span>
                    </div>
                    <div className="flex items-center justify-between border-t border-border pt-2 text-base font-bold">
                      <span>Calculated price</span>
                      <span className="text-brand tabular-nums">
                        {money(test.final, draft.currency)} <span className="text-xs text-muted-foreground font-normal">{draft.currency}</span>
                      </span>
                    </div>
                    {test.capped && <Flag tone="warning">Capped by max result ({draft.maxResult})</Flag>}
                    {test.floored && <Flag tone="warning">Raised to min result ({draft.minResult})</Flag>}
                    <div className="flex items-center gap-1.5 text-success text-xs font-semibold">
                      <CheckCircle2 className="size-4" aria-hidden /> Test passed · {draft.testsPassed} passing {draft.testsPassed === 1 ? "test" : "tests"}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </Card>

          <section aria-labelledby="formula-log-h">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="formula-log-h" className="text-lg font-semibold tracking-tight">
                  Recalculation log
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">When an input changes, affected prices are recalculated within guardrails and approval rules and logged with the triggering input.</p>
              </div>
              {draft.status === "ACTIVE" && (
                <Btn variant="outline" size="sm" icon={RefreshCw} onClick={recalculate} loading={recalculating} disabled={dirty || !!busy} title={dirty ? "Save your changes before recalculating" : undefined}>
                  Recalculate now
                </Btn>
              )}
            </div>
            <DataTable
              caption="Formula recalculation log"
              rows={recalcLog.filter((l) => l.formula === draft.id)}
              rowKey={(r) => r.at}
              pageSize={10}
              empty={<EmptyState title="No recalculations yet">Recalculations are logged here once this formula is active and one of its inputs changes.</EmptyState>}
              columns={[
                { key: "at", header: "When", cell: (r) => <span className="tabular-nums whitespace-nowrap">{r.at}</span> },
                {
                  key: "trigger",
                  header: "Triggering input",
                  cell: (r) => {
                    const [kind, ...rest] = r.trigger.split(" · ");
                    return (
                      <span className="flex flex-wrap items-center gap-2 min-w-56">
                        <Tag tone="info">{humanize(kind)}</Tag>
                        <span className="whitespace-nowrap">{rest.join(" · ")}</span>
                      </span>
                    );
                  },
                },
                { key: "lines", header: "Lines affected", align: "right", cell: (r) => <span className="tabular-nums">{r.linesAffected}</span> },
                { key: "sample", header: "Example", cell: (r) => <span className="font-mono text-xs whitespace-nowrap">{r.sample}</span> },
                { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
              ]}
            />
          </section>

          <InfoBanner title="Worked example">
            Price = CommodityIndex + Freight + ProcessingCost + Margin → 60 + 5 + 10 + 15 = <b>90</b>. When the index moves 60 → 66, affected prices recalculate to <b>96</b>.
            Try CommodityIndex = 82 with a max result of 100 to see a capped result.
          </InfoBanner>
        </form>
      </div>

      <ConfirmDialog
        open={confirmActivate}
        title={`Activate ${draft.name}?`}
        description={`${draft.affectedLines.toLocaleString("en-GB")} price lines will be calculated by this formula and recalculate ${draft.trigger === "ON_INPUT_CHANGE" ? "on every input change" : humanize(draft.trigger).toLowerCase()}. Guardrails and approval rules still apply.`}
        confirmLabel="Activate formula"
        loading={busy === "activate"}
        onConfirm={activate}
        onCancel={() => setConfirmActivate(false)}
      />

      <ConfirmDialog
        open={confirmSwitch !== null}
        tone="danger"
        title="Discard unsaved changes?"
        description={`Your edits to ${draft.name || "this formula"} haven't been saved and will be lost.`}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          const target = confirmSwitch;
          setConfirmSwitch(null);
          if (target === "new") loadNew();
          else if (target) load(target);
        }}
        onCancel={() => setConfirmSwitch(null)}
      />
    </PricingLayout>
  );
}
