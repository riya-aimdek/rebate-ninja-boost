/**
 * Aggregations for Analytics & Reporting (Epic 8). Every report reads the same transaction facts
 * (deals.TRANSACTIONS) and applies row-level security here, so a rep sees only their own customers everywhere.
 */
import { CUSTOMERS, PRODUCTS } from "@/lib/pricing/data";
import { EXCEPTIONS, TRANSACTIONS, type Transaction } from "@/lib/pricing/deals";
import { USERS, userName, type User } from "@/lib/pricing/session";

/** Row-level security (US-AN-02 AC#4): reps see own customers, sales managers their team's, everyone else all rows. */
export function scopedTransactions(user: User, rows: Transaction[] = TRANSACTIONS): Transaction[] {
  if (user.role === "SALES_REP") return rows.filter((t) => t.salesRepId === user.id);
  if (user.role === "SALES_MANAGER") {
    const team = new Set([user.id, ...USERS.filter((u) => u.managerId === user.id).map((u) => u.id)]);
    // Managers above other managers see the whole sales org they lead.
    USERS.filter((u) => team.has(u.managerId ?? "")).forEach((u) => team.add(u.id));
    return rows.filter((t) => team.has(t.salesRepId));
  }
  return rows;
}
export const rlsNote = (user: User) =>
  user.role === "SALES_REP" ? "Showing your own customers only." : user.role === "SALES_MANAGER" ? "Showing your team's customers only." : undefined;

export const DIMENSIONS = ["CUSTOMER", "PRODUCT", "REGION", "SALES_REP", "CHANNEL", "SEGMENT", "PERIOD"] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export const DIMENSION_LABEL: Record<Dimension, string> = {
  CUSTOMER: "Customer",
  PRODUCT: "Product",
  REGION: "Region",
  SALES_REP: "Sales rep",
  CHANNEL: "Channel",
  SEGMENT: "Segment",
  PERIOD: "Period",
};

export const customerName = (id: string) => CUSTOMERS.find((c) => c.id === id)?.name ?? id;
export const productName = (sku: string) => {
  const p = PRODUCTS.find((x) => x.sku === sku);
  return p ? `${p.sku} · ${p.name}` : sku;
};

export function keyOf(t: Transaction, d: Dimension): string {
  return { CUSTOMER: t.customerId, PRODUCT: t.sku, REGION: t.region, SALES_REP: t.salesRepId, CHANNEL: t.channel, SEGMENT: t.segment, PERIOD: t.period }[d];
}
export function labelOf(key: string, d: Dimension): string {
  if (d === "CUSTOMER") return customerName(key);
  if (d === "PRODUCT") return productName(key);
  if (d === "SALES_REP") return userName(key);
  return key;
}

/** Governed metric definitions — one per metric, shown in tooltips (US-AN-02). */
export const METRIC_DEFINITIONS: Record<string, string> = {
  revenue: "Invoice price × quantity, from ERP billing.",
  volume: "Units invoiced.",
  grossMargin: "Revenue minus cost (tenant margin cost definition).",
  grossMarginPct: "Gross margin divided by revenue.",
  pocketMargin: "Pocket price minus cost, × quantity — after rebates and freight.",
  priceRealization: "Pocket Price divided by List Price",
  discountPct: "List price minus invoice price, divided by list price.",
};

export type Metrics = {
  key: string;
  label: string;
  lines: number;
  revenue: number;
  volume: number;
  listValue: number;
  pocketValue: number;
  cost: number;
  grossMargin: number;
  grossMarginPct: number;
  pocketMargin: number;
  priceRealization: number;
  discountPct: number;
  leakage: number;
  leakagePct: number;
};

