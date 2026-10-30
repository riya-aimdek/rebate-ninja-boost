import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SearchX, X } from "lucide-react";
import { toast } from "sonner";
import { ReportShell, FilterBar, FilterBarEnd, Field, inputCls, usd } from "@/components/ReportShell";
import { Btn, DataTable, EmptyState, notifySuccess, type Column } from "@/components/pricing/kit";
import { TODAY, downloadCsv } from "@/lib/pricing/csv";

export const Route = createFileRoute("/reports/settlement-status")({
  head: () => ({
    meta: [
      { title: "Settlement status · Rebate Ninja" },
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
  const fmt = (n: number) => usd(n, 0);
  const settledPct = t.accrued ? (t.settled / t.accrued) * 100 : 0;
  const programs = Array.from(new Set(ROWS.map((r) => r.program)));

  const activeCount = [q.trim() !== "", program !== "all"].filter(Boolean).length;
  const clearFilters = () => {
    setQ("");
    setProgram("all");
  };

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export", { description: "No balances match the current filters. Clear filters and try again." });
      return;
    }
    downloadCsv(
      `settlement-status-${TODAY}.csv`,
      filtered.map((r) => ({
        Account: r.account,
        Program: r.program,
        Accrued: r.accrued,
        Settled: r.settled,
        Outstanding: r.outstanding,
        "0-30 days": r.d0_30,
        "31-60 days": r.d31_60,
        "61-90 days": r.d61_90,
        "90+ days": r.d90p,
      })),
    );
    notifySuccess("CSV exported", `${filtered.length} ${filtered.length === 1 ? "balance" : "balances"} downloaded`);
  };

  const columns: Column<Row>[] = [
    { key: "account", header: "Account", className: "font-semibold", cell: (r) => r.account },
    {
      key: "program",
      header: "Program",
      cell: (r) => (
        <button
          type="button"
          onClick={() => setProgram(r.program)}
          className="text-brand font-medium hover:underline text-left"
          aria-label={`Filter by program ${r.program}`}
          title="Filter by this program"
        >
          {r.program}
        </button>
      ),
    },
    { key: "accrued", header: "Accrued", align: "right", className: "tabular-nums", cell: (r) => fmt(r.accrued) },
    {
      key: "settled",
      header: "Settled",
      align: "right",
      cell: (r) => {
        const pct = r.accrued ? (r.settled / r.accrued) * 100 : 0;
        return (
          <div className="flex items-center justify-end gap-2 tabular-nums">
            <span className="text-success font-semibold">{fmt(r.settled)}</span>
            <span className="text-xs text-muted-foreground w-11 text-right">
              {pct.toFixed(0)}%<span className="sr-only"> settled</span>
            </span>
          </div>
        );
      },
    },
    {
      key: "outstanding",
      header: "Outstanding",
      align: "right",
      cell: (r) => <span className={`tabular-nums font-semibold ${r.outstanding > 0 ? "text-warning-foreground" : "text-muted-foreground"}`}>{fmt(r.outstanding)}</span>,
    },
    { key: "d0_30", header: "0–30 days", align: "right", className: "tabular-nums text-muted-foreground", cell: (r) => fmt(r.d0_30) },
    { key: "d31_60", header: "31–60 days", align: "right", className: "tabular-nums text-muted-foreground", cell: (r) => fmt(r.d31_60) },
    { key: "d61_90", header: "61–90 days", align: "right", className: "tabular-nums text-muted-foreground", cell: (r) => fmt(r.d61_90) },
    {
      key: "d90p",
      header: "90+ days",
      align: "right",
      cell: (r) => <span className={`tabular-nums font-semibold ${r.d90p > 0 ? "text-destructive" : "text-muted-foreground"}`}>{fmt(r.d90p)}</span>,
    },
  ];

  return (
    <ReportShell
      title="Settlement status"
      subtitle="Outstanding and settled rebate balances by account and program, with ageing buckets."
      onExport={exportCsv}
      kpis={[
        { label: "Total accrued", value: fmt(t.accrued) },
        { label: "Settled", value: fmt(t.settled), hint: `${settledPct.toFixed(1)}% of accrued`, tone: "success" },
        { label: "Outstanding", value: fmt(t.outstanding), tone: "warning" },
        { label: "Aged 90+ days", value: fmt(t.d90p), hint: t.d90p > 0 ? "Follow up with these accounts" : "Nothing overdue", tone: t.d90p > 0 ? "danger" : "success" },
      ]}
    >
      <FilterBar>
        <Field label="Program">
          <select value={program} onChange={(e) => setProgram(e.target.value)} className={inputCls}>
            <option value="all">All programs</option>
            {programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Account">
          <input
            type="search"
            data-page-search
            aria-keyshortcuts="/"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Account name"
            className={inputCls}
          />
        </Field>
        <FilterBarEnd>
          <span role="status" className="text-sm text-muted-foreground">
            Showing {filtered.length} of {ROWS.length} balances
          </span>
          <Btn variant="subtle" icon={X} onClick={clearFilters} disabled={activeCount === 0}>
            Clear filters{activeCount > 0 && ` (${activeCount})`}
          </Btn>
        </FilterBarEnd>
      </FilterBar>

      {/* Settlement progress */}
      <section aria-labelledby="ss-progress" className="bg-card border border-border rounded-xl px-6 py-5 mb-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-3">
          <div>
            <h2 id="ss-progress" className="text-lg font-semibold tracking-tight">
              Settlement progress
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5 tabular-nums">
              {fmt(t.settled)} settled of {fmt(t.accrued)} accrued
            </p>
          </div>
          <div className="text-2xl font-bold text-success tabular-nums">{settledPct.toFixed(1)}%</div>
        </div>
        <div
          className="h-3 rounded-full bg-muted overflow-hidden"
          role="progressbar"
          aria-label="Settled share of accrued"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(settledPct)}
        >
          <div className="h-full bg-gradient-to-r from-success/60 to-success" style={{ width: `${settledPct}%` }} />
        </div>
      </section>

      <DataTable
        caption="Settlement status by account and program"
        columns={columns}
        rows={filtered}
        rowKey={(r) => `${r.account}|${r.program}`}
        numbered={false}
        empty={
          <EmptyState
            icon={SearchX}
            title="No balances match these filters"
            action={
              <Btn variant="subtle" icon={X} onClick={clearFilters}>
                Clear filters
              </Btn>
            }
          >
            Try a different program or account name.
          </EmptyState>
        }
        footer={
          filtered.length > 0 ? (
            <tr>
              <th scope="row" colSpan={2} className="px-4 py-3.5 text-left">Totals</th>
              <td className="px-4 py-3.5 text-right tabular-nums">{fmt(t.accrued)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums text-success">{fmt(t.settled)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums text-warning-foreground">{fmt(t.outstanding)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums">{fmt(t.d0_30)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums">{fmt(t.d31_60)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums">{fmt(t.d61_90)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums text-destructive">{fmt(t.d90p)}</td>
            </tr>
          ) : undefined
        }
      />
    </ReportShell>
  );
}
