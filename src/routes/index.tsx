import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  X,
} from "lucide-react";
import {
  Bell,
  Calculator as CalcIcon,
  ClipboardList,
  Search,
  Settings,
  LayoutDashboard,
  Users,
  FileText,
  Building2,
  PanelLeft,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Rebate Modeling Calculator · Rebate Ninja" },
      {
        name: "description",
        content:
          "Model multi-layer rebate agreements and run what-if growth scenarios with live Gross Profit impact — Rebate Ninja by AIMDek Technologies.",
      },
      { property: "og:title", content: "Rebate Modeling Calculator · Rebate Ninja" },
      {
        property: "og:description",
        content:
          "Single-account rebate simulator with live GP£ and GP% impact. Built by AIMDek Technologies.",
      },
    ],
  }),
  component: RebateModeling,
});

/* ---------------- Types & helpers ---------------- */

type Scenario = {
  name: string;
  growth: number; // %
  nationalGrowthRebate: number; // %
  targetTurnover: number; // £
  branchGrowthRebate: number; // %
  settlement: number; // £
  mvhr: number; // £
};

const fmtGBP = (n: number) =>
  "£" +
  Math.round(n).toLocaleString("en-GB", { maximumFractionDigits: 0 });

const fmtPct = (n: number) => `${n.toFixed(1)}%`;

/* ---------------- Page ---------------- */

function RebateModeling() {
  // Global EW
  const [fixedEW, setFixedEW] = useState(5);
  const [targetEW, setTargetEW] = useState(5);
  const [nbuRebate, setNbuRebate] = useState(5);
  const [socRebate, setSocRebate] = useState(5);

  // Baseline (Sage actuals)
  const [ewTurnover, setEwTurnover] = useState(1194312);
  const [ewCost, setEwCost] = useState(597834);
  const [socTurnover, setSocTurnover] = useState(4098722);
  const [socCost, setSocCost] = useState(1591683);
  const [nbuTurnover, setNbuTurnover] = useState(357780);
  const [nbuCost, setNbuCost] = useState(203516);

  // Actual baseline scenario (year 0)
  const [actual, setActual] = useState<Scenario>({
    name: "Actual",
    growth: 0,
    nationalGrowthRebate: 1,
    targetTurnover: 1141167,
    branchGrowthRebate: 0,
    settlement: 29858,
    mvhr: 0,
  });

  const [scenarios, setScenarios] = useState<Scenario[]>([
    { name: "Scenario 1", growth: 10, nationalGrowthRebate: 3.5, targetTurnover: 1200000, branchGrowthRebate: 0, settlement: 32844, mvhr: 0 },
    { name: "Scenario 2", growth: 20, nationalGrowthRebate: 3.5, targetTurnover: 1275000, branchGrowthRebate: 2, settlement: 35829, mvhr: 0 },
    { name: "Scenario 3", growth: 30, nationalGrowthRebate: 4.5, targetTurnover: 1400000, branchGrowthRebate: 3, settlement: 38815, mvhr: 0 },
  ]);

  const [calculated, setCalculated] = useState(true);

  const updateScenario = (i: number, patch: Partial<Scenario>) =>
    setScenarios((s) => s.map((sc, idx) => (idx === i ? { ...sc, ...patch } : sc)));

  /* ---- Calculation ---- */
  const ewResults = useMemo(
    () => buildEW(ewTurnover, ewCost, fixedEW, targetEW, [actual, ...scenarios]),
    [ewTurnover, ewCost, fixedEW, targetEW, actual, scenarios]
  );
  const socResults = useMemo(
    () => buildLinear(socTurnover, socCost, socRebate, [actual, ...scenarios], "SOC Rebate"),
    [socTurnover, socCost, socRebate, actual, scenarios]
  );
  const nbuResults = useMemo(
    () => buildLinear(nbuTurnover, nbuCost, nbuRebate, [actual, ...scenarios], "NBU Rebate"),
    [nbuTurnover, nbuCost, nbuRebate, actual, scenarios]
  );

  const totals = useMemo(() => {
    return [actual, ...scenarios].map((_, i) => {
      const t = ewResults.cols[i].turnover + socResults.cols[i].turnover + nbuResults.cols[i].turnover;
      const c = ewResults.cols[i].cost + socResults.cols[i].cost + nbuResults.cols[i].cost;
      const r = ewResults.cols[i].totalRebate + socResults.cols[i].totalRebate + nbuResults.cols[i].totalRebate;
      const gp = t - c - r;
      return { turnover: t, cost: c, rebate: r, gp, gpPct: t ? (gp / t) * 100 : 0 };
    });
  }, [ewResults, socResults, nbuResults, actual, scenarios]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar />
        <main className="flex-1 px-6 py-6 space-y-6">
          <PageHeader onCalculate={() => setCalculated(true)} />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <GlobalConfig
              fixedEW={fixedEW} setFixedEW={setFixedEW}
              targetEW={targetEW} setTargetEW={setTargetEW}
              nbuRebate={nbuRebate} setNbuRebate={setNbuRebate}
              socRebate={socRebate} setSocRebate={setSocRebate}
            />
            <BaselineInputs
              ewTurnover={ewTurnover} setEwTurnover={setEwTurnover}
              ewCost={ewCost} setEwCost={setEwCost}
              socTurnover={socTurnover} setSocTurnover={setSocTurnover}
              socCost={socCost} setSocCost={setSocCost}
              nbuTurnover={nbuTurnover} setNbuTurnover={setNbuTurnover}
              nbuCost={nbuCost} setNbuCost={setNbuCost}
            />
          </div>

          <GrowthConfig
            actual={actual}
            setActual={setActual}
            scenarios={scenarios}
            updateScenario={updateScenario}
          />

          {calculated ? (
            <div className="space-y-6">
              <ResultsTable label="EW" scenarios={[actual, ...scenarios]} result={ewResults} layer="ew" />
              <ResultsTable label="SOC" scenarios={[actual, ...scenarios]} result={socResults} layer="linear" />
              <ResultsTable label="NBU" scenarios={[actual, ...scenarios]} result={nbuResults} layer="linear" />
              <TotalSummary scenarios={[actual, ...scenarios]} totals={totals} />
            </div>
          ) : (
            <EmptyState />
          )}

          <footer className="pt-4 pb-2 text-center text-xs text-muted-foreground">
            Rebate Ninja · Built by <span className="font-semibold text-foreground">AIMDek Technologies</span>
          </footer>
        </main>
      </div>
    </div>
  );
}

