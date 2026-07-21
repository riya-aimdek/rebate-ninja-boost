import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Tag, Play, FileDown, Search } from "lucide-react";
import { ReportShell, FilterBar, Field, inputCls } from "@/components/ReportShell";

export const Route = createFileRoute("/reports/new-product-purchase")({
  head: () => ({
    meta: [
      { title: "New Product Purchase Report · Rebate Ninja" },
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

function NewProductPurchasePage() {
  const [generated, setGenerated] = useState(true);
  const [q, setQ] = useState("");
  const filtered = ROWS.filter(
    (r) => !q || r.product.toLowerCase().includes(q.toLowerCase()) || r.account.toLowerCase().includes(q.toLowerCase()),
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

  return (
    <ReportShell
      title="New Product Purchase Report"
      subtitle="Products purchased in the selected range that were not purchased before that period — useful for new-product incentive tracking."
      icon={Tag}
      accent="bg-brand/10 text-brand"
      kpis={[
        { label: "Rows", value: `${filtered.length}`, tone: "brand" },
        { label: "Unique Accounts", value: `${uniqueAccounts}`, tone: "info" },
        { label: "Total New Purchase", value: `$${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}`, tone: "success" },
        { label: "Distinct Products", value: `${new Set(filtered.map((r) => r.product)).size}`, tone: "warning" },
      ]}
    >
      <FilterBar>
        <Field label="From Date" hint="required">
          <input type="date" defaultValue="2026-07-01" className={inputCls} />
        </Field>
        <Field label="To Date">
          <input type="date" defaultValue="2026-07-21" className={inputCls} />
        </Field>
        <Field label="Region">
          <select className={inputCls}>
            <option>All Regions</option>
            <option>North</option>
            <option>West</option>
            <option>South</option>
            <option>East</option>
          </select>
        </Field>
        <div className="flex-1" />
        <button
          onClick={() => setGenerated(true)}
          type="button"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-brand-foreground font-semibold text-sm hover:opacity-90"
        >
          <Play className="size-4" /> Generate Report
        </button>
      </FilterBar>

      {generated && (
        <>
          {/* Insight strip */}
          <div className="grid gap-4 lg:grid-cols-2 mb-6">
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-4">
                Top Accounts by Purchase Amount
              </div>
              <div className="space-y-3">
                {byAccount.map(([name, val]) => (
                  <div key={name}>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span className="truncate max-w-[60%]">{name}</span>
                      <span className="tabular-nums font-semibold text-foreground">${val.toLocaleString()}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-brand rounded-full" style={{ width: `${(val / max) * 100}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-card border border-border rounded-2xl p-5 shadow-sm">
              <div className="text-xs uppercase tracking-wide font-semibold text-muted-foreground mb-4">
                Product Mix (Top Account)
              </div>
              <div className="space-y-2">
                {ROWS.filter((r) => r.account.includes("GKA-ARROW-001")).map((r) => {
                  const total = ROWS.filter((x) => x.account === r.account).reduce((a, x) => a + x.total, 0);
                  const pct = (r.total / total) * 100;
                  return (
                    <div key={r.product} className="flex items-center gap-3">
                      <div className="size-2.5 rounded-full bg-brand shrink-0" />
                      <div className="text-sm flex-1 truncate">{r.product}</div>
                      <div className="text-xs text-muted-foreground tabular-nums">{pct.toFixed(1)}%</div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl shadow-sm overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="Search products, invoices…"
                  className={`${inputCls} pl-8 w-full`}
                />
              </div>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted" type="button">
                <FileDown className="size-4" /> CSV
              </button>
              <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-sm hover:bg-muted" type="button">
                <FileDown className="size-4" /> PDF
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="text-left px-5 py-3 font-semibold">Account</th>
                    <th className="text-left px-5 py-3 font-semibold">Region</th>
                    <th className="text-left px-5 py-3 font-semibold">Product</th>
                    <th className="text-left px-5 py-3 font-semibold">Invoice</th>
                    <th className="text-left px-5 py-3 font-semibold">Date</th>
                    <th className="text-right px-5 py-3 font-semibold">Qty</th>
                    <th className="text-right px-5 py-3 font-semibold">Unit Price</th>
                    <th className="text-right px-5 py-3 font-semibold">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((r, i) => (
                    <tr key={i} className="hover:bg-muted/40">
                      <td className="px-5 py-3 font-medium">{r.account}</td>
                      <td className="px-5 py-3"><span className="inline-flex px-2 py-0.5 rounded-full text-xs bg-info-soft text-info font-semibold">{r.region}</span></td>
                      <td className="px-5 py-3">{r.product}</td>
                      <td className="px-5 py-3 font-mono text-xs text-muted-foreground truncate max-w-[220px]">{r.invoice}</td>
                      <td className="px-5 py-3 text-muted-foreground">{r.date}</td>
                      <td className="px-5 py-3 text-right tabular-nums">{r.qty}</td>
                      <td className="px-5 py-3 text-right tabular-nums">${r.price.toFixed(2)}</td>
                      <td className="px-5 py-3 text-right tabular-nums font-semibold">${r.total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </ReportShell>
  );
}
