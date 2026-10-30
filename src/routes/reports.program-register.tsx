import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SearchX, X } from "lucide-react";
import { toast } from "sonner";
import { ReportShell, FilterBar, FilterBarEnd, Field, fmtDate, inputCls, usd } from "@/components/ReportShell";
import { Btn, DataTable, EmptyState, StatusPill, notifySuccess, type Column } from "@/components/pricing/kit";
import { TODAY, downloadCsv } from "@/lib/pricing/csv";

export const Route = createFileRoute("/reports/program-register")({
  head: () => ({
    meta: [
      { title: "Program register · Rebate Ninja" },
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
  { id: "827204", name: "AWEB-YESS", freq: "Yearly", from: "2026-06-30", to: "2027-06-25", types: 1, members: 1, status: "Inactive", revenue: 0, accrued: 0, claim: 0, paid: 0 },
  { id: "134386", name: "Orthopaedics Growth Incentive", freq: "Monthly", from: "2026-05-01", to: "2026-08-31", types: null, members: null, status: "Inactive", revenue: 0, accrued: 0, claim: 0, paid: 0 },
  { id: "163138", name: "Rebate Program 2026", freq: "Quarterly", from: "2026-01-16", to: "2026-12-15", types: 6, members: 8, status: "Active", revenue: 86241.76, accrued: 11785.72, claim: 11830.79, paid: 0 },
  { id: "138446", name: "FY 26 Rebate Program", freq: "Quarterly", from: "2026-01-01", to: "2026-12-31", types: 4, members: 4, status: "Active", revenue: 0, accrued: 0, claim: 0, paid: 0 },
  { id: "172218", name: "Distributor Rebate 26", freq: "Quarterly", from: "2026-03-14", to: "2027-03-14", types: 1, members: 4, status: "Active", revenue: 0, accrued: 0, claim: 0, paid: 0 },
  { id: "209538", name: "Electronic Rebate", freq: "Quarterly", from: "2026-01-01", to: "2026-12-31", types: 2, members: 21, status: "Active", revenue: 41930.5, accrued: 1506.75, claim: 6636.5, paid: 0 },
  { id: "635048", name: "AWEB", freq: "Yearly", from: "2026-06-18", to: "2027-06-18", types: 3, members: 2, status: "Inactive", revenue: 0, accrued: 0, claim: 0, paid: 0 },
  { id: "125091", name: "FY26 Summer Program", freq: "Monthly", from: "2026-04-09", to: "2026-07-31", types: null, members: null, status: "Active", revenue: 0, accrued: 0, claim: 0, paid: 0 },
];

function ProgramRegisterPage() {
  const [status, setStatus] = useState("all");
  const [freq, setFreq] = useState("all");
  const [q, setQ] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = useMemo(
    () =>
      PROGRAMS.filter(
        (p) =>
          (status === "all" || p.status.toLowerCase() === status) &&
          (freq === "all" || p.freq.toLowerCase() === freq) &&
          (!q || p.name.toLowerCase().includes(q.toLowerCase()) || p.id.includes(q)) &&
          // Keep programs whose period overlaps the selected range.
          (!from || p.to >= from) &&
          (!to || p.from <= to),
      ),
    [status, freq, q, from, to],
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

  const fmt = (n: number) => usd(n);
  const dateError = from && to && from > to ? "End date must be on or after the start date" : undefined;

  const activeCount = [status !== "all", freq !== "all", q.trim() !== "", from !== "", to !== ""].filter(Boolean).length;
  const clearFilters = () => {
    setStatus("all");
    setFreq("all");
    setQ("");
    setFrom("");
    setTo("");
  };

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export", { description: "No programs match the current filters. Clear filters and try again." });
      return;
    }
    downloadCsv(
      `program-register-${TODAY}.csv`,
      filtered.map((p) => ({
        "Program ID": p.id,
        "Program name": p.name,
        Frequency: p.freq,
        From: p.from,
        To: p.to,
        Types: p.types ?? "",
        Members: p.members ?? "",
        Status: p.status,
        Revenue: p.revenue,
        Accrued: p.accrued,
        Claim: p.claim,
        Paid: p.paid,
      })),
    );
    notifySuccess("CSV exported", `${filtered.length} ${filtered.length === 1 ? "program" : "programs"} downloaded`);
  };

  const none = <span className="text-muted-foreground" aria-label="Not set">—</span>;
  const columns: Column<Prog>[] = [
    {
      key: "name",
      header: "Program",
      className: "min-w-[11rem]",
      cell: (p) => (
        <>
          <span className="block font-semibold">{p.name}</span>
          <span className="block font-mono text-xs text-muted-foreground mt-0.5">
            <span className="sr-only">Program ID </span>
            {p.id}
          </span>
        </>
      ),
    },
    { key: "freq", header: "Frequency", cell: (p) => p.freq },
    {
      key: "period",
      header: "Period",
      className: "text-muted-foreground whitespace-nowrap",
      cell: (p) => `${fmtDate(p.from)} – ${fmtDate(p.to)}`,
    },
    { key: "types", header: "Types", align: "right", className: "tabular-nums", cell: (p) => p.types ?? none },
    { key: "members", header: "Members", align: "right", className: "tabular-nums", cell: (p) => p.members ?? none },
    { key: "status", header: "Status", cell: (p) => <StatusPill status={p.status} /> },
    { key: "revenue", header: "Revenue", align: "right", className: "tabular-nums", cell: (p) => fmt(p.revenue) },
    { key: "accrued", header: "Accrued", align: "right", className: "tabular-nums font-semibold", cell: (p) => fmt(p.accrued) },
    { key: "claim", header: "Claim", align: "right", className: "tabular-nums", cell: (p) => fmt(p.claim) },
    { key: "paid", header: "Paid", align: "right", className: "tabular-nums", cell: (p) => fmt(p.paid) },
  ];

  return (
    <ReportShell
      title="Program register"
      subtitle="Revenue, accrued rebate, claim rebate and outstanding settlement for every rebate program."
      onExport={exportCsv}
      kpis={[
        { label: "Total programs", value: `${PROGRAMS.length}` },
        { label: "Active programs", value: `${active}`, tone: "success" },
        { label: "Total accrued", value: fmt(totals.accrued) },
        { label: "Outstanding", value: fmt(outstanding), tone: "warning", hint: "Claimed but not yet paid" },
      ]}
    >
      <FilterBar>
        <Field label="Search">
          <input
            type="search"
            data-page-search
            aria-keyshortcuts="/"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Program name or ID"
            className={inputCls}
          />
        </Field>
        <Field label="Status">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={inputCls}>
            <option value="all">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </Field>
        <Field label="Frequency">
          <select value={freq} onChange={(e) => setFreq(e.target.value)} className={inputCls}>
            <option value="all">All frequencies</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
        </Field>
        <Field label="Active from">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Active to" error={dateError}>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </Field>
        <FilterBarEnd>
          <span role="status" className="text-sm text-muted-foreground">
            Showing {filtered.length} of {PROGRAMS.length} programs
          </span>
          <Btn variant="subtle" icon={X} onClick={clearFilters} disabled={activeCount === 0}>
            Clear filters{activeCount > 0 && ` (${activeCount})`}
          </Btn>
        </FilterBarEnd>
      </FilterBar>

      <DataTable
        caption="Program register"
        columns={columns}
        rows={filtered}
        rowKey={(p) => p.id}
        numbered={false}
        empty={
          <EmptyState
            icon={SearchX}
            title="No programs match these filters"
            action={
              <Btn variant="subtle" icon={X} onClick={clearFilters}>
                Clear filters
              </Btn>
            }
          >
            Try a different status, frequency, name or date range.
          </EmptyState>
        }
        footer={
          filtered.length > 0 ? (
            <tr>
              <th scope="row" colSpan={6} className="px-4 py-3.5 text-left">
                Totals ({filtered.length} {filtered.length === 1 ? "program" : "programs"})
              </th>
              <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">{fmt(totals.revenue)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">{fmt(totals.accrued)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">{fmt(totals.claim)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums whitespace-nowrap">{fmt(totals.paid)}</td>
            </tr>
          ) : undefined
        }
      />
    </ReportShell>
  );
}
