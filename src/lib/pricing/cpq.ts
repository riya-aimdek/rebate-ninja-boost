/**
 * CPQ-only data and helpers (Epic 5): guided-selling flows, price guidance ranges, quote submission,
 * revision compare, document generation and ERP order sync. Shared quote data lives in deals.ts.
 */
import { customerById, productBySku } from "@/lib/pricing/data";
import {
  ERP_CUSTOMER_ID,
  NOW,
  TODAY_ISO,
  addHours,
  approvalBody,
  nextTaskId,
  priceLine,
  priceQuote,
  pushNotification,
  quoteApprovalContext,
  resolveApprovals,
  saveQuote,
  saveTask,
  shortHash,
  type ApprovalTask,
  type ErpSync,
  type PlatformError,
  type PricedLine,
  type Quote,
  type QuoteDocument,
  type QuoteLineInput,
  type TaskStep,
} from "@/lib/pricing/deals";
import { canSee, userById, type Role } from "@/lib/pricing/session";

/* ================================================================== */
/* Guided selling flows (US-CQ-03)                                    */
/* ================================================================== */

export const QUESTION_KINDS = ["SINGLE", "MULTI", "NUMBER"] as const;
export type QuestionKind = (typeof QUESTION_KINDS)[number];
export type FlowQuestion = {
  id: string;
  text: string;
  kind: QuestionKind;
  required: boolean;
  options: Array<{ value: string; label: string }>;
  /** Branching: shown only when another question has this answer. */
  showIf?: { questionId: string; equals: string };
  /** NUMBER only: unit shown next to the input. */
  unit?: string;
};
export type FlowOutcome = {
  id: string;
  label: string;
  /** All must match. Empty = default outcome. NUMBER answers match with ">=n" or "<n". */
  when: Array<{ questionId: string; equals: string }>;
  products: string[];
  tier: "Good" | "Better" | "Best" | "Volume";
  note: string;
};
export type GuidedFlow = {
  id: string;
  name: string;
  version: number;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "INACTIVE";
  questions: FlowQuestion[];
  outcomes: FlowOutcome[];
  effectiveFrom: string;
  updatedBy: string;
  updatedAt: string;
  reasonCode?: string;
};

const opt = (...xs: string[]) => xs.map((x) => ({ value: x.toUpperCase().replace(/[^A-Z0-9]+/g, "_"), label: x }));

