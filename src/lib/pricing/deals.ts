/**
 * Shared data and logic for quoting (Epic 5), deal & discount management (Epic 6) and
 * the transaction facts analytics read (Epic 8). One source so a quote submitted in CPQ
 * shows up in the approval queue, its notifications and its profitability report.
 */
import { CUSTOMERS, GUARDRAILS, PRODUCTS, customerById, productBySku, type Guardrail } from "@/lib/pricing/data";
import { TIER_LABEL, guardrailCheck, trace } from "@/lib/pricing/engine";
import { PARTNER_TIERS, USERS, userById, userByTitle, type Role } from "@/lib/pricing/session";

/** Prototype clock — every SLA, expiry and "as of" is measured from here. */
export const NOW = "2026-10-29 14:30";
export const TODAY_ISO = NOW.slice(0, 10);

export const toMs = (s: string) => new Date(`${s.length === 10 ? `${s}T00:00` : s.replace(" ", "T")}:00Z`).getTime();
export const hoursBetween = (from: string, to: string) => (toMs(to) - toMs(from)) / 3_600_000;
export const addHours = (s: string, h: number) => new Date(toMs(s) + h * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
export const addMonths = (iso: string, m: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + m);
  return d.toISOString().slice(0, 10);
};

/** Short hash used for document integrity and idempotency keys (not cryptographic — prototype only). */
export function shortHash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16).padStart(8, "0");
}

/* ================================================================== */
/* CRM context (US-CQ-01)                                             */
/* ================================================================== */

export type CrmOpportunity = { id: string; name: string; accountId: string; ownerId: string; stage: string; amount: number; closeDate: string };
/** CRM account → platform customer. */
export const CRM_ACCOUNTS: Record<string, string> = {
  "ACC-1": "878070",
  "ACC-2": "C-003",
  "ACC-3": "155010",
  "ACC-4": "C-002",
  "ACC-5": "C-004",
  "ACC-6": "155040",
  "ACC-7": "C-001",
  "ACC-8": "C-1",
  "ACC-9": "878075",
  "ACC-10": "135991",
  "ACC-11": "C-900",
};
export const crmAccountOf = (customerId: string) => Object.entries(CRM_ACCOUNTS).find(([, c]) => c === customerId)?.[0];

export const CRM_OPPORTUNITIES: CrmOpportunity[] = [
  { id: "OPP-1", name: "Edmundson Q4 lighting refresh", accountId: "ACC-1", ownerId: "U-04", stage: "Proposal", amount: 26_000, closeDate: "2026-11-20" },
  { id: "OPP-2", name: "Acme UK MVHR programme", accountId: "ACC-2", ownerId: "U-04", stage: "Negotiation", amount: 42_000, closeDate: "2026-11-30" },
  { id: "OPP-3", name: "Redington widget restock", accountId: "ACC-3", ownerId: "U-16", stage: "Qualification", amount: 2_000, closeDate: "2026-12-05" },
  { id: "OPP-4", name: "Acme US cable renewal", accountId: "ACC-4", ownerId: "U-04", stage: "Closed won", amount: 61_000, closeDate: "2026-10-20" },
  { id: "OPP-5", name: "Acme UK North heaters", accountId: "ACC-5", ownerId: "U-04", stage: "Closed won", amount: 8_800, closeDate: "2026-10-22" },
  { id: "OPP-6", name: "Arrow India heaters", accountId: "ACC-6", ownerId: "U-16", stage: "Closed won", amount: 22_350, closeDate: "2026-10-25" },
  { id: "OPP-7", name: "Acme Global FY27 framework", accountId: "ACC-7", ownerId: "U-04", stage: "Negotiation", amount: 270_000, closeDate: "2026-12-15" },
  { id: "OPP-8", name: "Rashi switchgear top-up", accountId: "ACC-8", ownerId: "U-16", stage: "Closed lost", amount: 7_600, closeDate: "2026-10-18" },
  { id: "OPP-9", name: "A. Webb widget order", accountId: "ACC-9", ownerId: "U-04", stage: "Proposal", amount: 11_000, closeDate: "2026-11-15" },
  { id: "OPP-10", name: "Urban Electricals panels", accountId: "ACC-10", ownerId: "U-04", stage: "Proposal", amount: 5_500, closeDate: "2026-11-25" },
];

/** ERP customer numbers. Customers mastered only in the CRM have none → CUSTOMER_NOT_IN_ERP on sync (US-CQ-06 AC#4). */
export const ERP_CUSTOMER_ID: Record<string, string | undefined> = {
  "C-001": "KUN-100001",
  "C-002": "KUN-100002",
  "C-003": "KUN-100003",
  ...Object.fromEntries(CUSTOMERS.filter((c) => c.sourceSystem === "SAP").map((c) => [c.id, c.sourceId])),
};

/* ================================================================== */
/* Real-time line pricing (US-CQ-02)                                  */
/* ================================================================== */

export type ErrorClass = "VALIDATION" | "AUTHORIZATION" | "BUSINESS_RULE" | "TRANSIENT_TECHNICAL" | "PERMANENT_TECHNICAL" | "DOWNSTREAM_REJECTION" | "CONFLICT";
export type PlatformError = { errorClass: ErrorClass; code: string; message: string; field?: string; retryable?: boolean; correlationId?: string };

export type ApprovalReason = "BELOW_PRICE_FLOOR" | "ABOVE_PRICE_CEILING" | "BELOW_MIN_MARGIN" | "ABOVE_MAX_DISCOUNT" | "DISCOUNT_NEEDS_APPROVAL";

export type PricedLine = {
  ok: true;
  clientRequestId?: string;
  sku: string;
  productName: string;
  qty: number;
  uom: string;
  currency: string;
  listPrice: number;
  netPrice: number;
  discountPct: number;
  extended: number;
  cost: number;
  marginAmount: number;
  marginPct: number;
  /** Winning precedence tier, e.g. "Channel price" (US-ST-03). */
  winningRule: string;
  ruleRef: string;
  guardrail: {
    withinBand: boolean;
    outcome: "WITHIN" | "HARD_BLOCK" | "REQUIRE_APPROVAL" | "WARN" | "NONE";
    guardrailId?: string;
    floor?: number;
    ceiling?: number;
    minMarginPct?: number;
    maxDiscountPct?: number;
    maxDiscountNoApprovalPct?: number;
    breaches: string[];
    approvalRequired: boolean;
    reasons: ApprovalReason[];
    blocked: boolean;
  };
  warnings: string[];
};
export type FailedLine = { ok: false; clientRequestId?: string; sku: string; qty: number; error: PlatformError };
export type LineResult = PricedLine | FailedLine;

export type LineRequest = { clientRequestId?: string; sku: string; qty: number; requestedUnitPrice?: number; requestedDiscountPct?: number };
export type PricingContext = { customerId: string; channel: string; pricingDate: string };

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Prices one line with the same engine as Price trace, then checks guardrails. Never throws. */
export function priceLine(ctx: PricingContext, req: LineRequest): LineResult {
  const fail = (code: string, message: string, field?: string, errorClass: ErrorClass = "VALIDATION"): FailedLine => ({
    ok: false,
    clientRequestId: req.clientRequestId,
    sku: req.sku,
    qty: req.qty,
    error: { errorClass, code, message, field, retryable: false },
  });
  const prod = productBySku(req.sku);
  if (!prod) return fail("PRODUCT_NOT_FOUND", `No product with SKU or ID “${req.sku}”. Check the code or pick from the catalog.`, "sku", "BUSINESS_RULE");
  if (prod.lifecycleStatus === "BLOCKED") return fail("PRODUCT_BLOCKED", `${prod.sku} is blocked in the ERP and can't be quoted.`, "sku", "BUSINESS_RULE");
  if (!Number.isFinite(req.qty) || req.qty <= 0) return fail("VALIDATION_REQUIRED", "Enter a quantity of 1 or more.", "qty");
  if (req.requestedUnitPrice !== undefined && req.requestedDiscountPct !== undefined)
    return fail("REQUEST_CONFLICT", "Send either a requested unit price or a requested discount, not both.", "requestedUnitPrice, requestedDiscount");
  const cust = customerById(ctx.customerId);
  if (!cust) return fail("CUSTOMER_NOT_FOUND", "The quote's customer no longer exists.", "customerId", "BUSINESS_RULE");

  const t = trace({ customer: cust.id, product: prod.sku, qty: req.qty, date: ctx.pricingDate, channel: ctx.channel });
  const listPrice = round2(t.base);
  const engineNet = round2(t.winner.price ?? t.base);
  let net = engineNet;
  if (req.requestedUnitPrice !== undefined) net = round2(req.requestedUnitPrice);
  else if (req.requestedDiscountPct !== undefined) net = round2(listPrice * (1 - req.requestedDiscountPct / 100));
  if (net < 0) return fail("VALIDATION_REQUIRED", "The price can't be negative.", "requestedUnitPrice");

  const gc = guardrailCheck(ctx.pricingDate, cust, prod, net, listPrice);
  const g: Guardrail | undefined = gc.applied;
  const discountPct = listPrice ? ((listPrice - net) / listPrice) * 100 : 0;
  const marginPct = net ? ((net - prod.cost) / net) * 100 : -100;
  const reasons: ApprovalReason[] = [];
  if (g?.priceFloor !== undefined && net < g.priceFloor) reasons.push("BELOW_PRICE_FLOOR");
  if (g?.priceCeiling !== undefined && net > g.priceCeiling) reasons.push("ABOVE_PRICE_CEILING");
  if (g?.minMarginPct !== undefined && marginPct < g.minMarginPct) reasons.push("BELOW_MIN_MARGIN");
  if (g?.maxDiscountPct !== undefined && discountPct > g.maxDiscountPct) reasons.push("ABOVE_MAX_DISCOUNT");
  if (!reasons.length && g?.maxDiscountNoApprovalPct !== undefined && discountPct > g.maxDiscountNoApprovalPct) reasons.push("DISCOUNT_NEEDS_APPROVAL");
  const blocked = gc.outcome === "HARD_BLOCK";
  const warnings: string[] = [];
  if (prod.lifecycleStatus === "END_OF_LIFE") warnings.push(`${prod.sku} is end-of-life.`);
  if (prod.lifecycleStatus === "PHASE_OUT") warnings.push(`${prod.sku} is being phased out.`);

  return {
    ok: true,
    clientRequestId: req.clientRequestId,
    sku: prod.sku,
    productName: prod.name,
    qty: req.qty,
    uom: prod.uom,
    currency: "GBP",
    listPrice,
    netPrice: net,
    discountPct: round2(discountPct),
    extended: round2(net * req.qty),
    cost: prod.cost,
    marginAmount: round2((net - prod.cost) * req.qty),
    marginPct: round2(marginPct),
    winningRule: req.requestedUnitPrice !== undefined || req.requestedDiscountPct !== undefined ? "Negotiated price" : TIER_LABEL[t.winner.tier],
    ruleRef: t.winner.ref,
    guardrail: {
      withinBand: reasons.length === 0 || (gc.outcome === "WARN" && !reasons.includes("BELOW_PRICE_FLOOR")),
      outcome: gc.outcome,
      guardrailId: g?.id,
      floor: g?.priceFloor,
      ceiling: g?.priceCeiling,
      minMarginPct: g?.minMarginPct,
      maxDiscountPct: g?.maxDiscountPct,
      maxDiscountNoApprovalPct: g?.maxDiscountNoApprovalPct,
      breaches: gc.breaches,
      approvalRequired: !blocked && gc.outcome !== "WARN" && reasons.length > 0,
      reasons,
      blocked,
    },
    warnings,
  };
}

