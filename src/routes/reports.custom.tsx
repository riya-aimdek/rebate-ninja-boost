import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Play, SearchX, X } from "lucide-react";
import { toast } from "sonner";
import { ReportShell, FilterBar, Field, fmtDate, inputCls, usd } from "@/components/ReportShell";
import { Btn, DataTable, EmptyState, SearchInput, notifySuccess, type Column } from "@/components/pricing/kit";
import { TODAY, downloadCsv } from "@/lib/pricing/csv";

export const Route = createFileRoute("/reports/custom")({
  head: () => ({
    meta: [
      { title: "Custom report · Rebate Ninja" },
      { name: "description", content: "Build flexible rebate reports across accounts, programs, and periods." },
    ],
  }),
  component: CustomReportPage,
});

const RANGES = ["MTD", "QTD", "YTD", "Last 12M", "All Time", "Custom"] as const;
const RANGE_LABEL: Record<(typeof RANGES)[number], string> = {
  MTD: "Month to date",
  QTD: "Quarter to date",
  YTD: "Year to date",
  "Last 12M": "Last 12 months",
  "All Time": "All time",
  Custom: "Custom",
};

type Row = { id: string; name: string; from: string; to: string; revenue: number; earnings: number };
const DEMO: Row[] = Array.from({ length: 12 }).map((_, i) => ({
  id: `1558${33 + i}`,
  name: [
    "Arrow Bengaluru — Bommanahalli Depot",
    "Arrow Electronics India Group",
    "Arrow Electronics Surat ROC",
    "Arrow Electronics West India",
    "Arrow Kochi — Kalamassery Depot",
    "Arrow Mumbai — Bhiwandi Logistics Hub",
    "Arrow Noida — Sector 80 Warehouse",
    "Arrow Pune — Hinjewadi ShipTo",
    "Bright Home Traders",
    "Cleveland Clinic",
    "ElectroMart India",
    "HCA Healthcare",
  ][i],
  from: "2026-07-01",
  to: "2026-07-21",
  revenue: [0, 22005.5, 19925, 398.5, 0, 0, 0, 0, 0, 0, 0, 0][i],
  earnings: [0, 726.75, 398.5, 398.5, 0, 0, 0, 0, 0, 0, 0, 0][i],
}));

type Range = (typeof RANGES)[number];
type Config = {
  groupBy: string;
  frequency: string;
  earnings: "Accrual (Estimated)" | "Paid";
  range: Range;
  from: string;
  to: string;
  accounts: string;
};
const DEFAULT_CONFIG: Config = {
  groupBy: "Account",
  frequency: "None (total)",
  earnings: "Accrual (Estimated)",
  range: "Custom",
  from: "2026-07-01",
  to: "2026-07-21",
  accounts: "",
};

/** Date range for a quick-range chip, relative to today. */
function rangeDates(r: Range): { from: string; to: string } | null {
  const [y, m] = TODAY.split("-").map(Number);
  const pad = (n: number) => String(n).padStart(2, "0");
  switch (r) {
    case "MTD":
      return { from: `${y}-${pad(m)}-01`, to: TODAY };
    case "QTD":
      return { from: `${y}-${pad(Math.floor((m - 1) / 3) * 3 + 1)}-01`, to: TODAY };
    case "YTD":
      return { from: `${y}-01-01`, to: TODAY };
    case "Last 12M":
      return { from: `${y - 1}-${TODAY.slice(5)}`, to: TODAY };
    case "All Time":
      return { from: "", to: TODAY };
    default:
      return null;
  }
}