export const GUIDED_FLOWS: GuidedFlow[] = [
  {
    id: "GF-01",
    name: "Electrical wholesale starter",
    version: 3,
    status: "ACTIVE",
    effectiveFrom: "2026-09-01",
    updatedBy: "U-02",
    updatedAt: "2026-08-28 10:00",
    questions: [
      { id: "Q1", text: "What is the customer's main use case?", kind: "SINGLE", required: true, options: opt("New build", "Refurbishment", "Maintenance stock") },
      { id: "Q2", text: "Which systems are in scope?", kind: "MULTI", required: true, options: opt("Ventilation", "Lighting", "Protection", "Heating", "Cable") },
      { id: "Q3", text: "Roughly how many units per order?", kind: "NUMBER", required: true, options: [], unit: "units" },
      { id: "Q4", text: "Is energy efficiency a buying criterion?", kind: "SINGLE", required: false, options: opt("Yes", "No"), showIf: { questionId: "Q1", equals: "NEW_BUILD" } },
    ],
    outcomes: [
      { id: "O1", label: "Premium new-build bundle", when: [{ questionId: "Q1", equals: "NEW_BUILD" }, { questionId: "Q4", equals: "YES" }], products: ["EW-3100", "LT-PNL-60", "SW-RCD-63"], tier: "Best", note: "MVHR + LED + protection for efficiency-led specs." },
      { id: "O2", label: "Volume lighting refresh", when: [{ questionId: "Q1", equals: "REFURBISHMENT" }, { questionId: "Q3", equals: ">=100" }], products: ["LT-PNL-60", "SW-RCD-63"], tier: "Volume", note: "100+ units qualifies for volume tiers." },
      { id: "O3", label: "Maintenance stock", when: [{ questionId: "Q1", equals: "MAINTENANCE_STOCK" }], products: ["CB-2.5", "SW-RCD-63"], tier: "Good", note: "Fast-moving consumables." },
      { id: "O4", label: "Standard project bundle", when: [], products: ["LT-PNL-60", "SW-RCD-63"], tier: "Better", note: "Default when nothing more specific matches." },
    ],
  },
  {
    id: "GF-01v4",
    name: "Electrical wholesale starter",
    version: 4,
    status: "DRAFT",
    effectiveFrom: "2027-01-01",
    updatedBy: "U-02",
    updatedAt: "2026-10-28 15:00",
    reasonCode: "ANNUAL_PRICE_INCREASE",
    questions: [
      { id: "Q1", text: "What is the customer's main use case?", kind: "SINGLE", required: true, options: opt("New build", "Refurbishment", "Maintenance stock") },
      { id: "Q2", text: "Which systems are in scope?", kind: "MULTI", required: true, options: opt("Ventilation", "Lighting", "Protection", "Heating", "Cable") },
      { id: "Q3", text: "Roughly how many units per order?", kind: "NUMBER", required: true, options: [], unit: "units" },
      { id: "Q4", text: "Is energy efficiency a buying criterion?", kind: "SINGLE", required: false, options: opt("Yes", "No"), showIf: { questionId: "Q1", equals: "NEW_BUILD" } },
      { id: "Q5", text: "Does the site need heating?", kind: "SINGLE", required: false, options: opt("Yes", "No"), showIf: { questionId: "Q2", equals: "HEATING" } },
    ],
    outcomes: [
      { id: "O1", label: "Premium new-build bundle", when: [{ questionId: "Q1", equals: "NEW_BUILD" }, { questionId: "Q4", equals: "YES" }], products: ["EW-3110", "LT-PNL-60", "SW-RCD-63"], tier: "Best", note: "Adds the humidity-controlled MVHR." },
      { id: "O4", label: "Standard project bundle", when: [], products: ["LT-PNL-60", "SW-RCD-63"], tier: "Better", note: "Default." },
    ],
  },
  {
    id: "GF-02",
    name: "Retail heating season",
    version: 1,
    status: "INACTIVE",
    effectiveFrom: "2025-09-01",
    updatedBy: "U-03",
    updatedAt: "2025-08-20 12:00",
    questions: [{ id: "Q1", text: "Which room size?", kind: "SINGLE", required: true, options: opt("Small", "Large") }],
    outcomes: [{ id: "O1", label: "Panel heater", when: [], products: ["HT-ELE-2K"], tier: "Good", note: "Seasonal." }],
  },
];

export const activeFlow = (date = TODAY_ISO) =>
  GUIDED_FLOWS.filter((f) => f.status === "ACTIVE" && f.effectiveFrom <= date).sort((a, b) => b.version - a.version)[0];

export type Answers = Record<string, string>;

function answerMatches(q: FlowQuestion | undefined, answer: string | undefined, equals: string) {
  if (!q || answer === undefined || answer === "") return false;
  if (q.kind === "NUMBER") {
    const n = Number(answer);
    const m = equals.match(/^(>=|<=|>|<)?\s*(\d+(?:\.\d+)?)$/);
    if (!m) return false;
    const v = Number(m[2]);
    return m[1] === ">=" ? n >= v : m[1] === "<=" ? n <= v : m[1] === ">" ? n > v : m[1] === "<" ? n < v : n === v;
  }
  if (q.kind === "MULTI") return answer.split(",").includes(equals);
  return answer === equals;
}

/** Questions shown for the current answers (branching, US-CQ-03). */
export function visibleQuestions(flow: GuidedFlow, answers: Answers) {
  const shown: FlowQuestion[] = [];
  for (const q of flow.questions) {
    if (!q.showIf) shown.push(q);
    else {
      const src = shown.find((s) => s.id === q.showIf!.questionId);
      if (src && answerMatches(src, answers[src.id], q.showIf.equals)) shown.push(q);
    }
  }
  return shown;
}

