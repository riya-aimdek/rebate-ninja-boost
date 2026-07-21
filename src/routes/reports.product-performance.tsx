import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BarChart3, Filter, Download } from "lucide-react";
import { ReportShell, FilterBar, Field, inputCls } from "@/components/ReportShell";

export const Route = createFileRoute("/reports/product-performance")({
  head: () => ({
    meta: [
      { title: "Product Performance Report · Rebate Ninja" },
      { name: "description", content: "Ranked view of qty sold, eligible amount, and attributed rebate per product." },
    ],
  }),
  component: ProductPerformancePage,
});

type Row = { id: number; name: string; programs: number; qty: number; eligible: number; rebate: number };
const ROWS: Row[] = [
  { id: 1, name: "ATSAMV71 Cortex-M7 MCU", programs: 2, qty: 660, eligible: 34225, rebate: 1125.25 },
  { id: 2, name: "PIC32MX795 MCU", programs: 1, qty: 600, eligible: 5340, rebate: 213.6 },
  { id: 3, name: "ATSAMD21 Cortex-M0 MCU", programs: 1, qty: 450, eligible: 2340, rebate: 93.6 },
  { id: 4, name: "STM32F407 Discovery Kit", programs: 2, qty: 320, eligible: 8960, rebate: 358.4 },
  { id: 5, name: "LTC3780 Buck-Boost Controller", programs: 1, qty: 3, eligible: 25.5, rebate: 1.02 },
  { id: 6, name: "TPS65217 PMIC", programs: 1, qty: 180, eligible: 1620, rebate: 64.8 },
  { id: 7, name: "MSP430FR MCU", programs: 1, qty: 90, eligible: 540, rebate: 21.6 },
];

function ProductPerformancePage() {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => ROWS.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase())), [q]);
  const totals = filtered.reduce(
    (a, r) => ({ qty: a.qty + r.qty, eligible: a.eligible + r.eligible, rebate: a.rebate + r.rebate }),
    { qty: 0, eligible: 0, rebate: 0 },
  );
  const max = Math.max(...filtered.map((r) => r.eligible), 1);

  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  return (
    <ReportShell
      title="Product Performance Report"
      subtitle="Ranked view of qty sold, eligible purchase amount, and attributed rebate per product."
      icon={BarChart3}
      accent="bg-info-soft text-info"
      kpis={[
        { label: "Total Products", value: `${filtered.length}`, tone: "brand" },
        { label: "Total Qty Sold", value: totals.qty.toLocaleString(), tone: "info" },
        { label: "Total Eligible Amount", value: fmt(totals.eligible), tone: "success" },
        { label: "Total Attributed Rebate", value: fmt(totals.rebate), tone: "warning" },
      ]}
    >
      <FilterBar>
        <Field label="Programs">
          <select className={inputCls}>
            <option>All Programs</option>
            <option>Rebate Program 2026</option>
            <option>Electronic Rebate</option>
          </select>
        </Field>
        <Field label="From">
          <input type="date" defaultValue="2026-01-01" className={inputCls} />
        </Field>
        <Field label="To">
          <input type="date" defaultValue="2026-07-21" className={inputCls} />
        </Field>
        <Field label="Search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Product name or ERC…" className={inputCls} />
        </Field>
        <div className="flex-1" />
        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-brand-foreground font-semibold text-sm hover:opacity-90" type="button">
          <Filter className="size-4" /> Apply Filter
        </button>
        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted" type="button">
          <Download className="size-4" /> Export
        </button>
      </FilterBar>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-3 font-semibold w-10">#</th>
                <th className="text-left px-5 py-3 font-semibold">Product Name</th>
                <th className="text-center px-5 py-3 font-semibold">Programs</th>
                <th className="text-right px-5 py-3 font-semibold">Qty Sold</th>
                <th className="text-left px-5 py-3 font-semibold w-64">Eligible Amount</th>
                <th className="text-right px-5 py-3 font-semibold">Attributed Rebate</th>
                <th className="text-right px-5 py-3 font-semibold">% of Rebate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r, i) => {
                const pct = (r.rebate / totals.rebate) * 100;
                const barW = (r.eligible / max) * 100;
                return (
                  <tr key={r.id} className="hover:bg-muted/40">
                    <td className="px-5 py-3 text-muted-foreground font-mono">{i + 1}</td>
                    <td className="px-5 py-3 font-semibold">{r.name}</td>
                    <td className="px-5 py-3 text-center">
                      <span className="inline-grid place-items-center size-6 rounded-full bg-info-soft text-info text-xs font-semibold">{r.programs}</span>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums">{r.qty.toLocaleString()}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-success/60 to-success rounded-full" style={{ width: `${barW}%` }} />
                        </div>
                        <span className="tabular-nums text-xs text-muted-foreground w-20 text-right">{fmt(r.eligible)}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold text-warning">{fmt(r.rebate)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{pct.toFixed(1)}%</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted/40 font-semibold">
              <tr>
                <td colSpan={3} className="px-5 py-3">Totals</td>
                <td className="px-5 py-3 text-right tabular-nums">{totals.qty.toLocaleString()}</td>
                <td className="px-5 py-3 text-right tabular-nums">{fmt(totals.eligible)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-warning">{fmt(totals.rebate)}</td>
                <td className="px-5 py-3 text-right tabular-nums">100.0%</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </ReportShell>
  );
}
