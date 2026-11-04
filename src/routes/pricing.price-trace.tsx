import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Calculator, CheckCircle2, CircleSlash, RefreshCw, Trophy } from "lucide-react";
import {
  Btn,
  Card,
  DataTable,
  Field,
  FilterPills,
  Flag,
  InfoBanner,
  ListHeader,
  PricingLayout,
  RecordLink,
  StatusPill,
  Tag,
  humanize,
  inputCls,
  money,
  type Tone,
} from "@/components/pricing/kit";
import { CHANNELS, CUSTOMERS, PRODUCTS } from "@/lib/pricing/data";

export const Route = createFileRoute("/pricing/price-trace")({
  head: () => ({ meta: [{ title: "Price trace · Rebate Ninja" }] }),
  component: Page,
});

import { TIER_LABEL, TRACE_CUSTOMERS, trace, type Candidate, type Ctx } from "@/lib/pricing/engine";

/** Flag renders an icon with the label, so the outcome never relies on colour alone. */
const OUTCOME: Record<string, { label: string; tone: Tone }> = {
  WITHIN: { label: "Within limits", tone: "success" },
  HARD_BLOCK: { label: "Blocked — can't be submitted", tone: "danger" },
  REQUIRE_APPROVAL: { label: "Routes to approval", tone: "info" },
  WARN: { label: "Warning — allowed", tone: "warning" },
  NONE: { label: "No guardrail in force", tone: "neutral" },
};

const PRESETS: Array<{ label: string; ctx: Ctx }> = [
  { label: "Acme Global · Widget × 500", ctx: { customer: "C-001", product: "A-100", qty: 500, date: "2026-11-15", channel: "Direct" } },
  { label: "Customer A · Widget", ctx: { customer: "Customer A", product: "A-100", qty: 10, date: "2026-11-15", channel: "Direct" } },
  { label: "Edmundson · Widget (override)", ctx: { customer: "878070", product: "A-100", qty: 20, date: "2026-11-15", channel: "Distributor" } },
  { label: "Rashi · MVHR × 150", ctx: { customer: "C-1", product: "EW-3100", qty: 150, date: "2026-11-15", channel: "Distributor" } },
  { label: "Urban Electricals · Widget (fallback)", ctx: { customer: "135991", product: "A-100", qty: 1, date: "2026-11-15", channel: "Retail" } },
];

const MAX_QTY = 1_000_000;

