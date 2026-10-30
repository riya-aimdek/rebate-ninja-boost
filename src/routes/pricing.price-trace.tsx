import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Calculator, CheckCircle2, CircleSlash, RefreshCw, Trophy } from "lucide-react";
import {
  Btn,
  Card,
  DataTable,
  Field,
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
import { CHANNELS, CUSTOMERS, FORMULAS, GUARDRAILS, PRECEDENCE_VERSIONS, PRICE_LISTS, PRODUCTS, RULES, type Guardrail, type PricingRule } from "@/lib/pricing/data";
import { actionSummary } from "@/lib/pricing/rules";

export const Route = createFileRoute("/pricing/price-trace")({
  head: () => ({ meta: [{ title: "Price trace · Rebate Ninja" }] }),
  component: Page,
});

type Ctx = { customer: string; product: string; qty: number; date: string; channel: string };
type CustomerLike = { id: string; name: string; segment: string; geography: string; channel: string };

/* Demo customers A/B/C from US-ST-01 AC#2 sit alongside the master data. */
const TRACE_CUSTOMERS: CustomerLike[] = [
  ...CUSTOMERS,
  { id: "Customer A", name: "Customer A", segment: "Mid-Market", geography: "UK", channel: "Direct" },
  { id: "Customer B", name: "Customer B", segment: "Mid-Market", geography: "UK", channel: "Direct" },
  { id: "Customer C", name: "Customer C", segment: "Mid-Market", geography: "UK", channel: "Direct" },
];

const TIER_LABEL: Record<string, string> = {
  CONTRACT: "Contract price",
  CUSTOMER: "Customer-specific price",
  SEGMENT: "Segment price",
  CHANNEL: "Channel price",
  REGIONAL: "Regional price",
  STANDARD_LIST: "Standard list price",
};

type Candidate = { tier: string; source: string; name: string; ref: string; detail: string; price: number | null; matched: boolean; reason: string; priority: number; updated: string; link?: { to: string; id: string } };

function tierOf(r: PricingRule): string {
  const direct: Record<string, string> = { CONTRACT_PRICE: "CONTRACT", CUSTOMER_PRICE: "CUSTOMER", SEGMENT_PRICE: "SEGMENT", CHANNEL_PRICE: "CHANNEL", REGIONAL_PRICE: "REGIONAL" };
  if (direct[r.type]) return direct[r.type];
  const attrs = r.conditions.map((c) => c.attribute);
  if (attrs.includes("Customer")) return "CUSTOMER";
  if (attrs.includes("Customer Segment")) return "SEGMENT";
  if (attrs.includes("Channel")) return "CHANNEL";
  if (attrs.includes("Geography")) return "REGIONAL";
  return "STANDARD_LIST";
}

function condHolds(attr: string, op: string, value: string, ctx: Ctx, cust: CustomerLike, prodNames: string[]): boolean {
  const pick: Record<string, string | number> = {
    Customer: cust.name,
    "Customer Segment": cust.segment,
    Geography: cust.geography,
    Channel: ctx.channel,
    Quantity: ctx.qty,
    Date: ctx.date,
    Currency: "GBP",
  };
  const list = value.split(",").map((s) => s.trim().toLowerCase());
  if (attr === "Product") {
    const names = prodNames.map((n) => n.toLowerCase());
    if (op === "In") return list.some((x) => names.includes(x));
    if (op === "Not In") return !list.some((x) => names.includes(x));
    return op === "Not Equal To" ? !names.includes(value.toLowerCase()) : names.includes(value.toLowerCase());
  }
  const v = pick[attr];
  if (v === undefined) return true;
  if (op === "Between") {
    const [a, b] = value.split(/\s*…\s*/);
    return String(v) >= a && String(v) <= b;
  }
  if (typeof v === "number") {
    const n = Number(value);
    return { "Greater Than": v > n, "Greater Than Equal To": v >= n, "Less Than": v < n, "Less Than Equal To": v <= n, "Equal To": v === n, "Not Equal To": v !== n }[op] ?? false;
  }
  const s = String(v).toLowerCase();
  if (op === "In") return list.includes(s);
  if (op === "Not In") return !list.includes(s);
  return op === "Not Equal To" ? s !== value.toLowerCase() : s === value.toLowerCase();
}

function rulePrice(r: PricingRule, base: number, cost: number, qty: number): number {
  const v = Number(r.action.value);
  switch (r.action.type) {
    case "SET_PRICE":
      return v;
    case "DISCOUNT_PCT":
      return base * (1 - v / 100);
    case "MARKUP_PCT":
      return base * (1 + v / 100);
    case "COST_PLUS_PCT":
      return cost * (1 + v / 100);
    case "TARGET_MARGIN":
      return cost / (1 - v / 100);
    case "APPLY_FORMULA": {
      const f = FORMULAS.find((x) => r.action.value?.startsWith(x.id));
      return f ? f.variables.reduce((a, x) => a + x.sample, 0) : base;
    }
    case "APPLY_TIERS": {
      const tiers = (r.action.value ?? "").split("·").map((s) => s.trim().match(/^(\d+)(?:–(\d+)|\+):\s*([\d.]+)%$/));
      const hit = tiers.find((m) => m && qty >= Number(m[1]) && (!m[2] || qty <= Number(m[2])));
      return hit ? base * (1 - Number(hit[3]) / 100) : base;
    }
  }
}

function trace(ctx: Ctx) {
  const cust = TRACE_CUSTOMERS.find((c) => c.id === ctx.customer)!;
  const prod = PRODUCTS.find((p) => p.sku === ctx.product)!;
  const prodNames = [prod.name, prod.sku, prod.productId];
  const findLine = (listId: string) => PRICE_LISTS.find((l) => l.id === listId)?.lines.find((ln) => ln.sku === prod.sku || ln.sku === prod.productId);
  const baseLine = findLine("BL-001");
  const base = baseLine?.price ?? prod.cost * 1.5;
  const cands: Candidate[] = [];

  for (const r of RULES) {
    const tier = tierOf(r);
    const failed = r.conditions.find((c) => !condHolds(c.attribute, c.operator, c.value, ctx, cust, prodNames));
    const inDate = ctx.date >= r.effectiveFrom && (!r.effectiveTo || ctx.date <= r.effectiveTo);
    const productRelevant = r.conditions.every((c) => c.attribute !== "Product" || condHolds(c.attribute, c.operator, c.value, ctx, cust, prodNames));
    if (!productRelevant && (r.status === "ACTIVE" || r.status === "SCHEDULED")) continue; // rules for other products are not evaluated
    let reason = "Matched";
    let matched = true;
    // A scheduled version prices from its effective date and supersedes the older version from then on.
    const takeover = RULES.find((s) => s.status === "SCHEDULED" && s.name === r.name && s.version > r.version && ctx.date >= s.effectiveFrom);
    if (r.status === "SCHEDULED" && !inDate) {
      matched = false;
      reason = `Scheduled — starts ${r.effectiveFrom}`;
    } else if (r.status === "ACTIVE" && takeover) {
      matched = false;
      reason = `Superseded by v${takeover.version} from ${takeover.effectiveFrom}`;
    } else if (r.status !== "ACTIVE" && r.status !== "SCHEDULED") {
      matched = false;
      reason = `Rule is ${humanize(r.status).toLowerCase()}`;
    } else if (!inDate) {
      matched = false;
      reason = `Outside effective dates ${r.effectiveFrom} → ${r.effectiveTo ?? "open"}`;
    } else if (failed) {
      matched = false;
      reason = `Condition not met: ${failed.attribute} ${failed.operator.toLowerCase()} ${failed.value}`;
    }
    cands.push({
      tier,
      source: `${r.name} (${r.id} v${r.version})`,
      name: r.name,
      ref: `${r.id} v${r.version}`,
      detail: `${humanize(r.type)} · ${actionSummary(r.action)}`,
      price: matched ? rulePrice(r, base, prod.cost, ctx.qty) : null,
      matched,
      reason,
      priority: r.priority,
      updated: r.lastUpdated,
      link: { to: "/pricing/rules/$id", id: r.id },
    });
  }

  for (const l of PRICE_LISTS.filter((x) => x.type === "CUSTOMER" || x.type === "SEGMENT")) {
    const line = l.lines.find((ln) => ln.sku === prod.sku || ln.sku === prod.productId);
    if (!line) continue;
    const tier = l.type === "CUSTOMER" ? "CUSTOMER" : "SEGMENT";
    const fits = l.type === "CUSTOMER" ? l.name.toLowerCase().startsWith(cust.name.split(" ")[0].toLowerCase()) : l.segment === cust.segment;
    const active = l.status === "ACTIVE";
    const final = line.overridePrice ?? line.price;
    cands.push({
      tier,
      source: `${l.name} (${l.id} v${l.version})`,
      name: l.name,
      ref: `${l.id} v${l.version}`,
      detail: `${humanize(l.type)} price list${line.overridePrice ? ` · override: ${line.overrideReason ? humanize(line.overrideReason).toLowerCase() : "manual"}` : ""}${line.derivationChain ? ` · ${line.derivationChain}` : ""}`,
      price: fits && active ? final : null,
      matched: fits && active,
      reason: !active ? `List is ${humanize(l.status).toLowerCase()}` : fits ? "Matched" : l.type === "CUSTOMER" ? `List is for another customer` : `Customer segment is ${cust.segment}, list is for ${l.segment}`,
      priority: 50,
      updated: l.lastUpdated,
      link: { to: "/pricing/price-lists/$id", id: l.id },
    });
  }

  cands.push({ tier: "STANDARD_LIST", source: "UK Base 2026 (BL-001 v4)", name: "UK Base 2026", ref: "BL-001 v4", detail: "Base price list · always available fallback", price: base, matched: true, reason: "Matched", priority: 999, updated: "2026-10-12 11:04", link: { to: "/pricing/price-lists/$id", id: "BL-001" } });

  const precedence = PRECEDENCE_VERSIONS.find((v) => v.status === "ACTIVE")!;
  let winner: Candidate | undefined;
  let tieUsed = false;
  for (const t of precedence.order) {
    const hits = cands.filter((c) => c.tier === t && c.matched);
    if (hits.length) {
      tieUsed = hits.length > 1;
      hits.sort((a, b) => (precedence.tieBreaker === "LOWEST_PRICE" ? (a.price ?? 0) - (b.price ?? 0) : precedence.tieBreaker === "MOST_RECENT" ? b.updated.localeCompare(a.updated) : a.priority - b.priority));
      winner = hits[0];
      break;
    }
  }
  const ordered = precedence.order.flatMap((t) => cands.filter((c) => c.tier === t));
  const final = winner!.price ?? base;
  return { cust, prod, base, winner: winner!, tieUsed, precedence, ordered, cost: prod.cost, guard: guardrailCheck(ctx.date, cust, prod, final, base) };
}

/* ---------- Guardrail check (US-ST-05): most specific scope wins ---------- */

const SPECIFICITY = { CUSTOMER: 3, SEGMENT: 2, GLOBAL: 1 } as const;

function guardrailCheck(date: string, cust: CustomerLike, prod: (typeof PRODUCTS)[number], price: number, base: number) {
  const inForce = GUARDRAILS.filter(
    (g) =>
      g.status !== "SUPERSEDED" &&
      date >= g.effectiveFrom &&
      (!g.effectiveTo || date <= g.effectiveTo) &&
      (g.scopeLevel === "GLOBAL" || (g.scopeLevel === "SEGMENT" && g.scope === cust.segment) || (g.scopeLevel === "CUSTOMER" && g.scope === cust.name)) &&
      (g.product === "All products" || g.product === prod.name || g.product === prod.sku),
  );
  // Scope first (customer → segment → global), then a product-specific guardrail beats "All products".
  const rank = (g: Guardrail) => SPECIFICITY[g.scopeLevel] * 2 + (g.product === "All products" ? 0 : 1);
  const applied = [...inForce].sort((a, b) => rank(b) - rank(a))[0];
  if (!applied) return { applied: undefined, breaches: [] as string[], outcome: "NONE" as const };
  const margin = ((price - prod.cost) / price) * 100;
  const discount = ((base - price) / base) * 100;
  const breaches: string[] = [];
  if (applied.priceFloor !== undefined && price < applied.priceFloor) breaches.push(`Below price floor ${money(applied.priceFloor)}`);
  if (applied.priceCeiling !== undefined && price > applied.priceCeiling) breaches.push(`Above price ceiling ${money(applied.priceCeiling)}`);
  if (applied.minMarginPct !== undefined && margin < applied.minMarginPct) breaches.push(`Margin ${margin.toFixed(1)}% is below the ${applied.minMarginPct}% minimum`);
  if (applied.maxDiscountPct !== undefined && discount > applied.maxDiscountPct) breaches.push(`Discount ${discount.toFixed(1)}% is above the ${applied.maxDiscountPct}% maximum`);
  const needsApproval = applied.maxDiscountNoApprovalPct !== undefined && discount > applied.maxDiscountNoApprovalPct;
  const outcome = breaches.length ? applied.enforcement : needsApproval ? ("REQUIRE_APPROVAL" as const) : ("WITHIN" as const);
  if (!breaches.length && needsApproval) breaches.push(`Discount ${discount.toFixed(1)}% is above the ${applied.maxDiscountNoApprovalPct}% allowed without approval`);
  return { applied, breaches, outcome };
}

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
        <div className="flex flex-wrap items-center gap-2 mb-4" role="group" aria-label="Example requests">
          <span className="text-sm text-muted-foreground mr-1">Examples</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              aria-pressed={JSON.stringify(p.ctx) === JSON.stringify(resultCtx)}
              onClick={() => {
                setCtx(p.ctx);
                run(p.ctx);
              }}
              className="text-sm min-h-10 px-4 rounded-full border border-border bg-card text-muted-foreground font-medium hover:text-foreground aria-pressed:bg-navy aria-pressed:border-navy aria-pressed:text-navy-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            >
              {p.label}
            </button>
          ))}
        </div>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!blocker) run();
          }}
        >
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-4 items-start">
          <Field label="Customer" className="md:col-span-2">
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

        <div className="space-y-6 min-w-0">
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

        <Card title="Guardrail check" subtitle="The most specific guardrail in force on the pricing date applies.">
          <Flag tone={OUTCOME[guard.outcome].tone}>{OUTCOME[guard.outcome].label}</Flag>
          {guard.applied ? (
            <>
              <p className="text-sm mt-3">
                <RecordLink to="/pricing/guardrails">{guard.applied.id}</RecordLink> · {humanize(guard.applied.scopeLevel)} · {guard.applied.scope} · {guard.applied.product}{" "}
                <span className="text-muted-foreground">v{guard.applied.version}</span>
              </p>
              {guard.breaches.length > 0 ? (
                <ul className="mt-2 list-disc pl-5 text-sm space-y-0.5">
                  {guard.breaches.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground mt-2">The final price meets every limit on this guardrail.</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground mt-3">No global, segment or customer guardrail covers this customer and product on {resultCtx.date}.</p>
          )}
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
