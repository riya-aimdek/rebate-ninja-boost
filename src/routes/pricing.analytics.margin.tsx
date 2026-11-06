import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { BarChart3 } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Btn, Card, DataTable, DetailTitle, EmptyState, FilterPills, InfoBanner, KpiTile, LinkBtn, PricingLayout, money, type Column, TableSection } from "@/components/pricing/kit";
import { RequireAccess, pctBand } from "@/components/pricing/access";
import { DrillTrail, Freshness, MetricLabel } from "@/components/pricing/analytics-ui";
import { type Transaction } from "@/lib/pricing/deals";
import {
  DIMENSIONS,
  DIMENSION_LABEL,
  METRIC_DEFINITIONS,
  compactMoney,
  customerName,
  groupMetrics,
  keyOf,
  labelOf,
  metricsOf,
  productName,
  rlsNote,
  scopedTransactions,
  type Dimension,
  type Metrics,
} from "@/lib/pricing/analytics";
import { useSession } from "@/lib/pricing/session";
import { downloadCsv } from "@/lib/pricing/csv";

type Period = "ALL" | "2026-Q3" | "2026-Q2";
type Search = { dim?: Dimension; f?: string; region?: string; customer?: string; product?: string; period?: Period };

export const Route = createFileRoute("/pricing/analytics/margin")({
  head: () => ({ meta: [{ title: "Margin dashboard · Rebate Ninja" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    dim: typeof s.dim === "string" && (DIMENSIONS as readonly string[]).includes(s.dim) ? (s.dim as Dimension) : undefined,
    f: typeof s.f === "string" ? s.f : undefined,
    region: typeof s.region === "string" ? s.region : undefined,
    customer: typeof s.customer === "string" ? s.customer : undefined,
    product: typeof s.product === "string" ? s.product : undefined,
    period: s.period === "2026-Q3" || s.period === "2026-Q2" ? s.period : undefined,
  }),
  component: () => (
    <RequireAccess module="ANALYTICS">
      <Page />
    </RequireAccess>
  ),
});

const CLEAR = { f: undefined, region: undefined, customer: undefined, product: undefined };

function Page() {
  const search: Search = Route.useSearch();
  const navigate = useNavigate({ from: "/pricing/analytics/margin" });
  const set = (next: Partial<Search>) => navigate({ search: (s: Search) => ({ ...s, ...next }) });
  const { user, sees, access } = useSession();
  const dim: Dimension = search.dim ?? "REGION";
  const period: Period = search.period ?? "ALL";

  const scoped = useMemo(() => scopedTransactions(user), [user]);
  const [fDim, fKey] = (search.f ?? "").split(":") as [Dimension | "", string];
  const rows = scoped.filter(
    (t) =>
      (period === "ALL" || t.period === period) &&
      (!search.region || t.region === search.region) &&
      (!search.customer || t.customerId === search.customer) &&
      (!search.product || t.sku === search.product) &&
      (!fDim || keyOf(t, fDim) === fKey),
  );

  // Drill path: region → customer → product → transaction (US-AN-02 AC#1). State lives in the URL so Back works.
  const level: "GROUP" | "CUSTOMER" | "PRODUCT" | "TX" = search.product ? "TX" : search.customer ? "PRODUCT" : search.region || search.f ? "CUSTOMER" : "GROUP";
  const groupDim: Dimension = level === "GROUP" ? dim : level === "CUSTOMER" ? "CUSTOMER" : "PRODUCT";
  const groups = level === "TX" ? [] : groupMetrics(rows, groupDim);
  const total = metricsOf(rows);

  const open = (key: string) => {
    if (groupDim === "REGION") set({ region: key });
    else if (groupDim === "CUSTOMER") set({ customer: key });
    else if (groupDim === "PRODUCT") set({ product: key });
    else set({ f: `${groupDim}:${key}` });
  };

  const trail = [
    { label: `All ${DIMENSION_LABEL[dim].toLowerCase()}s`, apply: CLEAR },
    ...(search.region ? [{ label: search.region, apply: { customer: undefined, product: undefined } }] : []),
    ...(fDim ? [{ label: `${DIMENSION_LABEL[fDim]}: ${labelOf(fKey, fDim)}`, apply: { customer: undefined, product: undefined } }] : []),
    ...(search.customer ? [{ label: customerName(search.customer), apply: { product: undefined } }] : []),
    ...(search.product ? [{ label: productName(search.product), apply: {} }] : []),
  ];

  const showGM = sees("marginAmount");
  const pctAccess = access("marginPct");
  const gmPct = (m: Metrics) => (pctAccess === "SHOW" ? `${m.grossMarginPct.toFixed(1)}%` : pctAccess === "ROUND" ? pctBand(m.grossMarginPct) : null);

  const exportCsv = () =>
    downloadCsv(
      "margin-dashboard.csv",
      (level === "TX" ? rows.map((t) => metricsOf([t], t.id, t.id)) : groups).map((m) => ({
        group: m.label,
        revenue: m.revenue.toFixed(2),
        volume: m.volume,
        ...(showGM ? { grossMargin: m.grossMargin.toFixed(2), pocketMargin: m.pocketMargin.toFixed(2) } : {}),
        ...(gmPct(m) ? { grossMarginPct: gmPct(m) } : {}),
        priceRealizationPct: m.priceRealization.toFixed(1),
        discountPct: m.discountPct.toFixed(1),
      })),
    );

  const cols: Column<Metrics>[] = [
    { key: "g", header: DIMENSION_LABEL[groupDim], cell: (m) => <span className="font-medium text-brand-strong">{m.label}</span> },
    { key: "r", header: "Revenue", align: "right", cell: (m) => <span className="tabular-nums">{money(m.revenue, "GBP", 0)}</span> },
    { key: "v", header: "Volume", align: "right", cell: (m) => <span className="tabular-nums">{m.volume.toLocaleString("en-GB")}</span> },
    ...(showGM ? [{ key: "gm", header: "Gross margin", align: "right" as const, cell: (m: Metrics) => <span className="tabular-nums">{money(m.grossMargin, "GBP", 0)}</span> }] : []),
    ...(pctAccess !== "HIDE" ? [{ key: "gmp", header: "GM %", align: "right" as const, cell: (m: Metrics) => <span className="tabular-nums">{gmPct(m)}</span> }] : []),
    ...(showGM ? [{ key: "pm", header: "Pocket margin", align: "right" as const, cell: (m: Metrics) => <span className="tabular-nums">{money(m.pocketMargin, "GBP", 0)}</span> }] : []),
    { key: "pr", header: "Price realization", align: "right", cell: (m) => <span className="tabular-nums">{m.priceRealization.toFixed(1)}%</span> },
    { key: "d", header: "Discount %", align: "right", cell: (m) => <span className="tabular-nums">{m.discountPct.toFixed(1)}%</span> },
  ];

  const note = rlsNote(user);
  const chart = groups.slice(0, 10).map((g) => ({ name: g.label.length > 22 ? `${g.label.slice(0, 21)}…` : g.label, full: g.label, revenue: Math.round(g.revenue) }));

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Analytics & reporting" }, { label: "Margin dashboard" }]}>
      <DetailTitle
        title="Margin dashboard"
        subtitle="Margin, realization and discount by customer, product, region and rep — drill down to the transaction."
        actions={
          <>
            <Freshness />
            <Btn variant="outline" onClick={exportCsv} disabled={(level === "TX" ? rows : groups).length === 0}>
              Export CSV
            </Btn>
          </>
        }
      />
      {note && <InfoBanner title="Row-level security">{note}</InfoBanner>}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-2 empty:hidden">
        <FilterPills<Period>
          label="Period"
          multiple={false}
          clearable={false}
          selected={[period]}
          onChange={(v) => set({ period: v[0] === "ALL" ? undefined : v[0] })}
          options={[
            { key: "ALL", label: "Q2 + Q3 2026" },
            { key: "2026-Q3", label: "Q3 2026" },
            { key: "2026-Q2", label: "Q2 2026" },
          ]}
        />
      </div>

      <section aria-label="Key figures" className="grid gap-2 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] mb-6">
        <Kpi label="Revenue" def={METRIC_DEFINITIONS.revenue} value={compactMoney(total.revenue)} />
        <Kpi label="Volume" def={METRIC_DEFINITIONS.volume} value={total.volume.toLocaleString("en-GB")} hint="units" />
        {showGM && <Kpi label="Gross margin" def={METRIC_DEFINITIONS.grossMargin} value={compactMoney(total.grossMargin)} />}
        {pctAccess !== "HIDE" && <Kpi label="Gross margin %" def={METRIC_DEFINITIONS.grossMarginPct} value={gmPct(total) ?? ""} hint={pctAccess === "ROUND" ? "Shown as a band for your role" : undefined} />}
        {showGM && <Kpi label="Pocket margin" def={METRIC_DEFINITIONS.pocketMargin} value={compactMoney(total.pocketMargin)} />}
        <Kpi label="Realization %" def={METRIC_DEFINITIONS.priceRealization} value={`${total.priceRealization.toFixed(1)}%`} />
        <Kpi label="Discount %" def={METRIC_DEFINITIONS.discountPct} value={`${total.discountPct.toFixed(1)}%`} />
      </section>
      {!showGM && <p className="text-xs text-muted-foreground -mt-3 mb-6">Margin amounts are hidden for your role (field-level security).</p>}

      <DrillTrail steps={trail} onJump={(i) => set(trail[i].apply)} />

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={BarChart3} title="No transactions in this view" action={<Btn variant="subtle" onClick={() => set({ ...CLEAR, period: undefined })}>Reset view</Btn>}>
            Try another period or step back up the drill path.
          </EmptyState>
        </Card>
      ) : level === "TX" ? (
        <TxTable rows={rows} showCost={showGM} />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <Card
            title={`Revenue by ${DIMENSION_LABEL[groupDim].toLowerCase()}`}
            subtitle={groups.length > 10 ? "Top 10 shown — full list in the table" : undefined}
            actions={
              level === "GROUP" ? (
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">View by</span>
                  <select className="h-10 px-3 rounded-lg border border-input bg-card text-base" value={dim} onChange={(e) => set({ dim: e.target.value as Dimension, ...CLEAR })}>
                    {DIMENSIONS.map((d) => (
                      <option key={d} value={d}>
                        {DIMENSION_LABEL[d]}
                      </option>
                    ))}
                  </select>
                </label>
              ) : undefined
            }
          >
            <figure aria-label={`Revenue by ${DIMENSION_LABEL[groupDim]}: ${chart.map((c) => `${c.full} ${compactMoney(c.revenue)}`).join(", ")}`} style={{ height: chart.length * 36 + 48 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }} barCategoryGap={8}>
                  <CartesianGrid horizontal={false} stroke="var(--border)" />
                  <XAxis type="number" tickFormatter={compactMoney} tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} stroke="var(--border)" />
                  <YAxis type="category" dataKey="name" width={128} tick={{ fontSize: 12, fill: "var(--foreground)" }} stroke="var(--border)" />
                  <Tooltip
                    cursor={{ fill: "var(--muted)" }}
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
                          <div className="font-semibold">{(payload[0].payload as { full: string }).full}</div>
                          <div className="tabular-nums">Revenue {money(payload[0].value as number, "GBP", 0)}</div>
                        </div>
                      ) : null
                    }
                  />
                  <Bar dataKey="revenue" fill="var(--brand)" radius={[0, 4, 4, 0]} isAnimationActive={false} onClick={(d: { payload?: { full: string } }) => {
                    const g = groups.find((x) => x.label === d.payload?.full);
                    if (g) open(g.key);
                  }} cursor="pointer" />
                </BarChart>
              </ResponsiveContainer>
            </figure>
          </Card>
          <TableSection title="Breakdown" subtitle="Select a row to drill down.">
            <DataTable<Metrics> caption={`Margin by ${DIMENSION_LABEL[groupDim]}`} rows={groups} rowKey={(m) => m.key} onRowClick={(m) => open(m.key)} pageSize={15} columns={cols} />
          </TableSection>
        </div>
      )}
    </PricingLayout>
  );
}

