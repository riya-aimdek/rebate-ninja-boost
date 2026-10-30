import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Play, SearchX, X } from "lucide-react";
import { toast } from "sonner";
import { ReportShell, FilterBar, FilterBarEnd, Field, fmtDate, inputCls, usd } from "@/components/ReportShell";
import { Btn, Card, DataTable, EmptyState, SearchInput, Tag, notifySuccess, type Column } from "@/components/pricing/kit";
import { TODAY, downloadCsv } from "@/lib/pricing/csv";

export const Route = createFileRoute("/reports/new-product-purchase")({
  head: () => ({
    meta: [
      { title: "New product purchases · Rebate Ninja" },
      { name: "description", content: "Products purchased in the selected range that were not purchased before that period." },
    ],
  }),
  component: NewProductPurchasePage,
});

type Row = {
  account: string;
  region: string;
  product: string;
  invoice: string;
  date: string;
  qty: number;
  price: number;
  total: number;
};

const ROWS: Row[] = [
  { account: "Account ACC-GKA-ARROW-001", region: "North", product: "ATSAMD21 Cortex-M0 MCU", invoice: "243101f8-4bac-3301-1814-2c9bab7b02ac", date: "2026-07-08", qty: 450, price: 5.2, total: 2340 },
  { account: "Account ACC-GKA-ARROW-001", region: "North", product: "ATSAMV71 Cortex-M7 MCU", invoice: "243101f8-4bac-3301-1814-2c9bab7b02ac", date: "2026-07-08", qty: 600, price: 22, total: 14300 },
  { account: "Account ACC-GKA-ARROW-001", region: "North", product: "LTC3780 Buck-Boost Controller", invoice: "243101f8-4bac-3301-1814-2c9bab7b02ac", date: "2026-07-08", qty: 3, price: 8.5, total: 25.5 },
  { account: "Account ACC-GKA-ARROW-001", region: "North", product: "PIC32MX795 MCU", invoice: "243101f8-4bac-3301-1814-2c9bab7b02ac", date: "2026-07-08", qty: 600, price: 8.9, total: 5340 },
  { account: "Account ACC-ROC-ARROW-SURAT-001", region: "West", product: "ATSAMV71 Cortex-M7 MCU", invoice: "e30a8833-ef1d-2693-d866-a247e82ad266", date: "2026-07-08", qty: 60, price: 22, total: 19925 },
];

type Criteria = { from: string; to: string; region: string };
const DEFAULT_CRITERIA: Criteria = { from: "2026-07-01", to: "2026-07-21", region: "all" };
const REGIONS = ["North", "West", "South", "East"];