/** Batch pricing: each result echoes its clientRequestId; a bad line never fails the others (US-CQ-02 AC#4–5). */
export function priceBatch(ctx: PricingContext, lines: LineRequest[]) {
  const results = lines.map((l) => priceLine(ctx, l));
  const failed = results.filter((r) => !r.ok).length;
  return { status: failed === 0 ? "SUCCEEDED" : failed === results.length ? "FAILED" : "PARTIAL_SUCCESS", results, failed } as const;
}

/* ================================================================== */
/* Quotes (US-CQ-01 … 06)                                             */
/* ================================================================== */

export const QUOTE_STATUSES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];
export const SYNC_STATUSES = ["PENDING", "SENT", "SUCCESS", "FAILED", "RETRYING"] as const;
export type SyncStatus = (typeof SYNC_STATUSES)[number];

export type QuoteLineInput = LineRequest & { id: string };
export type QuoteRevision = {
  revision: number;
  status: QuoteStatus;
  createdAt: string;
  createdBy: string;
  lines: QuoteLineInput[];
  paymentTerms: string;
  incoterms: string;
  validUntil: string;
  note?: string;
};
export type QuoteDocument = { id: string; kind: "PDF" | "ERP_SUMMARY"; template: string; templateVersion: string; quoteRevision: number; at: string; by: string; hash: string };
export type ErpSync = {
  status: SyncStatus;
  idempotencyKey: string;
  attempts: number;
  erpOrderRef?: string;
  nextRetryAt?: string;
  lastError?: PlatformError;
  updatedAt: string;
};
export type Quote = {
  id: string;
  name: string;
  customerId: string;
  crmOpportunityId?: string;
  crmAccountId?: string;
  ownerId: string;
  /** Portal quotes carry the partner's customer id. */
  partnerId?: string;
  channel: string;
  currency: string;
  pricingDate: string;
  status: QuoteStatus;
  revision: number;
  lines: QuoteLineInput[];
  /** Earlier revisions, newest first. */
  history: QuoteRevision[];
  paymentTerms: string;
  incoterms: string;
  shipTo: string;
  requestedDelivery?: string;
  validUntil: string;
  createdAt: string;
  updatedAt: string;
  priceListVersion: string;
  guidedFlowId?: string;
  guidedAnswers?: Record<string, string>;
  justification?: string;
  approvalTaskId?: string;
  /** Snapshot at approval — later cost changes never rewrite it (US-AN-04 AC#4). */
  expectedMarginPct?: number;
  /** From ERP billing + rebate accruals once invoiced. */
  actualMarginPct?: number;
  renewalOf?: string;
  priorTermRealizedMarginPct?: number;
  sync?: ErpSync;
  documents: QuoteDocument[];
};

export const PAYMENT_TERMS = ["Net 30", "Net 45", "Net 60", "2% 10 Net 30"] as const;
export const INCOTERMS = ["EXW", "FCA", "DAP", "DDP"] as const;
export const QUOTE_TEMPLATES = [
  { id: "TPL-STD", name: "Standard quote", version: "v3", channels: ["Direct", "Distributor", "Retail", "E-commerce"], languages: ["en-GB"] },
  { id: "TPL-PARTNER", name: "Partner quote", version: "v2", channels: ["Partner"], languages: ["en-GB"] },
  { id: "TPL-EU", name: "EU quote (multilingual)", version: "v1", channels: ["Direct", "Distributor"], languages: ["en-GB", "de-DE", "fr-FR"] },
];

const q = (x: Omit<Quote, "currency" | "priceListVersion" | "documents" | "history" | "shipTo"> & Partial<Pick<Quote, "documents" | "history" | "shipTo">>): Quote => ({
  currency: "GBP",
  priceListVersion: "BL-001 v4",
  documents: [],
  history: [],
  shipTo: customerById(x.customerId)?.name ?? "",
  ...x,
});

export const QUOTES: Quote[] = [
  q({ id: "Q-10231", name: "Edmundson Q4 lighting refresh", customerId: "878070", crmOpportunityId: "OPP-1", crmAccountId: "ACC-1", ownerId: "U-04", channel: "Distributor", pricingDate: "2026-10-29", status: "PENDING_APPROVAL", revision: 1,
    lines: [{ id: "L1", clientRequestId: "R1", sku: "LT-PNL-60", qty: 600, requestedDiscountPct: 18 }, { id: "L2", clientRequestId: "R2", sku: "SW-RCD-63", qty: 200 }],
    paymentTerms: "Net 30", incoterms: "DAP", validUntil: "2026-11-28", createdAt: "2026-10-29 09:10", updatedAt: "2026-10-29 09:30", approvalTaskId: "APR-3001" }),
  q({ id: "Q-10232", name: "Acme UK MVHR programme", customerId: "C-003", crmOpportunityId: "OPP-2", crmAccountId: "ACC-2", ownerId: "U-04", channel: "Direct", pricingDate: "2026-10-27", status: "SENT", revision: 2,
    lines: [{ id: "L1", sku: "EW-3100", qty: 60, requestedDiscountPct: 8 }, { id: "L2", sku: "HT-ELE-2K", qty: 20 }],
    history: [{ revision: 1, status: "SENT", createdAt: "2026-10-20 11:00", createdBy: "U-04", lines: [{ id: "L1", sku: "EW-3100", qty: 40, requestedDiscountPct: 5 }, { id: "L2", sku: "HT-ELE-2K", qty: 20 }, { id: "L3", sku: "LT-PNL-60", qty: 50 }], paymentTerms: "Net 45", incoterms: "DAP", validUntil: "2026-11-19", note: "Sent to procurement" }],
    paymentTerms: "Net 30", incoterms: "DAP", validUntil: "2026-11-30", createdAt: "2026-10-20 11:00", updatedAt: "2026-10-27 16:20", expectedMarginPct: 37.8,
    documents: [{ id: "DOC-881", kind: "PDF", template: "Standard quote", templateVersion: "v3", quoteRevision: 2, at: "2026-10-27 16:18", by: "U-04", hash: "sha256:9f2c…e41a" }] }),
  q({ id: "Q-10233", name: "Redington widget restock", customerId: "155010", crmOpportunityId: "OPP-3", crmAccountId: "ACC-3", ownerId: "U-16", channel: "Retail", pricingDate: "2026-11-15", status: "DRAFT", revision: 1,
    lines: [{ id: "L1", sku: "A-100", qty: 50, requestedUnitPrice: 38 }],
    paymentTerms: "Net 30", incoterms: "EXW", validUntil: "2026-12-15", createdAt: "2026-10-29 11:40", updatedAt: "2026-10-29 11:40" }),
  q({ id: "Q-10234", name: "A. Webb portal order — widgets", customerId: "878075", partnerId: "878075", ownerId: "U-12", channel: "Partner", pricingDate: "2026-10-28", status: "APPROVED", revision: 1,
    lines: [{ id: "L1", sku: "EW-3100", qty: 12, requestedDiscountPct: 12 }],
    justification: undefined, paymentTerms: "Net 30", incoterms: "DAP", validUntil: "2026-11-27", createdAt: "2026-10-28 13:40", updatedAt: "2026-10-28 13:41", expectedMarginPct: 31.2 }),
  q({ id: "Q-10235", name: "Urban Electricals panel order", customerId: "135991", partnerId: "135991", crmAccountId: "ACC-10", crmOpportunityId: "OPP-10", ownerId: "U-13", channel: "Partner", pricingDate: "2026-10-29", status: "PENDING_APPROVAL", revision: 1,
    lines: [{ id: "L1", sku: "LT-PNL-60", qty: 160, requestedDiscountPct: 14 }],
    justification: "VoltDirect is listing the same panel at £27.49; we need 14% to keep the contract.", paymentTerms: "Net 30", incoterms: "DAP", validUntil: "2026-11-28", createdAt: "2026-10-29 08:05", updatedAt: "2026-10-29 08:05", approvalTaskId: "APR-3005" }),
  q({ id: "Q-10236", name: "Acme US cable renewal FY27", customerId: "C-002", crmOpportunityId: "OPP-4", crmAccountId: "ACC-4", ownerId: "U-04", channel: "Direct", pricingDate: "2026-10-15", status: "ACCEPTED", revision: 1,
    lines: [{ id: "L1", sku: "CB-6.0", qty: 20_000 }, { id: "L2", sku: "CB-2.5", qty: 30_000 }],
    paymentTerms: "Net 45", incoterms: "DDP", validUntil: "2026-11-14", createdAt: "2026-10-12 10:00", updatedAt: "2026-10-20 15:10", expectedMarginPct: 30, actualMarginPct: 26, renewalOf: "Q-09811", priorTermRealizedMarginPct: 26.4,
    sync: { status: "SUCCESS", idempotencyKey: "q-10236-r1-7c1e", attempts: 1, erpOrderRef: "SO-4500231", updatedAt: "2026-10-20 15:12" },
    documents: [{ id: "DOC-870", kind: "PDF", template: "Standard quote", templateVersion: "v3", quoteRevision: 1, at: "2026-10-15 09:00", by: "U-04", hash: "sha256:11ab…90cd" }, { id: "DOC-871", kind: "ERP_SUMMARY", template: "ERP order summary", templateVersion: "v1", quoteRevision: 1, at: "2026-10-20 15:12", by: "System", hash: "sha256:44d0…a2b7" }] }),
  q({ id: "Q-10237", name: "Acme UK North heaters", customerId: "C-004", crmOpportunityId: "OPP-5", crmAccountId: "ACC-5", ownerId: "U-04", channel: "Direct", pricingDate: "2026-10-21", status: "ACCEPTED", revision: 1,
    lines: [{ id: "L1", sku: "HT-ELE-2K", qty: 60 }],
    paymentTerms: "Net 30", incoterms: "DAP", validUntil: "2026-11-20", createdAt: "2026-10-21 09:00", updatedAt: "2026-10-22 10:05", expectedMarginPct: 41,
    sync: { status: "FAILED", idempotencyKey: "q-10237-r1-0b9d", attempts: 1, updatedAt: "2026-10-22 10:06", lastError: { errorClass: "BUSINESS_RULE", code: "CUSTOMER_NOT_IN_ERP", message: "Acme UK North has no ERP customer number. Create the sold-to in SAP (XD01), then retry. Not retried automatically.", retryable: false, correlationId: "c-6e1a77" } } }),
  q({ id: "Q-10238", name: "Arrow India heaters", customerId: "155040", crmOpportunityId: "OPP-6", crmAccountId: "ACC-6", ownerId: "U-16", channel: "Direct", pricingDate: "2026-10-24", status: "ACCEPTED", revision: 1,
    lines: [{ id: "L1", sku: "HT-ELE-2K", qty: 150 }],
    paymentTerms: "Net 60", incoterms: "FCA", validUntil: "2026-11-23", createdAt: "2026-10-24 06:30", updatedAt: "2026-10-29 13:58", expectedMarginPct: 39.5,
    sync: { status: "RETRYING", idempotencyKey: "q-10238-r1-5f22", attempts: 2, nextRetryAt: "2026-10-29 15:00", updatedAt: "2026-10-29 13:58", lastError: { errorClass: "TRANSIENT_TECHNICAL", code: "ERP_TIMEOUT", message: "SAP did not answer within 30 seconds. Retrying automatically with back-off.", retryable: true, correlationId: "c-2d9f40" } } }),
  q({ id: "Q-10239", name: "A. Webb widget order (direct)", customerId: "878075", crmOpportunityId: "OPP-9", crmAccountId: "ACC-9", ownerId: "U-04", channel: "Distributor", pricingDate: "2026-10-26", status: "REJECTED", revision: 1,
    lines: [{ id: "L1", sku: "EW-3100", qty: 16, requestedDiscountPct: 24 }],
    paymentTerms: "Net 30", incoterms: "DAP", validUntil: "2026-11-25", createdAt: "2026-10-26 10:00", updatedAt: "2026-10-27 09:12", approvalTaskId: "APR-3008" }),
  q({ id: "Q-10229", name: "Rashi switchgear top-up", customerId: "C-1", crmOpportunityId: "OPP-8", crmAccountId: "ACC-8", ownerId: "U-16", channel: "Distributor", pricingDate: "2026-09-20", status: "EXPIRED", revision: 1,
    lines: [{ id: "L1", sku: "SW-RCD-63", qty: 200 }],
    paymentTerms: "Net 30", incoterms: "EXW", validUntil: "2026-10-20", createdAt: "2026-09-20 12:00", updatedAt: "2026-10-21 00:00" }),
  q({ id: "Q-10240", name: "Acme Global FY27 framework", customerId: "C-001", crmOpportunityId: "OPP-7", crmAccountId: "ACC-7", ownerId: "U-04", channel: "Direct", pricingDate: "2026-11-15", status: "PENDING_APPROVAL", revision: 1,
    lines: [{ id: "L1", sku: "EW-3100", qty: 400, requestedDiscountPct: 6 }, { id: "L2", sku: "SW-RCD-63", qty: 300 }],
    paymentTerms: "Net 60", incoterms: "DDP", validUntil: "2026-12-14", createdAt: "2026-10-28 11:00", updatedAt: "2026-10-28 11:30", approvalTaskId: "APR-3002" }),
  q({ id: "Q-10241", name: "A. Webb widget spot buy", customerId: "878075", crmOpportunityId: "OPP-9", crmAccountId: "ACC-9", ownerId: "U-04", channel: "Distributor", pricingDate: "2026-10-29", status: "PENDING_APPROVAL", revision: 1,
    lines: [{ id: "L1", sku: "A-100", qty: 300, requestedUnitPrice: 86 }],
    paymentTerms: "Net 30", incoterms: "DAP", validUntil: "2026-11-28", createdAt: "2026-10-29 08:20", updatedAt: "2026-10-29 08:30", approvalTaskId: "APR-3003" }),
];

