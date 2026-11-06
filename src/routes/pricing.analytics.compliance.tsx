import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowLeftRight } from "lucide-react";
import { Btn, Card, DataTable, DetailTitle, EmptyState, FilterPills, Flag, InfoBanner, KpiTile, PricingLayout, ProgressBar, RecordLink, Segmented, Toggle, money, pct, type Column, TableSection } from "@/components/pricing/kit";
import { RequireAccess } from "@/components/pricing/access";
import { Freshness, MetricLabel } from "@/components/pricing/analytics-ui";
import { PRICE_LIST_TOLERANCE_PCT, complianceOf, complianceRate, customerName, keyOf, labelOf, productName, rlsNote, scopedTransactions, DIMENSION_LABEL, type BandSource, type ComplianceRow, type Dimension } from "@/lib/pricing/analytics";
import { useSession, userName } from "@/lib/pricing/session";
import { downloadCsv } from "@/lib/pricing/csv";

type GroupBy = "CUSTOMER" | "PRODUCT" | "SALES_REP" | "REGION" | "CHANNEL";
type Search = { band?: BandSource; by?: GroupBy; all?: boolean; period?: "2026-Q3" | "2026-Q2" };
const GROUP_BY: GroupBy[] = ["CUSTOMER", "PRODUCT", "SALES_REP", "REGION", "CHANNEL"];

