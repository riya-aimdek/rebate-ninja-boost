import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PieChart, Filter, Download } from "lucide-react";
import { ReportShell, FilterBar, Field, inputCls } from "@/components/ReportShell";

export const Route = createFileRoute("/reports/accrual-summary")({
  head: () => ({
    meta: [
      { title: "Accrual Summary by Period · Rebate Ninja" },
      { name: "description", content: "Revenue, eligible revenue, accrual amount and rate % per payout period and program." },
    ],
  }),
  component: AccrualSummaryPage,
});

type Row = {
  period: string;
  program: string;
  last: string;
  revenue: number;
  eligible: number;
  accrual: number;
  rate: number;
  accounts: number;
};
const ROWS: Row[] = [
  { period: "07/16/2026 – 10/15/2026", program: "Rebate Program 2026", last: "07/17/2026", revenue: 0, eligible: 0, accrual: 0, rate: 0, accounts: 7 },
  { period: "07/01/2026 – 09/30/2026", program: "Electronic Rebate", last: "07/20/2026", revenue: 61855.5, eligible: 54150, accrual: 1992.5, rate: 3.68, accounts: 21 },
  { period: "07/01/2026 – 09/30/2026", program: "FY 26 Rebate Program", last: "07/17/2026", revenue: 0, eligible: 0, accrual: 0, rate: 0, accounts: 4 },
  { period: "06/14/2026 – 09/13/2026", program: "Distributor Rebate 26", last: "07/17/2026", revenue: 0, eligible: 0, accrual: 0, rate: 0, accounts: 3 },
  { period: "04/16/2026 – 07/15/2026", program: "Rebate Program 2026", last: "07/15/2026", revenue: 456235.16, eligible: 365464, accrual: 10609.52, rate: 2.9, accounts: 8 },
  { period: "04/01/2026 – 06/30/2026", program: "Electronic Rebate", last: "07/10/2026", revenue: 0, eligible: 60861.2, accrual: 510.5, rate: 0.84, accounts: 21 },
  { period: "03/14/2026 – 06/13/2026", program: "Distributor Rebate 26", last: "06/10/2026", revenue: 0, eligible: 0, accrual: 0, rate: 0, accounts: 3 },
  { period: "01/16/2026 – 04/15/2026", program: "Rebate Program 2026", last: "07/15/2026", revenue: 110676.3, eligible: 94865.4, accrual: 2986.39, rate: 3.15, accounts: 7 },
  { period: "01/01/2026 – 03/31/2026", program: "Electronic Rebate", last: "07/10/2026", revenue: 0, eligible: 0, accrual: 0, rate: 0, accounts: 21 },
  { period: "12/31/2025 – 12/30/2026", program: "Growth Rebate 2026", last: "07/17/2026", revenue: 135246.78, eligible: 135246.78, accrual: 0, rate: 0, accounts: 19 },
  { period: "No Period", program: "FY 26 Rebate Program", last: "06/17/2026", revenue: 0, eligible: 0, accrual: 0, rate: 0, accounts: 4 },
];

function AccrualSummaryPage() {
  const [program, setProgram] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const filtered = useMemo(
    () => ROWS.filter((r) => (program === "all" || r.program === program) && (statusF === "all" || (statusF === "active" ? r.accrual > 0 : r.accrual === 0))),
    [program, statusF],
  );
  const totals = filtered.reduce(
    (a, r) => ({ revenue: a.revenue + r.revenue, eligible: a.eligible + r.eligible, accrual: a.accrual + r.accrual }),
    { revenue: 0, eligible: 0, accrual: 0 },
  );
  const rate = totals.eligible ? (totals.accrual / totals.eligible) * 100 : 0;
  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
  const programs = Array.from(new Set(ROWS.map((r) => r.program)));

  return (
    <ReportShell
      title="Accrual Summary by Period"
      subtitle="Track revenue, eligible revenue, accrual amount and rate % per payout period, program, and account."
      icon={PieChart}
      accent="bg-success-soft text-success"
      kpis={[
        { label: "Total Periods", value: `${filtered.length}`, tone: "warning" },
        { label: "Total Revenue", value: fmt(totals.revenue), tone: "info" },
        { label: "Eligible Revenue", value: fmt(totals.eligible), tone: "success" },
        { label: "Total Accrual", value: fmt(totals.accrual), hint: `Blended rate ${rate.toFixed(2)}%`, tone: "brand" },
      ]}
    >
      <FilterBar>
        <Field label="Programs">
          <select value={program} onChange={(e) => setProgram(e.target.value)} className={inputCls}>
            <option value="all">All Programs</option>
            {programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Period Status">
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className={inputCls}>
            <option value="all">All Status</option>
            <option value="active">With Accrual</option>
            <option value="empty">Zero Accrual</option>
          </select>
        </Field>
        <Field label="From">
          <input type="date" className={inputCls} />
        </Field>
        <Field label="To">
          <input type="date" className={inputCls} />
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
                <th className="text-left px-5 py-3 font-semibold">Period</th>
                <th className="text-left px-5 py-3 font-semibold">Program</th>
                <th className="text-left px-5 py-3 font-semibold">Last Accrual</th>
                <th className="text-right px-5 py-3 font-semibold">Total Revenue</th>
                <th className="text-right px-5 py-3 font-semibold">Eligible Revenue</th>
                <th className="text-right px-5 py-3 font-semibold">Accrual Amount</th>
                <th className="text-right px-5 py-3 font-semibold">Rate %</th>
                <th className="text-right px-5 py-3 font-semibold">Accounts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r, i) => (
                <tr key={i} className="hover:bg-muted/40">
                  <td className="px-5 py-3 font-medium">{r.period}</td>
                  <td className="px-5 py-3 text-brand font-semibold hover:underline cursor-pointer">{r.program}</td>
                  <td className="px-5 py-3 text-muted-foreground">{r.last}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{fmt(r.revenue)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{fmt(r.eligible)}</td>
                  <td className={`px-5 py-3 text-right tabular-nums font-semibold ${r.accrual > 0 ? "text-success" : "text-muted-foreground"}`}>{fmt(r.accrual)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${r.rate > 0 ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>
                      {r.rate.toFixed(2)}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{r.accounts}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/40 font-semibold">
              <tr>
                <td colSpan={3} className="px-5 py-3">Total</td>
                <td className="px-5 py-3 text-right tabular-nums">{fmt(totals.revenue)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{fmt(totals.eligible)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-success">{fmt(totals.accrual)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{rate.toFixed(2)}%</td>
                <td className="px-5 py-3 text-right tabular-nums">—</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </ReportShell>
  );
}
