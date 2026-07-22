import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Package, Filter, Download } from "lucide-react";
import { ReportShell, FilterBar, Field, inputCls } from "@/components/ReportShell";

export const Route = createFileRoute("/reports/member-eligibility")({
  head: () => ({
    meta: [
      { title: "Member Eligibility · Rebate Ninja" },
      { name: "description", content: "Which program members qualify, are near threshold, or have fallen below qualifying targets." },
    ],
  }),
  component: MemberEligibilityPage,
});

type Status = "Qualified" | "Near threshold" | "Below";
type Row = {
  member: string;
  program: string;
  target: number;
  achieved: number;
  status: Status;
};

const ROWS: Row[] = [
  { member: "Acme Electronics Ltd", program: "Rebate Program 2026", target: 400000, achieved: 428500, status: "Qualified" },
  { member: "Northwind Components", program: "Electronic Rebate", target: 250000, achieved: 312000, status: "Qualified" },
  { member: "BluePeak Distribution", program: "Distributor Rebate 26", target: 500000, achieved: 468200, status: "Near threshold" },
  { member: "Vertex Semiconductor", program: "Growth Rebate 2026", target: 750000, achieved: 895400, status: "Qualified" },
  { member: "Harbor Point Supply", program: "Rebate Program 2026", target: 150000, achieved: 84500, status: "Below" },
  { member: "Meridian Systems", program: "Electronic Rebate", target: 200000, achieved: 216000, status: "Qualified" },
  { member: "Ironline Trading", program: "FY 26 Rebate Program", target: 120000, achieved: 118000, status: "Near threshold" },
  { member: "Cascade Circuits", program: "Growth Rebate 2026", target: 300000, achieved: 210000, status: "Below" },
];

const statusStyle: Record<Status, string> = {
  Qualified: "bg-success-soft text-success",
  "Near threshold": "bg-warning-soft text-warning",
  Below: "bg-destructive/10 text-destructive",
};

function MemberEligibilityPage() {
  const [status, setStatus] = useState<"all" | Status>("all");
  const [program, setProgram] = useState("all");
  const filtered = useMemo(
    () => ROWS.filter((r) => (status === "all" || r.status === status) && (program === "all" || r.program === program)),
    [status, program],
  );
  const counts = ROWS.reduce(
    (a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
  const programs = Array.from(new Set(ROWS.map((r) => r.program)));

  return (
    <ReportShell
      title="Member Eligibility"
      subtitle="Which program members qualify, are near threshold, or have fallen below qualifying targets."
      icon={Package}
      accent="bg-info-soft text-info"
      kpis={[
        { label: "Total Members", value: `${ROWS.length}`, tone: "brand" },
        { label: "Qualified", value: `${counts.Qualified ?? 0}`, tone: "success" },
        { label: "Near threshold", value: `${counts["Near threshold"] ?? 0}`, hint: "≥ 90% of target", tone: "warning" },
        { label: "Below target", value: `${counts.Below ?? 0}`, tone: "info" },
      ]}
    >
      <FilterBar>
        <Field label="Program">
          <select value={program} onChange={(e) => setProgram(e.target.value)} className={inputCls}>
            <option value="all">All Programs</option>
            {programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <Field label="Eligibility">
          <select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className={inputCls}>
            <option value="all">All</option>
            <option value="Qualified">Qualified</option>
            <option value="Near threshold">Near threshold</option>
            <option value="Below">Below</option>
          </select>
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

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Member</th>
                <th className="text-left px-5 py-3 font-semibold">Program</th>
                <th className="text-right px-5 py-3 font-semibold">Target</th>
                <th className="text-right px-5 py-3 font-semibold">Achieved</th>
                <th className="text-left px-5 py-3 font-semibold w-64">Progress</th>
                <th className="text-left px-5 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r, i) => {
                const pct = Math.min((r.achieved / r.target) * 100, 130);
                const barTone = r.status === "Qualified" ? "from-success/60 to-success" : r.status === "Near threshold" ? "from-warning/60 to-warning" : "from-destructive/60 to-destructive";
                return (
                  <tr key={i} className="hover:bg-muted/40">
                    <td className="px-5 py-3 font-semibold">{r.member}</td>
                    <td className="px-5 py-3 text-brand hover:underline cursor-pointer">{r.program}</td>
                    <td className="px-5 py-3 text-right tabular-nums text-muted-foreground">{fmt(r.target)}</td>
                    <td className="px-5 py-3 text-right tabular-nums font-semibold">{fmt(r.achieved)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                          <div className={`h-full bg-gradient-to-r ${barTone} rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
                        </div>
                        <span className="tabular-nums text-xs text-muted-foreground w-12 text-right">{pct.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyle[r.status]}`}>{r.status}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </ReportShell>
  );
}