export const quoteById = (id: string) => QUOTES.find((x) => x.id === id);
export function saveQuote(next: Quote) {
  const i = QUOTES.findIndex((x) => x.id === next.id);
  if (i >= 0) QUOTES[i] = next;
  else QUOTES.unshift(next);
}
export const nextQuoteId = () => `Q-${Math.max(...QUOTES.map((x) => Number(x.id.slice(2)))) + 1}`;

/** Prices every line of a quote and rolls up totals and the approval need. */
export function priceQuote(quote: Pick<Quote, "customerId" | "channel" | "pricingDate" | "lines" | "partnerId">) {
  const ctx = { customerId: quote.customerId, channel: quote.channel, pricingDate: quote.pricingDate };
  const results = quote.lines.map((l) => priceLine(ctx, l));
  const ok = results.filter((r): r is PricedLine => r.ok);
  const list = ok.reduce((a, r) => a + r.listPrice * r.qty, 0);
  const net = ok.reduce((a, r) => a + r.extended, 0);
  const cost = ok.reduce((a, r) => a + r.cost * r.qty, 0);
  const discountPct = list ? ((list - net) / list) * 100 : 0;
  const marginPct = net ? ((net - cost) / net) * 100 : 0;
  const reasons = Array.from(new Set(ok.flatMap((r) => r.guardrail.reasons)));
  const partnerLimit = quote.partnerId ? PARTNER_TIERS[quote.partnerId]?.discountLimitPct : undefined;
  const overPartnerLimit = partnerLimit !== undefined && ok.some((r) => r.discountPct > partnerLimit);
  return {
    results,
    failed: results.length - ok.length,
    totals: { list: round2(list), net: round2(net), cost: round2(cost), discountPct: round2(discountPct), marginPct: round2(marginPct), marginAmount: round2(net - cost) },
    blocked: ok.some((r) => r.guardrail.blocked),
    approvalRequired: ok.some((r) => r.guardrail.approvalRequired) || overPartnerLimit,
    reasons,
    partnerLimit,
    overPartnerLimit,
  };
}

/* ================================================================== */
/* Approval matrix (US-DD-01) & segregation of duties (US-DD-05)      */
/* ================================================================== */

export const APPLIES_TO = ["QUOTE", "EXCEPTION", "PRICE_LIST", "RECOMMENDATION"] as const;
export type AppliesTo = (typeof APPLIES_TO)[number];
export const APPROVAL_ATTRIBUTES = ["DISCOUNT_PCT", "MARGIN_PCT", "DEAL_VALUE", "CUSTOMER", "CUSTOMER_SEGMENT", "PRODUCT", "PRODUCT_CATEGORY", "REGION", "CHANNEL", "EXCEPTION_TYPE"] as const;
export type ApprovalAttribute = (typeof APPROVAL_ATTRIBUTES)[number];
export const APPROVAL_OPERATORS = ["EQ", "NEQ", "GT", "GTE", "LT", "LTE", "IN", "NOT_IN", "BETWEEN"] as const;
export type ApprovalOperator = (typeof APPROVAL_OPERATORS)[number];
export const OPERATOR_LABEL: Record<ApprovalOperator, string> = { EQ: "=", NEQ: "≠", GT: ">", GTE: "≥", LT: "<", LTE: "≤", IN: "in", NOT_IN: "not in", BETWEEN: "between" };
/** Runtime variables a condition value may reference. */
export const RUNTIME_VARIABLES = ["$guardrail.minMarginPct", "$partner.discountLimitPct", "$today", "$requester.role"] as const;
export const APPROVER_TYPES = ["ROLE", "USER", "REQUESTER_MANAGER", "POOL"] as const;
export const MAX_APPROVAL_LEVELS = 5;

export type ApprovalCondition = { attribute: ApprovalAttribute; operator: ApprovalOperator; value: string };
export type Approver = { type: (typeof APPROVER_TYPES)[number]; /** Job title for ROLE, user id for USER, pool name for POOL. */ value: string };
export type ApprovalLevel = { mode: "SEQUENTIAL" | "PARALLEL"; parallelRule?: "ALL" | "ANY"; approvers: Approver[]; slaHours: number; escalateTo: string };
export type ApprovalRule = {
  id: string;
  name: string;
  appliesTo: AppliesTo[];
  conditions: ApprovalCondition[];
  levels: ApprovalLevel[];
  effectiveFrom: string;
  effectiveTo?: string;
  version: number;
  status: "ACTIVE" | "SCHEDULED" | "DRAFT" | "INACTIVE";
  updatedBy: string;
  updatedAt: string;
};

export const APPROVAL_POOLS: Record<string, string[]> = { "Deal desk pool": ["U-08", "U-11"] };

const lvl = (approvers: Approver[], slaHours = 24, escalateTo = "Sales VP", mode: ApprovalLevel["mode"] = "SEQUENTIAL", parallelRule?: ApprovalLevel["parallelRule"]): ApprovalLevel => ({ mode, parallelRule, approvers, slaHours, escalateTo });
const role = (title: string): Approver => ({ type: "ROLE", value: title });