/* ---------------- Calculation helpers ---------------- */

type ColResult = {
  turnover: number;
  cost: number;
  rebate: number;
  totalRebate: number;
  gp: number;
  gpPct: number;
  lines: Record<string, number>;
  qualified?: boolean;
};

function projected(base: number, growth: number) {
  return base * (1 + growth / 100);
}

function buildEW(
  baseT: number,
  baseC: number,
  fixedEWPct: number,
  targetEWPct: number,
  scenarios: Scenario[]
) {
  const cols: ColResult[] = scenarios.map((s) => {
    const turnover = projected(baseT, s.growth);
    const cost = projected(baseC, s.growth);
    const fixedRebate = turnover * (fixedEWPct / 100);
    const targetRebate = turnover * (targetEWPct / 100);
    const qualified = turnover >= s.targetTurnover;
    const natGrowth = qualified ? turnover * (s.nationalGrowthRebate / 100) : 0;
    const branchGrowth = turnover * (s.branchGrowthRebate / 100);
    const settlement = s.settlement;
    const mvhr = s.mvhr;
    const totalRebate = fixedRebate + targetRebate + natGrowth + branchGrowth + settlement + mvhr;
    const gp = turnover - cost - totalRebate;
    return {
      turnover,
      cost,
      rebate: totalRebate,
      totalRebate,
      gp,
      gpPct: turnover ? (gp / turnover) * 100 : 0,
      qualified,
      lines: {
        "Fixed EW Rebate": fixedRebate,
        "Target EW Rebate": targetRebate,
        "National Growth Rebate": natGrowth,
        "Branch Growth Incentive": branchGrowth,
        "Settlement Discount": settlement,
        "MVHR Rebate": mvhr,
      },
    };
  });
  return { cols };
}

