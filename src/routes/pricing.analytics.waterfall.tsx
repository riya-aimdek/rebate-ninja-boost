import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useId, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Settings2, Trash2, Waves } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  Btn,
  Card,
  DataTable,
  DetailTitle,
  EmptyState,
  ErrorBanner,
  Field,
  FilterPills,
  Flag,
  InfoBanner,
  KpiTile,
  Modal,
  PricingLayout,
  RecordLink,
  Segmented,
  Tag,
  humanize,
  inputCls,
  money,
  notifySuccess,
  pct,
  type ApiError,
  MissingHint,
  missingFields,
  TableSection,
} from "@/components/pricing/kit";
import { RequireAccess } from "@/components/pricing/access";
import { ChartLegend, DrillTrail, Freshness } from "@/components/pricing/analytics-ui";
import { WATERFALL_DEFINITION, WATERFALL_SOURCES, quoteById, waterfallOf, type Transaction, type WaterfallLevel } from "@/lib/pricing/deals";
import { DIMENSION_LABEL, customerName, keyOf, labelOf, productName, rlsNote, scopedTransactions, type Dimension } from "@/lib/pricing/analytics";
import { useSession } from "@/lib/pricing/session";
import { downloadCsv } from "@/lib/pricing/csv";

type Search = { tx?: string; customer?: string; product?: string; channel?: string; quote?: string; period?: "2026-Q3" | "2026-Q2"; group?: Dimension };

export const Route = createFileRoute("/pricing/analytics/waterfall")({
  head: () => ({ meta: [{ title: "Price waterfall · Rebate Ninja" }] }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    tx: typeof s.tx === "string" ? s.tx : undefined,
    customer: typeof s.customer === "string" ? s.customer : undefined,
    product: typeof s.product === "string" ? s.product : undefined,
    channel: typeof s.channel === "string" ? s.channel : undefined,
    quote: typeof s.quote === "string" ? s.quote : undefined,
    period: s.period === "2026-Q2" || s.period === "2026-Q3" ? s.period : undefined,
    group: typeof s.group === "string" && ["CUSTOMER", "PRODUCT", "CHANNEL", "REGION", "SALES_REP"].includes(s.group) ? (s.group as Dimension) : undefined,
  }),
  component: () => (
    <RequireAccess module="ANALYTICS">
      <Page />
    </RequireAccess>
  ),
});

const GROUPS: Dimension[] = ["CUSTOMER", "PRODUCT", "CHANNEL", "REGION", "SALES_REP"];
const KIND_LABEL: Record<WaterfallLevel["kind"], string> = {
  LIST_PRICE: "List price",
  ON_INVOICE: "On-invoice deduction",
  SUBTOTAL_INVOICE: "Invoice subtotal",
  OFF_INVOICE: "Off-invoice item",
  SUBTOTAL_POCKET: "Pocket subtotal",
  COST: "Cost",
  SUBTOTAL_MARGIN: "Margin subtotal",
};
const SOURCE_LABEL: Record<(typeof WATERFALL_SOURCES)[number], string> = {
  PRICE_ENGINE: "Price engine",
  ERP_BILLING: "ERP billing",
  REBATE_NINJA: "Rebate Ninja",
  COST_MASTER: "Cost master",
};
const isTotal = (k: WaterfallLevel["kind"]) => k === "LIST_PRICE" || k.startsWith("SUBTOTAL");
// Cost isn't leakage, so it gets its own colour rather than the deduction orange.
const COLORS = { total: "var(--navy)", down: "var(--brand)", up: "var(--success)", cost: "var(--muted-foreground)" };
const round2 = (n: number) => Math.round(n * 100) / 100;
/** Levels are shown as they move the price: totals plain, deductions "−£0.27", additions "+£0.08". */
const signed = (s: Pick<Step, "dir" | "amount">) => (s.dir === "total" ? money(s.amount) : `${(s.amount ?? 0) >= 0 ? "+" : "−"}${money(Math.abs(s.amount ?? 0))}`);