export const APPROVAL_RULES: ApprovalRule[] = [
  { id: "AR-01", name: "Discount over 10% up to 20%", appliesTo: ["QUOTE"], conditions: [{ attribute: "DISCOUNT_PCT", operator: "GT", value: "10" }, { attribute: "DISCOUNT_PCT", operator: "LTE", value: "20" }, { attribute: "CHANNEL", operator: "NEQ", value: "Partner" }], levels: [lvl([role("Sales Manager")], 24, "Sales VP")], effectiveFrom: "2026-01-01", version: 3, status: "ACTIVE", updatedBy: "U-02", updatedAt: "2025-12-15 10:00" },
  { id: "AR-02", name: "Discount above 20%", appliesTo: ["QUOTE"], conditions: [{ attribute: "DISCOUNT_PCT", operator: "GT", value: "20" }, { attribute: "CHANNEL", operator: "NEQ", value: "Partner" }], levels: [lvl([role("Sales VP")], 24, "CFO")], effectiveFrom: "2026-01-01", version: 3, status: "ACTIVE", updatedBy: "U-02", updatedAt: "2025-12-15 10:00" },
  { id: "AR-03", name: "Below margin floor needs VP", appliesTo: ["QUOTE"], conditions: [{ attribute: "MARGIN_PCT", operator: "LT", value: "$guardrail.minMarginPct" }], levels: [lvl([role("Sales VP")], 12, "CFO")], effectiveFrom: "2026-01-01", version: 1, status: "ACTIVE", updatedBy: "U-02", updatedAt: "2025-12-15 10:00" },
  { id: "AR-04", name: "Large deal — three levels", appliesTo: ["QUOTE"], conditions: [{ attribute: "DEAL_VALUE", operator: "GT", value: "250000" }], levels: [lvl([role("Sales Manager")], 24, "Sales VP"), lvl([role("Sales VP")], 24, "CFO"), lvl([role("CFO")], 48, "CFO")], effectiveFrom: "2026-01-01", version: 2, status: "ACTIVE", updatedBy: "U-09", updatedAt: "2026-02-01 09:00" },
  { id: "AR-05", name: "Competitive pressure exception", appliesTo: ["EXCEPTION"], conditions: [{ attribute: "EXCEPTION_TYPE", operator: "EQ", value: "COMPETITIVE_PRESSURE" }], levels: [lvl([role("Regional VP")], 48, "CFO")], effectiveFrom: "2026-01-01", version: 1, status: "ACTIVE", updatedBy: "U-02", updatedAt: "2025-12-15 10:00" },
  { id: "AR-06", name: "Strategic account exception", appliesTo: ["EXCEPTION"], conditions: [{ attribute: "EXCEPTION_TYPE", operator: "EQ", value: "STRATEGIC_ACCOUNT" }], levels: [lvl([role("CCO delegate")], 48, "CFO")], effectiveFrom: "2026-01-01", version: 1, status: "ACTIVE", updatedBy: "U-02", updatedAt: "2025-12-15 10:00" },
  { id: "AR-07", name: "Other exceptions — either approver", appliesTo: ["EXCEPTION"], conditions: [{ attribute: "EXCEPTION_TYPE", operator: "IN", value: "VOLUME_COMMITMENT, END_OF_LIFE, OTHER" }], levels: [lvl([role("Deal Desk Analyst"), role("Sales Manager")], 24, "Sales VP", "PARALLEL", "ANY")], effectiveFrom: "2026-01-01", version: 1, status: "ACTIVE", updatedBy: "U-02", updatedAt: "2025-12-15 10:00" },
  { id: "AR-08", name: "Partner over tier discount limit", appliesTo: ["QUOTE"], conditions: [{ attribute: "CHANNEL", operator: "EQ", value: "Partner" }, { attribute: "DISCOUNT_PCT", operator: "GT", value: "$partner.discountLimitPct" }], levels: [lvl([role("Sales Manager")], 4, "Sales VP")], effectiveFrom: "2026-01-01", version: 1, status: "ACTIVE", updatedBy: "U-02", updatedAt: "2026-03-01 09:00" },
  { id: "AR-09", name: "Strategic customer over 15% — both approve", appliesTo: ["QUOTE"], conditions: [{ attribute: "CUSTOMER_SEGMENT", operator: "EQ", value: "Strategic" }, { attribute: "DISCOUNT_PCT", operator: "GT", value: "15" }], levels: [lvl([role("Sales VP"), role("Deal Desk Analyst")], 24, "CFO", "PARALLEL", "ALL")], effectiveFrom: "2026-01-01", version: 1, status: "ACTIVE", updatedBy: "U-02", updatedAt: "2026-03-01 09:00" },
  { id: "AR-10", name: "Price list publication", appliesTo: ["PRICE_LIST"], conditions: [{ attribute: "REGION", operator: "IN", value: "UK, EU, North America, India" }], levels: [lvl([role("Pricing Manager")], 48, "CFO")], effectiveFrom: "2026-01-01", version: 1, status: "ACTIVE", updatedBy: "U-09", updatedAt: "2026-01-02 09:00" },
  { id: "AR-11", name: "Recommendation below margin floor", appliesTo: ["RECOMMENDATION"], conditions: [{ attribute: "MARGIN_PCT", operator: "LT", value: "$guardrail.minMarginPct" }], levels: [lvl([role("Pricing Manager")], 48, "CFO")], effectiveFrom: "2026-01-01", version: 1, status: "ACTIVE", updatedBy: "U-02", updatedAt: "2026-01-02 09:00" },
  { id: "AR-12", name: "EU deals over £100k (from Dec)", appliesTo: ["QUOTE"], conditions: [{ attribute: "REGION", operator: "EQ", value: "EU" }, { attribute: "DEAL_VALUE", operator: "GT", value: "100000" }], levels: [lvl([role("Sales VP")], 24, "CFO")], effectiveFrom: "2026-12-01", version: 1, status: "SCHEDULED", updatedBy: "U-02", updatedAt: "2026-10-28 15:00" },
];

export type ApprovalContext = {
  appliesTo: AppliesTo;
  discountPct?: number;
  marginPct?: number;
  minMarginPct?: number;
  dealValue?: number;
  customerId?: string;
  sku?: string;
  region?: string;
  channel?: string;
  exceptionType?: string;
  partnerLimitPct?: number;
  requesterId?: string;
  date?: string;
};

function attrValue(ctx: ApprovalContext, a: ApprovalAttribute): string | number | undefined {
  const cust = ctx.customerId ? customerById(ctx.customerId) : undefined;
  const prod = ctx.sku ? productBySku(ctx.sku) : undefined;
  return {
    DISCOUNT_PCT: ctx.discountPct,
    MARGIN_PCT: ctx.marginPct,
    DEAL_VALUE: ctx.dealValue,
    CUSTOMER: cust?.name,
    CUSTOMER_SEGMENT: cust?.segment,
    PRODUCT: prod?.sku,
    PRODUCT_CATEGORY: prod?.category,
    REGION: ctx.region ?? cust?.geography,
    CHANNEL: ctx.channel,
    EXCEPTION_TYPE: ctx.exceptionType,
  }[a];
}

export function conditionHolds(c: ApprovalCondition, ctx: ApprovalContext): boolean {
  const v = attrValue(ctx, c.attribute);
  if (v === undefined) return false;
  const raw = c.value.trim();
  const resolved = raw === "$guardrail.minMarginPct" ? ctx.minMarginPct : raw === "$partner.discountLimitPct" ? ctx.partnerLimitPct : raw;
  if (resolved === undefined) return false;
  if (typeof v === "number") {
    if (c.operator === "BETWEEN") {
      const [a, b] = String(resolved).split(/\s*(?:\.\.|…|-)\s*/).map(Number);
      return v >= a && v <= b;
    }
    const n = Number(resolved);
    return ({ EQ: v === n, NEQ: v !== n, GT: v > n, GTE: v >= n, LT: v < n, LTE: v <= n } as Record<string, boolean>)[c.operator] ?? false;
  }
  const list = String(resolved).split(",").map((s) => s.trim().toLowerCase());
  const s = String(v).toLowerCase();
  if (c.operator === "IN") return list.includes(s);
  if (c.operator === "NOT_IN") return !list.includes(s);
  if (c.operator === "NEQ") return s !== String(resolved).toLowerCase();
  return s === String(resolved).toLowerCase();
}

/** Users an approver entry resolves to. */
export function resolveApprover(a: Approver, requesterId?: string): string[] {
  if (a.type === "USER") return [a.value];
  if (a.type === "POOL") return APPROVAL_POOLS[a.value] ?? [];
  if (a.type === "REQUESTER_MANAGER") {
    const m = userById(requesterId)?.managerId;
    return m ? [m] : [];
  }
  const u = userByTitle(a.value);
  return u ? [u.id] : [];
}

export type ResolvedStep = {
  level: number;
  mode: ApprovalLevel["mode"];
  parallelRule?: ApprovalLevel["parallelRule"];
  approverIds: string[];
  slaHours: number;
  escalateTo: string;
  fromRules: string[];
};
export type SodConflict = { requesterId: string; level: number; replacedWith: string; action: "REASSIGNED" | "ESCALATED_FALLBACK" | "BLOCKED" };

/**
 * All matching rules apply (US-DD-01). Level n of every matching rule merges into step n; an approver
 * already in an earlier step is dropped so nobody approves the same item twice (AC#5, APPROVER_CHAIN_DISTINCT).
 * The requester can never approve their own high-risk item (US-DD-05) — they are replaced and the conflict is returned.
 */
export function resolveApprovals(ctx: ApprovalContext, rules: ApprovalRule[] = APPROVAL_RULES) {
  const date = ctx.date ?? TODAY_ISO;
  const matched = rules.filter(
    (r) =>
      (r.status === "ACTIVE" || (r.status === "SCHEDULED" && date >= r.effectiveFrom)) &&
      date >= r.effectiveFrom &&
      (!r.effectiveTo || date <= r.effectiveTo) &&
      r.appliesTo.includes(ctx.appliesTo) &&
      r.conditions.length > 0 &&
      r.conditions.every((c) => conditionHolds(c, ctx)),
  );
  const depth = Math.max(0, ...matched.map((r) => r.levels.length));
  const seen = new Set<string>();
  const steps: ResolvedStep[] = [];
  const conflicts: SodConflict[] = [];
  for (let i = 0; i < depth; i++) {
    const parts = matched.filter((r) => r.levels[i]).map((r) => ({ r, l: r.levels[i] }));
    const ids: string[] = [];
    for (const { l } of parts)
      for (const a of l.approvers)
        for (const id of resolveApprover(a, ctx.requesterId)) {
          if (id === ctx.requesterId && SOD_POLICY.enabled) {
            const next = resolveApprover({ type: "ROLE", value: l.escalateTo })[0];
            const replacement = next && next !== ctx.requesterId ? next : SOD_POLICY.fallbackApproverId;
            conflicts.push({ requesterId: id, level: i + 1, replacedWith: replacement, action: SOD_POLICY.onConflict === "BLOCK" ? "BLOCKED" : next && next !== ctx.requesterId ? "REASSIGNED" : "ESCALATED_FALLBACK" });
            if (SOD_POLICY.onConflict === "BLOCK") continue;
            if (!seen.has(replacement)) ids.push(replacement), seen.add(replacement);
            continue;
          }
          if (!seen.has(id)) ids.push(id), seen.add(id);
        }
    if (!ids.length) continue;
    const parallel = parts.find((p) => p.l.mode === "PARALLEL")?.l;
    steps.push({
      level: steps.length + 1,
      mode: ids.length > 1 ? "PARALLEL" : "SEQUENTIAL",
      parallelRule: ids.length > 1 ? (parallel?.parallelRule ?? "ALL") : undefined,
      approverIds: ids,
      slaHours: Math.min(...parts.map((p) => p.l.slaHours)),
      escalateTo: parts[0].l.escalateTo,
      fromRules: parts.map((p) => p.r.id),
    });
  }
  return { matched, steps, conflicts, required: steps.length > 0 };
}

