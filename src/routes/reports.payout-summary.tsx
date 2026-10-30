import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SearchX, X } from "lucide-react";
import { toast } from "sonner";
import { ReportShell, FilterBar, FilterBarEnd, Field, fmtDate, inputCls, usd } from "@/components/ReportShell";
import { Btn, DataTable, EmptyState, FilterPills, StatusPill, notifySuccess, type Column, type Tone } from "@/components/pricing/kit";
import { TODAY, downloadCsv } from "@/lib/pricing/csv";

export const Route = createFileRoute("/reports/payout-summary")({
  head: () => ({
    meta: [
      { title: "Payout summary · Rebate Ninja" },
      { name: "description", content: "Approved, pending and paid rebate payouts across programs — reconcile against finance ledgers." },
    ],
  }),
  component: PayoutSummaryPage,
});

type Status = "Paid" | "Approved" | "Pending" | "On hold";
type Row = {
  id: string;
  account: string;
  program: string;
  period: string;
  amount: number;
  method: string;
  scheduled: string;
  status: Status;
};

const ROWS: Row[] = [
  { id: "PY-10231", account: "Acme Electronics Ltd", program: "Rebate Program 2026", period: "Q2 2026", amount: 12480.55, method: "ACH", scheduled: "2026-07-25", status: "Paid" },
  { id: "PY-10232", account: "Northwind Components", program: "Electronic Rebate", period: "Q2 2026", amount: 4210.0, method: "Wire", scheduled: "2026-07-28", status: "Approved" },
  { id: "PY-10233", account: "BluePeak Distribution", program: "Distributor Rebate 26", period: "Q2 2026", amount: 8890.12, method: "ACH", scheduled: "2026-08-01", status: "Pending" },
  { id: "PY-10234", account: "Vertex Semiconductor", program: "Growth Rebate 2026", period: "H1 2026", amount: 21500.0, method: "Wire", scheduled: "2026-08-05", status: "Approved" },
  { id: "PY-10235", account: "Harbor Point Supply", program: "Rebate Program 2026", period: "Q2 2026", amount: 1580.75, method: "Check", scheduled: "2026-08-10", status: "On hold" },
  { id: "PY-10236", account: "Meridian Systems", program: "Electronic Rebate", period: "Q1 2026", amount: 6320.4, method: "ACH", scheduled: "2026-07-12", status: "Paid" },
  { id: "PY-10237", account: "Ironline Trading", program: "FY 26 Rebate Program", period: "H1 2026", amount: 2100.0, method: "ACH", scheduled: "2026-07-30", status: "Pending" },
];

const statusTone: Record<Status, Tone> = {
  Paid: "success",
  Approved: "info",
  Pending: "warning",
  "On hold": "danger",
};

const STATUSES: Status[] = ["Paid", "Approved", "Pending", "On hold"];

