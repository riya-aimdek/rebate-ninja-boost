import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  X,
  Plus,
  Trash2,
  Sparkles,
  Lock,
  Bookmark,
  ChevronDown,
  Calculator as CalcIcon,
  ArrowDown,
  Printer,
  Upload,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { AppLayout, TopBar } from "@/components/AppShell";
import {
  Btn,
  Card,
  Field,
  inputCls,
  PillTabs,
  Segmented,
  Modal,
  ConfirmDialog,
  EmptyState,
  Flag,
  notifySuccess,
  notifyUndo,
} from "@/components/pricing/kit";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export const Route = createFileRoute("/rebate-modeling")({
  head: () => ({
    meta: [
      { title: "Rebate Modeling · Rebate Ninja" },
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
  nationalGrowthRate: number;       // % applied to full turnover if growth qualifies
  targetThreshold: number;          // £ qualifying threshold for nat growth
  regionalGrowthRate: number;       // %
  branchGrowthRebate: number;       // %
  marketingRebate: number;          // %
  mvhrRate: number;                 // % applied to MVHR turnover only
  settlement: number;               // £ per period
  type: RebateType;
  scope: LayerScope;
  saleType: SaleType;
};

type SavedScenario = {
  id: string;
  name: string;
  savedAt: string;
  savedBy: string;
  payload: PersistShape;
};

type PersistShape = {
  fixedEW: number; targetEW: number; targetEWThreshold: number;
  nbuRebate: number; socRebate: number;
  mvhrRebate: number; marketingRebate: number; settlementDiscount: number;
  ewTurnover: number; ewCost: number; mvhrTurnover: number;
  socTurnover: number; socCost: number;
  nbuTurnover: number; nbuCost: number;
  actual: Scenario;
  scenarios: Scenario[];
  year: string; account: string; includeYesss: boolean;
};

const fmtGBP = (n: number) =>
  "£" + Math.round(n).toLocaleString("en-GB", { maximumFractionDigits: 0 });
const fmtSignedGBP = (n: number) =>
  (n >= 0 ? "+" : "−") + "£" + Math.round(Math.abs(n)).toLocaleString("en-GB");
const fmtPct = (n: number) => `${n.toFixed(1)}%`;

type AccountInfo = {
  full: string;
  code: string;
  hasYesss?: boolean;
  baseline: { ewT: number; ewC: number; mvhrT: number; socT: number; socC: number; nbuT: number; nbuC: number };
  baselineYesss?: { ewT: number; ewC: number; mvhrT: number; socT: number; socC: number; nbuT: number; nbuC: number };
};

const ACCOUNTS: Record<string, AccountInfo> = {
  AWEBB: {
    full: "A. Webb (Plumbing) Ltd", code: "AWB-001", hasYesss: true,
    baseline:      { ewT: 1194312, ewC: 597834, mvhrT: 95545, socT: 4098722, socC: 1591683, nbuT: 357780, nbuC: 203516 },
    baselineYesss: { ewT: 1612321, ewC: 806160, mvhrT: 128985, socT: 4098722, socC: 1591683, nbuT: 357780, nbuC: 203516 },
  },
  ANEW:      { full: "ANEW Distribution", code: "ANW-002", baseline: { ewT: 612500, ewC: 306250, mvhrT: 49000, socT: 1820000, socC: 705000, nbuT: 142000, nbuC: 80000 } },
  EDMUNDSON: { full: "Edmundson Electrical", code: "EDM-003", baseline: { ewT: 2105000, ewC: 1052500, mvhrT: 168400, socT: 5240000, socC: 2034500, nbuT: 412000, nbuC: 234500 } },
  CEF:       { full: "City Electrical Factors", code: "CEF-004", baseline: { ewT: 1845000, ewC: 922500, mvhrT: 147600, socT: 3920000, socC: 1522000, nbuT: 285000, nbuC: 162000 } },
  YESSS:     { full: "YESSS Electrical", code: "YES-005", baseline: { ewT: 418000, ewC: 209000, mvhrT: 33440, socT: 980000, socC: 380000, nbuT: 95000, nbuC: 54000 } },
  FEGIME:    { full: "FEGIME UK", code: "FEG-006", baseline: { ewT: 524000, ewC: 262000, mvhrT: 41920, socT: 1240000, socC: 481000, nbuT: 118000, nbuC: 67200 } },
  LEW:       { full: "LEW Electrical", code: "LEW-007", baseline: { ewT: 388000, ewC: 194000, mvhrT: 31040, socT: 890000, socC: 345000, nbuT: 82000, nbuC: 46600 } },
  HUWS:      { full: "Huws Gray (Rexel)", code: "HGR-008", baseline: { ewT: 296000, ewC: 148000, mvhrT: 23680, socT: 720000, socC: 279000, nbuT: 64000, nbuC: 36400 } },
  CROSSFOLD: { full: "Crossfold", code: "CRO-009", baseline: { ewT: 184000, ewC: 92000, mvhrT: 14720, socT: 410000, socC: 159000, nbuT: 38000, nbuC: 21600 } },
  JEWSONS:   { full: "Jewsons", code: "JEW-010", baseline: { ewT: 622000, ewC: 311000, mvhrT: 49760, socT: 1420000, socC: 551000, nbuT: 132000, nbuC: 75000 } },
};

// Rebate type chips are categorical labels (always text), mapped to semantic tokens.
const TYPE_CHIP: Record<RebateType | "Settlement", string> = {
  Fixed:      "bg-info-soft text-info",
  Growth:     "bg-warning-soft text-warning-foreground",
  Targeted:   "bg-brand-soft text-foreground",
  Settlement: "bg-muted text-muted-foreground",
  Mixed:      "bg-success-soft text-success",
};

function TypeChip({ type }: { type: RebateType | "Settlement" }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold leading-none ${TYPE_CHIP[type]}`}>
      {type}
    </span>
  );
}

function StatusLabel({ kind, children }: { kind: "qualified" | "warning" | "negative"; children: ReactNode }) {
  const cls =
    kind === "qualified"
      ? "bg-success-soft text-success"
      : kind === "warning"
      ? "bg-warning-soft text-warning-foreground"
      : "bg-danger-soft text-destructive";
  const Icon = kind === "qualified" ? CheckCircle2 : XCircle;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold leading-none ${cls}`}>
      <Icon className="size-3" aria-hidden />
      {children}
    </span>
  );
}

/** Domain abbreviation with its expansion available on hover and to assistive tech. */
function Abbr({ title, children }: { title: string; children: ReactNode }) {
  return (
    <abbr title={title} className="no-underline cursor-help">
      {children}
    </abbr>
  );
}

const PCT = { min: 0, max: 100 } as const;
const GBP = { min: 0 } as const;

/* ---------------- Page ---------------- */

function RebateModeling() {
  // Rebate rate configuration
  const [fixedEW, setFixedEW] = useState(5);
  const [targetEW, setTargetEW] = useState(5);
  const [targetEWThreshold, setTargetEWThreshold] = useState(1200000);
  const [nbuRebate, setNbuRebate] = useState(5);
  const [socRebate, setSocRebate] = useState(5);
  const [mvhrRebate, setMvhrRebate] = useState(5);
  const [marketingRebate, setMarketingRebate] = useState(0.5);
  const [settlementDiscount, setSettlementDiscount] = useState(29858);

  // Baseline (Sage actuals — locked, derived from selected account)
  const [account, setAccount] = useState("AWEBB");
  const [includeYesss, setIncludeYesss] = useState(false);

  const accInfo = ACCOUNTS[account] ?? ACCOUNTS.AWEBB;
  const baseline = (includeYesss && accInfo.baselineYesss) ? accInfo.baselineYesss : accInfo.baseline;

  const ewTurnover = baseline.ewT;
  const ewCost = baseline.ewC;
  const mvhrTurnover = baseline.mvhrT;
  const otherEwTurnover = Math.max(0, ewTurnover - mvhrTurnover);
  const socTurnover = baseline.socT;
  const socCost = baseline.socC;
  const nbuTurnover = baseline.nbuT;
  const nbuCost = baseline.nbuC;

  const defaultScenario = (over: Partial<Scenario>): Scenario => ({
    name: "Scenario",
    growth: 0,
    nationalGrowthRate: 1,
    targetThreshold: 1200000,
    regionalGrowthRate: 0,
    branchGrowthRebate: 0,
    marketingRebate: 0.5,
    mvhrRate: 5,
    settlement: 29858,
    type: "Fixed",
    scope: "National",
    saleType: "All",
    ...over,
  });

  const initialScenarios = (): Scenario[] => [
    defaultScenario({ name: "Scenario 1", growth: 10, nationalGrowthRate: 3.5, targetThreshold: 1200000, settlement: 32844, type: "Growth", scope: "National" }),
    defaultScenario({ name: "Scenario 2", growth: 20, nationalGrowthRate: 3.5, targetThreshold: 1275000, branchGrowthRebate: 2, regionalGrowthRate: 2, settlement: 35829, type: "Mixed", scope: "Regional" }),
    defaultScenario({ name: "Scenario 3", growth: 30, nationalGrowthRate: 4.5, targetThreshold: 1400000, branchGrowthRebate: 3, regionalGrowthRate: 3, settlement: 38815, type: "Targeted", scope: "Branch", saleType: "Social Housing" }),
  ];
  const [actual, setActual] = useState<Scenario>(defaultScenario({ name: "Actual" }));
  const [scenarios, setScenarios] = useState<Scenario[]>(initialScenarios);

  // UX state
  const [calculated, setCalculated] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [calculatedAt, setCalculatedAt] = useState<Date | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Header context
  const [year, setYear] = useState("2026");
  const [activeView, setActiveView] = useState<"modelling" | "variance">("modelling");

  // Saved scenarios
  const [savedScenarios, setSavedScenarios] = useState<SavedScenario[]>([]);
  const [savedOpen, setSavedOpen] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [loadedScenarioName, setLoadedScenarioName] = useState<string | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  // Unsaved-changes indicator: true after any edit since the last save/load.
  const [dirty, setDirty] = useState(false);

  // Print confirmation (printout includes internal cost/GP figures)
  const [printConfirmOpen, setPrintConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const [activeScenarioIdx, setActiveScenarioIdx] = useState(0);

  // Persistence
  const STORAGE_KEY = "rebate-ninja:modeling:v5";
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
        if (s.targetEWThreshold !== undefined) setTargetEWThreshold(s.targetEWThreshold);
        if (s.nbuRebate !== undefined) setNbuRebate(s.nbuRebate);
        if (s.socRebate !== undefined) setSocRebate(s.socRebate);
        if (s.mvhrRebate !== undefined) setMvhrRebate(s.mvhrRebate);
        if (s.marketingRebate !== undefined) setMarketingRebate(s.marketingRebate);
        if (s.settlementDiscount !== undefined) setSettlementDiscount(s.settlementDiscount);
        if (s.actual) setActual({ ...defaultScenario({}), ...s.actual });
        if (Array.isArray(s.scenarios) && s.scenarios.length) {
          setScenarios(s.scenarios.map((sc: Partial<Scenario>) => defaultScenario(sc)));
        }
        if (s.year) setYear(s.year);
        if (s.account && ACCOUNTS[s.account]) setAccount(s.account);
        if (s.includeYesss !== undefined) setIncludeYesss(s.includeYesss);
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
        fixedEW, targetEW, targetEWThreshold, nbuRebate, socRebate, mvhrRebate, marketingRebate, settlementDiscount,
        actual, scenarios, year, account, includeYesss,
      }));
    } catch {/* ignore */}
  }, [fixedEW, targetEW, targetEWThreshold, nbuRebate, socRebate, mvhrRebate, marketingRebate, settlementDiscount, actual, scenarios, year, account, includeYesss]);

  useEffect(() => {
    if (typeof window === "undefined" || !restoredRef.current) return;
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(savedScenarios)); } catch {/* ignore */}
  }, [savedScenarios]);

  const markEdit = () => {
    setDirty(true);
    if (loadedScenarioName) {
      setLoadedScenarioName(null);
      setBannerDismissed(false);
      toast(`Working copy created from "${loadedScenarioName}"`, {
        description: "The saved scenario is unchanged. Save to keep your edits.",
      });
    }
  };

  const updateScenario = (i: number, patch: Partial<Scenario>) => {
    setScenarios((s) => s.map((sc, idx) => (idx === i ? { ...sc, ...patch } : sc)));
    markEdit();
  };

  const addScenario = () => {
    if (scenarios.length >= 3) { toast.error("You can compare up to 3 scenarios", { description: "Delete a scenario to add another." }); return; }
    setScenarios((s) => {
      const next = s[s.length - 1];
      return [
        ...s,
        defaultScenario({
          name: `Scenario ${s.length + 1}`,
          growth: (next?.growth ?? 0) + 10,
          nationalGrowthRate: next?.nationalGrowthRate ?? 3.5,
          targetThreshold: Math.round((next?.targetThreshold ?? 1200000) * 1.1),
          regionalGrowthRate: next?.regionalGrowthRate ?? 0,
          branchGrowthRebate: next?.branchGrowthRebate ?? 0,
          marketingRebate: next?.marketingRebate ?? marketingRebate,
          mvhrRate: next?.mvhrRate ?? mvhrRebate,
          settlement: Math.round((next?.settlement ?? settlementDiscount) * 1.05),
          type: "Growth", scope: "National", saleType: "All",
        }),
      ];
    });
    markEdit();
  };

  const removeScenario = (idx: number) => {
    const prevScenarios = scenarios;
    const prevActiveIdx = activeScenarioIdx;
    const removedName = scenarios[idx]?.name ?? "Scenario";
    setScenarios((s) =>
      s.filter((_, i) => i !== idx).map((sc, i) => ({ ...sc, name: `Scenario ${i + 1}` }))
    );
    // activeScenarioIdx counts Actual as 0, so scenario idx sits at idx + 1.
    if (activeScenarioIdx > idx + 1) setActiveScenarioIdx((v) => v - 1);
    else if (activeScenarioIdx === idx + 1) setActiveScenarioIdx(0);
    markEdit();
    notifyUndo(`${removedName} deleted`, () => {
      setScenarios(prevScenarios);
      setActiveScenarioIdx(prevActiveIdx);
    });
  };

  const resetAll = () => {
    setFixedEW(5); setTargetEW(5); setTargetEWThreshold(1200000);
    setNbuRebate(5); setSocRebate(5); setMvhrRebate(5);
    setMarketingRebate(0.5); setSettlementDiscount(29858);
    setActual(defaultScenario({ name: "Actual" }));
    setScenarios(initialScenarios());
    setActiveScenarioIdx(0);
    setLoadedScenarioName(null);
    setCalculated(false);
    setCalculatedAt(null);
    setDirty(false);
    setResetConfirmOpen(false);
    notifySuccess("Inputs reset", "Rates and scenarios are back to their defaults. Saved scenarios were kept.");
  };

  /* ---- Calculation (live) ---- */
  const ewResults = useMemo(
    () => buildEW(ewTurnover, ewCost, mvhrTurnover, fixedEW, targetEW, targetEWThreshold, [actual, ...scenarios]),
    [ewTurnover, ewCost, mvhrTurnover, fixedEW, targetEW, targetEWThreshold, actual, scenarios]
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
      const settlement = ewResults.cols[i].lines["Settlement Discount"] ?? 0;
      // GP = Turnover − Cost + Total Rebate + Settlement (per spec)
      // But Total Rebate already INCLUDES settlement in line items; spec formula treats them as additions to GP
      // We keep the existing convention: GP = T - C - R (R includes settlement). Both equivalent if settlement is in R with opposite sign understanding. We'll show settlement separately in summary table.
      const gp = t - c - r;
      return { turnover: t, cost: c, rebate: r, settlement, gp, gpPct: t ? (gp / t) * 100 : 0 };
    });
  }, [ewResults, socResults, nbuResults, actual, scenarios]);

  const bestScenarioIdx = useMemo(() => {
    if (!totals.length) return 0;
    let best = 0;
    for (let i = 1; i < totals.length; i++) if (totals[i].gp > totals[best].gp) best = i;
    return best;
  }, [totals]);

  const levelQualifies = (level: LayerScope) => {
    return scenarios.some((s, idx) => s.scope === level && ewResults.cols[idx + 1]?.qualified);
  };

  const [statusMsg, setStatusMsg] = useState("");

  const handleCalculate = () => {
    setCalculating(true);
    setStatusMsg("Calculating scenarios…");
    setTimeout(() => {
      setCalculated(true);
      setCalculating(false);
      setCalculatedAt(new Date());
      setActiveScenarioIdx(bestScenarioIdx);
      setStatusMsg(
        bestScenarioIdx > 0
          ? `Results calculated. Scenario ${bestScenarioIdx} gives the highest gross profit.`
          : "Results calculated. The actual baseline gives the highest gross profit.",
      );
      notifySuccess("Scenarios calculated", "Results now update as you edit inputs.");
      requestAnimationFrame(() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
    }, 350);
  };

  // Upload Excel — validates the file; parsing into inputs is not connected yet.
  const fileInputRef = useRef<HTMLInputElement>(null);
  const handleUploadExcel = () => fileInputRef.current?.click();
  const onFileChosen = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["xlsx", "xls", "csv"].includes(ext)) {
      toast.error(`"${f.name}" isn't a supported file`, {
        description: "Upload an Excel (.xlsx, .xls) or CSV file.",
      });
      return;
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error(`"${f.name}" is too large`, { description: "Upload a file smaller than 10 MB." });
      return;
    }
    toast(`"${f.name}" received`, {
      description: "Excel import isn't connected yet, so no inputs were changed.",
    });
  };

  // Save scenario flow
  const currentPayload = (): PersistShape => ({
    fixedEW, targetEW, targetEWThreshold, nbuRebate, socRebate, mvhrRebate, marketingRebate, settlementDiscount,
    ewTurnover, ewCost, mvhrTurnover, socTurnover, socCost, nbuTurnover, nbuCost,
    actual, scenarios, year, account, includeYesss,
  });
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
      payload: currentPayload(),
    };
    setSavedScenarios((arr) => [snapshot, ...arr].slice(0, 5));
    setShowSaveModal(false);
    setDirty(false);
    notifySuccess(`"${snapshot.name}" saved`, `${Math.min(savedScenarios.length + 1, 5)} of 5 saved scenarios used.`);
  };
  const applyPayload = (p: PersistShape) => {
    setFixedEW(p.fixedEW); setTargetEW(p.targetEW);
    if (p.targetEWThreshold !== undefined) setTargetEWThreshold(p.targetEWThreshold);
    setNbuRebate(p.nbuRebate); setSocRebate(p.socRebate);
    if (p.mvhrRebate !== undefined) setMvhrRebate(p.mvhrRebate);
    if (p.marketingRebate !== undefined) setMarketingRebate(p.marketingRebate);
    if (p.settlementDiscount !== undefined) setSettlementDiscount(p.settlementDiscount);
    setActual(p.actual); setScenarios(p.scenarios);
    setYear(p.year);
    if (p.account && ACCOUNTS[p.account]) setAccount(p.account);
    if (p.includeYesss !== undefined) setIncludeYesss(p.includeYesss);
  };
  const loadSaved = (s: SavedScenario) => {
    const before = currentPayload();
    const wasDirty = dirty;
    const prevLoaded = loadedScenarioName;
    applyPayload(s.payload);
    setLoadedScenarioName(s.name);
    setBannerDismissed(false);
    setSavedOpen(false);
    setDirty(false);
    const restore = () => {
      applyPayload(before);
      setLoadedScenarioName(prevLoaded);
      setDirty(wasDirty);
    };
    if (wasDirty) notifyUndo(`Loaded "${s.name}"`, restore, "Your unsaved changes were replaced. Undo to get them back.");
    else notifySuccess(`Loaded "${s.name}"`, "Read-only — edit any field to create a working copy.");
  };
  const deleteSaved = (id: string) => {
    const idx = savedScenarios.findIndex((s) => s.id === id);
    const removed = savedScenarios[idx];
    if (!removed) return;
    setSavedScenarios((arr) => arr.filter((s) => s.id !== id));
    notifyUndo(`"${removed.name}" deleted`, () =>
      setSavedScenarios((arr) => {
        if (arr.some((s) => s.id === removed.id)) return arr;
        const next = [...arr];
        next.splice(Math.min(idx, next.length), 0, removed);
        return next.slice(0, 5);
      }),
    );
  };

  const confirmPrint = () => {
    setPrintConfirmOpen(false);
    // Let the dialog unmount before the browser print dialog snapshots the page.
    setTimeout(() => window.print(), 50);
  };

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
      : `Scenario ${activeScenarioIdx} (${scenarios[activeScenarioIdx - 1]?.growth ?? 0}% growth)`;

  return (
    <AppLayout topBar={<TopBar account={account} />} mainClassName="space-y-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        className="hidden"
        tabIndex={-1}
        aria-hidden
        onChange={onFileChosen}
      />
      {/* Polite live region: announces calculation progress and results to screen readers. */}
      <p role="status" aria-live="polite" className="sr-only">{statusMsg}</p>

      <PageHeader
        year={year} setYear={(y) => { setYear(y); markEdit(); }}
        account={account} setAccount={(a) => { setAccount(a); setIncludeYesss(false); markEdit(); }}
        includeYesss={includeYesss} setIncludeYesss={(b) => { setIncludeYesss(b); markEdit(); }}
        savedCount={savedScenarios.length}
        savedScenarios={savedScenarios}
        savedOpen={savedOpen} setSavedOpen={setSavedOpen}
        onLoadSaved={loadSaved}
        onDeleteSaved={deleteSaved}
        onOpenSave={openSave}
        onReset={() => setResetConfirmOpen(true)}
        onCalculate={handleCalculate}
        calculating={calculating}
        calculated={calculated}
        calculatedAt={calculatedAt}
        dirty={dirty}
        onUploadExcel={handleUploadExcel}
        levelQualifies={levelQualifies}
      />

      {loadedScenarioName && !bannerDismissed && (
        <div role="note" className="rounded-lg border border-warning/50 bg-warning-soft px-4 py-2 flex items-center gap-3 text-sm">
          <Bookmark className="size-4 shrink-0 text-warning-foreground" aria-hidden />
          <div className="flex-1 min-w-0">
            <span className="font-semibold text-warning-foreground">Viewing saved scenario: {loadedScenarioName}</span>
            <span className="ml-2 text-foreground">Read-only — edit any field to create a new working copy.</span>
          </div>
          <button
            type="button"
            onClick={() => setBannerDismissed(true)}
            aria-label="Dismiss saved scenario notice"
            className="size-10 shrink-0 grid place-items-center rounded-md hover:bg-warning/10"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      )}

      <PillTabs
        tabs={[
          { key: "modelling", label: "Scenario modelling" },
          { key: "variance", label: "Variance analysis" },
        ]}
        active={activeView}
        onChange={setActiveView}
      />

      <div role="tabpanel" aria-label={activeView === "modelling" ? "Scenario modelling" : "Variance analysis"} className="space-y-6">
      {activeView === "modelling" ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
            <RebateRateConfig
              fixedEW={fixedEW} setFixedEW={(n) => { setFixedEW(n); markEdit(); }}
              targetEW={targetEW} setTargetEW={(n) => { setTargetEW(n); markEdit(); }}
              targetEWThreshold={targetEWThreshold} setTargetEWThreshold={(n) => { setTargetEWThreshold(n); markEdit(); }}
              nbuRebate={nbuRebate} setNbuRebate={(n) => { setNbuRebate(n); markEdit(); }}
              socRebate={socRebate} setSocRebate={(n) => { setSocRebate(n); markEdit(); }}
              mvhrRebate={mvhrRebate} setMvhrRebate={(n) => { setMvhrRebate(n); markEdit(); }}
              marketingRebate={marketingRebate} setMarketingRebate={(n) => { setMarketingRebate(n); markEdit(); }}
              settlementDiscount={settlementDiscount} setSettlementDiscount={(n) => { setSettlementDiscount(n); markEdit(); }}
            />

            <BaselineInputs
              ewTurnover={ewTurnover} ewCost={ewCost}
              mvhrTurnover={mvhrTurnover} otherEwTurnover={otherEwTurnover}
              socTurnover={socTurnover} socCost={socCost}
              nbuTurnover={nbuTurnover} nbuCost={nbuCost}
            />
          </div>

          <GrowthConfig
            actual={actual}
            setActual={(s) => { setActual(s); markEdit(); }}
            scenarios={scenarios}
            updateScenario={updateScenario}
            addScenario={addScenario}
            removeScenario={removeScenario}
          />

          <div ref={resultsRef} className="scroll-mt-24 min-w-0">
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
                onPrint={() => setPrintConfirmOpen(true)}
                mvhrTurnover={mvhrTurnover}
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
          settlementDiscount={settlementDiscount}
          onPrint={() => setPrintConfirmOpen(true)}
        />
      )}
      </div>

      {calculated && activeView === "modelling" && (
        // In-flow sticky bar: it reserves its own height at the end of the page, so no content sits under it.
        <div
          className={`sticky bottom-0 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 py-3 z-20 transition-all duration-300 ${
            resultsVisible ? "opacity-0 translate-y-4 pointer-events-none" : "opacity-100 translate-y-0"
          }`}
          aria-hidden={resultsVisible || undefined}
        >
          <BottomKPIBar
            totals={totals}
            account={account}
            subLabel={activeScenarioLabel}
            activeIdx={activeScenarioIdx}
            onViewResults={() => resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
        </div>
      )}

      <SaveScenarioModal
        open={showSaveModal}
        name={saveName} setName={setSaveName}
        onCancel={() => setShowSaveModal(false)}
        onSave={confirmSave}
      />

      <ConfirmDialog
        open={printConfirmOpen}
        title="Print results?"
        description="The printout includes internal cost and gross profit (GP) figures. Remove them before sharing it with a customer. To save a PDF, choose “Save as PDF” in the print dialog."
        confirmLabel="Print"
        onConfirm={confirmPrint}
        onCancel={() => setPrintConfirmOpen(false)}
      />

      <ConfirmDialog
        open={resetConfirmOpen}
        tone="danger"
        title="Reset all inputs?"
        description="Rebate rates and growth scenarios go back to their defaults and calculated results are cleared. Saved scenarios are kept. This can't be undone."
        confirmLabel="Reset inputs"
        onConfirm={resetAll}
        onCancel={() => setResetConfirmOpen(false)}
      />
    </AppLayout>
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
  mvhrTurnover?: number;
};

