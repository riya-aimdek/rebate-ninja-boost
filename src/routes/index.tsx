import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import {
  ArrowDown,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  X,
  Plus,
  Trash2,
  RotateCcw,
  Sparkles,
  Printer,
  HelpCircle,
  Download,
  Upload,
  FileSpreadsheet,
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

  // UX state
  const [calculated, setCalculated] = useState(false);
  const [stale, setStale] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [calculating, setCalculating] = useState(false);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Header context
  const [year, setYear] = useState("2026");
  const [account, setAccount] = useState("AWEBB");
  const [activeNav, setActiveNav] = useState("Rebate Modeling");
  const [search, setSearch] = useState("");

  // Persistence ------------------------------------------------------------
  const STORAGE_KEY = "rebate-ninja:modeling:v3";
  const restoredRef = useRef(false);
  useEffect(() => {
    if (typeof window === "undefined" || restoredRef.current) return;
    restoredRef.current = true;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
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
      if (s.actual) setActual(s.actual);
      if (Array.isArray(s.scenarios) && s.scenarios.length) setScenarios(s.scenarios);
      if (s.year) setYear(s.year);
      if (s.account) setAccount(s.account);
    } catch {
      /* ignore */
    }
  }, []);
  useEffect(() => {
    if (typeof window === "undefined" || !restoredRef.current) return;
    const payload = {
      fixedEW, targetEW, nbuRebate, socRebate,
      ewTurnover, ewCost, socTurnover, socCost, nbuTurnover, nbuCost,
      actual, scenarios, year, account,
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(payload)); } catch { /* ignore */ }
  }, [fixedEW, targetEW, nbuRebate, socRebate, ewTurnover, ewCost, socTurnover, socCost, nbuTurnover, nbuCost, actual, scenarios, year, account]);

  const updateScenario = (i: number, patch: Partial<Scenario>) => {
    setScenarios((s) => s.map((sc, idx) => (idx === i ? { ...sc, ...patch } : sc)));
    if (calculated) setStale(true);
  };

  const addScenario = () => {
    setScenarios((s) => {
      const next = s[s.length - 1];
      const newGrowth = (next?.growth ?? 0) + 10;
      return [
        ...s,
        {
          name: `Scenario ${s.length + 1}`,
          growth: newGrowth,
          nationalGrowthRebate: next?.nationalGrowthRebate ?? 3.5,
          targetTurnover: Math.round((next?.targetTurnover ?? 1200000) * 1.1),
          branchGrowthRebate: next?.branchGrowthRebate ?? 0,
          settlement: Math.round((next?.settlement ?? 30000) * 1.05),
          mvhr: next?.mvhr ?? 0,
        },
      ];
    });
    if (calculated) setStale(true);
  };

  const removeScenario = (idx: number) => {
    setScenarios((s) =>
      s
        .filter((_, i) => i !== idx)
        .map((sc, i) => ({ ...sc, name: `Scenario ${i + 1}` }))
    );
    if (calculated) setStale(true);
  };

  const resetAll = () => {
    setFixedEW(0); setTargetEW(0); setNbuRebate(0); setSocRebate(0);
    setEwTurnover(0); setEwCost(0);
    setSocTurnover(0); setSocCost(0);
    setNbuTurnover(0); setNbuCost(0);
    setActual({ name: "Actual", growth: 0, nationalGrowthRebate: 0, targetTurnover: 0, branchGrowthRebate: 0, settlement: 0, mvhr: 0 });
    setScenarios([{ name: "Scenario 1", growth: 10, nationalGrowthRebate: 0, targetTurnover: 0, branchGrowthRebate: 0, settlement: 0, mvhr: 0 }]);
    setCalculated(false); setStale(false);
    setToast("All inputs cleared");
  };

  // ---- Excel upload / template ----
  const fileInputRef = useRef<HTMLInputElement>(null);

  const triggerUpload = () => fileInputRef.current?.click();

  const applyImported = (data: {
    fixedEW?: number; targetEW?: number; nbuRebate?: number; socRebate?: number;
    ewTurnover?: number; ewCost?: number;
    socTurnover?: number; socCost?: number;
    nbuTurnover?: number; nbuCost?: number;
    actual?: Partial<Scenario>;
    scenarios?: Scenario[];
  }) => {
    if (data.fixedEW !== undefined) setFixedEW(data.fixedEW);
    if (data.targetEW !== undefined) setTargetEW(data.targetEW);
    if (data.nbuRebate !== undefined) setNbuRebate(data.nbuRebate);
    if (data.socRebate !== undefined) setSocRebate(data.socRebate);
    if (data.ewTurnover !== undefined) setEwTurnover(data.ewTurnover);
    if (data.ewCost !== undefined) setEwCost(data.ewCost);
    if (data.socTurnover !== undefined) setSocTurnover(data.socTurnover);
    if (data.socCost !== undefined) setSocCost(data.socCost);
    if (data.nbuTurnover !== undefined) setNbuTurnover(data.nbuTurnover);
    if (data.nbuCost !== undefined) setNbuCost(data.nbuCost);
    if (data.actual) setActual((a) => ({ ...a, ...data.actual!, name: "Actual" }));
    if (data.scenarios && data.scenarios.length) setScenarios(data.scenarios);
    if (calculated) setStale(true);
  };

  const handleFile = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const num = (v: unknown) => {
        if (v === null || v === undefined || v === "") return undefined;
        const n = Number(String(v).replace(/[£,%\s]/g, ""));
        return Number.isFinite(n) ? n : undefined;
      };
      const data: Parameters<typeof applyImported>[0] = {};

      // Inputs sheet: two columns Key, Value
      const inputsSheet = wb.Sheets["Inputs"] ?? wb.Sheets[wb.SheetNames[0]];
      if (inputsSheet) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(inputsSheet, { header: ["key", "value"] });
        const map: Record<string, number | undefined> = {};
        for (const r of rows) {
          const k = String(r.key ?? "").trim();
          if (!k || k.toLowerCase() === "key") continue;
          map[k] = num(r.value);
        }
        const get = (...keys: string[]) => {
          for (const k of keys) {
            const found = Object.keys(map).find((mk) => mk.toLowerCase() === k.toLowerCase());
            if (found && map[found] !== undefined) return map[found];
          }
          return undefined;
        };
        data.fixedEW = get("fixedEW", "Fixed EW %");
        data.targetEW = get("targetEW", "Target EW %");
        data.nbuRebate = get("nbuRebate", "NBU Rebate %");
        data.socRebate = get("socRebate", "SOC Rebate %");
        data.ewTurnover = get("ewTurnover", "EW Turnover");
        data.ewCost = get("ewCost", "EW Cost");
        data.socTurnover = get("socTurnover", "SOC Turnover");
        data.socCost = get("socCost", "SOC Cost");
        data.nbuTurnover = get("nbuTurnover", "NBU Turnover");
        data.nbuCost = get("nbuCost", "NBU Cost");
        const actualPatch: Partial<Scenario> = {};
        const ag = get("actual.growth"); if (ag !== undefined) actualPatch.growth = ag;
        const an = get("actual.nationalGrowthRebate"); if (an !== undefined) actualPatch.nationalGrowthRebate = an;
        const at = get("actual.targetTurnover"); if (at !== undefined) actualPatch.targetTurnover = at;
        const ab = get("actual.branchGrowthRebate"); if (ab !== undefined) actualPatch.branchGrowthRebate = ab;
        const as = get("actual.settlement"); if (as !== undefined) actualPatch.settlement = as;
        const am = get("actual.mvhr"); if (am !== undefined) actualPatch.mvhr = am;
        if (Object.keys(actualPatch).length) data.actual = actualPatch;
      }

      // Scenarios sheet: header row with name, growth, nationalGrowthRebate, targetTurnover, branchGrowthRebate, settlement, mvhr
      const scSheet = wb.Sheets["Scenarios"];
      if (scSheet) {
        const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(scSheet);
        const parsed: Scenario[] = rows
          .map((r, i) => {
            const get = (...keys: string[]) => {
              for (const k of keys) {
                const found = Object.keys(r).find((rk) => rk.toLowerCase().replace(/\s|_/g, "") === k.toLowerCase().replace(/\s|_/g, ""));
                if (found) return num(r[found]);
              }
              return undefined;
            };
            const growth = get("growth", "growth%");
            if (growth === undefined) return null;
            return {
              name: String(r.name ?? r.Name ?? `Scenario ${i + 1}`),
              growth,
              nationalGrowthRebate: get("nationalGrowthRebate", "national growth rebate") ?? 0,
              targetTurnover: get("targetTurnover", "target turnover") ?? 0,
              branchGrowthRebate: get("branchGrowthRebate", "branch growth rebate") ?? 0,
              settlement: get("settlement") ?? 0,
              mvhr: get("mvhr") ?? 0,
            } as Scenario;
          })
          .filter((s): s is Scenario => !!s);
        if (parsed.length) data.scenarios = parsed;
      }

      const filledKeys = Object.keys(data).filter((k) => data[k as keyof typeof data] !== undefined);
      if (!filledKeys.length) {
        setToast("No matching data found. Use the template format.");
        return;
      }
      applyImported(data);
      setToast(`Imported ${filledKeys.length} field${filledKeys.length === 1 ? "" : "s"} from ${file.name}`);
    } catch (err) {
      console.error(err);
      setToast("Failed to read file. Make sure it's a valid .xlsx");
    }
  };

  const downloadTemplate = () => {
    const wb = XLSX.utils.book_new();
    const inputs = [
      ["Key", "Value"],
      ["fixedEW", 5],
      ["targetEW", 5],
      ["nbuRebate", 5],
      ["socRebate", 5],
      ["ewTurnover", 1194312],
      ["ewCost", 597834],
      ["socTurnover", 4098722],
      ["socCost", 1591683],
      ["nbuTurnover", 357780],
      ["nbuCost", 203516],
      ["actual.growth", 0],
      ["actual.nationalGrowthRebate", 1],
      ["actual.targetTurnover", 1141167],
      ["actual.branchGrowthRebate", 0],
      ["actual.settlement", 29858],
      ["actual.mvhr", 0],
    ];
    const inputsSheet = XLSX.utils.aoa_to_sheet(inputs);
    XLSX.utils.book_append_sheet(wb, inputsSheet, "Inputs");

    const scenarios = [
      ["name", "growth", "nationalGrowthRebate", "targetTurnover", "branchGrowthRebate", "settlement", "mvhr"],
      ["Scenario 1", 10, 3.5, 1200000, 0, 32844, 0],
      ["Scenario 2", 20, 3.5, 1275000, 2, 35829, 0],
      ["Scenario 3", 30, 4.5, 1400000, 3, 38815, 0],
    ];
    const scSheet = XLSX.utils.aoa_to_sheet(scenarios);
    XLSX.utils.book_append_sheet(wb, scSheet, "Scenarios");

    XLSX.writeFile(wb, "rebate-modeling-template.xlsx");
    setToast("Template downloaded");
  };


  // Wrap baseline setters to flag stale
  const markStale = () => {
    if (calculated) setStale(true);
  };

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

  const handleCalculate = () => {
    setCalculating(true);
    // Brief simulated processing so the user perceives action
    setTimeout(() => {
      setCalculated(true);
      setStale(false);
      setCalculating(false);
      setToast("Calculation complete — scroll down to view results");
      // Scroll results into view smoothly
      requestAnimationFrame(() => {
        resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }, 450);
  };

  const exportCSV = () => {
    if (!calculated) {
      setToast("Run Calculate first, then export");
      return;
    }
    const allScenarios = [actual, ...scenarios];
    const headers = ["Layer", "Metric", ...allScenarios.map((s, i) => (i === 0 ? "Actual" : s.name))];
    const rows: string[][] = [];
    const layers: { label: string; res: { cols: ColResult[] } }[] = [
      { label: "EW", res: ewResults },
      { label: "SOC", res: socResults },
      { label: "NBU", res: nbuResults },
    ];
    for (const { label, res } of layers) {
      rows.push([label, "Turnover", ...res.cols.map((c) => Math.round(c.turnover).toString())]);
      rows.push([label, "Cost", ...res.cols.map((c) => Math.round(c.cost).toString())]);
      const keys = Object.keys(res.cols[0].lines);
      for (const k of keys) {
        rows.push([label, k, ...res.cols.map((c) => Math.round(c.lines[k] ?? 0).toString())]);
      }
      rows.push([label, "Total Rebate", ...res.cols.map((c) => Math.round(c.totalRebate).toString())]);
      rows.push([label, "Gross Profit", ...res.cols.map((c) => Math.round(c.gp).toString())]);
      rows.push([label, "GP %", ...res.cols.map((c) => c.gpPct.toFixed(2))]);
    }
    rows.push(["TOTAL", "Total Turnover", ...totals.map((t) => Math.round(t.turnover).toString())]);
    rows.push(["TOTAL", "Total Cost", ...totals.map((t) => Math.round(t.cost).toString())]);
    rows.push(["TOTAL", "Total Rebate", ...totals.map((t) => Math.round(t.rebate).toString())]);
    rows.push(["TOTAL", "Total Gross Profit", ...totals.map((t) => Math.round(t.gp).toString())]);
    rows.push(["TOTAL", "GP %", ...totals.map((t) => t.gpPct.toFixed(2))]);

    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [headers, ...rows].map((r) => r.map(esc).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rebate-modeling-${account}-${year}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setToast("CSV exported");
  };

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Keyboard shortcut: Cmd/Ctrl + Enter triggers Calculate from anywhere on the page
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        if (!calculating) handleCalculate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calculating]);

  // Track whether the results section is visible — drives the floating jump pill
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

  const bestScenarioIdx = useMemo(() => {
    if (!totals.length) return 0;
    let best = 0;
    for (let i = 1; i < totals.length; i++) if (totals[i].gp > totals[best].gp) best = i;
    return best;
  }, [totals]);




  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar active={activeNav} onSelect={setActiveNav} />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar search={search} onSearch={setSearch} account={account} />

        {/* (Bottom-fixed KPI bar rendered at end of layout) */}

        <main className="flex-1 px-6 py-6 space-y-6">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          <PageHeader
            onCalculate={handleCalculate}
            calculating={calculating}
            calculated={calculated}
            stale={stale}
            onReset={resetAll}
            onUpload={triggerUpload}
            onTemplate={downloadTemplate}
            onPrint={() => window.print()}
            onExport={exportCSV}
            year={year}
            setYear={setYear}
            account={account}
            setAccount={setAccount}
          />

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <BaselineInputs
              ewTurnover={ewTurnover} setEwTurnover={(n) => { setEwTurnover(n); markStale(); }}
              ewCost={ewCost} setEwCost={(n) => { setEwCost(n); markStale(); }}
              socTurnover={socTurnover} setSocTurnover={(n) => { setSocTurnover(n); markStale(); }}
              socCost={socCost} setSocCost={(n) => { setSocCost(n); markStale(); }}
              nbuTurnover={nbuTurnover} setNbuTurnover={(n) => { setNbuTurnover(n); markStale(); }}
              nbuCost={nbuCost} setNbuCost={(n) => { setNbuCost(n); markStale(); }}
            />
            <GlobalConfig
              fixedEW={fixedEW} setFixedEW={(n) => { setFixedEW(n); markStale(); }}
              targetEW={targetEW} setTargetEW={(n) => { setTargetEW(n); markStale(); }}
              nbuRebate={nbuRebate} setNbuRebate={(n) => { setNbuRebate(n); markStale(); }}
              socRebate={socRebate} setSocRebate={(n) => { setSocRebate(n); markStale(); }}
            />
          </div>

          <GrowthConfig
            actual={actual}
            setActual={(s) => { setActual(s); markStale(); }}
            scenarios={scenarios}
            updateScenario={updateScenario}
            addScenario={addScenario}
            removeScenario={removeScenario}
          />


          {/* Calculate hint / CTA card — only when results not yet shown */}
          {!calculated && (
            <CalculateCTA onCalculate={handleCalculate} calculating={calculating} />
          )}

          <div ref={resultsRef} data-step="4" className="scroll-mt-32">

            {calculated && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                <ResultsHeader
                  stale={stale}
                  bestIdx={bestScenarioIdx}
                  totals={totals}
                  onRecalculate={handleCalculate}
                  calculating={calculating}
                  onPrint={() => window.print()}
                />
                <ResultsTable label="EW" scenarios={[actual, ...scenarios]} result={ewResults} layer="ew" bestIdx={bestScenarioIdx} />
                <ResultsTable label="SOC" scenarios={[actual, ...scenarios]} result={socResults} layer="linear" bestIdx={bestScenarioIdx} />
                <ResultsTable label="NBU" scenarios={[actual, ...scenarios]} result={nbuResults} layer="linear" bestIdx={bestScenarioIdx} />
                <TotalSummary scenarios={[actual, ...scenarios]} totals={totals} bestIdx={bestScenarioIdx} />
              </div>
            )}
          </div>

          <footer className="pt-4 pb-2 text-center text-xs text-muted-foreground">
            Rebate Modeling Calculator
          </footer>

          {/* Sticky-to-viewport-bottom summary bar; lives inside main so it only spans content width and stops sticking once the user reaches the page bottom. */}
          {calculated && (
            <div
              className={`sticky bottom-0 -mx-6 px-6 pb-3 pt-3 z-30 transition-all duration-300 ${
                resultsVisible
                  ? "opacity-0 translate-y-4 pointer-events-none"
                  : "opacity-100 translate-y-0"
              }`}
            >
              <BottomKPIBar
                totals={totals}
                stale={stale}
                account={account}
                bestIdx={bestScenarioIdx}
                bestGrowth={bestScenarioIdx > 0 ? scenarios[bestScenarioIdx - 1]?.growth ?? 0 : 0}
                onJumpToResults={() =>
                  resultsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })
                }
                onRecalculate={handleCalculate}
                calculating={calculating}
              />
            </div>
          )}
        </main>
      </div>



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