type Step = { key: string; label: string; kind: WaterfallLevel["kind"]; source: string; amount: number | null; running: number; base: number; size: number; dir: "total" | "down" | "up" | "cost"; available: boolean; derived?: boolean; reason?: string };

/** Turns a definition + waterfall values into floating-bar steps. Missing components are disclosed, never hidden. */
function buildSteps(def: WaterfallLevel[], wf: ReturnType<typeof waterfallOf>, rows: Transaction[]): Step[] {
  const values = wf as unknown as Record<string, number>;
  let running = 0;
  // Each average is rounded to the penny, so a subtotal may differ from its parts by up to half a penny per part.
  let parts = 0;
  const steps: Step[] = [];
  for (const l of def) {
    const raw = values[l.key];
    const hasFeed = typeof raw === "number";
    let reason: string | undefined;
    let available = hasFeed;
    if (!hasFeed) reason = "No source feed is mapped to this level yet.";
    if (l.key === "rebate" && wf.rebateMissing > 0) {
      available = false;
      reason = `Rebate data not yet received from Rebate Ninja for ${wf.rebateMissing} of ${rows.length} transaction${rows.length === 1 ? "" : "s"}${wf.rebateMissing === rows.length ? "" : " — shown for the rest"}.`;
    }
    const v = hasFeed ? raw : 0;
    if (isTotal(l.kind)) {
      if (l.kind === "LIST_PRICE") running = v;
      else if (hasFeed) {
        // Subtotals show the reported figure, so they match the summary. When the levels above don't add up to it
        // (e.g. lines priced below list minus the recorded discounts), the gap is shown as its own step.
        const gap = round2(v - running);
        if (Math.abs(gap) > 0.005 * (parts + 1) + 1e-9) {
          const before = running;
          running = v;
          steps.push({
            key: `${l.key}-gap`,
            label: gap < 0 ? "Unrecorded deductions" : "Unrecorded additions",
            kind: l.kind === "SUBTOTAL_INVOICE" ? "ON_INVOICE" : "OFF_INVOICE",
            source: "Derived",
            amount: gap,
            running,
            base: Math.min(before, running),
            size: Math.abs(gap),
            dir: gap < 0 ? "down" : "up",
            available: true,
            derived: true,
            reason: `${l.label} is ${money(Math.abs(gap))} ${gap < 0 ? "lower" : "higher"} than the levels above add up to — some lines were priced outside the recorded discounts.`,
          });
        }
        running = v;
      }
      parts = 0;
      steps.push({ key: l.key, label: l.label, kind: l.kind, source: SOURCE_LABEL[l.source], amount: running, running, base: 0, size: running, dir: "total", available, reason });
      continue;
    }
    // Freight is signed as in the SRS example (+ recovered); every other component is an amount taken off.
    const delta = l.key === "freight" ? v : -v;
    parts += 1;
    const before = running;
    running = before + delta;
    steps.push({ key: l.key, label: l.label, kind: l.kind, source: SOURCE_LABEL[l.source], amount: delta, running, base: Math.min(before, running), size: Math.abs(delta), dir: l.kind === "COST" ? "cost" : delta >= 0 ? "up" : "down", available, reason });
  }
  return steps;
}