function buildLinear(
  baseT: number,
  baseC: number,
  ratePct: number,
  scenarios: Scenario[],
  lineLabel: string
) {
  const cols: ColResult[] = scenarios.map((s) => {
    const turnover = projected(baseT, s.growth);
    const cost = projected(baseC, s.growth);
    const rebate = turnover * (ratePct / 100);
    const gp = turnover - cost - rebate;
    return {
      turnover,
      cost,
      rebate,
      totalRebate: rebate,
      gp,
      gpPct: turnover ? (gp / turnover) * 100 : 0,
      lines: { [lineLabel]: rebate },
    };
  });
  return { cols };
}

/* ---------------- Sidebar ---------------- */

const NAV = [
  { icon: Settings, label: "Settings" },
  { icon: CalcIcon, label: "Rebate Modeling", active: true },
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Users, label: "Accounts" },
  { icon: FileText, label: "Rebate Program" },
  { icon: Users, label: "Rebate Program Members" },
  { icon: ClipboardList, label: "Rebate Types" },
  { icon: ShieldCheck, label: "Accruals" },
  { icon: FileText, label: "Payout Periods" },
  { icon: LayoutDashboard, label: "Account Analytics" },
  { icon: ClipboardList, label: "Claim Requests" },
  { icon: ClipboardList, label: "Rebate Claims" },
  { icon: Users, label: "All Qualifiers" },
  { icon: FileText, label: "Payout Details" },
  { icon: Building2, label: "My Rebate Program" },
  { icon: ClipboardList, label: "My Claims" },
  { icon: Building2, label: "Rebate Storefront" },
  { icon: ClipboardList, label: "Placed Orders" },
  { icon: Users, label: "Account Management" },
  { icon: FileText, label: "Supplier Rebate Programs" },
  { icon: ShieldCheck, label: "Program Approval Requests" },
  { icon: Building2, label: "Suppliers" },
  { icon: ClipboardList, label: "Supplier Rebate Types" },
  { icon: Users, label: "Supplier Qualifiers" },
  { icon: ClipboardList, label: "Supplier Rebate Claims" },
];

function Sidebar() {
  return (
    <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border hidden lg:flex flex-col">
      <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-3">
        <div className="size-10 rounded-lg bg-brand grid place-items-center font-black text-brand-foreground text-lg">R</div>
        <div className="leading-tight">
          <div className="font-black tracking-tight text-base">REBATE</div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-brand">ninja</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 text-sm">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = item.active;
          return (
            <button
              key={item.label}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                active
                  ? "bg-brand text-brand-foreground font-semibold"
                  : "hover:bg-sidebar-accent text-sidebar-foreground/80"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

/* ---------------- Top bar ---------------- */

function TopBar() {
  return (
    <header className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-4">
      <button className="lg:hidden p-2 rounded-md hover:bg-muted">
        <PanelLeft className="size-5" />
      </button>
      <div className="flex-1 max-w-2xl relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
          placeholder="Search accounts, programs, scenarios…"
        />
      </div>
      <button className="relative p-2 rounded-md hover:bg-muted">
        <Bell className="size-5" />
        <span className="absolute -top-0.5 -right-0.5 bg-brand text-brand-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5">
          99+
        </span>
      </button>
      <div className="size-9 rounded-full bg-gradient-to-br from-brand to-amber-500 grid place-items-center text-brand-foreground font-semibold text-sm">
        AK
      </div>
    </header>
  );
}

/* ---------------- Page header ---------------- */

function PageHeader({ onCalculate }: { onCalculate: () => void }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rebate Modeling Calculator</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Model a single account's rebate agreement and instantly see the impact on Gross Profit.
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
          <span className="font-semibold text-brand">AWEBB</span>
          <span className="px-2 py-0.5 rounded-full bg-brand-soft text-brand text-xs font-medium border border-brand/20">
            AWB-001
          </span>
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground">Year</label>
            <select className="px-2 py-1 rounded-md border border-input bg-background text-sm">
              <option>2026</option>
              <option>2025</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground">Layer</label>
            <select className="px-2 py-1 rounded-md border border-input bg-background text-sm">
              <option>National</option>
              <option>Regional</option>
              <option>Branch</option>
            </select>
          </div>
        </div>
      </div>
      <button
        onClick={onCalculate}
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-brand text-brand-foreground font-semibold shadow-sm hover:opacity-90 transition"
      >
        <CalcIcon className="size-4" /> Calculate
      </button>
    </div>
  );
}

/* ---------------- Cards ---------------- */

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="font-semibold text-base">
          {title}
          {hint && <span className="text-xs text-muted-foreground font-normal ml-2">{hint}</span>}
        </h2>
      </div>
      {children}
    </section>
  );
}

