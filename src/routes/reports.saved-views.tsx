import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Table as TableIcon, Star, Clock, Play, Trash2, SearchX, SlidersHorizontal, X } from "lucide-react";
import { ReportShell, fmtDate } from "@/components/ReportShell";
import { Btn, EmptyState, FilterPills, LinkBtn, Tag, notifyUndo } from "@/components/pricing/kit";

export const Route = createFileRoute("/reports/saved-views")({
  head: () => ({
    meta: [
      { title: "Saved views · Rebate Ninja" },
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
    name: "Q2 distributor accruals",
    base: "Accrual summary by period",
    baseTo: "/reports/accrual-summary",
    owner: "Priya S.",
    updated: "2026-07-21",
    shared: true,
    starred: true,
    filters: ["Program: Distributor Rebate 26", "Period: Q2 2026", "Status: With accrual"],
  },
  {
    id: "sv-2",
    name: "Top MCU products YTD",
    base: "Product performance",
    baseTo: "/reports/product-performance",
    owner: "Marcus L.",
    updated: "2026-07-19",
    shared: false,
    starred: true,
    filters: ["From: 1 Jan 2026", "To: 21 Jul 2026", "Search: MCU"],
  },
  {
    id: "sv-3",
    name: "Outstanding > 60 days",
    base: "Settlement status",
    baseTo: "/reports/settlement-status",
    owner: "Priya S.",
    updated: "2026-07-18",
    shared: true,
    starred: false,
    filters: ["Ageing: 61+ days", "All programs"],
  },
  {
    id: "sv-4",
    name: "West region growth accounts",
    base: "Account activity",
    baseTo: "/reports/account-activity",
    owner: "Jenna K.",
    updated: "2026-07-15",
    shared: false,
    starred: false,
    filters: ["Region: West", "Trend: positive"],
  },
  {
    id: "sv-5",
    name: "Near-threshold members",
    base: "Member eligibility",
    baseTo: "/reports/member-eligibility",
    owner: "Marcus L.",
    updated: "2026-07-12",
    shared: true,
    starred: false,
    filters: ["Status: Near threshold"],
  },
  {
    id: "sv-6",
    name: "New product launches — H1",
    base: "New product purchases",
    baseTo: "/reports/new-product-purchase",
    owner: "Jenna K.",
    updated: "2026-07-08",
    shared: false,
    starred: true,
    filters: ["From: 1 Jan 2026", "To: 30 Jun 2026"],
  },
];

const ME = "Priya S.";
type ViewTab = "all" | "starred" | "shared" | "mine";
type ListTab = Exclude<ViewTab, "all">;

function SavedViewsPage() {
  const [views, setViews] = useState<View[]>(VIEWS);
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<ViewTab>("all");

  const matchesTab = (v: View, t: ViewTab) =>
    t === "all" || (t === "starred" && v.starred) || (t === "shared" && v.shared) || (t === "mine" && v.owner === ME);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return views.filter((v) => {
      if (!matchesTab(v, tab)) return false;
      if (ql && !v.name.toLowerCase().includes(ql) && !v.base.toLowerCase().includes(ql)) return false;
      return true;
    });
  }, [views, q, tab]);

  const hasFilters = q.trim() !== "" || tab !== "all";
  const clearFilters = () => {
    setQ("");
    setTab("all");
  };

  const deleteView = (v: View) => {
    const index = views.findIndex((x) => x.id === v.id);
    setViews((cur) => cur.filter((x) => x.id !== v.id));
    notifyUndo(`“${v.name}” deleted`, () =>
      setViews((cur) => {
        if (cur.some((x) => x.id === v.id)) return cur;
        const next = [...cur];
        next.splice(Math.min(index, next.length), 0, v);
        return next;
      }),
    );
  };

  const tabCount = (t: ViewTab) => views.filter((v) => matchesTab(v, t)).length;

  return (
    <ReportShell
      title="Saved views"
      subtitle="Re-open reports that you or your team saved with their filters."
      search={q}
      onSearch={setQ}
      actions={
        <LinkBtn to="/reports/custom" variant="outline" icon={SlidersHorizontal}>
          New custom report
        </LinkBtn>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 mb-4">
        <FilterPills<ListTab>
          label="Show"
          multiple={false}
          className=""
          selected={tab === "all" ? [] : [tab]}
          onChange={(next) => setTab(next[0] ?? "all")}
          options={[
            { key: "starred", label: "Starred", count: tabCount("starred") },
            { key: "shared", label: "Shared", count: tabCount("shared") },
            { key: "mine", label: "My views", count: tabCount("mine") },
          ]}
        />
        <p role="status" className="text-sm text-muted-foreground">
          Showing {filtered.length} of {views.length} views
        </p>
      </div>

      {views.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card">
          <EmptyState
            icon={TableIcon}
            title="No saved views yet"
            action={
              <LinkBtn to="/reports/custom" icon={SlidersHorizontal}>
                Create custom report
              </LinkBtn>
            }
          >
            Saved views let you re-open a report with the same filters in one click.
          </EmptyState>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card">
          <EmptyState
            icon={SearchX}
            title={q.trim() ? `No saved views match “${q.trim()}”` : "No saved views in this list"}
            action={
              <Btn variant="subtle" icon={X} onClick={clearFilters}>
                Clear filters
              </Btn>
            }
          >
            Try a different search term or show all views.
          </EmptyState>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((v) => (
            <li key={v.id}>
              <article className="h-full flex flex-col bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md hover:border-brand/40 transition">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h2 className="font-semibold text-base leading-tight truncate">{v.name}</h2>
                      {v.starred && (
                        <Star className="size-4 text-warning fill-warning shrink-0" aria-label="Starred" role="img" />
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Based on <span className="font-medium text-foreground">{v.base}</span>
                    </p>
                  </div>
                  {v.shared && <Tag tone="info">Shared</Tag>}
                </div>

                <ul aria-label="Filters in this view" className="flex flex-wrap gap-2 mb-4">
                  {v.filters.map((f) => (
                    <li key={f}>
                      <Tag>{f}</Tag>
                    </li>
                  ))}
                </ul>

                <div className="mt-auto flex items-center justify-between gap-2 text-xs text-muted-foreground border-t border-border pt-3">
                  <div className="flex items-center gap-2">
                    <div className="size-6 rounded-full bg-brand/10 text-brand grid place-items-center text-[11px] font-bold" aria-hidden>
                      {v.owner.split(" ").map((w) => w[0]).join("")}
                    </div>
                    <span>
                      <span className="sr-only">Owner: </span>
                      {v.owner}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="size-3" aria-hidden />
                    <span className="sr-only">Updated </span>
                    <time dateTime={v.updated}>{fmtDate(v.updated)}</time>
                  </div>
                </div>

                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => deleteView(v)}
                    className="size-10 shrink-0 grid place-items-center rounded-lg border border-border bg-card text-muted-foreground hover:text-destructive hover:border-destructive/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                    aria-label={`Delete view ${v.name}`}
                    title="Delete view"
                  >
                    <Trash2 className="size-4" aria-hidden />
                  </button>
                  <LinkBtn to={v.baseTo} variant="outline" icon={Play} className="flex-1">
                    Open view
                  </LinkBtn>
                </div>
              </article>
            </li>
          ))}
        </ul>
      )}
    </ReportShell>
  );
}