function CustomReportPage() {
  const [draft, setDraft] = useState<Config>(DEFAULT_CONFIG);
  const [applied, setApplied] = useState<Config | null>(null);
  const [running, setRunning] = useState(false);
  const [q, setQ] = useState("");

  const set = <K extends keyof Config>(k: K, v: Config[K]) => setDraft((d) => ({ ...d, [k]: v }));
  const setDate = (k: "from" | "to", v: string) => setDraft((d) => ({ ...d, [k]: v, range: "Custom" }));
  const pickRange = (r: Range) => {
    const dates = rangeDates(r);
    setDraft((d) => ({ ...d, range: r, ...(dates ?? {}) }));
  };

  const dateError = draft.from && draft.to && draft.to < draft.from ? "End date must be on or after the start date" : undefined;
  const dirty = applied !== null && JSON.stringify(applied) !== JSON.stringify(draft);

  const filtered = useMemo(() => {
    if (!applied) return [];
    const acc = applied.accounts.trim().toLowerCase();
    const ql = q.trim().toLowerCase();
    return DEMO.filter(
      (r) =>
        (!acc || r.name.toLowerCase().includes(acc) || r.id.includes(acc)) &&
        (!ql || r.name.toLowerCase().includes(ql) || r.id.includes(ql)),
    );
  }, [applied, q]);
  const totals = filtered.reduce(
    (a, r) => ({ revenue: a.revenue + r.revenue, earnings: a.earnings + r.earnings }),
    { revenue: 0, earnings: 0 },
  );
  const money2 = (n: number) => usd(n);
  const earningsLabel = applied?.earnings === "Paid" ? "Earnings (paid)" : "Earnings (accrual)";

  const preview = () => {
    if (dateError) return;
    setRunning(true);
    window.setTimeout(() => {
      setApplied(draft);
      setRunning(false);
      notifySuccess("Report ready", "Results updated below");
    }, 400);
  };

  const clearFilters = () => {
    setDraft(DEFAULT_CONFIG);
    setQ("");
    if (applied) setApplied(DEFAULT_CONFIG);
  };

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export", { description: "No rows match the current filters. Clear filters and try again." });
      return;
    }
    downloadCsv(
      `custom-report-${TODAY}.csv`,
      filtered.map((r) => ({
        "Account ID": r.id,
        "Account name": r.name,
        "Date from": fmtDate(r.from),
        "Date to": fmtDate(r.to),
        "Total revenue": r.revenue,
        [earningsLabel]: r.earnings,
      })),
    );
    notifySuccess("CSV exported", `${filtered.length} ${filtered.length === 1 ? "row" : "rows"} downloaded`);
  };

  const columns: Column<Row>[] = [
    { key: "id", header: "Account ID", className: "font-mono text-xs whitespace-nowrap", cell: (r) => r.id },
    { key: "name", header: "Account name", className: "font-medium", cell: (r) => r.name },
    { key: "from", header: "Date from", className: "text-muted-foreground whitespace-nowrap", cell: (r) => fmtDate(r.from) },
    { key: "to", header: "Date to", className: "text-muted-foreground whitespace-nowrap", cell: (r) => fmtDate(r.to) },
    { key: "revenue", header: "Total revenue", align: "right", className: "tabular-nums", cell: (r) => money2(r.revenue) },
    { key: "earnings", header: earningsLabel, align: "right", className: "tabular-nums text-success font-semibold", cell: (r) => money2(r.earnings) },
  ];

  return (
    <ReportShell
      title="Custom report"
      subtitle="Choose your settings and preview an ad hoc rebate report across accounts, programs and periods."
      onExport={applied ? exportCsv : undefined}
    >
      <FilterBar>
        <Field label="Group by">
          <select value={draft.groupBy} onChange={(e) => set("groupBy", e.target.value)} className={inputCls}>
            <option>Account</option>
            <option>Program</option>
            <option>Product</option>
          </select>
        </Field>
        <Field label="Frequency">
          <select value={draft.frequency} onChange={(e) => set("frequency", e.target.value)} className={inputCls}>
            <option>None (total)</option>
            <option>Monthly</option>
            <option>Quarterly</option>
          </select>
        </Field>
        <Field label="Earnings">
          <select value={draft.earnings} onChange={(e) => set("earnings", e.target.value as Config["earnings"])} className={inputCls}>
            <option value="Accrual (Estimated)">Accrual (estimated)</option>
            <option value="Paid">Paid</option>
          </select>
        </Field>
        <Field label="From">
          <input type="date" value={draft.from} onChange={(e) => setDate("from", e.target.value)} className={inputCls} />
        </Field>
        <Field label="To" error={dateError}>
          <input type="date" value={draft.to} min={draft.from || undefined} onChange={(e) => setDate("to", e.target.value)} className={inputCls} />
        </Field>
        <Field label="Accounts" hint="Leave blank for all accounts">
          <input type="search" value={draft.accounts} onChange={(e) => set("accounts", e.target.value)} placeholder="Name or ID" className={inputCls} />
        </Field>

        {/* Quick range — sets From/To (same pill style as FilterPills) */}
        <div role="group" aria-label="Quick date range" className="basis-full flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground mr-1" aria-hidden>
            Quick range
          </span>
          {RANGES.map((r) => {
            const on = draft.range === r;
            return (
              <button
                key={r}
                onClick={() => pickRange(r)}
                type="button"
                aria-pressed={on}
                className={`h-10 px-4 rounded-full border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
                  on ? "bg-navy text-navy-foreground border-navy" : "bg-card border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {RANGE_LABEL[r]}
              </button>
            );
          })}
        </div>

        <div className="basis-full flex flex-wrap items-center justify-end gap-3">
          {dirty && (
            <span role="status" className="text-sm text-warning-foreground mr-auto">
              Settings changed — preview again to update results
            </span>
          )}
          <Btn variant="subtle" icon={X} onClick={clearFilters}>
            Clear filters
          </Btn>
          <Btn icon={Play} onClick={preview} loading={running} disabled={!!dateError}>
            Preview report
          </Btn>
        </div>
      </FilterBar>

      {applied ? (
        <section aria-labelledby="cr-results">
          <div className="flex flex-wrap items-end justify-between gap-4 mb-4">
            <div className="min-w-0">
              <h2 id="cr-results" className="text-lg font-semibold tracking-tight">
                Results
              </h2>
              <p role="status" className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground tabular-nums">
                  {filtered.length} {filtered.length === 1 ? "row" : "rows"}
                </span>{" "}
                · <span className="font-medium text-foreground tabular-nums">{money2(totals.revenue)}</span> revenue ·{" "}
                <span className="font-medium text-foreground tabular-nums">{money2(totals.earnings)}</span> earnings · grouped by {applied.groupBy.toLowerCase()}
              </p>
            </div>
            <SearchInput value={q} onChange={setQ} placeholder="Filter rows" label="Filter result rows" className="w-full sm:w-72" />
          </div>
          <DataTable
            caption="Custom report results"
            columns={columns}
            rows={filtered}
            rowKey={(r) => r.id}
            numbered={false}
            empty={
              <EmptyState
                icon={SearchX}
                title="No rows match these filters"
                action={
                  <Btn variant="subtle" icon={X} onClick={clearFilters}>
                    Clear filters
                  </Btn>
                }
              >
                Try a broader account search or clear the row filter.
              </EmptyState>
            }
            footer={
              filtered.length > 0 ? (
                <tr>
                  <th scope="row" colSpan={4} className="px-4 py-3.5 text-left">
                    Total ({filtered.length} {filtered.length === 1 ? "row" : "rows"})
                  </th>
                  <td className="px-4 py-3.5 text-right tabular-nums">{money2(totals.revenue)}</td>
                  <td className="px-4 py-3.5 text-right tabular-nums">{money2(totals.earnings)}</td>
                </tr>
              ) : undefined
            }
          />
        </section>
      ) : (
        <div className="rounded-xl border border-dashed border-border bg-card">
          <EmptyState icon={Play} title="No results yet">
            Choose your settings above, then select <b>Preview report</b>.
          </EmptyState>
        </div>
      )}
    </ReportShell>
  );
}