function NewProductPurchasePage() {
  // Draft criteria are edited in the filter bar; "Generate report" applies them.
  const [draft, setDraft] = useState<Criteria>(DEFAULT_CRITERIA);
  const [applied, setApplied] = useState<Criteria>(DEFAULT_CRITERIA);
  const [generating, setGenerating] = useState(false);
  const [touched, setTouched] = useState(false);
  const [q, setQ] = useState("");

  const fromError = !draft.from ? "Enter a start date to find first-time purchases" : undefined;
  const toError = draft.from && draft.to && draft.to < draft.from ? "End date must be on or after the start date" : undefined;
  const dirty = draft.from !== applied.from || draft.to !== applied.to || draft.region !== applied.region;

  const inRange = ROWS.filter(
    (r) =>
      (!applied.from || r.date >= applied.from) &&
      (!applied.to || r.date <= applied.to) &&
      (applied.region === "all" || r.region === applied.region),
  );
  const filtered = inRange.filter(
    (r) => !q || r.product.toLowerCase().includes(q.toLowerCase()) || r.account.toLowerCase().includes(q.toLowerCase()) || r.invoice.includes(q),
  );
  const totalAmount = filtered.reduce((a, r) => a + r.total, 0);
  const uniqueAccounts = new Set(filtered.map((r) => r.account)).size;

  // Simple bar-chart figures
  const byAccount = Object.entries(
    filtered.reduce<Record<string, number>>((a, r) => {
      a[r.account] = (a[r.account] || 0) + r.total;
      return a;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...byAccount.map(([, v]) => v), 1);
  const topAccount = byAccount[0]?.[0];
  const topRows = topAccount ? filtered.filter((r) => r.account === topAccount) : [];
  const topTotal = topRows.reduce((a, r) => a + r.total, 0);

  const generate = () => {
    setTouched(true);
    if (fromError || toError) return;
    setGenerating(true);
    window.setTimeout(() => {
      setApplied(draft);
      setGenerating(false);
      notifySuccess("Report generated", `${fmtDate(draft.from)} to ${draft.to ? fmtDate(draft.to) : "today"}${draft.region !== "all" ? ` · ${draft.region}` : ""}`);
    }, 400);
  };

  const isDefault = (c: Criteria) => c.from === DEFAULT_CRITERIA.from && c.to === DEFAULT_CRITERIA.to && c.region === DEFAULT_CRITERIA.region;
  const activeCount = [applied.region !== "all", q.trim() !== ""].filter(Boolean).length;
  const clearFilters = () => {
    setDraft(DEFAULT_CRITERIA);
    setApplied(DEFAULT_CRITERIA);
    setTouched(false);
    setQ("");
  };

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export", { description: "No purchases match the current criteria. Clear filters and try again." });
      return;
    }
    downloadCsv(
      `new-product-purchases-${TODAY}.csv`,
      filtered.map((r) => ({
        Account: r.account,
        Region: r.region,
        Product: r.product,
        Invoice: r.invoice,
        Date: r.date,
        Qty: r.qty,
        "Unit price": r.price,
        Total: r.total,
      })),
    );
    notifySuccess("CSV exported", `${filtered.length} ${filtered.length === 1 ? "row" : "rows"} downloaded`);
  };

  const columns: Column<Row>[] = [
    { key: "account", header: "Account", className: "font-medium whitespace-nowrap", cell: (r) => r.account },
    { key: "region", header: "Region", cell: (r) => <Tag tone="info">{r.region}</Tag> },
    { key: "product", header: "Product", className: "min-w-[13rem]", cell: (r) => r.product },
    {
      key: "invoice",
      header: "Invoice",
      className: "font-mono text-xs text-muted-foreground",
      cell: (r) => (
        <span className="block truncate max-w-[10rem]" title={r.invoice}>
          {r.invoice}
        </span>
      ),
    },
    { key: "date", header: "Date", className: "text-muted-foreground whitespace-nowrap", cell: (r) => fmtDate(r.date) },
    { key: "qty", header: "Qty", align: "right", className: "tabular-nums", cell: (r) => r.qty.toLocaleString("en-GB") },
    { key: "price", header: "Unit price", align: "right", className: "tabular-nums", cell: (r) => usd(r.price) },
    {
      key: "total",
      header: "Total",
      align: "right",
      className: "tabular-nums font-semibold",
      cell: (r) => usd(r.total),
    },
  ];

  return (
    <ReportShell
      title="New product purchases"
      subtitle="Products bought in the selected range that the account had not bought before — use it to track new-product incentives."
      onExport={exportCsv}
      kpis={[
        { label: "Purchase lines", value: `${filtered.length}` },
        { label: "Accounts", value: `${uniqueAccounts}` },
        { label: "Distinct products", value: `${new Set(filtered.map((r) => r.product)).size}` },
        { label: "New purchase value", value: usd(totalAmount), tone: "success" },
      ]}
    >
      <FilterBar>
        <Field label="From date" required error={touched ? fromError : undefined}>
          <input
            type="date"
            required
            value={draft.from}
            onChange={(e) => setDraft({ ...draft, from: e.target.value })}
            onBlur={() => setTouched(true)}
            className={inputCls}
          />
        </Field>
        <Field label="To date" error={toError}>
          <input type="date" value={draft.to} min={draft.from || undefined} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Region">
          <select value={draft.region} onChange={(e) => setDraft({ ...draft, region: e.target.value })} className={inputCls}>
            <option value="all">All regions</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <FilterBarEnd>
          {dirty && (
            <span role="status" className="text-sm text-warning-foreground">
              Criteria changed — generate to update
            </span>
          )}
          <Btn variant="subtle" icon={X} onClick={clearFilters} disabled={isDefault(draft) && isDefault(applied) && !q}>
            Clear filters
          </Btn>
          <Btn icon={Play} onClick={generate} loading={generating}>
            Generate report
          </Btn>
        </FilterBarEnd>
      </FilterBar>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <Card title="Top accounts by purchase value">
          {byAccount.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchases in the selected range.</p>
          ) : (
            <ul className="space-y-4">
              {byAccount.map(([name, val]) => (
                <li key={name}>
                  <div className="flex justify-between gap-3 text-sm mb-1.5">
                    <span className="truncate" title={name}>
                      {name}
                    </span>
                    <span className="tabular-nums font-semibold whitespace-nowrap">{usd(val)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden" aria-hidden>
                    <div className="h-full bg-brand rounded-full" style={{ width: `${(val / max) * 100}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Product mix" subtitle={topAccount ? `Top account: ${topAccount}` : undefined}>
          {topRows.length === 0 ? (
            <p className="text-sm text-muted-foreground">No purchases in the selected range.</p>
          ) : (
            <ul className="space-y-3">
              {topRows.map((r) => (
                <li key={r.product} className="flex items-center gap-3 text-sm">
                  <span className="size-2.5 rounded-full bg-brand shrink-0" aria-hidden />
                  <span className="flex-1 truncate">{r.product}</span>
                  <span className="text-muted-foreground tabular-nums">{topTotal ? ((r.total / topTotal) * 100).toFixed(1) : "0.0"}%</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
        <SearchInput value={q} onChange={setQ} placeholder="Search product, account or invoice" className="w-full sm:w-96" />
        <p role="status" className="text-sm text-muted-foreground">
          Showing {filtered.length} of {inRange.length} purchases
          {activeCount > 0 && ` · ${activeCount} ${activeCount === 1 ? "filter" : "filters"} active`}
        </p>
      </div>

      <DataTable
        caption="New product purchases"
        columns={columns}
        rows={filtered}
        rowKey={(r) => `${r.invoice}|${r.product}`}
        numbered={false}
        empty={
          <EmptyState
            icon={SearchX}
            title={q.trim() ? `No purchases match “${q.trim()}”` : "No new product purchases in this range"}
            action={
              <Btn variant="subtle" icon={X} onClick={clearFilters}>
                Clear filters
              </Btn>
            }
          >
            Widen the date range, choose another region or change your search.
          </EmptyState>
        }
      />
    </ReportShell>
  );
}
