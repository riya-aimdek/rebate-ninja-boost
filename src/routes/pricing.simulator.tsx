import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type KeyboardEvent } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FlaskConical, Layers, Play, Plus, RotateCcw, Save, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  DataTable,
  EmptyState,
  ErrorBanner,
  Field,
  Flag,
  humanize,
  ListHeader,
  PricingLayout,
  RecordLink,
  Segmented,
  Tag,
  inputCls,
  notifyUndo,
  pct,
  type ApiError,
  TableSection,
} from "@/components/pricing/kit";
import { PRICE_LISTS, SIMULATIONS, SIMULATION_BASELINE, type Simulation } from "@/lib/pricing/data";

export const Route = createFileRoute("/pricing/simulator")({
  head: () => ({
    meta: [
      { title: "Scenario simulator · Rebate Ninja" },
      { name: "description", content: "Simulate price changes and compare projected revenue, volume and margin before executing." },
    ],
  }),
  component: SimulatorPage,
});

type ScenarioKind = "PERCENT" | "ABSOLUTE" | "TARGET_MARGIN" | "SWAP_LIST";
type ElasticitySource = "MODEL" | "MANUAL" | "DEFAULT";
type ScenarioInput = { id: number; name: string; kind: ScenarioKind; value: string; list?: string };
type Result = {
  name: string;
  pricePct: number;
  revenue: { base: number; scen: number };
  volume: { base: number; scen: number };
  margin: { base: number; scen: number };
};

const MODEL_VERSION = "elast-gbm-3.2";
const DEFAULT_ELASTICITY = 1.0;
const AVG_PRICE = SIMULATION_BASELINE.revenue / SIMULATION_BASELINE.volume;
const BASE_COST = SIMULATION_BASELINE.revenue - SIMULATION_BASELINE.margin;

/** Model response curve calibrated to the saved FY27 study (SIM-14): +3% → Rev +2.5M, Vol −1%, Margin +1.1M; +5% → +3.2M, −3%, +1.4M. */
const MODEL_POINTS = [
  { p: 0, rev: 0, vol: 0, mar: 0 },
  { p: 3, rev: 2_500_000, vol: -1, mar: 1_100_000 },
  { p: 5, rev: 3_200_000, vol: -3, mar: 1_400_000 },
];

function modelCurve(p: number) {
  const sign = p < 0 ? -1 : 1;
  const a = Math.abs(p);
  const [p0, p1, p2] = MODEL_POINTS;
  const lerp = (x: typeof p0, y: typeof p0, t: number) => ({
    rev: x.rev + (y.rev - x.rev) * t,
    vol: x.vol + (y.vol - x.vol) * t,
    mar: x.mar + (y.mar - x.mar) * t,
  });
  const r = a <= 3 ? lerp(p0, p1, a / 3) : lerp(p1, p2, (a - 3) / 2);
  // price cuts: revenue/margin fall, volume rises
  return { rev: sign * r.rev, vol: sign * r.vol, mar: sign * r.mar };
}

function toPricePct(s: ScenarioInput): number {
  const v = Number(s.value);
  if (s.kind === "PERCENT") return v;
  if (s.kind === "ABSOLUTE") return (v / AVG_PRICE) * 100;
  if (s.kind === "TARGET_MARGIN") {
    const t = v / 100;
    return (BASE_COST / (SIMULATION_BASELINE.revenue * (1 - t)) - 1) * 100;
  }
  // swap to another price list — average list-level change vs current
  return s.list === "BL-002" ? 5 : s.list === "PR-011" ? -8 : 0;
}

function simulate(s: ScenarioInput, source: ElasticitySource, manualE: number): Result {
  const p = toPricePct(s);
  const base = SIMULATION_BASELINE;
  if (source === "MODEL") {
    const c = modelCurve(p);
    return {
      name: s.name,
      pricePct: p,
      revenue: { base: base.revenue, scen: base.revenue + c.rev },
      volume: { base: base.volume, scen: base.volume * (1 + c.vol / 100) },
      margin: { base: base.margin, scen: base.margin + c.mar },
    };
  }
  const e = source === "MANUAL" ? manualE : DEFAULT_ELASTICITY;
  const vol = -e * p;
  const rev = base.revenue * (1 + p / 100) * (1 + vol / 100);
  const cost = BASE_COST * (1 + vol / 100);
  return {
    name: s.name,
    pricePct: p,
    revenue: { base: base.revenue, scen: rev },
    volume: { base: base.volume, scen: base.volume * (1 + vol / 100) },
    margin: { base: base.margin, scen: rev - cost },
  };
}

