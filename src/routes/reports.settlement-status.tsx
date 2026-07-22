import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileBarChart, Filter, Download } from "lucide-react";
import { ReportShell, FilterBar, Field, inputCls } from "@/components/ReportShell";

export const Route = createFileRoute("/reports/settlement-status")({
  head: () => ({
    meta: [
      { title: "Settlement Status · Rebate Ninja" },
      { name: "description", content: "Outstanding vs settled rebate balances by account and program, with ageing buckets." },
    ],
  }),
  component: SettlementStatusPage,
});

type Row = {
  account: string;
  program: string;
  accrued: number;
  settled: number;
  outstanding: number;
  d0_30: number;
  d31_60: number;
  d61_90: number;
  d90p: number;
};

const ROWS: Row[] = [
  { account: "Acme Electronics Ltd", program: "Rebate Program 2026", accrued: 42500, settled: 32500, outstanding: 10000, d0_30: 6000, d31_60: 3000, d61_90: 1000, d90p: 0 },
  { account: "Northwind Components", program: "Electronic Rebate", accrued: 18200, settled: 18200, outstanding: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 },
  { account: "BluePeak Distribution", program: "Distributor Rebate 26", accrued: 27400, settled: 14000, outstanding: 13400, d0_30: 4000, d31_60: 4400, d61_90: 3000, d90p: 2000 },
  { account: "Vertex Semiconductor", program: "Growth Rebate 2026", accrued: 65200, settled: 45000, outstanding: 20200, d0_30: 12000, d31_60: 5200, d61_90: 3000, d90p: 0 },
  { account: "Harbor Point Supply", program: "Rebate Program 2026", accrued: 8900, settled: 3000, outstanding: 5900, d0_30: 1000, d31_60: 900, d61_90: 2000, d90p: 2000 },
  { account: "Meridian Systems", program: "Electronic Rebate", accrued: 15600, settled: 11000, outstanding: 4600, d0_30: 2600, d31_60: 2000, d61_90: 0, d90p: 0 },
];

function SettlementStatusPage() {
  const [q, setQ] = useState("");
  const [program, setProgram] = useState("all");
  const filtered = useMemo(
    () => ROWS.filter((r) =>
      (!q || r.account.toLowerCase().includes(q.toLowerCase())) &&
      (program === "all" || r.program === program),
    ),
    [q, program],
  );
  const t = filtered.reduce(
    (a, r) => ({
      accrued: a.accrued + r.accrued,
      settled: a.settled + r.settled,
      outstanding: a.outstanding + r.outstanding,
      d0_30: a.d0_30 + r.d0_30,
      d31_60: a.d31_60 + r.d31_60,
      d61_90: a.d61_90 + r.d61_90,
      d90p: a.d90p + r.d90p,
    }),
    { accrued: 0, settled: 0, outstanding: 0, d0_30: 0, d31_60: 0, d61_90: 0, d90p: 0 },
  );
  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
  const settledPct = t.accrued ? (t.settled / t.accrued) * 100 : 0;
  const programs = Array.from(new Set(ROWS.map((r) => r.program)));

  return (
    <ReportShell
      title="Settlement Status"
      subtitle="Outstanding vs settled rebate balances by account and program, with ageing buckets."
      icon={FileBarChart}
      accent="bg-info-soft text-info"
      kpis={[
        { label: "Total Accrued", value: fmt(t.accrued), tone: "info" },
        { label: "Settled", value: fmt(t.settled), hint: `${settledPct.toFixed(1)}% of accrued`, tone: "success" },
        { label: "Outstanding", value: fmt(t.outstanding), tone: "warning" },
        { label: "Aged 90+ days", value: fmt(t.d90p), hint: "Attention needed", tone: "brand" },
      ]}
    >
      <FilterBar>
        <Field label="Program">
          <select value={program} onChange={(e) => setProgram(e.target.value)} className={inputCls}>
            <option value="all">All Programs</option>
            {programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Account">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search account…" className={inputCls} />
        </Field>
        <Field label="As of"><input type="date" className={inputCls} /></Field>
        <div className="flex-1" />
        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-brand-foreground font-semibold text-sm hover:opacity-90" type="button">
          <Filter className="size-4" /> Apply Filter
        </button>
        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted" type="button">
          <Download className="size-4" /> Export
        </button>
      </FilterBar>

      {/* Settlement progress */}
      <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">Overall settlement progress</div>
            <div className="text-lg font-bold tracking-tight mt-1">{fmt(t.settled)} settled of {fmt(t.accrued)} accrued</div>
          </div>
          <div className="text-2xl font-bold text-success">{settledPct.toFixed(1)}%</div>
        </div>
        <div className="h-3 rounded-full bg-muted overflow-hidden">
          <div className="h-full bg-gradient-to-r from-success/60 to-success" style={{ width: `${settledPct}%` }} />
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Account</th>
                <th className="text-left px-5 py-3 font-semibold">Program</th>
                <th className="text-right px-5 py-3 font-semibold">Accrued</th>
                <th className="text-right px-5 py-3 font-semibold">Settled</th>
                <th className="text-right px-5 py-3 font-semibold">Outstanding</th>
                <th className="text-right px-5 py-3 font-semibold">0–30</th>
                <th className="text-right px-5 py-3 font-semibold">31–60</th>
                <th className="text-right px-5 py-3 font-semibold">61–90</th>
                <th className="text-right px-5 py-3 font-semibold">90+</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r, i) => {
                const pct = r.accrued ? (r.settled / r.accrued) * 100 : 0;
                return (
                  <tr key={i} className="hover:bg-muted/40">
                    <td className="px-5 py-3 font-semibold">{r.account}</td>
                    <td className="px-5 py-3 text-brand hover:underline cursor-pointer">{r.program}</td>
                    <td className="px-5 py-3 text-right tabular-nums">{fmt(r.accrued)}</td>
                    <td className="px-5 py-3 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-2">
                        <span className="text-success font-semibold">{fmt(r.settled)}</span>
                        <span className="text-xs text-muted-foreground w-11 text-right">{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className={`px-5 py-3 text-right tabular-nums font-semibold ${r.outstanding > 0 ? "text-warning" : "text-muted-foreground"}`}>{fmt(r.outstanding)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{fmt(r.d0_30)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{fmt(r.d31_60)}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{fmt(r.d61_90)}</td>
                    <td className={`px-5 py-3 text-right tabular-nums font-semibold ${r.d90p > 0 ? "text-destructive" : "text-muted-foreground"}`}>{fmt(r.d90p)}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-muted/40 font-semibold">
              <tr>
                <td colSpan={2} className="px-5 py-3">Totals</td>
                <td className="px-5 py-3 text-right tabular-nums">{fmt(t.accrued)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-success">{fmt(t.settled)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-warning">{fmt(t.outstanding)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{fmt(t.d0_30)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{fmt(t.d31_60)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{fmt(t.d61_90)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-destructive">{fmt(t.d90p)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </ReportShell>
  );
}
