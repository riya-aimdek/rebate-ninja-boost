import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Table as TableIcon, Star, Clock, Play, Trash2, Search } from "lucide-react";
import { ReportShell, inputCls } from "@/components/ReportShell";

export const Route = createFileRoute("/reports/saved-views")({
  head: () => ({
    meta: [
      { title: "Saved Views · Rebate Ninja" },
      { name: "description", content: "Re-open custom reports you or your team have previously configured and saved." },
    ],
  }),
  component: SavedViewsPage,
});

type View = {
  id: string;
  name: string;
  base: string;
  baseTo: string;
  owner: string;
  updated: string;
  shared: boolean;
  starred: boolean;
  filters: string[];
};

const VIEWS: View[] = [
  {
    id: "sv-1",
    name: "Q2 Distributor Accruals",
    base: "Accrual Summary",
    baseTo: "/reports/accrual-summary",
    owner: "Priya S.",
    updated: "07/21/2026",
    shared: true,
    starred: true,
    filters: ["Program: Distributor Rebate 26", "Period: Q2 2026", "Status: With Accrual"],
  },
  {
    id: "sv-2",
    name: "Top MCU products YTD",
    base: "Product Performance",
    baseTo: "/reports/product-performance",
    owner: "Marcus L.",
    updated: "07/19/2026",
    shared: false,
    starred: true,
    filters: ["From: 01/01/2026", "To: 07/21/2026", "Search: MCU"],
  },
  {
    id: "sv-3",
    name: "Outstanding > 60 days",
    base: "Settlement Status",
    baseTo: "/reports/settlement-status",
    owner: "Priya S.",
    updated: "07/18/2026",
    shared: true,
    starred: false,
    filters: ["Ageing: 61+ days", "All Programs"],
  },
  {
    id: "sv-4",
    name: "West region growth accounts",
    base: "Account Activity",
    baseTo: "/reports/account-activity",
    owner: "Jenna K.",
    updated: "07/15/2026",
    shared: false,
    starred: false,
    filters: ["Region: West", "Trend: positive"],
  },
  {
    id: "sv-5",
    name: "Near-threshold members",
    base: "Member Eligibility",
    baseTo: "/reports/member-eligibility",
    owner: "Marcus L.",
    updated: "07/12/2026",
    shared: true,
    starred: false,
    filters: ["Status: Near threshold"],
  },
  {
    id: "sv-6",
    name: "New product launches — H1",
    base: "New Product Purchase",
    baseTo: "/reports/new-product-purchase",
    owner: "Jenna K.",
    updated: "07/08/2026",
    shared: false,
    starred: true,
    filters: ["From: 01/01/2026", "To: 06/30/2026"],
  },
];

function SavedViewsPage() {
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"all" | "starred" | "shared" | "mine">("all");
  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return VIEWS.filter((v) => {
      if (tab === "starred" && !v.starred) return false;
      if (tab === "shared" && !v.shared) return false;
      if (tab === "mine" && v.owner !== "Priya S.") return false;
      if (ql && !v.name.toLowerCase().includes(ql) && !v.base.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [q, tab]);

  return (
    <ReportShell
      title="Saved Views"
      subtitle="Re-open custom reports you or your team have previously configured and saved."
      icon={TableIcon}
      accent="bg-warning-soft text-warning"
      kpis={[
        { label: "Total Views", value: `${VIEWS.length}`, tone: "brand" },
        { label: "Starred", value: `${VIEWS.filter((v) => v.starred).length}`, tone: "warning" },
        { label: "Shared with Team", value: `${VIEWS.filter((v) => v.shared).length}`, tone: "info" },
        { label: "Owned by You", value: `${VIEWS.filter((v) => v.owner === "Priya S.").length}`, tone: "success" },
      ]}
    >
      <div className="bg-card border border-border rounded-2xl p-4 mb-6 shadow-sm flex flex-wrap items-center gap-3">
        <div className="flex gap-1 p-1 bg-muted rounded-lg">
          {(["all", "starred", "shared", "mine"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              type="button"
              className={`px-3 py-1.5 rounded-md text-sm font-medium capitalize transition ${tab === t ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t === "mine" ? "My Views" : t}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <div className="relative">
          <Search className="size-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search saved views…"
            className={`${inputCls} pl-9 w-72`}
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-muted-foreground bg-card">
          No saved views match your filters.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((v) => (
            <article key={v.id} className="group bg-card border border-border rounded-2xl p-5 shadow-sm hover:shadow-md hover:border-brand/40 transition">
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-base leading-tight truncate">{v.name}</h3>
                    {v.starred && <Star className="size-4 text-warning fill-warning shrink-0" />}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">Based on <span className="font-medium text-foreground">{v.base}</span></p>
                </div>
                {v.shared && (
                  <span className="text-[10px] uppercase tracking-wide font-bold bg-info-soft text-info px-2 py-0.5 rounded-full shrink-0">Shared</span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 mb-4">
                {v.filters.map((f) => (
                  <span key={f} className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{f}</span>
                ))}
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border pt-3">
                <div className="flex items-center gap-1.5">
                  <div className="size-5 rounded-full bg-brand/10 text-brand grid place-items-center text-[10px] font-bold">
                    {v.owner.split(" ").map((w) => w[0]).join("")}
                  </div>
                  <span>{v.owner}</span>
                </div>
                <div className="flex items-center gap-1"><Clock className="size-3" /> {v.updated}</div>
              </div>

              <div className="mt-4 flex items-center gap-2">
                <Link
                  to={v.baseTo}
                  className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-brand text-brand-foreground text-sm font-semibold hover:opacity-90"
                >
                  <Play className="size-3.5" /> Open
                </Link>
                <button type="button" className="p-2 rounded-lg border border-border text-muted-foreground hover:text-destructive hover:border-destructive/40" aria-label="Delete view">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </ReportShell>
  );
}
