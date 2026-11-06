import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { CheckCircle2, Copy, FileDown, FileText, GitCompare, Pencil, Printer, RefreshCw, Send, ShieldOff, Waves, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  ConfirmDialog,
  DataTable,
  DetailGrid,
  DetailTitle,
  Drawer,
  EmptyState,
  ErrorBanner,
  Field,
  Flag,
  InfoBanner,
  LinkBtn,
  Modal,
  PillTabs,
  PricingLayout,
  RecordId,
  RecordLink,
  StatusPill,
  Tag,
  humanize,
  inputCls,
  missingFields,
  money,
  pct,
  type ApiError,
  type Tone,
  KpiTile,
} from "@/components/pricing/kit";
import { RequireAccess, Secure, pctBand } from "@/components/pricing/access";
import { QuoteLinesTable } from "@/components/pricing/quote-lines";
import { customerById } from "@/lib/pricing/data";
import { NOW, QUOTE_TEMPLATES, TODAY_ISO, priceQuote, quoteById, saveQuote, taskById, type PricedLine, type Quote, type QuoteLineInput, type QuoteRevision, type SyncStatus } from "@/lib/pricing/deals";
import { compareRevisions, effectiveStatus, erpPayload, generateDocument, submitQuote, syncToErp, type RevisionLike } from "@/lib/pricing/cpq";
import { userName, useSession } from "@/lib/pricing/session";

export const Route = createFileRoute("/pricing/quotes/$id")({
  head: ({ params }) => ({ meta: [{ title: `Quote ${params.id} · Rebate Ninja` }] }),
  component: Page,
});