export function outcomeFor(flow: GuidedFlow, answers: Answers): FlowOutcome | undefined {
  const qs = visibleQuestions(flow, answers);
  return flow.outcomes.find((o) => o.when.every((w) => answerMatches(qs.find((q) => q.id === w.questionId), answers[w.questionId], w.equals))) ?? flow.outcomes.find((o) => o.when.length === 0);
}

/** Save-time checks: VALIDATION_REQUIRED for incomplete questions, FLOW_CYCLE for circular show-if. */
export function validateFlow(flow: GuidedFlow): PlatformError | null {
  if (!flow.name.trim()) return { errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Give the flow a name.", field: "name" };
  if (!flow.questions.length) return { errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Add at least one question.", field: "questions" };
  for (const q of flow.questions) {
    if (!q.text.trim()) return { errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: `Question ${q.id} needs wording.`, field: `${q.id}.text` };
    if ((q.kind === "SINGLE" || q.kind === "MULTI") && q.options.length === 0)
      return { errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: `Question ${q.id} is a ${q.kind === "SINGLE" ? "single" : "multi"} select with no options. Add at least one option.`, field: `${q.id}.options` };
    if (q.showIf && !flow.questions.some((x) => x.id === q.showIf!.questionId))
      return { errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: `Question ${q.id} depends on ${q.showIf.questionId}, which doesn't exist.`, field: `${q.id}.showIf` };
  }
  // Cycle: follow show-if links from each question.
  for (const q of flow.questions) {
    const seen = new Set<string>([q.id]);
    let cur = q.showIf?.questionId;
    while (cur) {
      if (seen.has(cur)) {
        const path = [...seen, cur].join(" → ");
        return { errorClass: "VALIDATION", code: "FLOW_CYCLE", message: `Show-if rules loop back on themselves (${path}). Remove one of the conditions so each question depends only on earlier ones.`, field: "showIf" };
      }
      seen.add(cur);
      cur = flow.questions.find((x) => x.id === cur)?.showIf?.questionId;
    }
  }
  if (!flow.outcomes.length) return { errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Add at least one outcome.", field: "outcomes" };
  for (const o of flow.outcomes) if (!o.products.length) return { errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: `Outcome “${o.label || o.id}” recommends no products.`, field: `${o.id}.products` };
  return null;
}

export function saveFlow(f: GuidedFlow) {
  const i = GUIDED_FLOWS.findIndex((x) => x.id === f.id);
  if (i >= 0) GUIDED_FLOWS[i] = f;
  else GUIDED_FLOWS.unshift(f);
}

/**
 * Price guidance for a recommended product: the range comes from guardrails and segment guidance,
 * never from the flow author. min = tightest of floor / margin floor / max discount; max = ceiling or list.
 */
export function priceRange(ctx: { customerId: string; channel: string; pricingDate: string }, sku: string, qty: number) {
  const r = priceLine(ctx, { sku, qty });
  if (!r.ok) return null;
  const g = r.guardrail;
  const candidates = [
    g.floor,
    g.minMarginPct !== undefined ? r.cost / (1 - g.minMarginPct / 100) : undefined,
    g.maxDiscountPct !== undefined ? r.listPrice * (1 - g.maxDiscountPct / 100) : undefined,
  ].filter((x): x is number => x !== undefined);
  const min = round2(candidates.length ? Math.max(...candidates) : r.netPrice * 0.9);
  const max = round2(g.ceiling ?? Math.max(r.listPrice, r.netPrice));
  return { sku, name: r.productName, uom: r.uom, min: Math.min(min, r.netPrice), recommended: r.netPrice, max, list: r.listPrice, source: g.guardrailId ? `Guardrail ${g.guardrailId}` : "Segment guidance (±10%)" };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/* ================================================================== */
/* Quote lifecycle helpers (US-CQ-04, US-DD-02)                       */
/* ================================================================== */

/** Display status: an approved/sent quote past its valid-until date is EXPIRED (US-CQ-04 AC#6). */
export function effectiveStatus(q: Quote, today = TODAY_ISO): Quote["status"] {
  if ((q.status === "SENT" || q.status === "APPROVED" || q.status === "DRAFT" || q.status === "PENDING_APPROVAL") && q.validUntil < today) return "EXPIRED";
  return q.status;
}

/** Approval need for a quote: matrix + guardrails. */
export function approvalNeed(q: Quote) {
  const priced = priceQuote(q);
  const resolved = resolveApprovals(quoteApprovalContext(q));
  return { priced, resolved, required: resolved.required || priced.approvalRequired };
}

/** "Sales VP" etc. for a line that breaches a limit — shown inline (US-DD-02 AC#4). */
export function requiredApproverFor(q: Quote, line: PricedLine): string | undefined {
  if (!line.guardrail.approvalRequired && !line.guardrail.blocked) return undefined;
  const ctx = { ...quoteApprovalContext(q), discountPct: line.discountPct, marginPct: line.marginPct, minMarginPct: line.guardrail.minMarginPct, sku: line.sku };
  const r = resolveApprovals(ctx);
  const first = r.steps[0]?.approverIds.map((id) => userById(id)?.title ?? id);
  return first?.length ? first.join(" + ") : userById(userById(q.ownerId)?.managerId)?.title;
}

/**
 * Submit: routes to the approval matrix or auto-approves. Creates the ApprovalTask, notifies level-1
 * approvers (margin only when they may see it) and snapshots the expected margin on approval.
 */
export function submitQuote(q: Quote, actorId: string, comment?: string): { quote: Quote; task?: ApprovalTask; autoApproved: boolean } {
  const need = approvalNeed(q);
  const totals = need.priced.totals;
  if (!need.required) {
    const quote: Quote = { ...q, status: "APPROVED", expectedMarginPct: totals.marginPct, updatedAt: NOW };
    saveQuote(quote);
    return { quote, autoApproved: true };
  }
  let steps = need.resolved.steps;
  // Guardrail says approval but no matrix rule matched: route to the requester's manager.
  if (!steps.length) {
    const mgr = userById(q.ownerId)?.managerId ?? "U-05";
    steps = [{ level: 1, mode: "SEQUENTIAL", approverIds: [mgr], slaHours: 24, escalateTo: "Sales VP", fromRules: ["Guardrail"] }];
  }
  const ok = need.priced.results.filter((r): r is PricedLine => r.ok);
  const worst = ok.reduce((a, r) => Math.max(a, r.discountPct), 0);
  const taskSteps: TaskStep[] = steps.map((s) => ({
    level: s.level,
    mode: s.mode,
    parallelRule: s.parallelRule,
    approvers: s.approverIds.map((userId) => ({ userId, status: "PENDING" as const })),
    slaHours: s.slaHours,
    dueAt: s.level === 1 ? addHours(NOW, s.slaHours) : undefined,
    escalateTo: s.escalateTo,
  }));
  const task: ApprovalTask = {
    id: nextTaskId(),
    requestType: "QUOTE",
    refId: q.id,
    title: `${q.name} — ${worst.toFixed(1)}% discount`,
    customerId: q.customerId,
    dealValue: totals.net,
    discountPct: Math.round(worst * 10) / 10,
    marginPct: totals.marginPct,
    requesterId: actorId,
    submittedAt: NOW,
    status: "PENDING",
    currentLevel: 1,
    steps: taskSteps,
    ruleIds: Array.from(new Set(steps.flatMap((s) => s.fromRules))),
    highRisk: totals.net > 250_000 || need.priced.reasons.includes("BELOW_MIN_MARGIN"),
    trail: [
      { id: "T1", at: NOW, actorId, action: "SUBMITTED", comment, newValue: `£${totals.net.toLocaleString("en-GB")} · ${worst.toFixed(1)}% max discount` },
      ...need.resolved.conflicts.map((c, i) => ({ id: `T${i + 2}`, at: NOW, actorId: "System", action: "REASSIGNED" as const, level: c.level, comment: `Segregation of duties: requester can't approve — ${c.action === "ESCALATED_FALLBACK" ? "escalated to the fallback approver" : "reassigned to the next eligible approver"}.` })),
    ],
  };
  saveTask(task);
  for (const id of steps[0].approverIds) {
    const u = userById(id);
    if (!u) continue;
    pushNotification({
      event: "APPROVAL_ASSIGNED",
      recipientId: id,
      at: NOW,
      title: `Approve ${q.id} · ${customerById(q.customerId)?.name ?? q.customerId}`,
      body: approvalBody(task, u.role, (r: Role) => canSee(r, "marginPct")),
      link: { to: "/pricing/approvals" },
      deliveries: [
        { channel: "EMAIL", status: "DELIVERED", attempts: 1 },
        { channel: "TEAMS_SLACK", status: "DELIVERED", attempts: 1 },
        { channel: "IN_APP", status: "DELIVERED", attempts: 1 },
      ],
    });
  }
  const quote: Quote = { ...q, status: "PENDING_APPROVAL", approvalTaskId: task.id, updatedAt: NOW };
  saveQuote(quote);
  return { quote, task, autoApproved: false };
}

/* ================================================================== */
/* Revision compare (US-CQ-04 AC#2)                                   */
/* ================================================================== */

export type RevisionLike = { revision: number; lines: QuoteLineInput[]; paymentTerms: string; incoterms: string; validUntil: string };
export type LineDiff = { sku: string; kind: "ADDED" | "REMOVED" | "CHANGED" | "UNCHANGED"; before?: string; after?: string; priceBefore?: number; priceAfter?: number };

const describe = (l: QuoteLineInput) =>
  `${l.qty.toLocaleString("en-GB")} × ${l.requestedUnitPrice !== undefined ? `£${l.requestedUnitPrice.toFixed(2)}` : l.requestedDiscountPct !== undefined ? `${l.requestedDiscountPct}% off` : "engine price"}`;

export function compareRevisions(q: Quote, a: RevisionLike, b: RevisionLike) {
  const priceOf = (lines: QuoteLineInput[]) => {
    const p = priceQuote({ ...q, lines });
    return Object.fromEntries(p.results.filter((r): r is PricedLine => r.ok).map((r) => [r.sku, r.netPrice]));
  };
  const pa = priceOf(a.lines);
  const pb = priceOf(b.lines);
  const skus = Array.from(new Set([...a.lines.map((l) => l.sku), ...b.lines.map((l) => l.sku)]));
  const lines: LineDiff[] = skus.map((sku) => {
    const x = a.lines.find((l) => l.sku === sku);
    const y = b.lines.find((l) => l.sku === sku);
    if (!x) return { sku, kind: "ADDED", after: describe(y!), priceAfter: pb[sku] };
    if (!y) return { sku, kind: "REMOVED", before: describe(x), priceBefore: pa[sku] };
    const same = describe(x) === describe(y);
    return { sku, kind: same ? "UNCHANGED" : "CHANGED", before: describe(x), after: describe(y), priceBefore: pa[sku], priceAfter: pb[sku] };
  });
  const terms = (["paymentTerms", "incoterms", "validUntil"] as const)
    .filter((k) => a[k] !== b[k])
    .map((k) => ({ field: k === "paymentTerms" ? "Payment terms" : k === "incoterms" ? "Incoterms" : "Valid until", before: a[k], after: b[k] }));
  return { lines, terms, counts: { added: lines.filter((l) => l.kind === "ADDED").length, removed: lines.filter((l) => l.kind === "REMOVED").length, changed: lines.filter((l) => l.kind === "CHANGED").length } };
}

/* ================================================================== */
/* Documents (US-CQ-04 AC#1, #4, #5)                                  */
/* ================================================================== */

export function generateDocument(q: Quote, template: { name: string; version: string }, by: string, kind: QuoteDocument["kind"] = "PDF"): QuoteDocument {
  const content = JSON.stringify({ id: q.id, rev: q.revision, lines: q.lines, t: template, kind });
  const h = shortHash(content) + shortHash(content.split("").reverse().join(""));
  return {
    id: `DOC-${900 + q.documents.length + Number(q.id.slice(-2))}`,
    kind,
    template: template.name,
    templateVersion: template.version,
    quoteRevision: q.revision,
    at: NOW,
    by,
    hash: `sha256:${h.slice(0, 4)}…${h.slice(-4)}`,
  };
}

/* ================================================================== */
/* ERP order sync (US-CQ-06)                                          */
/* ================================================================== */

export const idempotencyKeyFor = (q: Quote) => `q-${q.id.slice(2)}-r${q.revision}-${shortHash(q.id + q.revision).slice(0, 4)}`;

/** ERP-ready payload (US-CQ-06 description). No cost or margin — the ERP gets prices, not internals. */
export function erpPayload(q: Quote) {
  const p = priceQuote(q);
  return {
    idempotencyKey: q.sync?.idempotencyKey ?? idempotencyKeyFor(q),
    erpCustomerId: ERP_CUSTOMER_ID[q.customerId] ?? null,
    shipTo: q.shipTo,
    lines: p.results.filter((r): r is PricedLine => r.ok).map((r) => ({ material: productBySku(r.sku)?.sourceId ?? r.sku, quantity: r.qty, uom: r.uom, netPrice: r.netPrice, currency: r.currency })),
    pricingConditions: p.results.filter((r): r is PricedLine => r.ok).map((r) => ({ material: r.sku, condition: r.discountPct > 0 ? "ZDIS" : "PR00", value: r.discountPct > 0 ? r.discountPct : r.netPrice })),
    paymentTerms: q.paymentTerms,
    incoterms: q.incoterms,
    requestedDelivery: q.requestedDelivery ?? null,
    priceListVersion: q.priceListVersion,
    quoteReference: `${q.id} rev ${q.revision}`,
  };
}

/**
 * One sync attempt. Idempotent: an order already created for this key is returned, never duplicated.
 * CUSTOMER_NOT_IN_ERP is permanent (not retried automatically).
 */
export function syncToErp(q: Quote): { sync: ErpSync; duplicate: boolean } {
  const key = q.sync?.idempotencyKey ?? idempotencyKeyFor(q);
  if (q.sync?.erpOrderRef) return { sync: { ...q.sync, updatedAt: NOW }, duplicate: true };
  const attempts = (q.sync?.attempts ?? 0) + 1;
  if (!ERP_CUSTOMER_ID[q.customerId])
    return {
      duplicate: false,
      sync: {
        status: "FAILED",
        idempotencyKey: key,
        attempts,
        updatedAt: NOW,
        lastError: { errorClass: "BUSINESS_RULE", code: "CUSTOMER_NOT_IN_ERP", message: `${customerById(q.customerId)?.name ?? q.customerId} has no ERP customer number. Create the sold-to in SAP (XD01), then retry. Not retried automatically.`, retryable: false, correlationId: `c-${shortHash(key + attempts).slice(0, 6)}` },
      },
    };
  const ref = `SO-45${String(parseInt(shortHash(key).slice(0, 5), 16) % 100000).padStart(5, "0")}`;
  return { duplicate: false, sync: { status: "SUCCESS", idempotencyKey: key, attempts, erpOrderRef: ref, updatedAt: NOW } };
}

/* ================================================================== */
/* Partner portal — Rebate Ninja read-only summary (US-CQ-05 AC#1)    */
/* ================================================================== */

export type PartnerRebate = { programId: string; name: string; period: string; target: number; achieved: number; accrued: number; status: "ON_TRACK" | "AT_RISK" | "ACHIEVED"; asOf: string };
export const PARTNER_REBATES: Record<string, PartnerRebate[]> = {
  "878075": [
    { programId: "RN-2026-118", name: "A. Webb growth rebate 2026", period: "Jan–Dec 2026", target: 5_500_000, achieved: 4_950_000, accrued: 148_500, status: "ON_TRACK", asOf: "2026-10-29 02:00" },
    { programId: "RN-2026-140", name: "Lighting mix bonus H2", period: "Jul–Dec 2026", target: 600_000, achieved: 610_000, accrued: 18_300, status: "ACHIEVED", asOf: "2026-10-29 02:00" },
  ],
  "135991": [{ programId: "RN-2026-207", name: "Urban retail volume rebate", period: "Jan–Dec 2026", target: 450_000, achieved: 301_000, accrued: 6_020, status: "AT_RISK", asOf: "2026-10-29 02:00" }],
};