function Kpi({ label, def, value, hint }: { label: string; def: string; value: string; hint?: string }) {
  return <KpiTile label={<MetricLabel label={label} definition={def} />} name={label} value={value} hint={hint} tone="default" />;
}

function TxTable({ rows, showCost }: { rows: Transaction[]; showCost: boolean }) {
  return (
    <TableSection title="Transactions" subtitle="Invoice lines from ERP billing. Open one in the price waterfall to see every component.">
      <DataTable<Transaction>
        caption="Transactions"
        rows={[...rows].sort((a, b) => b.invoiceDate.localeCompare(a.invoiceDate))}
        rowKey={(t) => t.id}
        pageSize={20}
        columns={[
          { key: "id", header: "Transaction", cell: (t) => <span className="font-mono text-xs">{t.id}</span> },
          { key: "d", header: "Invoice date", cell: (t) => <span className="tabular-nums whitespace-nowrap">{t.invoiceDate}</span> },
          { key: "q", header: "Qty", align: "right", cell: (t) => <span className="tabular-nums">{t.qty.toLocaleString("en-GB")}</span> },
          { key: "l", header: "List", align: "right", cell: (t) => <span className="tabular-nums">{money(t.list)}</span> },
          { key: "i", header: "Invoice", align: "right", cell: (t) => <span className="tabular-nums">{money(t.invoice)}</span> },
          { key: "p", header: "Pocket", align: "right", cell: (t) => <span className="tabular-nums">{money(t.pocket)}</span> },
          ...(showCost ? [{ key: "c", header: "Cost", align: "right" as const, cell: (t: Transaction) => <span className="tabular-nums">{money(t.cost)}</span> }] : []),
          {
            key: "w",
            header: <span className="sr-only">Actions</span>,
            cell: (t) => (
              <LinkBtn to="/pricing/analytics/waterfall" search={{ tx: t.id }} variant="subtle" size="sm">
                Waterfall
              </LinkBtn>
            ),
          },
        ]}
      />
    </TableSection>
  );
}