const projected = (base: number, growth: number) => base * (1 + growth / 100);

function buildEW(
  baseT: number, baseC: number, baseMvhr: number,
  fixedEWPct: number, targetEWPct: number, targetEWThreshold: number,
  scenarios: Scenario[]
) {
  const cols: ColResult[] = scenarios.map((s) => {
    const turnover = projected(baseT, s.growth);
    const cost = projected(baseC, s.growth);
    const mvhrTurnover = projected(baseMvhr, s.growth);

    const fixedRebate = turnover * (fixedEWPct / 100);

    const targetQualified = turnover >= targetEWThreshold;
    const targetRebate = targetQualified ? turnover * (targetEWPct / 100) : 0;

    const natQualified = turnover >= s.targetThreshold;
    const natGrowth = natQualified ? turnover * (s.nationalGrowthRate / 100) : 0;

    const regionalGrowth = turnover * (s.regionalGrowthRate / 100);
    const branchGrowth = turnover * (s.branchGrowthRebate / 100);
    const marketing = turnover * (s.marketingRebate / 100);
    const mvhrRebate = mvhrTurnover * (s.mvhrRate / 100);
    const settlement = s.settlement;

    const totalRebate = fixedRebate + targetRebate + natGrowth + regionalGrowth + branchGrowth + marketing + mvhrRebate + settlement;
    const gp = turnover - cost - totalRebate;
    return {
      turnover, cost, totalRebate, gp,
      gpPct: turnover ? (gp / turnover) * 100 : 0,
      qualified: natQualified,
      mvhrTurnover,
      qualifications: {
        "National Growth Rebate": natQualified,
        "Target EW Rebate": targetQualified,
      },
      lines: {
        "Fixed EW Rebate": fixedRebate,
        "Target EW Rebate": targetRebate,
        "National Growth Rebate": natGrowth,
        "Regional Growth Rebate": regionalGrowth,
        "Branch Growth Incentive": branchGrowth,
        "Marketing Rebate": marketing,
        "MVHR Rebate": mvhrRebate,
        "Settlement Discount": settlement,
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
    // Settlement allocated proportionally is shown contextually; for SOC/NBU we surface settlement as 0 here
    const totalRebate = rebate;
    const gp = turnover - cost - totalRebate;
    return {
      turnover, cost, totalRebate, gp,
      gpPct: turnover ? (gp / turnover) * 100 : 0,
      lines: { [lineLabel]: rebate, "Settlement Discount": 0 },
    };
  });
  return { cols };
}

/* ---------------- Page Header ---------------- */

const fmtTime = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
const selectCls = "h-10 px-3 rounded-lg border border-input bg-card text-sm font-medium focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand";

function PageHeader(props: {
  year: string; setYear: (v: string) => void;
  account: string; setAccount: (v: string) => void;
  includeYesss: boolean; setIncludeYesss: (b: boolean) => void;
  savedCount: number;
  savedScenarios: SavedScenario[];
  savedOpen: boolean; setSavedOpen: (b: boolean) => void;
  onLoadSaved: (s: SavedScenario) => void;
  onDeleteSaved: (id: string) => void;
  onOpenSave: () => void;
  onReset: () => void;
  onCalculate: () => void;
  calculating: boolean;
  calculated: boolean;
  calculatedAt: Date | null;
  dirty: boolean;
  onUploadExcel: () => void;
  levelQualifies: (l: LayerScope) => boolean;
}) {
  const acc = ACCOUNTS[props.account] ?? { full: props.account, code: "—", hasYesss: false } as AccountInfo;
  const maxed = props.savedCount >= 5;

  return (
    <header>
      {/* Row 1 — Page title, status + actions (primary right-most), same layout as every other page header */}
      <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight leading-tight">Rebate modeling calculator</h1>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Lock className="size-3.5" aria-hidden />
                Baseline: prior-year actuals from Sage (read-only)
              </span>
              <span className="inline-flex items-center gap-1.5">
                {props.calculatedAt ? (
                  <>
                    <CheckCircle2 className="size-3.5 text-success" aria-hidden />
                    Calculated at {fmtTime(props.calculatedAt)} · results update as you edit
                  </>
                ) : (
                  <>
                    <CalcIcon className="size-3.5" aria-hidden />
                    Not calculated yet
                  </>
                )}
              </span>
              {props.dirty && <Flag tone="warning">Unsaved changes</Flag>}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Btn variant="subtle" icon={Upload} onClick={props.onUploadExcel} title="Upload an Excel (.xlsx, .xls) or CSV file, up to 10 MB">
            Upload Excel
          </Btn>
          <Popover open={props.savedOpen} onOpenChange={props.setSavedOpen}>
            <PopoverTrigger asChild>
              <Btn variant="subtle" aria-label={`Saved scenarios, ${props.savedCount} of 5`}>
                Saved
                <span className="text-muted-foreground font-medium">({props.savedCount}/5)</span>
                <ChevronDown className="size-4" aria-hidden />
              </Btn>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[min(420px,calc(100vw-2rem))] p-0 max-h-80 overflow-auto">
              <div className="px-4 py-3 border-b border-border text-sm font-semibold">Saved scenarios</div>
              {props.savedScenarios.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-sm font-medium">No saved scenarios yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Save the current inputs to compare options later. You can keep up to 5.</p>
                </div>
              ) : (
                <ul>
                  {props.savedScenarios.map((s) => (
                    <li key={s.id} className="px-4 py-2 border-b border-border last:border-0 flex items-center gap-2 text-sm">
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{s.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(s.savedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })} · {s.savedBy}
                        </div>
                      </div>
                      <Btn variant="ghost" className="text-brand" onClick={() => props.onLoadSaved(s)} aria-label={`Load ${s.name}`}>
                        Load
                      </Btn>
                      <button
                        type="button"
                        onClick={() => props.onDeleteSaved(s.id)}
                        aria-label={`Delete ${s.name}`}
                        title="Delete"
                        className="size-10 grid place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-danger-soft"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </PopoverContent>
          </Popover>
          <Btn variant="subtle" icon={RotateCcw} onClick={props.onReset}>
            Reset
          </Btn>
          <Btn
            variant="outline"
            icon={Bookmark}
            onClick={props.onOpenSave}
            disabled={maxed}
            title={maxed ? "You can keep up to 5 saved scenarios. Delete one to save another." : "Save the current inputs as a scenario"}
            aria-describedby={maxed ? "rm-save-max" : undefined}
          >
            Save
          </Btn>
          {maxed && <span id="rm-save-max" className="sr-only">Save is unavailable: 5 of 5 saved scenarios used. Delete one to save another.</span>}
          <Btn icon={props.calculated ? RefreshCw : CalcIcon} onClick={props.onCalculate} loading={props.calculating}>
            {props.calculating ? "Calculating…" : props.calculated ? "Recalculate" : "Calculate"}
          </Btn>
        </div>
      </div>

      {/* Row 2 — Context selectors + level qualification status */}
      <div className="flex flex-wrap items-center justify-between gap-4 px-4 sm:px-6 py-4 bg-card border border-border rounded-xl shadow-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="rm-account" className="text-sm font-medium text-foreground">Account</label>
            <select
              id="rm-account"
              value={props.account}
              onChange={(e) => props.setAccount(e.target.value)}
              className={`${selectCls} font-semibold text-brand`}
            >
              {Object.keys(ACCOUNTS).map((k) => <option key={k} value={k}>{k} — {ACCOUNTS[k].full}</option>)}
            </select>
            <span className="px-2 py-0.5 rounded-full bg-brand-soft text-foreground text-xs font-semibold border border-brand/20">{acc.code}</span>
          </div>
          {acc.hasYesss && (
            <div role="group" aria-label="Electrical Wholesale turnover basis" className="flex flex-col gap-1">
              <Segmented
                options={[
                  { key: "standalone", label: `${props.account} only` },
                  { key: "combined", label: `${props.account} + YESSS` },
                ]}
                value={props.includeYesss ? "combined" : "standalone"}
                onChange={(k) => props.setIncludeYesss(k === "combined")}
              />
              <span className="text-xs text-muted-foreground">
                {props.includeYesss ? `Includes ${props.account}/YESSS combined EW turnover` : "Standalone — choose “+ YESSS” to include YESSS turnover"}
              </span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <label htmlFor="rm-year" className="text-sm font-medium text-foreground">Year</label>
            <select id="rm-year" value={props.year} onChange={(e) => props.setYear(e.target.value)} className={selectCls}>
              <option>2026</option><option>2025</option><option>2024</option>
            </select>
          </div>
        </div>

        <div
          className="flex flex-wrap items-center gap-2"
          title="Rebate layers operate simultaneously at all three levels. A level qualifies when a scenario scoped to it meets its national growth threshold."
        >
          <span className="text-sm font-medium text-foreground">Level qualification</span>
          <ul className="flex flex-wrap items-center gap-2" aria-label="Level qualification">
            {(["National", "Regional", "Branch"] as LayerScope[]).map((lvl) => {
              const qualifies = props.levelQualifies(lvl);
              return (
                <li key={lvl}>
                  <StatusLabel kind={qualifies ? "qualified" : "warning"}>
                    {lvl}: {qualifies ? "qualifies" : "below threshold"}
                  </StatusLabel>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </header>
  );
}

/* ---------------- Inputs ---------------- */

function NumInput({
  value, onChange, suffix, prefix, locked, disabled, min, max, id, label,
  "aria-describedby": describedBy, "aria-invalid": invalid, "aria-required": required,
}: {
  value: number;
  onChange?: (n: number) => void;
  suffix?: string;
  prefix?: string;
  locked?: boolean;
  disabled?: boolean;
  /** Inputs are clamped to [min, max] so impossible values (negative £, >100%) can't be entered. */
  min?: number;
  max?: number;
  id?: string;
  /** Accessible name when not wrapped in a kit `Field` (e.g. table cells). */
  label?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  "aria-required"?: boolean;
}) {
  const useCurrency = prefix === "£";
  const [focused, setFocused] = useState(false);
  const display = focused && onChange && !locked && !disabled
    ? (Number.isFinite(value) && value !== 0 ? String(value) : "")
    : useCurrency
      ? (Number.isFinite(value) ? value.toLocaleString("en-GB", { maximumFractionDigits: 0 }) : "0")
      : String(Number.isFinite(value) ? value : 0);
  const ro = locked || disabled || !onChange;
  const rangeHint =
    min !== undefined && max !== undefined ? `Enter a value from ${min} to ${max}` : min !== undefined ? `Enter ${min} or more` : undefined;
  return (
    <div className={`flex items-center h-10 rounded-lg border overflow-hidden transition ${ro ? "border-input bg-muted/40" : "border-input bg-card focus-within:ring-2 focus-within:ring-brand/30 focus-within:border-brand"}`}>
      {prefix && <span className="self-stretch grid place-items-center px-3 text-muted-foreground text-sm border-r border-input bg-muted font-medium" aria-hidden>{prefix}</span>}
      <input
        id={id}
        type="text"
        inputMode="decimal"
        value={display}
        readOnly={ro}
        aria-readonly={ro || undefined}
        aria-label={label}
        aria-describedby={describedBy}
        aria-invalid={invalid}
        aria-required={required}
        title={ro ? (locked ? "Locked — prior-year actual from Sage" : undefined) : rangeHint}
        onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        onChange={(e) => {
          if (ro) return;
          const cleaned = e.target.value.replace(/[, £%]/g, "");
          let n = parseFloat(cleaned);
          if (!Number.isFinite(n)) n = 0;
          if (min !== undefined) n = Math.max(min, n);
          if (max !== undefined) n = Math.min(max, n);
          onChange?.(n);
        }}
        className="flex-1 min-w-0 w-0 h-full px-3 text-sm bg-transparent focus:outline-none tabular-nums"
      />
      {locked && <span className="px-2 text-muted-foreground"><Lock className="size-3.5" aria-label="Locked" /></span>}
      {suffix && <span className="self-stretch grid place-items-center px-3 text-muted-foreground text-sm border-l border-input bg-muted font-medium" aria-hidden>{suffix}</span>}
    </div>
  );
}

function SubHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <h3 className="text-base font-semibold">{children}</h3>
      {aside && <span className="ml-auto text-xs text-muted-foreground">{aside}</span>}
    </div>
  );
}

function RebateRateConfig(props: {
  fixedEW: number; setFixedEW: (n: number) => void;
  targetEW: number; setTargetEW: (n: number) => void;
  targetEWThreshold: number; setTargetEWThreshold: (n: number) => void;
  nbuRebate: number; setNbuRebate: (n: number) => void;
  socRebate: number; setSocRebate: (n: number) => void;
  mvhrRebate: number; setMvhrRebate: (n: number) => void;
  marketingRebate: number; setMarketingRebate: (n: number) => void;
  settlementDiscount: number; setSettlementDiscount: (n: number) => void;
}) {
  return (
    <Card title="Rebate rate configuration" subtitle="Set the percentage and £ rates used across all scenarios" className="h-full">
      <div className="space-y-6">
        <div>
          <SubHeading><Abbr title="Electrical Wholesale">EW</Abbr> — Electrical Wholesale</SubHeading>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Field label="Fixed EW (%)"><NumInput value={props.fixedEW} onChange={props.setFixedEW} suffix="%" {...PCT} /></Field>
            <Field label="Target EW (%)" hint="Applies only if EW turnover reaches the threshold"><NumInput value={props.targetEW} onChange={props.setTargetEW} suffix="%" {...PCT} /></Field>
            <Field label="Target threshold (£)" hint="EW turnover needed to earn the target rebate"><NumInput value={props.targetEWThreshold} onChange={props.setTargetEWThreshold} prefix="£" {...GBP} /></Field>
          </div>
        </div>

        <div>
          <SubHeading>
            <Abbr title="New Build Units">NBU</Abbr> and <Abbr title="Standing Order Contract">SOC</Abbr>
          </SubHeading>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="NBU rebate (%)" hint="NBU — New Build Units"><NumInput value={props.nbuRebate} onChange={props.setNbuRebate} suffix="%" {...PCT} /></Field>
            <Field label="SOC rebate (%)" hint="SOC — Standing Order Contract"><NumInput value={props.socRebate} onChange={props.setSocRebate} suffix="%" {...PCT} /></Field>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <SubHeading><Abbr title="Mechanical Ventilation with Heat Recovery">MVHR</Abbr></SubHeading>
            <Field label="MVHR rebate (%)" hint="Applied to MVHR product lines only, not total EW turnover">
              <NumInput value={props.mvhrRebate} onChange={props.setMvhrRebate} suffix="%" {...PCT} />
            </Field>
          </div>
          <div>
            <SubHeading>Marketing</SubHeading>
            <Field label="Marketing rebate (%)" hint="Contribution to the national marketing budget">
              <NumInput value={props.marketingRebate} onChange={props.setMarketingRebate} suffix="%" {...PCT} />
            </Field>
          </div>
        </div>

        <div>
          <SubHeading>Settlement</SubHeading>
          <Field label="Settlement discount (£)" hint="Fixed amount paid per agreement period">
            <NumInput value={props.settlementDiscount} onChange={props.setSettlementDiscount} prefix="£" {...GBP} />
          </Field>
        </div>
      </div>
    </Card>
  );
}

function BaselineInputs(props: {
  ewTurnover: number; ewCost: number;
  mvhrTurnover: number; otherEwTurnover: number;
  socTurnover: number; socCost: number;
  nbuTurnover: number; nbuCost: number;
}) {
  const gpAside = (t: number, c: number) => (
    <>
      <Abbr title="Gross profit">GP</Abbr>: <span className="tabular-nums font-medium text-foreground">{fmtGBP(Math.max(0, t - c))}</span>
    </>
  );
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          Baseline financial inputs
          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded bg-muted text-muted-foreground">
            <Lock className="size-3" aria-hidden /> Locked · from Sage
          </span>
        </span>
      }
      subtitle="Prior-year actuals for the selected account · read-only"
      className="h-full"
    >
      <div className="space-y-6">
        {/* EW with MVHR split */}
        <div>
          <SubHeading aside={gpAside(props.ewTurnover, props.ewCost)}>
            <span className="text-brand"><Abbr title="Electrical Wholesale">EW</Abbr></span> — Electrical Wholesale
          </SubHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Total EW turnover (£)"><NumInput value={props.ewTurnover} prefix="£" locked /></Field>
            <Field label="Total EW cost (£)"><NumInput value={props.ewCost} prefix="£" locked /></Field>
            <Field label="Of which MVHR turnover (£)" hint="MVHR rebate applies to this portion only">
              <NumInput value={props.mvhrTurnover} prefix="£" locked />
            </Field>
            <Field label="Of which other EW turnover (£)" hint="Calculated: total EW − MVHR">
              <NumInput value={props.otherEwTurnover} prefix="£" locked />
            </Field>
          </div>
        </div>

        {/* SOC */}
        <div>
          <SubHeading aside={gpAside(props.socTurnover, props.socCost)}>
            <span className="text-brand"><Abbr title="Standing Order Contract">SOC</Abbr></span> — Standing Order Contract
          </SubHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="SOC turnover (£)"><NumInput value={props.socTurnover} prefix="£" locked /></Field>
            <Field label="SOC cost (£)"><NumInput value={props.socCost} prefix="£" locked /></Field>
          </div>
        </div>

        {/* NBU */}
        <div>
          <SubHeading aside={gpAside(props.nbuTurnover, props.nbuCost)}>
            <span className="text-brand"><Abbr title="New Build Units">NBU</Abbr></span> — New Build Units
          </SubHeading>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="NBU turnover (£)"><NumInput value={props.nbuTurnover} prefix="£" locked /></Field>
            <Field label="NBU cost (£)"><NumInput value={props.nbuCost} prefix="£" locked /></Field>
          </div>
        </div>
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
    { label: "Growth (%)", field: "growth", suffix: "%", actualDisplay: "0% (actual)", hint: "Projected turnover growth vs baseline" },
    { label: "National growth rate (%)", field: "nationalGrowthRate", suffix: "%", editableActual: true, hint: "Applied only if turnover ≥ target threshold" },
    { label: "Target EW turnover threshold (£)", field: "targetThreshold", prefix: "£", editableActual: true, hint: "Qualifying threshold for the national growth rate" },
    { label: "Regional growth rate (%)", field: "regionalGrowthRate", suffix: "%", editableActual: true, hint: "Applies to the regional aggregate if the region hits its threshold. Set 0% if there's no regional tier." },
    { label: "Branch growth rebate (%)", field: "branchGrowthRebate", suffix: "%", editableActual: true, hint: "Applied per qualifying branch. Total shown is the sum across all branches." },
    { label: "Marketing rebate (%)", field: "marketingRebate", suffix: "%", editableActual: true, hint: "Contribution to the national marketing budget" },
    { label: "MVHR rebate (%)", field: "mvhrRate", suffix: "%", editableActual: true, hint: "Applied to MVHR (mechanical ventilation with heat recovery) turnover only, not total EW" },
    { label: "Settlement discount (£)", field: "settlement", prefix: "£", editableActual: true, hint: "Fixed amount per period" },
  ];
  // Growth can be negative (decline); rates are 0–100%; money is ≥ 0.
  const rangeFor = (field: keyof Scenario) =>
    field === "growth" ? { min: -100, max: 1000 } : field === "targetThreshold" || field === "settlement" ? GBP : PCT;

  const atMax = scenarios.length >= 3;

  return (
    <Card
      title="Growth scenario configuration"
      subtitle="Compare up to 3 what-if scenarios side by side"
      padded={false}
      actions={
        <Btn
          variant="outline"
          icon={Plus}
          onClick={addScenario}
          disabled={atMax}
          title={atMax ? "You can compare up to 3 scenarios. Delete one to add another." : "Add another what-if scenario"}
        >
          Add scenario <span className="font-normal text-xs">({scenarios.length}/3)</span>
        </Btn>
      }
    >
      <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Growth scenario inputs (scrolls horizontally)">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-border">
              <th scope="col" className="sticky left-0 z-10 bg-card py-3 px-4 sm:px-6 font-semibold min-w-44 sm:min-w-56">Parameter</th>
              <th scope="col" className="py-3 px-3 font-semibold text-center bg-muted/40 min-w-40">Actual</th>
              {scenarios.map((s, i) => (
                <th scope="col" key={i} className="py-3 px-3 font-semibold text-brand text-center min-w-44">
                  <div className="flex items-center justify-center gap-1">
                    <span>{s.name}</span>
                    <button
                      type="button"
                      onClick={() => removeScenario(i)}
                      aria-label={`Delete ${s.name}`}
                      title={`Delete ${s.name}`}
                      className="size-10 grid place-items-center text-muted-foreground hover:text-destructive hover:bg-danger-soft rounded-lg transition"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </button>
                  </div>
                  <div className="mt-1 flex justify-center">
                    <select
                      value={s.type}
                      onChange={(e) => updateScenario(i, { type: e.target.value as RebateType })}
                      aria-label={`Rebate type for ${s.name}`}
                      className="h-10 px-2 text-xs font-semibold rounded-lg border border-input bg-card text-foreground"
                    >
                      <option>Fixed</option><option>Growth</option><option>Targeted</option><option>Mixed</option>
                    </select>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                <th scope="row" className="sticky left-0 z-10 bg-card py-2 px-4 sm:px-6 font-medium align-top text-left">
                  <div className="leading-tight">
                    <div>{r.label}</div>
                    {r.hint && <div className="text-xs text-muted-foreground font-normal mt-0.5">{r.hint}</div>}
                  </div>
                </th>
                <td className="py-2 px-3 text-center bg-muted/30 align-top">
                  {r.actualDisplay ? (
                    <span className="text-muted-foreground italic text-sm">{r.actualDisplay}</span>
                  ) : r.editableActual ? (
                    <NumInput
                      value={actual[r.field] as number}
                      onChange={(n) => setActual({ ...actual, [r.field]: n })}
                      suffix={r.suffix} prefix={r.prefix}
                      label={`${r.label} — Actual`}
                      {...rangeFor(r.field)}
                    />
                  ) : null}
                </td>
                {scenarios.map((s, i) => (
                  <td key={i} className="py-2 px-3 align-top">
                    <NumInput
                      value={s[r.field] as number}
                      onChange={(n) => updateScenario(i, { [r.field]: n } as Partial<Scenario>)}
                      suffix={r.suffix} prefix={r.prefix}
                      label={`${r.label} — ${s.name}`}
                      {...rangeFor(r.field)}
                    />
                  </td>
                ))}
              </tr>
            ))}
            {/* Layer scope */}
            <tr className="border-b border-border/60">
              <th scope="row" className="sticky left-0 z-10 bg-card py-2 px-4 sm:px-6 font-medium align-top text-left">
                <div>Layer scope</div>
                <div className="text-xs text-muted-foreground font-normal mt-0.5">Which level this scenario applies to</div>
              </th>
              <td className="py-2 px-3 text-center bg-muted/30 text-muted-foreground italic text-sm">—</td>
              {scenarios.map((s, i) => (
                <td key={i} className="py-2 px-3 align-top">
                  <select
                    value={s.scope}
                    onChange={(e) => updateScenario(i, { scope: e.target.value as LayerScope })}
                    aria-label={`Layer scope for ${s.name}`}
                    className={inputCls}
                  >
                    <option>National</option><option>Regional</option><option>Branch</option>
                  </select>
                </td>
              ))}
            </tr>
            {/* Sale type */}
            <tr>
              <th scope="row" className="sticky left-0 z-10 bg-card py-2 px-4 sm:px-6 font-medium align-top text-left">
                <div>Sale type</div>
                <div className="text-xs text-muted-foreground font-normal mt-0.5">Limit rebate to this sales channel</div>
              </th>
              <td className="py-2 px-3 text-center bg-muted/30 text-muted-foreground italic text-sm">All</td>
              {scenarios.map((s, i) => (
                <td key={i} className="py-2 px-3 align-top">
                  <select
                    value={s.saleType}
                    onChange={(e) => updateScenario(i, { saleType: e.target.value as SaleType })}
                    aria-label={`Sale type for ${s.name}`}
                    className={inputCls}
                  >
                    <option>All</option><option>Social Housing</option><option>Electrical Wholesale</option>
                  </select>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
      {scenarios.length === 0 && (
        <EmptyState
          icon={Plus}
          title="No scenarios to compare"
          action={<Btn variant="outline" icon={Plus} onClick={addScenario}>Add scenario</Btn>}
        >
          Add a what-if scenario to compare it with the actual baseline.
        </EmptyState>
      )}
    </Card>
  );
}

/* ---------------- Ready to Calculate ---------------- */

function ReadyToCalculate({ onCalculate, calculating }: { onCalculate: () => void; calculating: boolean }) {
  return (
    <section aria-labelledby="rm-results-empty" className="bg-card border border-dashed border-border rounded-xl">
      <h2 id="rm-results-empty" className="sr-only">Results</h2>
      <EmptyState
        icon={CalcIcon}
        title="Ready to calculate"
        action={
          <Btn icon={CalcIcon} onClick={onCalculate} loading={calculating}>
            {calculating ? "Calculating…" : "Calculate"}
          </Btn>
        }
      >
        Set the rebate rates and growth scenarios above, then calculate to see turnover, rebate and gross profit for each scenario.
      </EmptyState>
    </section>
  );
}

/* ---------------- Results Area ---------------- */

function ResultsArea({
  actual, scenarios, ewResults, socResults, nbuResults, totals, bestIdx, activeIdx, setActiveIdx, onPrint, mvhrTurnover,
}: {
  actual: Scenario;
  scenarios: Scenario[];
  ewResults: { cols: ColResult[] };
  socResults: { cols: ColResult[] };
  nbuResults: { cols: ColResult[] };
  totals: { turnover: number; cost: number; rebate: number; settlement: number; gp: number; gpPct: number }[];
  bestIdx: number;
  activeIdx: number;
  setActiveIdx: (i: number) => void;
  onPrint: () => void;
  mvhrTurnover: number;
}) {
  const allScenarios = [actual, ...scenarios];
  const actualTotal = totals[0];
  const active = totals[activeIdx] ?? actualTotal;

  const gpDelta = active.gp - actualTotal.gp;
  const gpPctDelta = active.gpPct - actualTotal.gpPct;
  const gpDir = gpDelta >= 0 ? "increased" : "decreased";
  const gpPctDir = gpPctDelta >= 0 ? "increased" : "decreased";
  const conj = gpPctDelta < 0 ? "even though" : "and";
  const tail = gpDelta > 0 && gpPctDelta < 0
    ? " — the expected effect of higher rebate payouts on a larger turnover base."
    : ".";
  const insightNode =
    activeIdx === 0 ? (
      <span>Showing actual baseline results.</span>
    ) : (
      <span>
        <strong className="font-semibold">Gross profit (£) {gpDir}</strong> by {fmtGBP(Math.abs(gpDelta))} under Scenario {activeIdx} ({scenarios[activeIdx - 1]?.growth ?? 0}% growth), {conj}{" "}
        <strong className="font-semibold">GP % {gpPctDir}</strong> by {Math.abs(gpPctDelta).toFixed(1)} pts{tail}
      </span>
    );

  return (
    <section aria-labelledby="rm-results-title" className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h2 id="rm-results-title" className="text-lg font-semibold tracking-tight">Results</h2>
        <Btn variant="outline" icon={Printer} onClick={onPrint} title="Print or save as PDF">
          Print results
        </Btn>
      </div>

      {/* Scenario selector — drives the KPIs, insight and highlighted table column */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground mb-2">Show KPIs for</p>
        <PillTabs
          tabs={allScenarios.map((s, i) => ({
            key: String(i),
            label:
              i === 0
                ? "Actual · baseline"
                : `Scenario ${i} · ${s.growth}% growth${i === bestIdx && bestIdx > 0 ? " · best GP" : ""}`,
          }))}
          active={String(activeIdx)}
          onChange={(k) => setActiveIdx(Number(k))}
        />
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard label="Projected turnover" value={fmtGBP(active.turnover)} delta={active.turnover - actualTotal.turnover} positiveGood />
        <KpiCard label="Total rebate payout" value={fmtGBP(active.rebate)} delta={active.rebate - actualTotal.rebate} positiveGood={false} />
        <KpiCard label="Net gross profit (£)" value={fmtGBP(active.gp)} delta={active.gp - actualTotal.gp} positiveGood />
        <KpiCard label="Gross profit (%)" value={fmtPct(active.gpPct)} delta={active.gpPct - actualTotal.gpPct} positiveGood isPct />
      </div>

      {/* Insight callout */}
      <div className="rounded-lg border border-info/40 bg-info-soft px-4 py-3 text-sm text-foreground flex items-start gap-2">
        <Sparkles className="size-4 mt-0.5 shrink-0 text-info" aria-hidden />
        {insightNode}
      </div>

      {/* Per-layer tables */}
      <ResultsTable label="EW" fullName="Electrical Wholesale" scenarios={allScenarios} result={ewResults} layer="ew" activeIdx={activeIdx} bestIdx={bestIdx} mvhrTurnoverBase={mvhrTurnover} />
      <ResultsTable label="SOC" fullName="Standing Order Contract" scenarios={allScenarios} result={socResults} layer="linear" activeIdx={activeIdx} bestIdx={bestIdx} />
      <ResultsTable label="NBU" fullName="New Build Units" scenarios={allScenarios} result={nbuResults} layer="linear" activeIdx={activeIdx} bestIdx={bestIdx} />

      {/* Total summary */}
      <TotalSummary scenarios={allScenarios} totals={totals} activeIdx={activeIdx} bestIdx={bestIdx} />

      {/* Formula footnote */}
      <div className="text-xs text-muted-foreground leading-relaxed bg-muted/30 border border-border rounded-lg p-4 space-y-1">
        <div><strong>Projected turnover</strong> = Prior-year turnover × (1 + Growth %)</div>
        <div><strong>GP (£)</strong> = Turnover − Cost + Total rebate + Settlement discount</div>
        <div><strong>GP %</strong> = GP (£) ÷ Turnover</div>
        <div><strong>MVHR rebate</strong> = MVHR turnover × MVHR rate (not applied to full EW)</div>
        <div><strong>National growth rebate</strong>: retrospective — if growth % ≥ threshold then rate × full turnover (not just the increment), else £0</div>
        <div>Models are isolated per account. No cross-account data.</div>
      </div>
    </section>
  );
}

function KpiCard({ label, value, delta, positiveGood, isPct }: { label: string; value: string; delta: number; positiveGood: boolean; isPct?: boolean }) {
  const isZero = Math.abs(delta) < (isPct ? 0.05 : 0.5);
  const isGood = positiveGood ? delta > 0 : delta < 0;
  const color = isZero ? "text-muted-foreground" : isGood ? "text-success" : "text-destructive";
  const arrow = isZero ? "—" : delta > 0 ? "▲" : "▼";
  const deltaText = isZero
    ? "No change vs actual"
    : `${isPct ? `${delta > 0 ? "+" : "−"}${Math.abs(delta).toFixed(1)} pts` : fmtSignedGBP(delta)} vs actual`;
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm">
      <div className="text-sm font-medium text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      <div className={`text-xs font-semibold mt-1 tabular-nums ${color}`}>
        <span aria-hidden>{arrow} </span>
        {deltaText}
        {!isZero && <span className="sr-only">{isGood ? " (favourable)" : " (unfavourable)"}</span>}
      </div>
    </div>
  );
}

/* ---------------- Results Table ---------------- */

const ROW_CHIPS: Record<string, RebateType | "Settlement"> = {
  "Fixed EW Rebate": "Fixed",
  "Target EW Rebate": "Targeted",
  "National Growth Rebate": "Growth",
  "Regional Growth Rebate": "Growth",
  "Branch Growth Incentive": "Growth",
  "Marketing Rebate": "Fixed",
  "MVHR Rebate": "Targeted",
  "Settlement Discount": "Settlement",
  "SOC Rebate": "Fixed",
  "NBU Rebate": "Fixed",
};

function ResultsTable({
  label, fullName, scenarios, result, layer, activeIdx, bestIdx, mvhrTurnoverBase,
}: {
  label: string;
  fullName: string;
  scenarios: Scenario[];
  result: { cols: ColResult[] };
  layer: "ew" | "linear";
  activeIdx: number;
  bestIdx: number;
  mvhrTurnoverBase?: number;
}) {
  const lineKeysEw = [
    "Fixed EW Rebate",
    "Target EW Rebate",
    "National Growth Rebate",
    "Regional Growth Rebate",
    "Branch Growth Incentive",
    "Marketing Rebate",
    "MVHR Rebate",
    "Settlement Discount",
  ];
  const lineKeys = layer === "ew" ? lineKeysEw : Object.keys(result.cols[0].lines).filter((k) => k !== "Settlement Discount").concat(["Settlement Discount"]);

  const colHeader = (_s: Scenario, i: number) => i === 0 ? "Actual" : `Scenario ${i}`;
  const isBestCol = (i: number) => i === bestIdx && bestIdx > 0;
  const titleId = `rm-results-${label.toLowerCase()}`;

  return (
    <section aria-labelledby={titleId} className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
      <div className="px-6 py-3 border-b border-border flex items-center gap-3 flex-wrap">
        <h3 id={titleId} className="text-base font-semibold flex items-center gap-2">
          <span className="inline-block text-xs font-bold uppercase tracking-wider text-foreground bg-brand-soft px-2 py-1 rounded">{label}</span>
          <span>{fullName}</span>
        </h3>
      </div>
      <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label={`${fullName} results (scrolls horizontally)`}>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th scope="col" className="text-left py-3 px-6 font-semibold">Metric</th>
              {scenarios.map((s, i) => (
                <ScenarioColHeader key={i} label={colHeader(s, i)} active={i === activeIdx} best={isBestCol(i)} />
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Turnover" cols={result.cols.map((c) => ({ value: fmtGBP(c.turnover) }))} activeIdx={activeIdx} bestIdx={bestIdx} />
            {layer === "ew" && (
              <Row
                label="Of which MVHR Turnover"
                indent
                muted
                cols={result.cols.map((c) => ({ value: fmtGBP(c.mvhrTurnover ?? mvhrTurnoverBase ?? 0) }))}
                activeIdx={activeIdx}
                bestIdx={bestIdx}
              />
            )}
            <Row label="Cost" cols={result.cols.map((c) => ({ value: fmtGBP(c.cost) }))} activeIdx={activeIdx} bestIdx={bestIdx} />

            {lineKeys.flatMap((k) => {
              const isNatGrowth = k === "National Growth Rebate" && layer === "ew";
              const isTargetEW = k === "Target EW Rebate" && layer === "ew";
              const elems: ReactNode[] = [];

              if (isNatGrowth) {
                elems.push(
                  <tr key={`${k}-qual`} className="border-b border-border/60">
                    <th scope="row" className="py-2 px-6 pl-12 text-left font-normal text-muted-foreground text-xs">National growth — qualification</th>
                    {result.cols.map((c, i) => (
                      <td key={i} className={`text-right py-2 px-6 border-l-4 ${i === activeIdx ? "border-l-success" : "border-l-transparent"} ${isBestCol(i) ? "bg-success-soft/25" : ""}`}>
                        {c.qualified ? (
                          <StatusLabel kind="qualified">{scenarios[i].nationalGrowthRate}% · ≥ {fmtGBP(scenarios[i].targetThreshold)}</StatusLabel>
                        ) : (
                          <StatusLabel kind="warning">Threshold not met</StatusLabel>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              }

              const tooltipFor = (k === "Branch Growth Incentive")
                ? "Sum of payments from all branches that individually met their growth target. Each branch is assessed independently against its own threshold."
                : undefined;

              elems.push(
                <Row
                  key={k}
                  label={k}
                  chip={ROW_CHIPS[k]}
                  tooltip={tooltipFor}
                  cols={result.cols.map((c, i) => {
                    const v = c.lines[k] ?? 0;
                    let amber = false;
                    let thresholdLabel: string | undefined;
                    let thresholdMet = true;
                    if (isNatGrowth) {
                      thresholdMet = !!c.qualified;
                      amber = !thresholdMet;
                      thresholdLabel = thresholdMet ? "Qualified" : "Threshold not met";
                    } else if (isTargetEW) {
                      thresholdMet = !!c.qualifications?.["Target EW Rebate"];
                      amber = !thresholdMet;
                      thresholdLabel = thresholdMet ? "Qualified" : "Threshold not met";
                    }
                    return {
                      value: fmtGBP(v),
                      amber,
                      thresholdLabel,
                      thresholdMet,
                      tooltip: amber && isNatGrowth
                        ? `Growth of ${scenarios[i].growth}% did not meet the threshold. Rate of ${scenarios[i].nationalGrowthRate}% does not apply.`
                        : undefined,
                    };
                  })}
                  activeIdx={activeIdx}
                  bestIdx={bestIdx}
                />
              );
              return elems;
            })}

            <Row label="Total rebate" accent="brand" cols={result.cols.map((c) => ({ value: fmtGBP(c.totalRebate) }))} activeIdx={activeIdx} bestIdx={bestIdx} />
            <Row label="Gross profit" accent="success" cols={result.cols.map((c) => ({ value: fmtGBP(c.gp) }))} activeIdx={activeIdx} bestIdx={bestIdx} />
            <Row label="GP %" accent="success" cols={result.cols.map((c) => ({ value: fmtPct(c.gpPct) }))} activeIdx={activeIdx} bestIdx={bestIdx} />
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Column header for a scenario: the selected column gets a left rule + "(selected)" text; the best one a "Best GP" badge. */
function ScenarioColHeader({ label, active, best }: { label: string; active: boolean; best: boolean }) {
  return (
    <th
      scope="col"
      aria-current={active ? "true" : undefined}
      className={`text-right py-3 px-6 font-semibold whitespace-nowrap border-l-4 ${active ? "border-l-success" : "border-l-transparent"} ${best ? "bg-success-soft/40" : ""}`}
    >
      <span className="inline-flex items-center gap-2 justify-end">
        {label}
        {active && <span className="sr-only">(selected)</span>}
        {best && <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-success text-white">Best GP</span>}
      </span>
    </th>
  );
}

/** Display sentence case for line-item keys while keeping acronyms (EW, MVHR, SOC, NBU, GP). */
const sentenceCase = (s: string) =>
  s.split(" ").map((w, i) => (i === 0 || /^[A-Z]{2,}$/.test(w) ? w : w.toLowerCase())).join(" ");

function Row({
  label, chip, cols, accent, activeIdx, bestIdx, indent, muted, tooltip,
}: {
  label: string;
  chip?: RebateType | "Settlement";
  cols: { value: string; amber?: boolean; thresholdLabel?: string; thresholdMet?: boolean; tooltip?: string }[];
  accent?: "brand" | "success";
  activeIdx: number;
  bestIdx: number;
  indent?: boolean;
  muted?: boolean;
  tooltip?: string;
}) {
  const accentClass =
    accent === "brand" ? "text-brand font-semibold bg-brand-soft/40"
    : accent === "success" ? "text-success font-semibold bg-success-soft/50"
    : "";
  const labelClass = muted ? "text-muted-foreground italic" : "";
  return (
    <tr className={`border-b border-border/60 last:border-0 ${accentClass}`}>
      <th scope="row" className={`py-2 px-6 text-left ${accent ? "font-semibold" : "font-normal"} ${indent ? "pl-12" : ""} ${labelClass}`} title={tooltip}>
        <span className="inline-flex items-center gap-2">
          {chip && <TypeChip type={chip} />}
          <span>{sentenceCase(label)}</span>
        </span>
      </th>
      {cols.map((c, i) => {
        const active = i === activeIdx;
        const isBest = i === bestIdx && bestIdx > 0;
        return (
          <td
            key={i}
            className={`text-right py-2 px-6 tabular-nums whitespace-nowrap border-l-4 ${active ? "border-l-success" : "border-l-transparent"} ${isBest ? "bg-success-soft/25" : ""} ${muted ? "text-muted-foreground" : ""}`}
            title={c.tooltip}
          >
            <div className={c.amber ? "text-warning-foreground" : ""}>{c.value}</div>
            {c.thresholdLabel && (
              <div className="mt-0.5">
                {c.thresholdMet ? (
                  <StatusLabel kind="qualified">Qualified</StatusLabel>
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
  scenarios, totals, activeIdx, bestIdx,
}: {
  scenarios: Scenario[];
  totals: { turnover: number; cost: number; rebate: number; settlement: number; gp: number; gpPct: number }[];
  activeIdx: number;
  bestIdx: number;
}) {
  const isBestCol = (i: number) => i === bestIdx && bestIdx > 0;
  return (
    <section aria-labelledby="rm-total-summary" className="bg-card border-2 border-brand/30 rounded-xl overflow-hidden shadow-sm">
      <div className="px-6 py-3 border-b border-border bg-brand-soft/30 flex items-center justify-between flex-wrap gap-2">
        <h3 id="rm-total-summary" className="font-semibold text-base">Total summary <span className="text-muted-foreground font-normal text-sm">(EW + SOC + NBU combined)</span></h3>
        <span className="text-xs text-muted-foreground">All layers added together</span>
      </div>
      <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Total summary (scrolls horizontally)">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th scope="col" className="text-left py-3 px-6 font-semibold">Metric</th>
              {scenarios.map((_, i) => (
                <ScenarioColHeader key={i} label={i === 0 ? "Actual" : `Scenario ${i}`} active={i === activeIdx} best={isBestCol(i)} />
              ))}
            </tr>
          </thead>
          <tbody>
            <Row label="Total turnover" cols={totals.map((t) => ({ value: fmtGBP(t.turnover) }))} activeIdx={activeIdx} bestIdx={bestIdx} />
            <Row label="Total cost" cols={totals.map((t) => ({ value: fmtGBP(t.cost) }))} activeIdx={activeIdx} bestIdx={bestIdx} />
            <Row label="Settlement discount" chip="Settlement" cols={totals.map((t) => ({ value: fmtGBP(t.settlement) }))} activeIdx={activeIdx} bestIdx={bestIdx} />
            <Row label="Total rebate" accent="brand" cols={totals.map((t) => ({ value: fmtGBP(t.rebate) }))} activeIdx={activeIdx} bestIdx={bestIdx} />
            <Row label="Net gross profit (£)" accent="success" cols={totals.map((t) => ({ value: fmtGBP(t.gp) }))} activeIdx={activeIdx} bestIdx={bestIdx} />
            <Row label="GP %" accent="success" cols={totals.map((t) => ({ value: fmtPct(t.gpPct) }))} activeIdx={activeIdx} bestIdx={bestIdx} />
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
  { key: "gpBefore", label: "Gross profit before rebates" },
  { key: "fixedEW", label: "Fixed EW rebate" },
  { key: "targetEW", label: "Target EW rebate" },
  { key: "natGrowth", label: "National growth rebate" },
  { key: "branchGrowth", label: "Branch growth incentive" },
  { key: "settlement", label: "Settlement discount" },
  { key: "mvhr", label: "MVHR rebate" },
  { key: "totalRebate", label: "Total rebate (£)", highlight: true },
  { key: "netGP", label: "Net GP (£)", highlight: true },
  { key: "gpPct", label: "GP %", highlight: true },
];

function VarianceAnalysis({
  actual, ewResults, socResults, nbuResults, totals,
  ewTurnover, ewCost, socTurnover, socCost, nbuTurnover, nbuCost, settlementDiscount, onPrint,
}: {
  onPrint: () => void;
  actual: Scenario;
  ewResults: { cols: ColResult[] };
  socResults: { cols: ColResult[] };
  nbuResults: { cols: ColResult[] };
  totals: { turnover: number; cost: number; rebate: number; settlement: number; gp: number; gpPct: number }[];
  ewTurnover: number; ewCost: number;
  socTurnover: number; socCost: number;
  nbuTurnover: number; nbuCost: number;
  settlementDiscount: number;
}) {
  const prior = useMemo(() => {
    const turnover = ewTurnover + socTurnover + nbuTurnover;
    const cogs = ewCost + socCost + nbuCost;
    const gpBefore = turnover - cogs;
    const fixedEW = ewResults.cols[0].lines["Fixed EW Rebate"] ?? 0;
    const targetEW = ewResults.cols[0].lines["Target EW Rebate"] ?? 0;
    const natGrowth = ewResults.cols[0].lines["National Growth Rebate"] ?? 0;
    const branchGrowth = ewResults.cols[0].lines["Branch Growth Incentive"] ?? 0;
    const settlement = settlementDiscount;
    const mvhr = ewResults.cols[0].lines["MVHR Rebate"] ?? 0;
    const totalRebate = fixedEW + targetEW + natGrowth + branchGrowth + settlement + mvhr +
      (socResults.cols[0].totalRebate ?? 0) + (nbuResults.cols[0].totalRebate ?? 0);
    const netGP = gpBefore - totalRebate;
    return { turnover, cogs, gpBefore, fixedEW, targetEW, natGrowth, branchGrowth, settlement, mvhr, totalRebate, netGP, gpPct: turnover ? (netGP / turnover) * 100 : 0 };
  }, [ewTurnover, ewCost, socTurnover, socCost, nbuTurnover, nbuCost, ewResults, socResults, nbuResults, settlementDiscount]);

  const current = useMemo(() => {
    const t = totals[0];
    const fixedEW = ewResults.cols[0].lines["Fixed EW Rebate"] ?? 0;
    const targetEW = ewResults.cols[0].lines["Target EW Rebate"] ?? 0;
    const natGrowth = ewResults.cols[0].lines["National Growth Rebate"] ?? 0;
    const branchGrowth = ewResults.cols[0].lines["Branch Growth Incentive"] ?? 0;
    const mvhr = ewResults.cols[0].lines["MVHR Rebate"] ?? 0;
    return {
      turnover: t.turnover, cogs: t.cost,
      gpBefore: t.turnover - t.cost,
      fixedEW, targetEW, natGrowth, branchGrowth,
      settlement: actual.settlement, mvhr,
      totalRebate: t.rebate, netGP: t.gp, gpPct: t.gpPct,
    };
  }, [totals, ewResults, actual]);

  type ProposedShape = Record<string, number>;
  const [proposed, setProposed] = useState<ProposedShape>(() => ({ ...current }));
  const initRef = useRef(false);
  useEffect(() => {
    if (!initRef.current) {
      setProposed({ ...current });
      initRef.current = true;
    }
  }, [current]);

  /** Rebate lines not editable in column C (SOC, NBU, regional growth, marketing) carry over unchanged, so C = B until a value is edited. */
  const fixedOtherRebate = useMemo(
    () => current.totalRebate - (current.fixedEW + current.targetEW + current.natGrowth + current.branchGrowth + current.settlement + current.mvhr),
    [current],
  );

  const proposedDerived = useMemo(() => {
    const totalRebate = (proposed.fixedEW ?? 0) + (proposed.targetEW ?? 0) + (proposed.natGrowth ?? 0)
      + (proposed.branchGrowth ?? 0) + (proposed.settlement ?? 0) + (proposed.mvhr ?? 0) + fixedOtherRebate;
    const netGP = (proposed.turnover ?? 0) - (proposed.cogs ?? 0) - totalRebate;
    const gpPct = proposed.turnover ? (netGP / proposed.turnover) * 100 : 0;
    return { ...proposed, totalRebate, netGP, gpPct, gpBefore: (proposed.turnover ?? 0) - (proposed.cogs ?? 0) };
  }, [proposed, fixedOtherRebate]);

  const variance = (key: string) => {
    const c = (current as Record<string, number>)[key] ?? 0;
    const p = (proposedDerived as Record<string, number>)[key] ?? 0;
    return p - c;
  };

  const isGPRow = (k: string) => k === "netGP" || k === "gpPct" || k === "gpBefore";

  const fmt = (k: string, n: number) => k === "gpPct" ? fmtPct(n) : fmtGBP(n);

  const setField = (k: string, n: number) => setProposed((p) => ({ ...p, [k]: n }));

  return (
    <section aria-labelledby="rm-variance-title" className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0 max-w-3xl">
          <h2 id="rm-variance-title" className="text-lg font-semibold tracking-tight">Variance analysis</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Compare the current agreement's projected results with a proposed new agreement to show the financial impact of changes. Column A (prior-year actual) comes from Sage and is locked.
          </p>
        </div>
        <Btn variant="outline" icon={Printer} onClick={onPrint} title="Print or save as PDF">
          Print comparison
        </Btn>
      </div>

      <section aria-label="Variance table" className="bg-card border border-border rounded-xl overflow-hidden shadow-sm">
        <div className="relative overflow-x-auto" tabIndex={0} role="region" aria-label="Variance table (scrolls horizontally)">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th scope="col" className="text-left py-3 px-6 font-semibold">Metric</th>
                <th scope="col" className="text-right py-3 px-6 font-semibold whitespace-nowrap bg-muted text-foreground">
                  A · Prior-year actual <span className="ml-1 text-xs font-semibold text-muted-foreground inline-flex items-center gap-1"><Lock className="size-3" aria-hidden /> Locked</span>
                </th>
                <th scope="col" className="text-right py-3 px-6 font-semibold whitespace-nowrap bg-info-soft text-foreground">
                  B · Current agreement projected
                </th>
                <th scope="col" className="text-right py-3 px-6 font-semibold whitespace-nowrap bg-brand-soft text-foreground min-w-48">
                  C · Proposed agreement projected
                </th>
                <th scope="col" className="text-right py-3 px-6 font-semibold whitespace-nowrap">Variance (C vs B)</th>
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
                const varColor = zero ? "text-muted-foreground" : positiveGood ? "text-success" : "text-destructive";
                const arrow = zero ? "—" : v > 0 ? "▲" : "▼";
                const sign = v > 0 ? "+" : "−";
                const rowBg = r.highlight ? "bg-success-soft/30 font-semibold" : "";
                return (
                  <tr key={r.key} className={`border-b border-border/60 last:border-0 ${rowBg}`}>
                    <th scope="row" className={`py-2 px-6 text-left whitespace-nowrap ${r.highlight ? "font-semibold" : "font-normal"}`}>{r.label}</th>
                    <td className="py-2 px-6 text-right tabular-nums bg-muted/60">
                      {fmt(r.key, (prior as Record<string, number>)[r.key] ?? 0)}
                    </td>
                    <td className="py-2 px-6 text-right tabular-nums bg-info-soft/60">
                      {fmt(r.key, (current as Record<string, number>)[r.key] ?? 0)}
                    </td>
                    <td className="py-2 px-6 text-right tabular-nums bg-brand-soft/60">
                      {editable ? (
                        <NumInput
                          value={(proposed as Record<string, number>)[r.key] ?? 0}
                          onChange={(n) => setField(r.key, n)}
                          prefix={r.key === "gpPct" ? undefined : "£"}
                          suffix={r.key === "gpPct" ? "%" : undefined}
                          label={`${r.label} — proposed agreement (£)`}
                          {...GBP}
                        />
                      ) : (
                        <span>{fmt(r.key, (proposedDerived as Record<string, number>)[r.key] ?? 0)}</span>
                      )}
                    </td>
                    <td className={`py-2 px-6 text-right tabular-nums whitespace-nowrap ${varColor}`}>
                      {zero ? (
                        <span>— <span className="sr-only">no change</span></span>
                      ) : (
                        <>
                          <span aria-hidden>{arrow} </span>
                          {sign}{r.key === "gpPct" ? `${Math.abs(v).toFixed(1)} pp` : fmtGBP(Math.abs(v))}
                          <span className="sr-only">{positiveGood ? " (favourable)" : " (unfavourable)"}</span>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">
        Variance = proposed minus current for each metric. Green with a sign shows an improvement in gross profit terms; red shows a reduction.
      </p>
    </section>
  );
}

/* ---------------- Sticky bottom KPI bar ---------------- */

function BottomKPIBar({
  totals, account, subLabel, activeIdx, onViewResults,
}: {
  totals: { turnover: number; cost: number; rebate: number; settlement: number; gp: number; gpPct: number }[];
  account: string;
  subLabel: string;
  activeIdx: number;
  onViewResults?: () => void;
}) {
  const actual = totals[0];
  const active = totals[activeIdx] ?? actual;
  const uplift = active.gp - actual.gp;
  return (
    <div role="region" aria-label="Results summary" className="rounded-xl border border-border bg-card/95 backdrop-blur shadow-lg">
      <div className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
        <div className="leading-tight min-w-0">
          <div className="font-bold text-sm">{account}</div>
          <div className="text-xs text-muted-foreground truncate">{subLabel}</div>
        </div>
        <div className="hidden md:flex items-center gap-x-8">
          <BKpi label="Total rebate" value={fmtGBP(active.rebate)} accent="brand" />
          <BKpi
            label="Net GP (£)" value={fmtGBP(active.gp)} accent="success"
            chip={uplift !== 0 && activeIdx > 0 ? (
              <span className={`inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded ${
                uplift > 0 ? "bg-success-soft text-success" : "bg-danger-soft text-destructive"
              }`}>
                <span aria-hidden>{uplift > 0 ? "▲" : "▼"}</span> {fmtSignedGBP(uplift)} vs actual
              </span>
            ) : null}
          />
          <BKpi label="GP %" value={fmtPct(active.gpPct)} accent="success" />
        </div>
        <div className="ml-auto flex items-center gap-2">
          {onViewResults && (
            <Btn variant="outline" icon={ArrowDown} onClick={onViewResults}>
              View results
            </Btn>
          )}
        </div>
      </div>
    </div>
  );
}

function BKpi({ label, value, accent, chip }: { label: string; value: string; accent?: "brand" | "success"; chip?: ReactNode }) {
  const color = accent === "brand" ? "text-brand" : accent === "success" ? "text-success" : "text-foreground";
  return (
    <div className="leading-tight">
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
      <div className="flex items-center gap-2">
        <div className={`font-bold tabular-nums text-base ${color}`}>{value}</div>
        {chip}
      </div>
    </div>
  );
}

/* ---------------- Modals ---------------- */

function SaveScenarioModal({
  open, name, setName, onCancel, onSave,
}: { open: boolean; name: string; setName: (s: string) => void; onCancel: () => void; onSave: () => void }) {
  const empty = !name.trim();
  return (
    <Modal
      open={open}
      title="Save scenario"
      subtitle="Saved scenarios are read-only snapshots. You can keep up to 5."
      onClose={onCancel}
      size="sm"
      footer={
        <>
          <Btn variant="subtle" onClick={onCancel}>Cancel</Btn>
          <Btn type="submit" form="rm-save-form" icon={Bookmark} disabled={empty} title={empty ? "Enter a scenario name to save" : undefined}>
            Save
          </Btn>
        </>
      }
    >
      <form
        id="rm-save-form"
        onSubmit={(e) => { e.preventDefault(); if (!empty) onSave(); }}
      >
        <Field
          label="Scenario name"
          required
          error={empty ? "Enter a scenario name to save" : undefined}
          hint="Editing a loaded scenario later creates a new unsaved working copy."
        >
          <input
            data-autofocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. AWEBB 2026 - Option A"
            maxLength={80}
            className={inputCls}
          />
        </Field>
      </form>
    </Modal>
  );
}
