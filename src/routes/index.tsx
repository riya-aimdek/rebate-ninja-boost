import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  X,
  Plus,
  Trash2,
  Sparkles,
  HelpCircle,
  Download,
  Lock,
  Bookmark,
  ChevronDown,
  ChevronUp,
  Calculator as CalcIcon,
  Bell,
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
          "Model multi-layer rebate agreements, save scenarios, and compare variance with live Gross Profit impact.",
      },
      { property: "og:title", content: "Rebate Modeling Calculator · Rebate Ninja" },
      {
        property: "og:description",
        content:
          "Single-account rebate simulator with live GP£ and GP% impact, saved scenarios and variance analysis.",
      },
    ],
  }),
  component: RebateModeling,
});

/* ---------------- Types & helpers ---------------- */

type RebateType = "Fixed" | "Growth" | "Targeted" | "Mixed";
type LayerScope = "National" | "Regional" | "Branch";
type SaleType = "All" | "Social Housing" | "Electrical Wholesale";

type Scenario = {
  name: string;
  growth: number;
  nationalGrowthRebate: number;
  targetTurnover: number;
  branchGrowthRebate: number;
  settlement: number;
  mvhr: number;
  type: RebateType;
  scope: LayerScope;
  saleType: SaleType;
};

type SavedScenario = {
  id: string;
  name: string;
  savedAt: string; // ISO
  savedBy: string;
  payload: PersistShape;
};

type PersistShape = {
  fixedEW: number; targetEW: number; nbuRebate: number; socRebate: number;
  ewTurnover: number; ewCost: number;
  socTurnover: number; socCost: number;
  nbuTurnover: number; nbuCost: number;
  actual: Scenario;
  scenarios: Scenario[];
  year: string; account: string;
};

const fmtGBP = (n: number) =>
  "£" + Math.round(n).toLocaleString("en-GB", { maximumFractionDigits: 0 });
const fmtSignedGBP = (n: number) =>
  (n >= 0 ? "+" : "−") + "£" + Math.round(Math.abs(n)).toLocaleString("en-GB");
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

const ACCOUNT_NAMES: Record<string, { full: string; code: string }> = {
  AWEBB: { full: "A. Webb (Plumbing) Ltd", code: "AWB-001" },
  BMICO: { full: "BMI Co.", code: "BMI-002" },
  CRESTA: { full: "Cresta Holdings", code: "CRS-003" },
  DELTA: { full: "Delta Trading", code: "DLT-004" },
};

const TYPE_CHIP: Record<RebateType | "Settlement", { bg: string; fg: string }> = {
  Fixed:      { bg: "#E6F1FB", fg: "#0C447C" },
  Growth:     { bg: "#FAEEDA", fg: "#633806" },
  Targeted:   { bg: "#EEEDFE", fg: "#3C3489" },
  Settlement: { bg: "#F1EFE8", fg: "#444441" },
  Mixed:      { bg: "#E1F5EE", fg: "#085041" },
};

function TypeChip({ type, onClick }: { type: RebateType | "Settlement"; onClick?: () => void }) {
  const c = TYPE_CHIP[type];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      style={{ background: c.bg, color: c.fg, padding: "2px 8px", fontSize: 10, borderRadius: 4, fontWeight: 500 }}
      className={`inline-flex items-center leading-none ${onClick ? "cursor-pointer hover:opacity-80" : "cursor-default"}`}
    >
      {type}
    </button>
  );
}

function StatusLabel({ kind, children }: { kind: "qualified" | "warning" | "negative"; children: ReactNode }) {
  const style =
    kind === "qualified"
      ? { background: "#EAF3DE", color: "#27500A" }
      : kind === "warning"
      ? { background: "#FAEEDA", color: "#854F0B" }
      : { background: "#FCEBEB", color: "#791F1F" };
  return (
    <span style={{ ...style, padding: "2px 8px", fontSize: 10, borderRadius: 4, fontWeight: 500 }} className="inline-flex items-center leading-none">
      {children}
    </span>
  );
}

/* ---------------- Page ---------------- */

