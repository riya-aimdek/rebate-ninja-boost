import { createFileRoute } from "@tanstack/react-router";
import { useId, useMemo, useState, type FormEvent } from "react";
import { AlarmClock, CheckCircle2, Clock, Download, Gavel, Lock, Timer, XCircle } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  DataTable,
  DetailGrid,
  Drawer,
  EmptyState,
  ErrorBanner,
  Field,
  FilterPills,
  Flag,
  InfoBanner,
  KpiTile,
  ListHeader,
  MissingHint,
  PricingLayout,
  RecordLink,
  Segmented,
  StatusPill,
  Tag,
  humanize,
  inputCls,
  missingFields,
  money,
  type ApiError,
  type Column,
  type Tone,
} from "@/components/pricing/kit";
import { RequireAccess, Secure, pctBand } from "@/components/pricing/access";
import { customerById } from "@/lib/pricing/data";
import {
  APPLIES_TO,
  APPROVAL_TASKS,
  DELEGATIONS,
  JUSTIFICATIONS,
  SLA_RANK,
  currentStep,
  slaStatus,
  toMs,
  type ApprovalTask,
  type Decision,
  type SlaStatus,
} from "@/lib/pricing/deals";
import { customerSnapshot, decide, decisionHours, dueLabel, eligibility, priorExceptions, taskReference } from "@/lib/pricing/dealdesk";
import { downloadCsv } from "@/lib/pricing/csv";
import { useSession, userById, userName } from "@/lib/pricing/session";

export const Route = createFileRoute("/pricing/approvals")({
  head: () => ({ meta: [{ title: "Approval queue · Rebate Ninja" }] }),
  component: () => (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Deal desk" }, { label: "Approval queue" }]}>
      <RequireAccess module="DEAL_DESK">
        <Page />
      </RequireAccess>
    </PricingLayout>
  ),
});

type View = "MINE" | "PENDING" | "BREACHED" | "DECIDED";
type Sort = "SLA" | "VALUE" | "SUBMITTED";
type Kind = (typeof APPLIES_TO)[number];

const SLA_META: Record<SlaStatus, { label: string; tone: Tone }> = {
  ON_TRACK: { label: "On track", tone: "success" },
  AT_RISK: { label: "At risk", tone: "warning" },
  BREACHED: { label: "Breached", tone: "danger" },
};

const DECISION_LABEL: Record<Decision, string> = { APPROVED: "Approve", REJECTED: "Reject", SENT_BACK: "Send back", ADJUSTED: "Approve adjusted price" };

const due = (t: ApprovalTask) => (t.status === "PENDING" ? currentStep(t)?.dueAt : undefined);
const sla = (t: ApprovalTask): SlaStatus | undefined => (t.status === "PENDING" ? slaStatus(due(t)) : undefined);
const currentApprovers = (t: ApprovalTask) => currentStep(t)?.approvers.filter((a) => a.status === "PENDING").map((a) => a.userId) ?? [];

