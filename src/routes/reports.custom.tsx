import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SlidersHorizontal, Play, FileDown, Search } from "lucide-react";
import { ReportShell, FilterBar, Field, inputCls } from "@/components/ReportShell";

export const Route = createFileRoute("/reports/custom")({
  head: () => ({
    meta: [
      { title: "Custom Report · Rebate Ninja" },
      { name: "description", content: "Build flexible rebate reports across accounts, programs, and periods." },
    ],
  }),
  component: CustomReportPage,
});

const RANGES = ["MTD", "QTD", "YTD", "Last 12M", "All Time", "Custom"] as const;

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

function CustomReportPage() {
  const [range, setRange] = useState<(typeof RANGES)[number]>("MTD");
  const [previewed, setPreviewed] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () => DEMO.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.id.includes(q)),
    [q],
  );
  const totals = filtered.reduce(
    (a, r) => ({ revenue: a.revenue + r.revenue, earnings: a.earnings + r.earnings }),
    { revenue: 0, earnings: 0 },
  );

  return (
    <ReportShell
      title="Custom Report"
      subtitle="Set your filters and generate an ad-hoc rebate report across accounts, programs, and periods."
      icon={SlidersHorizontal}
      accent="bg-warning-soft text-warning"
    >
      <FilterBar>
        <Field label="Group By">
          <select className={inputCls}>
            <option>Account</option>
            <option>Program</option>
            <option>Product</option>
          </select>
        </Field>
        <Field label="Frequency">
          <select className={inputCls}>
            <option>None (Total)</option>
            <option>Monthly</option>
            <option>Quarterly</option>
          </select>
        </Field>
        <Field label="Earnings">
          <select className={inputCls}>
            <option>Accrual (Estimated)</option>
            <option>Paid</option>
          </select>
        </Field>
        <Field label="From">
          <input type="date" defaultValue="2026-07-01" className={inputCls} />
        </Field>
        <Field label="To">
          <input type="date" defaultValue="2026-07-21" className={inputCls} />
        </Field>
        <div className="flex-1" />
        <button
          onClick={() => setPreviewed(true)}
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-brand-foreground font-semibold text-sm hover:opacity-90"
        >
          <Play className="size-4" /> Preview Report
        </button>
      </FilterBar>

      {/* Quick range chips */}
      <div className="flex flex-wrap gap-2 mb-6">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            type="button"
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition ${
              range === r
                ? "bg-brand text-brand-foreground border-brand"
                : "bg-card text-foreground border-border hover:border-brand/40"
            }`}
          >
            {r}
          </button>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-2">
          <Field label="Accounts" hint="blank = all">
            <input placeholder="Search accounts…" className={inputCls} />
          </Field>
          <Field label="Programs" hint="blank = all">
            <input placeholder="Search programs…" className={inputCls} />
          </Field>
        </div>
      </div>

      {previewed && (
        <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border">
            <div className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{filtered.length} rows</span> ·{" "}
              <span className="font-semibold text-foreground">${totals.revenue.toLocaleString()}</span> revenue ·{" "}
              <span className="font-semibold text-success">${totals.earnings.toLocaleString()}</span> earnings
            </div>
            <div className="flex-1" />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Filter rows…"
                className={`${inputCls} pl-8 w-56`}
              />
            </div>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted" type="button">
              <FileDown className="size-4" /> CSV
            </button>
            <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted" type="button">
              <FileDown className="size-4" /> PDF
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Account ID</th>
                  <th className="text-left px-5 py-3 font-semibold">Account Name</th>
                  <th className="text-left px-5 py-3 font-semibold">Date From</th>
                  <th className="text-left px-5 py-3 font-semibold">Date To</th>
                  <th className="text-right px-5 py-3 font-semibold">Total Revenue</th>
                  <th className="text-right px-5 py-3 font-semibold">Earnings (Accrual)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-5 py-3 font-mono text-xs">{r.id}</td>
                    <td className="px-5 py-3 font-medium">{r.name}</td>
                    <td className="px-5 py-3 text-muted-foreground">{r.from}</td>
                    <td className="px-5 py-3 text-muted-foreground">{r.to}</td>
                    <td className="px-5 py-3 text-right tabular-nums">${r.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-success font-semibold">${r.earnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-muted/40">
                <tr className="font-semibold">
                  <td colSpan={4} className="px-5 py-3">Total ({filtered.length} rows)</td>
                  <td className="px-5 py-3 text-right tabular-nums">${totals.revenue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="px-5 py-3 text-right tabular-nums text-success">${totals.earnings.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {!previewed && (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center bg-card/50">
          <div className="size-14 rounded-2xl bg-brand/10 text-brand grid place-items-center mx-auto mb-4">
            <Play className="size-6" />
          </div>
          <h3 className="font-semibold text-lg mb-1">Ready when you are</h3>
          <p className="text-sm text-muted-foreground">Adjust the filters above and click <b>Preview Report</b> to see results.</p>
        </div>
      )}
    </ReportShell>
  );
}
