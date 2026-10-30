import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUpRight, ArrowDownRight, SearchX, X } from "lucide-react";
import { toast } from "sonner";
import { ReportShell, FilterBar, FilterBarEnd, Field, fmtDate, inputCls, usd } from "@/components/ReportShell";
import { Btn, DataTable, EmptyState, notifySuccess, type Column } from "@/components/pricing/kit";
import { TODAY, downloadCsv } from "@/lib/pricing/csv";

export const Route = createFileRoute("/reports/account-activity")({
  head: () => ({
    meta: [
      { title: "Account activity · Rebate Ninja" },
      { name: "description", content: "Rebate earnings, claims and program participation summarised per customer account." },
    ],
  }),
  component: AccountActivityPage,
});

type Row = {
  account: string;
  region: string;
  programs: number;
  revenue: number;
  earned: number;
  claims: number;
  lastActivity: string;
  trend: number; // % vs prior period
};

const ROWS: Row[] = [
  { account: "Acme Electronics Ltd", region: "West", programs: 4, revenue: 428500, earned: 12480, claims: 6, lastActivity: "2026-07-20", trend: 12.4 },
  { account: "Northwind Components", region: "East", programs: 3, revenue: 312000, earned: 9210, claims: 4, lastActivity: "2026-07-19", trend: 8.1 },
  { account: "BluePeak Distribution", region: "Central", programs: 5, revenue: 618200, earned: 21890, claims: 9, lastActivity: "2026-07-21", trend: 22.7 },
  { account: "Vertex Semiconductor", region: "West", programs: 3, revenue: 895400, earned: 31500, claims: 12, lastActivity: "2026-07-21", trend: 4.3 },
  { account: "Harbor Point Supply", region: "South", programs: 2, revenue: 84500, earned: 1580, claims: 2, lastActivity: "2026-07-10", trend: -3.2 },
  { account: "Meridian Systems", region: "East", programs: 4, revenue: 216000, earned: 6320, claims: 5, lastActivity: "2026-07-18", trend: -1.8 },
  { account: "Ironline Trading", region: "Central", programs: 2, revenue: 118000, earned: 2100, claims: 3, lastActivity: "2026-07-15", trend: 5.5 },
];