function Sidebar({ active, onSelect }: { active: string; onSelect: (label: string) => void }) {
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
                isActive
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
      <div className="px-4 py-3 border-t border-sidebar-border text-[11px] text-sidebar-foreground/60">
        Rebate Modeling Calculator
      </div>
    </aside>
  );
}

/* ---------------- Top bar ---------------- */

function TopBar({
  search,
  onSearch,
  account,
}: {
  search: string;
  onSearch: (v: string) => void;
  account: string;
}) {
  const initials = account.slice(0, 2).toUpperCase();
  return (
    <header className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-4">
      <button className="lg:hidden p-2 rounded-md hover:bg-muted">
        <PanelLeft className="size-5" />
      </button>
      <div className="flex-1 max-w-2xl relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
          placeholder="Search accounts, programs, scenarios…"
        />
      </div>
      <button className="relative p-2 rounded-md hover:bg-muted" title="Notifications">
        <Bell className="size-5" />
        <span className="absolute -top-0.5 -right-0.5 bg-brand text-brand-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5">
          99+
        </span>
      </button>
      <div className="size-9 rounded-full bg-gradient-to-br from-brand to-amber-500 grid place-items-center text-brand-foreground font-semibold text-sm" title={account}>
        {initials}
      </div>
    </header>
  );
}

