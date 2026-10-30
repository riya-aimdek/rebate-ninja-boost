import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SearchX, X } from "lucide-react";
import { toast } from "sonner";
import { ReportShell, FilterBar, FilterBarEnd, Field, fmtDate, inputCls, usd } from "@/components/ReportShell";
import { Btn, DataTable, EmptyState, notifySuccess, type Column } from "@/components/pricing/kit";
import { TODAY, downloadCsv } from "@/lib/pricing/csv";

export const Route = createFileRoute("/reports/accrual-summary")({
  head: () => ({
    meta: [
      { title: "Accrual summary by period · Rebate Ninja" },
      { name: "description", content: "Revenue, eligible revenue, accrual amount and rate % per payout period and program." },
    ],
  }),
  component: AccrualSummaryPage,
});

type Row = {
  /** Payout period start/end (ISO); null when the program has no period. */
  from: string | null;
  to: string | null;
  program: string;
  last: string;
  revenue: number;
  eligible: number;
  accrual: number;
  rate: number;
  accounts: number;
};
const ROWS: Row[] = [
  { from: "2026-07-16", to: "2026-10-15", program: "Rebate Program 2026", last: "2026-07-17", revenue: 0, eligible: 0, accrual: 0, rate: 0, accounts: 7 },
  { from: "2026-07-01", to: "2026-09-30", program: "Electronic Rebate", last: "2026-07-20", revenue: 61855.5, eligible: 54150, accrual: 1992.5, rate: 3.68, accounts: 21 },
  { from: "2026-07-01", to: "2026-09-30", program: "FY 26 Rebate Program", last: "2026-07-17", revenue: 0, eligible: 0, accrual: 0, rate: 0, accounts: 4 },
  { from: "2026-06-14", to: "2026-09-13", program: "Distributor Rebate 26", last: "2026-07-17", revenue: 0, eligible: 0, accrual: 0, rate: 0, accounts: 3 },
  { from: "2026-04-16", to: "2026-07-15", program: "Rebate Program 2026", last: "2026-07-15", revenue: 456235.16, eligible: 365464, accrual: 10609.52, rate: 2.9, accounts: 8 },
  { from: "2026-04-01", to: "2026-06-30", program: "Electronic Rebate", last: "2026-07-10", revenue: 0, eligible: 60861.2, accrual: 510.5, rate: 0.84, accounts: 21 },
  { from: "2026-03-14", to: "2026-06-13", program: "Distributor Rebate 26", last: "2026-06-10", revenue: 0, eligible: 0, accrual: 0, rate: 0, accounts: 3 },
  { from: "2026-01-16", to: "2026-04-15", program: "Rebate Program 2026", last: "2026-07-15", revenue: 110676.3, eligible: 94865.4, accrual: 2986.39, rate: 3.15, accounts: 7 },
  { from: "2026-01-01", to: "2026-03-31", program: "Electronic Rebate", last: "2026-07-10", revenue: 0, eligible: 0, accrual: 0, rate: 0, accounts: 21 },
  { from: "2025-12-31", to: "2026-12-30", program: "Growth Rebate 2026", last: "2026-07-17", revenue: 135246.78, eligible: 135246.78, accrual: 0, rate: 0, accounts: 19 },
  { from: null, to: null, program: "FY 26 Rebate Program", last: "2026-06-17", revenue: 0, eligible: 0, accrual: 0, rate: 0, accounts: 4 },
];

const periodLabel = (r: Row) => (r.from && r.to ? `${fmtDate(r.from)} – ${fmtDate(r.to)}` : "No period");

