/**
 * Deal desk workflow logic (Epic 6): deciding approval tasks, raising exceptions as tasks,
 * and the context an approver needs. Everything is enforced here, not in the UI, so the
 * same checks apply whichever screen (or API) calls them — FR-K-03.
 */
import { customerById, productBySku } from "@/lib/pricing/data";
import {
  EXCEPTIONS,
  NOW,
  TRANSACTIONS,
  addHours,
  actingFor,
  currentStep,
  exceptionById,
  hoursBetween,
  nextTaskId,
  priceQuote,
  pushNotification,
  quoteById,
  resolveApprovals,
  saveException,
  saveQuote,
  saveTask,
  waterfallOf,
  type ApprovalTask,
  type Decision,
  type PlatformError,
  type PricedLine,
  type PricingException,
  type TaskStep,
  type TrailEntry,
} from "@/lib/pricing/deals";
import { fieldAccess, userById, userName, type Role } from "@/lib/pricing/session";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** The price line an approver is judging: list/reference price, requested price, cost. */
export function taskReference(t: ApprovalTask) {
  if (t.requestType === "EXCEPTION") {
    const e = exceptionById(t.refId);
    if (!e) return undefined;
    const p = productBySku(e.sku);
    return { sku: e.sku, name: p?.name ?? e.sku, uom: p?.uom ?? "EA", qty: e.qty, listPrice: e.currentPrice, requestedPrice: e.requestedPrice, cost: p?.cost ?? 0 };
  }
  const q = quoteById(t.refId);
  if (!q) return undefined;
  const ok = priceQuote(q).results.filter((r): r is PricedLine => r.ok);
  const worst = ok.reduce<PricedLine | undefined>((a, r) => (!a || r.discountPct > a.discountPct ? r : a), undefined);
  if (!worst) return undefined;
  return { sku: worst.sku, name: worst.productName, uom: worst.uom, qty: worst.qty, listPrice: worst.listPrice, requestedPrice: worst.netPrice, cost: worst.cost };
}

/** Customer profitability snapshot for the context panel (last two quarters of invoiced lines). */
export function customerSnapshot(customerId: string) {
  const rows = TRANSACTIONS.filter((x) => x.customerId === customerId);
  if (!rows.length) return undefined;
  const w = waterfallOf(rows);
  return {
    revenue: w.revenue,
    pocketMarginPct: w.pocket ? r2((w.pocketMargin / w.pocket) * 100) : 0,
    leakagePct: w.leakagePct,
    lines: rows.length,
    rebateMissing: w.rebateMissing,
  };
}

export const priorExceptions = (customerId: string, excludeId?: string) => EXCEPTIONS.filter((e) => e.customerId === customerId && e.id !== excludeId);

/** Whether `userId` can decide the current step now, and on whose behalf. */
export function eligibility(t: ApprovalTask, userId: string) {
  const s = currentStep(t);
  if (t.status !== "PENDING" || !s) return { can: false as const };
  const ids = actingFor(userId);
  const a = s.approvers.find((x) => x.status === "PENDING" && ids.includes(x.userId));
  if (!a) return { can: false as const };
  return { can: true as const, approverId: a.userId, onBehalfOf: a.userId !== userId ? a.userId : undefined };
}

/** Margin only reaches recipients field security allows (US-DD-06 AC#5). */
export function taskBody(t: ApprovalTask, recipientRole: Role) {
  const parts = [`Discount ${t.discountPct}%`];
  if (fieldAccess(recipientRole, "marginPct") === "SHOW") parts.push(`margin ${t.marginPct}%`);
  parts.push(`deal value £${Math.round(t.dealValue).toLocaleString("en-GB")}`);
  return `${customerById(t.customerId)?.name ?? t.customerId} · ${parts.join(" · ")}`;
}

