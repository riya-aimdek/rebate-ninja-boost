/**
 * Price determination engine shared by Price trace, CPQ quoting, Deal Desk and analytics,
 * so every screen resolves the same price, winning rule and guardrail outcome (US-ST-03, US-CQ-02).
 */
import { humanize, money } from "@/components/pricing/kit";
import { CUSTOMERS, FORMULAS, GUARDRAILS, PRECEDENCE_VERSIONS, PRICE_LISTS, PRODUCTS, RULES, type Guardrail, type PricingRule } from "@/lib/pricing/data";
import { actionSummary } from "@/lib/pricing/rules";

export type Ctx = { customer: string; product: string; qty: number; date: string; channel: string };
export type CustomerLike = { id: string; name: string; segment: string; geography: string; channel: string };

/* Demo customers A/B/C from US-ST-01 AC#2 sit alongside the master data. */
export const TRACE_CUSTOMERS: CustomerLike[] = [
  ...CUSTOMERS,
  { id: "Customer A", name: "Customer A", segment: "Mid-Market", geography: "UK", channel: "Direct" },
  { id: "Customer B", name: "Customer B", segment: "Mid-Market", geography: "UK", channel: "Direct" },
  { id: "Customer C", name: "Customer C", segment: "Mid-Market", geography: "UK", channel: "Direct" },
];

export const TIER_LABEL: Record<string, string> = {
  CONTRACT: "Contract price",
  CUSTOMER: "Customer-specific price",
  SEGMENT: "Segment price",
  CHANNEL: "Channel price",
  REGIONAL: "Regional price",
  STANDARD_LIST: "Standard list price",
};

export type Candidate = { tier: string; source: string; name: string; ref: string; detail: string; price: number | null; matched: boolean; reason: string; priority: number; updated: string; link?: { to: string; id: string } };

export function tierOf(r: PricingRule): string {
  const direct: Record<string, string> = { CONTRACT_PRICE: "CONTRACT", CUSTOMER_PRICE: "CUSTOMER", SEGMENT_PRICE: "SEGMENT", CHANNEL_PRICE: "CHANNEL", REGIONAL_PRICE: "REGIONAL" };
  if (direct[r.type]) return direct[r.type];
  const attrs = r.conditions.map((c) => c.attribute);
  if (attrs.includes("Customer")) return "CUSTOMER";
  if (attrs.includes("Customer Segment")) return "SEGMENT";
  if (attrs.includes("Channel")) return "CHANNEL";
  if (attrs.includes("Geography")) return "REGIONAL";
  return "STANDARD_LIST";
}

export function condHolds(attr: string, op: string, value: string, ctx: Ctx, cust: CustomerLike, prodNames: string[]): boolean {
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

export function rulePrice(r: PricingRule, base: number, cost: number, qty: number): number {
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

export function trace(ctx: Ctx) {
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

export const SPECIFICITY = { CUSTOMER: 3, SEGMENT: 2, GLOBAL: 1 } as const;

export function guardrailCheck(date: string, cust: CustomerLike, prod: (typeof PRODUCTS)[number], price: number, base: number) {
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