function Page() {
  const search: Search = Route.useSearch();
  const navigate = useNavigate({ from: "/pricing/analytics/waterfall" });
  const { user, sees } = useSession();
  const setSearch = (next: Partial<Search>) => navigate({ search: (s: Search) => ({ ...s, ...next }) });

  const all = useMemo(() => scopedTransactions(user), [user]);
  const quote = search.quote ? quoteById(search.quote) : undefined;
  const customer = search.customer ?? quote?.customerId;
  const period: "2026-Q3" | "2026-Q2" = search.period ?? "2026-Q3";
  const group: Dimension = search.group ?? "CUSTOMER";
  const single = search.tx ? all.find((t) => t.id === search.tx) : undefined;

  const [def, setDef] = useState<WaterfallLevel[]>(WATERFALL_DEFINITION);
  const [editing, setEditing] = useState(false);

  // Cost and pocket-margin rows are field-level secured; pocket price always shows (US-AN-01 AC#6).
  const visibleDef = def.filter((l) => !l.secure || sees(l.secure));
  const hiddenRows = def.length - visibleDef.length;

  const filtered = (p: string) =>
    all.filter((t) => t.period === p && (!customer || t.customerId === customer) && (!search.product || t.sku === search.product) && (!search.channel || t.channel === search.channel));
  const rows = single ? [single] : filtered(period);
  const wf = waterfallOf(rows);
  const steps = buildSteps(visibleDef, wf, rows);
  const prior = filtered(period === "2026-Q3" ? "2026-Q2" : "2026-Q3");
  const prevSteps = buildSteps(visibleDef, waterfallOf(prior), prior);

  const scopeLabel = single
    ? `${single.id} · ${customerName(single.customerId)} · ${productName(single.sku)}`
    : [customer && customerName(customer), search.product && productName(search.product), search.channel].filter(Boolean).join(" · ") || "All transactions in scope";

  const trail = [
    { label: "All transactions", apply: { customer: undefined, product: undefined, channel: undefined, tx: undefined, quote: undefined } },
    ...(customer ? [{ label: customerName(customer), apply: { product: undefined, channel: undefined, tx: undefined } }] : []),
    ...(search.product ? [{ label: productName(search.product), apply: { channel: undefined, tx: undefined } }] : []),
    ...(search.channel ? [{ label: search.channel, apply: { tx: undefined } }] : []),
    ...(single ? [{ label: single.id, apply: {} }] : []),
  ];

  /* Leakage by group (FR-G-07) */
  const groups = useMemo(() => {
    const m = new Map<string, Transaction[]>();
    for (const t of filtered(period)) m.set(keyOf(t, group), [...(m.get(keyOf(t, group)) ?? []), t]);
    return [...m.entries()]
      .map(([k, rs]) => {
        const w = waterfallOf(rs);
        return { key: k, label: labelOf(k, group), lines: rs.length, list: w.list, pocket: w.pocket, leakagePct: w.leakagePct, leakageTotal: rs.reduce((a, t) => a + (t.list - t.pocket) * t.qty, 0) };
      })
      .sort((a, b) => b.leakageTotal - a.leakageTotal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [all, period, group, customer, search.product, search.channel]);

  const drill = (k: string) => {
    if (group === "CUSTOMER") setSearch({ customer: k, tx: undefined });
    else if (group === "PRODUCT") setSearch({ product: k, tx: undefined });
    else if (group === "CHANNEL") setSearch({ channel: k, tx: undefined });
    else setSearch({ group: group === "REGION" ? "CUSTOMER" : "PRODUCT", tx: undefined });
  };

  const exportCsv = () =>
    downloadCsv(
      "price-waterfall.csv",
      steps.map((s) => ({ level: s.label, kind: s.kind, source: s.source, amount: s.amount?.toFixed(2), running: s.running.toFixed(2), availability: s.derived ? "UNEXPLAINED" : s.available ? "AVAILABLE" : "UNAVAILABLE", reason: s.reason ?? "" })),
    );

  const note = rlsNote(user);
  const chartData = steps.map((s) => ({ ...s, label: s.label }));

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Analytics & reporting" }, { label: "Price waterfall" }]}>
      <DetailTitle
        title="Price waterfall"
        subtitle="Every step from list price to pocket price and margin, so you can see where margin leaks."
        actions={
          <>
            <Freshness />
            {/* Only pricing administrators change the definition; others don't get a dead button. */}
            {user.role === "PRICING_ADMIN" && (
              <Btn variant="subtle" icon={Settings2} onClick={() => setEditing(true)}>
                Edit definition
              </Btn>
            )}
            <Btn variant="outline" onClick={exportCsv}>
              Export CSV
            </Btn>
          </>
        }
      />
      {note && <InfoBanner title="Row-level security">{note}</InfoBanner>}
      {quote && (
        <InfoBanner title={`Opened from quote ${quote.id}`} action={<RecordLink to="/pricing/quotes/$id" params={{ id: quote.id }}>Back to quote</RecordLink>}>
          Showing invoiced history for {customerName(quote.customerId)} — the quote itself has not been invoiced yet.
        </InfoBanner>
      )}

      {/* Same scope row as the margin dashboard: period pills, then the narrower picker inline. */}
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 mb-4">
        <FilterPills<Search["period"] & string>
          label="Period"
          multiple={false}
          clearable={false}
          className=""
          selected={[single?.period ?? period]}
          onChange={(v) => setSearch({ period: v[0], tx: undefined })}
          options={[
            { key: "2026-Q3", label: "Q3 2026" },
            { key: "2026-Q2", label: "Q2 2026" },
          ]}
        />
        <label className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Transaction</span>
          <select
            className={`${inputCls} w-80`}
            value={search.tx ?? ""}
            // Picking a transaction moves the period to its quarter, so the two never disagree.
            onChange={(e) => {
              const t = all.find((x) => x.id === e.target.value);
              setSearch({ tx: t?.id, ...(t ? { period: t.period as Search["period"] } : {}) });
            }}
          >
            <option value="">All transactions</option>
            {filtered(period)
              .slice(0, 200)
              .concat(single && single.period !== period ? [single] : [])
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} · {customerName(t.customerId)} · {t.sku}
                </option>
              ))}
          </select>
        </label>
      </div>

      <DrillTrail steps={trail} onJump={(i) => setSearch(trail[i].apply)} />

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Waves} title="No transactions match" action={<Btn variant="subtle" onClick={() => setSearch({ customer: undefined, product: undefined, channel: undefined, tx: undefined, quote: undefined })}>Clear filters</Btn>}>
            {note ? "Your access covers only your own customers. " : ""}Try another period or remove a filter.
          </EmptyState>
        </Card>
      ) : (
        <>
          {/* Headline numbers first; the chart below shows how they connect. */}
          <section aria-label="Key figures" className="grid gap-2 grid-cols-2 sm:grid-cols-[repeat(auto-fit,minmax(8.5rem,1fr))] mb-6">
            <KpiTile tone="default" label="List price" value={money(wf.list)} hint="per unit" />
            <KpiTile tone="default" label="Invoice price" value={money(wf.invoice)} hint="per unit" />
            <KpiTile tone="default" label="Pocket price" value={money(wf.pocket)} hint="per unit" />
            <KpiTile tone="default" label="Leakage" value={`${wf.leakagePct.toFixed(1)}%`} hint={`${money(wf.leakage)} of list lost`} />
            {sees("marginAmount") && <KpiTile tone="default" label="Pocket margin" value={`${wf.pocket ? ((wf.pocketMargin / wf.pocket) * 100).toFixed(1) : "0.0"}%`} hint={`${money(wf.pocketMargin)} per unit`} />}
          </section>

          <div className={`grid grid-cols-1 gap-6 mb-6 items-start ${single ? "" : "xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]"}`}>
            <Card
              title="List to pocket"
              subtitle={single ? `${scopeLabel} · ${single.invoiceDate} · per unit` : `${scopeLabel} · ${period.replace("2026-", "")} 2026 · per unit, units-weighted across ${rows.length.toLocaleString("en-GB")} line${rows.length === 1 ? "" : "s"}`}
            >
              {hiddenRows > 0 && (
                <InfoBanner tone="neutral" title="Cost and pocket margin hidden">
                  Your role can't see cost data, so the cost and pocket-margin levels are not shown. Pocket price is shown.
                </InfoBanner>
              )}
              <figure aria-label={`Waterfall: ${steps.map((s) => `${s.label} ${signed(s)}`).join(", ")}`} style={{ height: steps.length * 40 + 48 }} className="w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 72, bottom: 4, left: 4 }} barCategoryGap={6}>
                        <CartesianGrid horizontal={false} stroke="var(--border)" />
                        <XAxis type="number" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => money(v, "GBP", 0)} stroke="var(--border)" />
                        <YAxis type="category" dataKey="label" width={140} tick={{ fontSize: 12, fill: "var(--foreground)" }} stroke="var(--border)" />
                        <Tooltip
                          cursor={{ fill: "var(--muted)" }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const s = payload[0].payload as Step;
                            return (
                              <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
                                <div className="font-semibold">{s.label}</div>
                                <div className="tabular-nums">
                                  {signed(s)} · running {money(s.running)}
                                </div>
                                <div className="text-muted-foreground">Source: {s.source}</div>
                                {(!s.available || s.derived) && <div className="text-warning-foreground">{s.reason}</div>}
                              </div>
                            );
                          }}
                        />
                        <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
                        <Bar dataKey="size" stackId="w" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                          {chartData.map((s) => (
                            <Cell key={s.key} fill={COLORS[s.dir]} fillOpacity={s.available ? 1 : 0.45} stroke="var(--card)" strokeWidth={2} />
                          ))}
                          <LabelList
                            dataKey="amount"
                            position="right"
                            className="tabular-nums"
                            // The bar's white outline is inherited; paint it under the glyphs or it erases 12px text.
                            style={{ fontSize: 12, fill: "var(--foreground)", paintOrder: "stroke" }}
                            formatter={(v: number) => (v === null || v === undefined ? "" : `${v < 0 ? "−" : ""}${money(Math.abs(v))}`)}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
              </figure>
              <div className="mt-3">
                <ChartLegend
                  items={[
                    { label: "Price level / subtotal", color: COLORS.total },
                    { label: "Deduction (leakage)", color: COLORS.down },
                    ...(steps.some((s) => s.dir === "up") ? [{ label: "Addition", color: COLORS.up }] : []),
                    ...(steps.some((s) => s.dir === "cost") ? [{ label: "Cost", color: COLORS.cost }] : []),
                  ]}
                />
              </div>
              {steps.some((st) => !st.available || st.derived) && (
                <div className="mt-5 space-y-2">
                  {steps
                    .filter((st) => !st.available || st.derived)
                    .map((st) => (
                      <InfoBanner key={st.key} tone="warning" title={`${st.label}: ${st.derived ? "not explained" : "partly missing"}`}>
                        {st.reason}
                      </InfoBanner>
                    ))}
                </div>
              )}
            </Card>

              {/* A single transaction has nothing to compare against, so the bridge only shows for a group. */}
              {!single && (
              <Card title="Price bridge" subtitle={single ? undefined : `Each step as % of list price, ${period === "2026-Q3" ? "Q2 vs Q3" : "Q3 vs Q2"} 2026 — not skewed by product mix`}>
                {single || prior.length === 0 ? (
                  <p className="text-base text-muted-foreground">{single ? "Clear the transaction to compare this group with the prior period." : "No transactions in the comparison period."}</p>
                ) : (
                  <BridgeTable cur={steps} prev={prevSteps} period={period} />
                )}
              </Card>
              )}
          </div>

          {!single && (
            <TableSection
              title="Leakage by group"
              subtitle="Where the gap between list and pocket price is largest. Select a row to drill in."
              actions={
                <Segmented<Dimension>
                  value={group}
                  onChange={(g) => setSearch({ group: g })}
                  options={GROUPS.filter((g) => !(g === "CUSTOMER" && customer) && !(g === "PRODUCT" && search.product) && !(g === "CHANNEL" && search.channel)).map((g) => ({ key: g, label: DIMENSION_LABEL[g] }))}
                />
              }
            >
              <DataTable
                caption={`Leakage by ${DIMENSION_LABEL[group].toLowerCase()}`}
                rows={groups}
                rowKey={(g) => g.key}
                onRowClick={(g) => drill(g.key)}
                pageSize={10}
                columns={[
                  { key: "g", header: DIMENSION_LABEL[group], cell: (g) => <span className="font-medium text-brand-strong">{g.label}</span> },
                  { key: "n", header: "Lines", align: "right", cell: (g) => <span className="tabular-nums">{g.lines}</span> },
                  { key: "l", header: "Avg list", align: "right", cell: (g) => <span className="tabular-nums">{money(g.list)}</span> },
                  { key: "p", header: "Avg pocket", align: "right", cell: (g) => <span className="tabular-nums">{money(g.pocket)}</span> },
                  { key: "lp", header: "Leakage %", align: "right", cell: (g) => <span className="tabular-nums">{g.leakagePct.toFixed(1)}%</span> },
                  { key: "lt", header: "Leakage £", align: "right", cell: (g) => <span className="tabular-nums font-semibold">{money(g.leakageTotal, "GBP", 0)}</span> },
                ]}
              />
            </TableSection>
          )}
        </>
      )}

      <DefinitionEditor open={editing} def={def} onClose={() => setEditing(false)} onSave={(d) => setDef(d)} />
    </PricingLayout>
  );
}