function notifyApprovers(t: ApprovalTask, step: TaskStep) {
  for (const a of step.approvers) {
    const u = userById(a.userId);
    if (!u) continue;
    pushNotification({
      event: "APPROVAL_ASSIGNED",
      recipientId: u.id,
      at: NOW,
      title: `Approve ${t.refId} · ${customerById(t.customerId)?.name ?? t.customerId}${t.steps.length > 1 ? ` (level ${step.level} of ${t.steps.length})` : ""}`,
      body: `${taskBody(t, u.role)}. Due ${step.dueAt ?? "—"}.`,
      link: { to: "/pricing/approvals" },
      deliveries: [
        { channel: "EMAIL", status: "DELIVERED", attempts: 1 },
        { channel: "TEAMS_SLACK", status: "DELIVERED", attempts: 1 },
        { channel: "IN_APP", status: "DELIVERED", attempts: 1 },
      ],
    });
  }
}

export type DecideInput = { task: ApprovalTask; userId: string; decision: Decision; comment: string; adjustedPrice?: number };

/**
 * Apply one approver decision (US-DD-04, -05, -07). Returns the updated task or a classified error.
 * Errors: SELF_APPROVAL_DENIED / NOT_ASSIGNED_APPROVER (AUTHORIZATION), VALIDATION_REQUIRED,
 * OUTSIDE_APPROVER_AUTHORITY (BUSINESS_RULE).
 */
