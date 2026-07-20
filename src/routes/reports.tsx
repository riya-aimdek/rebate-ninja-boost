import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  SlidersHorizontal,
  Tag,
  Table as TableIcon,
  BarChart3,
  ArrowRight,
} from "lucide-react";
import { Sidebar, TopBar } from "@/components/AppShell";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports · Rebate Ninja" },
      {
        name: "description",
        content:
          "Browse rebate reports — custom builder, new product purchases, program register, product performance and accrual summaries.",
      },
      { property: "og:title", content: "Reports · Rebate Ninja" },
      {
        property: "og:description",
        content:
          "Select a rebate report — custom, program register, product performance, accrual summary and more.",
      },
    ],
  }),
  component: ReportsPage,
});

type Report = {
  key: string;
  title: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
};

const REPORTS: Report[] = [
  {
    key: "custom",
    title: "Custom Report",
    desc: "Build your own report with flexible date ranges, account filters, and rebate program criteria.",
    icon: SlidersHorizontal,
  },
  {
    key: "new-product-purchase",
    title: "New Product Purchase Report",
    desc: "Identify products purchased for the first time within a selected period — useful for new product incentive tracking.",
    icon: Tag,
  },
  {
    key: "program-register",
    title: "Program Register",
    desc: "Deal & agreement performance report — program-level KPIs with revenue, accrued rebate, paid, and outstanding settlement by program.",
    icon: TableIcon,
  },
  {
    key: "product-performance",
    title: "Product Performance Report",
    desc: "Product-level rebate performance — ranked view of qty sold, eligible purchase amount, and attributed rebate per product for a selected program.",
    icon: BarChart3,
  },
  {
    key: "accrual-summary",
    title: "Accrual Summary by Period",
    desc: "Period-first accrual report — total revenue, eligible revenue, accrual amount, and rate % per payout period and program, with per-account drill-down.",
    icon: TableIcon,
  },
];

function ReportsPage() {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return REPORTS;
    return REPORTS.filter(
      (r) => r.title.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q),
    );
  }, [search]);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar activeLabel="Reports" />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar search={search} onSearch={setSearch} placeholder="Search reports…" />

        <main className="flex-1 px-6 py-6 max-w-[1400px] w-full mx-auto">
          <div className="flex items-center gap-3 mb-6">
            <div className="size-12 rounded-xl bg-brand/10 text-brand grid place-items-center">
              <div className="grid grid-cols-2 gap-0.5">
                <span className="size-2 rounded-sm bg-brand" />
                <span className="size-2 rounded-sm bg-brand/40" />
                <span className="size-2 rounded-sm bg-brand/40" />
                <span className="size-2 rounded-sm bg-brand" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
              <p className="text-sm text-muted-foreground">Select a report to get started</p>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
              No reports match “{search}”.
            </div>
          ) : (
            <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {filtered.map((r) => {
                const Icon = r.icon;
                return (
                  <article
                    key={r.key}
                    className="group bg-card border border-border rounded-2xl p-5 flex flex-col shadow-sm hover:shadow-md hover:border-brand/40 transition-all"
                  >
                    <div className="size-11 rounded-lg bg-brand/10 text-brand grid place-items-center mb-4">
                      <Icon className="size-5" />
                    </div>
                    <h3 className="font-semibold text-base leading-tight mb-2">{r.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                      {r.desc}
                    </p>
                    <div className="mt-5 pt-4 border-t border-border">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:gap-2.5 transition-all"
                      >
                        View Report <ArrowRight className="size-4" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
