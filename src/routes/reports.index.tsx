import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  SlidersHorizontal,
  Tag,
  Table as TableIcon,
  BarChart3,
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
import { ChevronRight, SearchX, X } from "lucide-react";
import { AppLayout } from "@/components/AppShell";
import { Btn, Card, EmptyState, FilterPills, ListHeader } from "@/components/pricing/kit";

export const Route = createFileRoute("/reports/")({
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
  to?: string;
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
    title: "Performance and analytics",
    description: "Track how rebate programs and products are performing.",
    icon: TrendingUp,
    accent: "bg-brand/10 text-brand",
    reports: [
      {
        key: "program-register",
        title: "Program register",
        desc: "Deal & agreement performance — program-level KPIs with revenue, accrued rebate, paid, and outstanding settlement by program.",
        icon: ClipboardList,
        to: "/reports/program-register",
      },
      {
        key: "product-performance",
        title: "Product performance",
        desc: "Ranked view of qty sold, eligible purchase amount, and attributed rebate per product for a selected program.",
        icon: BarChart3,
        to: "/reports/product-performance",
      },
      {
        key: "new-product-purchase",
        title: "New product purchases",
        desc: "Identify products purchased for the first time in a period — useful for new product incentive tracking.",
        icon: Tag,
        to: "/reports/new-product-purchase",
      },
    ],
  },
  {
    key: "financial",
    title: "Financial and accruals",
    description: "Reconcile accruals, payouts, and settlement values.",
    icon: Wallet,
    accent: "bg-success-soft text-success",
    reports: [
      {
        key: "accrual-summary",
        title: "Accrual summary by period",
        desc: "Total revenue, eligible revenue, accrual amount and rate % per payout period and program, with per-account drill-down.",
        icon: PieChart,
        to: "/reports/accrual-summary",
      },
      {
        key: "payout-summary",
        title: "Payout summary",
        desc: "Approved, pending and paid rebate payouts across programs — reconcile against finance ledgers.",
        icon: Receipt,
        to: "/reports/payout-summary",
      },
      {
        key: "settlement-status",
        title: "Settlement status",
        desc: "Outstanding vs settled rebate balances by account and program, with ageing buckets.",
        icon: FileBarChart,
        to: "/reports/settlement-status",
      },
    ],
  },
  {
    key: "accounts",
    title: "Accounts and members",
    description: "Understand rebate activity across accounts and members.",
    icon: Users,
    accent: "bg-info-soft text-info",
    reports: [
      {
        key: "account-activity",
        title: "Account activity",
        desc: "Rebate earnings, claims and program participation summarised per customer account.",
        icon: Users,
        to: "/reports/account-activity",
      },
      {
        key: "member-eligibility",
        title: "Member eligibility",
        desc: "Which program members qualify, are near threshold, or have fallen below qualifying targets.",
        icon: Package,
        to: "/reports/member-eligibility",
      },
    ],
  },
  {
    key: "custom",
    title: "Custom and ad hoc",
    description: "Build your own view when the standard reports aren't enough.",
    icon: Sparkles,
    accent: "bg-warning-soft text-warning-foreground",
    reports: [
      {
        key: "custom",
        title: "Custom report",
        desc: "Build your own report with flexible date ranges, account filters, and rebate program criteria.",
        icon: SlidersHorizontal,
        to: "/reports/custom",
      },
      {
        key: "saved-views",
        title: "Saved views",
        desc: "Re-open custom reports you or your team have previously configured and saved.",
        icon: TableIcon,
        to: "/reports/saved-views",
      },
    ],
  },
];

function ReportsPage() {
  const [search, setSearch] = useState("");
  const [categories, setCategories] = useState<string[]>([]);

  const filteredCategories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return CATEGORIES.map((cat) => {
      if (categories.length > 0 && !categories.includes(cat.key)) return null;
      const reports = q ? cat.reports.filter((r) => r.title.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q)) : cat.reports;
      if (reports.length === 0) return null;
      return { ...cat, reports };
    }).filter(Boolean) as Category[];
  }, [search, categories]);

  const shownReports = filteredCategories.reduce((n, c) => n + c.reports.length, 0);
  const clearFilters = () => {
    setSearch("");
    setCategories([]);
  };

  return (
    <AppLayout>
      <ListHeader
        title="Reports"
        noun="report"
        count={shownReports}
        subtitle="Choose a report to view, filter and export rebate data."
        search={search}
        onSearch={setSearch}
      />

      <FilterPills
        label="Category"
        multiple={false}
        selected={categories}
        onChange={setCategories}
        className="mb-6"
        options={CATEGORIES.map((c) => ({ key: c.key, label: c.title, count: c.reports.length }))}
      />

      {filteredCategories.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card">
          <EmptyState
            icon={SearchX}
            title={search.trim() ? `No reports match “${search.trim()}”` : "No reports in this category"}
            action={
              <Btn variant="subtle" icon={X} onClick={clearFilters}>
                Clear filters
              </Btn>
            }
          >
            Try a different search term or category.
          </EmptyState>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 items-start">
          {filteredCategories.map((cat) => {
            const CatIcon = cat.icon;
            return (
              <Card
                key={cat.key}
                padded={false}
                title={
                  <span className="flex items-center gap-3">
                    <span className={`size-9 shrink-0 rounded-lg grid place-items-center ${cat.accent}`} aria-hidden>
                      <CatIcon className="size-5" />
                    </span>
                    {cat.title}
                  </span>
                }
                subtitle={cat.description}
              >
                <ul className="divide-y divide-border [&>li:last-child>a]:rounded-b-xl">
                  {cat.reports.map((r) => {
                    const Icon = r.icon;
                    const disabled = !!r.badge || !r.to;
                    const descId = `report-desc-${r.key}`;
                    const inner = (
                      <>
                        <span className={`size-10 shrink-0 rounded-lg grid place-items-center ${cat.accent}`} aria-hidden>
                          <Icon className="size-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={`block font-semibold ${disabled ? "text-muted-foreground" : "text-brand group-hover:underline"}`}>{r.title}</span>
                          <span id={descId} className="block text-sm text-muted-foreground mt-0.5">
                            {r.desc}
                          </span>
                        </span>
                        {disabled ? (
                          <span className="text-xs font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-full shrink-0 self-center">
                            {r.badge ?? "Not available yet"}
                          </span>
                        ) : (
                          <ChevronRight className="size-5 shrink-0 self-center text-muted-foreground group-hover:text-brand" aria-hidden />
                        )}
                      </>
                    );
                    const rowCls = "flex items-start gap-4 px-6 py-4";
                    return (
                      <li key={r.key}>
                        {disabled ? (
                          <div className={`${rowCls} opacity-70`}>{inner}</div>
                        ) : (
                          <Link
                            to={r.to}
                            aria-describedby={descId}
                            className={`group ${rowCls} transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand/40`}
                          >
                            {inner}
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
