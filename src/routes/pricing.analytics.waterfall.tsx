import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
  Flag,
  InfoBanner,
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
const COLORS = { total: "var(--navy)", down: "var(--brand)", up: "var(--success)" };

type Step = { key: string; label: string; kind: WaterfallLevel["kind"]; source: string; amount: number | null; running: number; base: number; size: number; dir: "total" | "down" | "up"; available: boolean; reason?: string };

/** Turns a definition + waterfall values into floating-bar steps. Missing components are disclosed, never hidden. */
function buildSteps(def: WaterfallLevel[], wf: ReturnType<typeof waterfallOf>, rows: Transaction[]): Step[] {
  const values = wf as unknown as Record<string, number>;
  let running = 0;
  return def.map((l) => {
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
      return { key: l.key, label: l.label, kind: l.kind, source: SOURCE_LABEL[l.source], amount: running, running, base: 0, size: running, dir: "total", available, reason };
    }
    // Freight is signed as in the SRS example (+ recovered); every other component is an amount taken off.
    const delta = l.key === "freight" ? v : -v;
    const before = running;
    running = before + delta;
    return { key: l.key, label: l.label, kind: l.kind, source: SOURCE_LABEL[l.source], amount: delta, running, base: Math.min(before, running), size: Math.abs(delta), dir: delta >= 0 ? "up" : "down", available, reason };
  });
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
  const prev = waterfallOf(prior);

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
      steps.map((s) => ({ level: s.label, kind: s.kind, source: s.source, amount: s.amount?.toFixed(2), running: s.running.toFixed(2), availability: s.available ? "AVAILABLE" : "UNAVAILABLE", reason: s.reason ?? "" })),
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
            <Btn variant="subtle" icon={Settings2} onClick={() => setEditing(true)} disabled={user.role !== "PRICING_ADMIN"} title={user.role !== "PRICING_ADMIN" ? "Only pricing administrators can change the definition" : undefined}>
              Edit definition
            </Btn>
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

      <DrillTrail steps={trail} onJump={(i) => setSearch(trail[i].apply)} />

      <div className="flex flex-wrap items-end gap-4 mb-6">
        <Field label="Transaction" className="w-full sm:w-80">
          <select className={inputCls} value={search.tx ?? ""} onChange={(e) => setSearch({ tx: e.target.value || undefined })}>
            <option value="">Group view — all matching transactions</option>
            {filtered(period)
              .slice(0, 200)
              .concat(single && single.period !== period ? [single] : [])
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.id} · {customerName(t.customerId)} · {t.sku}
                </option>
              ))}
          </select>
        </Field>
        <Field label="Period" className="w-full sm:w-48">
          <select className={inputCls} value={period} onChange={(e) => setSearch({ period: e.target.value as Search["period"], tx: undefined })} disabled={!!single}>
            <option value="2026-Q3">Q3 2026 (Jul–Sep)</option>
            <option value="2026-Q2">Q2 2026 (Apr–Jun)</option>
          </select>
        </Field>
      </div>

      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={Waves} title="No transactions match" action={<Btn variant="subtle" onClick={() => setSearch({ customer: undefined, product: undefined, channel: undefined, tx: undefined, quote: undefined })}>Clear filters</Btn>}>
            {note ? "Your access covers only your own customers. " : ""}Try another period or remove a filter.
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] mb-6">
            <Card
              title="List to pocket"
              subtitle={`${scopeLabel} · ${single ? single.invoiceDate : period.replace("2026-", "") + " 2026"} · per unit, units-weighted across ${rows.length.toLocaleString("en-GB")} line${rows.length === 1 ? "" : "s"}`}
            >
              {hiddenRows > 0 && (
                <InfoBanner tone="neutral" title="Cost and pocket margin hidden">
                  Your role can't see cost data, so the cost and pocket-margin levels are not shown. Pocket price is shown.
                </InfoBanner>
              )}
              <>
                  <figure aria-label={`Waterfall: ${steps.map((s) => `${s.label} ${money(s.amount)}`).join(", ")}`} style={{ height: steps.length * 40 + 48 }} className="w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} layout="vertical" margin={{ top: 4, right: 72, bottom: 4, left: 4 }} barCategoryGap={6}>
                        <CartesianGrid horizontal={false} stroke="var(--border)" />
                        <XAxis type="number" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} tickFormatter={(v: number) => `£${v}`} stroke="var(--border)" />
                        <YAxis type="category" dataKey="label" width={118} tick={{ fontSize: 12, fill: "var(--foreground)" }} stroke="var(--border)" />
                        <Tooltip
                          cursor={{ fill: "var(--muted)" }}
                          content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const s = payload[0].payload as Step;
                            return (
                              <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-md">
                                <div className="font-semibold">{s.label}</div>
                                <div className="tabular-nums">
                                  {s.dir === "total" ? money(s.amount) : `${s.amount! >= 0 ? "+" : "−"}${money(Math.abs(s.amount ?? 0))}`} · running {money(s.running)}
                                </div>
                                <div className="text-muted-foreground">Source: {s.source}</div>
                                {!s.available && <div className="text-warning-foreground">{s.reason}</div>}
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
                            style={{ fontSize: 12, fill: "var(--foreground)" }}
                            formatter={(v: number) => (v === null || v === undefined ? "" : `${v < 0 ? "−" : ""}£${Math.abs(v).toFixed(2)}`)}
                          />
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </figure>
                  <div className="mt-3">
                    <ChartLegend items={[{ label: "Price level / subtotal", color: COLORS.total }, { label: "Deduction (leakage)", color: COLORS.down }, { label: "Addition", color: COLORS.up }]} />
                  </div>
              </>
              <div className="mt-5">
                  <DataTable<Step>
                    caption="Waterfall components"
                    rows={steps}
                    rowKey={(s) => s.key}
                    numbered={false}
                    rowClassName={(s) => (s.dir === "total" ? "font-semibold" : "")}
                    columns={[
                      { key: "l", header: "Level", cell: (s) => s.label },
                      { key: "a", header: "Amount", align: "right", cell: (s) => <span className="tabular-nums">{s.dir === "total" ? money(s.amount) : `${(s.amount ?? 0) >= 0 ? "+" : "−"}${money(Math.abs(s.amount ?? 0))}`}</span> },
                      { key: "src", header: "Source", cell: (s) => <span className="whitespace-nowrap text-muted-foreground">{s.source}</span> },
                      {
                        key: "av",
                        header: "Data",
                        cell: (s) =>
                          s.available ? (
                            <Flag tone="success">Available</Flag>
                          ) : (
                            <span className="inline-flex flex-col gap-1">
                              <Flag tone="warning">Unavailable</Flag>
                              <span className="text-xs text-muted-foreground max-w-56">{s.reason}</span>
                            </span>
                          ),
                      },
                    ]}
                  />
              </div>
            </Card>

            <div className="space-y-6">
              <Card title="Summary">
                <dl className="grid grid-cols-2 gap-4 text-sm">
                  {[
                    ["Invoice price", money(wf.invoice)],
                    ["Pocket price", money(wf.pocket)],
                    ["Leakage (list − pocket)", `${money(wf.leakage)} · ${wf.leakagePct.toFixed(1)}%`],
                    ...(sees("marginAmount") ? [["Pocket margin", money(wf.pocketMargin)]] : []),
                  ].map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="mt-1 text-lg font-semibold tabular-nums">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Card>
              <Card title="Price bridge" subtitle={single ? "Bridge compares groups — pick group view to compare periods." : `${period === "2026-Q3" ? "Q3 vs Q2" : "Q2 vs Q3"} 2026, same filters`}>
                {single || prior.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{single ? "Clear the transaction to compare this group with the prior period." : "No transactions in the comparison period."}</p>
                ) : (
                  <BridgeTable def={visibleDef} cur={wf} prev={prev} period={period} />
                )}
              </Card>
            </div>
          </div>

          {!single && (
            <Card
              title="Leakage by group"
              subtitle="Where the gap between list and pocket price is largest. Select a row to drill in."
              actions={
                <Segmented<Dimension>
                  value={group}
                  onChange={(g) => setSearch({ group: g })}
                  options={GROUPS.filter((g) => !(g === "CUSTOMER" && customer) && !(g === "PRODUCT" && search.product) && !(g === "CHANNEL" && search.channel)).map((g) => ({ key: g, label: DIMENSION_LABEL[g] }))}
                />
              }
              padded={false}
            >
              <DataTable
                caption={`Leakage by ${DIMENSION_LABEL[group].toLowerCase()}`}
                rows={groups}
                rowKey={(g) => g.key}
                onRowClick={(g) => drill(g.key)}
                pageSize={10}
                columns={[
                  { key: "g", header: DIMENSION_LABEL[group], cell: (g) => <span className="font-medium text-brand">{g.label}</span> },
                  { key: "n", header: "Lines", align: "right", cell: (g) => <span className="tabular-nums">{g.lines}</span> },
                  { key: "l", header: "Avg list", align: "right", cell: (g) => <span className="tabular-nums">{money(g.list)}</span> },
                  { key: "p", header: "Avg pocket", align: "right", cell: (g) => <span className="tabular-nums">{money(g.pocket)}</span> },
                  { key: "lp", header: "Leakage %", align: "right", cell: (g) => <span className="tabular-nums">{g.leakagePct.toFixed(1)}%</span> },
                  { key: "lt", header: "Leakage £", align: "right", cell: (g) => <span className="tabular-nums font-semibold">{money(g.leakageTotal, "GBP", 0)}</span> },
                ]}
              />
            </Card>
          )}
        </>
      )}

      <DefinitionEditor open={editing} def={def} onClose={() => setEditing(false)} onSave={(d) => setDef(d)} />
    </PricingLayout>
  );
}

