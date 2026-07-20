import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  SlidersHorizontal,
  Tag,
  Table as TableIcon,
  BarChart3,
  ArrowRight,
  FileBarChart,
  Package,
  Users,
  Wallet,
  TrendingUp,
  ClipboardList,
  Receipt,
  PieChart,
  Sparkles,
} from "lucide-react";
import { Sidebar, TopBar } from "@/components/AppShell";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports · Rebate Ninja" },
      {
        name: "description",
        content:
          "Browse rebate reports organised by category — performance, financial, program and account insights.",
      },
      { property: "og:title", content: "Reports · Rebate Ninja" },
      {
        property: "og:description",
        content:
          "Categorised rebate reports — performance, financial, program register, accruals and account analytics.",
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
  badge?: string;
};

type Category = {
  key: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string; // tailwind color classes for icon chip
  reports: Report[];
};

const CATEGORIES: Category[] = [
  {
    key: "performance",
    title: "Performance & Analytics",
    description: "Track how rebate programs and products are performing.",
    icon: TrendingUp,
    accent: "bg-brand/10 text-brand",
    reports: [
      {
        key: "program-register",
        title: "Program Register",
        desc: "Deal & agreement performance — program-level KPIs with revenue, accrued rebate, paid, and outstanding settlement by program.",
        icon: ClipboardList,
      },
      {
        key: "product-performance",
        title: "Product Performance Report",
        desc: "Ranked view of qty sold, eligible purchase amount, and attributed rebate per product for a selected program.",
        icon: BarChart3,
      },
      {
        key: "new-product-purchase",
        title: "New Product Purchase Report",
        desc: "Identify products purchased for the first time in a period — useful for new product incentive tracking.",
        icon: Tag,
      },
    ],
  },
  {
    key: "financial",
    title: "Financial & Accruals",
    description: "Reconcile accruals, payouts, and settlement values.",
    icon: Wallet,
    accent: "bg-success-soft text-success",
    reports: [
      {
        key: "accrual-summary",
        title: "Accrual Summary by Period",
        desc: "Total revenue, eligible revenue, accrual amount and rate % per payout period and program, with per-account drill-down.",
        icon: PieChart,
      },
      {
        key: "payout-summary",
        title: "Payout Summary",
        desc: "Approved, pending and paid rebate payouts across programs — reconcile against finance ledgers.",
        icon: Receipt,
        badge: "Coming soon",
      },
      {
        key: "settlement-status",
        title: "Settlement Status",
        desc: "Outstanding vs settled rebate balances by account and program, with ageing buckets.",
        icon: FileBarChart,
        badge: "Coming soon",
      },
    ],
  },
  {
    key: "accounts",
    title: "Accounts & Members",
    description: "Understand rebate activity across accounts and members.",
    icon: Users,
    accent: "bg-info-soft text-info",
    reports: [
      {
        key: "account-activity",
        title: "Account Activity",
        desc: "Rebate earnings, claims and program participation summarised per customer account.",
        icon: Users,
        badge: "Coming soon",
      },
      {
        key: "member-eligibility",
        title: "Member Eligibility",
        desc: "Which program members qualify, are near threshold, or have fallen below qualifying targets.",
        icon: Package,
        badge: "Coming soon",
      },
    ],
  },
  {
    key: "custom",
    title: "Custom & Ad-hoc",
    description: "Build your own view when the standard reports aren't enough.",
    icon: Sparkles,
    accent: "bg-warning-soft text-warning",
    reports: [
      {
        key: "custom",
        title: "Custom Report",
        desc: "Build your own report with flexible date ranges, account filters, and rebate program criteria.",
        icon: SlidersHorizontal,
      },
      {
        key: "saved-views",
        title: "Saved Views",
        desc: "Re-open custom reports you or your team have previously configured and saved.",
        icon: TableIcon,
        badge: "Coming soon",
      },
    ],
  },
];