/** Approval context for a quote — feeds resolveApprovals. */
export function quoteApprovalContext(quote: Quote): ApprovalContext {
  const p = priceQuote(quote);
  const ok = p.results.filter((r): r is PricedLine => r.ok);
  const worst = ok.reduce<PricedLine | undefined>((a, r) => (!a || r.discountPct > a.discountPct ? r : a), undefined);
  const minMargin = ok.map((r) => r.guardrail.minMarginPct).filter((x): x is number => x !== undefined);
  return {
    appliesTo: "QUOTE",
    discountPct: worst?.discountPct ?? 0,
    marginPct: Math.min(...ok.map((r) => r.marginPct), 100),
    minMarginPct: minMargin.length ? Math.max(...minMargin) : undefined,
    dealValue: p.totals.net,
    customerId: quote.customerId,
    sku: worst?.sku,
    channel: quote.channel,
    partnerLimitPct: p.partnerLimit,
    requesterId: quote.ownerId,
    date: quote.pricingDate,
  };
}

export const SOD_RULES = ["REQUESTER_NE_APPROVER", "CREATOR_NE_APPROVER", "APPROVER_CHAIN_DISTINCT"] as const;
export const SOD_POLICY = {
  enabled: true,
  rules: [...SOD_RULES] as Array<(typeof SOD_RULES)[number]>,
  appliesTo: ["QUOTE", "EXCEPTION", "PRICE_LIST", "GUARDRAIL", "RULE"] as string[],
  highRisk: { dealValueAbove: 250_000, marginBelowFloor: true, priceListPublication: true, ruleOrGuardrailChange: true },
  onConflict: "REASSIGN_NEXT" as "REASSIGN_NEXT" | "BLOCK",
  fallbackApproverId: "U-09",
};
export const SOD_LOG = [
  { id: "SOD-12", at: "2026-10-28 11:31", entity: "QUOTE", ref: "Q-10198", requesterId: "U-05", assignedId: "U-05", action: "REASSIGNED", toId: "U-06", channel: "UI", note: "Maya Iyer raised the quote and was its first approver — reassigned to the Sales VP." },
  { id: "SOD-11", at: "2026-10-24 09:02", entity: "PRICE_LIST", ref: "PR-011", requesterId: "U-01", assignedId: "U-01", action: "DENIED", toId: undefined, channel: "API", note: "The submitter tried to approve their own price list through the API — denied." },
  { id: "SOD-10", at: "2026-10-19 16:40", entity: "EXCEPTION", ref: "EXC-698", requesterId: "U-09", assignedId: "U-09", action: "ESCALATED_FALLBACK", toId: "U-11", channel: "UI", note: "Only eligible approver was the requester — escalated to the configured fallback approver." },
];

/* ================================================================== */
/* Approval tasks, delegation, trail (US-DD-04, US-DD-07)             */
/* ================================================================== */

export const TASK_STATUSES = ["PENDING", "APPROVED", "REJECTED", "SENT_BACK", "SKIPPED", "ESCALATED", "EXPIRED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const DECISIONS = ["APPROVED", "REJECTED", "SENT_BACK", "ADJUSTED"] as const;
export type Decision = (typeof DECISIONS)[number];
export type SlaStatus = "ON_TRACK" | "AT_RISK" | "BREACHED";

export type StepApprover = { userId: string; status: TaskStatus; decidedAt?: string; comment?: string; onBehalfOf?: string };
export type TaskStep = { level: number; mode: "SEQUENTIAL" | "PARALLEL"; parallelRule?: "ALL" | "ANY"; approvers: StepApprover[]; slaHours: number; dueAt?: string; escalateTo: string };
export type TrailEntry = {
  id: string;
  at: string;
  actorId: string;
  onBehalfOf?: string;
  action: "SUBMITTED" | "APPROVED" | "REJECTED" | "SENT_BACK" | "ADJUSTED" | "ESCALATED" | "REASSIGNED" | "SKIPPED" | "RESUBMITTED" | "WITHDRAWN" | "EDIT_DENIED";
  level?: number;
  comment?: string;
  previousValue?: string;
  newValue?: string;
};
export type ApprovalTask = {
  id: string;
  requestType: AppliesTo;
  refId: string;
  title: string;
  customerId: string;
  dealValue: number;
  discountPct: number;
  marginPct: number;
  exceptionType?: string;
  requesterId: string;
  submittedAt: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "SENT_BACK" | "WITHDRAWN";
  currentLevel: number;
  steps: TaskStep[];
  ruleIds: string[];
  highRisk: boolean;
  /** Approved price after an ADJUSTED decision. */
  approvedValue?: string;
  trail: TrailEntry[];
};

const step = (level: number, approvers: Array<[string, TaskStatus, string?, string?, string?]>, slaHours: number, dueAt: string | undefined, escalateTo: string, parallelRule?: "ALL" | "ANY"): TaskStep => ({
  level,
  mode: approvers.length > 1 ? "PARALLEL" : "SEQUENTIAL",
  parallelRule,
  approvers: approvers.map(([userId, status, decidedAt, comment, onBehalfOf]) => ({ userId, status, decidedAt, comment, onBehalfOf })),
  slaHours,
  dueAt,
  escalateTo,
});

export const APPROVAL_TASKS: ApprovalTask[] = [
  {
    id: "APR-3001", requestType: "QUOTE", refId: "Q-10231", title: "Edmundson Q4 lighting refresh — 18% on LED panels", customerId: "878070", dealValue: 24_346, discountPct: 18, marginPct: 37.3, requesterId: "U-04", submittedAt: "2026-10-29 09:30",
    status: "PENDING", currentLevel: 1, ruleIds: ["AR-01"], highRisk: false,
    steps: [step(1, [["U-05", "PENDING"]], 24, "2026-10-31 14:30", "Sales VP")],
    trail: [{ id: "T1", at: "2026-10-29 09:30", actorId: "U-04", action: "SUBMITTED", comment: "Competing with VoltDirect on the panel line.", newValue: "18% discount" }],
  },
  {
    id: "APR-3002", requestType: "QUOTE", refId: "Q-10240", title: "Acme Global FY27 framework — £270k", customerId: "C-001", dealValue: 270_464, discountPct: 6, marginPct: 36.7, requesterId: "U-04", submittedAt: "2026-10-28 11:30",
    status: "PENDING", currentLevel: 2, ruleIds: ["AR-04"], highRisk: true,
    steps: [step(1, [["U-05", "APPROVED", "2026-10-28 15:30", "Volumes confirmed with procurement."]], 24, "2026-10-29 11:30", "Sales VP"), step(2, [["U-06", "PENDING"]], 24, "2026-10-29 15:30", "CFO"), step(3, [["U-09", "PENDING"]], 48, undefined, "CFO")],
    trail: [
      { id: "T1", at: "2026-10-28 11:30", actorId: "U-04", action: "SUBMITTED", newValue: "£270,464 · 6% on MVHR" },
      { id: "T2", at: "2026-10-28 15:30", actorId: "U-05", action: "APPROVED", level: 1, comment: "Volumes confirmed with procurement." },
    ],
  },
  {
    id: "APR-3003", requestType: "QUOTE", refId: "Q-10241", title: "A. Webb widget spot buy — margin below 22% floor", customerId: "878075", dealValue: 25_800, discountPct: 21.8, marginPct: 18.6, requesterId: "U-04", submittedAt: "2026-10-29 08:30",
    status: "PENDING", currentLevel: 1, ruleIds: ["AR-02", "AR-03"], highRisk: true,
    steps: [step(1, [["U-06", "PENDING"]], 12, "2026-10-29 20:30", "CFO")],
    trail: [{ id: "T1", at: "2026-10-29 08:30", actorId: "U-04", action: "SUBMITTED", comment: "Spot buy to clear their backlog.", newValue: "£86.00 / EA (margin 18.6%)" }],
  },
  {
    id: "APR-3004", requestType: "EXCEPTION", refId: "EXC-701", title: "Edmundson LED panels — competitive pressure", customerId: "878070", dealValue: 26_900, discountPct: 22, marginPct: 32.3, exceptionType: "COMPETITIVE_PRESSURE", requesterId: "U-04", submittedAt: "2026-10-29 10:00",
    status: "PENDING", currentLevel: 1, ruleIds: ["AR-05"], highRisk: false,
    steps: [step(1, [["U-07", "PENDING"]], 48, "2026-10-31 10:00", "CFO")],
    trail: [{ id: "T1", at: "2026-10-29 10:00", actorId: "U-04", action: "SUBMITTED", comment: "VoltDirect quoting £26.50.", newValue: "£26.90 / EA until 2027-03-31" }],
  },
  {
    id: "APR-3005", requestType: "QUOTE", refId: "Q-10235", title: "Urban Electricals portal order — 14% (limit 10%)", customerId: "135991", dealValue: 4_747, discountPct: 14, marginPct: 38.7, requesterId: "U-13", submittedAt: "2026-10-29 08:05",
    status: "PENDING", currentLevel: 1, ruleIds: ["AR-08"], highRisk: false,
    steps: [step(1, [["U-05", "ESCALATED"], ["U-06", "PENDING"]], 4, "2026-10-29 12:05", "Sales VP", "ANY")],
    trail: [
      { id: "T1", at: "2026-10-29 08:05", actorId: "U-13", action: "SUBMITTED", comment: "VoltDirect is listing the same panel at £27.49.", newValue: "14% discount" },
      { id: "T2", at: "2026-10-29 12:05", actorId: "System", action: "ESCALATED", level: 1, comment: "SLA of 4 hours breached — escalated to Sales VP." },
    ],
  },
  {
    id: "APR-3006", requestType: "EXCEPTION", refId: "EXC-702", title: "Acme Global MVHR — strategic account", customerId: "C-001", dealValue: 141_120, discountPct: 15, marginPct: 29.6, exceptionType: "STRATEGIC_ACCOUNT", requesterId: "U-04", submittedAt: "2026-10-10 09:00",
    status: "APPROVED", currentLevel: 1, ruleIds: ["AR-06"], highRisk: false,
    steps: [step(1, [["U-11", "APPROVED", "2026-10-11 10:20", "Approved for FY27 framework only."]], 48, "2026-10-12 09:00", "CFO")],
    trail: [
      { id: "T1", at: "2026-10-10 09:00", actorId: "U-04", action: "SUBMITTED", newValue: "£585.65 / EA until 2026-12-31" },
      { id: "T2", at: "2026-10-11 10:20", actorId: "U-11", action: "APPROVED", level: 1, comment: "Approved for FY27 framework only.", previousValue: "£689.00", newValue: "£585.65" },
    ],
  },
  {
    id: "APR-3007", requestType: "EXCEPTION", refId: "EXC-703", title: "Rashi cable — volume commitment", customerId: "C-1", dealValue: 31_500, discountPct: 9, marginPct: 34.1, exceptionType: "VOLUME_COMMITMENT", requesterId: "U-16", submittedAt: "2026-10-20 07:00",
    status: "APPROVED", currentLevel: 1, ruleIds: ["AR-07"], highRisk: false,
    steps: [step(1, [["U-08", "APPROVED", "2026-10-20 11:45", "12-month volume letter attached."], ["U-05", "SKIPPED"]], 24, "2026-10-21 07:00", "Sales VP", "ANY")],
    trail: [
      { id: "T1", at: "2026-10-20 07:00", actorId: "U-16", action: "SUBMITTED", newValue: "£0.95 / M until 2027-06-30" },
      { id: "T2", at: "2026-10-20 11:45", actorId: "U-08", action: "APPROVED", level: 1, comment: "12-month volume letter attached.", previousValue: "£1.05", newValue: "£0.95" },
      { id: "T3", at: "2026-10-20 11:45", actorId: "System", action: "SKIPPED", level: 1, comment: "Parallel rule ANY satisfied — Maya Iyer's task skipped." },
    ],
  },
  {
    id: "APR-3008", requestType: "QUOTE", refId: "Q-10239", title: "A. Webb widget order — 24% on MVHR", customerId: "878075", dealValue: 8_380, discountPct: 24, marginPct: 22.4, requesterId: "U-04", submittedAt: "2026-10-26 10:10",
    status: "REJECTED", currentLevel: 1, ruleIds: ["AR-02"], highRisk: false,
    steps: [step(1, [["U-06", "REJECTED", "2026-10-27 09:12", "Above our distributor band. Re-quote at 15% with volume tiers."]], 24, "2026-10-27 10:10", "CFO")],
    trail: [
      { id: "T1", at: "2026-10-26 10:10", actorId: "U-04", action: "SUBMITTED", newValue: "24% discount" },
      { id: "T2", at: "2026-10-27 09:12", actorId: "U-06", action: "REJECTED", level: 1, comment: "Above our distributor band. Re-quote at 15% with volume tiers." },
      { id: "T3", at: "2026-10-27 09:40", actorId: "U-08", action: "EDIT_DENIED", comment: "Attempt to edit trail entry T2 denied — the approval trail is immutable." },
    ],
  },
];

export const taskById = (id?: string) => APPROVAL_TASKS.find((t) => t.id === id);
export function saveTask(t: ApprovalTask) {
  const i = APPROVAL_TASKS.findIndex((x) => x.id === t.id);
  if (i >= 0) APPROVAL_TASKS[i] = t;
  else APPROVAL_TASKS.unshift(t);
}
export const nextTaskId = () => `APR-${Math.max(...APPROVAL_TASKS.map((t) => Number(t.id.slice(4)))) + 1}`;

/** The step waiting for a decision. */
export const currentStep = (t: ApprovalTask) => t.steps.find((s) => s.level === t.currentLevel);

/** ON_TRACK, AT_RISK (8 hours or less left) or BREACHED. */
export function slaStatus(dueAt: string | undefined, now = NOW): SlaStatus {
  if (!dueAt) return "ON_TRACK";
  const left = hoursBetween(now, dueAt);
  return left < 0 ? "BREACHED" : left <= 8 ? "AT_RISK" : "ON_TRACK";
}
export const SLA_RANK: Record<SlaStatus, number> = { BREACHED: 0, AT_RISK: 1, ON_TRACK: 2 };

export type Delegation = { id: string; fromId: string; toId: string; from: string; to: string; reason: string; createdAt: string };
export const DELEGATIONS: Delegation[] = [
  { id: "DLG-2", fromId: "U-07", toId: "U-06", from: "2026-10-27", to: "2026-10-31", reason: "Neel at customer site visits in Chicago", createdAt: "2026-10-26 17:00" },
  { id: "DLG-3", fromId: "U-05", toId: "U-06", from: "2026-11-02", to: "2026-11-06", reason: "Annual leave", createdAt: "2026-10-28 09:00" },
];
/** Users `userId` may currently decide for (themselves + active delegations to them). */
export function actingFor(userId: string, date = TODAY_ISO) {
  return [userId, ...DELEGATIONS.filter((d) => d.toId === userId && date >= d.from && date <= d.to).map((d) => d.fromId)];
}

/* ================================================================== */
/* Pricing exceptions (US-DD-03)                                      */
/* ================================================================== */

export const JUSTIFICATIONS = ["COMPETITIVE_PRESSURE", "VOLUME_COMMITMENT", "STRATEGIC_ACCOUNT", "END_OF_LIFE", "OTHER"] as const;
export type Justification = (typeof JUSTIFICATIONS)[number];
export const EXCEPTION_STATUSES = ["DRAFT", "SUBMITTED", "IN_APPROVAL", "APPROVED", "REJECTED", "SENT_BACK", "WITHDRAWN", "EXPIRED"] as const;
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];
export const MAX_EXCEPTION_MONTHS = 12;

