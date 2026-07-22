import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Users, Filter, Download, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { ReportShell, FilterBar, Field, inputCls } from "@/components/ReportShell";

export const Route = createFileRoute("/reports/account-activity")({
  head: () => ({
    meta: [
      { title: "Account Activity · Rebate Ninja" },
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
  { account: "Acme Electronics Ltd", region: "West", programs: 4, revenue: 428500, earned: 12480, claims: 6, lastActivity: "07/20/2026", trend: 12.4 },
  { account: "Northwind Components", region: "East", programs: 3, revenue: 312000, earned: 9210, claims: 4, lastActivity: "07/19/2026", trend: 8.1 },
  { account: "BluePeak Distribution", region: "Central", programs: 5, revenue: 618200, earned: 21890, claims: 9, lastActivity: "07/21/2026", trend: 22.7 },
  { account: "Vertex Semiconductor", region: "West", programs: 3, revenue: 895400, earned: 31500, claims: 12, lastActivity: "07/21/2026", trend: 4.3 },
  { account: "Harbor Point Supply", region: "South", programs: 2, revenue: 84500, earned: 1580, claims: 2, lastActivity: "07/10/2026", trend: -3.2 },
  { account: "Meridian Systems", region: "East", programs: 4, revenue: 216000, earned: 6320, claims: 5, lastActivity: "07/18/2026", trend: -1.8 },
  { account: "Ironline Trading", region: "Central", programs: 2, revenue: 118000, earned: 2100, claims: 3, lastActivity: "07/15/2026", trend: 5.5 },
];

function AccountActivityPage() {
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");
  const filtered = useMemo(
    () => ROWS.filter((r) =>
      (!q || r.account.toLowerCase().includes(q.toLowerCase())) &&
      (region === "all" || r.region === region),
    ),
    [q, region],
  );
  const totals = filtered.reduce(
    (a, r) => ({ revenue: a.revenue + r.revenue, earned: a.earned + r.earned, claims: a.claims + r.claims }),
    { revenue: 0, earned: 0, claims: 0 },
  );
  const fmt = (n: number) => `$${n.toLocaleString(undefined, { minimumFractionDigits: 0 })}`;
  const regions = Array.from(new Set(ROWS.map((r) => r.region)));

  return (
    <ReportShell
      title="Account Activity"
      subtitle="Rebate earnings, claims and program participation summarised per customer account."
      icon={Users}
      accent="bg-info-soft text-info"
      kpis={[
        { label: "Active Accounts", value: `${filtered.length}`, tone: "brand" },
        { label: "Total Revenue", value: fmt(totals.revenue), tone: "info" },
        { label: "Rebate Earned", value: fmt(totals.earned), tone: "success" },
        { label: "Claims Filed", value: `${totals.claims}`, tone: "warning" },
      ]}
    >
      <FilterBar>
        <Field label="Region">
          <select value={region} onChange={(e) => setRegion(e.target.value)} className={inputCls}>
            <option value="all">All Regions</option>
            {regions.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="Account">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search account…" className={inputCls} />
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

      <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="text-left px-5 py-3 font-semibold">Account</th>
                <th className="text-left px-5 py-3 font-semibold">Region</th>
                <th className="text-center px-5 py-3 font-semibold">Programs</th>
                <th className="text-right px-5 py-3 font-semibold">Revenue</th>
                <th className="text-right px-5 py-3 font-semibold">Rebate Earned</th>
                <th className="text-right px-5 py-3 font-semibold">Claims</th>
                <th className="text-right px-5 py-3 font-semibold">Trend</th>
                <th className="text-left px-5 py-3 font-semibold">Last Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r, i) => (
                <tr key={i} className="hover:bg-muted/40">
                  <td className="px-5 py-3 font-semibold">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-full bg-brand/10 text-brand grid place-items-center text-xs font-bold">
                        {r.account.split(" ").map((w) => w[0]).slice(0, 2).join("")}
                      </div>
                      {r.account}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{r.region}</td>
                  <td className="px-5 py-3 text-center">
                    <span className="inline-grid place-items-center size-6 rounded-full bg-info-soft text-info text-xs font-semibold">{r.programs}</span>
                  </td>
                  <td className="px-5 py-3 text-right tabular-nums">{fmt(r.revenue)}</td>
                  <td className="px-5 py-3 text-right tabular-nums font-semibold text-success">{fmt(r.earned)}</td>
                  <td className="px-5 py-3 text-right tabular-nums">{r.claims}</td>
                  <td className="px-5 py-3 text-right tabular-nums">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${r.trend >= 0 ? "bg-success-soft text-success" : "bg-destructive/10 text-destructive"}`}>
                      {r.trend >= 0 ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
                      {Math.abs(r.trend).toFixed(1)}%
                    </span>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{r.lastActivity}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-muted/40 font-semibold">
              <tr>
                <td colSpan={3} className="px-5 py-3">Totals</td>
                <td className="px-5 py-3 text-right tabular-nums">{fmt(totals.revenue)}</td>
                <td className="px-5 py-3 text-right tabular-nums text-success">{fmt(totals.earned)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{totals.claims}</td>
                <td colSpan={2} className="px-5 py-3" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </ReportShell>
  );
}