function Page() {
  const { user, sees, access, can } = useSession();
  const [tick, setTick] = useState(0);
  const [view, setView] = useState<View>("MINE");
  const [search, setSearch] = useState("");
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [slas, setSlas] = useState<SlaStatus[]>([]);
  const [excType, setExcType] = useState("");
  const [sort, setSort] = useState<Sort>("SLA");
  const [openId, setOpenId] = useState<string | null>(null);
  const showMargin = access("marginPct") !== "HIDE";

  // `tick` re-reads the shared task store after a decision.
  const all = useMemo(() => [...APPROVAL_TASKS], [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = (t: ApprovalTask) => eligibility(t, user.id).can;

  const rows = useMemo(() => {
    const base = all.filter((t) => {
      if (view === "MINE" && !mine(t)) return false;
      if (view === "PENDING" && t.status !== "PENDING") return false;
      if (view === "BREACHED" && sla(t) !== "BREACHED") return false;
      if (view === "DECIDED" && t.status === "PENDING") return false;
      if (kinds.length && !kinds.includes(t.requestType)) return false;
      if (slas.length && !(sla(t) && slas.includes(sla(t)!))) return false;
      if (excType && t.exceptionType !== excType) return false;
      if (search && !`${t.id} ${t.refId} ${t.title} ${customerById(t.customerId)?.name ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
    return base.sort((a, b) => {
      if (sort === "VALUE") return b.dealValue - a.dealValue;
      if (sort === "SUBMITTED") return b.submittedAt.localeCompare(a.submittedAt);
      // Default (US-DD-07): SLA risk first, then soonest due, then largest deal.
      const ra = sla(a) ? SLA_RANK[sla(a)!] : 9;
      const rb = sla(b) ? SLA_RANK[sla(b)!] : 9;
      if (ra !== rb) return ra - rb;
      const da = due(a) ? toMs(due(a)!) : Infinity;
      const db = due(b) ? toMs(due(b)!) : Infinity;
      if (da !== db) return da - db;
      return b.dealValue - a.dealValue;
    });
  }, [all, view, kinds, slas, excType, search, sort, user.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const pending = all.filter((t) => t.status === "PENDING");
  const decided = all.filter((t) => t.status !== "PENDING" && t.status !== "WITHDRAWN");
  const times = decided.map(decisionHours).filter((x): x is number => x !== undefined);
  const avgH = times.length ? times.reduce((a, b) => a + b, 0) / times.length : 0;
  const approvedN = decided.filter((t) => t.status === "APPROVED").length;
  const mineCount = all.filter(mine).length;

  const clearFilters = () => {
    setSearch("");
    setKinds([]);
    setSlas([]);
    setExcType("");
  };
  const filtered = !!(search || kinds.length || slas.length || excType);

  const exportCsv = () =>
    downloadCsv(
      "approval-queue.csv",
      rows.map((t) => ({
        id: t.id,
        request: t.refId,
        type: t.requestType,
        customer: customerById(t.customerId)?.name ?? t.customerId,
        dealValue: t.dealValue,
        discountPct: t.discountPct,
        // Exports follow field security too (US-AD-03 AC#4).
        ...(sees("marginPct") ? { marginPct: t.marginPct } : {}),
        exceptionType: t.exceptionType ?? "",
        submittedAt: t.submittedAt,
        slaDue: due(t) ?? "",
        slaStatus: sla(t) ?? "",
        status: t.status,
        currentApprover: currentApprovers(t).map(userName).join("; "),
      })),
    );

  const columns: Column<ApprovalTask>[] = [
    {
      key: "req",
      header: "Request",
      className: "min-w-60",
      cell: (t) => (
        <div>
          {t.requestType === "QUOTE" ? (
            <RecordLink to="/pricing/quotes/$id" params={{ id: t.refId }}>
              {t.refId}
            </RecordLink>
          ) : (
            <span className="font-medium">{t.refId}</span>
          )}
          <span className="ml-2 font-mono text-xs text-muted-foreground">{t.id}</span>
          <div className="text-sm text-muted-foreground mt-0.5 line-clamp-2">{t.title}</div>
        </div>
      ),
    },
    { key: "type", header: "Type", className: "whitespace-nowrap", cell: (t) => humanize(t.requestType) },
    {
      key: "cust",
      header: "Customer",
      className: "min-w-44",
      cell: (t) => (
        <RecordLink to="/pricing/customers/$id" params={{ id: t.customerId }}>
          {customerById(t.customerId)?.name ?? t.customerId}
        </RecordLink>
      ),
    },
    { key: "val", header: "Deal value", align: "right", cell: (t) => <Secure field="dealValue"><span className="tabular-nums">{money(t.dealValue, "GBP", 0)}</span></Secure> },
    { key: "disc", header: "Discount", align: "right", cell: (t) => <span className="tabular-nums">{t.discountPct.toFixed(1)}%</span> },
    ...(showMargin
      ? [{ key: "margin", header: "Margin", align: "right" as const, cell: (t: ApprovalTask) => <Secure field="marginPct" band={pctBand(t.marginPct)}><span className="tabular-nums">{t.marginPct.toFixed(1)}%</span></Secure> }]
      : []),
    { key: "exc", header: "Exception type", cell: (t) => (t.exceptionType ? humanize(t.exceptionType) : <span className="text-muted-foreground">—</span>) },
    { key: "sub", header: "Submitted", cell: (t) => <span className="tabular-nums whitespace-nowrap">{t.submittedAt}</span> },
    {
      key: "due",
      header: "SLA due",
      cell: (t) =>
        due(t) ? (
          <span className="whitespace-nowrap" title={due(t)}>
            <span className="tabular-nums">{dueLabel(due(t))}</span>
            <span className="block text-xs text-muted-foreground tabular-nums">{due(t)}</span>
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
    { key: "sla", header: "SLA status", cell: (t) => (sla(t) ? <Flag tone={SLA_META[sla(t)!].tone}>{SLA_META[sla(t)!].label}</Flag> : <StatusPill status={t.status} />) },
    {
      key: "who",
      header: "Current approver",
      className: "min-w-40",
      cell: (t) =>
        t.status === "PENDING" ? (
          <span>
            {currentApprovers(t).map(userName).join(", ") || "—"}
            <span className="block text-xs text-muted-foreground">
              Level {t.currentLevel} of {t.steps.length}
            </span>
          </span>
        ) : (
          <span className="text-muted-foreground">Closed</span>
        ),
    },
  ];

  const open = all.find((t) => t.id === openId) ?? null;

  return (
    <>
      <ListHeader
        title="Approval queue"
        count={rows.length}
        noun="request"
        subtitle="Pricing requests waiting for a decision, most urgent first."
        search={search}
        onSearch={setSearch}
        actions={
          <Btn variant="outline" icon={Download} onClick={exportCsv} disabled={rows.length === 0}>
            Export CSV
          </Btn>
        }
      />

      {!can("DEAL_DESK", "A") && (
        <InfoBanner title="View only">You can see the queue but not decide requests. Deciding needs Approve access on Deal Desk.</InfoBanner>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        <KpiTile label="Pending" value={pending.length} tone="brand" hint={`${mineCount} waiting for you`} />
        <KpiTile label="At risk" value={pending.filter((t) => sla(t) === "AT_RISK").length} tone="warning" hint="8 hours or less left" />
        <KpiTile label="SLA breached" value={pending.filter((t) => sla(t) === "BREACHED").length} tone="danger" hint="Escalated automatically" />
        <KpiTile label="Average approval time" value={`${avgH.toFixed(1)} h`} tone="default" hint={`Across ${times.length} decided requests`} />
        <KpiTile label="Approval rate" value={decided.length ? `${Math.round((approvedN / decided.length) * 100)}%` : "—"} tone="success" hint={`${approvedN} of ${decided.length} decided`} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { key: "MINE", label: "My tasks", count: mineCount, tone: "brand" },
            { key: "PENDING", label: "All pending", count: pending.length, tone: "info" },
            { key: "BREACHED", label: "Breached", count: pending.filter((t) => sla(t) === "BREACHED").length, tone: "danger" },
            { key: "DECIDED", label: "Decided", count: decided.length, tone: "neutral" },
          ]}
        />
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Exception type" className="w-48">
            <select className={inputCls} value={excType} onChange={(e) => setExcType(e.target.value)}>
              <option value="">All types</option>
              {JUSTIFICATIONS.map((j) => (
                <option key={j} value={j}>
                  {humanize(j)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Sort by" className="w-48">
            <select className={inputCls} value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="SLA">SLA risk, then due time</option>
              <option value="VALUE">Deal value, highest first</option>
              <option value="SUBMITTED">Submitted, newest first</option>
            </select>
          </Field>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-6 empty:hidden">
        <FilterPills<Kind> label="Type" selected={kinds} onChange={setKinds} options={APPLIES_TO.map((k) => ({ key: k, label: humanize(k), count: all.filter((t) => t.requestType === k).length }))} />
        <FilterPills<SlaStatus> label="SLA" selected={slas} onChange={setSlas} options={(["BREACHED", "AT_RISK", "ON_TRACK"] as SlaStatus[]).map((s) => ({ key: s, label: SLA_META[s].label, count: pending.filter((t) => sla(t) === s).length }))} />
      </div>

      <DataTable<ApprovalTask>
        caption="Approval queue"
        rows={rows}
        rowKey={(t) => t.id}
        onRowClick={(t) => setOpenId(t.id)}
        selectedKey={openId}
        pageSize={25}
        columns={columns}
        empty={
          filtered ? (
            <EmptyState icon={Gavel} title={search ? `No requests match “${search}”` : "No requests match these filters"} action={<Btn variant="subtle" onClick={clearFilters}>Clear filters</Btn>}>
              Try a different search term or remove a filter.
            </EmptyState>
          ) : view === "MINE" ? (
            <EmptyState icon={CheckCircle2} title="Nothing waiting for you" action={<Btn variant="subtle" onClick={() => setView("PENDING")}>See all pending</Btn>}>
              Requests assigned to you — or to someone who delegated to you — appear here.
            </EmptyState>
          ) : (
            <EmptyState icon={Gavel} title="No requests in this view" />
          )
        }
      />

      <Metrics tasks={all} />

      <TaskDrawer
        task={open}
        onClose={() => setOpenId(null)}
        onDecided={() => setTick((n) => n + 1)}
      />
    </>
  );
}

/* ---------------- Metrics (US-DD-07) ---------------- */

function Metrics({ tasks }: { tasks: ApprovalTask[] }) {
  const decided = tasks.filter((t) => t.status !== "PENDING" && t.status !== "WITHDRAWN");
  const byApprover = new Map<string, { n: number; approved: number; hours: number[] }>();
  for (const t of tasks)
    for (const s of t.steps)
      for (const a of s.approvers) {
        if (!a.decidedAt || a.status === "SKIPPED") continue;
        const m = byApprover.get(a.userId) ?? { n: 0, approved: 0, hours: [] };
        m.n++;
        if (a.status === "APPROVED") m.approved++;
        m.hours.push((toMs(a.decidedAt) - toMs(t.submittedAt)) / 3_600_000);
        byApprover.set(a.userId, m);
      }
  const byCat = new Map<string, { n: number; approved: number; breached: number }>();
  for (const t of tasks) {
    const k = t.exceptionType ? humanize(t.exceptionType) : `${humanize(t.requestType)} discount`;
    const m = byCat.get(k) ?? { n: 0, approved: 0, breached: 0 };
    m.n++;
    if (t.status === "APPROVED") m.approved++;
    if (t.steps.some((s) => s.approvers.some((a) => a.status === "ESCALATED")) || sla(t) === "BREACHED") m.breached++;
    byCat.set(k, m);
  }
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
      <Card title="Approval rate by approver" padded={false}>
        <div className="overflow-x-auto overflow-y-hidden">
          <table className="w-full text-sm">
            <caption className="sr-only">Approval rate by approver</caption>
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th scope="col" className="px-5 py-2.5 font-medium">Approver</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Decisions</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Approved</th>
                <th scope="col" className="px-5 py-2.5 font-medium text-right">Avg time</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...byApprover.entries()].map(([id, m]) => (
                <tr key={id}>
                  <td className="px-5 py-2.5">{userName(id)} <span className="text-xs text-muted-foreground">· {userById(id)?.title}</span></td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{m.n}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{Math.round((m.approved / m.n) * 100)}%</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{(m.hours.reduce((a, b) => a + b, 0) / m.hours.length).toFixed(1)} h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="By category" subtitle="Volume, approval rate and SLA breaches" padded={false}>
        <div className="overflow-x-auto overflow-y-hidden">
          <table className="w-full text-sm">
            <caption className="sr-only">Requests by category</caption>
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th scope="col" className="px-5 py-2.5 font-medium">Category</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Requests</th>
                <th scope="col" className="px-4 py-2.5 font-medium text-right">Approved</th>
                <th scope="col" className="px-5 py-2.5 font-medium text-right">SLA breaches</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {[...byCat.entries()].map(([k, m]) => (
                <tr key={k}>
                  <td className="px-5 py-2.5">{k}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{m.n}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{m.approved}</td>
                  <td className="px-5 py-2.5 text-right tabular-nums">{m.breached}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

/* ---------------- Drawer: context, steps, decision, trail ---------------- */

function TaskDrawer({ task, onClose, onDecided }: { task: ApprovalTask | null; onClose: () => void; onDecided: () => void }) {
  const { user, sees } = useSession();
  const [decision, setDecision] = useState<Decision>("APPROVED");
  const [comment, setComment] = useState("");
  const [price, setPrice] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [forId, setForId] = useState<string | null>(null);
  const hintId = useId();
  // Comment is required to reject or send back; an adjusted price needs the approved price.
  const missing = missingFields([
    ["Approved price", price, decision === "ADJUSTED"],
    ["Comment", comment, decision === "REJECTED" || decision === "SENT_BACK"],
  ]);
  if (task && forId !== task.id) {
    // Reset the form when a different request opens.
    setForId(task.id);
    setDecision("APPROVED");
    setComment("");
    setPrice("");
    setError(null);
  }
  if (!task) return null;
  const el = eligibility(task, user.id);
  const isRequester = task.requesterId === user.id;
  const ref = taskReference(task);
  const snap = customerSnapshot(task.customerId);
  const prior = priorExceptions(task.customerId, task.requestType === "EXCEPTION" ? task.refId : undefined);
  const dirty = !!(comment || price);
  const delegation = el.can && el.onBehalfOf ? DELEGATIONS.find((d) => d.fromId === el.onBehalfOf && d.toId === user.id) : undefined;

  const submit = (ev?: FormEvent) => {
    ev?.preventDefault();
    setSaving(true);
    window.setTimeout(() => {
      const res = decide({ task, userId: user.id, decision, comment, adjustedPrice: price.trim() ? Number(price) : undefined });
      setSaving(false);
      if ("error" in res) {
        setError(res.error as ApiError);
        if (res.error.field === "comment") document.getElementById("dd-comment")?.focus();
        if (res.error.field === "Adjustment w/o Approved Price" || res.error.field === "approvedPrice") document.getElementById("dd-price")?.focus();
        return;
      }
      toast.success(res.summary, { description: el.onBehalfOf ? `Recorded as decided on behalf of ${userName(el.onBehalfOf)}.` : "The requester has been notified." });
      onDecided();
      onClose();
    }, 450);
  };

  return (
    <Drawer
      open
      onClose={onClose}
      dismissible={!dirty && !saving}
      title={`${task.refId} · ${customerById(task.customerId)?.name ?? task.customerId}`}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span>{task.title}</span>
          <StatusPill status={task.status} />
          {sla(task) && <Flag tone={SLA_META[sla(task)!].tone}>{`${SLA_META[sla(task)!].label} · ${dueLabel(due(task))}`}</Flag>}
        </span>
      }
      footer={
        <>
          {el.can && task.status === "PENDING" && !isRequester && <MissingHint id={hintId} missing={missing} />}
          <Btn variant="subtle" onClick={onClose} disabled={saving}>
            Close
          </Btn>
          {el.can && (
            <Btn
              type="submit"
              form="decision-form"
              loading={saving}
              variant={decision === "REJECTED" ? "danger" : "primary"}
              disabled={missing.length > 0}
              aria-describedby={missing.length ? hintId : undefined}
            >
              {DECISION_LABEL[decision]}
            </Btn>
          )}
        </>
      }
    >
      <section className="bg-card border border-border rounded-xl px-5">
        <DetailGrid
          items={[
            { label: "Requested by", value: userName(task.requesterId) },
            { label: "Submitted", value: <span className="tabular-nums">{task.submittedAt}</span> },
            { label: "Deal value", value: <Secure field="dealValue"><span className="tabular-nums">{money(task.dealValue, "GBP", 0)}</span></Secure> },
            { label: "Discount", value: <span className="tabular-nums">{task.discountPct.toFixed(1)}%</span> },
            ...(sees("marginPct") ? [{ label: "Margin", value: <span className="tabular-nums">{task.marginPct.toFixed(1)}%</span> }] : []),
            { label: "Matched rules", value: task.ruleIds.join(", ") || "—" },
            ...(task.approvedValue ? [{ label: "Approved (adjusted)", value: task.approvedValue }] : []),
          ]}
        />
      </section>

      {/* Context panel (US-DD-07): waterfall, customer profitability, prior exceptions */}
      <section aria-labelledby="ctx-h" className="bg-card border border-border rounded-xl p-5">
        <h3 id="ctx-h" className="text-lg lg:text-xl leading-[1.2] font-semibold mb-3">Deal context</h3>
        {ref && (
          <dl className="text-sm divide-y divide-border">
            <Row label={`List price · ${ref.sku} ${ref.name}`} value={money(ref.listPrice)} />
            <Row label="Requested discount" value={`−${money(ref.listPrice - ref.requestedPrice)}`} />
            <Row label={`Requested price (${ref.qty.toLocaleString("en-GB")} ${ref.uom})`} value={money(ref.requestedPrice)} strong />
            {sees("costPrice") && <Row label="Cost" value={money(ref.cost)} />}
            {sees("marginAmount") && <Row label="Unit margin" value={`${money(ref.requestedPrice - ref.cost)} (${(((ref.requestedPrice - ref.cost) / ref.requestedPrice) * 100).toFixed(1)}%)`} strong />}
          </dl>
        )}
        {!sees("costPrice") && <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1"><Lock className="size-3" aria-hidden /> Cost rows are hidden for your role.</p>}
        {snap && (
          <div className="mt-4 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
            <Stat label="Invoiced (2 quarters)" value={money(snap.revenue, "GBP", 0)} />
            {sees("marginPct") && <Stat label="Pocket margin" value={`${snap.pocketMarginPct.toFixed(1)}%`} />}
            <Stat label="Leakage" value={`${snap.leakagePct.toFixed(1)}%`} />
          </div>
        )}
        <h4 className="text-base leading-[1.2] font-semibold mt-4 mb-2">Prior exceptions for this customer</h4>
        {prior.length ? (
          <ul className="text-sm space-y-1.5">
            {prior.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{e.id}</span>
                <span>{e.sku}</span>
                <span className="text-muted-foreground">{humanize(e.justification)}</span>
                <StatusPill status={e.status} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">None.</p>
        )}
      </section>

      <section aria-labelledby="steps-h" className="bg-card border border-border rounded-xl p-5">
        <h3 id="steps-h" className="text-lg lg:text-xl leading-[1.2] font-semibold mb-3">Approval levels</h3>
        <ol className="space-y-3">
          {task.steps.map((s) => (
            <li key={s.level} aria-current={s.level === task.currentLevel && task.status === "PENDING" ? "step" : undefined} className={`rounded-lg border p-3 ${s.level === task.currentLevel && task.status === "PENDING" ? "border-brand/50 bg-brand-soft/40" : "border-border"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="font-semibold">Level {s.level}</span>
                <span className="text-xs text-muted-foreground">
                  {s.mode === "PARALLEL" ? `Parallel — ${s.parallelRule === "ANY" ? "any one approves" : "all must approve"}` : "Sequential"} · SLA {s.slaHours} h · escalates to {s.escalateTo}
                </span>
              </div>
              <ul className="mt-2 space-y-1.5 text-sm">
                {s.approvers.map((a) => (
                  <li key={a.userId} className="flex flex-wrap items-center gap-2">
                    <span>{userName(a.userId)}</span>
                    <span className="text-xs text-muted-foreground">{userById(a.userId)?.title}</span>
                    <StatusPill status={a.status} />
                    {a.onBehalfOf && <Tag tone="info">for {userName(a.onBehalfOf)}</Tag>}
                    {a.decidedAt && <span className="text-xs text-muted-foreground tabular-nums">{a.decidedAt}</span>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>

      {task.status === "PENDING" && (
        <section aria-labelledby="dec-h" className="bg-card border border-border rounded-xl p-5">
          <h3 id="dec-h" className="text-lg lg:text-xl leading-[1.2] font-semibold mb-3">Your decision</h3>
          {isRequester ? (
            <InfoBanner tone="warning" title="You can't decide your own request" className="">
              Segregation of duties: the requester and approver must be different people.
            </InfoBanner>
          ) : !el.can ? (
            <p className="text-base text-muted-foreground flex items-center gap-2">
              <Clock className="size-4" aria-hidden /> Waiting for {currentApprovers(task).map(userName).join(", ") || "the next approver"}.
            </p>
          ) : (
            <form id="decision-form" onSubmit={submit} noValidate className="space-y-4">
              <ErrorBanner error={error} onClose={() => setError(null)} note="The request was not changed." />
              {delegation && (
                <InfoBanner className="" title={`Deciding on behalf of ${userName(delegation.fromId)}`}>
                  Delegated to you {delegation.from} → {delegation.to}. The trail will show you decided for them.
                </InfoBanner>
              )}
              <fieldset>
                <legend className="text-sm font-medium mb-2">Decision</legend>
                <div className="flex flex-wrap gap-2">
                  {(["APPROVED", "REJECTED", "SENT_BACK", "ADJUSTED"] as Decision[]).map((d) => {
                    const on = decision === d;
                    // Mobile is view-and-decide only: no price adjustments below md (US-DD-04 AC#4).
                    const desktopOnly = d === "ADJUSTED";
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          setDecision(d);
                          setError(null);
                        }}
                        className={`${desktopOnly ? "hidden md:inline-flex" : "inline-flex"} items-center gap-1.5 h-10 px-4 rounded-full border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${on ? "bg-navy text-navy-foreground border-navy" : "bg-card border-border hover:bg-muted"}`}
                      >
                        {d === "APPROVED" ? <CheckCircle2 className="size-4" aria-hidden /> : d === "REJECTED" ? <XCircle className="size-4" aria-hidden /> : d === "SENT_BACK" ? <AlarmClock className="size-4" aria-hidden /> : <Timer className="size-4" aria-hidden />}
                        {d === "ADJUSTED" ? "Adjust price" : DECISION_LABEL[d]}
                      </button>
                    );
                  })}
                </div>
                <p className="md:hidden text-xs text-muted-foreground mt-2">Price adjustments are available on desktop.</p>
              </fieldset>
              {decision === "ADJUSTED" && (
                <Field label={`Approved price (£ / ${ref?.uom ?? "EA"})`} required hint={`Your authority covers discounts up to ${user.approvalAuthorityPct ?? 0}%${ref ? ` — at least ${money(ref.listPrice * (1 - (user.approvalAuthorityPct ?? 0) / 100))}` : ""}.`} error={error?.field === "Adjustment w/o Approved Price" || error?.field === "approvedPrice" ? error.message : undefined} className="hidden md:flex">
                  <input id="dd-price" type="number" inputMode="decimal" min={0} step="0.01" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} placeholder={ref ? `e.g. ${ref.requestedPrice.toFixed(2)}` : "e.g. 30.00"} />
                </Field>
              )}
              <Field label="Comment" required={decision === "REJECTED" || decision === "SENT_BACK"} hint="Kept in the approval trail and sent to the requester." error={error?.field === "comment" ? error.message : undefined}>
                <textarea id="dd-comment" rows={3} className={`${inputCls} h-auto py-2`} value={comment} onChange={(e) => setComment(e.target.value)} />
              </Field>
            </form>
          )}
        </section>
      )}

      <section aria-labelledby="trail-h" className="bg-card border border-border rounded-xl p-5">
        <div className="flex items-center justify-between gap-2 mb-3">
          <h3 id="trail-h" className="text-lg lg:text-xl leading-[1.2] font-semibold">Approval trail</h3>
          <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
            <Lock className="size-3.5" aria-hidden /> Immutable — edits and deletions are denied and logged
          </span>
        </div>
        <ol className="space-y-3 text-sm">
          {task.trail.map((e) => (
            <li key={e.id} className="border-l-2 border-border pl-3">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={e.action === "EDIT_DENIED" ? "BLOCKED" : e.action} label={humanize(e.action)} />
                <span className="font-medium">{e.actorId === "System" ? "System" : userName(e.actorId)}</span>
                {e.onBehalfOf && <span className="text-muted-foreground">on behalf of {userName(e.onBehalfOf)}</span>}
                {e.level && <span className="text-xs text-muted-foreground">level {e.level}</span>}
                <span className="text-xs text-muted-foreground tabular-nums ml-auto">{e.at}</span>
              </div>
              {e.comment && <p className="mt-1">{e.comment}</p>}
              {(e.previousValue || e.newValue) && (
                <p className="mt-1 text-xs text-muted-foreground tabular-nums">
                  {e.previousValue ?? "—"} → {e.newValue ?? "unchanged"}
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>
    </Drawer>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tabular-nums whitespace-nowrap ${strong ? "font-semibold" : ""}`}>{value}</dd>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-muted/50 px-3 py-2">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="font-semibold tabular-nums">{value}</div>
    </div>
  );
}