/* ---------------- Page header ---------------- */

function PageHeader({
  onCalculate,
  calculating,
  calculated,
  stale,
  onReset,
  onUpload,
  onTemplate,
  onPrint,
  onExport,
  year,
  setYear,
  account,
  setAccount,
}: {
  onCalculate: () => void;
  calculating: boolean;
  calculated: boolean;
  stale: boolean;
  onReset: () => void;
  onUpload: () => void;
  onTemplate: () => void;
  onPrint: () => void;
  onExport: () => void;
  year: string;
  setYear: (v: string) => void;
  account: string;
  setAccount: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Rebate Modeling Calculator</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Model a single account's rebate agreement and instantly see the impact on Gross Profit.
        </p>
        <div className="flex flex-wrap items-center gap-3 mt-3 text-sm">
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground">Account</label>
            <select
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              className="px-2 py-1 rounded-md border border-input bg-background text-sm font-semibold text-brand"
            >
              <option>AWEBB</option>
              <option>BMICO</option>
              <option>CRESTA</option>
              <option>DELTA</option>
            </select>
          </div>
          <span className="px-2 py-0.5 rounded-full bg-brand-soft text-brand text-xs font-medium border border-brand/20">
            {account === "AWEBB" ? "AWB-001" : account === "BMICO" ? "BMI-002" : account === "CRESTA" ? "CRS-003" : "DLT-004"}
          </span>
          <div className="flex items-center gap-2">
            <label className="text-muted-foreground">Year</label>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="px-2 py-1 rounded-md border border-input bg-background text-sm"
            >
              <option>2026</option>
              <option>2025</option>
              <option>2024</option>
            </select>
          </div>
        </div>
      </div>
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={onUpload}
            title="Import baseline & scenarios from an Excel file"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-brand/40 bg-brand-soft text-sm font-semibold text-brand hover:bg-brand/15 transition"
          >
            <Upload className="size-4" /> Upload Excel
          </button>
          <button
            onClick={onTemplate}
            title="Download a sample Excel template you can fill in"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted transition"
          >
            <FileSpreadsheet className="size-4 text-brand" /> Template
          </button>
          <button
            onClick={onReset}
            title="Clear all inputs"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted transition"
          >
            <RotateCcw className="size-4" /> Reset
          </button>
          {calculated && (
            <>
              <button
                onClick={onExport}
                title="Download results as CSV"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted transition"
              >
                <Download className="size-4" /> Export CSV
              </button>
              <button
                onClick={onPrint}
                title="Print or save as PDF"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border bg-card text-sm font-medium hover:bg-muted transition"
              >
                <Printer className="size-4" /> Print
              </button>
            </>
          )}
          <button
            onClick={onCalculate}
            disabled={calculating}
            className={`inline-flex items-center gap-2 px-6 py-2.5 rounded-md font-semibold shadow-md transition-all ${
              stale
                ? "bg-brand text-brand-foreground ring-4 ring-brand/25 animate-pulse"
                : "bg-brand text-brand-foreground hover:shadow-lg hover:-translate-y-0.5"
            } disabled:opacity-70`}
          >
            {calculating ? (
              <>
                <RefreshCw className="size-4 animate-spin" /> Calculating…
              </>
            ) : calculated ? (
              <>
                <RefreshCw className="size-4" /> Recalculate
              </>
            ) : (
              <>
                <CalcIcon className="size-4" /> Calculate
              </>
            )}
          </button>
        </div>
        {stale && (
          <div className="text-xs text-brand font-medium flex items-center gap-1.5">
            <AlertTriangle className="size-3.5" /> Inputs changed — click Recalculate
          </div>
        )}
      </div>
    </div>
  );
}