function ReportsPage() {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CATEGORIES.map((cat) => {
      if (activeCategory !== "all" && cat.key !== activeCategory) return null;
      const reports = q
        ? cat.reports.filter(
            (r) =>
              r.title.toLowerCase().includes(q) ||
              r.desc.toLowerCase().includes(q),
          )
        : cat.reports;
      if (reports.length === 0) return null;
      return { ...cat, reports };
    }).filter(Boolean) as Category[];
  }, [search, activeCategory]);

  const totalReports = CATEGORIES.reduce((n, c) => n + c.reports.length, 0);

  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar activeLabel="Reports" />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar search={search} onSearch={setSearch} placeholder="Search reports…" />

        <main className="flex-1 px-6 py-6 max-w-[1400px] w-full mx-auto">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="size-12 rounded-xl bg-brand/10 text-brand grid place-items-center">
                <FileBarChart className="size-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">Reports</h1>
                <p className="text-sm text-muted-foreground">
                  {totalReports} reports across {CATEGORIES.length} categories · Select a report to get started
                </p>
              </div>
            </div>
          </div>

          {/* Category filter chips */}
          <div className="flex flex-wrap gap-2 mb-8 border-b border-border pb-4">
            <CategoryChip
              label="All"
              count={totalReports}
              active={activeCategory === "all"}
              onClick={() => setActiveCategory("all")}
            />
            {CATEGORIES.map((cat) => (
              <CategoryChip
                key={cat.key}
                label={cat.title}
                count={cat.reports.length}
                active={activeCategory === cat.key}
                onClick={() => setActiveCategory(cat.key)}
              />
            ))}
          </div>

          {/* Categories */}
          {filteredCategories.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
              No reports match “{search}”.
            </div>
          ) : (
            <div className="space-y-10">
              {filteredCategories.map((cat) => {
                const CatIcon = cat.icon;
                return (
                  <section key={cat.key}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`size-10 rounded-lg grid place-items-center ${cat.accent}`}>
                        <CatIcon className="size-5" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold tracking-tight">{cat.title}</h2>
                        <p className="text-xs text-muted-foreground">{cat.description}</p>
                      </div>
                      <span className="ml-auto text-xs font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">
                        {cat.reports.length} {cat.reports.length === 1 ? "report" : "reports"}
                      </span>
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {cat.reports.map((r) => {
                        const Icon = r.icon;
                        const disabled = !!r.badge;
                        return (
                          <article
                            key={r.key}
                            className={`group relative bg-card border border-border rounded-2xl p-5 flex flex-col shadow-sm transition-all ${
                              disabled
                                ? "opacity-70"
                                : "hover:shadow-md hover:border-brand/40 hover:-translate-y-0.5"
                            }`}
                          >
                            {r.badge && (
                              <span className="absolute top-3 right-3 text-[10px] uppercase tracking-wide font-bold text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                                {r.badge}
                              </span>
                            )}
                            <div className={`size-11 rounded-lg grid place-items-center mb-4 ${cat.accent}`}>
                              <Icon className="size-5" />
                            </div>
                            <h3 className="font-semibold text-base leading-tight mb-2">{r.title}</h3>
                            <p className="text-sm text-muted-foreground leading-relaxed flex-1">
                              {r.desc}
                            </p>
                            <div className="mt-5 pt-4 border-t border-border">
                              <button
                                type="button"
                                disabled={disabled}
                                className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:gap-2.5 transition-all disabled:text-muted-foreground disabled:cursor-not-allowed disabled:hover:gap-1.5"
                              >
                                {disabled ? "Not available yet" : "View Report"}
                                {!disabled && <ArrowRight className="size-4" />}
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors ${
        active
          ? "bg-brand text-brand-foreground border-brand"
          : "bg-card text-foreground border-border hover:border-brand/40 hover:bg-muted"
      }`}
    >
      {label}
      <span
        className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-full ${
          active ? "bg-brand-foreground/20 text-brand-foreground" : "bg-muted text-muted-foreground"
        }`}
      >
        {count}
      </span>
    </button>
  );
}