export function decide({ task, userId, decision, comment, adjustedPrice }: DecideInput): { task: ApprovalTask; summary: string } | { error: PlatformError } {
  const corr = `c-${Math.abs(task.id.length * 7919 + userId.length * 104729).toString(16)}`;
  if (task.requesterId === userId)
    return { error: { errorClass: "AUTHORIZATION", code: "SELF_APPROVAL_DENIED", message: "You raised this request, so you can't decide it. Segregation of duties requires a different approver.", correlationId: corr } };
  const el = eligibility(task, userId);
  if (!el.can) return { error: { errorClass: "AUTHORIZATION", code: "NOT_ASSIGNED_APPROVER", message: "This request isn't waiting for you (or anyone who delegated to you) at its current level.", correlationId: corr } };
  if ((decision === "REJECTED" || decision === "SENT_BACK") && !comment.trim())
    return { error: { errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: `Add a comment explaining why you ${decision === "REJECTED" ? "rejected" : "sent back"} this request.`, field: "comment" } };
  const ref = taskReference(task);
  if (decision === "ADJUSTED" && (adjustedPrice === undefined || !Number.isFinite(adjustedPrice) || adjustedPrice <= 0))
    return { error: { errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Enter the approved price for an adjusted decision.", field: "Adjustment w/o Approved Price" } };
  const user = userById(userId)!;
  const grantedPrice = decision === "ADJUSTED" ? adjustedPrice! : ref?.requestedPrice;
  const grantedDiscount = ref && grantedPrice !== undefined && ref.listPrice ? ((ref.listPrice - grantedPrice) / ref.listPrice) * 100 : task.discountPct;
  if ((decision === "APPROVED" || decision === "ADJUSTED") && user.approvalAuthorityPct !== undefined && grantedDiscount > user.approvalAuthorityPct + 1e-9)
    return {
      error: {
        errorClass: "BUSINESS_RULE",
        code: "OUTSIDE_APPROVER_AUTHORITY",
        message: `That price is a ${grantedDiscount.toFixed(1)}% discount; your authority covers up to ${user.approvalAuthorityPct}%. Adjust to a price within your authority, or send it back.`,
        field: decision === "ADJUSTED" ? "approvedPrice" : undefined,
      },
    };

  const t: ApprovalTask = structuredClone(task);
  const s = t.steps.find((x) => x.level === t.currentLevel)!;
  const me = s.approvers.find((a) => a.userId === el.approverId)!;
  const status = decision === "ADJUSTED" ? "APPROVED" : decision;
  me.status = status;
  me.decidedAt = NOW;
  me.comment = comment.trim() || undefined;
  me.onBehalfOf = el.onBehalfOf;
  const trail: TrailEntry[] = [
    {
      id: `T${t.trail.length + 1}`,
      at: NOW,
      actorId: userId,
      onBehalfOf: el.onBehalfOf,
      action: decision,
      level: s.level,
      comment: comment.trim() || undefined,
      previousValue: ref ? `£${ref.requestedPrice.toFixed(2)}` : undefined,
      newValue: decision === "ADJUSTED" ? `£${adjustedPrice!.toFixed(2)}` : undefined,
    },
  ];
  if (decision === "ADJUSTED") t.approvedValue = `£${adjustedPrice!.toFixed(2)} / ${ref?.uom ?? "EA"}`;

  let summary = "";
  const approving = status === "APPROVED";
  const levelDone = approving && (s.parallelRule === "ANY" || s.approvers.every((a) => a.status === "APPROVED" || a.status === "SKIPPED" || a.status === "ESCALATED"));
  if (approving && s.parallelRule === "ANY") {
    for (const a of s.approvers)
      if (a.status === "PENDING" || a.status === "ESCALATED") {
        a.status = "SKIPPED";
        trail.push({ id: `T${t.trail.length + trail.length + 1}`, at: NOW, actorId: "System", action: "SKIPPED", level: s.level, comment: `Parallel rule ANY satisfied — ${userName(a.userId)}'s task skipped.` });
      }
  }
  if (!approving) {
    t.status = status === "REJECTED" ? "REJECTED" : "SENT_BACK";
    summary = status === "REJECTED" ? `${t.refId} rejected` : `${t.refId} sent back to ${userName(t.requesterId)}`;
  } else if (levelDone) {
    const next = t.steps.find((x) => x.level === s.level + 1);
    if (next) {
      t.currentLevel = next.level;
      next.dueAt = addHours(NOW, next.slaHours);
      notifyApprovers(t, next);
      summary = `Level ${s.level} approved — moved to ${next.approvers.map((a) => userName(a.userId)).join(" and ")}`;
    } else {
      t.status = "APPROVED";
      summary = `${t.refId} approved`;
    }
  } else {
    summary = `Your approval is recorded — waiting for the other approvers at level ${s.level}`;
  }
  t.trail = [...t.trail, ...trail];
  saveTask(t);

  // Keep the linked record in step with the workflow.
  if (t.status !== "PENDING") {
    if (t.requestType === "QUOTE") {
      const q = quoteById(t.refId);
      if (q) {
        const nextStatus = t.status === "APPROVED" ? "APPROVED" : t.status === "REJECTED" ? "REJECTED" : "DRAFT";
        const lines = decision === "ADJUSTED" && ref ? q.lines.map((l) => (l.sku === ref.sku ? { ...l, requestedUnitPrice: adjustedPrice, requestedDiscountPct: undefined } : l)) : q.lines;
        const snap = t.status === "APPROVED" ? priceQuote({ ...q, lines }).totals.marginPct : q.expectedMarginPct;
        saveQuote({ ...q, lines, status: nextStatus, updatedAt: NOW, expectedMarginPct: snap });
      }
    } else if (t.requestType === "EXCEPTION") {
      const e = exceptionById(t.refId);
      if (e)
        saveException({
          ...e,
          status: t.status === "APPROVED" ? "APPROVED" : t.status === "REJECTED" ? "REJECTED" : "SENT_BACK",
          requestedPrice: decision === "ADJUSTED" ? adjustedPrice! : e.requestedPrice,
          decisionComment: comment.trim() || e.decisionComment,
          updatedAt: NOW,
        });
    }
    const requester = userById(t.requesterId);
    if (requester)
      pushNotification({
        event: "DECISION_MADE",
        recipientId: requester.id,
        at: NOW,
        title: `${t.refId} ${t.status === "APPROVED" ? (decision === "ADJUSTED" ? "approved with an adjusted price" : "approved") : t.status === "REJECTED" ? "rejected" : "sent back"} by ${user.name}`,
        body: comment.trim() ? `“${comment.trim()}”` : taskBody(t, requester.role),
        link: t.requestType === "QUOTE" ? { to: "/pricing/quotes/$id", params: { id: t.refId } } : { to: "/pricing/exceptions" },
        deliveries: [
          { channel: "EMAIL", status: "DELIVERED", attempts: 1 },
          { channel: "IN_APP", status: "DELIVERED", attempts: 1 },
        ],
      });
  }
  return { task: t, summary };
}

/** Turn a submitted exception into an approval task routed by the matrix (US-DD-03 AC#2). */
export function submitException(e: PricingException) {
  const p = productBySku(e.sku);
  const discountPct = e.currentPrice ? r2(((e.currentPrice - e.requestedPrice) / e.currentPrice) * 100) : 0;
  const marginPct = p && e.requestedPrice ? r2(((e.requestedPrice - p.cost) / e.requestedPrice) * 100) : 0;
  const routing = resolveApprovals({ appliesTo: "EXCEPTION", exceptionType: e.justification, discountPct, marginPct, dealValue: e.requestedPrice * e.qty, customerId: e.customerId, sku: e.sku, requesterId: e.requesterId });
  const id = nextTaskId();
  const steps: TaskStep[] = routing.steps.map((s, i) => ({
    level: s.level,
    mode: s.mode,
    parallelRule: s.parallelRule,
    approvers: s.approverIds.map((userId) => ({ userId, status: "PENDING" as const })),
    slaHours: s.slaHours,
    dueAt: i === 0 ? addHours(NOW, s.slaHours) : undefined,
    escalateTo: s.escalateTo,
  }));
  const task: ApprovalTask = {
    id,
    requestType: "EXCEPTION",
    refId: e.id,
    title: `${customerById(e.customerId)?.name ?? e.customerId} ${p?.name ?? e.sku} — ${e.justification.toLowerCase().replace(/_/g, " ")}`,
    customerId: e.customerId,
    dealValue: r2(e.requestedPrice * e.qty),
    discountPct,
    marginPct,
    exceptionType: e.justification,
    requesterId: e.requesterId,
    submittedAt: NOW,
    status: "PENDING",
    currentLevel: 1,
    steps,
    ruleIds: routing.matched.map((r) => r.id),
    highRisk: false,
    trail: [
      { id: "T1", at: NOW, actorId: e.requesterId, action: "SUBMITTED", comment: e.reason, newValue: `£${e.requestedPrice.toFixed(2)} / ${p?.uom ?? "EA"} until ${e.expiryDate}` },
      ...routing.conflicts.map((c, i) => ({ id: `T${i + 2}`, at: NOW, actorId: "System", action: "REASSIGNED" as const, level: c.level, comment: `Segregation of duties: requester can't approve — ${c.action === "ESCALATED_FALLBACK" ? "escalated to the fallback approver" : "reassigned to the next eligible approver"} (${userName(c.replacedWith)}).` })),
    ],
  };
  if (!steps.length) return { task: undefined, routing };
  saveTask(task);
  saveException({ ...e, status: "IN_APPROVAL", approvalTaskId: id, updatedAt: NOW });
  notifyApprovers(task, steps[0]);
  return { task, routing };
}

/** "in 6 h" / "overdue 2 h" / "in 2 d". */
export function dueLabel(dueAt?: string) {
  if (!dueAt) return "—";
  const h = hoursBetween(NOW, dueAt);
  const abs = Math.abs(h);
  const txt = abs >= 48 ? `${Math.round(abs / 24)} d` : abs >= 1 ? `${Math.round(abs)} h` : `${Math.max(1, Math.round(abs * 60))} min`;
  return h < 0 ? `overdue ${txt}` : `in ${txt}`;
}

/** Decision time in hours for decided tasks (deal desk metrics). */
export function decisionHours(t: ApprovalTask) {
  const last = [...t.trail].reverse().find((x) => x.action === "APPROVED" || x.action === "REJECTED" || x.action === "SENT_BACK" || x.action === "ADJUSTED");
  return last ? hoursBetween(t.submittedAt, last.at) : undefined;
}