/* ---------------- Calculate CTA (pre-calc state) ---------------- */

function CalculateCTA({
  onCalculate,
  calculating,
}: {
  onCalculate: () => void;
  calculating: boolean;
}) {
  return (
    <div className="relative overflow-hidden bg-gradient-to-br from-brand-soft via-card to-brand-soft border-2 border-dashed border-brand/40 rounded-2xl px-6 py-10 text-center">
      <div className="absolute inset-0 opacity-30 pointer-events-none" aria-hidden>
        <div className="absolute -top-12 -right-12 size-48 rounded-full bg-brand/20 blur-3xl" />
        <div className="absolute -bottom-12 -left-12 size-48 rounded-full bg-amber-300/20 blur-3xl" />
      </div>
      <div className="relative">
        <div className="size-14 mx-auto rounded-full bg-brand text-brand-foreground grid place-items-center mb-4 shadow-lg">
          <CalcIcon className="size-7" />
        </div>
        <h3 className="text-xl font-bold">Ready to run your scenarios?</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
          We've prepared the inputs above. Click <span className="font-semibold text-foreground">Calculate</span> to
          see projected turnover, rebate breakdown, and Gross Profit impact for each scenario.
        </p>
        <button
          onClick={onCalculate}
          disabled={calculating}
          className="mt-5 inline-flex items-center gap-2 px-7 py-3 rounded-md bg-brand text-brand-foreground font-semibold shadow-md hover:shadow-lg hover:-translate-y-0.5 transition disabled:opacity-70"
        >
          {calculating ? (
            <>
              <RefreshCw className="size-4 animate-spin" /> Calculating…
            </>
          ) : (
            <>
              <CalcIcon className="size-4" /> Calculate Now
              <ArrowDown className="size-4 ml-1" />
            </>
          )}
        </button>
        <div className="mt-4 text-xs text-muted-foreground">
          Results will appear here with EW, SOC, NBU breakdowns and a total summary.
          <span className="hidden sm:inline"> · Tip: press <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono text-[10px]">⌘ / Ctrl</kbd> + <kbd className="px-1.5 py-0.5 rounded border border-border bg-muted font-mono text-[10px]">Enter</kbd> to calculate.</span>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Sticky KPI bar ---------------- */

function BottomKPIBar({
  totals,
  stale,
  account,
  bestIdx,
  bestGrowth,
  onJumpToResults,
  onRecalculate,
  calculating,
}: {
  totals: { turnover: number; cost: number; rebate: number; gp: number; gpPct: number }[];
  stale: boolean;
  account: string;
  bestIdx: number;
  bestGrowth: number;
  onJumpToResults: () => void;
  onRecalculate: () => void;
  calculating: boolean;
}) {
  const actual = totals[0];
  const best = totals[bestIdx] ?? actual;
  const uplift = best.gp - actual.gp;
  const growthLabel = bestIdx === 0 ? "Actual baseline" : `${bestGrowth}% Growth`;

  return (
    <div
      className={`rounded-xl border backdrop-blur shadow-[0_-4px_20px_-8px_rgba(0,0,0,0.15)] ${
        stale ? "border-brand/40 bg-brand-soft/95" : "border-border bg-card/95"
      }`}
    >
      <div className="px-6 py-3 flex flex-wrap items-center gap-x-8 gap-y-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`size-2.5 rounded-full ${stale ? "bg-brand animate-pulse" : "bg-success"}`} />
          <div className="leading-tight">
            <div className="font-bold text-sm">{account}</div>
            <div className="text-[11px] text-muted-foreground">
              {stale ? "Inputs changed — recalculate" : `Results ready · ${growthLabel}`}
            </div>
          </div>
        </div>

        <div className="hidden md:flex items-center gap-x-7">
          <BKpi label="Total Rebate" value={fmtGBP(best.rebate)} accent="brand" />
          <BKpi
            label="Net GP (£)"
            value={fmtGBP(best.gp)}
            accent="success"
            chip={
              uplift !== 0 ? (
                <span
                  className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded ${
                    uplift > 0
                      ? "bg-success-soft text-[oklch(0.4_0.14_155)]"
                      : "bg-destructive/10 text-destructive"
                  }`}
                >
                  {uplift > 0 ? "▲" : "▼"} {uplift > 0 ? "+" : ""}
                  {fmtGBP(uplift)}
                </span>
              ) : null
            }
          />
          <BKpi label="GP %" value={fmtPct(best.gpPct)} accent="success" />
        </div>

        <div className="ml-auto flex items-center gap-2">
          {stale && (
            <button
              onClick={onRecalculate}
              disabled={calculating}
              className="text-xs font-semibold px-3 py-2 rounded-md border border-brand/30 text-brand hover:bg-brand-soft transition inline-flex items-center gap-1.5 disabled:opacity-70"
            >
              <RefreshCw className={`size-3.5 ${calculating ? "animate-spin" : ""}`} /> Recalculate
            </button>
          )}
          <button
            onClick={onJumpToResults}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-brand text-brand-foreground font-semibold shadow hover:shadow-md hover:opacity-95 transition"
          >
            View full results <ArrowDown className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function BKpi({
  label,
  value,
  accent,
  chip,
}: {
  label: string;
  value: string;
  accent?: "brand" | "success";
  chip?: ReactNode;
}) {
  const color =
    accent === "brand" ? "text-brand" : accent === "success" ? "text-[oklch(0.4_0.14_155)]" : "text-foreground";
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


function KPI({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: "success" | "destructive";
}) {
  const color =
    accent === "success"
      ? "text-[oklch(0.4_0.14_155)]"
      : accent === "destructive"
      ? "text-destructive"
      : "text-foreground";
  return (
    <div className="leading-tight">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`font-bold tabular-nums ${color}`}>
        {value} {sub && <span className="text-xs font-medium opacity-70 ml-1">{sub}</span>}
      </div>
    </div>
  );
}

/* ---------------- Results section header ---------------- */

function ResultsHeader({
  stale,
  bestIdx,
  totals,
  onRecalculate,
  calculating,
  onPrint,
}: {
  stale: boolean;
  bestIdx: number;
  totals: { turnover: number; cost: number; rebate: number; gp: number; gpPct: number }[];
  onRecalculate: () => void;
  calculating: boolean;
  onPrint: () => void;
}) {
  const scenarioName = bestIdx === 0 ? "Actual 2026" : `Scenario ${bestIdx}`;
  const best = totals[bestIdx];
  const actual = totals[0];
  const uplift = best.gp - actual.gp;
  return (
    <div className="bg-card border border-border rounded-xl p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-lg bg-success-soft text-[oklch(0.4_0.14_155)] grid place-items-center shrink-0">
            <CheckCircle2 className="size-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Calculation Results</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Showing projected turnover, cost, rebate breakdown, and Gross Profit for each scenario.
            </p>
            {bestIdx > 0 && (
              <div className="mt-2 inline-flex items-center gap-2 text-xs bg-success-soft text-[oklch(0.4_0.14_155)] px-2.5 py-1 rounded-full font-medium">
                <TrendingUp className="size-3.5" />
                Best scenario: <span className="font-bold">{scenarioName}</span> · +{fmtGBP(uplift)} GP vs Actual
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onPrint}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm font-medium hover:bg-muted transition"
          >
            <Printer className="size-4" /> Print / Export
          </button>
          {stale && (
            <button
              onClick={onRecalculate}
              disabled={calculating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-brand text-brand-foreground text-sm font-semibold hover:opacity-90 transition disabled:opacity-70"
            >
              <RefreshCw className={`size-4 ${calculating ? "animate-spin" : ""}`} /> Recalculate
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Cards ---------------- */

function Card({
  title,
  hint,
  step,
  tooltip,
  action,
  children,
}: {
  title: string;
  hint?: string;
  step?: number;
  tooltip?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {step !== undefined && (
            <div className="size-7 shrink-0 rounded-lg bg-brand text-brand-foreground grid place-items-center text-xs font-black shadow-sm">
              {step}
            </div>
          )}
          <div className="min-w-0">
            <h2 className="font-semibold text-base flex items-center gap-1.5">
              <span className="truncate">{title}</span>
              {tooltip && (
                <span className="group relative inline-flex">
                  <HelpCircle className="size-3.5 text-muted-foreground cursor-help" />
                  <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-full mt-1.5 z-20 w-56 rounded-md bg-foreground text-background text-xs font-normal p-2 opacity-0 group-hover:opacity-100 transition shadow-lg">
                    {tooltip}
                  </span>
                </span>
              )}
            </h2>
            {hint && <p className="text-xs text-muted-foreground font-normal mt-0.5">{hint}</p>}
          </div>
        </div>
        {action}
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
  format,
  placeholder,
}: {
  value: number;
  onChange: (n: number) => void;
  suffix?: string;
  prefix?: string;
  format?: "number" | "currency";
  placeholder?: string;
}) {
  const useCurrency = format === "currency" || prefix === "£";
  const [focused, setFocused] = useState(false);
  const display = focused
    ? Number.isFinite(value) && value !== 0
      ? String(value)
      : ""
    : useCurrency
    ? Number.isFinite(value)
      ? value.toLocaleString("en-GB", { maximumFractionDigits: 0 })
      : "0"
    : String(Number.isFinite(value) ? value : 0);
  return (
    <div className="flex items-center rounded-md border border-input bg-background overflow-hidden focus-within:ring-2 focus-within:ring-ring/40 focus-within:border-brand/50 transition">
      {prefix && <span className="px-2.5 text-muted-foreground text-sm border-r border-input bg-muted font-medium">{prefix}</span>}
      <input
        type="text"
        inputMode="decimal"
        value={display}
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => {
          const cleaned = e.target.value.replace(/[, ]/g, "");
          const n = parseFloat(cleaned);
          onChange(Number.isFinite(n) ? n : 0);
        }}
        className="flex-1 min-w-0 px-3 py-2 text-sm bg-transparent focus:outline-none tabular-nums"
      />
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
    <Card
      title="Rebate Rates"
      step={2}
      hint="Set the percentage rates used across all scenarios"
      tooltip="These rates apply globally. Fixed/Target EW apply to the EW layer; NBU and SOC apply to their respective layers."
    >
      <div>
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
          EW (Employee Wellness)
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Fixed EW %">
            <NumInput value={props.fixedEW} onChange={props.setFixedEW} suffix="%" />
          </Field>
          <Field label="Target EW %">
            <NumInput value={props.targetEW} onChange={props.setTargetEW} suffix="%" />
          </Field>
        </div>
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

const LAYER_INFO: Record<string, string> = {
  EW: "Employee Wellness — multi-component rebate including Fixed, Target, National & Branch growth rebates, Settlement discount and MVHR.",
  SOC: "Standard Order Code — flat-rate rebate applied as a percentage of turnover.",
  NBU: "New Business Uplift — flat-rate rebate applied as a percentage of turnover.",
};

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
      <div className="flex items-center gap-1.5 mb-2">
        <span className="text-sm font-bold text-brand">{label}</span>
        <span className="group relative inline-flex">
          <HelpCircle className="size-3.5 text-muted-foreground cursor-help" />
          <span className="pointer-events-none absolute left-0 top-full mt-1.5 z-20 w-64 rounded-md bg-foreground text-background text-xs font-normal p-2 opacity-0 group-hover:opacity-100 transition shadow-lg">
            {LAYER_INFO[label]}
          </span>
        </span>
        <span className="ml-auto text-xs text-muted-foreground font-normal">
          GP: <span className="tabular-nums font-medium text-foreground">{fmtGBP(Math.max(0, t - c))}</span>
        </span>
      </div>
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
    <Card
      title="Baseline Financial Inputs"
      step={1}
      hint="Current year actuals · pulled from Sage"
      tooltip="The current-year turnover and cost per layer. These form the baseline that growth scenarios are projected from."
    >
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
  addScenario,
  removeScenario,
}: {
  actual: Scenario;
  setActual: (s: Scenario) => void;
  scenarios: Scenario[];
  updateScenario: (i: number, patch: Partial<Scenario>) => void;
  addScenario: () => void;
  removeScenario: (i: number) => void;
}) {
  const rows: {
    label: string;
    field: keyof Scenario;
    suffix?: string;
    prefix?: string;
    actualDisplay?: string;
    editableActual?: boolean;
    hint?: string;
  }[] = [
    { label: "Growth %", field: "growth", suffix: "%", actualDisplay: "0% (Actual)", hint: "Projected turnover growth vs baseline" },
    { label: "National Growth Rebate %", field: "nationalGrowthRebate", suffix: "%", editableActual: true, hint: "Applied only if turnover ≥ Target Turnover" },
    { label: "Target Turnover", field: "targetTurnover", prefix: "£", editableActual: true, hint: "Qualifying threshold for National Growth Rebate" },
    { label: "Branch Growth Rebate %", field: "branchGrowthRebate", suffix: "%", editableActual: true },
    { label: "Settlement Discount (£)", field: "settlement", prefix: "£", editableActual: true },
    { label: "MVHR Rebate (£)", field: "mvhr", prefix: "£", editableActual: true },
  ];

  return (
    <Card
      title="Growth Scenario Configuration"
      step={3}
      hint="Compare side-by-side what-if scenarios"
      tooltip="Each column is a what-if scenario. Set growth %, qualifying target, and rebate parameters per scenario, then click Calculate."
      action={
        <button
          onClick={addScenario}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-brand-soft text-brand text-xs font-semibold hover:bg-brand hover:text-brand-foreground transition border border-brand/30"
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
              <th className="py-3 px-3 font-semibold text-center bg-muted/40 rounded-t-md">Actual</th>
              {scenarios.map((s, i) => (
                <th key={s.name} className="py-3 px-3 font-semibold text-brand text-center min-w-[140px]">
                  <div className="flex items-center justify-center gap-1.5">
                    <span>{s.name}</span>
                    {scenarios.length > 1 && (
                      <button
                        onClick={() => removeScenario(i)}
                        title={`Remove ${s.name}`}
                        aria-label={`Remove ${s.name}`}
                        className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 p-1 rounded transition"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className="border-b border-border/60 last:border-0 hover:bg-muted/30 transition-colors">
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
                    <NumInput
                      value={actual[r.field] as number}
                      onChange={(n) => setActual({ ...actual, [r.field]: n })}
                      suffix={r.suffix}
                      prefix={r.prefix}
                    />
                  ) : null}
                </td>
                {scenarios.map((s, i) => (
                  <td key={s.name} className="py-2.5 px-3 align-top">
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
  bestIdx,
}: {
  label: string;
  scenarios: Scenario[];
  result: { cols: ColResult[] };
  layer: "ew" | "linear";
  bestIdx: number;
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
                <th
                  key={s.name}
                  className={`text-right py-3 px-5 font-semibold whitespace-nowrap ${
                    i === bestIdx && bestIdx > 0 ? "bg-success-soft/60 text-[oklch(0.4_0.14_155)]" : ""
                  }`}
                >
                  {colHeader(s, i)}
                  {i === bestIdx && bestIdx > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider bg-[oklch(0.4_0.14_155)] text-white px-1.5 py-0.5 rounded-full font-bold">
                      <TrendingUp className="size-2.5" /> Best
                    </span>
                  )}
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
  bestIdx,
}: {
  scenarios: Scenario[];
  totals: { turnover: number; cost: number; rebate: number; gp: number; gpPct: number }[];
  bestIdx: number;
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
                <th
                  key={s.name}
                  className={`text-right py-3 px-5 font-semibold whitespace-nowrap ${
                    i === bestIdx && bestIdx > 0 ? "bg-success-soft/60 text-[oklch(0.4_0.14_155)]" : ""
                  }`}
                >
                  {i === 0 ? "Actual 2026" : `${s.growth}% Growth`}
                  {i === bestIdx && bestIdx > 0 && (
                    <span className="ml-2 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider bg-[oklch(0.4_0.14_155)] text-white px-1.5 py-0.5 rounded-full font-bold">
                      <TrendingUp className="size-2.5" /> Best
                    </span>
                  )}
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

