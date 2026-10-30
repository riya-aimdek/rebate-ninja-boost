import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SearchX, X } from "lucide-react";
import { toast } from "sonner";
import { ReportShell, usd } from "@/components/ReportShell";
import { Btn, DataTable, EmptyState, notifySuccess, type Column } from "@/components/pricing/kit";
import { TODAY, downloadCsv } from "@/lib/pricing/csv";

export const Route = createFileRoute("/reports/product-performance")({
  head: () => ({
    meta: [
      { title: "Product performance · Rebate Ninja" },
      { name: "description", content: "Ranked view of qty sold, eligible amount, and attributed rebate per product." },
    ],
  }),
  component: ProductPerformancePage,
});

type Row = { id: number; name: string; programs: number; qty: number; eligible: number; rebate: number };
const ROWS: Row[] = [
  { id: 1, name: "ATSAMV71 Cortex-M7 MCU", programs: 2, qty: 660, eligible: 34225, rebate: 1125.25 },
  { id: 2, name: "PIC32MX795 MCU", programs: 1, qty: 600, eligible: 5340, rebate: 213.6 },
  { id: 3, name: "ATSAMD21 Cortex-M0 MCU", programs: 1, qty: 450, eligible: 2340, rebate: 93.6 },
  { id: 4, name: "STM32F407 Discovery Kit", programs: 2, qty: 320, eligible: 8960, rebate: 358.4 },
  { id: 5, name: "LTC3780 Buck-Boost Controller", programs: 1, qty: 3, eligible: 25.5, rebate: 1.02 },
  { id: 6, name: "TPS65217 PMIC", programs: 1, qty: 180, eligible: 1620, rebate: 64.8 },
  { id: 7, name: "MSP430FR MCU", programs: 1, qty: 90, eligible: 540, rebate: 21.6 },
];

function ProductPerformancePage() {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => ROWS.filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase())), [q]);
  const totals = filtered.reduce(
    (a, r) => ({ qty: a.qty + r.qty, eligible: a.eligible + r.eligible, rebate: a.rebate + r.rebate }),
    { qty: 0, eligible: 0, rebate: 0 },
  );
  const max = Math.max(...filtered.map((r) => r.eligible), 1);

  const fmt = (n: number) => usd(n);
  const share = (r: Row) => (totals.rebate ? (r.rebate / totals.rebate) * 100 : 0);

  const clearFilters = () => setQ("");

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("Nothing to export", { description: "No products match the current search. Clear filters and try again." });
      return;
    }
    downloadCsv(
      `product-performance-${TODAY}.csv`,
      filtered.map((r, i) => ({
        Rank: i + 1,
        Product: r.name,
        Programs: r.programs,
        "Qty sold": r.qty,
        "Eligible amount": r.eligible,
        "Attributed rebate": r.rebate,
        "% of rebate": share(r).toFixed(1),
      })),
    );
    notifySuccess("CSV exported", `${filtered.length} ${filtered.length === 1 ? "product" : "products"} downloaded`);
  };

  const columns: Column<Row>[] = [
    { key: "name", header: "Product", className: "font-semibold min-w-[12rem]", cell: (r) => r.name },
    { key: "programs", header: "Programs", align: "right", className: "tabular-nums", cell: (r) => r.programs },
    { key: "qty", header: "Qty sold", align: "right", className: "tabular-nums", cell: (r) => r.qty.toLocaleString("en-GB") },
    {
      key: "eligible",
      header: "Eligible amount",
      align: "right",
      width: "16rem",
      cell: (r) => (
        <div className="flex items-center gap-3 min-w-[12rem]">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden" aria-hidden>
            <div className="h-full bg-gradient-to-r from-success/60 to-success rounded-full" style={{ width: `${(r.eligible / max) * 100}%` }} />
          </div>
          <span className="tabular-nums w-24 text-right">{fmt(r.eligible)}</span>
        </div>
      ),
    },
    { key: "rebate", header: "Attributed rebate", align: "right", className: "tabular-nums font-semibold text-warning-foreground", cell: (r) => fmt(r.rebate) },
    { key: "share", header: "% of rebate", align: "right", className: "tabular-nums text-muted-foreground", cell: (r) => `${share(r).toFixed(1)}%` },
  ];

  return (
    <ReportShell
      title="Product performance"
      subtitle="Products ranked by eligible purchase amount, with quantity sold and attributed rebate."
      onExport={exportCsv}
      search={q}
      onSearch={setQ}
      kpis={[
        { label: "Products", value: `${filtered.length}` },
        { label: "Qty sold", value: totals.qty.toLocaleString("en-GB") },
        { label: "Eligible amount", value: fmt(totals.eligible), tone: "success" },
        { label: "Attributed rebate", value: fmt(totals.rebate), tone: "success" },
      ]}
    >
      <DataTable
        caption="Product performance, ranked by eligible amount"
        columns={columns}
        rows={filtered}
        rowKey={(r) => String(r.id)}
        empty={
          <EmptyState
            icon={SearchX}
            title={`No products match “${q.trim()}”`}
            action={
              <Btn variant="subtle" icon={X} onClick={clearFilters}>
                Clear filters
              </Btn>
            }
          >
            Check the spelling or search by a shorter product name.
          </EmptyState>
        }
        footer={
          filtered.length > 0 ? (
            <tr>
              <th scope="row" colSpan={3} className="px-4 py-3.5 text-left">Totals</th>
              <td className="px-4 py-3.5 text-right tabular-nums">{totals.qty.toLocaleString("en-GB")}</td>
              <td className="px-4 py-3.5 text-right tabular-nums">{fmt(totals.eligible)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums text-warning-foreground">{fmt(totals.rebate)}</td>
              <td className="px-4 py-3.5 text-right tabular-nums">100.0%</td>
            </tr>
          ) : undefined
        }
      />
    </ReportShell>
  );
}