export type PricingException = {
  id: string;
  customerId: string;
  sku: string;
  qty: number;
  currentPrice: number;
  requestedPrice: number;
  recommendedPrice: number;
  justification: Justification;
  reason: string;
  competitorName?: string;
  competitorPrice?: number;
  expiryDate: string;
  status: ExceptionStatus;
  requesterId: string;
  createdAt: string;
  updatedAt: string;
  approvalTaskId?: string;
  quoteId?: string;
  decisionComment?: string;
};

export const EXCEPTIONS: PricingException[] = [
  { id: "EXC-701", customerId: "878070", sku: "LT-PNL-60", qty: 1_000, currentPrice: 34.5, requestedPrice: 26.9, recommendedPrice: 31.2, justification: "COMPETITIVE_PRESSURE", reason: "VoltDirect is quoting £26.50 delivered for the Q4 refresh.", competitorName: "VoltDirect", competitorPrice: 26.5, expiryDate: "2027-03-31", status: "IN_APPROVAL", requesterId: "U-04", createdAt: "2026-10-29 09:50", updatedAt: "2026-10-29 10:00", approvalTaskId: "APR-3004", quoteId: "Q-10231" },
  { id: "EXC-702", customerId: "C-001", sku: "EW-3100", qty: 240, currentPrice: 689, requestedPrice: 585.65, recommendedPrice: 668.33, justification: "STRATEGIC_ACCOUNT", reason: "FY27 framework anchor price for the global account.", expiryDate: "2026-12-31", status: "APPROVED", requesterId: "U-04", createdAt: "2026-10-10 08:40", updatedAt: "2026-10-11 10:20", approvalTaskId: "APR-3006", decisionComment: "Approved for FY27 framework only." },
  { id: "EXC-703", customerId: "C-1", sku: "CB-2.5", qty: 33_000, currentPrice: 1.05, requestedPrice: 0.95, recommendedPrice: 0.98, justification: "VOLUME_COMMITMENT", reason: "Signed 12-month volume commitment of 400,000 m.", expiryDate: "2027-06-30", status: "APPROVED", requesterId: "U-16", createdAt: "2026-10-20 06:50", updatedAt: "2026-10-20 11:45", approvalTaskId: "APR-3007", decisionComment: "12-month volume letter attached." },
  { id: "EXC-704", customerId: "135991", sku: "LT-DWN-10", qty: 80, currentPrice: 79, requestedPrice: 64, recommendedPrice: 72, justification: "END_OF_LIFE", reason: "Clearing phase-out stock before 31 Dec.", expiryDate: "2026-12-31", status: "DRAFT", requesterId: "U-04", createdAt: "2026-10-29 12:00", updatedAt: "2026-10-29 12:00" },
  { id: "EXC-705", customerId: "155010", sku: "A-100", qty: 120, currentPrice: 105.6, requestedPrice: 92, recommendedPrice: 101, justification: "OTHER", reason: "Customer asked for parity with last year's price.", expiryDate: "2027-01-31", status: "SENT_BACK", requesterId: "U-16", createdAt: "2026-10-25 10:00", updatedAt: "2026-10-26 09:30", decisionComment: "Add volume evidence or a competitor quote." },
  { id: "EXC-700", customerId: "155040", sku: "HT-ELE-2K", qty: 300, currentPrice: 149, requestedPrice: 136, recommendedPrice: 141, justification: "COMPETITIVE_PRESSURE", reason: "Local manufacturer undercut for the summer tender.", competitorName: "Havells", competitorPrice: 134, expiryDate: "2026-09-30", status: "EXPIRED", requesterId: "U-16", createdAt: "2026-06-02 08:00", updatedAt: "2026-10-01 00:00", decisionComment: "Approved until 30 Sep. Standard pricing resumed on 1 Oct." },
  { id: "EXC-699", customerId: "878075", sku: "A-100", qty: 40, currentPrice: 106.7, requestedPrice: 96, recommendedPrice: 104.5, justification: "OTHER", reason: "Duplicate of a quote discount — withdrawn.", expiryDate: "2026-12-31", status: "WITHDRAWN", requesterId: "U-04", createdAt: "2026-10-22 13:00", updatedAt: "2026-10-22 13:20" },
];
export const exceptionById = (id?: string) => EXCEPTIONS.find((e) => e.id === id);
export function saveException(e: PricingException) {
  const i = EXCEPTIONS.findIndex((x) => x.id === e.id);
  if (i >= 0) EXCEPTIONS[i] = e;
  else EXCEPTIONS.unshift(e);
}
export const nextExceptionId = () => `EXC-${Math.max(...EXCEPTIONS.map((e) => Number(e.id.slice(4)))) + 1}`;
/** The exception covering a customer + product on a date, if approved and unexpired. */
export const activeExceptionFor = (customerId: string, sku: string, date = TODAY_ISO) =>
  EXCEPTIONS.find((e) => e.customerId === customerId && e.sku === sku && e.status === "APPROVED" && date <= e.expiryDate);