export function metricsOf(rows: Transaction[], key = "all", label = "All"): Metrics {
  const sum = (f: (t: Transaction) => number) => rows.reduce((a, t) => a + f(t) * t.qty, 0);
  const revenue = sum((t) => t.invoice);
  const listValue = sum((t) => t.list);
  const pocketValue = sum((t) => t.pocket);
  const cost = sum((t) => t.cost);
  return {
    key,
    label,
    lines: rows.length,
    revenue,
    volume: rows.reduce((a, t) => a + t.qty, 0),
    listValue,
    pocketValue,
    cost,
    grossMargin: revenue - cost,
    grossMarginPct: revenue ? ((revenue - cost) / revenue) * 100 : 0,
    pocketMargin: pocketValue - cost,
    priceRealization: listValue ? (pocketValue / listValue) * 100 : 0,
    discountPct: listValue ? ((listValue - revenue) / listValue) * 100 : 0,
    leakage: listValue - pocketValue,
    leakagePct: listValue ? ((listValue - pocketValue) / listValue) * 100 : 0,
  };
}

export function groupMetrics(rows: Transaction[], d: Dimension): Metrics[] {
  const groups = new Map<string, Transaction[]>();
  for (const t of rows) {
    const k = keyOf(t, d);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups.entries()].map(([k, rs]) => metricsOf(rs, k, labelOf(k, d))).sort((a, b) => b.revenue - a.revenue);
}

/** Compact money for axes and tiles: £1.2M, £84k. */
export function compactMoney(n: number) {
  const a = Math.abs(n);
  const s = n < 0 ? "−" : "";
  if (a >= 1_000_000) return `${s}£${(a / 1_000_000).toFixed(1)}M`;
  if (a >= 10_000) return `${s}£${Math.round(a / 1000)}k`;
  return `${s}£${a.toLocaleString("en-GB", { maximumFractionDigits: 0 })}`;
}

/* ---------------- Compliance (US-AN-03) ---------------- */

export type BandSource = "PRICE_LIST" | "GUARDRAIL";
export type ComplianceRow = Transaction & {
  bandLow: number;
  bandHigh: number;
  reference: number;
  varianceAmount: number;
  variancePct: number;
  outside: boolean;
  coveredByException: boolean;
  compliant: boolean;
};

/** Tolerance around the approved price-list price (rounding, approved promotions). */
export const PRICE_LIST_TOLERANCE_PCT = 2;

/** An approved exception (still approved, or approved and since expired) whose window covers the invoice date. */
export function exceptionCovering(t: Transaction) {
  if (t.exceptionId) return t.exceptionId;
  return EXCEPTIONS.find((e) => e.customerId === t.customerId && e.sku === t.sku && (e.status === "APPROVED" || e.status === "EXPIRED") && t.invoiceDate >= e.createdAt.slice(0, 10) && t.invoiceDate <= e.expiryDate)?.id;
}

/**
 * PRICE_LIST band: the approved price-list price ± tolerance; variance is measured from the approved price (100 → 92 = −8 / −8%).
 * GUARDRAIL band: the min/max price band; only prices outside it are variances.
 */
export function complianceOf(t: Transaction, source: BandSource): ComplianceRow {
  const ref = t.approvedPrice;
  const tolerance = (ref * PRICE_LIST_TOLERANCE_PCT) / 100;
  const low = source === "PRICE_LIST" ? ref - tolerance : t.bandMin;
  const high = source === "PRICE_LIST" ? ref + tolerance : t.bandMax;
  const outside = t.invoice < low - 0.005 || t.invoice > high + 0.005;
  const varianceAmount = Math.round((t.invoice - ref) * 100) / 100;
  const variancePct = ref ? Math.round(((t.invoice - ref) / ref) * 10_000) / 100 : 0;
  const exceptionId = outside ? exceptionCovering(t) : undefined;
  const coveredByException = !!exceptionId;
  return { ...t, exceptionId: exceptionId ?? t.exceptionId, bandLow: low, bandHigh: high, reference: ref, varianceAmount, variancePct, outside, coveredByException, compliant: !outside || coveredByException };
}

export function complianceRate(rows: ComplianceRow[]) {
  return rows.length ? (rows.filter((r) => r.compliant).length / rows.length) * 100 : 100;
}