type Tab = "lines" | "approvals" | "documents" | "revisions" | "sync" | "answers";
const SYNC_TONE: Record<SyncStatus, Tone> = { SUCCESS: "success", FAILED: "danger", RETRYING: "warning", SENT: "info", PENDING: "neutral" };
const plusDays = (iso: string, d: number) => {
  const x = new Date(`${iso}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};

function Page() {
  const { id } = Route.useParams();
  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Quotes", to: "/pricing/quotes" }, { label: id }]}>
      <RequireAccess roles={["PRICING_ADMIN", "SALES_REP", "SALES_MANAGER", "DEAL_DESK", "FINANCE_CONTROLLER"]}>
        <Detail id={id} />
      </RequireAccess>
    </PricingLayout>
  );
}

function Detail({ id }: { id: string }) {
  const { user, role, own, access } = useSession();
  const [q, setQ] = useState<Quote | undefined>(() => quoteById(id));
  const [tab, setTab] = useState<Tab>("lines");
  const [error, setError] = useState<ApiError | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftLines, setDraftLines] = useState<QuoteLineInput[]>([]);
  const [busy, setBusy] = useState<string>("");
  const [docOpen, setDocOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectTried, setRejectTried] = useState(false);
  const [payloadOpen, setPayloadOpen] = useState(false);

  if (!q)
    return (
      <div className="bg-card border border-border rounded-xl">
        <EmptyState icon={FileText} title={`Quote ${id} doesn't exist`} action={<LinkBtn to="/pricing/quotes" variant="subtle">Back to quotes</LinkBtn>}>
          It may have been removed, or the link is mistyped.
        </EmptyState>
      </div>
    );
  // Own-records scope is enforced on the record, not just the list (US-CQ-01 AC#4, FR-K-03).
  if (own("CPQ") && q.ownerId !== user.id)
    return (
      <div className="bg-card border border-border rounded-xl" role="alert">
        <EmptyState icon={ShieldOff} title="You can't open this quote" action={<LinkBtn to="/pricing/quotes" variant="subtle">Back to my quotes</LinkBtn>}>
          {q.id} belongs to {userName(q.ownerId)}. Sales representatives can only open their own quotes. Error code PERMISSION_DENIED (class AUTHORIZATION).
        </EmptyState>
      </div>
    );

  const status = effectiveStatus(q);
  const isOwner = q.ownerId === user.id && role === "SALES_REP";
  const canOps = role === "PRICING_ADMIN";
  const priced = priceQuote(editing ? { ...q, lines: draftLines } : q);
  const t = priced.totals;
  const cust = customerById(q.customerId);
  const task = taskById(q.approvalTaskId);
  const commit = (next: Quote) => {
    saveQuote(next);
    setQ(next);
  };
  const run = (key: string, fn: () => void) => {
    setBusy(key);
    setError(null);
    window.setTimeout(() => {
      fn();
      setBusy("");
    }, 400);
  };
  const notApproved = (action: string): ApiError => ({
    errorClass: "BUSINESS_RULE",
    code: "QUOTE_NOT_APPROVED",
    message: `This quote is ${humanize(status).toLowerCase()}, so you can't ${action}. ${status === "DRAFT" ? "Submit it first" : status === "PENDING_APPROVAL" ? "Wait for the approval decision" : "Revise it to start again"} — documents and sending need an approved quote.`,
  });

  /* ---------- lifecycle (US-CQ-04) ---------- */
  const submit = () => {
    if (priced.blocked) {
      setError({ errorClass: "BUSINESS_RULE", code: "GUARDRAIL_HARD_BLOCK", message: "A line is outside a hard-block guardrail. Edit the line price — it can't be submitted." });
      return;
    }
    if (priced.failed) {
      setError({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: `${priced.failed} line(s) can't be priced. Edit the lines to fix them.` });
      return;
    }
    run("submit", () => {
      const res = submitQuote(q, user.id);
      setQ(res.quote);
      if (res.autoApproved) toast.success(`Quote ${q.id} approved`, { description: "Inside policy — no approval needed." });
      else toast.success(`Quote ${q.id} submitted for approval`, { description: `${res.task?.id} assigned to ${res.task?.steps[0].approvers.map((a) => userName(a.userId)).join(" and ")}.` });
    });
  };
  const send = () => {
    if (status !== "APPROVED") return setError(notApproved("send it to the customer"));
    run("send", () => {
      const docs = q.documents.some((d) => d.kind === "PDF" && d.quoteRevision === q.revision) ? q.documents : [generateDocument(q, QUOTE_TEMPLATES[q.channel === "Partner" ? 1 : 0], user.id), ...q.documents];
      commit({ ...q, status: "SENT", documents: docs, updatedAt: NOW });
      toast.success(`Quote ${q.id} sent`, { description: `PDF revision ${q.revision} emailed to ${cust?.name ?? "the customer"}.` });
    });
  };
  const accept = () =>
    run("accept", () => {
      // Accepting triggers the ERP order sync (US-CQ-06 trigger: ACCEPTED).
      const accepted: Quote = { ...q, status: "ACCEPTED", updatedAt: NOW };
      const { sync } = syncToErp(accepted);
      commit({ ...accepted, sync });
      if (sync.status === "SUCCESS") toast.success(`Quote ${q.id} accepted`, { description: `ERP order ${sync.erpOrderRef} created.` });
      else toast.error(`Quote ${q.id} accepted, but the ERP order failed`, { description: `${sync.lastError?.code} — see the ERP sync tab. The quote owner and integration owner were notified.` });
      setTab("sync");
    });
  const reject = () => {
    setRejectTried(true);
    if (!rejectReason.trim()) return;
    run("reject", () => {
      commit({ ...q, status: "REJECTED", updatedAt: NOW, history: q.history });
      setRejectOpen(false);
      toast.success(`Quote ${q.id} marked as rejected`, { description: rejectReason });
    });
  };
  const revise = () =>
    run("revise", () => {
      const prev: QuoteRevision = { revision: q.revision, status, createdAt: q.updatedAt, createdBy: q.ownerId, lines: q.lines, paymentTerms: q.paymentTerms, incoterms: q.incoterms, validUntil: q.validUntil, note: status === "EXPIRED" ? "Expired" : "Superseded by revision" };
      const next: Quote = { ...q, revision: q.revision + 1, status: "DRAFT", history: [prev, ...q.history], approvalTaskId: undefined, expectedMarginPct: undefined, validUntil: q.validUntil < TODAY_ISO ? plusDays(TODAY_ISO, 30) : q.validUntil, updatedAt: NOW };
      commit(next);
      setDraftLines(next.lines);
      setEditing(true);
      toast.success(`Revision ${next.revision} created in Draft`, { description: `Revision ${q.revision} is kept and can be compared.` });
    });
  const saveLines = () =>
    run("lines", () => {
      commit({ ...q, lines: draftLines, updatedAt: NOW });
      setEditing(false);
      toast.success("Quote lines saved");
    });

  /* ---------- documents (US-CQ-04 AC#1, #4) ---------- */
  const openDoc = () => {
    if (status !== "APPROVED" && status !== "SENT" && status !== "ACCEPTED") return setError(notApproved("generate a final document"));
    setDocOpen(true);
  };

  /* ---------- ERP sync (US-CQ-06) ---------- */
  const retry = () =>
    run("sync", () => {
      const { sync, duplicate } = syncToErp(q);
      commit({ ...q, sync });
      if (duplicate) toast.success("Already in the ERP — no duplicate created", { description: `Same idempotency key returned the existing order ${sync.erpOrderRef}.` });
      else if (sync.status === "SUCCESS") toast.success(`ERP order ${sync.erpOrderRef} created`, { description: `Attempt ${sync.attempts} succeeded.` });
      else toast.error(`Sync failed: ${sync.lastError?.code}`, { description: sync.lastError?.message });
    });

  const primary: ReactNode = (() => {
    if (!isOwner) return null;
    if (status === "DRAFT")
      return (
        <Btn icon={Send} loading={busy === "submit"} onClick={submit} disabled={editing}>
          Submit for approval
        </Btn>
      );
    if (status === "APPROVED" || status === "PENDING_APPROVAL")
      return (
        <Btn icon={Send} loading={busy === "send"} onClick={send}>
          Send to customer
        </Btn>
      );
    if (status === "SENT")
      return (
        <Btn icon={CheckCircle2} loading={busy === "accept"} onClick={accept}>
          Mark accepted
        </Btn>
      );
    return null;
  })();

  const revisions: RevisionLike[] = [{ revision: q.revision, lines: q.lines, paymentTerms: q.paymentTerms, incoterms: q.incoterms, validUntil: q.validUntil }, ...q.history];

  return (
    <>
      <DetailTitle
        title={q.name}
        status={status}
        unsaved={editing && JSON.stringify(draftLines) !== JSON.stringify(q.lines)}
        meta={[
          <RecordId key="id">{q.id}</RecordId>,
          `Revision ${q.revision}`,
          `Owner ${userName(q.ownerId)}`,
          `Updated ${q.updatedAt}`,
        ]}
        attributes={[
          { label: "Customer", value: cust ? <RecordLink to="/pricing/customers/$id" params={{ id: cust.id }}>{cust.name}</RecordLink> : q.customerId },
          ...(q.crmOpportunityId ? [{ label: "CRM", value: `${q.crmOpportunityId} · ${q.crmAccountId}` }] : []),
          { label: "Channel", value: q.channel },
          { label: "Valid until", value: q.validUntil },
          ...(q.partnerId ? [{ label: "Source", value: "Partner portal", tone: "info" as Tone }] : []),
        ]}
        actions={
          <>
            {isOwner && (status === "SENT" || status === "EXPIRED" || status === "REJECTED") && (
              <Btn variant="subtle" icon={Copy} loading={busy === "revise"} onClick={revise}>
                Revise quote
              </Btn>
            )}
            {isOwner && status === "SENT" && (
              <Btn variant="subtle" icon={XCircle} onClick={() => (setRejectOpen(true), setRejectTried(false), setRejectReason(""))}>
                Mark rejected
              </Btn>
            )}
            <Btn variant="outline" icon={FileDown} onClick={openDoc}>
              Generate document
            </Btn>
            {primary}
          </>
        }
      />

      {status === "EXPIRED" && q.status !== "EXPIRED" && (
        <InfoBanner tone="warning" title="This quote has expired">
          It was valid until {q.validUntil}. Revise it to re-price and send a new revision.
        </InfoBanner>
      )}
      {!isOwner && role !== "SALES_REP" && (
        <InfoBanner title="View only">
          You can view this quote. Only its owner, {userName(q.ownerId)}, can change, submit or send it{role === "SALES_MANAGER" || role === "DEAL_DESK" ? " — approvals happen in the approval queue" : ""}.
        </InfoBanner>
      )}
      {q.renewalOf && (
        <InfoBanner title={`Renewal of ${q.renewalOf}`}>
          Prior-term realized margin{" "}
          <Secure field="marginPct" band={pctBand(q.priorTermRealizedMarginPct ?? 0)}>
            <b>{q.priorTermRealizedMarginPct?.toFixed(1)}%</b>
          </Secure>{" "}
          vs proposed{" "}
          <Secure field="marginPct" band={pctBand(t.marginPct)}>
            <b>{t.marginPct.toFixed(1)}%</b>
          </Secure>
          . Start the renewal from what the last term really earned.
        </InfoBanner>
      )}
      <ErrorBanner error={error} onClose={() => setError(null)} note={false} />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 mb-6">
        <Kpi label="Net value" value={money(t.net)} />
        <Kpi label="List value" value={money(t.list)} />
        <Kpi label="Discount off list" value={pct(-t.discountPct)} />
        {access("marginPct") !== "HIDE" && <Kpi label="Margin" value={<Secure field="marginPct" band={pctBand(t.marginPct)}>{t.marginPct.toFixed(1)}%</Secure>} />}
        <Kpi
          label="Approval"
          value={priced.blocked ? <Flag tone="danger">Blocked</Flag> : task ? <StatusPill status={task.status} /> : priced.approvalRequired ? <Flag tone="info">Required</Flag> : <Flag tone="success">Not needed</Flag>}
        />
      </div>

      <PillTabs<Tab>
        idPrefix="quote"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "lines", label: "Lines", count: q.lines.length },
          { key: "approvals", label: "Approvals" },
          { key: "documents", label: "Documents", count: q.documents.length },
          { key: "revisions", label: "Revisions", count: revisions.length },
          { key: "sync", label: "ERP sync" },
          { key: "answers", label: "Guided answers" },
        ]}
      />

      <div role="tabpanel" id={`quote-panel-${tab}`} aria-labelledby={`quote-tab-${tab}`}>
        {tab === "lines" && (
          <div className="space-y-4">
            {isOwner && status === "DRAFT" && (
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-8 [&>p]:min-w-0 [&>p]:flex-1 [&>:not(p)]:shrink-0">
                <p className="text-base text-muted-foreground">Prices recalculate as you edit. Pricing date {q.pricingDate}.</p>
                {editing ? (
                  <div className="flex gap-2">
                    <Btn variant="subtle" onClick={() => setEditing(false)} disabled={busy === "lines"}>
                      Cancel
                    </Btn>
                    <Btn loading={busy === "lines"} onClick={saveLines}>
                      Save lines
                    </Btn>
                  </div>
                ) : (
                  <Btn variant="outline" icon={Pencil} onClick={() => (setDraftLines(q.lines), setEditing(true))}>
                    Edit lines
                  </Btn>
                )}
              </div>
            )}
            <QuoteLinesTable quote={editing ? { ...q, lines: draftLines } : q} editable={editing} onChange={setDraftLines} />
            <div className="flex flex-wrap gap-2">
              <LinkBtn to="/pricing/analytics/waterfall" variant="subtle" size="sm" icon={Waves}>
                See price waterfall
              </LinkBtn>
              <LinkBtn to="/pricing/price-trace" variant="subtle" size="sm">
                Explain a price in Price trace
              </LinkBtn>
            </div>
          </div>
        )}

        {tab === "approvals" && (
          <Card title="Approval" subtitle="Routing follows the approval matrix. Decisions are made in the approval queue." actions={task && <LinkBtn to="/pricing/approvals" variant="outline" size="sm">Open approval queue</LinkBtn>}>
            {!task ? (
              <EmptyState icon={CheckCircle2} title={status === "DRAFT" ? "Not submitted yet" : "No approval was needed"}>
                {status === "DRAFT" ? (priced.approvalRequired ? "Submitting routes this quote for approval." : "This quote is inside policy — submitting approves it straight away.") : "The quote was inside policy when submitted."}
              </EmptyState>
            ) : (
              <div className="space-y-4">
                <p className="text-sm">
                  <RecordId>{task.id}</RecordId> · rules {task.ruleIds.join(", ")} · submitted {task.submittedAt} by {userName(task.requesterId)}
                </p>
                <ol className="space-y-3">
                  {task.steps.map((s) => (
                    <li key={s.level} className="rounded-lg border border-border p-3">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                        Level {s.level} {s.mode === "PARALLEL" && <Tag>Parallel · {s.parallelRule}</Tag>} {s.dueAt && <span className="font-normal text-muted-foreground">due {s.dueAt}</span>}
                      </div>
                      <ul className="mt-2 space-y-1 text-sm">
                        {s.approvers.map((a) => (
                          <li key={a.userId} className="flex flex-wrap items-center gap-2">
                            <StatusPill status={a.status} /> {userName(a.userId)}
                            {a.comment && <span className="text-muted-foreground">“{a.comment}”</span>}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </Card>
        )}

        {tab === "documents" && (
          <Card title="Documents" subtitle="Each file records the quote revision, template version, time and a content hash. Cost and margin never appear in customer documents." actions={<Btn variant="outline" size="sm" icon={FileDown} onClick={openDoc}>Generate document</Btn>}>
            {q.documents.length === 0 ? (
              <EmptyState icon={FileText} title="No documents yet">
                Approved quotes can produce a branded PDF and an ERP-ready order summary.
              </EmptyState>
            ) : (
              <DataTable
                caption="Generated documents"
                rows={q.documents}
                rowKey={(d) => d.id}
                columns={[
                  { key: "id", header: "Document", cell: (d) => <RecordId>{d.id}</RecordId> },
                  { key: "k", header: "Type", className: "whitespace-nowrap", cell: (d) => d.kind === "PDF" ? "PDF" : "ERP order summary" },
                  { key: "t", header: "Template", cell: (d) => `${d.template} ${d.templateVersion}` },
                  { key: "r", header: "Quote rev.", align: "right", cell: (d) => d.quoteRevision },
                  { key: "at", header: "Generated", cell: (d) => <span className="tabular-nums whitespace-nowrap">{d.at}</span> },
                  { key: "by", header: "By", cell: (d) => userName(d.by) },
                  { key: "h", header: "Content hash", cell: (d) => <code className="text-sm break-all">{d.hash}</code> },
                ]}
              />
            )}
          </Card>
        )}

        {tab === "revisions" && <RevisionCompare q={q} revisions={revisions} />}

        {tab === "sync" && (
          <Card
            title="ERP order sync"
            subtitle="An accepted quote creates one ERP order. Retries reuse the idempotency key, so they never create a duplicate."
            actions={
              q.sync || status === "ACCEPTED" ? (
                <>
                  <Btn variant="subtle" size="sm" onClick={() => setPayloadOpen(true)}>
                    View payload
                  </Btn>
                  {(q.sync?.status === "FAILED" || q.sync?.status === "RETRYING" || q.sync?.status === "SUCCESS" || (status === "ACCEPTED" && !q.sync)) && (
                    <Btn
                      variant="outline"
                      size="sm"
                      icon={RefreshCw}
                      loading={busy === "sync"}
                      disabled={!canOps}
                      title={canOps ? undefined : "Only pricing operations users can retry a sync"}
                      onClick={retry}
                    >
                      {q.sync?.status === "SUCCESS" ? "Resend (same key)" : q.sync ? "Retry now" : "Sync to ERP"}
                    </Btn>
                  )}
                </>
              ) : undefined
            }
          >
            {!q.sync ? (
              <EmptyState icon={RefreshCw} title={status === "ACCEPTED" ? "Not synced yet" : "Nothing to sync yet"}>
                {status === "ACCEPTED" ? "Sync to create the ERP order." : "The ERP order is created automatically when the customer accepts the quote."}
              </EmptyState>
            ) : (
              <>
                {q.sync.lastError && q.sync.status !== "SUCCESS" && (
                  <ErrorBanner
                    error={{ errorClass: q.sync.lastError.errorClass, code: q.sync.lastError.code, message: q.sync.lastError.message, correlationId: q.sync.lastError.correlationId }}
                    note={q.sync.lastError.retryable ? "Transient — retried automatically with back-off." : "Permanent — not retried automatically. Fix the cause, then retry."}
                  />
                )}
                <DetailGrid
                  items={[
                    { label: "Status", value: <StatusPill status={q.sync.status} tone={SYNC_TONE[q.sync.status]} /> },
                    { label: "ERP order reference", value: q.sync.erpOrderRef ? <code>{q.sync.erpOrderRef}</code> : "—" },
                    { label: "Idempotency key", value: <code className="text-sm break-all">{q.sync.idempotencyKey}</code> },
                    { label: "Attempts", value: q.sync.attempts },
                    { label: "Next retry", value: q.sync.nextRetryAt ?? "—" },
                    { label: "Last update", value: q.sync.updatedAt },
                  ]}
                />
                {!canOps && <p className="text-xs text-muted-foreground mt-3">Only pricing operations users can retry. Failures also appear in the integration monitor.</p>}
              </>
            )}
          </Card>
        )}

        {tab === "answers" && (
          <Card title="Guided selling answers" subtitle="Stored on the quote for audit.">
            {q.guidedAnswers ? (
              <DetailGrid items={Object.entries(q.guidedAnswers).map(([k, v]) => ({ label: k === "decision" ? "Recommendation decision" : k === "recommendation" ? "Recommendation" : `Question ${k}`, value: k === "decision" ? humanize(v) : v.split(",").map(humanize).join(", ") }))} />
            ) : (
              <EmptyState icon={FileText} title="No guided selling on this quote">
                The lines were entered directly.
              </EmptyState>
            )}
            {q.guidedFlowId && <p className="text-xs text-muted-foreground mt-3">Flow {q.guidedFlowId}</p>}
          </Card>
        )}
      </div>

      <DocumentModal open={docOpen} q={q} onClose={() => setDocOpen(false)} onGenerated={(next) => (commit(next), setTab("documents"))} by={user.id} />

      <ConfirmDialog
        open={rejectOpen}
        title={`Mark ${q.id} as rejected by the customer?`}
        description="The quote closes. You can still revise it later to re-quote."
        confirmLabel="Mark rejected"
        tone="danger"
        loading={busy === "reject"}
        missing={missingFields([["Reason", rejectReason]])}
        onCancel={() => setRejectOpen(false)}
        onConfirm={reject}
      >
        <Field label="Reason" required error={rejectTried && !rejectReason.trim() ? "Say why the customer rejected the quote." : undefined} className="mt-4">
          <input className={inputCls} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="e.g. Chose a competitor on price" />
        </Field>
      </ConfirmDialog>

      <Drawer open={payloadOpen} onClose={() => setPayloadOpen(false)} title="ERP order payload" subtitle="What the ERP receives. No cost or margin is sent." size="md">
        <pre className="text-sm bg-muted rounded-lg p-4 overflow-x-auto overflow-y-hidden">{JSON.stringify(erpPayload(q), null, 2)}</pre>
      </Drawer>
    </>
  );
}

function Kpi({ label, value }: { label: string; value: ReactNode }) {
  return <KpiTile label={label} value={value} />;
}

/* ---------------- Revision compare (US-CQ-04 AC#2) ---------------- */

function RevisionCompare({ q, revisions }: { q: Quote; revisions: RevisionLike[] }) {
  const [a, setA] = useState(revisions[1]?.revision ?? revisions[0].revision);
  const [b, setB] = useState(revisions[0].revision);
  const ra = revisions.find((r) => r.revision === a)!;
  const rb = revisions.find((r) => r.revision === b)!;
  const diff = useMemo(() => compareRevisions(q, ra, rb), [q, ra, rb]);
  if (revisions.length < 2)
    return (
      <Card title="Revisions">
        <EmptyState icon={GitCompare} title="Only one revision so far">
          Any change after a quote is sent creates a new revision you can compare here.
        </EmptyState>
      </Card>
    );
  const tone = { ADDED: "success", REMOVED: "danger", CHANGED: "warning", UNCHANGED: "neutral" } as const;
  return (
    <Card title="Compare revisions" subtitle="Added, removed and changed lines, plus price and term changes.">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-xl mb-4">
        <Field label="From revision">
          <select className={inputCls} value={a} onChange={(e) => setA(Number(e.target.value))}>
            {revisions.map((r) => (
              <option key={r.revision} value={r.revision}>
                Revision {r.revision}
              </option>
            ))}
          </select>
        </Field>
        <Field label="To revision">
          <select className={inputCls} value={b} onChange={(e) => setB(Number(e.target.value))}>
            {revisions.map((r) => (
              <option key={r.revision} value={r.revision}>
                Revision {r.revision}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <p className="text-sm mb-3" role="status">
        <b>{diff.counts.added}</b> added · <b>{diff.counts.removed}</b> removed · <b>{diff.counts.changed}</b> changed · <b>{diff.terms.length}</b> term {diff.terms.length === 1 ? "change" : "changes"}
      </p>
      <DataTable
        caption={`Line changes from revision ${a} to ${b}`}
        rows={diff.lines}
        rowKey={(l) => l.sku}
        columns={[
          { key: "sku", header: "Product", cell: (l) => <span className="font-medium">{l.sku}</span> },
          { key: "k", header: "Change", cell: (l) => <Tag tone={tone[l.kind]}>{humanize(l.kind)}</Tag> },
          { key: "b", header: `Revision ${a}`, cell: (l) => l.before ?? "—" },
          { key: "a", header: `Revision ${b}`, cell: (l) => l.after ?? "—" },
          { key: "pb", header: "Net before", align: "right", cell: (l) => money(l.priceBefore) },
          { key: "pa", header: "Net after", align: "right", cell: (l) => <b className="tabular-nums">{money(l.priceAfter)}</b> },
        ]}
      />
      {diff.terms.length > 0 && (
        <ul className="mt-4 space-y-1 text-sm">
          {diff.terms.map((t) => (
            <li key={t.field}>
              <b>{t.field}</b>: {t.before} → <span className="bg-warning-soft px-1 rounded">{t.after}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ---------------- Document generation (US-CQ-04 AC#1, #5) ---------------- */

function DocumentModal({ open, q, onClose, onGenerated, by }: { open: boolean; q: Quote; onClose: () => void; onGenerated: (q: Quote) => void; by: string }) {
  const templates = QUOTE_TEMPLATES.filter((t) => t.channels.includes(q.channel));
  const [tplId, setTplId] = useState(templates[0]?.id ?? QUOTE_TEMPLATES[0].id);
  const [kind, setKind] = useState<"PDF" | "ERP_SUMMARY">("PDF");
  const [busy, setBusy] = useState(false);
  const tpl = QUOTE_TEMPLATES.find((t) => t.id === tplId) ?? QUOTE_TEMPLATES[0];
  const p = priceQuote(q);
  const ok = p.results.filter((r): r is PricedLine => r.ok);
  const cust = customerById(q.customerId);
  const generate = () => {
    setBusy(true);
    window.setTimeout(() => {
      const doc = generateDocument(q, kind === "PDF" ? { name: tpl.name, version: tpl.version } : { name: "ERP order summary", version: "v1" }, by, kind);
      onGenerated({ ...q, documents: [doc, ...q.documents] });
      setBusy(false);
      onClose();
      toast.success(`${kind === "PDF" ? "PDF" : "ERP order summary"} generated`, { description: `${doc.id} · revision ${q.revision}` });
    }, 400);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      size="lg"
      title="Generate document"
      subtitle="Preview shows exactly what the customer receives — no cost or margin."
      footer={
        <>
          <Btn variant="subtle" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn variant="outline" icon={Printer} onClick={() => window.print()} disabled={busy}>
            Print
          </Btn>
          <Btn icon={FileDown} loading={busy} onClick={generate}>
            Generate {kind === "PDF" ? "PDF" : "summary"}
          </Btn>
        </>
      }
    >
      <div className="grid sm:grid-cols-2 gap-4 mb-5">
        <Field label="Document type">
          <select className={inputCls} value={kind} onChange={(e) => setKind(e.target.value as "PDF" | "ERP_SUMMARY")}>
            <option value="PDF">Branded PDF quote</option>
            <option value="ERP_SUMMARY">ERP-ready order summary</option>
          </select>
        </Field>
        {kind === "PDF" && (
          <Field label="Template" hint={`Languages: ${tpl.languages.join(", ")}`}>
            <select className={inputCls} value={tplId} onChange={(e) => setTplId(e.target.value)}>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} {t.version}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      <article className="rounded-lg border border-border bg-white text-[#111] p-6 text-sm" aria-label="Document preview">
        <header className="flex flex-wrap justify-between gap-4 border-b border-[#ddd] pb-4 mb-4">
          <div>
            <p className="text-lg font-black tracking-tight">REBATE <span className="text-brand-strong">ninja</span></p>
            <p className="text-xs text-[#555]">AIMDek Technologies · {kind === "PDF" ? tpl.name : "Order summary"}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-semibold text-base">
              Quote {q.id} · rev {q.revision}
            </p>
            <p>Valid until {q.validUntil}</p>
            <p>{q.paymentTerms} · {q.incoterms}</p>
          </div>
        </header>
        <p className="mb-3">
          <b>{cust?.name}</b>
          <br />
          Ship to: {q.shipTo}
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#ddd] text-left">
              <th scope="col" className="py-1.5">Product</th>
              <th scope="col" className="py-1.5 text-right">Qty</th>
              <th scope="col" className="py-1.5 text-right">Unit price</th>
              <th scope="col" className="py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {ok.map((r) => (
              <tr key={r.sku} className="border-b border-[#eee]">
                <td className="py-1.5">
                  {r.sku} · {r.productName}
                </td>
                <td className="py-1.5 text-right tabular-nums">
                  {r.qty.toLocaleString("en-GB")} {r.uom}
                </td>
                <td className="py-1.5 text-right tabular-nums">{money(r.netPrice)}</td>
                <td className="py-1.5 text-right tabular-nums">{money(r.extended)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="py-2 text-right font-semibold">
                Total (GBP, excl. VAT)
              </td>
              <td className="py-2 text-right font-semibold tabular-nums">{money(p.totals.net)}</td>
            </tr>
          </tfoot>
        </table>
        <p className="mt-4 text-xs text-[#555]">Prices exclude VAT and duties. This quote is subject to AIMDek standard terms of sale. Price list {q.priceListVersion}.</p>
      </article>
    </Modal>
  );
}