/**
 * Each step as a share of that period's list price, so a different product mix (cheaper or dearer items)
 * doesn't look like a pricing change. List price itself stays in £ for context.
 */
function BridgeTable({ cur, prev, period }: { cur: Step[]; prev: Step[]; period: string }) {
  const listOf = (st: Step[]) => Math.abs(st[0]?.amount ?? 0) || 1;
  const curList = listOf(cur);
  const prevList = listOf(prev);
  const keys = [...cur.map((s) => s.key), ...prev.map((s) => s.key).filter((k) => !cur.some((s) => s.key === k))];
  const rows = keys.map((k, i) => {
    const c = cur.find((s) => s.key === k);
    const p = prev.find((s) => s.key === k);
    const ref = (c ?? p)!;
    // A level missing in one period (e.g. no unrecorded deductions) counts as zero there.
    const now = ((c?.amount ?? 0) / curList) * 100;
    const before = ((p?.amount ?? 0) / prevList) * 100;
    return { key: k, label: ref.label, isList: i === 0, now, before, change: now - before, total: ref.dir === "total" };
  });
  const [a, b] = period === "2026-Q3" ? ["Q2", "Q3"] : ["Q3", "Q2"];
  const fmt = (v: number) => `${v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}%`;
  return (
    <div className="overflow-x-auto overflow-y-hidden -mx-2" role="region" aria-label="Price bridge" tabIndex={0}>
      <table className="w-full text-sm min-w-[320px]">
        <caption className="sr-only">Each waterfall step as a share of list price, {a} compared with {b}</caption>
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="text-left font-medium px-2 py-2">Step</th>
            <th scope="col" className="text-right font-medium px-2 py-2">{a}</th>
            <th scope="col" className="text-right font-medium px-2 py-2">{b}</th>
            <th scope="col" className="text-right font-medium px-2 py-2">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) =>
            r.isList ? (
              <tr key={r.key} className="font-semibold">
                <th scope="row" className="text-left font-semibold px-2 py-2">{r.label}</th>
                <td className="text-right tabular-nums px-2 py-2 whitespace-nowrap">{money(prevList)}</td>
                <td className="text-right tabular-nums px-2 py-2 whitespace-nowrap">{money(curList)}</td>
                <td className="text-right tabular-nums px-2 py-2 whitespace-nowrap text-xs font-normal text-muted-foreground">= 100%</td>
              </tr>
            ) : (
              <tr key={r.key} className={r.total ? "font-semibold" : ""}>
                <th scope="row" className={`text-left px-2 py-2 ${r.total ? "font-semibold" : "font-normal"}`}>{r.label}</th>
                <td className="text-right tabular-nums px-2 py-2 whitespace-nowrap">{fmt(r.before)}</td>
                <td className="text-right tabular-nums px-2 py-2 whitespace-nowrap">{fmt(r.now)}</td>
                <td className="text-right tabular-nums px-2 py-2 whitespace-nowrap">
                  {Math.abs(r.change) < 0.05 ? (
                    <span className="text-muted-foreground font-normal">No change</span>
                  ) : (
                    // Higher is better for every row: a smaller deduction or a bigger subtotal both move up.
                    <span className={`inline-flex items-center gap-1 ${r.change > 0 ? "text-success" : "text-destructive"}`}>
                      {r.change > 0 ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />}
                      {r.change > 0 ? "+" : "−"}
                      {Math.abs(r.change).toFixed(1)} pts
                      <span className="sr-only">{r.change > 0 ? "(better)" : "(worse)"}</span>
                    </span>
                  )}
                </td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  );
}

