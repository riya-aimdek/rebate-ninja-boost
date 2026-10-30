import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SearchX, X } from "lucide-react";
import { toast } from "sonner";
import { ReportShell, FilterBar, FilterBarEnd, Field, inputCls, usd } from "@/components/ReportShell";
import { Btn, DataTable, EmptyState, FilterPills, StatusPill, notifySuccess, type Column, type Tone } from "@/components/pricing/kit";
import { TODAY, downloadCsv } from "@/lib/pricing/csv";

export const Route = createFileRoute("/reports/member-eligibility")({
  head: () => ({
    meta: [
      { title: "Member eligibility · Rebate Ninja" },
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

const STATUSES: Status[] = ["Qualified", "Near threshold", "Below"];

const statusTone: Record<Status, Tone> = {
  Qualified: "success",
  "Near threshold": "warning",
  Below: "danger",
};

function MemberEligibilityPage() {
  const [status, setStatus] = useState<"all" | Status>("all");
  const [program, setProgram] = useState("all");
  const filtered = useMemo(
    () => ROWS.filter((r) => (status === "all" || r.status === status) && (program === "all" || r.program === program)),
    [status, program],
  );
  const inProgram = ROWS.filter((r) => program === "all" || r.program === program);
  const counts = ROWS.reduce(
    (a, r) => ({ ...a, [r.status]: (a[r.status] ?? 0) + 1 }),
    {} as Record<string, number>,
  );
  const fmt = (n: number) => usd(n, 0);
  const programs = Array.from(new Set(ROWS.map((r) => r.program)));

  const activeCount = [program !== "all", status !== "all"].filter(Boolean).length;
  const clearFilters = () => {
    setProgram("all");
    setStatus("all");
  };

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export", { description: "No members match the current filters. Clear filters and try again." });
      return;
    }
    downloadCsv(
      `member-eligibility-${TODAY}.csv`,
      filtered.map((r) => ({
        Member: r.member,
        Program: r.program,
        Target: r.target,
        Achieved: r.achieved,
        "Progress %": Math.round((r.achieved / r.target) * 100),
        Status: r.status,
      })),
    );
    notifySuccess("CSV exported", `${filtered.length} ${filtered.length === 1 ? "member" : "members"} downloaded`);
  };

  const columns: Column<Row>[] = [
    { key: "member", header: "Member", className: "font-semibold", cell: (r) => r.member },
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
    { key: "target", header: "Target", align: "right", className: "tabular-nums text-muted-foreground", cell: (r) => fmt(r.target) },
    { key: "achieved", header: "Achieved", align: "right", className: "tabular-nums font-semibold", cell: (r) => fmt(r.achieved) },
    {
      key: "progress",
      header: "Progress",
      width: "16rem",
      cell: (r) => {
        const pct = Math.min((r.achieved / r.target) * 100, 130);
        const barTone = r.status === "Qualified" ? "from-success/60 to-success" : r.status === "Near threshold" ? "from-warning/60 to-warning" : "from-destructive/60 to-destructive";
        return (
          <div className="flex items-center gap-3 min-w-[10rem]">
            <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden" aria-hidden>
              <div className={`h-full bg-gradient-to-r ${barTone} rounded-full`} style={{ width: `${Math.min(pct, 100)}%` }} />
            </div>
            <span className="tabular-nums text-xs text-muted-foreground w-12 text-right">
              {pct.toFixed(0)}%<span className="sr-only"> of target</span>
            </span>
          </div>
        );
      },
    },
    { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} label={r.status} tone={statusTone[r.status]} /> },
  ];

  return (
    <ReportShell
      title="Member eligibility"
      subtitle="Which program members qualify, are near the threshold, or have fallen below their qualifying target."
      onExport={exportCsv}
      kpis={[
        { label: "Total members", value: `${ROWS.length}` },
        { label: "Qualified", value: `${counts.Qualified ?? 0}`, tone: "success" },
        { label: "Near threshold", value: `${counts["Near threshold"] ?? 0}`, hint: "90% of target or more", tone: "warning" },
        { label: "Below target", value: `${counts.Below ?? 0}`, tone: "danger" },
      ]}
    >
      <FilterBar>
        <Field label="Program">
          <select value={program} onChange={(e) => setProgram(e.target.value)} className={inputCls}>
            <option value="all">All programs</option>
            {programs.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </Field>
        <FilterBarEnd>
          <span role="status" className="text-sm text-muted-foreground">
            Showing {filtered.length} of {ROWS.length} members
          </span>
          <Btn variant="subtle" icon={X} onClick={clearFilters} disabled={activeCount === 0}>
            Clear filters{activeCount > 0 && ` (${activeCount})`}
          </Btn>
        </FilterBarEnd>
      </FilterBar>

      <FilterPills<Status>
        label="Eligibility"
        multiple={false}
        selected={status === "all" ? [] : [status]}
        onChange={(next) => setStatus(next[0] ?? "all")}
        options={STATUSES.map((s) => ({ key: s, label: s, count: inProgram.filter((r) => r.status === s).length }))}
      />

      <DataTable
        caption="Member eligibility"
        columns={columns}
        rows={filtered}
        rowKey={(r) => `${r.member}|${r.program}`}
        numbered={false}
        empty={
          <EmptyState
            icon={SearchX}
            title="No members match these filters"
            action={
              <Btn variant="subtle" icon={X} onClick={clearFilters}>
                Clear filters
              </Btn>
            }
          >
            Try a different program or eligibility status.
          </EmptyState>
        }
      />
    </ReportShell>
  );
}