function PayoutSummaryPage() {
  const [status, setStatus] = useState<"all" | Status>("all");
  const [program, setProgram] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtered = useMemo(
    () =>
      ROWS.filter(
        (r) =>
          (status === "all" || r.status === status) &&
          (program === "all" || r.program === program) &&
          (!from || r.scheduled >= from) &&
          (!to || r.scheduled <= to),
      ),
    [status, program, from, to],
  );
  const fmt = (n: number) => usd(n);
  const totals = filtered.reduce(
    (a, r) => {
      a.total += r.amount;
      if (r.status === "Paid") a.paid += r.amount;
      if (r.status === "Approved") a.approved += r.amount;
      if (r.status === "Pending" || r.status === "On hold") a.pending += r.amount;
      return a;
    },
    { total: 0, paid: 0, approved: 0, pending: 0 },
  );
  const programs = Array.from(new Set(ROWS.map((r) => r.program)));
  const dateError = from && to && from > to ? "End date must be on or after the start date" : undefined;

  const activeCount = [program !== "all", status !== "all", from !== "", to !== ""].filter(Boolean).length;
  const clearFilters = () => {
    setProgram("all");
    setStatus("all");
    setFrom("");
    setTo("");
  };
  // Status counts respect the other filters so each pill says what it will show.
  const statusBase = ROWS.filter(
    (r) => (program === "all" || r.program === program) && (!from || r.scheduled >= from) && (!to || r.scheduled <= to),
  );

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export", { description: "No payouts match the current filters. Clear filters and try again." });
      return;
    }
    downloadCsv(
      `payout-summary-${TODAY}.csv`,
      filtered.map((r) => ({
        "Payout ID": r.id,
        Account: r.account,
        Program: r.program,
        Period: r.period,
        Amount: r.amount,
        Method: r.method,
        Scheduled: fmtDate(r.scheduled),
        Status: r.status,
      })),
    );
    notifySuccess("CSV exported", `${filtered.length} ${filtered.length === 1 ? "payout" : "payouts"} downloaded`);
  };

  const columns: Column<Row>[] = [
    { key: "id", header: "Payout ID", className: "font-mono text-xs text-muted-foreground whitespace-nowrap", cell: (r) => r.id },
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
    { key: "period", header: "Period", className: "text-muted-foreground whitespace-nowrap", cell: (r) => r.period },
    { key: "amount", header: "Amount", align: "right", className: "tabular-nums font-semibold", cell: (r) => fmt(r.amount) },
    { key: "method", header: "Method", className: "text-muted-foreground", cell: (r) => r.method },
    { key: "scheduled", header: "Scheduled", className: "text-muted-foreground whitespace-nowrap", cell: (r) => fmtDate(r.scheduled) },
    { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} label={r.status} tone={statusTone[r.status]} /> },
  ];

  return (
    <ReportShell
      title="Payout summary"
      subtitle="Approved, pending and paid rebate payouts across programs — reconcile them against finance ledgers."
      onExport={exportCsv}
      kpis={[
        { label: "Total payouts", value: fmt(totals.total), hint: `${filtered.length} ${filtered.length === 1 ? "payout" : "payouts"}` },
        { label: "Paid", value: fmt(totals.paid), tone: "success" },
        { label: "Approved, not yet paid", value: fmt(totals.approved), tone: "info" },
        { label: "Pending or on hold", value: fmt(totals.pending), tone: "warning" },
      ]}
    >
      <FilterBar>
        <Field label="Program">
          <select value={program} onChange={(e) => setProgram(e.target.value)} className={inputCls}>
            <option value="all">All programs</option>
            {programs.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Scheduled from">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Scheduled to" error={dateError}>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </Field>
        <FilterBarEnd>
          <span role="status" className="text-sm text-muted-foreground">
            Showing {filtered.length} of {ROWS.length} payouts
          </span>
          <Btn variant="subtle" icon={X} onClick={clearFilters} disabled={activeCount === 0}>
            Clear filters{activeCount > 0 && ` (${activeCount})`}
          </Btn>
        </FilterBarEnd>
      </FilterBar>

      <FilterPills<Status>
        label="Status"
        multiple={false}
        selected={status === "all" ? [] : [status]}
        onChange={(next) => setStatus(next[0] ?? "all")}
        options={STATUSES.map((s) => ({ key: s, label: s, count: statusBase.filter((r) => r.status === s).length }))}
      />

      <DataTable
        caption="Payouts"
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.id}
        numbered={false}
        empty={
          <EmptyState
            icon={SearchX}
            title="No payouts match these filters"
            action={
              <Btn variant="subtle" icon={X} onClick={clearFilters}>
                Clear filters
              </Btn>
            }
          >
            Try a different program, status or scheduled date range.
          </EmptyState>
        }
        footer={
          filtered.length > 0 ? (
            <tr>
              <th scope="row" colSpan={4} className="px-4 py-3.5 text-left">Total ({filtered.length} payouts)</th>
              <td className="px-4 py-3.5 text-right tabular-nums">{fmt(totals.total)}</td>
              <td colSpan={3} className="px-4 py-3.5" />
            </tr>
          ) : undefined
        }
      />
    </ReportShell>
  );
}