const KINDS = Object.keys(KIND_LABEL) as WaterfallLevel["kind"][];

/** Configurable, ordered levels (US-AN-01 AC#5): exactly one list-price level. */
function DefinitionEditor({ open, def, onClose, onSave }: { open: boolean; def: WaterfallLevel[]; onClose: () => void; onSave: (d: WaterfallLevel[]) => void }) {
  const [draft, setDraft] = useState<WaterfallLevel[]>(def);
  const [error, setError] = useState<ApiError | null>(null);
  const [lastOpen, setLastOpen] = useState(false);
  if (open && !lastOpen) {
    setDraft(def);
    setError(null);
    setLastOpen(true);
  } else if (!open && lastOpen) setLastOpen(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(def);
  const hintId = useId();
  const missing = missingFields(draft.map((l, i) => [`Label (level ${i + 1})`, l.label] as [string, unknown]));
  const update = (i: number, patch: Partial<WaterfallLevel>) => setDraft(draft.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const move = (i: number, d: -1 | 1) => {
    const next = [...draft];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setDraft(next);
  };
  const save = () => {
    const lists = draft.filter((l) => l.kind === "LIST_PRICE").length;
    if (lists !== 1 || draft[0]?.kind !== "LIST_PRICE") {
      setError({ errorClass: "VALIDATION", code: "WATERFALL_DEFINITION_INVALID", message: lists > 1 ? `The definition has ${lists} list-price levels. Keep exactly one, as the first level.` : "The first level must be the single list-price level.", field: "levels" });
      return;
    }
    if (draft.some((l) => !l.label.trim())) {
      setError({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Every level needs a label.", field: "levels[].label" });
      return;
    }
    onSave(draft);
    onClose();
    notifySuccess("Waterfall definition saved", "Applies to every waterfall and bridge view.");
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      dismissible={!dirty}
      title="Waterfall definition"
      subtitle="Levels are applied in this order. Components must reconcile to invoice, pocket price and pocket margin."
      footer={
        <>
          <MissingHint id={hintId} missing={missing} />
          <Btn variant="subtle" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={save} disabled={missing.length > 0} aria-describedby={missing.length ? hintId : undefined}>
            Save definition
          </Btn>
        </>
      }
    >
      <ErrorBanner error={error} onClose={() => setError(null)} note="The definition was not changed." />
      <ol className="space-y-3">
        {draft.map((l, i) => (
          <li key={`${l.key}-${i}`} className="grid grid-cols-1 sm:grid-cols-[2rem_1fr_1fr_auto] items-end gap-3 border-b border-border pb-3">
            <span className="text-sm text-muted-foreground tabular-nums sm:pb-2.5">{i + 1}</span>
            <Field label="Label" required>
              <input className={inputCls} value={l.label} onChange={(e) => update(i, { label: e.target.value })} />
            </Field>
            <Field label="Kind">
              <select className={inputCls} value={l.kind} onChange={(e) => update(i, { kind: e.target.value as WaterfallLevel["kind"] })}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABEL[k]}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex gap-1">
              <Btn variant="ghost" size="sm" icon={ArrowUp} aria-label={`Move ${l.label} up`} disabled={i === 0} onClick={() => move(i, -1)} />
              <Btn variant="ghost" size="sm" icon={ArrowDown} aria-label={`Move ${l.label} down`} disabled={i === draft.length - 1} onClick={() => move(i, 1)} />
              <Btn variant="ghost" size="sm" icon={Trash2} aria-label={`Remove ${l.label}`} disabled={draft.length <= 2} onClick={() => setDraft(draft.filter((_, j) => j !== i))} />
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Btn variant="outline" icon={Plus} onClick={() => setDraft([...draft, { key: `custom${draft.length}`, label: "Payment terms", kind: "OFF_INVOICE", source: "ERP_BILLING" }])}>
          Add level
        </Btn>
        <span className="text-xs text-muted-foreground">New levels show as unavailable until a source feed is mapped.</span>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Sources: {WATERFALL_SOURCES.map((s) => SOURCE_LABEL[s]).join(", ")}. <Tag>{humanize("LIST_PRICE")}</Tag> must appear once.
      </p>
    </Modal>
  );
}