function BridgeTable({ def, cur, prev, period }: { def: WaterfallLevel[]; cur: ReturnType<typeof waterfallOf>; prev: ReturnType<typeof waterfallOf>; period: string }) {
  const c = cur as unknown as Record<string, number>;
  const p = prev as unknown as Record<string, number>;
  const rows = def.filter((l) => typeof c[l.key] === "number").map((l) => ({ key: l.key, label: l.label, now: c[l.key], before: p[l.key], change: c[l.key] - p[l.key], total: isTotal(l.kind) }));
  const [a, b] = period === "2026-Q3" ? ["Q2", "Q3"] : ["Q3", "Q2"];
  return (
    <div className="overflow-x-auto -mx-2" role="region" aria-label="Price bridge" tabIndex={0}>
      <table className="w-full text-sm min-w-[320px]">
        <caption className="sr-only">Per-unit change in each waterfall component, {a} to {b}</caption>
        <thead>
          <tr className="text-muted-foreground">
            <th scope="col" className="text-left font-medium px-2 py-2">Component</th>
            <th scope="col" className="text-right font-medium px-2 py-2">{a}</th>
            <th scope="col" className="text-right font-medium px-2 py-2">{b}</th>
            <th scope="col" className="text-right font-medium px-2 py-2">Change</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((r) => {
            const Icon = r.change > 0 ? ArrowUp : ArrowDown;
            return (
              <tr key={r.key} className={r.total ? "font-semibold" : ""}>
                <th scope="row" className="text-left font-normal px-2 py-2">{r.label}</th>
                <td className="text-right tabular-nums px-2 py-2">{money(r.before)}</td>
                <td className="text-right tabular-nums px-2 py-2">{money(r.now)}</td>
                <td className="text-right tabular-nums px-2 py-2 whitespace-nowrap">
                  {Math.abs(r.change) < 0.005 ? (
                    <span className="text-muted-foreground">No change</span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                      {r.change > 0 ? "+" : "−"}
                      {money(Math.abs(r.change))}
                      <span className="text-xs text-muted-foreground">({pct(r.before ? (r.change / r.before) * 100 : 0)})</span>
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
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
          <Btn variant="subtle" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={save}>Save definition</Btn>
        </>
      }
    >
      <ErrorBanner error={error} onClose={() => setError(null)} note="The definition was not changed." />
      <ol className="space-y-3">
        {draft.map((l, i) => (
          <li key={`${l.key}-${i}`} className="grid grid-cols-1 sm:grid-cols-[2rem_1fr_1fr_auto] items-end gap-3 border-b border-border pb-3">
            <span className="text-sm text-muted-foreground tabular-nums sm:pb-2.5">{i + 1}</span>
            <Field label="Label">
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