const fmtM = (n: number) => `${n < 0 ? "−" : ""}£${(Math.abs(n) / 1_000_000).toFixed(2)}M`;
const fmtDeltaM = (n: number) => `${n >= 0 ? "+" : "−"}£${(Math.abs(n) / 1_000_000).toFixed(1)}M`;

let nextId = 3;

/** "2026-10-27 16:00" -> "27 Oct 2026, 16:00" without Date parsing (deterministic on server and client). */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtStamp(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(s);
  if (!m) return s;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}${m[4] ? `, ${m[4]}` : ""}`;
}

/** Current local time as "YYYY-MM-DD HH:mm" — the stored format for saved simulations. */
function nowStamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

const DEFAULT_SCENARIOS: ScenarioInput[] = [
  { id: 1, name: "A +3%", kind: "PERCENT", value: "3" },
  { id: 2, name: "B +5%", kind: "PERCENT", value: "5" },
];
const DEFAULT_HORIZON = "12";

/** Allowed range per change type — drives input min/max and inline validation. */
const VALUE_RULES: Record<Exclude<ScenarioKind, "SWAP_LIST">, { min: number; max: number; step: number; fix: string }> = {
  PERCENT: { min: -50, max: 50, step: 0.1, fix: "Enter a price change between −50% and +50%, e.g. 3." },
  ABSOLUTE: { min: -1000, max: 1000, step: 0.01, fix: "Enter a per-unit change between −1,000 and +1,000, e.g. 1.50." },
  TARGET_MARGIN: { min: 1, max: 95, step: 0.1, fix: "Enter a target margin between 1% and 95%, e.g. 28." },
};

/** Scenario row columns, shared by the header row and each row so they line up. */
const SCENARIO_COLS = "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem_2.5rem]";

/** Inline error for one scenario row, or undefined when valid. */
function scenarioError(s: ScenarioInput): { field: "name" | "value"; message: string } | undefined {
  if (!s.name.trim()) return { field: "name", message: "Name this scenario, e.g. “C +2%”." };
  if (s.kind === "SWAP_LIST") return undefined;
  const rule = VALUE_RULES[s.kind];
  const v = Number(s.value);
  if (s.value === "" || Number.isNaN(v) || v < rule.min || v > rule.max) return { field: "value", message: rule.fix };
  return undefined;
}

function SimulatorPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("FY27 list increase options");
  const [baselineKind, setBaselineKind] = useState<"HISTORICAL" | "PRICE_LIST">("HISTORICAL");
  const [period, setPeriod] = useState("Oct 2025 – Sep 2026");
  const [baseList, setBaseList] = useState("BL-001");
  const [horizon, setHorizon] = useState(DEFAULT_HORIZON);
  const [source, setSource] = useState<ElasticitySource>("MODEL");
  const [manualE, setManualE] = useState("0.8");
  const [scenarios, setScenarios] = useState<ScenarioInput[]>(DEFAULT_SCENARIOS);
  const [running, setRunning] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [results, setResults] = useState<Result[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [err, setErr] = useState<ApiError | null>(null);
  const [saved, setSaved] = useState<Simulation[]>(SIMULATIONS);
  /** ID the current results were saved as; null = results not saved yet (unsaved-changes indicator). */
  const [savedAs, setSavedAs] = useState<string | null>(null);
  /** Inputs the shown results were calculated from — results go out of date when inputs change. */
  const [runKey, setRunKey] = useState<string | null>(null);

  const sourceLabel =
    source === "MANUAL" ? "manual elasticity, not model output" : source === "DEFAULT" ? "default elasticity, not model output" : `model ${MODEL_VERSION}`;

  const h = Number(horizon);
  const horizonError = !horizon || !Number.isInteger(h) || h < 1 || h > 36 ? "Enter a whole number of months between 1 and 36, e.g. 12." : undefined;
  const mE = Number(manualE);
  const manualError = source === "MANUAL" && !(mE >= 0.1 && mE <= 5) ? "Enter an elasticity between 0.1 and 5.0, e.g. 0.8." : undefined;
  const nameError = !name.trim() ? "Name the simulation so it can be saved and found later." : undefined;
  const firstBadScenario = scenarios.find((s) => scenarioError(s));
  const inputsKey = JSON.stringify({ baselineKind, period, baseList, horizon, source, manualE, scenarios: scenarios.map(({ id: _id, ...rest }) => rest) });
  const stale = !!results && runKey !== inputsKey;
  /** Why Run is unavailable — shown under the header actions. */
  const runBlocker = horizonError
    ? "Fix the horizon to run."
    : manualError
      ? "Enter a valid manual elasticity to run."
      : firstBadScenario
        ? `Fix scenario “${firstBadScenario.name.trim() || "untitled"}” to run.`
        : null;

  const run = () => {
    setErr(null);
    const h = Number(horizon);
    if (!horizon || !Number.isInteger(h) || h < 1 || h > 36) {
      setErr({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Horizon must be a whole number of months between 1 and 36.", field: "horizonMonths" });
      return;
    }
    const bad = scenarios.find((s) => !s.name.trim() || (s.kind !== "SWAP_LIST" && s.value === ""));
    if (bad) {
      setErr({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: `Scenario "${bad.name || "untitled"}" is missing a name or value.`, field: "scenarios[].value" });
      return;
    }
    if (source === "MANUAL" && !(Number(manualE) > 0)) {
      setErr({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Enter a manual elasticity value.", field: "elasticity" });
      return;
    }
    setRunning(true);
    const key = inputsKey;
    setTimeout(() => {
      setRunKey(key);
      setResults(scenarios.map((s) => simulate(s, source, Number(manualE))));
      setSelected(scenarios[0]?.name ?? null);
      setSavedAs(null);
      setRunning(false);
      setUpdatedAt(new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }));
      toast.success("Simulation completed", { description: `${scenarios.length} ${scenarios.length === 1 ? "scenario" : "scenarios"} compared with the baseline.` });
    }, 700);
  };

  // Enter inside any input runs the simulation (primary action).
  const onConfigKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && !running && !runBlocker) {
      e.preventDefault();
      run();
    }
  };

  /** Restore default inputs and clear results; reversible via Undo. */
  const resetToBaseline = () => {
    const snap = { name, baselineKind, period, baseList, horizon, source, manualE, scenarios, results, selected, savedAs };
    setName("FY27 list increase options");
    setBaselineKind("HISTORICAL");
    setPeriod("Oct 2025 – Sep 2026");
    setBaseList("BL-001");
    setHorizon(DEFAULT_HORIZON);
    setSource("MODEL");
    setManualE("0.8");
    setScenarios(DEFAULT_SCENARIOS);
    setResults(null);
    setSelected(null);
    setSavedAs(null);
    setErr(null);
    notifyUndo("Simulator reset to baseline", () => {
      setName(snap.name);
      setBaselineKind(snap.baselineKind);
      setPeriod(snap.period);
      setBaseList(snap.baseList);
      setHorizon(snap.horizon);
      setSource(snap.source);
      setManualE(snap.manualE);
      setScenarios(snap.scenarios);
      setResults(snap.results);
      setSelected(snap.selected);
      setSavedAs(snap.savedAs);
    });
  };

  const removeScenario = (s: ScenarioInput) => {
    const idx = scenarios.findIndex((x) => x.id === s.id);
    setScenarios((ss) => ss.filter((x) => x.id !== s.id));
    notifyUndo(`Scenario “${s.name.trim() || "untitled"}” removed`, () =>
      setScenarios((ss) => (ss.some((x) => x.id === s.id) ? ss : [...ss.slice(0, idx), s, ...ss.slice(idx)])),
    );
  };

  const save = () => {
    if (!results) {
      toast.error("Run the simulation before saving");
      return;
    }
    if (nameError) {
      toast.error("Name the simulation before saving");
      return;
    }
    const sim: Simulation = {
      id: `SIM-${15 + saved.length}`,
      name,
      baseline: baselineKind === "HISTORICAL" ? `Historical: ${period}` : `Price list: ${PRICE_LISTS.find((l) => l.id === baseList)?.name}`,
      horizonMonths: Number(horizon),
      elasticitySource: source,
      modelVersion: MODEL_VERSION,
      createdBy: "Riya Shah",
      createdAt: nowStamp(),
      // Store the scenario input ("PERCENT 3", "SWAP_LIST BL-002") so reopening restores it exactly.
      scenarios: results.map((r, i) => ({
        name: r.name,
        change: scenarios[i].kind === "SWAP_LIST" ? `SWAP_LIST ${scenarios[i].list ?? "BL-002"}` : `${scenarios[i].kind} ${scenarios[i].value}`,
        revenue: r.revenue.scen - r.revenue.base,
        volumePct: ((r.volume.scen - r.volume.base) / r.volume.base) * 100,
        margin: r.margin.scen - r.margin.base,
      })),
    };
    setSaved((s) => [sim, ...s]);
    setSavedAs(sim.id);
    toast.success(`${sim.id} saved`, { description: "Stored with user, timestamp and inputs." });
  };

  /** Reopen a saved simulation: restores its inputs; run again to see results. */
  const openSaved = (s: Simulation) => {
    // Opening replaces the current inputs and results, so keep a snapshot for Undo.
    const snap = { name, baselineKind, period, baseList, horizon, source, scenarios, results, selected, savedAs };
    const hist = s.baseline.startsWith("Historical: ");
    setName(s.name);
    setBaselineKind(hist ? "HISTORICAL" : "PRICE_LIST");
    if (hist) setPeriod(s.baseline.slice("Historical: ".length));
    else setBaseList(PRICE_LISTS.find((l) => s.baseline.endsWith(l.name))?.id ?? baseList);
    setHorizon(String(s.horizonMonths));
    setSource(s.elasticitySource);
    setScenarios(
      s.scenarios.map((sc, i) => {
        const [k, v = ""] = sc.change.split(" ");
        const kind: ScenarioKind = (["PERCENT", "ABSOLUTE", "TARGET_MARGIN", "SWAP_LIST"] as const).find((x) => x === k) ?? "PERCENT";
        return kind === "SWAP_LIST"
          ? { id: Date.now() + i, name: sc.name, kind, value: "", list: v }
          : { id: Date.now() + i, name: sc.name, kind, value: String(Number(v.replace("%", "")) || 0) };
      }),
    );
    setResults(null);
    setSelected(null);
    setSavedAs(null);
    setErr(null);
    document.querySelector("h1")?.scrollIntoView({ behavior: "smooth", block: "start" });
    notifyUndo(
      `${s.id} opened`,
      () => {
        setName(snap.name);
        setBaselineKind(snap.baselineKind);
        setPeriod(snap.period);
        setBaseList(snap.baseList);
        setHorizon(snap.horizon);
        setSource(snap.source);
        setScenarios(snap.scenarios);
        setResults(snap.results);
        setSelected(snap.selected);
        setSavedAs(snap.savedAs);
      },
      "Inputs restored. Run the simulation to see results.",
    );
  };

  const createBulk = () => {
    const r = results?.find((x) => x.name === selected);
    if (!r) return;
    const adj = Number(r.pricePct.toFixed(1));
    toast.success("Bulk update preview opened", { description: `Same scope and a ${adj}% adjustment from scenario "${r.name}".` });
    navigate({
      to: "/pricing/bulk-update",
      search: { pct: adj, scenario: r.name, list: baselineKind === "PRICE_LIST" ? baseList : undefined },
    });
  };

  const update = (id: number, patch: Partial<ScenarioInput>) => setScenarios((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const chartData = results?.map((r) => ({
    name: r.name,
    Revenue: +((r.revenue.scen - r.revenue.base) / 1_000_000).toFixed(2),
    Margin: +((r.margin.scen - r.margin.base) / 1_000_000).toFixed(2),
  }));

  const saveBlocker = !results
    ? "Run the simulation before saving"
    : stale
      ? "Inputs changed — run again before saving"
      : nameError
        ? "Name the simulation before saving"
        : savedAs
          ? `Already saved as ${savedAs}`
          : undefined;
  const fmtVol = (n: number) => `${(n / 1_000_000).toFixed(2)}M`;
  const tone = (d: number) => (d >= 0 ? "text-success" : "text-destructive");

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Price optimization" }, { label: "Scenario simulator" }]}>
      <ListHeader title="Scenario simulator" subtitle="Compare projected revenue, volume and margin before changing prices." />
      <ErrorBanner error={err} onClose={() => setErr(null)} />

      {/* Workspace: inputs on the left, results on the right (stacked below xl). */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start mb-6">
        <section aria-label="Simulation inputs" className="space-y-6 min-w-0" onKeyDown={onConfigKeyDown}>
          <Card title="Baseline and assumptions" subtitle="What every scenario is compared against.">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
              <Field label="Simulation name" required error={nameError} className="sm:col-span-2">
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={80} />
              </Field>
              <div className="sm:col-span-2 flex flex-col gap-1.5" role="group" aria-labelledby="sim-baseline-label">
                <span id="sim-baseline-label" className="text-sm font-medium text-foreground">
                  Baseline
                </span>
                <Segmented<"HISTORICAL" | "PRICE_LIST">
                  options={[
                    { key: "HISTORICAL", label: "Historical period", tone: "navy" },
                    { key: "PRICE_LIST", label: "Current price list", tone: "navy" },
                  ]}
                  value={baselineKind}
                  onChange={setBaselineKind}
                />
              </div>
              {baselineKind === "HISTORICAL" ? (
                <Field label="Historical period">
                  <select value={period} onChange={(e) => setPeriod(e.target.value)} className={inputCls}>
                    <option>Oct 2025 – Sep 2026</option>
                    <option>Jan 2025 – Dec 2025</option>
                    <option>Q3 2026</option>
                  </select>
                </Field>
              ) : (
                <Field label="Price list">
                  <select value={baseList} onChange={(e) => setBaseList(e.target.value)} className={inputCls}>
                    {PRICE_LISTS.filter((l) => l.status === "ACTIVE").map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field label="Horizon (months)" required hint="1 to 36 months" error={horizonError}>
                <input type="number" min={1} max={36} step={1} inputMode="numeric" value={horizon} onChange={(e) => setHorizon(e.target.value)} className={inputCls} />
              </Field>
              <Field label="Elasticity source" className={source === "MANUAL" ? "" : "sm:col-span-2"}>
                <select value={source} onChange={(e) => setSource(e.target.value as ElasticitySource)} className={inputCls}>
                  <option value="MODEL">Model — {MODEL_VERSION}</option>
                  <option value="MANUAL">Manual — enter value</option>
                  <option value="DEFAULT">Default — {DEFAULT_ELASTICITY.toFixed(1)}</option>
                </select>
              </Field>
              {source === "MANUAL" && (
                <Field label="Manual elasticity" required hint="0.1 to 5.0 — higher means demand reacts more to price" error={manualError}>
                  <input type="number" step="0.1" min={0.1} max={5} inputMode="decimal" value={manualE} onChange={(e) => setManualE(e.target.value)} className={inputCls} />
                </Field>
              )}
            </div>
            {source !== "MODEL" && (
              <div className="mt-4">
                <Flag tone="warning">{sourceLabel.charAt(0).toUpperCase() + sourceLabel.slice(1)}</Flag>
              </div>
            )}
          </Card>

          <Card
            title="Scenarios"
            subtitle="Up to 5 price changes applied to the baseline."
            actions={
              <Btn
                variant="outline"
                size="sm"
                icon={Plus}
                disabled={scenarios.length >= 5}
                title={scenarios.length >= 5 ? "Up to 5 scenarios" : undefined}
                onClick={() => setScenarios((s) => [...s, { id: nextId++, name: `${String.fromCharCode(65 + s.length)} `, kind: "PERCENT", value: "" }])}
              >
                Add ({scenarios.length}/5)
              </Btn>
            }
          >
            {/* One header row labels the columns; rows stay compact with no box per scenario. */}
            <div className={`hidden sm:grid ${SCENARIO_COLS} gap-3 pb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground`} aria-hidden>
              <span>
                Name<span className="text-destructive ml-0.5">*</span>
              </span>
              <span>Change type</span>
              <span>
                Value<span className="text-destructive ml-0.5">*</span>
              </span>
              <span />
            </div>
            <ul className="divide-y divide-border border-y border-border">
              {scenarios.map((s) => {
                const se = scenarioError(s);
                return (
                  <li key={s.id} className={`grid grid-cols-1 ${SCENARIO_COLS} gap-3 py-3 items-start`}>
                    <Field label="Name" labelClassName="sm:sr-only" required error={se?.field === "name" ? se.message : undefined}>
                      <input value={s.name} onChange={(e) => update(s.id, { name: e.target.value })} className={inputCls} maxLength={40} />
                    </Field>
                    <Field label="Change type" labelClassName="sm:sr-only">
                      <select value={s.kind} onChange={(e) => update(s.id, { kind: e.target.value as ScenarioKind })} className={inputCls}>
                        <option value="PERCENT">Percent</option>
                        <option value="ABSOLUTE">Absolute (£ per unit)</option>
                        <option value="TARGET_MARGIN">Target margin %</option>
                        <option value="SWAP_LIST">Swap to price list</option>
                      </select>
                    </Field>
                    {s.kind === "SWAP_LIST" ? (
                      <Field label="Price list" labelClassName="sm:sr-only">
                        <select value={s.list ?? "BL-002"} onChange={(e) => update(s.id, { list: e.target.value })} className={inputCls}>
                          {PRICE_LISTS.filter((l) => l.status !== "CANCELLED").map((l) => (
                            <option key={l.id} value={l.id}>
                              {l.name}
                            </option>
                          ))}
                        </select>
                      </Field>
                    ) : (
                      <Field
                        label={s.kind === "PERCENT" ? "Value %" : s.kind === "ABSOLUTE" ? "Value £" : "Target %"}
                        labelClassName="sm:sr-only"
                        required
                        error={se?.field === "value" ? se.message : undefined}
                      >
                        <input
                          type="number"
                          inputMode="decimal"
                          min={VALUE_RULES[s.kind].min}
                          max={VALUE_RULES[s.kind].max}
                          step={VALUE_RULES[s.kind].step}
                          value={s.value}
                          onChange={(e) => update(s.id, { value: e.target.value })}
                          className={inputCls}
                          placeholder={s.kind === "PERCENT" ? "e.g. 3" : s.kind === "ABSOLUTE" ? "e.g. 1.50" : "e.g. 28"}
                        />
                      </Field>
                    )}
                    <Btn
                      variant="ghost"
                      icon={Trash2}
                      className="justify-self-start"
                      aria-label={`Remove scenario ${s.name}`}
                      title={scenarios.length <= 1 ? "At least one scenario is required" : `Remove scenario ${s.name}`}
                      disabled={scenarios.length <= 1}
                      onClick={() => removeScenario(s)}
                    >
                      <span className="sm:hidden">Remove</span>
                    </Btn>
                  </li>
                );
              })}
            </ul>
            {/* Run sits where editing ends; the field errors above say what to fix, the blocker is announced only. */}
            <div className="flex flex-wrap items-center justify-end gap-3 pt-4">
              {runBlocker && (
                <p id="sim-run-blocker" role="status" className="sr-only">
                  {runBlocker}
                </p>
              )}
              <Btn variant="subtle" icon={RotateCcw} onClick={resetToBaseline} disabled={running}>
                Reset
              </Btn>
              <Btn icon={Play} onClick={run} loading={running} disabled={!!runBlocker} aria-describedby={runBlocker ? "sim-run-blocker" : undefined}>
                {running ? "Running…" : results ? "Run again" : "Run simulation"}
              </Btn>
            </div>
          </Card>
        </section>

        <section aria-labelledby="sim-results-h" className="min-w-0">
          <Card
            title={<span id="sim-results-h">Results</span>}
            subtitle={
              <span role="status">
                {running
                  ? "Calculating…"
                  : !results
                    ? "Estimates appear here after you run the simulation."
                    : stale
                      ? "Inputs changed since this run — run again to update."
                      : `Updated ${updatedAt ?? "just now"} · estimate over ${horizon} months`}
              </span>
            }
            actions={
              results && (
                <>
                  {stale ? (
                    <Tag tone="warning">Out of date</Tag>
                  ) : savedAs ? (
                    <Tag tone="success">Saved as {savedAs}</Tag>
                  ) : (
                    <Tag tone="warning">Not saved</Tag>
                  )}
                  <Btn variant="outline" size="sm" icon={Save} onClick={save} disabled={!!saveBlocker || running} title={saveBlocker}>
                    Save
                  </Btn>
                </>
              )
            }
            padded={false}
          >
            {!results ? (
              <EmptyState icon={FlaskConical} title={running ? "Running simulation…" : "No results yet"}>
                Set up the baseline and scenarios, then choose Run simulation. You will see revenue, volume and margin against the baseline for each
                scenario, and can turn one into a bulk update.
              </EmptyState>
            ) : (
              <div className={stale || running ? "opacity-60 transition-opacity" : "transition-opacity"}>
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1 px-5 pt-4 text-xs text-muted-foreground">
                  <Flag tone="warning">Estimate</Flag>
                  Elasticity: <span className="font-medium text-foreground">{sourceLabel}</span> · not a commitment.
                </p>

                {/* One row per scenario keeps the column count fixed, so up to 5 scenarios fit without sideways scrolling. */}
                <div className="px-5 pt-3">
                  <div className="overflow-x-auto overflow-y-hidden rounded-lg border border-border" tabIndex={0} role="region" aria-label="Scenario comparison">
                    <table className="w-full text-sm">
                      <caption className="sr-only">Projected revenue, volume and margin for the baseline and each scenario, with the change from baseline</caption>
                      <thead>
                        <tr className="bg-navy text-navy-foreground">
                          <th scope="col" className="px-3 py-2.5 text-left font-semibold">Scenario</th>
                          <th scope="col" className="px-3 py-2.5 text-right font-semibold whitespace-nowrap">Price</th>
                          <th scope="col" className="px-3 py-2.5 text-right font-semibold">Revenue</th>
                          <th scope="col" className="px-3 py-2.5 text-right font-semibold">Volume</th>
                          <th scope="col" className="px-3 py-2.5 text-right font-semibold">Margin</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        <tr className="bg-muted/40">
                          <th scope="row" className="px-3 py-2.5 text-left font-medium">Baseline</th>
                          <td className="px-3 py-2.5 text-right text-muted-foreground">—</td>
                          <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{fmtM(results[0].revenue.base)}</td>
                          <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{fmtVol(results[0].volume.base)} units</td>
                          <td className="px-3 py-2.5 text-right tabular-nums whitespace-nowrap">{fmtM(results[0].margin.base)}</td>
                        </tr>
                        {results.map((r) => {
                          const on = selected === r.name;
                          const dRev = r.revenue.scen - r.revenue.base;
                          const dVol = ((r.volume.scen - r.volume.base) / r.volume.base) * 100;
                          const dMar = r.margin.scen - r.margin.base;
                          return (
                            <tr key={r.name} className={on ? "bg-brand-soft/50" : ""}>
                              <th scope="row" className="px-3 py-2 text-left font-medium">
                                {/* Whole label is the 40px target; the radio picks the scenario for "Create bulk update". */}
                                <label className="inline-flex items-center gap-2 min-h-10 cursor-pointer whitespace-nowrap">
                                  <input
                                    type="radio"
                                    name="sim-bulk-scenario"
                                    checked={on}
                                    onChange={() => setSelected(r.name)}
                                    className="size-4 accent-[var(--brand)]"
                                  />
                                  {r.name}
                                  <span className="sr-only">(select for bulk update)</span>
                                </label>
                              </th>
                              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{pct(r.pricePct)}</td>
                              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                                <div>{fmtM(r.revenue.scen)}</div>
                                <div className={`text-xs font-semibold ${tone(dRev)}`}>
                                  {fmtDeltaM(dRev)} ({pct((dRev / r.revenue.base) * 100)})
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                                <div>{fmtVol(r.volume.scen)}</div>
                                <div className={`text-xs font-semibold ${tone(dVol)}`}>{pct(dVol)}</div>
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                                <div>{fmtM(r.margin.scen)}</div>
                                <div className={`text-xs font-semibold ${tone(dMar)}`}>
                                  {fmtDeltaM(dMar)} ({pct((dMar / r.margin.base) * 100)})
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="px-5 pt-5">
                  <h3 className="text-lg lg:text-xl leading-[1.2] font-semibold">Change vs baseline</h3>
                  <ul className="sr-only">
                    {results.map((r) => (
                      <li key={r.name}>
                        Scenario {r.name}: revenue {fmtDeltaM(r.revenue.scen - r.revenue.base)}, margin {fmtDeltaM(r.margin.scen - r.margin.base)}
                      </li>
                    ))}
                  </ul>
                  <div className="h-48 mt-2" aria-hidden>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} barCategoryGap="30%">
                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                        <YAxis tickFormatter={(v: number) => `£${v}M`} width={52} tick={{ fontSize: 12 }} />
                        <Tooltip formatter={(v: number) => `£${v}M`} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Revenue" fill="var(--brand)" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="Margin" fill="var(--success)" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <details className="group mx-5 mt-4 rounded-lg border border-border">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 min-h-10 text-sm font-medium">
                    Assumptions
                    <span className="text-xs text-muted-foreground group-open:hidden">Model, baseline, cost basis…</span>
                  </summary>
                  <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 border-t border-border px-3 py-3 text-sm">
                    {[
                      ["Model version", source === "MODEL" ? MODEL_VERSION : "Not used"],
                      ["Elasticity", sourceLabel],
                      [
                        "Baseline",
                        baselineKind === "HISTORICAL" ? (
                          `Historical · ${period}`
                        ) : (
                          <RecordLink to="/pricing/price-lists/$id" params={{ id: baseList }}>
                            {PRICE_LISTS.find((l) => l.id === baseList)?.name}
                          </RecordLink>
                        ),
                      ],
                      ["Horizon", `${horizon} months`],
                      ["Cost basis", "Landed + freight"],
                      ["Competitor response", "None assumed"],
                      ["Mix", "Held constant at baseline"],
                    ].map(([k, v]) => (
                      <div key={String(k)} className="flex justify-between gap-3 min-w-0">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="font-medium text-right">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </details>

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4">
                  <span className="text-sm text-muted-foreground">
                    {selected ? (
                      <>
                        Selected: <span className="font-medium text-foreground">{selected}</span>
                      </>
                    ) : (
                      "Pick a scenario in the table"
                    )}
                  </span>
                  <Btn icon={Layers} disabled={!selected || stale} onClick={createBulk} title={!selected ? "Select a scenario first" : stale ? "Run again first — inputs changed" : undefined}>
                    Create bulk update
                  </Btn>
                </div>
              </div>
            )}
          </Card>
        </section>
      </div>

      <TableSection title="Saved simulations" subtitle="Select a row to reopen its inputs. You can undo this from the notification.">
        <DataTable
          caption="Saved simulations"
          numbered={false}
          rows={saved}
          rowKey={(s) => s.id}
          onRowClick={openSaved}
          empty={
            <EmptyState icon={FlaskConical} title="No saved simulations yet">
              Run a simulation, then choose Save to keep it with its inputs.
            </EmptyState>
          }
          columns={[
            { key: "id", header: "ID", className: "whitespace-nowrap", cell: (s) => <span className="font-mono text-xs">{s.id}</span> },
            { key: "name", header: "Name", cell: (s) => <span className="font-medium text-brand-strong">{s.name}</span> },
            { key: "base", header: "Baseline", cell: (s) => s.baseline },
            { key: "h", header: "Horizon", className: "whitespace-nowrap", cell: (s) => `${s.horizonMonths} months` },
            {
              key: "e",
              header: "Elasticity",
              className: "whitespace-nowrap",
              cell: (s) =>
                s.elasticitySource === "MODEL" ? <Tag tone="info">{s.modelVersion}</Tag> : <Flag tone="warning">{humanize(s.elasticitySource)} elasticity, not model output</Flag>,
            },
            {
              key: "sc",
              header: "Scenarios",
              cell: (s) => (
                <ul className="space-y-0.5 text-xs tabular-nums">
                  {s.scenarios.map((x) => (
                    <li key={x.name} className="whitespace-nowrap">
                      <span className="font-semibold text-foreground">{x.name}</span>
                      <span className="text-muted-foreground"> · Rev </span>
                      <span className={tone(x.revenue)}>{fmtDeltaM(x.revenue)}</span>
                      <span className="text-muted-foreground"> · Vol </span>
                      <span className={tone(x.volumePct)}>{pct(x.volumePct, 0)}</span>
                      <span className="text-muted-foreground"> · Margin </span>
                      <span className={tone(x.margin)}>{fmtDeltaM(x.margin)}</span>
                    </li>
                  ))}
                </ul>
              ),
            },
            {
              key: "by",
              header: "Saved by",
              className: "whitespace-nowrap",
              cell: (s) => (
                <div>
                  <div className="text-sm">{s.createdBy}</div>
                  <div className="text-xs text-muted-foreground">{fmtStamp(s.createdAt)}</div>
                </div>
              ),
            },
          ]}
        />
      </TableSection>
    </PricingLayout>
  );
}
