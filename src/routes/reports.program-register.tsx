import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ClipboardList, Play, Download } from "lucide-react";
import { ReportShell, FilterBar, Field, inputCls } from "@/components/ReportShell";

export const Route = createFileRoute("/reports/program-register")({
  head: () => ({
    meta: [
      { title: "Program Register · Rebate Ninja" },
      { name: "description", content: "Program-level KPIs with revenue, accrued rebate, claim rebate, and outstanding settlement." },
    ],
  }),
  component: ProgramRegisterPage,
});

type Prog = {
  id: string;
  name: string;
  freq: string;
  from: string;
  to: string;
  types: number | null;
  members: number | null;
  status: "Active" | "Inactive";
  revenue: number;
  accrued: number;
  claim: number;
  paid: number;
};

const PROGRAMS: Prog[] = [
  { id: "827204", name: "AWEB-YESS", freq: "Yearly", from: "Jun 30, 2026", to: "Jun 25, 2027", types: 1, members: 1, status: "Inactive", revenue: 0, accrued: 0, claim: 0, paid: 0 },
  { id: "134386", name: "Orthopaedics Growth Incentive", freq: "Monthly", from: "May 1, 2026", to: "Aug 31, 2026", types: null, members: null, status: "Inactive", revenue: 0, accrued: 0, claim: 0, paid: 0 },
  { id: "163138", name: "Rebate Program 2026", freq: "Quarterly", from: "Jan 16, 2026", to: "Dec 15, 2026", types: 6, members: 8, status: "Active", revenue: 86241.76, accrued: 11785.72, claim: 11830.79, paid: 0 },
  { id: "138446", name: "FY 26 Rebate Program", freq: "Quarterly", from: "Jan 1, 2026", to: "Dec 31, 2026", types: 4, members: 4, status: "Active", revenue: 0, accrued: 0, claim: 0, paid: 0 },
  { id: "172218", name: "Distributor Rebate 26", freq: "Quarterly", from: "Mar 14, 2026", to: "Mar 14, 2027", types: 1, members: 4, status: "Active", revenue: 0, accrued: 0, claim: 0, paid: 0 },
  { id: "209538", name: "Electronic Rebate", freq: "Quarterly", from: "Jan 1, 2026", to: "Dec 31, 2026", types: 2, members: 21, status: "Active", revenue: 41930.5, accrued: 1506.75, claim: 6636.5, paid: 0 },
  { id: "635048", name: "AWEB", freq: "Yearly", from: "Jun 18, 2026", to: "Jun 18, 2027", types: 3, members: 2, status: "Inactive", revenue: 0, accrued: 0, claim: 0, paid: 0 },
  { id: "125091", name: "FY26 Summer Program", freq: "Monthly", from: "Apr 9, 2026", to: "Jul 31, 2026", types: null, members: null, status: "Active", revenue: 0, accrued: 0, claim: 0, paid: 0 },
];

function ProgramRegisterPage() {
  const [status, setStatus] = useState("all");
  const [freq, setFreq] = useState("all");
  const [q, setQ] = useState("");

  const filtered = useMemo(
    () =>
      PROGRAMS.filter(
        (p) =>
          (status === "all" || p.status.toLowerCase() === status) &&
          (freq === "all" || p.freq.toLowerCase() === freq) &&
          (!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.id.includes(q)),
      ),
    [status, freq, q],
  );
  const totals = filtered.reduce(
    (a, p) => ({
      revenue: a.revenue + p.revenue,
      accrued: a.accrued + p.accrued,
      claim: a.claim + p.claim,
      paid: a.paid + p.paid,
    }),
    { revenue: 0, accrued: 0, claim: 0, paid: 0 },
  );
  const active = PROGRAMS.filter((p) => p.status === "Active").length;
  const outstanding = totals.claim - totals.paid;

  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

  return (
    <ReportShell
      title="Program Register"
      subtitle="Program-level performance — revenue, accrued rebate, claim rebate, and outstanding settlement across every rebate program."
      icon={ClipboardList}
      accent="bg-brand/10 text-brand"
      kpis={[
        { label: "Total Programs", value: `${PROGRAMS.length}`, tone: "brand" },
        { label: "Active Programs", value: `${active}`, tone: "success" },
        { label: "Total Accrued", value: fmt(totals.accrued), tone: "warning" },
        { label: "Outstanding", value: fmt(outstanding), tone: "info" },
      ]}
    >
      <FilterBar>
        <Field label="From">
          <input type="date" defaultValue="2026-01-01" className={inputCls} />
        </Field>
        <Field label="To">
          <input type="date" defaultValue="2026-07-21" className={inputCls} />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        <Field label="Frequency">
          <select value={freq} onChange={(e) => setFreq(e.target.value)} className={inputCls}>
            <option value="all">All Frequencies</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </Field>
        <Field label="Search">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search programs…" className={inputCls} />
        </Field>
        <div className="flex-1" />
        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-brand-foreground font-semibold text-sm hover:opacity-90" type="button">
          <Play className="size-4" /> Run Report
        </button>
        <button className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted" type="button">
          <Download className="size-4" /> Export
        </button>
      </FilterBar>

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                <th className="text-left px-4 py-3 font-semibold" colSpan={7}>Program Details</th>
                <th className="text-right px-4 py-3 font-semibold text-brand" colSpan={4}>Financial Performance</th>
              </tr>
              <tr className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground border-t border-border">
                <th className="text-left px-4 py-2.5 font-semibold">Program ID</th>
                <th className="text-left px-4 py-2.5 font-semibold">Program Name</th>
                <th className="text-left px-4 py-2.5 font-semibold">Frequency</th>
                <th className="text-left px-4 py-2.5 font-semibold">Period</th>
                <th className="text-center px-4 py-2.5 font-semibold">Types</th>
                <th className="text-center px-4 py-2.5 font-semibold">Members</th>
                <th className="text-left px-4 py-2.5 font-semibold">Status</th>
                <th className="text-right px-4 py-2.5 font-semibold">Revenue</th>
                <th className="text-right px-4 py-2.5 font-semibold">Accrued</th>
                <th className="text-right px-4 py-2.5 font-semibold">Claim</th>
                <th className="text-right px-4 py-2.5 font-semibold">Paid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((p) => (
                <tr key={p.id} className="hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.id}</td>
                  <td className="px-4 py-3 font-semibold text-brand hover:underline cursor-pointer">{p.name}</td>
                  <td className="px-4 py-3">{p.freq}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{p.from} – {p.to}</td>
                  <td className="px-4 py-3 text-center">{p.types !== null ? (<span className="inline-grid place-items-center size-6 rounded-full bg-muted text-xs font-semibold">{p.types}</span>) : "—"}</td>
                  <td className="px-4 py-3 text-center">{p.members !== null ? (<span className="inline-grid place-items-center size-6 rounded-full bg-muted text-xs font-semibold">{p.members}</span>) : "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${p.status === "Active" ? "bg-success-soft text-success" : "bg-muted text-muted-foreground"}`}>
                      <span className={`size-1.5 rounded-full ${p.status === "Active" ? "bg-success" : "bg-muted-foreground"}`} />
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(p.revenue)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-warning font-semibold">{fmt(p.accrued)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(p.claim)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{fmt(p.paid)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/40 font-semibold">
              <tr>
                <td colSpan={7} className="px-4 py-3">Totals ({filtered.length} programs)</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.revenue)}</td>
                <td className="px-4 py-3 text-right tabular-nums text-warning">{fmt(totals.accrued)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.claim)}</td>
                <td className="px-4 py-3 text-right tabular-nums">{fmt(totals.paid)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </ReportShell>
  );
}
