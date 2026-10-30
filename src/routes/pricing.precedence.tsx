import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Check, GripVertical, Lock, RotateCcw, Save, Undo2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  ConfirmDialog,
  DataTable,
  DetailGrid,
  ErrorBanner,
  Field,
  InfoBanner,
  ListHeader,
  Modal,
  PricingLayout,
  StatusPill,
  Tag,
  Toggle,
  humanize,
  inputCls,
  notifyUndo,
  type ApiError,
} from "@/components/pricing/kit";
import { PRECEDENCE_TIERS, PRECEDENCE_VERSIONS, REASON_CODES, TIE_BREAKERS, type PrecedenceVersion } from "@/lib/pricing/data";

export const Route = createFileRoute("/pricing/precedence")({
  head: () => ({ meta: [{ title: "Rule precedence · Rebate Ninja" }] }),
  component: Page,
});

const TIER_LABEL: Record<string, string> = {
  CONTRACT: "Contract price",
  CUSTOMER: "Customer-specific price",
  SEGMENT: "Segment price",
  CHANNEL: "Channel price",
  REGIONAL: "Regional price",
  STANDARD_LIST: "Standard list price",
};

const TIER_HINT: Record<string, string> = {
  CONTRACT: "Contract price rules and contract price lists",
  CUSTOMER: "Customer price rules and customer price lists",
  SEGMENT: "Segment price rules and segment price lists",
  CHANNEL: "Channel price rules and channel price lists",
  REGIONAL: "Regional price rules and regional price lists",
  STANDARD_LIST: "Always last and cannot be moved — guarantees a fallback price",
};

const TODAY = "2026-10-29";
const NOW = "2026-10-29 14:15";
const ME = "Riya Shah";
const MANAGER = "Neel Kamat";
const ACTORS = [
  { id: ME, label: `${ME} — Pricing Analyst` },
  { id: MANAGER, label: `${MANAGER} — Pricing Manager` },
];

const orderText = (o: string[]) => o.map((t) => TIER_LABEL[t] ?? t).join(" → ");