function RebateModeling() {
  // Global EW
  const [fixedEW, setFixedEW] = useState(5);
  const [targetEW, setTargetEW] = useState(5);
  const [nbuRebate, setNbuRebate] = useState(5);
  const [socRebate, setSocRebate] = useState(5);

  // Baseline (Sage actuals — locked)
  const [ewTurnover, setEwTurnover] = useState(1194312);
  const [ewCost, setEwCost] = useState(597834);
  const [socTurnover, setSocTurnover] = useState(4098722);
  const [socCost, setSocCost] = useState(1591683);
  const [nbuTurnover, setNbuTurnover] = useState(357780);
  const [nbuCost, setNbuCost] = useState(203516);

  const [actual, setActual] = useState<Scenario>({
    name: "Actual",
    growth: 0,
    nationalGrowthRebate: 1,
    targetTurnover: 1141167,
    branchGrowthRebate: 0,
    settlement: 29858,
    mvhr: 0,
    type: "Fixed",
    scope: "National",
    saleType: "All",
  });

  const [scenarios, setScenarios] = useState<Scenario[]>([
    { name: "Scenario 1", growth: 10, nationalGrowthRebate: 3.5, targetTurnover: 1200000, branchGrowthRebate: 0, settlement: 32844, mvhr: 0, type: "Growth", scope: "National", saleType: "All" },
    { name: "Scenario 2", growth: 20, nationalGrowthRebate: 3.5, targetTurnover: 1275000, branchGrowthRebate: 2, settlement: 35829, mvhr: 0, type: "Mixed", scope: "Regional", saleType: "All" },
    { name: "Scenario 3", growth: 30, nationalGrowthRebate: 4.5, targetTurnover: 1400000, branchGrowthRebate: 3, settlement: 38815, mvhr: 0, type: "Targeted", scope: "Branch", saleType: "Social Housing" },
  ]);

  // UX state
  const [calculated, setCalculated] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Header context
  const [year, setYear] = useState("2026");
  const [account, setAccount] = useState("AWEBB");
  const [activeNav, setActiveNav] = useState("Rebate Modeling");
  const [search, setSearch] = useState("");
  const [activeLevel, setActiveLevel] = useState<LayerScope>("National");
  const [activeView, setActiveView] = useState<"modelling" | "variance">("modelling");

  // Saved scenarios
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [loadedScenarioName, setLoadedScenarioName] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Export proposal modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Active scenario index in results tab strip
  const [activeScenarioIdx, setActiveScenarioIdx] = useState(0);

  // Persistence
  const STORAGE_KEY = "rebate-ninja:modeling:v4";
  const SAVED_KEY = "rebate-ninja:saved:v1";
  const restoredRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.fixedEW !== undefined) setFixedEW(s.fixedEW);
        if (s.targetEW !== undefined) setTargetEW(s.targetEW);
        if (s.nbuRebate !== undefined) setNbuRebate(s.nbuRebate);
        if (s.socRebate !== undefined) setSocRebate(s.socRebate);
        if (s.ewTurnover !== undefined) setEwTurnover(s.ewTurnover);
        if (s.ewCost !== undefined) setEwCost(s.ewCost);
        if (s.socTurnover !== undefined) setSocTurnover(s.socTurnover);
        if (s.socCost !== undefined) setSocCost(s.socCost);
        if (s.nbuTurnover !== undefined) setNbuTurnover(s.nbuTurnover);
        if (s.nbuCost !== undefined) setNbuCost(s.nbuCost);
        if (s.actual) setActual({ ...actual, ...s.actual });
        if (Array.isArray(s.scenarios) && s.scenarios.length) {
          setScenarios(s.scenarios.map((sc: Partial<Scenario>) => ({
            type: "Growth", scope: "National", saleType: "All", ...sc,
          })) as Scenario[]);
        }
        if (s.year) setYear(s.year);
        if (s.account) setAccount(s.account);
      }
      const savedRaw = localStorage.getItem(SAVED_KEY);
      if (savedRaw) setSavedScenarios(JSON.parse(savedRaw));
    } catch {/* ignore */}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !restoredRef.current) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        fixedEW, targetEW, nbuRebate, socRebate,
        ewTurnover, ewCost, socTurnover, socCost, nbuTurnover, nbuCost,
        actual, scenarios, year, account,
      }));
    } catch {/* ignore */}
  }, [fixedEW, targetEW, nbuRebate, socRebate, ewTurnover, ewCost, socTurnover, socCost, nbuTurnover, nbuCost, actual, scenarios, year, account]);

  useEffect(() => {
    if (typeof window === "undefined" || !restoredRef.current) return;
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(savedScenarios)); } catch {/* ignore */}
  }, [savedScenarios]);

  // Mark working copy on any change after a scenario was loaded
  const markEdit = () => {
    if (loadedScenarioName) {
      setLoadedScenarioName(null);
      setBannerDismissed(false);
      setToast("Created a new working copy");
    }
  };

  const updateScenario = (i: number, patch: Partial<Scenario>) => {
    setScenarios((s) => s.map((sc, idx) => (idx === i ? { ...sc, ...patch } : sc)));
    markEdit();
  };

  const addScenario = () => {
    if (scenarios.length >= 3) {
      setToast("Maximum 3 scenarios reached");
      return;
    }
    setScenarios((s) => {
      const next = s[s.length - 1];
      return [
        ...s,
        {
          name: `Scenario ${s.length + 1}`,
          growth: (next?.growth ?? 0) + 10,
          nationalGrowthRebate: next?.nationalGrowthRebate ?? 3.5,
          targetTurnover: Math.round((next?.targetTurnover ?? 1200000) * 1.1),
          branchGrowthRebate: next?.branchGrowthRebate ?? 0,
          settlement: Math.round((next?.settlement ?? 30000) * 1.05),
          mvhr: next?.mvhr ?? 0,
          type: "Growth",
          scope: "National",
          saleType: "All",
        },
      ];
    });
    markEdit();
  };

  const removeScenario = (idx: number) => {
    setScenarios((s) =>
      s.filter((_, i) => i !== idx).map((sc, i) => ({ ...sc, name: `Scenario ${i + 1}` }))
    );
    if (activeScenarioIdx > idx) setActiveScenarioIdx((v) => v - 1);
    markEdit();
  };

  /* ---- Calculation (live) ---- */
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

  const bestScenarioIdx = useMemo(() => {
    if (!totals.length) return 0;
    let best = 0;
    for (let i = 1; i < totals.length; i++) if (totals[i].gp > totals[best].gp) best = i;
    return best;
  }, [totals]);

  // Level qualification — does any scenario at this layer qualify?
  const levelQualifies = (level: LayerScope) => {
    return scenarios.some((s) => s.scope === level && ewResults.cols[scenarios.indexOf(s) + 1]?.qualified);
  };

  const handleCalculate = () => {
    setCalculating(true);
    setTimeout(() => {
      setCalculated(true);
      setCalculating(false);
      setActiveScenarioIdx(bestScenarioIdx);
      setToast("Calculation complete");
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }, 350);
  };

  // Save scenario flow
  const openSave = () => {
    if (savedScenarios.length >= 5) return;
    setSaveName(`${account} ${year} - Option ${String.fromCharCode(65 + savedScenarios.length)}`);
    setShowSaveModal(true);
  };
  const confirmSave = () => {
    if (!saveName.trim()) return;
    const snapshot: SavedScenario = {
      id: Math.random().toString(36).slice(2),
      name: saveName.trim(),
      savedAt: new Date().toISOString(),
      savedBy: "You",
      payload: {
        fixedEW, targetEW, nbuRebate, socRebate,
        ewTurnover, ewCost, socTurnover, socCost, nbuTurnover, nbuCost,
        actual, scenarios, year, account,
      },
    };
    setSavedScenarios((arr) => [snapshot, ...arr].slice(0, 5));
    setShowSaveModal(false);
    setToast(`Saved "${snapshot.name}"`);
  };
  const loadSaved = (s: SavedScenario) => {
    const p = s.payload;
    setFixedEW(p.fixedEW); setTargetEW(p.targetEW); setNbuRebate(p.nbuRebate); setSocRebate(p.socRebate);
    setEwTurnover(p.ewTurnover); setEwCost(p.ewCost);
    setSocTurnover(p.socTurnover); setSocCost(p.socCost);
    setNbuTurnover(p.nbuTurnover); setNbuCost(p.nbuCost);
    setActual(p.actual); setScenarios(p.scenarios);
    setYear(p.year); setAccount(p.account);
    setLoadedScenarioName(s.name);
    setBannerDismissed(false);
    setSavedOpen(false);
    setToast(`Loaded "${s.name}" · read-only`);
  };
  const deleteSaved = (id: string) => {
    setSavedScenarios((arr) => arr.filter((s) => s.id !== id));
  };

  const confirmExport = () => {
    setExporting(true);
    setTimeout(() => {
      setExporting(false);
      setShowExportModal(false);
      window.print();
    }, 1200);
  };

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  // sticky bar visibility — hide when results in view
  const [resultsVisible, setResultsVisible] = useState(false);
  useEffect(() => {
    if (!calculated || !resultsRef.current) return;
    const io = new IntersectionObserver(
      ([entry]) => setResultsVisible(entry.isIntersecting),
      { rootMargin: "-20% 0px -20% 0px", threshold: 0 }
    );
    io.observe(resultsRef.current);
    return () => io.disconnect();
  }, [calculated]);

  const activeScenarioLabel =
    activeScenarioIdx === 0
      ? "Actual baseline"
      : `Scenario ${activeScenarioIdx} (${scenarios[activeScenarioIdx - 1]?.growth ?? 0}% Growth)`;

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar active={activeNav} onSelect={setActiveNav} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar search={search} onSearch={setSearch} account={account} />

        <main className="flex-1 px-6 py-6 space-y-6 max-w-[1400px] w-full mx-auto">
          <PageHeader
            year={year} setYear={setYear}
            account={account} setAccount={setAccount}
            activeLevel={activeLevel} setActiveLevel={setActiveLevel}
            savedCount={savedScenarios.length}
            savedScenarios={savedScenarios}
            savedOpen={savedOpen} setSavedOpen={setSavedOpen}
            onLoadSaved={loadSaved}
            onDeleteSaved={deleteSaved}
            onOpenSave={openSave}
            onCalculate={handleCalculate}
            calculating={calculating}
            calculated={calculated}
            onExport={() => setShowExportModal(true)}
            levelQualifies={levelQualifies}
            scenarios={scenarios}
            ewResults={ewResults}
          />

          {loadedScenarioName && !bannerDismissed && (
            <div
              style={{ background: "#FAEEDA", color: "#633806" }}
              className="rounded-lg px-4 py-2.5 flex items-center gap-3 text-sm"
            >
              <Bookmark className="size-4 shrink-0" />
              <div className="flex-1">
                <span className="font-semibold">Viewing saved scenario: {loadedScenarioName}</span>
                <span className="ml-2 opacity-80">· Read-only — edit any field to create a new working copy</span>
              </div>
              <button onClick={() => setBannerDismissed(true)} className="hover:opacity-70">
                <X className="size-4" />
              </button>
            </div>
          )}

          <ViewTabs active={activeView} onChange={setActiveView} />

          {activeView === "modelling" ? (
            <>
              <GlobalConfig
                fixedEW={fixedEW} setFixedEW={(n) => { setFixedEW(n); markEdit(); }}
                targetEW={targetEW} setTargetEW={(n) => { setTargetEW(n); markEdit(); }}
                nbuRebate={nbuRebate} setNbuRebate={(n) => { setNbuRebate(n); markEdit(); }}
                socRebate={socRebate} setSocRebate={(n) => { setSocRebate(n); markEdit(); }}
              />

              <BaselineInputs
                ewTurnover={ewTurnover} ewCost={ewCost}
                socTurnover={socTurnover} socCost={socCost}
                nbuTurnover={nbuTurnover} nbuCost={nbuCost}
              />

              <GrowthConfig
                actual={actual}
                setActual={(s) => { setActual(s); markEdit(); }}
                scenarios={scenarios}
                updateScenario={updateScenario}
                addScenario={addScenario}
                removeScenario={removeScenario}
              />

              <div ref={resultsRef} className="scroll-mt-32">
                {!calculated ? (
                  <ReadyToCalculate onCalculate={handleCalculate} calculating={calculating} />
                ) : (
                  <ResultsArea
                    actual={actual}
                    scenarios={scenarios}
                    ewResults={ewResults}
                    socResults={socResults}
                    nbuResults={nbuResults}
                    totals={totals}
                    bestIdx={bestScenarioIdx}
                    activeIdx={activeScenarioIdx}
                    setActiveIdx={setActiveScenarioIdx}
                    onExport={() => setShowExportModal(true)}
                  />
                )}
              </div>
            </>
          ) : (
            <VarianceAnalysis
              actual={actual}
              ewResults={ewResults}
              socResults={socResults}
              nbuResults={nbuResults}
              totals={totals}
              ewTurnover={ewTurnover} ewCost={ewCost}
              socTurnover={socTurnover} socCost={socCost}
              nbuTurnover={nbuTurnover} nbuCost={nbuCost}
            />
          )}

          <footer className="pt-4 pb-2 text-center text-xs text-muted-foreground">
            Rebate Modeling Calculator
          </footer>

          {calculated && activeView === "modelling" && (
            <div
              className={`sticky bottom-0 -mx-6 px-6 pb-3 pt-3 z-30 transition-all duration-300 ${
                resultsVisible ? "opacity-0 translate-y-4 pointer-events-none" : "opacity-100 translate-y-0"
              }`}
            >
              <BottomKPIBar
                totals={totals}
                account={account}
                subLabel={`${account} · ${activeScenarioLabel}`}
                activeIdx={activeScenarioIdx}
                onCalculate={handleCalculate}
                calculating={calculating}
              />
            </div>
          )}
        </main>
      </div>

      {showSaveModal && (
        <SaveScenarioModal
          name={saveName} setName={setSaveName}
          onCancel={() => setShowSaveModal(false)}
          onSave={confirmSave}
        />
      )}

      {showExportModal && (
        <ExportProposalModal
          exporting={exporting}
          onCancel={() => setShowExportModal(false)}
          onExport={confirmExport}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
          <div className="bg-card border border-success/30 shadow-lg rounded-lg px-4 py-3 flex items-center gap-3 max-w-sm">
            <div className="size-8 rounded-full bg-success-soft grid place-items-center text-[oklch(0.4_0.14_155)]">
              <CheckCircle2 className="size-4" />
            </div>
            <div className="flex-1 text-sm font-medium">{toast}</div>
            <button onClick={() => setToast(null)} className="text-muted-foreground hover:text-foreground p-1">
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------------- Calculation ---------------- */

type ColResult = {
  turnover: number;
  cost: number;
  totalRebate: number;
  gp: number;
  gpPct: number;
  lines: Record<string, number>;
  qualified?: boolean;
  qualifications?: Record<string, boolean>;
};

const projected = (base: number, growth: number) => base * (1 + growth / 100);

function buildEW(baseT: number, baseC: number, fixedEWPct: number, targetEWPct: number, scenarios: Scenario[]) {
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
      turnover, cost, totalRebate, gp,
      gpPct: turnover ? (gp / turnover) * 100 : 0,
      qualified,
      qualifications: {
        "National Growth Rebate": qualified,
        "MVHR Rebate": mvhr > 0,
      },
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

function buildLinear(baseT: number, baseC: number, ratePct: number, scenarios: Scenario[], lineLabel: string) {
  const cols: ColResult[] = scenarios.map((s) => {
    const turnover = projected(baseT, s.growth);
    const cost = projected(baseC, s.growth);
    const rebate = turnover * (ratePct / 100);
    const gp = turnover - cost - rebate;
    return {
      turnover, cost, totalRebate: rebate, gp,
      gpPct: turnover ? (gp / turnover) * 100 : 0,
      lines: { [lineLabel]: rebate },
    };
  });
  return { cols };
}

/* ---------------- Sidebar / TopBar ---------------- */

const NAV = [
  { icon: Settings, label: "Settings" },
  { icon: CalcIcon, label: "Rebate Modeling" },
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

function Sidebar({ active, onSelect }: { active: string; onSelect: (l: string) => void }) {
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
          const isActive = item.label === active;
          return (
            <button
              key={item.label}
              onClick={() => onSelect(item.label)}
              className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                isActive ? "bg-brand text-brand-foreground font-semibold" : "hover:bg-sidebar-accent text-sidebar-foreground/80"
              }`}
            >
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="px-4 py-3 border-t border-sidebar-border text-[11px] text-sidebar-foreground/60">
        Rebate Modeling Calculator
      </div>
    </aside>
  );
}

function TopBar({ search, onSearch, account }: { search: string; onSearch: (v: string) => void; account: string }) {
  const initials = account.slice(0, 2).toUpperCase();
  return (
    <header className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-4">
      <button className="lg:hidden p-2 rounded-md hover:bg-muted"><PanelLeft className="size-5" /></button>
      <div className="flex-1 max-w-2xl relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={search} onChange={(e) => onSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
          placeholder="Search accounts, programs, scenarios…"
        />
      </div>
      <button className="relative p-2 rounded-md hover:bg-muted" title="Notifications">
        <Bell className="size-5" />
        <span className="absolute -top-0.5 -right-0.5 bg-brand text-brand-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5">99+</span>
      </button>
      <div className="size-9 rounded-full bg-gradient-to-br from-brand to-amber-500 grid place-items-center text-brand-foreground font-semibold text-sm" title={account}>
        {initials}
      </div>
    </header>
  );
}

/* ---------------- Page Header ---------------- */

function PageHeader(props: {
  year: string; setYear: (v: string) => void;
  account: string; setAccount: (v: string) => void;
  activeLevel: LayerScope; setActiveLevel: (l: LayerScope) => void;
  savedCount: number;
  savedScenarios: SavedScenario[];
  savedOpen: boolean; setSavedOpen: (b: boolean) => void;
  onLoadSaved: (s: SavedScenario) => void;
  onDeleteSaved: (id: string) => void;
  onOpenSave: () => void;
  onCalculate: () => void;
  calculating: boolean;
  calculated: boolean;
  onExport: () => void;
  levelQualifies: (l: LayerScope) => boolean;
  scenarios: Scenario[];
  ewResults: { cols: ColResult[] };
}) {
  const acc = ACCOUNT_NAMES[props.account] ?? { full: props.account, code: "—" };
  const maxed = props.savedCount >= 5;

  return (
    <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
      {/* Row 1 — Title + primary actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-border">
        <div className="flex items-center gap-3 min-w-0">
          <div className="size-10 rounded-xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
            <CalcIcon className="size-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight leading-tight">Rebate Modeling Calculator</h1>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5 text-[12px] text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-[oklch(0.55_0.16_155)]" />
                Sage synced · Today 06:14
              </span>
              <span className="text-border">|</span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-brand animate-pulse" />
                Live · auto-recalculated
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={props.onOpenSave}
            disabled={maxed}
            title={maxed ? "Maximum 5 scenarios reached." : "Save current scenario"}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-background text-sm font-medium hover:bg-muted transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Bookmark className="size-4" /> Save
          </button>
          <div className="relative">
            <button
              onClick={() => props.setSavedOpen(!props.savedOpen)}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-background text-sm font-medium hover:bg-muted transition"
            >
              Saved <span className="text-muted-foreground">({props.savedCount}/5)</span>
              {props.savedOpen ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}
            </button>
            {props.savedOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-[420px] bg-card border border-border rounded-lg shadow-lg z-20 max-h-80 overflow-auto">
                {props.savedScenarios.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">No saved scenarios yet</div>
                ) : (
                  props.savedScenarios.map((s) => (
                    <div key={s.id} className="px-3 py-2.5 border-b border-border last:border-0 flex items-center gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{s.name}</div>
                        <div className="text-[11px] text-muted-foreground">
                          {new Date(s.savedAt).toLocaleDateString("en-GB")} · {s.savedBy}
                        </div>
                      </div>
                      <button onClick={() => props.onLoadSaved(s)} className="px-2 py-1 rounded text-xs font-semibold text-brand hover:bg-brand-soft">Load</button>
                      <button onClick={() => props.onDeleteSaved(s.id)} className="px-2 py-1 rounded text-xs text-destructive hover:bg-destructive/10">Delete</button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
          <button
            onClick={props.onExport}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-md border border-border bg-background text-sm font-medium hover:bg-muted transition"
          >
            <Download className="size-4" /> Export
          </button>
          <div className="h-6 w-px bg-border mx-1" />
          <button
            onClick={props.onCalculate}
            disabled={props.calculating}
            className="inline-flex items-center gap-2 h-9 px-5 rounded-md font-semibold shadow-sm bg-brand text-brand-foreground hover:shadow-md hover:brightness-105 transition disabled:opacity-70"
          >
            {props.calculating ? <><RefreshCw className="size-4 animate-spin" /> Calculating…</>
              : props.calculated ? <><RefreshCw className="size-4" /> Recalculate</>
              : <><CalcIcon className="size-4" /> Calculate</>}
          </button>
        </div>
      </div>

      {/* Row 2 — Context selectors + level segmented control */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 bg-muted/30">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Account</label>
          <select
            value={props.account}
            onChange={(e) => props.setAccount(e.target.value)}
            className="h-8 px-2 rounded-md border border-input bg-background text-sm font-semibold text-brand"
          >
            {Object.keys(ACCOUNT_NAMES).map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <span className="text-foreground font-medium">{acc.full}</span>
          <span className="px-2 py-0.5 rounded-full bg-brand-soft text-brand text-[11px] font-semibold border border-brand/20">{acc.code}</span>
          <span className="mx-2 h-5 w-px bg-border" />
          <label className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">Year</label>
          <select
            value={props.year}
            onChange={(e) => props.setYear(e.target.value)}
            className="h-8 px-2 rounded-md border border-input bg-background text-sm font-medium"
          >
            <option>2026</option><option>2025</option><option>2024</option>
          </select>
        </div>

        <div
          className="flex items-center gap-1 bg-background border border-border p-1 rounded-lg"
          title="Rebate layers operate simultaneously at all three levels. Switch tabs to model each level separately."
        >
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold pl-2 pr-1">Level</span>
          {(["National", "Regional", "Branch"] as LayerScope[]).map((lvl) => {
            const qualifies = props.levelQualifies(lvl);
            const isActive = lvl === props.activeLevel;
            return (
              <button
                key={lvl}
                onClick={() => props.setActiveLevel(lvl)}
                className={`px-3 h-7 rounded-md text-sm font-medium transition flex items-center gap-1.5 ${
                  isActive ? "bg-brand text-brand-foreground shadow-sm" : "text-foreground hover:bg-muted"
                }`}
              >
                {lvl}
                <span
                  className={`size-1.5 rounded-full ${
                    isActive ? "bg-white/80" : qualifies ? "bg-[oklch(0.55_0.16_155)]" : "bg-[#C28533]"
                  }`}
                  title={qualifies ? "Qualifies" : "Below threshold"}
                />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------------- View tabs ---------------- */

function ViewTabs({ active, onChange }: { active: "modelling" | "variance"; onChange: (v: "modelling" | "variance") => void }) {
  const Tab = ({ id, label }: { id: "modelling" | "variance"; label: string }) => (
    <button
      onClick={() => onChange(id)}
      className={`px-4 py-2 text-sm font-semibold border-b-2 transition ${
        active === id ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );
  return (
    <div className="flex items-center gap-1 border-b border-border">
      <Tab id="modelling" label="Scenario Modelling" />
      <Tab id="variance" label="Variance Analysis" />
    </div>
  );
}

/* ---------------- Cards & inputs ---------------- */

function Card({
  title, hint, action, badge, children,
}: { title: string; hint?: string; action?: ReactNode; badge?: ReactNode; children: ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="font-semibold text-base flex items-center gap-2">
            <span>{title}</span>
            {badge}
          </h2>
          {hint && <p className="text-xs text-muted-foreground font-normal mt-0.5">{hint}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function NumInput({
  value, onChange, suffix, prefix, locked, disabled,
}: { value: number; onChange?: (n: number) => void; suffix?: string; prefix?: string; locked?: boolean; disabled?: boolean }) {
  const useCurrency = prefix === "£";
  const [focused, setFocused] = useState(false);
  const display = focused && onChange && !locked && !disabled
    ? (Number.isFinite(value) && value !== 0 ? String(value) : "")
    : useCurrency
      ? (Number.isFinite(value) ? value.toLocaleString("en-GB", { maximumFractionDigits: 0 }) : "0")
      : String(Number.isFinite(value) ? value : 0);
  const ro = locked || disabled || !onChange;
  return (
    <div className={`flex items-center rounded-md border overflow-hidden transition ${ro ? "border-input bg-muted/40" : "border-input bg-background focus-within:ring-2 focus-within:ring-ring/40 focus-within:border-brand/50"}`}>
      {prefix && <span className="px-2.5 text-muted-foreground text-sm border-r border-input bg-muted font-medium">{prefix}</span>}
      <input
        type="text" inputMode="decimal" value={display} readOnly={ro}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={(e) => {
          if (ro) return;
          const cleaned = e.target.value.replace(/[, ]/g, "");
          const n = parseFloat(cleaned);
          onChange?.(Number.isFinite(n) ? n : 0);
        }}
        className="flex-1 min-w-0 px-3 py-2 text-sm bg-transparent focus:outline-none tabular-nums"
      />
      {locked && <span className="px-2 text-muted-foreground"><Lock className="size-3.5" /></span>}
      {suffix && <span className="px-2.5 text-muted-foreground text-sm border-l border-input bg-muted font-medium">{suffix}</span>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
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
    <Card title="Global EW Configuration" hint="Set the percentage rates used across all scenarios">
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">EW — Extended Warranty</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Fixed EW %"><NumInput value={props.fixedEW} onChange={props.setFixedEW} suffix="%" /></Field>
          <Field label="Target EW %"><NumInput value={props.targetEW} onChange={props.setTargetEW} suffix="%" /></Field>
        </div>
      </div>
      <div className="mt-5">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">Other Rebate Rates</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="NBU Rebate %"><NumInput value={props.nbuRebate} onChange={props.setNbuRebate} suffix="%" /></Field>
          <Field label="SOC Rebate %"><NumInput value={props.socRebate} onChange={props.setSocRebate} suffix="%" /></Field>
        </div>
      </div>
    </Card>
  );
}

function BaselineInputs(props: {
  ewTurnover: number; ewCost: number;
  socTurnover: number; socCost: number;
  nbuTurnover: number; nbuCost: number;
}) {
  const Section = ({ label, fullName, t, c }: { label: string; fullName: string; t: number; c: number }) => (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-bold text-brand">{label}</span>
        <span className="text-sm text-foreground">— {fullName}</span>
        <span className="ml-auto text-xs text-muted-foreground">GP: <span className="tabular-nums font-medium text-foreground">{fmtGBP(Math.max(0, t - c))}</span></span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Turnover"><NumInput value={t} prefix="£" locked /></Field>
        <Field label="Cost"><NumInput value={c} prefix="£" locked /></Field>
      </div>
      <div className="text-[11px] text-muted-foreground mt-1">Prior-year actuals · read-only</div>
    </div>
  );
  return (
    <Card
      title="Baseline Financial Inputs"
      hint="Current year actuals · pulled from Sage"
      badge={<span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground"><Lock className="size-3" /> Locked · from Sage</span>}
    >
      <div className="space-y-5">
        <Section label="EW" fullName="Extended Warranty" t={props.ewTurnover} c={props.ewCost} />
        <Section label="SOC" fullName="Standing Order Contract" t={props.socTurnover} c={props.socCost} />
        <Section label="NBU" fullName="New Build Units" t={props.nbuTurnover} c={props.nbuCost} />
      </div>
    </Card>
  );
}

/* ---------------- Growth Config ---------------- */

function GrowthConfig({
  actual, setActual, scenarios, updateScenario, addScenario, removeScenario,
}: {
  actual: Scenario;
  setActual: (s: Scenario) => void;
  scenarios: Scenario[];
  updateScenario: (i: number, patch: Partial<Scenario>) => void;
  addScenario: () => void;
  removeScenario: (i: number) => void;
}) {
  const rows: { label: string; field: keyof Scenario; suffix?: string; prefix?: string; actualDisplay?: string; editableActual?: boolean; hint?: string }[] = [
    { label: "Growth %", field: "growth", suffix: "%", actualDisplay: "0% (Actual)", hint: "Projected turnover growth vs baseline" },
    { label: "National Growth Rebate %", field: "nationalGrowthRebate", suffix: "%", editableActual: true, hint: "Applied only if turnover ≥ Target Turnover" },
    { label: "Target Turnover", field: "targetTurnover", prefix: "£", editableActual: true, hint: "Qualifying threshold for National Growth Rebate" },
    { label: "Branch Growth Rebate %", field: "branchGrowthRebate", suffix: "%", editableActual: true },
    { label: "Settlement Discount (£)", field: "settlement", prefix: "£", editableActual: true },
    { label: "MVHR Rebate (£)", field: "mvhr", prefix: "£", editableActual: true },
  ];

  const cycleType = (i: number) => {
    const order: RebateType[] = ["Fixed", "Growth", "Targeted", "Mixed"];
    const cur = scenarios[i].type;
    const next = order[(order.indexOf(cur) + 1) % order.length];
    updateScenario(i, { type: next });
  };

  return (
    <Card
      title="Growth Scenario Configuration"
      hint="Compare side-by-side what-if scenarios (max 3)"
      action={
        <button
          onClick={addScenario}
          disabled={scenarios.length >= 3}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-soft text-brand text-xs font-semibold hover:bg-brand hover:text-brand-foreground transition border border-brand/30 disabled:opacity-50"
        >
          <Plus className="size-3.5" /> Add scenario
        </button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-border">
              <th className="py-3 pr-4 font-semibold w-56">Parameter</th>
              <th className="py-3 px-3 font-semibold text-center bg-muted/40">Actual</th>
              {scenarios.map((s, i) => (
                <th key={i} className="py-3 px-3 font-semibold text-brand text-center min-w-[160px]">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>{s.name}</span>
                    <button
                      onClick={() => removeScenario(i)}
                      title={`Remove ${s.name}`}
                      className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-1 rounded transition"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                  <div className="mt-1.5 flex justify-center">
                    <TypeChip type={s.type} onClick={() => cycleType(i)} />
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                <td className="py-2.5 pr-4 font-medium align-top">
                  <div className="leading-tight">
                    <div>{r.label.replace(" (£)", "")}</div>
                    {r.hint && <div className="text-[11px] text-muted-foreground font-normal mt-0.5">{r.hint}</div>}
                  </div>
                </td>
                <td className="py-2.5 px-3 text-center bg-muted/30 align-top">
                  {r.actualDisplay ? (
                    <span className="text-muted-foreground italic text-sm">{r.actualDisplay}</span>
                  ) : r.editableActual ? (
                    <NumInput value={actual[r.field] as number} onChange={(n) => setActual({ ...actual, [r.field]: n })} suffix={r.suffix} prefix={r.prefix} />
                  ) : null}
                </td>
                {scenarios.map((s, i) => (
                  <td key={i} className="py-2.5 px-3 align-top">
                    <NumInput value={s[r.field] as number} onChange={(n) => updateScenario(i, { [r.field]: n } as Partial<Scenario>)} suffix={r.suffix} prefix={r.prefix} />
                  </td>
                ))}
              </tr>
            ))}
            {/* Layer scope */}
            <tr className="border-b border-border/60">
              <td className="py-2.5 pr-4 font-medium align-top">
                <div>Layer scope</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Which level this scenario applies to</div>
              </td>
              <td className="py-2.5 px-3 text-center bg-muted/30 text-muted-foreground italic text-sm">—</td>
              {scenarios.map((s, i) => (
                <td key={i} className="py-2.5 px-3 align-top">
                  <select
                    value={s.scope}
                    onChange={(e) => updateScenario(i, { scope: e.target.value as LayerScope })}
                    className="w-full px-2 py-2 text-sm rounded-md border border-input bg-background"
                  >
                    <option>National</option><option>Regional</option><option>Branch</option>
                  </select>
                </td>
              ))}
            </tr>
            {/* Sale type */}
            <tr>
              <td className="py-2.5 pr-4 font-medium align-top">
                <div>Sale type</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">Limit rebate to this sales channel</div>
              </td>
              <td className="py-2.5 px-3 text-center bg-muted/30 text-muted-foreground italic text-sm">All</td>
              {scenarios.map((s, i) => (
                <td key={i} className="py-2.5 px-3 align-top">
                  <select
                    value={s.saleType}
                    onChange={(e) => updateScenario(i, { saleType: e.target.value as SaleType })}
                    className="w-full px-2 py-2 text-sm rounded-md border border-input bg-background"
                  >
                    <option>All</option><option>Social Housing</option><option>Electrical Wholesale</option>
                  </select>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------------- Ready to Calculate ---------------- */

function ReadyToCalculate({ onCalculate, calculating }: { onCalculate: () => void; calculating: boolean }) {
  return (
    <div className="bg-card border border-dashed border-border rounded-2xl p-12 text-center">
      <div className="size-14 mx-auto rounded-full bg-brand-soft text-brand grid place-items-center mb-4">
        <CalcIcon className="size-7" />
      </div>
      <h3 className="text-xl font-bold">Ready to Calculate</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
        Configure the rebate parameters and growth scenarios above, then click Calculate.
      </p>
      <button
        onClick={onCalculate}
        disabled={calculating}
        className="mt-5 inline-flex items-center gap-2 px-7 py-3 rounded-md bg-brand text-brand-foreground font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition disabled:opacity-70"
      >
        {calculating ? <><RefreshCw className="size-4 animate-spin" /> Calculating…</> : <><CalcIcon className="size-4" /> Calculate</>}
      </button>
    </div>
  );
}

/* ---------------- Results Area ---------------- */

function ResultsArea({
  actual, scenarios, ewResults, socResults, nbuResults, totals, bestIdx, activeIdx, setActiveIdx, onExport,
}: {
  actual: Scenario;
  scenarios: Scenario[];
  ewResults: { cols: ColResult[] };
  socResults: { cols: ColResult[] };
  nbuResults: { cols: ColResult[] };
  totals: { turnover: number; cost: number; rebate: number; gp: number; gpPct: number }[];
  bestIdx: number;
  activeIdx: number;
  setActiveIdx: (i: number) => void;
  onExport: () => void;
}) {
  const allScenarios = [actual, ...scenarios];
  const actualTotal = totals[0];
  const active = totals[activeIdx];

  const gpDelta = active.gp - actualTotal.gp;
  const gpPctDelta = active.gpPct - actualTotal.gpPct;
  const insight =
    activeIdx === 0
      ? "Showing Actual baseline results."
      : `${gpDelta >= 0 ? "↗" : "↘"} Gross Profit (£) ${gpDelta >= 0 ? "increased" : "decreased"} by ${fmtGBP(Math.abs(gpDelta))} under ${scenarios[activeIdx - 1]?.growth ?? 0}% Growth, ${
          gpPctDelta < 0 ? "even though" : "and"
        } GP % ${gpPctDelta >= 0 ? "increased" : "decreased"} by ${Math.abs(gpPctDelta).toFixed(1)} pts${
          gpDelta > 0 && gpPctDelta < 0 ? " — the expected effect of higher rebate payouts on a larger turnover base." : "."
        }`;

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-lg font-bold">Results</h2>
        <button
          onClick={onExport}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted transition"
        >
          <Download className="size-4" /> Export Proposal
        </button>
      </div>

      {/* a) 4 KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard label="Projected Turnover" value={fmtGBP(active.turnover)} delta={active.turnover - actualTotal.turnover} positiveGood />
        <KpiCard label="Total Rebate Payout" value={fmtGBP(active.rebate)} delta={active.rebate - actualTotal.rebate} positiveGood={false} />
        <KpiCard label="Net GP (£)" value={fmtGBP(active.gp)} delta={active.gp - actualTotal.gp} positiveGood />
        <KpiCard label="GP %" value={fmtPct(active.gpPct)} delta={active.gpPct - actualTotal.gpPct} positiveGood isPct />
      </div>

      {/* b) Scenario tab strip */}
      <div className="flex items-center gap-2 flex-wrap">
        {allScenarios.map((s, i) => {
          const isActive = i === activeIdx;
          const isBest = i === bestIdx && bestIdx > 0;
          const label = i === 0 ? "Actual" : `Scenario ${i} · ${s.growth}% Growth`;
          return (
            <button
              key={i}
              onClick={() => setActiveIdx(i)}
              className={`px-3 py-2 rounded-md text-sm font-medium border transition flex items-center gap-2 ${
                isActive ? "bg-success-soft border-[oklch(0.4_0.14_155)]/40 text-[oklch(0.27_0.14_155)]" : "bg-card border-border hover:bg-muted"
              }`}
            >
              {label}
              {isBest && (
                <span style={{ background: "#EAF3DE", color: "#27500A" }} className="text-[10px] font-bold px-1.5 py-0.5 rounded">
                  → Best
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* c) Insight callout */}
      <div className="rounded-lg px-4 py-3 text-sm flex items-start gap-2" style={{ background: "#EAF3DE", color: "#27500A" }}>
        <Sparkles className="size-4 mt-0.5 shrink-0" />
        <span>{insight}</span>
      </div>

      {/* d-f) Per-layer tables */}
      <ResultsTable label="EW" fullName="Extended Warranty" scenarios={allScenarios} result={ewResults} layer="ew" activeIdx={activeIdx} />
      <ResultsTable label="SOC" fullName="Standing Order Contract" scenarios={allScenarios} result={socResults} layer="linear" activeIdx={activeIdx} />
      <ResultsTable label="NBU" fullName="New Build Units" scenarios={allScenarios} result={nbuResults} layer="linear" activeIdx={activeIdx} />

      {/* g) Total summary */}
      <TotalSummary scenarios={allScenarios} totals={totals} activeIdx={activeIdx} />

      {/* h) Formula footnote */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        Projected Turnover = Prior-Year Turnover × (1 + Growth %) · GP (£) = Turnover − Cost + Total Rebate · GP % = GP (£) ÷ Turnover · Models are isolated per account.
      </p>
    </div>
  );
}

function KpiCard({ label, value, delta, positiveGood, isPct }: { label: string; value: string; delta: number; positiveGood: boolean; isPct?: boolean }) {
  const isZero = Math.abs(delta) < (isPct ? 0.05 : 0.5);
  const isGood = positiveGood ? delta > 0 : delta < 0;
  const color = isZero ? "text-muted-foreground" : isGood ? "text-[oklch(0.4_0.14_155)]" : "text-destructive";
  const arrow = isZero ? "—" : delta > 0 ? "▲" : "▼";
  const deltaText = isZero
    ? "no change vs actual"
    : `${arrow} ${isPct ? `${Math.abs(delta).toFixed(1)} pts` : fmtSignedGBP(delta).replace(/^[+−]/, "")} vs actual`;
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      <div className={`text-xs font-medium mt-1 ${color}`}>{deltaText}</div>
    </div>
  );
}

/* ---------------- Results Table ---------------- */

const ROW_CHIPS: Record<string, RebateType | "Settlement"> = {
  "Fixed EW Rebate": "Fixed",
  "Target EW Rebate": "Fixed",
  "National Growth Rebate": "Growth",
  "Branch Growth Incentive": "Growth",
  "Settlement Discount": "Settlement",
  "MVHR Rebate": "Targeted",
  "SOC Rebate": "Fixed",
  "NBU Rebate": "Fixed",
};

function deltaText(curr: number, base: number, asPct = false) {
  const d = curr - base;
  if (Math.abs(d) < 0.005) return null;
  return { d, arrow: d > 0 ? "▲" : "▼", val: asPct ? `${Math.abs(d).toFixed(1)} pp` : fmtGBP(Math.abs(d)) };
}

function ResultsTable({
  label, fullName, scenarios, result, layer, activeIdx,
}: {
  label: string;
  fullName: string;
  scenarios: Scenario[];
  result: { cols: ColResult[] };
  layer: "ew" | "linear";
  activeIdx: number;
}) {
  const lineKeys = layer === "ew"
    ? ["Fixed EW Rebate", "Target EW Rebate", "National Growth Rebate", "Branch Growth Incentive", "Settlement Discount", "MVHR Rebate"]
    : Object.keys(result.cols[0].lines);

  const colHeader = (s: Scenario, i: number) => i === 0 ? "Actual 2026" : `Scenario ${i}`;
  const activeBorder = (i: number) => i === activeIdx ? "border-l-4 border-l-[oklch(0.4_0.14_155)]" : "border-l-4 border-l-transparent";

  return (
    <section className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="px-5 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <span className="inline-block text-xs font-bold uppercase tracking-wider text-brand bg-brand-soft px-2.5 py-1 rounded">{label}</span>
        <span className="text-sm font-medium">— {fullName}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left py-3 px-5 font-semibold">Metric</th>
              {scenarios.map((s, i) => (
                <th key={i} className={`text-right py-3 px-5 font-semibold whitespace-nowrap ${activeBorder(i)}`}>
                  {colHeader(s, i)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Turnover" cols={result.cols.map((c) => ({ value: fmtGBP(c.turnover) }))} activeIdx={activeIdx} />
            <Row label="Cost" cols={result.cols.map((c) => ({ value: fmtGBP(c.cost) }))} activeIdx={activeIdx} />

            {lineKeys.flatMap((k) => {
              const isNatGrowth = k === "National Growth Rebate" && layer === "ew";
              const elems: ReactNode[] = [];
              if (isNatGrowth) {
                elems.push(
                  <tr key={`${k}-qual`} className="border-b border-border/60">
                    <td className="py-2.5 px-5 text-muted-foreground text-xs">National Growth — Qualification</td>
                    {result.cols.map((c, i) => (
                      <td key={i} className={`text-right py-2.5 px-5 ${activeBorder(i)}`}>
                        {c.qualified ? (
                          <StatusLabel kind="qualified">✓ {scenarios[i].nationalGrowthRebate}% · ≥ {fmtGBP(scenarios[i].targetTurnover)}</StatusLabel>
                        ) : (
                          <StatusLabel kind="warning">✗ Threshold not met</StatusLabel>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              }
              elems.push(
                <Row
                  key={k}
                  label={k}
                  chip={ROW_CHIPS[k]}
                  cols={result.cols.map((c, i) => {
                    const v = c.lines[k] ?? 0;
                    const meets = isNatGrowth ? !!c.qualified : v > 0;
                    const isThresholdRow = ROW_CHIPS[k] === "Growth" || ROW_CHIPS[k] === "Targeted";
                    return {
                      value: fmtGBP(v),
                      amber: isThresholdRow && !meets && v === 0,
                      thresholdLabel: isThresholdRow
                        ? (meets ? "✓ Qualified" : "Threshold not met")
                        : undefined,
                      thresholdMet: meets,
                      tooltip: isThresholdRow && !meets
                        ? (isNatGrowth
                            ? `Growth of ${scenarios[i].growth}% did not meet the threshold. Rate of ${scenarios[i].nationalGrowthRebate}% does not apply.`
                            : "Threshold not met. Rebate does not apply.")
                        : undefined,
                    };
                  })}
                  activeIdx={activeIdx}
                />
              );
              return elems;
            })}

            <Row label="Total Rebate" accent="brand" cols={result.cols.map((c) => ({ value: fmtGBP(c.totalRebate) }))} activeIdx={activeIdx} />
            <Row label="Gross Profit" accent="success" cols={result.cols.map((c) => ({ value: fmtGBP(c.gp) }))} activeIdx={activeIdx} />
            <Row label="GP %" accent="success" cols={result.cols.map((c) => ({ value: fmtPct(c.gpPct) }))} activeIdx={activeIdx} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Row({
  label, chip, cols, accent, activeIdx,
}: {
  label: string;
  chip?: RebateType | "Settlement";
  cols: { value: string; amber?: boolean; thresholdLabel?: string; thresholdMet?: boolean; tooltip?: string }[];
  accent?: "brand" | "success";
  activeIdx: number;
}) {
  const accentClass =
    accent === "brand" ? "text-brand font-semibold bg-brand-soft/40"
    : accent === "success" ? "text-[oklch(0.4_0.14_155)] font-semibold bg-success-soft/50"
    : "";
  return (
    <tr className={`border-b border-border/60 last:border-0 ${accentClass}`}>
      <td className="py-2.5 px-5">
        <span className="inline-flex items-center gap-2">
          {chip && <TypeChip type={chip} />}
          <span>{label}</span>
        </span>
      </td>
      {cols.map((c, i) => {
        const active = i === activeIdx;
        return (
          <td
            key={i}
            className={`text-right py-2.5 px-5 tabular-nums whitespace-nowrap ${active ? "border-l-4 border-l-[oklch(0.4_0.14_155)]" : "border-l-4 border-l-transparent"}`}
            title={c.tooltip}
          >
            <div className={c.amber ? "text-[#854F0B]" : ""}>{c.value}</div>
            {c.thresholdLabel && (
              <div className="mt-0.5">
                {c.thresholdMet ? (
                  <StatusLabel kind="qualified">✓ Qualified</StatusLabel>
                ) : (
                  <StatusLabel kind="warning">{c.thresholdLabel}</StatusLabel>
                )}
              </div>
            )}
          </td>
        );
      })}
    </tr>
  );
}

function TotalSummary({
  scenarios, totals, activeIdx,
}: {
  scenarios: Scenario[];
  totals: { turnover: number; cost: number; rebate: number; gp: number; gpPct: number }[];
  activeIdx: number;
}) {
  const activeBorder = (i: number) => i === activeIdx ? "border-l-4 border-l-[oklch(0.4_0.14_155)]" : "border-l-4 border-l-transparent";
  return (
    <section className="bg-card border-2 border-brand/30 rounded-xl overflow-hidden shadow-md">
      <div className="px-5 py-3 border-b border-border bg-brand-soft/30 flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-bold text-base">Total Summary <span className="text-muted-foreground font-normal text-sm">(EW + SOC + NBU combined)</span></h3>
        <span className="text-xs text-muted-foreground">All layers added together</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="text-left py-3 px-5 font-semibold">Metric</th>
              {scenarios.map((s, i) => (
                <th key={i} className={`text-right py-3 px-5 font-semibold whitespace-nowrap ${activeBorder(i)}`}>
                  {i === 0 ? "Actual 2026" : `Scenario ${i}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Total Turnover" cols={totals.map((t) => ({ value: fmtGBP(t.turnover) }))} activeIdx={activeIdx} />
            <Row label="Total Cost" cols={totals.map((t) => ({ value: fmtGBP(t.cost) }))} activeIdx={activeIdx} />
            <Row label="Total Rebate" accent="brand" cols={totals.map((t) => ({ value: fmtGBP(t.rebate) }))} activeIdx={activeIdx} />
            <Row label="Net Gross Profit (£)" accent="success" cols={totals.map((t) => ({ value: fmtGBP(t.gp) }))} activeIdx={activeIdx} />
            <Row label="GP %" accent="success" cols={totals.map((t) => ({ value: fmtPct(t.gpPct) }))} activeIdx={activeIdx} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ---------------- Variance Analysis ---------------- */

type VarianceRow = { key: string; label: string; highlight?: boolean };
const VARIANCE_ROWS: VarianceRow[] = [
  { key: "turnover", label: "Turnover" },
  { key: "cogs", label: "COGS" },
  { key: "gpBefore", label: "Gross Profit before rebates" },
  { key: "fixedEW", label: "Fixed EW Rebate" },
  { key: "targetEW", label: "Target EW Rebate" },
  { key: "natGrowth", label: "National Growth Rebate" },
  { key: "branchGrowth", label: "Branch Growth Incentive" },
  { key: "settlement", label: "Settlement Discount" },
  { key: "mvhr", label: "MVHR Rebate" },
  { key: "totalRebate", label: "Total Rebate (£)", highlight: true },
  { key: "netGP", label: "Net GP (£)", highlight: true },
  { key: "gpPct", label: "GP %", highlight: true },
];

function VarianceAnalysis({
  actual, ewResults, socResults, nbuResults, totals,
  ewTurnover, ewCost, socTurnover, socCost, nbuTurnover, nbuCost,
}: {
  actual: Scenario;
  ewResults: { cols: ColResult[] };
  socResults: { cols: ColResult[] };
  nbuResults: { cols: ColResult[] };
  totals: { turnover: number; cost: number; rebate: number; gp: number; gpPct: number }[];
  ewTurnover: number; ewCost: number;
  socTurnover: number; socCost: number;
  nbuTurnover: number; nbuCost: number;
}) {
  // Prior year = Sage baselines + actual rebate parameters
  const prior = useMemo(() => {
    const turnover = ewTurnover + socTurnover + nbuTurnover;
    const cogs = ewCost + socCost + nbuCost;
    const gpBefore = turnover - cogs;
    const fixedEW = ewResults.cols[0].lines["Fixed EW Rebate"] ?? 0;
    const targetEW = ewResults.cols[0].lines["Target EW Rebate"] ?? 0;
    const natGrowth = ewResults.cols[0].lines["National Growth Rebate"] ?? 0;
    const branchGrowth = ewResults.cols[0].lines["Branch Growth Incentive"] ?? 0;
    const settlement = actual.settlement;
    const mvhr = actual.mvhr;
    const totalRebate = fixedEW + targetEW + natGrowth + branchGrowth + settlement + mvhr +
      (socResults.cols[0].totalRebate ?? 0) + (nbuResults.cols[0].totalRebate ?? 0);
    const netGP = gpBefore - totalRebate;
    return { turnover, cogs, gpBefore, fixedEW, targetEW, natGrowth, branchGrowth, settlement, mvhr, totalRebate, netGP, gpPct: turnover ? (netGP / turnover) * 100 : 0 };
  }, [ewTurnover, ewCost, socTurnover, socCost, nbuTurnover, nbuCost, ewResults, socResults, nbuResults, actual]);

  // Current Projected = totals[0] (actual scenario)
  const current = useMemo(() => {
    const t = totals[0];
    const fixedEW = ewResults.cols[0].lines["Fixed EW Rebate"] ?? 0;
    const targetEW = ewResults.cols[0].lines["Target EW Rebate"] ?? 0;
    const natGrowth = ewResults.cols[0].lines["National Growth Rebate"] ?? 0;
    const branchGrowth = ewResults.cols[0].lines["Branch Growth Incentive"] ?? 0;
    return {
      turnover: t.turnover, cogs: t.cost,
      gpBefore: t.turnover - t.cost,
      fixedEW, targetEW, natGrowth, branchGrowth,
      settlement: actual.settlement, mvhr: actual.mvhr,
      totalRebate: t.rebate, netGP: t.gp, gpPct: t.gpPct,
    };
  }, [totals, ewResults, actual]);

  // Proposed = user-editable, initialized from current
  type ProposedShape = Record<string, number>;
  const [proposed, setProposed] = useState<ProposedShape>(() => ({ ...current }));
  const initRef = useRef(false);
  useEffect(() => {
    if (!initRef.current) {
      setProposed({ ...current });
      initRef.current = true;
    }
  }, [current]);

  // Auto-derive proposed totalRebate, netGP, gpPct from inputs
  const proposedDerived = useMemo(() => {
    const totalRebate = (proposed.fixedEW ?? 0) + (proposed.targetEW ?? 0) + (proposed.natGrowth ?? 0)
      + (proposed.branchGrowth ?? 0) + (proposed.settlement ?? 0) + (proposed.mvhr ?? 0);
    const netGP = (proposed.turnover ?? 0) - (proposed.cogs ?? 0) - totalRebate;
    const gpPct = proposed.turnover ? (netGP / proposed.turnover) * 100 : 0;
    return { ...proposed, totalRebate, netGP, gpPct, gpBefore: (proposed.turnover ?? 0) - (proposed.cogs ?? 0) };
  }, [proposed]);

  const variance = (key: string) => {
    const c = (current as Record<string, number>)[key] ?? 0;
    const p = (proposedDerived as Record<string, number>)[key] ?? 0;
    return p - c;
  };

  // For GP rows variance: higher is better. For rebate/cost rows: lower is better generally — spec says "Green when proposed is better for GP rows" — keep simple: highlight GP rows.
  const isGPRow = (k: string) => k === "netGP" || k === "gpPct" || k === "gpBefore";

  const fmt = (k: string, n: number) => k === "gpPct" ? fmtPct(n) : fmtGBP(n);

  const setField = (k: string, n: number) => setProposed((p) => ({ ...p, [k]: n }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground max-w-3xl">
          Compare current agreement projected results against a proposed new agreement to show the financial impact of changes.
        </p>
        <button
          title="Exports a clean one-page PDF for board or customer presentations"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted transition"
        >
          <Download className="size-4" /> Export comparison
        </button>
      </div>

      <section className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left py-3 px-5 font-semibold">Metric</th>
                <th className="text-right py-3 px-5 font-semibold whitespace-nowrap" style={{ background: "#F1EFE8", color: "#444441" }}>
                  Prior Year Actual <span className="ml-1 text-[10px] font-semibold inline-flex items-center gap-0.5"><Lock className="size-3" /> Locked</span>
                </th>
                <th className="text-right py-3 px-5 font-semibold whitespace-nowrap" style={{ background: "#E6F1FB", color: "#0C447C" }}>
                  Current Agreement Projected
                </th>
                <th className="text-right py-3 px-5 font-semibold whitespace-nowrap" style={{ background: "#FAECE7", color: "#712B13" }}>
                  Proposed Agreement Projected
                </th>
                <th className="text-right py-3 px-5 font-semibold whitespace-nowrap">Variance (C vs B)</th>
              </tr>
            </thead>
            <tbody>
              {VARIANCE_ROWS.map((r) => {
                const v = variance(r.key);
                const isDerived = r.key === "totalRebate" || r.key === "netGP" || r.key === "gpPct" || r.key === "gpBefore";
                const editable = !isDerived;
                const isGP = isGPRow(r.key);
                const zero = Math.abs(v) < (r.key === "gpPct" ? 0.05 : 0.5);
                const positiveGood = isGP ? v > 0 : v < 0;
                const varColor = zero ? "text-muted-foreground" : positiveGood ? "text-[oklch(0.4_0.14_155)]" : "text-destructive";
                const arrow = zero ? "—" : v > 0 ? "▲" : "▼";
                const rowBg = r.highlight ? "bg-success-soft/30 font-semibold" : "";
                return (
                  <tr key={r.key} className={`border-b border-border/60 last:border-0 ${rowBg}`}>
                    <td className="py-2.5 px-5">{r.label}</td>
                    <td className="py-2.5 px-5 text-right tabular-nums" style={{ background: "#F1EFE8" }}>
                      {fmt(r.key, (prior as Record<string, number>)[r.key] ?? 0)}
                    </td>
                    <td className="py-2.5 px-5 text-right tabular-nums" style={{ background: "#E6F1FB" }}>
                      {fmt(r.key, (current as Record<string, number>)[r.key] ?? 0)}
                    </td>
                    <td className="py-2.5 px-5 text-right tabular-nums" style={{ background: "#FAECE7" }}>
                      {editable ? (
                        <NumInput
                          value={(proposed as Record<string, number>)[r.key] ?? 0}
                          onChange={(n) => setField(r.key, n)}
                          prefix={r.key === "gpPct" ? undefined : "£"}
                          suffix={r.key === "gpPct" ? "%" : undefined}
                        />
                      ) : (
                        <span>{fmt(r.key, (proposedDerived as Record<string, number>)[r.key] ?? 0)}</span>
                      )}
                    </td>
                    <td className={`py-2.5 px-5 text-right tabular-nums whitespace-nowrap ${varColor}`}>
                      {zero ? "—" : <>{arrow} {r.key === "gpPct" ? `${Math.abs(v).toFixed(1)} pp` : fmtGBP(Math.abs(v))}</>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-[11px] text-muted-foreground">
        Variance = Proposed minus Current for each metric. Green indicates improvement in GP terms.
      </p>
    </div>
  );
}

/* ---------------- Sticky bottom KPI bar ---------------- */

function BottomKPIBar({
  totals, account, subLabel, activeIdx, onCalculate, calculating,
}: {
  totals: { turnover: number; cost: number; rebate: number; gp: number; gpPct: number }[];
  account: string;
  subLabel: string;
  activeIdx: number;
  onCalculate: () => void;
  calculating: boolean;
}) {
  const actual = totals[0];
  const active = totals[activeIdx] ?? actual;
  const uplift = active.gp - actual.gp;
  return (
    <div className="rounded-xl border bg-card/95 backdrop-blur shadow-[0_-4px_20px_-8px_rgba(0,0,0,0.15)] border-border">
      <div className="px-6 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="size-2.5 rounded-full bg-success animate-pulse" />
          <div className="leading-tight">
            <div className="font-bold text-sm">{account}</div>
            <div className="text-[11px] text-muted-foreground">{subLabel}</div>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-x-7">
          <BKpi label="Total Rebate" value={fmtGBP(active.rebate)} accent="brand" />
          <BKpi
            label="Net GP (£)" value={fmtGBP(active.gp)} accent="success"
            chip={uplift !== 0 && activeIdx > 0 ? (
              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                uplift > 0 ? "bg-success-soft text-[oklch(0.4_0.14_155)]" : "bg-destructive/10 text-destructive"
              }`}>
                {uplift > 0 ? "▲" : "▼"} {uplift > 0 ? "+" : ""}{fmtGBP(uplift)}
              </span>
            ) : null}
          />
          <BKpi label="GP %" value={fmtPct(active.gpPct)} accent="success" />
        </div>
        <button
          onClick={onCalculate} disabled={calculating}
          className="ml-auto inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-brand text-brand-foreground font-semibold shadow hover:shadow-md hover:opacity-95 transition disabled:opacity-70"
        >
          {calculating ? <><RefreshCw className="size-4 animate-spin" /> Calculating…</>
            : <><CalcIcon className="size-4" /> Calculate →</>}
        </button>
      </div>
    </div>
  );
}

function BKpi({ label, value, accent, chip }: { label: string; value: string; accent?: "brand" | "success"; chip?: ReactNode }) {
  const color = accent === "brand" ? "text-brand" : accent === "success" ? "text-[oklch(0.4_0.14_155)]" : "text-foreground";
  return (
    <div className="leading-tight">
      <div className="text-[11px] text-muted-foreground font-medium">{label}</div>
      <div className="flex items-center gap-2">
        <div className={`font-bold tabular-nums text-base ${color}`}>{value}</div>
        {chip}
      </div>
    </div>
  );
}

/* ---------------- Modals ---------------- */

function ModalShell({ children, onClose }: { children: ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-foreground/40 backdrop-blur-sm grid place-items-center p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function SaveScenarioModal({
  name, setName, onCancel, onSave,
}: { name: string; setName: (s: string) => void; onCancel: () => void; onSave: () => void }) {
  return (
    <ModalShell onClose={onCancel}>
      <h3 className="font-bold text-lg">Save scenario</h3>
      <div className="mt-4 space-y-2">
        <label className="block text-xs font-medium text-muted-foreground">Scenario name</label>
        <input
          autoFocus value={name} onChange={(e) => setName(e.target.value)}
          placeholder="e.g. AWEBB 2026 - Option A"
          className="w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/40"
        />
        <p className="text-xs text-muted-foreground">
          Saved scenarios are read-only snapshots. Editing a loaded scenario creates a new unsaved working copy.
        </p>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-muted">Cancel</button>
        <button onClick={onSave} disabled={!name.trim()} className="px-4 py-2 rounded-md bg-brand text-brand-foreground text-sm font-semibold hover:opacity-90 disabled:opacity-50">Save</button>
      </div>
    </ModalShell>
  );
}

function ExportProposalModal({
  exporting, onCancel, onExport,
}: { exporting: boolean; onCancel: () => void; onExport: () => void }) {
  return (
    <ModalShell onClose={onCancel}>
      <h3 className="font-bold text-lg">Export proposal</h3>
      <div style={{ background: "#FAEEDA", color: "#633806" }} className="mt-3 rounded-md px-3 py-2 text-xs flex items-start gap-2">
        <AlertTriangle className="size-4 mt-0.5 shrink-0" />
        <span>This PDF is for the customer. Internal cost and gross profit figures will not be included.</span>
      </div>
      <div className="mt-4">
        <div className="text-xs font-semibold text-muted-foreground mb-2">Included</div>
        <ul className="space-y-1 text-sm">
          {[
            "Customer name and account reference",
            "Agreement period (Year 2026)",
            "Rebate program layers table (type, scope, rate, condition)",
            "Projected turnover summary",
            "Watermark: \"Proposal — Subject to Agreement\"",
          ].map((t) => (
            <li key={t} className="flex items-start gap-2"><CheckCircle2 className="size-4 text-[oklch(0.4_0.14_155)] shrink-0 mt-0.5" /><span>{t}</span></li>
          ))}
        </ul>
      </div>
      <div className="mt-4">
        <div className="text-xs font-semibold text-muted-foreground mb-2">Not included</div>
        <ul className="space-y-1 text-sm">
          {["Internal COGS / cost of sales", "Net GP (£) figures", "GP % figures"].map((t) => (
            <li key={t} className="flex items-start gap-2"><X className="size-4 text-destructive shrink-0 mt-0.5" /><span>{t}</span></li>
          ))}
        </ul>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 rounded-md border border-border text-sm font-medium hover:bg-muted">Cancel</button>
        <button
          onClick={onExport} disabled={exporting}
          className="px-4 py-2 rounded-md bg-brand text-brand-foreground text-sm font-semibold hover:opacity-90 inline-flex items-center gap-2 disabled:opacity-70"
        >
          {exporting ? <><RefreshCw className="size-4 animate-spin" /> Generating…</> : <><Download className="size-4" /> Download PDF</>}
        </button>
      </div>
    </ModalShell>
  );
}