function AccrualSummaryPage() {
  const [program, setProgram] = useState("all");
  const [statusF, setStatusF] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtered = useMemo(
    () =>
      ROWS.filter((r) => {
        if (program !== "all" && r.program !== program) return false;
        if (statusF !== "all" && !(statusF === "active" ? r.accrual > 0 : r.accrual === 0)) return false;
        if (from || to) {
          // Keep periods that overlap the selected date range.
          if (!r.from || !r.to) return false;
          if (from && r.to < from) return false;
          if (to && r.from > to) return false;
        }
        return true;
      }),
    [program, statusF, from, to],
  );
  const totals = filtered.reduce(
    (a, r) => ({ revenue: a.revenue + r.revenue, eligible: a.eligible + r.eligible, accrual: a.accrual + r.accrual }),
    { revenue: 0, eligible: 0, accrual: 0 },
  );
  const rate = totals.eligible ? (totals.accrual / totals.eligible) * 100 : 0;
  const fmt = (n: number) => usd(n);
  const programs = Array.from(new Set(ROWS.map((r) => r.program)));
  const dateError = from && to && from > to ? "End date must be on or after the start date" : undefined;

  const activeCount = [program !== "all", statusF !== "all", from !== "", to !== ""].filter(Boolean).length;
  const clearFilters = () => {
    setProgram("all");
    setStatusF("all");
    setFrom("");
    setTo("");
  };

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export", { description: "No periods match the current filters. Clear filters and try again." });
      return;
    }
    downloadCsv(
      `accrual-summary-${TODAY}.csv`,
      filtered.map((r) => ({
        Period: periodLabel(r),
        Program: r.program,
        "Last accrual": r.last,
        "Total revenue": r.revenue,
        "Eligible revenue": r.eligible,
        "Accrual amount": r.accrual,
        "Rate %": r.rate,
        Accounts: r.accounts,
      })),
    );
    notifySuccess("CSV exported", `${filtered.length} ${filtered.length === 1 ? "period" : "periods"} downloaded`);
  };

  const columns: Column<Row>[] = [
    { key: "period", header: "Period", className: "font-medium whitespace-nowrap", cell: (r) => periodLabel(r) },
    {
      key: "program",
      header: "Program",
      cell: (r) => (
        <button
          type="button"
          onClick={() => setProgram(r.program)}
          className="text-brand font-semibold hover:underline text-left"
          aria-label={`Filter by program ${r.program}`}
          title="Filter by this program"
        >
          {r.program}
        </button>
      ),
    },
    { key: "last", header: "Last accrual", className: "text-muted-foreground whitespace-nowrap", cell: (r) => fmtDate(r.last) },
    { key: "revenue", header: "Total revenue", align: "right", className: "tabular-nums", cell: (r) => fmt(r.revenue) },
    { key: "eligible", header: "Eligible revenue", align: "right", className: "tabular-nums", cell: (r) => fmt(r.eligible) },
    {
      key: "accrual",
      header: "Accrual amount",
      align: "right",
      cell: (r) => <span className={`tabular-nums font-semibold ${r.accrual > 0 ? "text-success" : "text-muted-foreground"}`}>{fmt(r.accrual)}</span>,
    },
    {
      key: "rate",
      header: "Rate %",
      align: "right",
      cell: (r) => (
        <span className={`tabular-nums ${r.rate > 0 ? "font-semibold" : "text-muted-foreground"}`}>{r.rate.toFixed(2)}%</span>
      ),
    },
    { key: "accounts", header: "Accounts", align: "right", className: "tabular-nums", cell: (r) => r.accounts },
  ];

  return (
    <ReportShell
      title="Accrual summary by period"
      subtitle="Revenue, eligible revenue, accrual amount and rate per payout period and program."
      onExport={exportCsv}
      kpis={[
        { label: "Periods", value: `${filtered.length}` },
        { label: "Total revenue", value: fmt(totals.revenue) },
        { label: "Eligible revenue", value: fmt(totals.eligible) },
        { label: "Total accrual", value: fmt(totals.accrual), hint: `Blended rate ${rate.toFixed(2)}%`, tone: "success" },
      ]}
    >
      <FilterBar>
        <Field label="Program">
          <select value={program} onChange={(e) => setProgram(e.target.value)} className={inputCls}>
            <option value="all">All programs</option>
            {programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Period status">
          <select value={statusF} onChange={(e) => setStatusF(e.target.value)} className={inputCls}>
            <option value="all">All statuses</option>
            <option value="active">With accrual</option>
            <option value="empty">Zero accrual</option>
          </select>
        </Field>
        <Field label="From">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </Field>
        <Field label="To" error={dateError}>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </Field>
        <FilterBarEnd>
          <span role="status" className="text-sm text-muted-foreground">
            Showing {filtered.length} of {ROWS.length} periods
            {activeCount > 0 && ` · ${activeCount} ${activeCount === 1 ? "filter" : "filters"} active`}
          </span>
          <Btn variant="subtle" icon={X} onClick={clearFilters} disabled={activeCount === 0}>
            Clear filters
          </Btn>
        </FilterBarEnd>
      </FilterBar>

      <DataTable
        caption="Accrual summary by period"
        columns={columns}
        rows={filtered}
        rowKey={(r) => `${r.from ?? "none"}|${r.program}`}
        numbered={false}
        empty={
          <EmptyState
            icon={SearchX}
            title="No periods match these filters"
            action={
              <Btn variant="subtle" icon={X} onClick={clearFilters}>
                Clear filters
              </Btn>
            }
          >
            Try a different program, status or date range.
          </EmptyState>
        }
        footer={
          filtered.length > 0 ? (
            <tr>
              <th scope="row" colSpan={3} className="px-4 py-3.5 text-left">Total</th>
              <td className="px-4 py-3.5 text-right tabular-nums">{fmt(totals.revenue)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums">{fmt(totals.eligible)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums text-success">{fmt(totals.accrual)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums">{rate.toFixed(2)}%</td>
              <td className="px-4 py-3.5 text-right tabular-nums">—</td>
            </tr>
          ) : undefined
        }
      />
    </ReportShell>
  );
}