function Page() {
  const [versions, setVersionsState] = useState<PrecedenceVersion[]>(PRECEDENCE_VERSIONS);
  const active = versions.find((v) => v.status === "ACTIVE")!;
  const pending = versions.find((v) => v.status === "PENDING_APPROVAL");
  const scheduled = versions.find((v) => v.status === "SCHEDULED");
  const [order, setOrder] = useState<string[]>([...active.order]);
  const [tieBreaker, setTieBreaker] = useState(active.tieBreaker);
  const [effectiveFrom, setEffectiveFrom] = useState("2027-01-01");
  const [reasonCode, setReasonCode] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [routeApproval, setRouteApproval] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [history, setHistory] = useState<string[][]>([]);
  const [announce, setAnnounce] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [actor, setActor] = useState(ME);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectComment, setRejectComment] = useState("");
  const [rejectSubmitted, setRejectSubmitted] = useState(false);
  const [deciding, setDeciding] = useState(false);

  /** Keep the in-memory store in sync so the price trace uses the approved order. */
  const setVersions = (next: PrecedenceVersion[]) => {
    PRECEDENCE_VERSIONS.splice(0, PRECEDENCE_VERSIONS.length, ...next);
    setVersionsState(next);
  };

  const dirty = order.join() !== active.order.join() || tieBreaker !== active.tieBreaker;
  const lastMovable = order.length - 2; // STANDARD_LIST is pinned to the last slot
  const nextVersion = Math.max(...versions.map((x) => x.version)) + 1;

  const move = (from: number, to: number) => {
    if (to < 0 || to >= order.length || from === to) return;
    const next = [...order];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    if (next[next.length - 1] !== "STANDARD_LIST") {
      setError({
        errorClass: "BUSINESS_RULE",
        code: "PRECEDENCE_INVALID",
        message: `Standard list price must stay last, so ${TIER_LABEL[item]} can't move ${item === "STANDARD_LIST" ? "up" : "below it"}. Choose another position.`,
        field: "order",
      });
      return;
    }
    setError(null);
    setHistory((h) => [...h, order]);
    setOrder(next);
    setAnnounce(`${TIER_LABEL[item]} moved to position ${to + 1} of ${next.length}.`);
  };

  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setOrder(prev);
    setAnnounce("Last move undone.");
  };

  const reset = () => {
    setHistory((h) => [...h, order]);
    setOrder([...active.order]);
    setTieBreaker(active.tieBreaker);
    setError(null);
    setAnnounce(`Order reset to active v${active.version}.`);
  };

  const errs: Record<string, string> = {};
  if (!effectiveFrom) errs["prec-from"] = "Choose the date the new order takes effect.";
  else if (effectiveFrom < TODAY) errs["prec-from"] = "Choose today or a future date — past dates would re-price historic quotes.";
  if (!reasonCode) errs["prec-reason"] = "Select why the order is changing — it is kept in the audit trail.";
  else if (reasonCode === "OTHER" && !reasonText.trim()) errs["prec-reason-text"] = "Describe the reason for this change.";
  const fe = (k: string) => (submitted ? errs[k] : undefined);

  const requestSave = (e?: FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    if (pending) {
      setError({ errorClass: "CONFLICT", code: "APPROVAL_PENDING", message: `v${pending.version} is awaiting approval. Approve, reject or withdraw it before proposing another change.` });
      return;
    }
    const first = Object.keys(errs)[0];
    if (first) {
      setError({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Fill in the required change details.", field: Object.keys(errs).map((k) => ({ "prec-from": "effectiveFrom", "prec-reason": "reasonCode", "prec-reason-text": "reasonText" })[k] ?? k).join(", ") });
      document.getElementById(first)?.focus();
      return;
    }
    if (order[order.length - 1] !== "STANDARD_LIST") {
      setError({ errorClass: "BUSINESS_RULE", code: "PRECEDENCE_INVALID", message: "Standard list price must stay last. Reset the order and try again.", field: "order" });
      return;
    }
    setError(null);
    setConfirmOpen(true);
  };

  /** Moves a version into force: ACTIVE now (superseding the current one) or SCHEDULED for a future date. */
  const goLive = (v: PrecedenceVersion, all: PrecedenceVersion[]): PrecedenceVersion[] => {
    const now = v.effectiveFrom <= TODAY;
    return all.map((x) => (x.version === v.version ? { ...v, status: now ? "ACTIVE" : "SCHEDULED" } : now && x.status === "ACTIVE" ? { ...x, status: "SUPERSEDED" } : x));
  };

  const save = () => {
    setSaving(true);
    window.setTimeout(() => {
      const v: PrecedenceVersion = {
        version: nextVersion,
        order: [...order],
        tieBreaker,
        effectiveFrom,
        reasonCode: reasonCode === "OTHER" ? `OTHER: ${reasonText.trim()}` : reasonCode,
        by: actor,
        at: NOW,
        status: "PENDING_APPROVAL",
      };
      const next = routeApproval ? [v, ...versions] : goLive(v, [v, ...versions]);
      setVersions(next);
      const placed = next.find((x) => x.version === v.version)!;
      if (placed.status === "ACTIVE") {
        setHistory([]);
      } else {
        // The editor returns to the order in force; the proposal shows in its own card.
        setOrder([...active.order]);
        setTieBreaker(active.tieBreaker);
        setHistory([]);
      }
      setReasonCode("");
      setReasonText("");
      setSubmitted(false);
      setSaving(false);
      setConfirmOpen(false);
      toast.success(`Precedence v${v.version} ${placed.status === "PENDING_APPROVAL" ? "submitted for approval" : placed.status === "SCHEDULED" ? "scheduled" : "activated"}`, {
        description:
          placed.status === "PENDING_APPROVAL"
            ? `${MANAGER} (Pricing Manager) has an approval task. v${active.version} keeps pricing until v${v.version} is approved and effective.`
            : placed.status === "SCHEDULED"
              ? `Takes effect on ${effectiveFrom}. v${active.version} keeps pricing until then.`
              : `v${active.version} is now superseded.`,
      });
    }, 500);
  };

  /* ---------- Approval decisions (segregation of duties: approver ≠ submitter) ---------- */

  const requestApprove = () => {
    if (!pending) return;
    if (actor === pending.by) {
      setError({ errorClass: "AUTHORIZATION", code: "SEGREGATION_OF_DUTIES", message: `You submitted v${pending.version}, so you cannot approve it. Approval must be by someone other than the submitter — switch “Acting as” to the approver.` });
      return;
    }
    setError(null);
    setConfirmApprove(true);
  };

  const approve = () => {
    if (!pending) return;
    setDeciding(true);
    window.setTimeout(() => {
      const decided = { ...pending, decidedBy: actor, decidedAt: NOW };
      const next = goLive(decided, versions);
      setVersions(next);
      const placed = next.find((x) => x.version === pending.version)!;
      if (placed.status === "ACTIVE") {
        setOrder([...placed.order]);
        setTieBreaker(placed.tieBreaker);
      }
      setDeciding(false);
      setConfirmApprove(false);
      toast.success(`Precedence v${pending.version} approved`, {
        description: placed.status === "SCHEDULED" ? `Takes effect on ${placed.effectiveFrom}. v${active.version} keeps pricing until then.` : `Now active. v${active.version} is superseded.`,
      });
    }, 400);
  };

  const rejectError = !rejectComment.trim() ? "Enter a comment — the submitter sees why it was rejected." : undefined;
  const openReject = () => {
    if (!pending) return;
    if (actor === pending.by) {
      setError({ errorClass: "AUTHORIZATION", code: "SEGREGATION_OF_DUTIES", message: `You submitted v${pending.version}, so you cannot reject it. Use Withdraw instead, or switch “Acting as” to the approver.` });
      return;
    }
    setError(null);
    setRejectComment("");
    setRejectSubmitted(false);
    setRejectOpen(true);
  };
  const reject = (e?: FormEvent) => {
    e?.preventDefault();
    setRejectSubmitted(true);
    if (!pending || rejectError) {
      document.getElementById("prec-reject-comment")?.focus();
      return;
    }
    setDeciding(true);
    window.setTimeout(() => {
      setVersions(versions.map((x) => (x.version === pending.version ? { ...x, status: "REJECTED", decidedBy: actor, decidedAt: NOW, comment: rejectComment.trim() } : x)));
      setDeciding(false);
      setRejectOpen(false);
      toast.success(`Precedence v${pending.version} rejected`, { description: `v${active.version} stays active. ${pending.by} can see your comment in the version history.` });
    }, 400);
  };

  // Withdrawing your own submission is reversible → undo toast.
  const withdraw = () => {
    if (!pending) return;
    const before = versions;
    setVersions(versions.map((x) => (x.version === pending.version ? { ...x, status: "WITHDRAWN", decidedBy: actor, decidedAt: NOW } : x)));
    setError(null);
    notifyUndo(`Precedence v${pending.version} withdrawn — the approval task is cancelled`, () => setVersions(before));
  };

  const changes = order
    .map((t, i) => (active.order[i] !== t ? `${TIER_LABEL[t]} → position ${i + 1}` : null))
    .filter(Boolean) as string[];
  const reasonLabel = (r: string) => (r.startsWith("OTHER: ") ? `Other: ${r.slice(7)}` : humanize(r));

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Strategy & segmentation" }, { label: "Rule precedence" }]}>
      <ListHeader
        title="Rule precedence"
        subtitle={
          <>
            When several prices apply, the highest tier wins. Every calculated price returns a{" "}
            <Link to="/pricing/price-trace" className="text-brand font-medium hover:underline">
              price trace
            </Link>{" "}
            showing the winning rule.
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2" role="status">
            <StatusPill status="ACTIVE" label={`v${active.version} active since ${active.effectiveFrom}`} />
            {pending && <StatusPill status="PENDING_APPROVAL" label={`v${pending.version} awaiting approval`} />}
            {scheduled && <StatusPill status="SCHEDULED" label={`v${scheduled.version} from ${scheduled.effectiveFrom}`} />}
            {dirty && <StatusPill status="PENDING" label="Unsaved changes" />}
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <label htmlFor="prec-acting-as" className="font-medium text-foreground">
          Acting as (demo)
        </label>
        <select id="prec-acting-as" className={`${inputCls} sm:!w-72`} value={actor} onChange={(e) => setActor(e.target.value)}>
          {ACTORS.map((a) => (
            <option key={a.id} value={a.id}>
              {a.label}
            </option>
          ))}
        </select>
      </div>

      <ErrorBanner error={error} onClose={() => setError(null)} />
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>

      {pending && (
        <Card
          className="mb-6"
          title={
            <span className="flex flex-wrap items-center gap-2">
              Approval task · v{pending.version} <StatusPill status="PENDING_APPROVAL" />
            </span>
          }
          subtitle={`Submitted by ${pending.by} on ${pending.at}. Assigned to ${MANAGER} (Pricing Manager). v${active.version} keeps pricing until this is approved and effective.`}
          actions={
            <>
              {actor === pending.by && (
                <Btn variant="subtle" icon={Undo2} onClick={withdraw}>
                  Withdraw
                </Btn>
              )}
              <Btn variant="outline" icon={X} onClick={openReject}>
                Reject
              </Btn>
              <Btn icon={Check} onClick={requestApprove}>
                Approve
              </Btn>
            </>
          }
        >
          <DetailGrid
            items={[
              { label: "Proposed order", value: orderText(pending.order), full: true },
              { label: "Current order", value: <span className="text-muted-foreground">{orderText(active.order)}</span>, full: true },
              { label: "Tie-breaker", value: `${humanize(pending.tieBreaker)}${pending.tieBreaker !== active.tieBreaker ? ` (was ${humanize(active.tieBreaker).toLowerCase()})` : ""}` },
              { label: "Effective from", value: <span className="tabular-nums">{pending.effectiveFrom}</span> },
              { label: "Reason", value: reasonLabel(pending.reasonCode), full: true },
            ]}
          />
        </Card>
      )}

      <form onSubmit={requestSave} noValidate className="grid grid-cols-1 xl:grid-cols-[1fr_400px] gap-6 items-start">
        <Card
          title="Precedence order"
          subtitle="Use the arrow buttons (or drag a row) to reorder. Highest priority at the top."
          actions={
            <>
              <Btn variant="ghost" size="sm" icon={Undo2} onClick={undo} disabled={history.length === 0}>
                Undo move
              </Btn>
              <Btn variant="subtle" size="sm" icon={RotateCcw} onClick={reset} disabled={!dirty}>
                Discard changes
              </Btn>
            </>
          }
          className="min-w-0"
        >
          <ol className="space-y-2" aria-label="Precedence order, highest priority first">
            {order.map((tier, i) => {
              const locked = tier === "STANDARD_LIST";
              return (
                <li
                  key={tier}
                  draggable={!locked}
                  onDragStart={() => setDragIdx(i)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIdx !== null) move(dragIdx, i);
                    setDragIdx(null);
                  }}
                  className={`flex flex-wrap sm:flex-nowrap items-center gap-3 rounded-xl border px-4 py-3 bg-card ${locked ? "border-dashed bg-muted/40" : "border-border hover:border-brand/50 cursor-grab"}`}
                >
                  {locked ? <Lock className="size-4 text-muted-foreground" aria-label="Locked" /> : <GripVertical className="size-4 text-muted-foreground" aria-hidden />}
                  <span className="size-8 rounded-full bg-navy text-navy-foreground grid place-items-center text-sm font-bold" aria-hidden>
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold">
                      <span className="sr-only">Position {i + 1}: </span>
                      {TIER_LABEL[tier]}
                    </div>
                    <div className="text-xs text-muted-foreground">{TIER_HINT[tier]}</div>
                  </div>
                  {active.order[i] !== tier && <Tag tone="brand">Changed</Tag>}
                  {!locked && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        aria-label={`Move ${TIER_LABEL[tier]} up`}
                        onClick={() => move(i, i - 1)}
                        disabled={i === 0}
                        className="size-10 grid place-items-center rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ArrowUp className="size-4" aria-hidden />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${TIER_LABEL[tier]} down`}
                        title={i === lastMovable ? "Standard list price must stay last" : undefined}
                        onClick={() => move(i, i + 1)}
                        disabled={i >= lastMovable}
                        className="size-10 grid place-items-center rounded-lg border border-border hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <ArrowDown className="size-4" aria-hidden />
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </Card>

        <div className="space-y-6 min-w-0">
          <Card title="Change details" subtitle="Changing the order is a governed change: versioned, effective-dated and audited.">
            <div className="space-y-4">
              <p className="text-xs text-muted-foreground">
                <span className="text-destructive" aria-hidden>*</span> Required
              </p>
              <Field label="Tie-breaker" required hint="Used when two rules in the same tier match.">
                <select className={inputCls} value={tieBreaker} onChange={(e) => setTieBreaker(e.target.value)}>
                  {TIE_BREAKERS.map((t) => (
                    <option key={t} value={t}>
                      {humanize(t)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Effective from" required error={fe("prec-from")}>
                <input id="prec-from" type="date" min={TODAY} className={inputCls} value={effectiveFrom} onChange={(e) => setEffectiveFrom(e.target.value)} />
              </Field>
              <Field label="Reason code" required error={fe("prec-reason")}>
                <select id="prec-reason" className={inputCls} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                  <option value="">Select reason…</option>
                  {REASON_CODES.map((r) => (
                    <option key={r} value={r}>
                      {humanize(r)}
                    </option>
                  ))}
                </select>
              </Field>
              {reasonCode === "OTHER" && (
                <Field label="Reason text" required error={fe("prec-reason-text")}>
                  <textarea id="prec-reason-text" rows={2} className={`${inputCls} h-auto py-2`} value={reasonText} onChange={(e) => setReasonText(e.target.value)} />
                </Field>
              )}
              <Toggle checked={routeApproval} onChange={setRouteApproval} label="Route for approval before it takes effect" />
              <div className="flex flex-wrap justify-end gap-2 pt-2">
                <Btn type="submit" icon={Save} disabled={!dirty || !!pending}>
                  {routeApproval ? "Submit for approval" : "Save new version"}
                </Btn>
              </div>
              {pending ? (
                <p className="text-xs text-muted-foreground text-right">v{pending.version} is awaiting approval — decide on it before proposing another change.</p>
              ) : (
                !dirty && <p className="text-xs text-muted-foreground text-right">Reorder tiers or change the tie-breaker to save a new version.</p>
              )}
            </div>
          </Card>
          <InfoBanner title="Default order">
            {PRECEDENCE_TIERS.map((t) => TIER_LABEL[t]).join(" → ")}. Standard list price is always last.
          </InfoBanner>
        </div>
      </form>

      <ConfirmDialog
        open={confirmOpen}
        title={routeApproval ? `Submit precedence v${nextVersion} for approval?` : `Save precedence v${nextVersion}?`}
        description={`${changes.length ? changes.join("; ") + "." : `Tie-breaker → ${humanize(tieBreaker)}.`} ${
          routeApproval
            ? `${MANAGER} (Pricing Manager) gets an approval task. Once approved it takes effect on ${effectiveFrom}.`
            : effectiveFrom > TODAY
              ? `Scheduled to take effect on ${effectiveFrom}.`
              : `Takes effect immediately and supersedes v${active.version}.`
        } Every price calculated after that uses the new order.`}
        confirmLabel={routeApproval ? "Submit for approval" : "Save new version"}
        loading={saving}
        onConfirm={save}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={confirmApprove}
        title={`Approve precedence v${pending?.version}?`}
        description={
          pending
            ? `${orderText(pending.order)} · tie-breaker ${humanize(pending.tieBreaker).toLowerCase()}. ${
                pending.effectiveFrom > TODAY ? `Scheduled to take effect on ${pending.effectiveFrom}; v${active.version} keeps pricing until then.` : `Takes effect immediately and supersedes v${active.version}.`
              } Approving as ${actor}.`
            : ""
        }
        confirmLabel="Approve"
        loading={deciding}
        onConfirm={approve}
        onCancel={() => setConfirmApprove(false)}
      />

      <Modal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        dismissible={!deciding}
        title={`Reject precedence v${pending?.version}`}
        subtitle={`v${active.version} stays active. The submitter sees your comment.`}
        footer={
          <>
            <Btn variant="subtle" onClick={() => setRejectOpen(false)} disabled={deciding}>
              Cancel
            </Btn>
            <Btn type="submit" form="prec-reject-form" variant="danger" loading={deciding}>
              Reject
            </Btn>
          </>
        }
      >
        <form id="prec-reject-form" onSubmit={reject} noValidate>
          <Field label="Comment" required error={rejectSubmitted ? rejectError : undefined}>
            <textarea id="prec-reject-comment" rows={3} className={`${inputCls} h-auto py-2`} value={rejectComment} onChange={(e) => setRejectComment(e.target.value)} placeholder="e.g. Keep segment above customer-specific until the Q1 contract review" />
          </Field>
        </form>
      </Modal>

      <section className="mt-8" aria-labelledby="prec-history-h">
        <div className="mb-3">
          <h2 id="prec-history-h" className="text-lg font-semibold tracking-tight">
            Version history
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Every change is versioned and audited, including approval decisions.</p>
        </div>
        <DataTable
          caption="Precedence version history"
          rows={versions}
          rowKey={(v) => String(v.version)}
          numbered={false}
          pageSize={10}
          columns={[
            { key: "v", header: "Version", cell: (v) => <span className="font-semibold tabular-nums">v{v.version}</span> },
            { key: "order", header: "Order", cell: (v) => <span className="block min-w-72">{orderText(v.order)}</span> },
            { key: "tb", header: "Tie-breaker", className: "whitespace-nowrap", cell: (v) => humanize(v.tieBreaker) },
            { key: "eff", header: "Effective from", cell: (v) => <span className="tabular-nums whitespace-nowrap">{v.effectiveFrom}</span> },
            { key: "reason", header: "Reason", className: "whitespace-nowrap", cell: (v) => <Tag>{reasonLabel(v.reasonCode)}</Tag> },
            {
              key: "by",
              header: "Changed by",
              cell: (v) => (
                <span className="whitespace-nowrap">
                  {v.by} <span className="text-muted-foreground tabular-nums">· {v.at}</span>
                </span>
              ),
            },
            {
              key: "decision",
              header: "Decision",
              cell: (v) =>
                v.decidedBy ? (
                  <span className="block min-w-48">
                    {v.status === "WITHDRAWN" ? "Withdrawn" : v.status === "REJECTED" ? "Rejected" : "Approved"} by {v.decidedBy}
                    <span className="text-muted-foreground tabular-nums"> · {v.decidedAt}</span>
                    {v.comment && <span className="block text-muted-foreground">“{v.comment}”</span>}
                  </span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                ),
            },
            { key: "status", header: "Status", cell: (v) => <StatusPill status={v.status} /> },
          ]}
        />
      </section>
    </PricingLayout>
  );
}