function AccountActivityPage() {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtered = useMemo(
    () => ROWS.filter((r) =>
      (!q || r.account.toLowerCase().includes(q.toLowerCase())) &&
      (region === "all" || r.region === region) &&
      (!from || r.lastActivity >= from) &&
      (!to || r.lastActivity <= to),
    ),
    [q, region, from, to],
  );
  const totals = filtered.reduce(
    (a, r) => ({ revenue: a.revenue + r.revenue, earned: a.earned + r.earned, claims: a.claims + r.claims }),
    { revenue: 0, earned: 0, claims: 0 },
  );
  const fmt = (n: number) => usd(n, 0);
  const regions = Array.from(new Set(ROWS.map((r) => r.region)));
  const dateError = from && to && from > to ? "End date must be on or after the start date" : undefined;

  const activeCount = [q.trim() !== "", region !== "all", from !== "", to !== ""].filter(Boolean).length;
  const clearFilters = () => {
    setQ("");
    setRegion("all");
    setFrom("");
    setTo("");
  };

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export", { description: "No accounts match the current filters. Clear filters and try again." });
      return;
    }
    downloadCsv(
      `account-activity-${TODAY}.csv`,
      filtered.map((r) => ({
        Account: r.account,
        Region: r.region,
        Programs: r.programs,
        Revenue: r.revenue,
        "Rebate earned": r.earned,
        Claims: r.claims,
        "Trend %": r.trend,
        "Last activity": fmtDate(r.lastActivity),
      })),
    );
    notifySuccess("CSV exported", `${filtered.length} ${filtered.length === 1 ? "account" : "accounts"} downloaded`);
  };

  const columns: Column<Row>[] = [
    {
      key: "account",
      header: "Account",
      className: "font-semibold whitespace-nowrap",
      cell: (r) => (
        <div className="flex items-center gap-3">
          <div className="size-8 shrink-0 rounded-full bg-brand/10 text-brand grid place-items-center text-xs font-bold" aria-hidden>
            {r.account.split(" ").map((w) => w[0]).slice(0, 2).join("")}
          </div>
          {r.account}
        </div>
      ),
    },
    { key: "region", header: "Region", className: "text-muted-foreground", cell: (r) => r.region },
    { key: "programs", header: "Programs", align: "right", className: "tabular-nums", cell: (r) => r.programs },
    { key: "revenue", header: "Revenue", align: "right", className: "tabular-nums", cell: (r) => fmt(r.revenue) },
    { key: "earned", header: "Rebate earned", align: "right", className: "tabular-nums font-semibold text-success", cell: (r) => fmt(r.earned) },
    { key: "claims", header: "Claims", align: "right", className: "tabular-nums", cell: (r) => r.claims },
    {
      key: "trend",
      header: "Trend",
      align: "right",
      className: "tabular-nums",
      cell: (r) => (
        <span
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${r.trend >= 0 ? "bg-success-soft text-success" : "bg-danger-soft text-destructive"}`}
        >
          {r.trend >= 0 ? <ArrowUpRight className="size-3" aria-hidden /> : <ArrowDownRight className="size-3" aria-hidden />}
          {r.trend >= 0 ? "+" : "−"}
          {Math.abs(r.trend).toFixed(1)}%
          <span className="sr-only"> vs prior period</span>
        </span>
      ),
    },
    { key: "last", header: "Last activity", className: "text-muted-foreground whitespace-nowrap", cell: (r) => fmtDate(r.lastActivity) },
  ];

  return (
    <ReportShell
      title="Account activity"
      subtitle="Rebate earnings, claims and program participation summarised per customer account."
      onExport={exportCsv}
      kpis={[
        { label: "Active accounts", value: `${filtered.length}` },
        { label: "Total revenue", value: fmt(totals.revenue) },
        { label: "Rebate earned", value: fmt(totals.earned), tone: "success" },
        { label: "Claims filed", value: `${totals.claims}` },
      ]}
    >
      <FilterBar>
        <Field label="Region">
          <select value={region} onChange={(e) => setRegion(e.target.value)} className={inputCls}>
            <option value="all">All regions</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Account">
          <input type="search" data-page-search aria-keyshortcuts="/" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Account name" className={inputCls} />
        </Field>
        <Field label="Last activity from">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Last activity to" error={dateError}>
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={inputCls} />
        </Field>
        <FilterBarEnd>
          <span role="status" className="text-sm text-muted-foreground">
            Showing {filtered.length} of {ROWS.length} accounts
          </span>
          <Btn variant="subtle" icon={X} onClick={clearFilters} disabled={activeCount === 0}>
            Clear filters{activeCount > 0 && ` (${activeCount})`}
          </Btn>
        </FilterBarEnd>
      </FilterBar>

      <DataTable
        caption="Account activity"
        columns={columns}
        rows={filtered}
        rowKey={(r) => r.account}
        numbered={false}
        empty={
          <EmptyState
            icon={SearchX}
            title="No accounts match these filters"
            action={
              <Btn variant="subtle" icon={X} onClick={clearFilters}>
                Clear filters
              </Btn>
            }
          >
            Try a different region, account name or date range.
          </EmptyState>
        }
        footer={
          filtered.length > 0 ? (
            <tr>
              <th scope="row" colSpan={3} className="px-4 py-3.5 text-left">Totals</th>
              <td className="px-4 py-3.5 text-right tabular-nums">{fmt(totals.revenue)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums text-success">{fmt(totals.earned)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums">{totals.claims}</td>
              <td colSpan={2} className="px-4 py-3.5" />
            </tr>
          ) : undefined
        }
      />
    </ReportShell>
  );
}