/* ================================================================== */
/* Notifications (US-DD-06)                                           */
/* ================================================================== */

export const NOTIFICATION_EVENTS = ["APPROVAL_ASSIGNED", "APPROVAL_REMINDER", "SLA_BREACH", "ESCALATION", "DECISION_MADE", "CONTRACT_EXPIRY", "THRESHOLD_BREACH", "SYNC_FAILURE", "PUBLICATION_FAILURE"] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];
/** Critical events can't be muted by users. */
export const CRITICAL_EVENTS: NotificationEvent[] = ["SLA_BREACH", "ESCALATION", "SYNC_FAILURE", "PUBLICATION_FAILURE"];
export const NOTIFICATION_CHANNELS = ["EMAIL", "TEAMS_SLACK", "IN_APP"] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export const CONTRACT_EXPIRY_LEAD_DAYS = [60, 30, 7];

export type Delivery = { channel: NotificationChannel; status: "DELIVERED" | "FAILED" | "RETRYING" | "SUPPRESSED"; attempts: number; detail?: string };
export type AppNotification = {
  id: string;
  event: NotificationEvent;
  recipientId: string;
  at: string;
  title: string;
  /** Pre-filtered by field-level security of the recipient (margin omitted when not permitted). */
  body: string;
  link?: { to: string; params?: Record<string, string> };
  read: boolean;
  deliveries: Delivery[];
};

export const NOTIFICATIONS: AppNotification[] = [
  { id: "N-501", event: "APPROVAL_ASSIGNED", recipientId: "U-05", at: "2026-10-29 09:30", title: "Approve Q-10231 · Edmundson Electrical", body: "Discount 18% · margin 37.3% · deal value £24,346. Due in 2 days.", link: { to: "/pricing/approvals" }, read: false, deliveries: [{ channel: "EMAIL", status: "DELIVERED", attempts: 1 }, { channel: "TEAMS_SLACK", status: "DELIVERED", attempts: 1 }, { channel: "IN_APP", status: "DELIVERED", attempts: 1 }] },
  { id: "N-502", event: "APPROVAL_ASSIGNED", recipientId: "U-06", at: "2026-10-28 15:30", title: "Approve Q-10240 · Acme Global (level 2 of 3)", body: "Discount 6% · margin 36.7% · deal value £270,464. Due today 15:30.", link: { to: "/pricing/approvals" }, read: false, deliveries: [{ channel: "EMAIL", status: "DELIVERED", attempts: 1 }, { channel: "TEAMS_SLACK", status: "DELIVERED", attempts: 1 }, { channel: "IN_APP", status: "DELIVERED", attempts: 1 }] },
  { id: "N-503", event: "SLA_BREACH", recipientId: "U-13", at: "2026-10-29 12:05", title: "Q-10235 approval is overdue", body: "Your Urban Electricals panel order passed its 4-hour approval SLA and was escalated to the Sales VP.", link: { to: "/pricing/partner-portal" }, read: false, deliveries: [{ channel: "EMAIL", status: "DELIVERED", attempts: 1 }, { channel: "IN_APP", status: "DELIVERED", attempts: 1 }] },
  { id: "N-504", event: "ESCALATION", recipientId: "U-06", at: "2026-10-29 12:05", title: "Escalated to you: Q-10235 · Urban Electricals", body: "Discount 14% · margin 38.7% · deal value £4,747. Sales Manager didn't act within 4 hours.", link: { to: "/pricing/approvals" }, read: false, deliveries: [{ channel: "EMAIL", status: "DELIVERED", attempts: 1 }, { channel: "TEAMS_SLACK", status: "FAILED", attempts: 3, detail: "Webhook returned 410 Gone — channel archived" }, { channel: "IN_APP", status: "DELIVERED", attempts: 1 }] },
  { id: "N-505", event: "APPROVAL_ASSIGNED", recipientId: "U-07", at: "2026-10-29 10:00", title: "Approve EXC-701 · Edmundson Electrical", body: "Competitive pressure · discount 22% · margin 32.3% · deal value £26,900.", link: { to: "/pricing/approvals" }, read: true, deliveries: [{ channel: "EMAIL", status: "DELIVERED", attempts: 1 }, { channel: "IN_APP", status: "DELIVERED", attempts: 1 }] },
  { id: "N-506", event: "DECISION_MADE", recipientId: "U-04", at: "2026-10-27 09:12", title: "Q-10239 rejected by Daniel Brooks", body: "“Above our distributor band. Re-quote at 15% with volume tiers.”", link: { to: "/pricing/quotes/$id", params: { id: "Q-10239" } }, read: true, deliveries: [{ channel: "EMAIL", status: "DELIVERED", attempts: 1 }, { channel: "IN_APP", status: "DELIVERED", attempts: 1 }] },
  { id: "N-507", event: "CONTRACT_EXPIRY", recipientId: "U-04", at: "2026-10-29 06:00", title: "Contract price expires in 30 days", body: "Edmundson Customer List override on LT-PNL-60 ends 2026-11-28. Renew or let standard pricing apply.", link: { to: "/pricing/price-lists/$id", params: { id: "CL-001" } }, read: false, deliveries: [{ channel: "EMAIL", status: "DELIVERED", attempts: 1 }, { channel: "IN_APP", status: "DELIVERED", attempts: 1 }] },
  { id: "N-508", event: "THRESHOLD_BREACH", recipientId: "U-04", at: "2026-10-28 07:00", title: "Margin drift on Q-10236 · Acme US", body: "Expected 30.0%, invoiced 26.0% — 4.0 points below (threshold 2 points).", link: { to: "/pricing/analytics/deal-profitability" }, read: false, deliveries: [{ channel: "EMAIL", status: "DELIVERED", attempts: 1 }, { channel: "IN_APP", status: "DELIVERED", attempts: 1 }] },
  { id: "N-509", event: "SYNC_FAILURE", recipientId: "U-04", at: "2026-10-22 10:06", title: "Q-10237 didn't reach the ERP", body: "CUSTOMER_NOT_IN_ERP — Acme UK North has no ERP customer number. Not retried automatically.", link: { to: "/pricing/quotes/$id", params: { id: "Q-10237" } }, read: false, deliveries: [{ channel: "EMAIL", status: "DELIVERED", attempts: 1 }, { channel: "IN_APP", status: "DELIVERED", attempts: 1 }] },
  { id: "N-510", event: "SYNC_FAILURE", recipientId: "U-14", at: "2026-10-22 10:06", title: "ERP order sync failed · Q-10237", body: "CUSTOMER_NOT_IN_ERP. Integration: SAP ERP orders.", link: { to: "/pricing/admin/integrations" }, read: false, deliveries: [{ channel: "EMAIL", status: "DELIVERED", attempts: 1 }, { channel: "IN_APP", status: "DELIVERED", attempts: 1 }] },
  { id: "N-511", event: "PUBLICATION_FAILURE", recipientId: "U-01", at: "2026-10-29 03:20", title: "Publication PUB-2207 partly failed", body: "15 of 2,000 records failed to reach SAP ERP (transient). Retry eligible failures.", link: { to: "/pricing/publications" }, read: false, deliveries: [{ channel: "EMAIL", status: "DELIVERED", attempts: 1 }, { channel: "IN_APP", status: "DELIVERED", attempts: 1 }] },
  { id: "N-512", event: "APPROVAL_REMINDER", recipientId: "U-06", at: "2026-10-29 13:30", title: "Reminder: Q-10241 margin approval due in 7 hours", body: "Discount 21.8% · margin 18.6% · deal value £25,800.", link: { to: "/pricing/approvals" }, read: false, deliveries: [{ channel: "IN_APP", status: "DELIVERED", attempts: 1 }, { channel: "EMAIL", status: "SUPPRESSED", attempts: 0, detail: "User chose a daily digest for reminders" }] },
];

const notifListeners = new Set<() => void>();
export const subscribeNotifications = (l: () => void) => {
  notifListeners.add(l);
  return () => notifListeners.delete(l);
};
const emit = () => notifListeners.forEach((l) => l());
export function pushNotification(n: Omit<AppNotification, "id" | "read">) {
  NOTIFICATIONS.unshift({ ...n, id: `N-${Math.max(...NOTIFICATIONS.map((x) => Number(x.id.slice(2)))) + 1}`, read: false });
  emit();
}
export function markRead(ids: string[]) {
  for (const n of NOTIFICATIONS) if (ids.includes(n.id)) n.read = true;
  emit();
}
export function markUnread(ids: string[]) {
  for (const n of NOTIFICATIONS) if (ids.includes(n.id)) n.read = false;
  emit();
}

/** Notification body for a recipient — margin only when field security allows it (US-DD-06 AC#5). */
export function approvalBody(t: { customerId: string; discountPct: number; marginPct: number; dealValue: number }, recipientRole: Role, sees: (r: Role) => boolean) {
  const parts = [`Discount ${t.discountPct}%`];
  if (sees(recipientRole)) parts.push(`margin ${t.marginPct}%`);
  parts.push(`deal value £${Math.round(t.dealValue).toLocaleString("en-GB")}`);
  return `${customerById(t.customerId)?.name ?? t.customerId} · ${parts.join(" · ")}`;
}

export type NotificationTemplate = { id: string; event: NotificationEvent; channel: NotificationChannel; subject: string; body: string; version: number; updatedBy: string; updatedAt: string };
export const NOTIFICATION_TEMPLATES: NotificationTemplate[] = [
  { id: "NT-01", event: "APPROVAL_ASSIGNED", channel: "EMAIL", subject: "Approve {{request.id}} · {{customer.name}}", body: "{{requester.name}} needs your approval.\nDiscount {{discount}} · {{#if canSeeMargin}}margin {{margin}} · {{/if}}deal value {{dealValue}}\nDue {{sla.due}}.\n{{actionLink}}", version: 4, updatedBy: "U-02", updatedAt: "2026-09-01 10:00" },
  { id: "NT-02", event: "APPROVAL_ASSIGNED", channel: "TEAMS_SLACK", subject: "Approval needed", body: "**{{request.id}} · {{customer.name}}** — discount {{discount}}{{#if canSeeMargin}}, margin {{margin}}{{/if}}, {{dealValue}}. [Open]({{actionLink}})", version: 2, updatedBy: "U-02", updatedAt: "2026-09-01 10:00" },
  { id: "NT-03", event: "SLA_BREACH", channel: "EMAIL", subject: "Overdue: {{request.id}} passed its {{sla.hours}}-hour SLA", body: "The approval for {{customer.name}} is overdue and was escalated to {{escalation.name}}.\n{{actionLink}}", version: 2, updatedBy: "U-02", updatedAt: "2026-09-01 10:00" },
  { id: "NT-04", event: "CONTRACT_EXPIRY", channel: "EMAIL", subject: "{{contract.name}} expires in {{days}} days", body: "The contract price for {{customer.name}} on {{product.sku}} ends {{contract.end}}.\n{{actionLink}}", version: 1, updatedBy: "U-01", updatedAt: "2026-05-12 09:00" },
  { id: "NT-05", event: "THRESHOLD_BREACH", channel: "EMAIL", subject: "Margin drift on {{quote.id}}", body: "Expected {{expected}}, actual {{actual}} ({{variance}} points).\n{{actionLink}}", version: 1, updatedBy: "U-01", updatedAt: "2026-05-12 09:00" },
];