function Page() {
  const [ctx, setCtx] = useState<Ctx>(PRESETS[0].ctx);
  const [result, setResult] = useState(() => trace(PRESETS[0].ctx));
  /** Inputs the shown result was calculated from — so the result never silently mismatches edited inputs. */
  const [resultCtx, setResultCtx] = useState<Ctx>(PRESETS[0].ctx);

  const qtyError = !Number.isInteger(ctx.qty) || ctx.qty < 1 || ctx.qty > MAX_QTY ? `Enter a whole quantity from 1 to ${MAX_QTY.toLocaleString("en-GB")}, e.g. 100.` : undefined;
  const dateError = !ctx.date ? "Choose the date to price on, e.g. today." : undefined;
  const blocker = qtyError ? "Fix the quantity to calculate." : dateError ? "Choose a pricing date to calculate." : null;
  const stale = JSON.stringify(ctx) !== JSON.stringify(resultCtx);

  const run = (c = ctx) => {
    setResult(trace(c));
    setResultCtx(c);
  };
  const { winner, base, cost, guard } = result;
  const finalPrice = winner.price ?? base;
  const margin = ((finalPrice - cost) / finalPrice) * 100;
  const custMaster = CUSTOMERS.find((c) => c.id === result.cust.id);

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Strategy & segmentation" }, { label: "Price trace" }]}>
      <ListHeader title="Price trace" subtitle="Calculate a price and see which rule won, the tier it came from, and every rule evaluated but not applied." />

      <Card title="Pricing request">
        {/* Kit quick-filter pills: one example runs at a time and re-selecting it re-runs it. */}
        <FilterPills<string>
          label="Examples"
          multiple={false}
          clearable={false}
          options={PRESETS.map((p) => ({ key: p.label, label: p.label }))}
          selected={PRESETS.filter((p) => JSON.stringify(p.ctx) === JSON.stringify(resultCtx)).map((p) => p.label)}
          onChange={([k]) => {
            const p = PRESETS.find((x) => x.label === k);
            if (!p) return;
            setCtx(p.ctx);
            run(p.ctx);
          }}
        />
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!blocker) run();
          }}
        >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6 gap-4 items-start">
          <Field label="Customer" className="2xl:col-span-2">
            <select className={inputCls} value={ctx.customer} onChange={(e) => setCtx({ ...ctx, customer: e.target.value })}>
              {TRACE_CUSTOMERS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} · {c.segment}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Product">
            <select className={inputCls} value={ctx.product} onChange={(e) => setCtx({ ...ctx, product: e.target.value })}>
              {PRODUCTS.filter((p) => p.lifecycleStatus !== "BLOCKED").map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.sku} · {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity" required error={qtyError}>
            <input
              type="number"
              min={1}
              max={MAX_QTY}
              step={1}
              inputMode="numeric"
              className={inputCls}
              value={Number.isNaN(ctx.qty) ? "" : ctx.qty}
              onChange={(e) => setCtx({ ...ctx, qty: e.target.value === "" ? NaN : Number(e.target.value) })}
            />
          </Field>
          <Field label="Pricing date" required error={dateError}>
            <input type="date" className={inputCls} value={ctx.date} onChange={(e) => setCtx({ ...ctx, date: e.target.value })} />
          </Field>
          <Field label="Channel">
            <select className={inputCls} value={ctx.channel} onChange={(e) => setCtx({ ...ctx, channel: e.target.value })}>
              {CHANNELS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-end gap-3">
          {blocker ? (
            <p id="trace-blocker" className="text-sm text-muted-foreground">
              {blocker}
            </p>
          ) : (
            stale && <p className="text-sm text-warning-foreground">Inputs changed — calculate to update the result.</p>
          )}
          <Btn type="submit" icon={stale ? RefreshCw : Calculator} disabled={!!blocker} aria-describedby={blocker ? "trace-blocker" : undefined}>
            {stale ? "Recalculate price" : "Calculate price"}
          </Btn>
        </div>
        </form>
      </Card>

      <p role="status" className="sr-only">
        Final price {money(finalPrice)} for {result.prod.name}, {TIER_LABEL[winner.tier]}.
      </p>

      <div className={`grid grid-cols-1 xl:grid-cols-[1fr_420px] gap-6 mt-6 items-start ${stale ? "opacity-70" : ""}`}>
        {/* Left: the price and its guardrail check (both about the final price). Right: how it was chosen. */}
        <div className="space-y-6 min-w-0">
        <Card
          title="Price detail"
          subtitle={
            <span className="flex flex-wrap items-center gap-x-1">
              {custMaster ? <RecordLink to="/pricing/customers/$id" params={{ id: custMaster.id }}>{result.cust.name}</RecordLink> : result.cust.name}
              <span aria-hidden>·</span>
              <RecordLink to="/pricing/products/$id" params={{ id: result.prod.productId }}>
                {result.prod.sku} {result.prod.name}
              </RecordLink>
              <span>
                · qty {resultCtx.qty.toLocaleString("en-GB")} · {resultCtx.date}
              </span>
            </span>
          }
        >
          <div className="rounded-xl bg-navy text-navy-foreground p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-wide opacity-80">Final price</div>
              <div className="text-4xl font-bold tabular-nums">{money(finalPrice)}</div>
              <div className="text-xs opacity-80 mt-1">GBP / {result.prod.uom}</div>
            </div>
            <div className="sm:text-right">
              <div className="inline-flex items-center gap-2 rounded-full bg-brand text-brand-foreground px-3 py-1 text-sm font-semibold">
                <Trophy className="size-4" aria-hidden /> Winning rule: {TIER_LABEL[winner.tier]}
              </div>
              <div className="text-sm mt-2">
                {winner.name} <span className="font-mono text-xs opacity-80 whitespace-nowrap">{winner.ref}</span>
              </div>
              <div className="text-xs opacity-80">{winner.detail}</div>
            </div>
          </div>

          <ol className="mt-5 divide-y divide-border text-sm">
            <li className="flex justify-between py-2.5">
              <span>Standard list price (BL-001)</span>
              <span className="tabular-nums">{money(base)}</span>
            </li>
            {winner.tier !== "STANDARD_LIST" && (
              <li className="flex justify-between py-2.5">
                <span>
                  {TIER_LABEL[winner.tier]} adjustment <span className="text-muted-foreground">({winner.detail})</span>
                </span>
                <span className={`tabular-nums ${finalPrice < base ? "text-destructive" : "text-success"}`}>
                  {finalPrice - base >= 0 ? "+" : "−"}
                  {money(Math.abs(finalPrice - base))}
                </span>
              </li>
            )}
            <li className="flex justify-between py-2.5 font-bold">
              <span>Final price</span>
              <span className="tabular-nums text-brand">{money(finalPrice)}</span>
            </li>
            <li className="flex justify-between py-2.5 text-muted-foreground">
              <span>Cost ({result.prod.sku}) · margin</span>
              <span className="tabular-nums">
                {money(cost)} · {margin.toFixed(1)}%
              </span>
            </li>
          </ol>
          {winner.tier === "STANDARD_LIST" && (
            <InfoBanner tone="neutral" title="Fallback applied">No contract, customer, segment, channel or regional rule applies — the standard list price is used.</InfoBanner>
          )}
        </Card>

        <Card title="Guardrail check" subtitle="The most specific guardrail in force on the pricing date applies.">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Flag tone={OUTCOME[guard.outcome].tone}>{OUTCOME[guard.outcome].label}</Flag>
            {guard.applied && (
              <span className="text-sm">
                <RecordLink to="/pricing/guardrails">{guard.applied.id}</RecordLink> · {humanize(guard.applied.scopeLevel)} · {guard.applied.scope} · {guard.applied.product}{" "}
                <span className="text-muted-foreground">v{guard.applied.version}</span>
              </span>
            )}
          </div>
          {guard.applied ? (
            guard.breaches.length > 0 ? (
              <ul className="mt-3 list-disc pl-5 text-sm space-y-1">
                {guard.breaches.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground mt-3">The final price meets every limit on this guardrail.</p>
            )
          ) : (
            <p className="text-sm text-muted-foreground mt-3">No global, segment or customer guardrail covers this customer and product on {resultCtx.date}.</p>
          )}
        </Card>
        </div>

        <div className="min-w-0 xl:sticky xl:top-6">
        <Card title="Precedence used">
          <ol className="space-y-2">
            {result.precedence.order.map((t, i) => {
              const won = t === winner.tier;
              const any = result.ordered.some((c) => c.tier === t && c.matched);
              return (
                <li key={t} className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${won ? "border-brand bg-brand-soft" : "border-border"}`}>
                  <span className={`size-6 rounded-full grid place-items-center text-xs font-bold ${won ? "bg-brand text-brand-foreground" : "bg-muted"}`} aria-hidden>
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm font-medium">{TIER_LABEL[t]}</span>
                  {won ? <Tag tone="brand">Winner</Tag> : any ? <Tag>Matched, lower tier</Tag> : <span className="text-xs text-muted-foreground">No match</span>}
                </li>
              );
            })}
          </ol>
          <div className="mt-4 text-sm">
            Tie-breaker: <b>{humanize(result.precedence.tieBreaker)}</b> {result.tieUsed ? <Tag tone="warning">used</Tag> : <span className="text-muted-foreground">(not needed)</span>}
          </div>
          <div className="mt-1 text-xs text-muted-foreground">
            Precedence v{result.precedence.version} ·{" "}
            <Link to="/pricing/precedence" className="text-brand hover:underline">
              Change order
            </Link>
          </div>
        </Card>
        </div>
      </div>

      <section className="mt-8" aria-labelledby="trace-rules-h">
        <div className="mb-3">
          <h2 id="trace-rules-h" className="text-lg font-semibold tracking-tight">
            Rules evaluated
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Rule types without a native tier (cost-plus, formula, discount, volume tier, promotion) are placed by their most specific condition.</p>
        </div>
        <DataTable<Candidate>
          caption="Rules and price lists evaluated, in precedence order"
          rows={result.ordered}
          rowKey={(c) => c.source}
          rowClassName={(c) => (c === winner ? "!bg-brand-soft" : "")}
          columns={[
            { key: "tier", header: "Tier", className: "whitespace-nowrap", cell: (c) => TIER_LABEL[c.tier] },
            {
              key: "src",
              header: "Rule / list",
              className: "min-w-52",
              cell: (c) => (
                <div>
                  {c.link ? (
                    <RecordLink to={c.link.to} params={{ id: c.link.id }}>
                      {c.name}
                    </RecordLink>
                  ) : (
                    <span className="font-medium">{c.name}</span>
                  )}
                  <div className="font-mono text-xs text-muted-foreground whitespace-nowrap">{c.ref}</div>
                </div>
              ),
            },
            { key: "detail", header: "Detail", cell: (c) => <span className="block min-w-56">{c.detail}</span> },
            { key: "price", header: "Price", align: "right", cell: (c) => <span className="tabular-nums">{c.price === null ? "—" : money(c.price)}</span> },
            {
              key: "result",
              header: "Result",
              cell: (c) =>
                c === winner ? (
                  <StatusPill status="ACTIVE" tone="brand" label="Applied" />
                ) : c.matched ? (
                  <span className="inline-flex items-start gap-1.5 min-w-56 text-muted-foreground">
                    <CheckCircle2 className="size-4 shrink-0 mt-0.5" aria-hidden />
                    {c.tier === winner.tier ? `Matched — lost tie-breaker (${humanize(result.precedence.tieBreaker).toLowerCase()})` : "Matched — not applied (lower precedence)"}
                  </span>
                ) : (
                  <span className="inline-flex items-start gap-1.5 min-w-56 text-muted-foreground">
                    <CircleSlash className="size-4 shrink-0 mt-0.5" aria-hidden /> {c.reason}
                  </span>
                ),
            },
          ]}
        />
      </section>
    </PricingLayout>
  );
}