function NumInput({
  value,
  onChange,
  suffix,
  prefix,
}: {
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  prefix?: string;
}) {
  return (
    <div className="flex items-center rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring/30">
      {prefix && <span className="px-2.5 text-muted-foreground text-sm border-r border-input bg-muted">{prefix}</span>}
      <input
        type="number"
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="flex-1 min-w-0 px-3 py-2 text-sm bg-transparent focus:outline-none"
      />
      {suffix && <span className="px-2.5 text-muted-foreground text-sm border-l border-input bg-muted">{suffix}</span>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function GlobalConfig(props: {
  fixedEW: number; setFixedEW: (n: number) => void;
  targetEW: number; setTargetEW: (n: number) => void;
  nbuRebate: number; setNbuRebate: (n: number) => void;
  socRebate: number; setSocRebate: (n: number) => void;
}) {
  return (
    <Card title="Global EW Configuration">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Fixed EW %">
          <NumInput value={props.fixedEW} onChange={props.setFixedEW} suffix="%" />
        </Field>
        <Field label="Target EW">
          <div className="flex gap-2">
            <select className="px-2 py-2 rounded-md border border-input bg-background text-sm">
              <option>%</option>
              <option>£</option>
            </select>
            <div className="flex-1">
              <NumInput value={props.targetEW} onChange={props.setTargetEW} suffix="%" />
            </div>
          </div>
        </Field>
      </div>
      <div className="mt-5">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          Other Rebate Rates
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="NBU Rebate %">
            <NumInput value={props.nbuRebate} onChange={props.setNbuRebate} suffix="%" />
          </Field>
          <Field label="SOC Rebate %">
            <NumInput value={props.socRebate} onChange={props.setSocRebate} suffix="%" />
          </Field>
        </div>
      </div>
    </Card>
  );
}

function BaselineInputs(props: {
  ewTurnover: number; setEwTurnover: (n: number) => void;
  ewCost: number; setEwCost: (n: number) => void;
  socTurnover: number; setSocTurnover: (n: number) => void;
  socCost: number; setSocCost: (n: number) => void;
  nbuTurnover: number; setNbuTurnover: (n: number) => void;
  nbuCost: number; setNbuCost: (n: number) => void;
}) {
  const Section = ({
    label,
    t, setT, c, setC,
  }: {
    label: string;
    t: number; setT: (n: number) => void;
    c: number; setC: (n: number) => void;
  }) => (
    <div>
      <div className="text-sm font-bold text-brand mb-2">{label}</div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Turnover">
          <NumInput value={t} onChange={setT} prefix="£" />
        </Field>
        <Field label="Cost">
          <NumInput value={c} onChange={setC} prefix="£" />
        </Field>
      </div>
    </div>
  );

  return (
    <Card title="Baseline Financial Inputs" hint="(Current Year Actuals · pulled from Sage)">
      <div className="space-y-4">
        <Section label="EW" t={props.ewTurnover} setT={props.setEwTurnover} c={props.ewCost} setC={props.setEwCost} />
        <Section label="SOC" t={props.socTurnover} setT={props.setSocTurnover} c={props.socCost} setC={props.setSocCost} />
        <Section label="NBU" t={props.nbuTurnover} setT={props.setNbuTurnover} c={props.nbuCost} setC={props.setNbuCost} />
      </div>
    </Card>
  );
}

/* ---------------- Growth scenario table ---------------- */

function GrowthConfig({
  actual,
  setActual,
  scenarios,
  updateScenario,
}: {
  actual: Scenario;
  setActual: (s: Scenario) => void;
  scenarios: Scenario[];
  updateScenario: (i: number, patch: Partial<Scenario>) => void;
}) {
  const rows: {
    label: string;
    field: keyof Scenario;
    suffix?: string;
    prefix?: string;
    actualDisplay?: string;
    editableActual?: boolean;
  }[] = [
    { label: "Growth %", field: "growth", suffix: "%", actualDisplay: "0% (Actual)" },
    { label: "National Growth Rebate %", field: "nationalGrowthRebate", suffix: "%", editableActual: true },
    { label: "Target Turnover", field: "targetTurnover", prefix: "£", editableActual: true },
    { label: "Branch Growth Rebate %", field: "branchGrowthRebate", suffix: "%", editableActual: true },
    { label: "Settlement Discount (£)", field: "settlement", prefix: "£", editableActual: true },
    { label: "MVHR Rebate (£)", field: "mvhr", prefix: "£", editableActual: true },
  ];

  return (
    <Card
      title="Growth Scenario Configuration"
      hint="Set growth %, national growth rebate %, qualifying target, branch growth %, settlement and MVHR per scenario"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-border">
              <th className="py-3 pr-4 font-semibold w-56">Parameter</th>
              <th className="py-3 px-3 font-semibold text-center bg-muted/40 rounded-t-md">Actual</th>
              {scenarios.map((s) => (
                <th key={s.name} className="py-3 px-3 font-semibold text-brand text-center">
                  {s.name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border/60 last:border-0">
                <td className="py-2.5 pr-4 font-medium">
                  {r.label.includes("Target Turnover") ? (
                    <>
                      Target Turnover{" "}
                      <span className="text-xs text-muted-foreground font-normal">(qualifying threshold)</span>
                    </>
                  ) : (
                    r.label
                  )}
                </td>
                <td className="py-2.5 px-3 text-center bg-muted/30">
                  {r.actualDisplay ? (
                    <span className="text-muted-foreground italic text-sm">{r.actualDisplay}</span>
                  ) : r.editableActual ? (
                    <NumInput
                      value={actual[r.field] as number}
                      onChange={(n) => setActual({ ...actual, [r.field]: n })}
                      suffix={r.suffix}
                      prefix={r.prefix}
                    />
                  ) : null}
                </td>
                {scenarios.map((s, i) => (
                  <td key={s.name} className="py-2.5 px-3">
                    <NumInput
                      value={s[r.field] as number}
                      onChange={(n) => updateScenario(i, { [r.field]: n } as Partial<Scenario>)}
                      suffix={r.suffix}
                      prefix={r.prefix}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------------- Results table ---------------- */

function ResultsTable({
  label,
  scenarios,
  result,
  layer,
}: {
  label: string;
  scenarios: Scenario[];
  result: { cols: ColResult[] };
  layer: "ew" | "linear";
}) {
  const colHeader = (s: Scenario, i: number) =>
    i === 0 ? "Actual 2026" : `${s.growth}% Growth`;

  const lineKeys =
    layer === "ew"
      ? [
          "Fixed EW Rebate",
          "Target EW Rebate",
          "National Growth Rebate",
          "Branch Growth Incentive",
          "Settlement Discount",
          "MVHR Rebate",
        ]
      : Object.keys(result.cols[0].lines);

  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-border">
        <span className="inline-block text-xs font-bold uppercase tracking-wider text-brand bg-brand-soft px-2.5 py-1 rounded">
          {label}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left py-3 px-5 font-semibold">Metric</th>
              {scenarios.map((s, i) => (
                <th key={s.name} className="text-right py-3 px-5 font-semibold whitespace-nowrap">
                  {colHeader(s, i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Turnover" values={result.cols.map((c) => fmtGBP(c.turnover))} />
            <Row label="Cost" values={result.cols.map((c) => fmtGBP(c.cost))} />
            {lineKeys.flatMap((k) =>
              k === "National Growth Rebate" && layer === "ew"
                ? [
                    <tr key="qual" className="border-b border-border/60">
                      <td className="py-2.5 px-5 text-muted-foreground">National Growth — Qualification</td>
                      {result.cols.map((c, i) => (
                        <td key={i} className="text-right py-2.5 px-5">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                              c.qualified
                                ? "bg-success-soft text-[oklch(0.4_0.14_155)]"
                                : "bg-destructive/10 text-destructive"
                            }`}
                          >
                            {c.qualified ? "✓" : "✕"} {scenarios[i].nationalGrowthRebate}% (≥ {fmtGBP(scenarios[i].targetTurnover)})
                          </span>
                        </td>
                      ))}
                    </tr>,
                    <Row key={k} label={k} values={result.cols.map((c) => fmtGBP(c.lines[k]))} />,
                  ]
                : [
                    <Row key={k} label={k} values={result.cols.map((c) => fmtGBP(c.lines[k] ?? 0))} />,
                  ]
            )}
            <Row
              label="Total Rebate"
              values={result.cols.map((c) => fmtGBP(c.totalRebate))}
              accent="brand"
            />
            <Row label="Gross Profit" values={result.cols.map((c) => fmtGBP(c.gp))} accent="success" />
            <Row label="GP %" values={result.cols.map((c) => fmtPct(c.gpPct))} accent="success" />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({
  label,
  values,
  accent,
}: {
  label: string;
  values: string[];
  accent?: "brand" | "success";
}) {
  const colorClass =
    accent === "brand"
      ? "text-brand font-semibold bg-brand-soft/40"
      : accent === "success"
      ? "text-[oklch(0.4_0.14_155)] font-semibold bg-success-soft/50"
      : "";
  return (
    <tr className={`border-b border-border/60 last:border-0 ${colorClass}`}>
      <td className="py-2.5 px-5">{label}</td>
      {values.map((v, i) => (
        <td key={i} className="text-right py-2.5 px-5 tabular-nums whitespace-nowrap">
          {v}
        </td>
      ))}
    </tr>
  );
}

/* ---------------- Total summary ---------------- */

function TotalSummary({
  scenarios,
  totals,
}: {
  scenarios: Scenario[];
  totals: { turnover: number; cost: number; rebate: number; gp: number; gpPct: number }[];
}) {
  return (
    <section className="bg-card border-2 border-brand/30 rounded-xl overflow-hidden shadow-md">
      <div className="px-5 py-3 border-b border-border bg-brand-soft/30">
        <h3 className="font-bold text-base">Total Summary <span className="text-muted-foreground font-normal text-sm">(EW + SOC + NBU)</span></h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left py-3 px-5 font-semibold">Metric</th>
              {scenarios.map((s, i) => (
                <th key={s.name} className="text-right py-3 px-5 font-semibold whitespace-nowrap">
                  {i === 0 ? "Actual 2026" : `${s.growth}% Growth`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Total Turnover" values={totals.map((t) => fmtGBP(t.turnover))} />
            <Row label="Total Cost" values={totals.map((t) => fmtGBP(t.cost))} />
            <Row label="Total Rebate" values={totals.map((t) => fmtGBP(t.rebate))} accent="brand" />
            <Row label="Total Gross Profit" values={totals.map((t) => fmtGBP(t.gp))} accent="success" />
            <Row label="GP %" values={totals.map((t) => fmtPct(t.gpPct))} accent="success" />
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- Empty state ---------------- */

function EmptyState() {
  return (
    <div className="bg-card border border-dashed border-border rounded-xl py-16 px-6 text-center">
      <div className="size-12 mx-auto rounded-lg bg-brand-soft text-brand grid place-items-center mb-3">
        <ClipboardList className="size-6" />
      </div>
      <h3 className="font-semibold text-lg">Ready to Calculate</h3>
      <p className="text-sm text-muted-foreground mt-1">
        Configure the rebate parameters and growth scenarios above, then click <span className="font-semibold text-foreground">Calculate</span>.
      </p>
    </div>
  );
}