/* ================================================================== */
/* Transactions & price waterfall (Epic 8)                            */
/* ================================================================== */

export const WATERFALL_SOURCES = ["PRICE_ENGINE", "ERP_BILLING", "REBATE_NINJA", "COST_MASTER"] as const;
export type WaterfallLevel = {
  key: string;
  label: string;
  kind: "LIST_PRICE" | "ON_INVOICE" | "SUBTOTAL_INVOICE" | "OFF_INVOICE" | "SUBTOTAL_POCKET" | "COST" | "SUBTOTAL_MARGIN";
  source: (typeof WATERFALL_SOURCES)[number];
  secure?: "costPrice" | "marginAmount";
};
/** Approved waterfall definition (configurable levels, fixed order). */
export const WATERFALL_DEFINITION: WaterfallLevel[] = [
  { key: "list", label: "List price", kind: "LIST_PRICE", source: "PRICE_ENGINE" },
  { key: "standardDiscount", label: "Standard discount", kind: "ON_INVOICE", source: "PRICE_ENGINE" },
  { key: "customerDiscount", label: "Customer discount", kind: "ON_INVOICE", source: "PRICE_ENGINE" },
  { key: "promotion", label: "Promotion", kind: "ON_INVOICE", source: "PRICE_ENGINE" },
  { key: "invoice", label: "Invoice price", kind: "SUBTOTAL_INVOICE", source: "ERP_BILLING" },
  { key: "rebate", label: "Rebate", kind: "OFF_INVOICE", source: "REBATE_NINJA" },
  { key: "freight", label: "Freight", kind: "OFF_INVOICE", source: "ERP_BILLING" },
  { key: "pocket", label: "Pocket price", kind: "SUBTOTAL_POCKET", source: "ERP_BILLING" },
  { key: "cost", label: "Cost", kind: "COST", source: "COST_MASTER", secure: "costPrice" },
  { key: "pocketMargin", label: "Pocket margin", kind: "SUBTOTAL_MARGIN", source: "COST_MASTER", secure: "marginAmount" },
];

export type Transaction = {
  id: string;
  invoiceDate: string;
  period: "2026-Q2" | "2026-Q3";
  customerId: string;
  sku: string;
  region: string;
  channel: string;
  segment: string;
  salesRepId: string;
  qty: number;
  /** Per-unit components. Discounts and rebate are positive amounts taken off; freight is signed as in the SRS example (+ recovered). */
  list: number;
  standardDiscount: number;
  customerDiscount: number;
  promotion: number;
  invoice: number;
  /** null = not yet received from Rebate Ninja (disclosed, never hidden). */
  rebate: number | null;
  freight: number;
  pocket: number;
  cost: number;
  /** Approved price-list price and band used by compliance reporting (US-AN-03). */
  approvedPrice: number;
  bandMin: number;
  bandMax: number;
  exceptionId?: string;
  quoteId?: string;
  updatedAt: string;
};

/** Deterministic pseudo-random so server and client render identical numbers. */
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
}

function buildTransactions(): Transaction[] {
  const rnd = lcg(20261029);
  const custs = CUSTOMERS.filter((c) => c.status === "ACTIVE");
  const skus = ["A-100", "EW-3100", "CB-2.5", "LT-PNL-60", "SW-RCD-63", "HT-ELE-2K", "LT-DWN-10", "CB-6.0"];
  const listOf: Record<string, number> = { "A-100": 110, "EW-3100": 689, "CB-2.5": 1.05, "LT-PNL-60": 34.5, "SW-RCD-63": 38, "HT-ELE-2K": 149, "LT-DWN-10": 79, "CB-6.0": 2.4 };
  // The worked example from the SRS / US-AN-01 AC#1, kept exact.
  const out: Transaction[] = [
    { id: "TX-0001", invoiceDate: "2026-09-12", period: "2026-Q3", customerId: "878070", sku: "A-100", region: "UK", channel: "Distributor", segment: "Distributor", salesRepId: "U-04", qty: 120, list: 100, standardDiscount: 5, customerDiscount: 3, promotion: 2, invoice: 90, rebate: 4, freight: 2, pocket: 88, cost: 70, approvedPrice: 90, bandMin: 85, bandMax: 100, updatedAt: "2026-09-13 02:00" },
    // Below the published band but covered by approved exception EXC-703 → compliant (US-AN-03 AC#3).
    { id: "TX-0002", invoiceDate: "2026-09-18", period: "2026-Q3", customerId: "C-1", sku: "CB-2.5", region: "India", channel: "Distributor", segment: "Distributor", salesRepId: "U-16", qty: 33_000, list: 1.05, standardDiscount: 0.05, customerDiscount: 0.05, promotion: 0, invoice: 0.95, rebate: 0.03, freight: -0.01, pocket: 0.91, cost: 0.63, approvedPrice: 1.0, bandMin: 0.98, bandMax: 1.03, exceptionId: "EXC-703", updatedAt: "2026-09-19 02:00" },
  ];
  let n = 3;
  for (const period of ["2026-Q2", "2026-Q3"] as const) {
    for (const c of custs) {
      for (const sku of skus) {
        if (rnd() < 0.45) continue;
        const p = PRODUCTS.find((x) => x.sku === sku)!;
        const list = listOf[sku];
        const q3 = period === "2026-Q3";
        const std = round2(list * (c.channel === "Distributor" ? 0.05 : 0.03));
        const custD = round2(list * (c.strategic ? 0.04 + rnd() * 0.03 : rnd() * 0.03));
        const promo = round2(rnd() < 0.3 ? list * (0.01 + rnd() * 0.03) : 0);
        // Q3 discounts creep up a little so the bridge shows movement.
        const creep = q3 ? round2(list * rnd() * 0.015) : 0;
        const invoice = round2(list - std - custD - promo - creep);
        const rebateAvail = !(q3 && rnd() < 0.12);
        const rebate = rebateAvail ? round2(list * (c.segment === "Distributor" ? 0.03 + rnd() * 0.02 : rnd() * 0.02)) : null;
        const freight = round2(-list * (0.005 + rnd() * 0.02));
        const pocket = round2(invoice - (rebate ?? 0) + freight);
        const cost = round2(p.cost * (q3 ? 1.02 : 1));
        const approved = round2(list - std - custD);
        const month = q3 ? 7 + Math.floor(rnd() * 3) : 4 + Math.floor(rnd() * 3);
        const day = 1 + Math.floor(rnd() * 27);
        const outOfBand = rnd() < 0.08;
        out.push({
          id: `TX-${String(n++).padStart(4, "0")}`,
          invoiceDate: `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
          period,
          customerId: c.id,
          sku,
          region: c.geography === "Global" ? "UK" : c.geography,
          channel: c.channel,
          segment: c.segment,
          salesRepId: c.geography === "India" ? "U-16" : "U-04",
          qty: Math.max(1, Math.round((p.uom === "M" ? 4000 : 60) * (0.3 + rnd() * 1.7))),
          list,
          standardDiscount: std,
          customerDiscount: custD,
          promotion: round2(promo + creep),
          invoice: outOfBand ? round2(invoice * 0.9) : invoice,
          rebate,
          freight,
          pocket: outOfBand ? round2(pocket - invoice * 0.1) : pocket,
          cost,
          approvedPrice: approved,
          bandMin: round2(approved * 0.95),
          bandMax: round2(approved * 1.05),
          exceptionId: outOfBand && c.id === "C-1" ? "EXC-703" : undefined,
          updatedAt: q3 ? `2026-${String(month).padStart(2, "0")}-${String(Math.min(day + 1, 28)).padStart(2, "0")} 02:00` : "2026-07-01 02:00",
        });
      }
    }
  }
  return out;
}

export const TRANSACTIONS: Transaction[] = buildTransactions();
/** When the analytics facts were last loaded (dashboards must refresh within 15 minutes — NFR-20). */
export const ANALYTICS_REFRESHED_AT = "2026-10-29 14:20";

/** Units-weighted waterfall for a set of transactions; components with any missing source are flagged. */
export function waterfallOf(rows: Transaction[]) {
  const units = rows.reduce((a, r) => a + r.qty, 0) || 1;
  const avg = (f: (r: Transaction) => number) => round2(rows.reduce((a, r) => a + f(r) * r.qty, 0) / units);
  const rebateMissing = rows.filter((r) => r.rebate === null).length;
  const list = avg((r) => r.list);
  const pocket = avg((r) => r.pocket);
  const cost = avg((r) => r.cost);
  return {
    units,
    list,
    standardDiscount: avg((r) => r.standardDiscount),
    customerDiscount: avg((r) => r.customerDiscount),
    promotion: avg((r) => r.promotion),
    invoice: avg((r) => r.invoice),
    rebate: avg((r) => r.rebate ?? 0),
    freight: avg((r) => r.freight),
    pocket,
    cost,
    pocketMargin: round2(pocket - cost),
    leakage: round2(list - pocket),
    leakagePct: list ? round2(((list - pocket) / list) * 100) : 0,
    rebateMissing,
    revenue: round2(rows.reduce((a, r) => a + r.invoice * r.qty, 0)),
  };
}

/** Users a sales rep's dashboards are limited to (row-level security, US-AN-02 AC#4). */
export const repCustomers = (repId: string) => Array.from(new Set(TRANSACTIONS.filter((t) => t.salesRepId === repId).map((t) => t.customerId)));

export const SALES_REPS = USERS.filter((u) => u.role === "SALES_REP");
export { GUARDRAILS };
