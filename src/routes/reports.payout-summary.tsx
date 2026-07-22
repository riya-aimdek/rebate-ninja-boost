import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Receipt, Filter, Download, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { ReportShell, FilterBar, Field, inputCls } from "@/components/ReportShell";

export const Route = createFileRoute("/reports/payout-summary")({
  head: () => ({
    meta: [
      { title: "Payout Summary · Rebate Ninja" },
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
  { id: "PY-10231", account: "Acme Electronics Ltd", program: "Rebate Program 2026", period: "Q2 2026", amount: 12480.55, method: "ACH", scheduled: "07/25/2026", status: "Paid" },
  { id: "PY-10232", account: "Northwind Components", program: "Electronic Rebate", period: "Q2 2026", amount: 4210.0, method: "Wire", scheduled: "07/28/2026", status: "Approved" },
  { id: "PY-10233", account: "BluePeak Distribution", program: "Distributor Rebate 26", period: "Q2 2026", amount: 8890.12, method: "ACH", scheduled: "08/01/2026", status: "Pending" },
  { id: "PY-10234", account: "Vertex Semiconductor", program: "Growth Rebate 2026", period: "H1 2026", amount: 21500.0, method: "Wire", scheduled: "08/05/2026", status: "Approved" },
  { id: "PY-10235", account: "Harbor Point Supply", program: "Rebate Program 2026", period: "Q2 2026", amount: 1580.75, method: "Check", scheduled: "08/10/2026", status: "On hold" },
  { id: "PY-10236", account: "Meridian Systems", program: "Electronic Rebate", period: "Q1 2026", amount: 6320.4, method: "ACH", scheduled: "07/12/2026", status: "Paid" },
  { id: "PY-10237", account: "Ironline Trading", program: "FY 26 Rebate Program", period: "H1 2026", amount: 2100.0, method: "ACH", scheduled: "07/30/2026", status: "Pending" },
];

const statusStyle: Record<Status, string> = {
  Paid: "bg-success-soft text-success",
  Approved: "bg-info-soft text-info",
  Pending: "bg-warning-soft text-warning",
  "On hold": "bg-destructive/10 text-destructive",
};

function PayoutSummaryPage() {
  const [status, setStatus] = useState<"all" | Status>("all");
  const [program, setProgram] = useState("all");
  const filtered = useMemo(
    () => ROWS.filter((r) => (status === "all" || r.status === status) && (program === "all" || r.program === program)),
    [status, program],
  );
  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
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

  return (
    <ReportShell
      title="Payout Summary"
      subtitle="Approved, pending and paid rebate payouts across programs — reconcile against finance ledgers."
      icon={Receipt}
      accent="bg-success-soft text-success"
      kpis={[
        { label: "Total Payouts", value: fmt(totals.total), hint: `${filtered.length} transactions`, tone: "brand" },
        { label: "Paid", value: fmt(totals.paid), tone: "success" },
        { label: "Approved (queued)", value: fmt(totals.approved), tone: "info" },
        { label: "Pending / On hold", value: fmt(totals.pending), tone: "warning" },
      ]}
    >
      <FilterBar>
        <Field label="Program">
          <select value={program} onChange={(e) => setProgram(e.target.value)} className={inputCls}>
            <option value="all">All Programs</option>
            {programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputCls}>
            <option value="all">All Statuses</option>
            <option value="Paid">Paid</option>
            <option value="Approved">Approved</option>
            <option value="Pending">Pending</option>
            <option value="On hold">On hold</option>
          </select>
        </Field>
        <Field label="From"><input type="date" className={inputCls} /></Field>
        <Field label="To"><input type="date" className={inputCls} /></Field>
        <div className="flex-1" />
        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-brand-foreground font-semibold text-sm hover:opacity-90" type="button">
          <Filter className="size-4" /> Apply Filter
        </button>
        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted" type="button">
          <Download className="size-4" /> Export
        </button>
      </FilterBar>

      <div className="grid gap-4 sm:grid-cols-3 mb-6">
        <StatCard icon={CheckCircle2} label="Ready to pay" value={`${filtered.filter((r) => r.status === "Approved").length}`} tone="text-info" bg="bg-info-soft" />
        <StatCard icon={Clock} label="Awaiting approval" value={`${filtered.filter((r) => r.status === "Pending").length}`} tone="text-warning" bg="bg-warning-soft" />
        <StatCard icon={AlertCircle} label="On hold" value={`${filtered.filter((r) => r.status === "On hold").length}`} tone="text-destructive" bg="bg-destructive/10" />
      </div>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Payout ID</th>
                <th className="text-left px-5 py-3 font-semibold">Account</th>
                <th className="text-left px-5 py-3 font-semibold">Program</th>
                <th className="text-left px-5 py-3 font-semibold">Period</th>
                <th className="text-right px-5 py-3 font-semibold">Amount</th>
                <th className="text-left px-5 py-3 font-semibold">Method</th>
                <th className="text-left px-5 py-3 font-semibold">Scheduled</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-muted/40">
                  <td className="px-5 py-3 font-mono text-xs text-muted-foreground">{r.id}</td>
                  <td className="px-5 py-3 font-semibold">{r.account}</td>
                  <td className="px-5 py-3 text-brand hover:underline cursor-pointer">{r.program}</td>
                  <td className="px-5 py-3 text-muted-foreground">{r.period}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold">{fmt(r.amount)}</td>
                  <td className="px-5 py-3 text-muted-foreground">{r.method}</td>
                  <td className="px-5 py-3 text-muted-foreground">{r.scheduled}</td>
                  <td className="px-5 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyle[r.status]}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/40 font-semibold">
              <tr>
                <td colSpan={4} className="px-5 py-3">Total ({filtered.length} payouts)</td>
                <td className="px-5 py-3 text-right tabular-nums">{fmt(totals.total)}</td>
                <td colSpan={3} className="px-5 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </ReportShell>
  );
}

function StatCard({ icon: Icon, label, value, tone, bg }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; tone: string; bg: string }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 shadow-sm flex items-center gap-4">
      <div className={`size-11 rounded-xl grid place-items-center ${bg} ${tone}`}>
        <Icon className="size-5" />
      </div>
      <div>
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{label}</div>
        <div className="text-xl font-bold tracking-tight">{value}</div>
      </div>
    </div>
  );
}