export const Route = createFileRoute("/pricing/analytics/compliance")({
  head: () => ({ meta: [{ title: "Compliance & variance · Rebate Ninja" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    band: s.band === "GUARDRAIL" ? "GUARDRAIL" : undefined,
    by: typeof s.by === "string" && (GROUP_BY as string[]).includes(s.by) ? (s.by as GroupBy) : undefined,
    all: s.all === true || s.all === "true" ? true : undefined,
    period: s.period === "2026-Q2" ? "2026-Q2" : undefined,
  }),
  component: () => (
    <RequireAccess module="ANALYTICS">
      <Page />
    </RequireAccess>
  ),
});

type Adherence = { key: string; label: string; lines: number; priceList: number; discountPolicy: number; approval: number; overall: number; variance: number };

/** Three adherence measures per group (US-AN-03 AC#2): price list, discount policy (guardrail band), approval workflow. */
function adherenceBy(rows: ComplianceRow[], d: Dimension, rowsPL: ComplianceRow[], rowsGR: ComplianceRow[]): Adherence[] {
  const keys = Array.from(new Set(rows.map((r) => keyOf(r, d))));
  return keys
    .map((k) => {
      const pl = rowsPL.filter((r) => keyOf(r, d) === k);
      const gr = rowsGR.filter((r) => keyOf(r, d) === k);
      const cur = rows.filter((r) => keyOf(r, d) === k);
      const outside = gr.filter((r) => r.outside);
      return {
        key: k,
        label: labelOf(k, d),
        lines: cur.length,
        priceList: (pl.filter((r) => !r.outside).length / (pl.length || 1)) * 100,
        discountPolicy: (gr.filter((r) => !r.outside).length / (gr.length || 1)) * 100,
        approval: outside.length ? (outside.filter((r) => r.coveredByException).length / outside.length) * 100 : 100,
        overall: complianceRate(cur),
        variance: cur.reduce((a, r) => a + (r.outside ? r.varianceAmount * r.qty : 0), 0),
      };
    })
    .sort((a, b) => a.overall - b.overall);
}

const pctCell = (v: number) => (
  <span className="inline-flex items-center gap-2 justify-end min-w-28">
    <span className="w-14 hidden sm:block">
      <ProgressBar value={v} tone={v >= 90 ? "success" : v >= 75 ? "warning" : "danger"} label={`${v.toFixed(0)}%`} />
    </span>
    <span className="tabular-nums w-12 text-right">{v.toFixed(0)}%</span>
  </span>
);

function Page() {
  const search: Search = Route.useSearch();
  const navigate = useNavigate({ from: "/pricing/analytics/compliance" });
  const set = (n: Partial<Search>) => navigate({ search: (s: Search) => ({ ...s, ...n }) });
  const { user } = useSession();
  const band: BandSource = search.band ?? "PRICE_LIST";
  const by: GroupBy = search.by ?? "CUSTOMER";
  const period: "2026-Q3" | "2026-Q2" = search.period ?? "2026-Q3";

  const base = useMemo(() => scopedTransactions(user).filter((t) => t.period === period), [user, period]);
  const rowsPL = useMemo(() => base.map((t) => complianceOf(t, "PRICE_LIST")), [base]);
  const rowsGR = useMemo(() => base.map((t) => complianceOf(t, "GUARDRAIL")), [base]);
  const rows = band === "PRICE_LIST" ? rowsPL : rowsGR;
  const outside = rows.filter((r) => r.outside);
  const covered = outside.filter((r) => r.coveredByException);
  const rate = complianceRate(rows);
  const varianceTotal = outside.reduce((a, r) => a + r.varianceAmount * r.qty, 0);
  const report = search.all ? rows : outside;

  const byRep = adherenceBy(rows, "SALES_REP", rowsPL, rowsGR);
  const byRegion = adherenceBy(rows, "REGION", rowsPL, rowsGR);
  const groups = adherenceBy(rows, by, rowsPL, rowsGR);

  const exportCsv = () =>
    downloadCsv(
      `price-variance-${band.toLowerCase()}-${period}.csv`,
      report.map((r) => ({
        transaction: r.id,
        invoiceDate: r.invoiceDate,
        customer: customerName(r.customerId),
        product: r.sku,
        rep: userName(r.salesRepId),
        region: r.region,
        bandSource: band,
        bandLow: r.bandLow.toFixed(2),
        bandHigh: r.bandHigh.toFixed(2),
        invoicePrice: r.invoice.toFixed(2),
        varianceAmount: r.varianceAmount.toFixed(2),
        variancePct: r.variancePct.toFixed(2),
        coveredByException: r.coveredByException,
        exceptionId: r.exceptionId ?? "",
        compliant: r.compliant,
      })),
    );

  const adhCols = (d: Dimension): Column<Adherence>[] => [
    { key: "g", header: DIMENSION_LABEL[d], cell: (a) => <span className="font-medium">{a.label}</span> },
    { key: "n", header: "Lines", align: "right", cell: (a) => <span className="tabular-nums">{a.lines}</span> },
    { key: "pl", header: "Price list", align: "right", cell: (a) => pctCell(a.priceList) },
    { key: "dp", header: "Discount policy", align: "right", cell: (a) => pctCell(a.discountPolicy) },
    { key: "ap", header: "Approval workflow", align: "right", cell: (a) => pctCell(a.approval) },
  ];

  const note = rlsNote(user);
  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Analytics & reporting" }, { label: "Compliance & variance" }]}>
      <DetailTitle
        title="Compliance & variance"
        subtitle="Who is selling outside approved prices, and whether each exception was approved."
        actions={
          <>
            <Freshness />
            <Btn variant="outline" onClick={exportCsv} disabled={report.length === 0}>
              Export CSV
            </Btn>
          </>
        }
      />
      {note && <InfoBanner title="Row-level security">{note}</InfoBanner>}

      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 mb-6">
        <div>
          <p className="text-sm font-medium mb-1.5" id="band-label">
            Band source
          </p>
          <div role="group" aria-labelledby="band-label">
            <Segmented<BandSource>
              value={band}
              onChange={(b) => set({ band: b === "PRICE_LIST" ? undefined : b })}
              options={[
                { key: "PRICE_LIST", label: "Approved price list" },
                { key: "GUARDRAIL", label: "Guardrail band" },
              ]}
            />
          </div>
        </div>
        <FilterPills<"2026-Q3" | "2026-Q2">
          label="Period"
          className=""
          multiple={false}
          clearable={false}
          selected={[period]}
          onChange={(v) => set({ period: v[0] === "2026-Q2" ? "2026-Q2" : undefined })}
          options={[
            { key: "2026-Q3", label: "Q3 2026" },
            { key: "2026-Q2", label: "Q2 2026" },
          ]}
        />
      </div>

      <section aria-label="Compliance summary" className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <KpiTile label="Compliance rate" value={`${rate.toFixed(1)}%`} tone={rate >= 90 ? "success" : rate >= 75 ? "warning" : "danger"} hint="Compliant lines ÷ all lines. In band, or outside under an approved exception." />
        <KpiTile label="Lines outside band" value={outside.length.toLocaleString("en-GB")} tone="warning" hint={`of ${rows.length.toLocaleString("en-GB")} invoice lines`} />
        <KpiTile label="Covered by exception" value={covered.length.toLocaleString("en-GB")} tone="info" hint="Counted as compliant" to="/pricing/exceptions" linkLabel="View exceptions" />
        <KpiTile label="Net variance" value={money(varianceTotal, "GBP", 0)} tone="default" hint="Invoice minus reference, × quantity, lines outside band" />
      </section>

      <InfoBanner title="How variance is calculated">
        {band === "PRICE_LIST"
          ? `Reference is the approved price-list price, with ±${PRICE_LIST_TOLERANCE_PCT}% tolerance for rounding and approved promotions. Example: approved £100, invoiced £92 → variance −£8.00 (−8.0%).`
          : "Reference is the approved price; a line is only a variance when it falls outside the guardrail min–max band."}
      </InfoBanner>

      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <TableSection title="Policy adherence by rep">
          <DataTable<Adherence> caption="Policy adherence by sales rep" rows={byRep} rowKey={(a) => a.key} numbered={false} columns={adhCols("SALES_REP")} />
        </TableSection>
        <TableSection title="Policy adherence by region">
          <DataTable<Adherence> caption="Policy adherence by region" rows={byRegion} rowKey={(a) => a.key} numbered={false} columns={adhCols("REGION")} />
        </TableSection>
      </div>

      <TableSection
        title="Compliance by group"
        subtitle="Lowest compliance first."
        actions={<Segmented<GroupBy> value={by} onChange={(b) => set({ by: b === "CUSTOMER" ? undefined : b })} options={GROUP_BY.map((g) => ({ key: g, label: DIMENSION_LABEL[g] }))} />}
        className="mb-6"
      >
        <DataTable<Adherence>
          caption={`Compliance by ${DIMENSION_LABEL[by]}`}
          rows={groups}
          rowKey={(a) => a.key}
          pageSize={10}
          columns={[
            { key: "g", header: DIMENSION_LABEL[by], cell: (a) => <span className="font-medium">{a.label}</span> },
            { key: "n", header: "Lines", align: "right", cell: (a) => <span className="tabular-nums">{a.lines}</span> },
            { key: "c", header: <MetricLabel label="Compliance" definition="Compliant lines ÷ total lines. A line is compliant if inside the band or covered by an approved exception." />, align: "right", cell: (a) => pctCell(a.overall) },
            { key: "v", header: "Net variance", align: "right", cell: (a) => <span className="tabular-nums">{money(a.variance, "GBP", 0)}</span> },
          ]}
        />
      </TableSection>

      <TableSection
        title="Price variance report"
        subtitle={search.all ? "All invoice lines" : "Customers transacting outside the published band"}
        actions={<Toggle checked={!!search.all} onChange={(v) => set({ all: v || undefined })} label="Show compliant lines too" />}
      >
        <DataTable<ComplianceRow>
          caption="Price variance report"
          rows={[...report].sort((a, b) => a.variancePct - b.variancePct)}
          rowKey={(r) => r.id}
          pageSize={20}
          empty={<EmptyState icon={ArrowLeftRight} title="Every line is inside the band">No customer transacted outside the {band === "PRICE_LIST" ? "approved price list" : "guardrail band"} in {period.replace("2026-", "")} 2026.</EmptyState>}
          columns={[
            { key: "c", header: "Customer", cell: (r) => <RecordLink to="/pricing/customers/$id" params={{ id: r.customerId }}>{customerName(r.customerId)}</RecordLink> },
            { key: "p", header: "Product", cell: (r) => <span className="whitespace-nowrap">{productName(r.sku)}</span> },
            { key: "rep", header: "Rep", cell: (r) => <span className="whitespace-nowrap">{userName(r.salesRepId)}</span> },
            { key: "b", header: band === "PRICE_LIST" ? "Approved price" : "Band", align: "right", cell: (r) => <span className="tabular-nums">{band === "PRICE_LIST" ? money(r.reference) : `${money(r.bandLow)}–${money(r.bandHigh)}`}</span> },
            { key: "i", header: "Invoice price", align: "right", cell: (r) => <span className="tabular-nums">{money(r.invoice)}</span> },
            { key: "va", header: "Variance", align: "right", cell: (r) => <span className="tabular-nums">{r.varianceAmount < 0 ? "−" : r.varianceAmount > 0 ? "+" : ""}{money(Math.abs(r.varianceAmount))}</span> },
            { key: "vp", header: "Variance %", align: "right", cell: (r) => <span className="tabular-nums">{pct(r.variancePct)}</span> },
            {
              key: "s",
              header: "Status",
              cell: (r) =>
                !r.outside ? (
                  <Flag tone="success">In band</Flag>
                ) : r.coveredByException ? (
                  <span className="inline-flex flex-col gap-1">
                    <Flag tone="info">Covered by exception</Flag>
                    <span className="text-xs font-mono">{r.exceptionId}</span>
                  </span>
                ) : (
                  <Flag tone="danger">Outside band</Flag>
                ),
            },
          ]}
        />
      </TableSection>
    </PricingLayout>
  );
}
