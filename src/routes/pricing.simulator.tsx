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
  InfoBanner,
  humanize,
  ListHeader,
  PricingLayout,
  RecordLink,
  Tag,
  inputCls,
  notifyUndo,
  pct,
  type ApiError,
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

const fmtM = (n: number) => `${n < 0 ? "−" : ""}$${(Math.abs(n) / 1_000_000).toFixed(2)}M`;
const fmtDeltaM = (n: number) => `${n >= 0 ? "+" : "−"}$${(Math.abs(n) / 1_000_000).toFixed(1)}M`;

let nextId = 3;

/** "2026-10-27 16:00" -> "27 Oct 2026, 16:00" without Date parsing (deterministic on server and client). */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtStamp(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(s);
  if (!m) return s;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}${m[4] ? `, ${m[4]}` : ""}`;
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

  const sourceLabel =
    source === "MANUAL" ? "manual elasticity, not model output" : source === "DEFAULT" ? "default elasticity, not model output" : `model ${MODEL_VERSION}`;

  const h = Number(horizon);
  const horizonError = !horizon || !Number.isInteger(h) || h < 1 || h > 36 ? "Enter a whole number of months between 1 and 36, e.g. 12." : undefined;
  const mE = Number(manualE);
  const manualError = source === "MANUAL" && !(mE >= 0.1 && mE <= 5) ? "Enter an elasticity between 0.1 and 5.0, e.g. 0.8." : undefined;
  const nameError = !name.trim() ? "Name the simulation so it can be saved and found later." : undefined;
  const firstBadScenario = scenarios.find((s) => scenarioError(s));
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
    setTimeout(() => {
      setResults(scenarios.map((s) => simulate(s, source, Number(manualE))));
      setSelected(scenarios[0]?.name ?? null);
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
    const snap = { name, baselineKind, period, baseList, horizon, source, manualE, scenarios, results, selected };
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
      createdAt: "2026-10-29 14:30",
      scenarios: results.map((r) => ({
        name: r.name,
        change: `${r.pricePct.toFixed(1)}%`,
        revenue: r.revenue.scen - r.revenue.base,
        volumePct: ((r.volume.scen - r.volume.base) / r.volume.base) * 100,
        margin: r.margin.scen - r.margin.base,
      })),
    };
    setSaved((s) => [sim, ...s]);
    toast.success(`${sim.id} saved`, { description: "Stored with user, timestamp and inputs." });
  };

  const createBulk = () => {
    const r = results?.find((x) => x.name === selected);
    if (!r) return;
    toast.success("Bulk update preview opened", { description: `Same scope and a ${r.pricePct.toFixed(1)}% adjustment from scenario "${r.name}".` });
    navigate({ to: "/pricing/bulk-update" });
  };

  const update = (id: number, patch: Partial<ScenarioInput>) => setScenarios((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const chartData = results?.map((r) => ({
    name: r.name,
    Revenue: +((r.revenue.scen - r.revenue.base) / 1_000_000).toFixed(2),
    Margin: +((r.margin.scen - r.margin.base) / 1_000_000).toFixed(2),
  }));

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Price optimization" }, { label: "Scenario simulator" }]}>
      <ListHeader
        title="Scenario simulator"
        subtitle="Compare projected revenue, volume and margin before changing prices."
        actions={
          <>
            <Btn variant="subtle" icon={RotateCcw} onClick={resetToBaseline} disabled={running}>
              Reset to baseline
            </Btn>
            <Btn
              variant="outline"
              icon={Save}
              onClick={save}
              disabled={!results || !!nameError || running}
              title={!results ? "Run the simulation before saving" : nameError ? "Name the simulation before saving" : undefined}
            >
              Save simulation
            </Btn>
            <Btn icon={Play} onClick={run} loading={running} disabled={!!runBlocker} aria-describedby={runBlocker ? "sim-run-blocker" : undefined}>
              {running ? "Running…" : "Run simulation"}
            </Btn>
          </>
        }
      />
      {runBlocker && (
        <p id="sim-run-blocker" className="text-sm text-destructive -mt-2 mb-4" role="status">
          {runBlocker}
        </p>
      )}
      <ErrorBanner error={err} onClose={() => setErr(null)} />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6 xl:items-start" onKeyDown={onConfigKeyDown}>
        <Card title="Baseline and assumptions" className="xl:col-span-1">
          <div className="space-y-4">
            <Field label="Simulation name" required error={nameError}>
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} maxLength={80} />
            </Field>
            <div className="flex flex-col gap-1.5" role="group" aria-labelledby="sim-baseline-label">
              <span id="sim-baseline-label" className="text-sm font-medium text-foreground">
                Baseline
              </span>
              <div className="flex flex-wrap gap-2">
                {(["HISTORICAL", "PRICE_LIST"] as const).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={baselineKind === k}
                    onClick={() => setBaselineKind(k)}
                    className={`flex-1 min-w-[140px] h-10 rounded-lg border text-sm font-medium ${baselineKind === k ? "bg-navy text-navy-foreground border-navy" : "bg-card border-border hover:bg-muted"}`}
                  >
                    {k === "HISTORICAL" ? "Historical period" : "Current price list"}
                  </button>
                ))}
              </div>
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
            <Field label="Elasticity source">
              <select value={source} onChange={(e) => setSource(e.target.value as ElasticitySource)} className={inputCls}>
                <option value="MODEL">Model — {MODEL_VERSION}</option>
                <option value="MANUAL">Manual — enter value</option>
                <option value="DEFAULT">Default — {DEFAULT_ELASTICITY.toFixed(1)}</option>
              </select>
            </Field>
            {source === "MANUAL" && (
              <Field label="Manual elasticity (absolute)" required hint="0.1 to 5.0 — higher means demand reacts more to price" error={manualError}>
                <input type="number" step="0.1" min={0.1} max={5} inputMode="decimal" value={manualE} onChange={(e) => setManualE(e.target.value)} className={inputCls} />
              </Field>
            )}
            {source !== "MODEL" && <Flag tone="warning">{sourceLabel.charAt(0).toUpperCase() + sourceLabel.slice(1)}</Flag>}
          </div>
        </Card>

        <Card
          title="Scenarios"
          subtitle="Up to 5 changes applied to the baseline."
          className="xl:col-span-2"
          actions={
            <Btn
              variant="outline"
              size="sm"
              icon={Plus}
              disabled={scenarios.length >= 5}
              onClick={() => setScenarios((s) => [...s, { id: nextId++, name: `${String.fromCharCode(65 + s.length)} `, kind: "PERCENT", value: "" }])}
            >
              Add scenario ({scenarios.length}/5)
            </Btn>
          }
        >
          <div className="space-y-3">
            {scenarios.map((s) => {
              const se = scenarioError(s);
              return (
              <div key={s.id} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-3 items-start rounded-lg border border-border p-3">
                <Field label="Name" required error={se?.field === "name" ? se.message : undefined}>
                  <input value={s.name} onChange={(e) => update(s.id, { name: e.target.value })} className={inputCls} maxLength={40} />
                </Field>
                <Field label="Change type">
                  <select value={s.kind} onChange={(e) => update(s.id, { kind: e.target.value as ScenarioKind })} className={inputCls}>
                    <option value="PERCENT">Percent</option>
                    <option value="ABSOLUTE">Absolute ($ per unit)</option>
                    <option value="TARGET_MARGIN">Target margin %</option>
                    <option value="SWAP_LIST">Swap to price list</option>
                  </select>
                </Field>
                {s.kind === "SWAP_LIST" ? (
                  <Field label="Price list">
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
                    label={s.kind === "PERCENT" ? "Value %" : s.kind === "ABSOLUTE" ? "Value $" : "Target %"}
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
                    />
                  </Field>
                )}
                <Btn
                  variant="ghost"
                  icon={Trash2}
                  className="sm:mt-6"
                  aria-label={`Remove scenario ${s.name}`}
                  title={scenarios.length <= 1 ? "At least one scenario is required" : `Remove scenario ${s.name}`}
                  disabled={scenarios.length <= 1}
                  onClick={() => removeScenario(s)}
                />
              </div>
              );
            })}
          </div>
        </Card>
      </div>

      {results && (
        <section aria-labelledby="sim-results-h">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
            <h2 id="sim-results-h" className="text-lg font-semibold tracking-tight">
              Results
            </h2>
            <p role="status" className="text-sm text-muted-foreground">
              {running ? "Recalculating…" : `Updated ${updatedAt ?? "just now"} · ${results.length} ${results.length === 1 ? "scenario" : "scenarios"}`}
            </p>
          </div>
          <InfoBanner tone="warning" title="Estimate">
            Projected over {horizon} months. Elasticity: <b>{sourceLabel}</b>. Outputs are estimates, not commitments.
          </InfoBanner>
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
            <Card
              title={
                <span className="flex items-center gap-2">
                  Side-by-side comparison <Tag tone="warning">Estimate</Tag>
                </span>
              }
              className="xl:col-span-2"
              padded={false}
            >
              <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Scenario comparison table">
                <table className="w-full text-sm">
                  <caption className="sr-only">Baseline versus each scenario: projected value and change for revenue, volume and margin</caption>
                  <thead>
                    <tr className="bg-navy text-navy-foreground">
                      <th scope="col" className="px-4 py-3.5 text-left font-semibold">Metric</th>
                      <th scope="col" className="px-4 py-3.5 text-right font-semibold">Baseline</th>
                      {results.map((r) => (
                        <th key={r.name} scope="colgroup" className="px-4 py-3.5 text-right font-semibold whitespace-nowrap" colSpan={2}>
                          <label className="inline-flex items-center gap-2 cursor-pointer">
                            <input type="radio" name="sel" checked={selected === r.name} onChange={() => setSelected(r.name)} className="accent-[var(--brand)]" />
                            Scenario {r.name}
                            <span className="sr-only">(projected value, then change)</span>
                          </label>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(["revenue", "volume", "margin"] as const).map((m) => (
                      <tr key={m}>
                        <th scope="row" className="px-4 py-3 font-medium capitalize text-left">{m}</th>
                        <td className="px-4 py-3 text-right tabular-nums bg-muted/40">
                          {m === "volume" ? `${(results[0][m].base / 1_000_000).toFixed(2)}M units` : fmtM(results[0][m].base)}
                        </td>
                        {results.map((r) => {
                          const d = r[m].scen - r[m].base;
                          const dp = (d / r[m].base) * 100;
                          return [
                            <td key={r.name + "s"} className="px-4 py-3 text-right tabular-nums">
                              {m === "volume" ? `${(r[m].scen / 1_000_000).toFixed(2)}M` : fmtM(r[m].scen)}
                            </td>,
                            <td key={r.name + "d"} className={`px-4 py-3 text-right tabular-nums font-semibold ${d >= 0 ? "text-success" : "text-destructive"}`}>
                              {m === "volume" ? pct(dp) : `${fmtDeltaM(d)} (${pct(dp)})`}
                            </td>,
                          ];
                        })}
                      </tr>
                    ))}
                    <tr className="bg-muted/30 text-xs text-muted-foreground">
                      <th scope="row" className="px-4 py-2 text-left font-normal">Effective price change</th>
                      <td className="px-4 py-2 text-right">—</td>
                      {results.map((r) => (
                        <td key={r.name} colSpan={2} className="px-4 py-2 text-right">
                          {pct(r.pricePct)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4 border-t border-border">
                <span className="text-sm text-muted-foreground">Selected scenario: {selected ?? "— choose one in the table header"}</span>
                <Btn icon={Layers} disabled={!selected} onClick={createBulk} title={!selected ? "Select a scenario first" : undefined}>
                  Create bulk update
                </Btn>
              </div>
            </Card>

            <Card title="Assumptions">
              <dl className="text-sm space-y-2.5">
                {[
                  ["Model version", MODEL_VERSION],
                  ["Elasticity source", sourceLabel],
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
                  <div key={String(k)} className="flex justify-between gap-3">
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className="font-medium text-right">{v}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          </div>

          <Card title="Change vs baseline ($M)" subtitle="Estimate — same figures as the comparison table" className="mb-6">
            <ul className="sr-only">
              {results.map((r) => (
                <li key={r.name}>
                  Scenario {r.name}: revenue {fmtDeltaM(r.revenue.scen - r.revenue.base)}, margin {fmtDeltaM(r.margin.scen - r.margin.base)}
                </li>
              ))}
            </ul>
            <div className="h-72" aria-hidden>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="name" />
                  <YAxis />
                  <Tooltip formatter={(v: number) => `$${v}M`} />
                  <Legend />
                  <Bar dataKey="Revenue" fill="var(--brand)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Margin" fill="var(--success)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        </section>
      )}

      {!results && (
        <Card className="mb-6">
          <div role="status">
            <EmptyState icon={FlaskConical} title={running ? "Running simulation…" : "No results yet"}>
              Configure a baseline and scenarios, then run the simulation. Results show revenue, volume and margin as baseline, scenario and change.
            </EmptyState>
          </div>
        </Card>
      )}

      <h2 className="text-lg font-semibold tracking-tight mb-4">Saved simulations</h2>
      <DataTable
        caption="Saved simulations"
        numbered={false}
        rows={saved}
        rowKey={(s) => s.id}
        empty={
          <EmptyState icon={FlaskConical} title="No saved simulations yet">
            Run a simulation, then choose Save simulation to keep it with its inputs.
          </EmptyState>
        }
        columns={[
          { key: "id", header: "ID", className: "whitespace-nowrap", cell: (s) => <span className="font-mono text-xs">{s.id}</span> },
          { key: "name", header: "Name", cell: (s) => <span className="font-medium">{s.name}</span> },
          { key: "base", header: "Baseline", cell: (s) => s.baseline },
          { key: "h", header: "Horizon", className: "whitespace-nowrap", cell: (s) => `${s.horizonMonths} months` },
          {
            key: "e",
            header: "Elasticity",
            cell: (s) =>
              s.elasticitySource === "MODEL" ? <Tag tone="info">{s.modelVersion}</Tag> : <Flag tone="warning">{humanize(s.elasticitySource)} elasticity, not model output</Flag>,
          },
          {
            key: "sc",
            header: "Scenarios",
            cell: (s) => (
              <div className="text-xs">
                {s.scenarios.map((x) => (
                  <div key={x.name}>
                    <b>{x.name}</b>: Rev {fmtDeltaM(x.revenue)}, Vol {pct(x.volumePct, 0)}, Margin {fmtDeltaM(x.margin)}
                  </div>
                ))}
              </div>
            ),
          },
          {
            key: "by",
            header: "Saved by",
            className: "whitespace-nowrap",
            cell: (s) => (
              <span className="text-xs text-muted-foreground">
                {s.createdBy}
                <br />
                {fmtStamp(s.createdAt)}
              </span>
            ),
          },
        ]}
      />
    </PricingLayout>
  );
}
