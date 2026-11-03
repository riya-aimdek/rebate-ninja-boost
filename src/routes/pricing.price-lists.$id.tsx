import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Copy,
  CornerUpLeft,
  GitCompare,
  PencilLine,
  PlayCircle,
  Plus,
  Send,
  ShieldCheck,
  Undo2,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  DataTable,
  DetailGrid,
  DetailTitle,
  RecordId,
  EmptyState,
  ErrorBanner,
  Field,
  Flag,
  InfoBanner,
  KpiTile,
  LinkBtn,
  Modal,
  PillTabs,
  Price,
  PricingLayout,
  RecordLink,
  StatusPill,
  Tag,
  Toggle,
  humanize,
  inputCls,
  money,
  notifySuccess,
  notifyUndo,
  type ApiError,
  type Column,
} from "@/components/pricing/kit";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AUDIT_LOG,
  LIST_APPROVAL_TRAIL,
  LIST_VERSIONS,
  PRICE_LISTS,
  PRODUCTS,
  REASON_CODES,
  UOMS,
  createDraftVersion,
  duplicatePriceList,
  openDraftOf,
  priceListById,
  savePriceList,
  productBySku,
  type ApprovalEvent,
  type ListStatus,
  type ListVersion,
  type PriceLine,
  type PriceList,
} from "@/lib/pricing/data";

type DetailSearch = { action?: ActionKey; tab?: TabKey };
const SEARCH_ACTIONS = ["SUBMIT", "APPROVE", "SCHEDULE", "CANCEL"] as const;

export const Route = createFileRoute("/pricing/price-lists/$id")({
  // `?action=APPROVE` / `?tab=versions` let list row menus open the right dialog or tab directly.
  validateSearch: (s: Record<string, unknown>): DetailSearch => ({
    action:
      typeof s.action === "string" && (SEARCH_ACTIONS as readonly string[]).includes(s.action)
        ? (s.action as ActionKey)
        : undefined,
    tab: s.tab === "versions" ? "versions" : undefined,
  }),
  head: ({ params }) => ({
    meta: [
      { title: `${priceListById(params.id)?.name ?? "Price list"} · Price lists · Rebate Ninja` },
    ],
  }),
  component: Page,
});

const TODAY = "2026-10-29";
const NOW = "2026-10-29 14:15";
const ME = "Riya Shah";
const MANAGER = "Neel Kamat (Pricing Manager)";

/** Half-up rounding to 2 decimals that survives binary float error (101.365 → 101.37). */
const r2 = (x: number) => Math.round(Number((x * 100).toFixed(6))) / 100;

type TabKey = "details" | "lines" | "derivation" | "approval" | "versions" | "audit";
type ActionKey =
  | "SUBMIT"
  | "APPROVE"
  | "REJECT"
  | "SEND_BACK"
  | "REVOKE"
  | "SCHEDULE"
  | "CANCEL"
  | "ACTIVATE";

/** US-PL-04 transition table. */
const TRANSITIONS: Record<
  ActionKey,
  { from: ListStatus[]; to: ListStatus; comment: boolean; label: string }
> = {
  SUBMIT: { from: ["DRAFT"], to: "SUBMITTED", comment: false, label: "Submit" },
  APPROVE: { from: ["SUBMITTED"], to: "APPROVED", comment: false, label: "Approve" },
  REJECT: { from: ["SUBMITTED"], to: "DRAFT", comment: true, label: "Reject" },
  SEND_BACK: { from: ["SUBMITTED"], to: "DRAFT", comment: true, label: "Send back" },
  REVOKE: { from: ["SUBMITTED"], to: "DRAFT", comment: false, label: "Revoke" },
  SCHEDULE: { from: ["APPROVED"], to: "SCHEDULED", comment: false, label: "Schedule" },
  ACTIVATE: { from: ["SCHEDULED"], to: "ACTIVE", comment: false, label: "Run activation job" },
  CANCEL: {
    from: ["DRAFT", "SUBMITTED", "APPROVED", "SCHEDULED"],
    to: "CANCELLED",
    comment: true,
    label: "Cancel price list",
  },
};

/** The forward action for each status is the single primary button; everything else is secondary. */
const PRIMARY: ActionKey[] = ["SUBMIT", "APPROVE", "SCHEDULE", "ACTIVATE"];
const DESTRUCTIVE: ActionKey[] = ["CANCEL", "REJECT"];
const ACTION_ICON: Partial<Record<ActionKey, typeof Send>> = {
  SUBMIT: Send,
  APPROVE: CheckCircle2,
  SCHEDULE: CalendarClock,
  ACTIVATE: PlayCircle,
  REVOKE: Undo2,
  SEND_BACK: CornerUpLeft,
  CANCEL: XCircle,
  REJECT: XCircle,
};
const actionLabel = (a: ActionKey) =>
  a === "SUBMIT" ? "Submit for approval" : TRANSITIONS[a].label;

/** Plain-language consequence shown in the confirmation for each transition. */
const CONSEQUENCE: Record<ActionKey, (name: string, tz: string, date: string) => string> = {
  SUBMIT: (n) => `“${n}” will be locked and sent to the Pricing Manager for approval.`,
  APPROVE: (n) => `“${n}” will be approved and can then be scheduled to go live.`,
  REJECT: (n) => `“${n}” returns to Draft and the submitter is told why.`,
  SEND_BACK: (n) => `“${n}” returns to Draft so the submitter can make changes.`,
  REVOKE: (n) => `“${n}” returns to Draft and the pending approval task is cancelled.`,
  SCHEDULE: (n, tz, d) =>
    `“${n}” will become Active on ${d || "the chosen date"} at 00:00 (${tz}). The current list for this scope becomes Superseded.`,
  ACTIVATE: (n) =>
    `“${n}” goes live now and starts pricing quotes. The previous active list for this scope becomes Superseded.`,
  CANCEL: (n) =>
    `Cancelling “${n}” is permanent — it can never become active. Create a new list if you need it later.`,
};

function chainOf(list: PriceList): PriceList[] {
  const up: PriceList[] = [];
  let cur: PriceList | undefined = list;
  while (cur) {
    up.unshift(cur);
    cur = cur.parentId ? priceListById(cur.parentId) : undefined;
  }
  // descendants (one branch each level, for display)
  let kids = PRICE_LISTS.filter((l) => l.parentId === list.id);
  while (kids.length) {
    up.push(kids[0]);
    kids = PRICE_LISTS.filter((l) => l.parentId === kids[0].id);
  }
  return up;
}

const factor = (l: PriceList) =>
  l.adjustmentType === "PERCENT" ? 1 + (l.adjustmentValue ?? 0) / 100 : 1;

function Page() {
  const { id } = Route.useParams();
  const source = priceListById(id);
  if (!source) {
    return (
      <PricingLayout
        crumbs={[
          { label: "Pricing", to: "/pricing" },
          { label: "Price lists", to: "/pricing/price-lists" },
          { label: id },
        ]}
      >
        <EmptyState
          title={`Price list "${id}" not found`}
          action={
            <LinkBtn to="/pricing/price-lists" variant="outline" icon={ArrowLeft}>
              Back to price lists
            </LinkBtn>
          }
        >
          It may have been removed or you may not have access.
        </EmptyState>
      </PricingLayout>
    );
  }
  return <Detail key={id} source={source} />;
}

function Detail({ source }: { source: PriceList }) {
  const navigate = useNavigate();
  const [list, setList] = useState<PriceList>(() => ({
    ...source,
    lines: source.lines.map((l) => ({ ...l })),
  }));
  // Keep the mock store in step so the list page and the related version see this session's changes.
  useEffect(() => savePriceList(list), [list]);
  const draftOf = list.draftOf ? priceListById(list.draftOf) : undefined;
  const openDraft = list.status === "ACTIVE" ? openDraftOf(list.id) : undefined;
  // The list and its draft versions share one family (drafts point at the list via draftOf).
  const familyId = list.draftOf ?? list.id;
  const listVersions = PRICE_LISTS.filter((l) => l.id === familyId || l.draftOf === familyId).map((l) => (l.id === list.id ? list : l));
  const search = Route.useSearch();
  const [tab, setTab] = useState<TabKey>(search.tab ?? "details");
  const [error, setError] = useState<ApiError | null>(null);
  const [actor, setActor] = useState<string>(ME);
  const [events, setEvents] = useState<ApprovalEvent[]>(
    () =>
      LIST_APPROVAL_TRAIL[source.id] ?? lifecycleTrail(source),
  );
  const [taskState, setTaskState] = useState<"PENDING" | "COMPLETED" | "CANCELLED" | null>(
    source.status === "SUBMITTED" ? "PENDING" : null,
  );
  const [actionModal, setActionModal] = useState<ActionKey | null>(null);
  const [comment, setComment] = useState("");
  const [scheduleAt, setScheduleAt] = useState(source.effectiveFrom);
  const [staleDemo, setStaleDemo] = useState(false);
  const [actionErr, setActionErr] = useState<{ comment?: string; schedule?: string }>({});
  const [busy, setBusy] = useState(false);

  const locked = !["DRAFT"].includes(list.status);
  const derived = !!list.parentId;
  const hasChildren = PRICE_LISTS.some((l) => l.parentId === list.id);
  const invalidLines = list.lines.filter((l) => l.price === null && !l.allowZeroPrice);
  const userLabel = actor === ME ? `${ME} (Pricing Analyst)` : MANAGER;

  const openAction = (a: ActionKey) => {
    setError(null);
    setComment("");
    setStaleDemo(false);
    setActionErr({});
    // A draft version inherits a past start date; default its activation to today or later.
    setScheduleAt(list.effectiveFrom < TODAY ? TODAY : list.effectiveFrom);
    if (a === "APPROVE" && list.submittedBy === actor) {
      setError({
        errorClass: "AUTHORIZATION",
        code: "SEGREGATION_OF_DUTIES",
        message: `You submitted this price list, so you cannot approve it. Approval must be by someone other than the submitter.`,
      });
      return;
    }
    if (a === "SUBMIT" && invalidLines.length) {
      setError({
        errorClass: "VALIDATION",
        code: "VALIDATION_REQUIRED",
        message: `${invalidLines.length} line(s) have no price. Add a price (or allow zero price) on the highlighted lines, then submit again.`,
        field: "lines.price",
      });
      setTab("lines");
      return;
    }
    setActionModal(a);
  };

  const confirmAction = () => {
    if (!actionModal) return;
    const t = TRANSITIONS[actionModal];
    const errs: { comment?: string; schedule?: string } = {};
    if (t.comment && !comment.trim())
      errs.comment = `Enter a comment explaining why — it is recorded in the audit trail.`;
    if (actionModal === "SCHEDULE" && !scheduleAt) errs.schedule = "Choose the activation date.";
    else if (actionModal === "SCHEDULE" && scheduleAt < TODAY)
      errs.schedule = `Activation date can't be in the past (SCHEDULE_IN_PAST). Choose ${TODAY} or later.`;
    setActionErr(errs);
    if (errs.schedule || errs.comment) {
      document.getElementById(errs.schedule ? "action-schedule" : "action-comment")?.focus();
      return;
    }
    if (actionModal === "SUBMIT" && staleDemo) {
      setError({
        errorClass: "CONFLICT",
        code: "CONFLICT_STALE_VERSION",
        message: `You read version ${list.version}, but another user has saved version ${list.version + 1}. Reload and re-apply your changes.`,
      });
      setActionModal(null);
      return;
    }
    setBusy(true);
    setTimeout(() => {
      setBusy(false);
      applyAction(actionModal);
    }, 500);
  };

  const applyAction = (actionModal: ActionKey) => {
    const t = TRANSITIONS[actionModal];
    const from = list.status;
    setList((l) => ({
      ...l,
      status: t.to,
      submittedBy: actionModal === "SUBMIT" ? actor : l.submittedBy,
      effectiveFrom: actionModal === "SCHEDULE" ? scheduleAt : l.effectiveFrom,
      lastUpdated: NOW,
    }));
    setEvents((e) => [
      ...e,
      {
        at: NOW,
        actor: actionModal === "ACTIVATE" ? "System · Activation job" : userLabel,
        action: actionModal,
        from,
        to: t.to,
        comment: comment || undefined,
      },
    ]);
    // A draft version going live supersedes the version it was opened from (US-PL-04 AC#3).
    if (actionModal === "ACTIVATE" && draftOf && draftOf.status === "ACTIVE")
      savePriceList({ ...draftOf, status: "SUPERSEDED", lastUpdated: NOW });
    if (actionModal === "SUBMIT") setTaskState("PENDING");
    if (actionModal === "APPROVE") setTaskState("COMPLETED");
    if (
      actionModal === "REVOKE" ||
      actionModal === "CANCEL" ||
      actionModal === "REJECT" ||
      actionModal === "SEND_BACK"
    )
      setTaskState((s) => (s === "PENDING" ? "CANCELLED" : s));
    setActionModal(null);
    setError(null);
    const msg: Record<ActionKey, string> = {
      SUBMIT: "Submitted. The Pricing Manager received an approval task.",
      APPROVE: "Approved. Schedule it to activate on the effective date.",
      REJECT: "Rejected and returned to Draft.",
      SEND_BACK: "Sent back to Draft for changes.",
      REVOKE: "Revoked. List returned to Draft and the approval task was cancelled.",
      SCHEDULE: `Scheduled. Becomes Active on ${scheduleAt} (${list.timeZone}); the previous list becomes Superseded.`,
      ACTIVATE: draftOf
        ? `Activation job ran. v${list.version} is Active; v${draftOf.version} is now Superseded.`
        : "Activation job ran. List is Active; the previous list is now Superseded.",
      CANCEL: "Price list cancelled.",
    };
    toast.success(msg[actionModal]);
  };

  // Deep link from the list row menu: open the requested transition once, then drop it from the URL
  // so Back/refresh don't reopen the dialog.
  useEffect(() => {
    const a = search.action;
    if (!a) return;
    if (TRANSITIONS[a].from.includes(list.status)) openAction(a);
    navigate({
      to: "/pricing/price-lists/$id",
      params: { id: list.id },
      search: {},
      replace: true,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.action]);

  // Secondary actions first, the single forward (primary) action right-most.
  const available = (Object.keys(TRANSITIONS) as ActionKey[])
    .filter(
      (a) =>
        TRANSITIONS[a].from.includes(list.status) && (a !== "REVOKE" || list.submittedBy === actor),
    )
    .sort((a, b) => Number(PRIMARY.includes(a)) - Number(PRIMARY.includes(b)));

  // Header shows at most: [Edit draft] · one secondary · Duplicate or More ▾ · primary. The rest sits in More (progressive disclosure).
  const primary = available.find((a) => PRIMARY.includes(a));
  const secondary = available.filter((a) => !PRIMARY.includes(a));
  const inline = secondary.length <= 1 ? secondary : secondary.filter((a) => a === "REJECT");
  const overflow = secondary.filter((a) => !inline.includes(a));
  const duplicate = () => {
    const copy = duplicatePriceList(list, ME, NOW);
    notifySuccess(`${list.name} duplicated`, `Created ${copy.id} as draft v1.`);
    navigate({ to: "/pricing/price-lists/$id", params: { id: copy.id } });
  };

  const tabs: Array<{ key: TabKey; label: string; count?: number }> = [
    { key: "details", label: "Details" },
    { key: "lines", label: "Lines", count: list.lines.length },
    ...(derived || hasChildren
      ? [{ key: "derivation" as const, label: "Derivation & overrides" }]
      : []),
    { key: "approval", label: "Approval", count: events.length },
    { key: "versions", label: "Version history" },
    { key: "audit", label: "Audit" },
  ];

  return (
    <PricingLayout
      crumbs={[
        { label: "Pricing", to: "/pricing" },
        { label: "Price lists", to: "/pricing/price-lists" },
        { label: list.name },
      ]}
    >
      <DetailTitle
        title={list.name}
        status={list.status}
        meta={[
          <RecordId key="id">{list.id}</RecordId>,
          listVersions.length > 1 ? null : `v${list.version}`,
          `Owner ${list.owner}`,
          `Updated ${list.lastUpdated}`,
        ]}
        attributes={[
          { label: "Type", value: humanize(list.type) },
          { label: "Currency", value: list.currency },
          { label: "Region", value: list.region },
          { label: "Channel", value: list.channel },
          { label: "Segment", value: list.segment },
        ]}
        versions={listVersions.map((v) => ({
          key: v.id,
          version: v.version,
          status: v.status,
          to: "/pricing/price-lists/$id",
          params: { id: v.id },
          current: v.id === list.id,
        }))}
        actions={
          <>
            {list.status === "ACTIVE" && (
              <Btn
                variant="outline"
                icon={PencilLine}
                onClick={() => {
                  const draft = createDraftVersion(list, ME, NOW);
                  notifySuccess(
                    openDraft
                      ? `Opening draft v${draft.version}`
                      : `Draft v${draft.version} created`,
                    `Active v${list.version} continues to price quotes until v${draft.version} is approved and active.`,
                  );
                  navigate({ to: "/pricing/price-lists/$id", params: { id: draft.id } });
                }}
              >
                {openDraft ? `Open draft v${openDraft.version}` : "Edit draft"}
              </Btn>
            )}
            {inline.map((a) => (
              <Btn key={a} variant="subtle" icon={ACTION_ICON[a]} onClick={() => openAction(a)}>
                {actionLabel(a)}
              </Btn>
            ))}
            {overflow.length > 0 ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Btn variant="subtle">
                    More
                    <ChevronDown className="size-4" aria-hidden />
                  </Btn>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-52">
                  <DropdownMenuItem className="min-h-10" onSelect={duplicate}>
                    <Copy className="size-4" aria-hidden /> Duplicate
                  </DropdownMenuItem>
                  {overflow.map((a) => {
                    const Icon = ACTION_ICON[a];
                    return (
                      <DropdownMenuItem
                        key={a}
                        className={`min-h-10 ${DESTRUCTIVE.includes(a) ? "text-destructive focus:text-destructive" : ""}`}
                        onSelect={() => openAction(a)}
                      >
                        {Icon && <Icon className="size-4" aria-hidden />}
                        {actionLabel(a)}
                      </DropdownMenuItem>
                    );
                  })}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <Btn variant="subtle" icon={Copy} onClick={duplicate}>
                Duplicate
              </Btn>
            )}
            {primary && (
              <Btn icon={ACTION_ICON[primary]} onClick={() => openAction(primary)}>
                {actionLabel(primary)}
              </Btn>
            )}
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-4 text-sm">
        <label htmlFor="acting-as" className="font-medium text-foreground">
          Acting as (demo)
        </label>
        <select
          id="acting-as"
          className={`${inputCls} sm:!w-72`}
          value={actor}
          onChange={(e) => setActor(e.target.value)}
        >
          <option value={ME}>{ME} — Pricing Analyst</option>
          <option value="Neel Kamat">Neel Kamat — Pricing Manager</option>
        </select>
      </div>

      <ErrorBanner error={error} onClose={() => setError(null)} />
      {locked && list.status !== "CANCELLED" && (
        <InfoBanner tone="neutral" title="Read-only">
          This list is {humanize(list.status)}. Submitted or later lists cannot be edited — changes
          require a new draft version.
        </InfoBanner>
      )}
      {openDraft && (
        <InfoBanner tone="brand" title={`Draft v${openDraft.version} in progress`}>
          Edits happen in{" "}
          <RecordLink to="/pricing/price-lists/$id" params={{ id: openDraft.id }}>
            draft v{openDraft.version}
          </RecordLink>{" "}
          ({humanize(openDraft.status)}). Active v{list.version} stays read-only and continues to
          price quotes until v{openDraft.version} is approved and active.
        </InfoBanner>
      )}
      {draftOf && list.status !== "ACTIVE" && list.status !== "CANCELLED" && (
        <InfoBanner tone="brand" title={`Draft version v${list.version}`}>
          Opened from{" "}
          <RecordLink to="/pricing/price-lists/$id" params={{ id: draftOf.id }}>
            {draftOf.name} v{draftOf.version}
          </RecordLink>
          , which is {humanize(draftOf.status)}
          {draftOf.status === "ACTIVE" ? " and keeps pricing quotes" : ""} until this version is
          approved and active. It then becomes Superseded.
        </InfoBanner>
      )}

      <PillTabs tabs={tabs} active={tab} onChange={setTab} idPrefix="pl" />

      {/* One tabpanel wraps whichever tab is showing, so screen readers hear which tab owns the content. */}
      <div role="tabpanel" id={`pl-panel-${tab}`} aria-labelledby={`pl-tab-${tab}`}>
        {tab === "details" && <DetailsTab list={list} />}
        {tab === "lines" && <LinesTab list={list} setList={setList} />}
        {tab === "derivation" && <DerivationTab list={list} setList={setList} />}
        {tab === "approval" && <ApprovalTab list={list} events={events} taskState={taskState} />}
        {tab === "versions" && <VersionsTab list={list} />}
        {tab === "audit" && <AuditTab list={list} />}
      </div>

      <Modal
        open={!!actionModal}
        title={
          actionModal
            ? `${actionModal === "CANCEL" ? "Cancel" : TRANSITIONS[actionModal].label} “${list.name}”?`
            : ""
        }
        subtitle={
          actionModal
            ? `Status: ${humanize(list.status)} → ${humanize(TRANSITIONS[actionModal].to)}`
            : ""
        }
        onClose={() => setActionModal(null)}
        dismissible={!busy && !comment.trim()}
        footer={
          <>
            <Btn
              variant="subtle"
              onClick={() => setActionModal(null)}
              disabled={busy}
              data-autofocus={
                actionModal &&
                DESTRUCTIVE.includes(actionModal) &&
                !TRANSITIONS[actionModal].comment
                  ? true
                  : undefined
              }
            >
              {actionModal === "CANCEL" ? "Keep price list" : "Cancel"}
            </Btn>
            <Btn
              type="submit"
              form="transition-form"
              variant={actionModal && DESTRUCTIVE.includes(actionModal) ? "danger" : "primary"}
              loading={busy}
            >
              {actionModal
                ? actionModal === "SUBMIT"
                  ? "Submit for approval"
                  : TRANSITIONS[actionModal].label
                : ""}
            </Btn>
          </>
        }
      >
        <form
          id="transition-form"
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            confirmAction();
          }}
        >
          {actionModal && (
            <p
              className={`text-sm ${DESTRUCTIVE.includes(actionModal) ? "font-semibold text-destructive" : ""}`}
            >
              {CONSEQUENCE[actionModal](list.name, list.timeZone, scheduleAt)}
            </p>
          )}
          {actionModal === "SUBMIT" && (
            <>
              <p className="text-sm">
                Pre-submit check passed: every line has a price (or allows a zero price).
              </p>
              <Field label="Expected version" hint="Optimistic concurrency check">
                <input className={`${inputCls} bg-muted`} value={`v${list.version}`} readOnly />
              </Field>
              <Toggle
                checked={staleDemo}
                onChange={setStaleDemo}
                label={`Demo: another user saved v${list.version + 1} meanwhile`}
              />
            </>
          )}
          {actionModal === "SCHEDULE" && (
            <Field
              label="Activation date"
              required
              error={actionErr.schedule}
              hint={`Activation job runs at 00:00 in ${list.timeZone}`}
            >
              <input
                id="action-schedule"
                type="date"
                min={TODAY}
                className={inputCls}
                value={scheduleAt}
                onChange={(e) => {
                  setScheduleAt(e.target.value);
                  setActionErr((x) => ({ ...x, schedule: undefined }));
                }}
              />
            </Field>
          )}
          {actionModal === "APPROVE" && (
            <p className="text-sm">
              Approving as {userLabel}. Submitted by {list.submittedBy ?? list.owner}.
            </p>
          )}
          {actionModal === "ACTIVATE" && (
            <p className="text-sm text-muted-foreground">
              Simulates the scheduled activation job; an audit event is written.
            </p>
          )}
          {actionModal && (TRANSITIONS[actionModal].comment || actionModal === "APPROVE") && (
            <Field
              label="Comment"
              required={TRANSITIONS[actionModal].comment}
              error={actionErr.comment}
              hint={
                TRANSITIONS[actionModal].comment
                  ? "Explain why — the submitter sees this"
                  : "Optional"
              }
            >
              <textarea
                id="action-comment"
                className={`${inputCls} h-24 py-2`}
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value);
                  setActionErr((x) => ({ ...x, comment: undefined }));
                }}
              />
            </Field>
          )}
        </form>
      </Modal>
    </PricingLayout>
  );
}

/* ---------------- Details ---------------- */

function DetailsTab({ list }: { list: PriceList }) {
  const parent = list.parentId ? priceListById(list.parentId) : undefined;
  return (
    <Card title="Price list details">
      <DetailGrid
        items={[
          { label: "Name", value: list.name },
          { label: "Price list ID", value: list.id },
          { label: "List type", value: humanize(list.type) },
          { label: "Status", value: <StatusPill status={list.status} /> },
          { label: "Version", value: `v${list.version}` },
          { label: "Currency", value: list.currency },
          { label: "Effective from", value: list.effectiveFrom },
          { label: "Effective to", value: list.openEnded ? "Open-ended" : list.effectiveTo },
          { label: "Region", value: list.region },
          { label: "Channel", value: list.channel },
          { label: "Customer segment", value: list.segment },
          { label: "Unit of measure", value: list.uom },
          { label: "Time zone", value: list.timeZone },
          { label: "Rounding rule", value: list.rounding.replace(/\b[A-Z_]{3,}\b/g, (m) => humanize(m).toLowerCase()) },
          {
            label: "Parent list",
            value: parent ? (
              <RecordLink to="/pricing/price-lists/$id" params={{ id: parent.id }}>
                {parent.id} · {parent.name}
              </RecordLink>
            ) : (
              "None (independent)"
            ),
          },
          {
            label: "Adjustment",
            value: list.adjustmentType
              ? list.adjustmentType === "NONE"
                ? "None — same prices as the parent"
                : list.adjustmentType === "PERCENT"
                  ? `${(list.adjustmentValue ?? 0) > 0 ? "+" : ""}${list.adjustmentValue ?? 0}% on the parent price`
                  : list.adjustmentType === "ABSOLUTE"
                    ? `${(list.adjustmentValue ?? 0) > 0 ? "+" : ""}${money(list.adjustmentValue ?? 0, list.currency)} on the parent price`
                    : humanize(list.adjustmentType)
              : "—",
          },
          {
            label: "Inheritance mode",
            value: list.inheritanceMode ? humanize(list.inheritanceMode) : "—",
          },
          { label: "Lines", value: list.lines.length },
          { label: "Owner", value: list.owner },
          { label: "Last updated", value: list.lastUpdated },
        ]}
      />
    </Card>
  );
}

/* ---------------- Lines ---------------- */

const overrideExpired = (l: PriceLine) => !!l.overrideExpires && l.overrideExpires < TODAY;
const finalPrice = (l: PriceLine) =>
  l.overridePrice !== undefined && !overrideExpired(l)
    ? l.overridePrice
    : (l.calculatedPrice ?? l.price);

function LinesTab({
  list,
  setList,
}: {
  list: PriceList;
  setList: React.Dispatch<React.SetStateAction<PriceList>>;
}) {
  const derived = !!list.parentId;
  const editable = list.status === "DRAFT" && !derived;
  const [overrideFor, setOverrideFor] = useState<PriceLine | null>(null);
  const [priceFor, setPriceFor] = useState<PriceLine | null>(null);
  const [lineErr, setLineErr] = useState<Record<string, string>>({});
  const [validating, setValidating] = useState(false);
  const [adding, setAdding] = useState(false);

  /** US-PL-01 AC#2/#5 + US-MD-01 AC#9 checks, run on demand. */
  const validate = () => {
    setValidating(true);
    setTimeout(() => {
      const errs: Record<string, string> = {};
      const seen = new Set<string>();
      for (const l of list.lines) {
        const k = `${l.sku}|${l.uom}|${l.minQty}`;
        if (productBySku(l.sku)?.lifecycleStatus === "BLOCKED")
          errs[l.id] = "PRODUCT_BLOCKED — product is blocked; remove this line";
        else if (seen.has(k))
          errs[l.id] = "DUPLICATE_LINE — same product, UoM and min qty as another line";
        else if (l.price === null && !l.allowZeroPrice)
          errs[l.id] = "Missing price — select Edit price to add one";
        seen.add(k);
      }
      setLineErr(errs);
      setValidating(false);
      const n = Object.keys(errs).length;
      if (n)
        toast.error(`${n} invalid ${n === 1 ? "line" : "lines"} highlighted`, {
          description: "The list can't be submitted until they are corrected.",
        });
      else notifySuccess("All lines valid", "The list can be submitted for approval.");
    }, 400);
  };

  const editCol: Column<PriceLine> = {
    key: "edit",
    header: <span className="sr-only">Actions</span>,
    align: "right",
    className: "whitespace-nowrap",
    cell: (l) => (
      <Btn
        size="sm"
        variant="subtle"
        icon={PencilLine}
        onClick={() => setPriceFor(l)}
        aria-label={`Edit price for ${productBySku(l.sku)?.name ?? l.sku}`}
      >
        Edit price
      </Btn>
    ),
  };

  const plain: Column<PriceLine>[] = [
    {
      key: "sku",
      header: "Product",
      cell: (l) => (
        <div>
          <ProductCell sku={l.sku} />
          {lineErr[l.id] && <div className="mt-1 text-xs text-destructive">{lineErr[l.id]}</div>}
        </div>
      ),
    },
    {
      key: "price",
      header: "Price",
      align: "right",
      cell: (l) =>
        l.price === null ? (
          <Flag tone="danger">Missing price</Flag>
        ) : (
          <Price value={l.price} currency={list.currency} uom={l.uom} />
        ),
    },
    { key: "uom", header: "UoM", cell: (l) => l.uom },
    {
      key: "qty",
      header: "Min / max qty",
      align: "right",
      cell: (l) => (
        <span className="tabular-nums">
          {l.minQty} / {l.maxQty ?? "—"}
        </span>
      ),
    },
    {
      key: "eff",
      header: "Effective",
      cell: (l) => (
        <span className="whitespace-nowrap">
          {l.effectiveFrom} – {l.effectiveTo ?? "list end"}
        </span>
      ),
    },
    {
      key: "zero",
      header: "Allow zero",
      align: "center",
      cell: (l) => (l.allowZeroPrice ? "Yes" : "No"),
    },
  ];

  const derivedCols: Column<PriceLine>[] = [
    { key: "sku", header: "Product", cell: (l) => <ProductCell sku={l.sku} /> },
    {
      key: "calc",
      header: "Calculated",
      align: "right",
      cell: (l) => <Price value={l.calculatedPrice} currency={list.currency} uom={l.uom} />,
    },
    {
      key: "ovr",
      header: "Override",
      align: "right",
      cell: (l) =>
        l.overridePrice !== undefined ? (
          <span
            className={
              overrideExpired(l) ? "line-through text-muted-foreground" : "font-semibold text-brand"
            }
          >
            {money(l.overridePrice, list.currency)}
          </span>
        ) : (
          "—"
        ),
    },
    {
      key: "final",
      header: "Final",
      align: "right",
      cell: (l) => (
        <span className="font-semibold">
          <Price value={finalPrice(l)} currency={list.currency} uom={l.uom} />
        </span>
      ),
    },
    {
      key: "flag",
      header: "Override status",
      cell: (l) =>
        l.overridePrice === undefined ? (
          <span className="text-muted-foreground text-xs">Inherited</span>
        ) : overrideExpired(l) ? (
          <div className="space-y-1">
            <StatusPill status="EXPIRED" />
            <div className="text-xs text-muted-foreground">
              Expired {l.overrideExpires} — final = calculated
            </div>
          </div>
        ) : (
          <div className="space-y-1">
            <Flag tone="brand">Override · {humanize(l.overrideReason ?? "")}</Flag>
            <div className="text-xs text-muted-foreground">
              Expires {l.overrideExpires ?? "never"}
            </div>
          </div>
        ),
    },
    {
      key: "chain",
      header: "Derivation chain",
      cell: (l) => (
        <code className="text-xs bg-muted px-1.5 py-0.5 rounded whitespace-nowrap">
          {l.derivationChain ?? "—"}
        </code>
      ),
    },
    {
      key: "act",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      className: "whitespace-nowrap",
      cell: (l) => (
        <Btn
          size="sm"
          variant="subtle"
          onClick={() => setOverrideFor(l)}
          aria-label={`${l.overridePrice !== undefined ? "Edit override" : "Override"} for ${productBySku(l.sku)?.name ?? l.sku}`}
        >
          {l.overridePrice !== undefined ? "Edit override" : "Override"}
        </Btn>
      ),
    },
  ];

  const missing = list.lines.filter((l) => l.price === null && !l.allowZeroPrice).length;
  return (
    <>
      {missing > 0 && (
        <InfoBanner tone="danger" title={`${missing} invalid ${missing === 1 ? "line" : "lines"}`}>
          Lines with a missing price are highlighted. The list cannot be submitted until they are
          corrected{editable ? " — select Edit price on each one." : "."}
        </InfoBanner>
      )}
      {list.status === "DRAFT" && (
        <div className="flex flex-wrap justify-end gap-2 mb-3">
          {editable && (
            <Btn variant="outline" icon={Plus} onClick={() => setAdding(true)}>
              Add product line
            </Btn>
          )}
          <Btn variant="outline" icon={ShieldCheck} loading={validating} onClick={validate}>
            Validate lines
          </Btn>
        </div>
      )}
      <DataTable
        caption={`Lines on ${list.name}`}
        // Overrides and price edits only on drafts — submitted or later lists are locked.
        columns={derived ? derivedCols.filter((c) => c.key !== "act" || list.status === "DRAFT") : editable ? [...plain, editCol] : plain}
        rows={list.lines}
        rowKey={(l) => l.id}
        rowClassName={(l) =>
          (l.price === null && !l.allowZeroPrice) || lineErr[l.id] ? "!bg-danger-soft" : ""
        }
        empty={editable ? "No product lines yet — select Add product line." : "No product lines yet."}
      />
      <AddLineModal
        open={adding}
        list={list}
        onClose={() => setAdding(false)}
        onAdd={(line) => {
          setList((cur) => ({ ...cur, lastUpdated: NOW, lines: [...cur.lines, line] }));
          AUDIT_LOG.unshift({
            id: `AU-${78000 + AUDIT_LOG.length}`,
            at: NOW,
            actor: ME,
            entity: "Price List",
            record: `${list.name} · ${line.sku}`,
            action: "LINE_ADDED",
            field: "price",
            before: "—",
            after: line.price === null ? "—" : line.price.toFixed(2),
            version: `v${list.version}`,
            correlationId: `c-${Math.random().toString(16).slice(2, 8)}`,
          });
          setAdding(false);
          notifySuccess(`${productBySku(line.sku)?.name ?? line.sku} added`, "Saved on the draft. Validate before submitting.");
        }}
      />
      <PriceEditModal
        line={priceFor}
        list={list}
        onClose={() => setPriceFor(null)}
        onSave={(price, reasonCode, reasonText) => {
          const line = priceFor;
          if (!line) return;
          setList((cur) => ({
            ...cur,
            lastUpdated: NOW,
            lines: cur.lines.map((x) => (x.id === line.id ? { ...x, price } : x)),
          }));
          // US-PL-05 AC#1/#5: user, timestamp, before, after, reason code, list version.
          AUDIT_LOG.unshift({
            id: `AU-${78000 + AUDIT_LOG.length}`,
            at: NOW,
            actor: ME,
            entity: "Price List",
            record: `${list.name} · ${line.sku}`,
            action: "PRICE_CHANGE",
            field: "price",
            before: line.price === null ? "—" : line.price.toFixed(2),
            after: price.toFixed(2),
            reasonCode,
            reasonText: reasonText || undefined,
            version: `v${list.version}`,
            correlationId: `c-${Math.random().toString(16).slice(2, 8)}`,
          });
          setLineErr((e) => {
            const next = { ...e };
            delete next[line.id];
            return next;
          });
          setPriceFor(null);
          notifySuccess("Price saved", `${humanize(reasonCode)} recorded in the audit trail.`);
        }}
      />
      <OverrideModal
        line={overrideFor}
        list={list}
        onClose={() => setOverrideFor(null)}
        onSave={(patch) => {
          const line = overrideFor;
          if (!line) return;
          setList((cur) => ({
            ...cur,
            lastUpdated: NOW,
            lines: cur.lines.map((x) => (x.id === line.id ? { ...x, ...patch } : x)),
          }));
          // US-PL-05: overrides are price changes too, so they land in the audit trail.
          AUDIT_LOG.unshift({
            id: `AU-${78000 + AUDIT_LOG.length}`,
            at: NOW,
            actor: ME,
            entity: "Price List",
            record: `${list.name} · ${line.sku}`,
            action: "OVERRIDE_SET",
            field: "overridePrice",
            before: line.overridePrice === undefined ? "—" : line.overridePrice.toFixed(2),
            after: patch.overridePrice === undefined ? "—" : patch.overridePrice.toFixed(2),
            reasonCode: patch.overrideReason,
            reasonText: patch.overrideReasonText,
            version: `v${list.version}`,
            correlationId: `c-${Math.random().toString(16).slice(2, 8)}`,
          });
          setOverrideFor(null);
        }}
        onRemove={() => {
          const before = overrideFor;
          if (!before) return;
          const restore = {
            overridePrice: before.overridePrice,
            overrideReason: before.overrideReason,
            overrideExpires: before.overrideExpires,
          };
          setList((cur) => ({
            ...cur,
            lines: cur.lines.map((x) =>
              x.id === before.id
                ? {
                    ...x,
                    overridePrice: undefined,
                    overrideReason: undefined,
                    overrideExpires: undefined,
                  }
                : x,
            ),
          }));
          setOverrideFor(null);
          notifyUndo(
            "Override removed",
            () =>
              setList((cur) => ({
                ...cur,
                lines: cur.lines.map((x) => (x.id === before.id ? { ...x, ...restore } : x)),
              })),
            "Final price returns to the calculated price.",
          );
        }}
      />
    </>
  );
}

function ProductCell({ sku }: { sku: string }) {
  const p = productBySku(sku);
  return (
    <div>
      <div className="font-medium">
        {p ? (
          <RecordLink to="/pricing/products/$id" params={{ id: p.productId }}>
            {p.name}
          </RecordLink>
        ) : (
          sku
        )}
      </div>
      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="whitespace-nowrap">{p?.sku ?? sku}</span>
        {p && p.lifecycleStatus !== "ACTIVE" && <StatusPill status={p.lifecycleStatus} />}
      </div>
    </div>
  );
}

/** Draft line price change; every change needs a reason code (US-PL-05 AC#1, AC#4). */
function PriceEditModal({
  line,
  list,
  onClose,
  onSave,
}: {
  line: PriceLine | null;
  list: PriceList;
  onClose: () => void;
  onSave: (price: number, reasonCode: string, reasonText: string) => void;
}) {
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState("");
  const [text, setText] = useState("");
  const [err, setErr] = useState<{ price?: string; reason?: string; text?: string }>({});
  const [lastId, setLastId] = useState<string | null>(null);
  if (line && line.id !== lastId) {
    setLastId(line.id);
    setPrice(line.price?.toString() ?? "");
    setReason("");
    setText("");
    setErr({});
  }
  if (!line && lastId !== null) setLastId(null);
  const dirty = !!line && (price !== (line.price?.toString() ?? "") || !!reason || !!text);

  const save = () => {
    const e: typeof err = {};
    const n = Number(price);
    if (price === "") e.price = "Enter the new price.";
    else if (!Number.isFinite(n) || n < 0) e.price = "Enter a price of 0 or more, e.g. 95.00.";
    else if (n === 0 && !line?.allowZeroPrice)
      e.price = "Zero price isn't allowed on this line — enter a price above 0.";
    if (!reason) e.reason = "Choose a reason code — every price change is audited.";
    else if (reason === "OTHER" && !text.trim())
      e.text = "Describe the reason — required when the code is Other.";
    setErr(e);
    const first = e.price ? "pe-price" : e.reason ? "pe-reason" : e.text ? "pe-text" : null;
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    onSave(n, reason, text.trim());
  };

  return (
    <Modal
      open={!!line}
      title="Edit line price"
      subtitle={
        line
          ? `${productBySku(line.sku)?.name ?? line.sku} · current ${line.price === null ? "no price" : money(line.price, list.currency)}`
          : ""
      }
      onClose={onClose}
      dismissible={!dirty}
      footer={
        <>
          <Btn variant="subtle" onClick={onClose}>
            Cancel
          </Btn>
          <Btn type="submit" form="price-edit-form">
            Save price
          </Btn>
        </>
      }
    >
      <form
        id="price-edit-form"
        noValidate
        className="grid sm:grid-cols-2 gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label={`New price (${list.currency})`} required error={err.price}>
          <input
            id="pe-price"
            type="number"
            min={0}
            step="0.01"
            inputMode="decimal"
            className={inputCls}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 95.00"
          />
        </Field>
        <Field label="Reason code" required error={err.reason}>
          <select
            id="pe-reason"
            className={inputCls}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="">Select reason…</option>
            {REASON_CODES.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="Reason text"
          required={reason === "OTHER"}
          error={err.text}
          hint={reason === "OTHER" ? "Required when the code is Other" : "Optional"}
          className="sm:col-span-2"
        >
          <input
            id="pe-text"
            className={inputCls}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
      </form>
      <p className="text-xs text-muted-foreground mt-3">
        The audit trail stores you, the time, the before and after price, the reason and list
        version v{list.version}.
      </p>
    </Modal>
  );
}

function OverrideModal({
  line,
  list,
  onClose,
  onSave,
  onRemove,
}: {
  line: PriceLine | null;
  list: PriceList;
  onClose: () => void;
  onSave: (patch: Partial<PriceLine>) => void;
  onRemove: () => void;
}) {
  const [price, setPrice] = useState("");
  const [reason, setReason] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [expires, setExpires] = useState("");
  const [err, setErr] = useState<{
    price?: string;
    reason?: string;
    reasonText?: string;
    expires?: string;
  }>({});
  const [lastId, setLastId] = useState<string | null>(null);
  if (line && line.id !== lastId) {
    setLastId(line.id);
    setPrice(line.overridePrice?.toString() ?? "");
    setReason(line.overrideReason ?? "");
    setReasonText(line.overrideReasonText ?? "");
    setExpires(line.overrideExpires ?? "");
    setErr({});
  }
  if (!line && lastId !== null) setLastId(null);
  const dirty =
    !!line &&
    (price !== (line.overridePrice?.toString() ?? "") ||
      reason !== (line.overrideReason ?? "") ||
      reasonText !== (line.overrideReasonText ?? "") ||
      expires !== (line.overrideExpires ?? ""));

  const save = () => {
    const e: typeof err = {};
    if (!price) e.price = "Enter the override price.";
    else if (!Number.isFinite(Number(price)) || Number(price) < 0)
      e.price = "Enter a price of 0 or more, e.g. 95.00.";
    if (!reason) e.reason = "Choose a reason code — every override is audited.";
    else if (reason === "OTHER" && !reasonText.trim())
      e.reasonText = "Describe the reason — required when the code is Other.";
    if (expires && expires < TODAY && expires !== line?.overrideExpires)
      e.expires = `Choose ${TODAY} or later, or leave blank for no expiry.`;
    setErr(e);
    const first = e.price
      ? "ovr-price"
      : e.expires
        ? "ovr-expires"
        : e.reason
          ? "ovr-reason"
          : e.reasonText
            ? "ovr-reason-text"
            : null;
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    onSave({
      overridePrice: Number(price),
      overrideReason: reason,
      overrideReasonText: reason === "OTHER" ? reasonText.trim() : undefined,
      overrideExpires: expires || undefined,
    });
    toast.success("Override saved", {
      description:
        list.status === "ACTIVE"
          ? "Saved to the new draft version. It stays when the base price changes and is flagged on the list."
          : "Flagged on the list.",
    });
  };

  return (
    <Modal
      open={!!line}
      title="Customer override price"
      subtitle={
        line
          ? `${productBySku(line.sku)?.name ?? line.sku} · calculated ${money(line.calculatedPrice, list.currency)}`
          : ""
      }
      onClose={onClose}
      dismissible={!dirty}
      footer={
        <>
          {line?.overridePrice !== undefined && (
            <Btn variant="ghost" className="mr-auto" onClick={onRemove}>
              Remove override
            </Btn>
          )}
          <Btn variant="subtle" onClick={onClose}>
            Cancel
          </Btn>
          <Btn type="submit" form="override-form">
            Save override
          </Btn>
        </>
      }
    >
      <form
        id="override-form"
        noValidate
        className="grid sm:grid-cols-2 gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label={`Override price (${list.currency})`} required error={err.price}>
          <input
            id="ovr-price"
            type="number"
            min={0}
            step="0.01"
            className={inputCls}
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            placeholder="e.g. 95.00"
          />
        </Field>
        <Field label="Override expires" error={err.expires} hint="Leave blank for no expiry">
          <input
            id="ovr-expires"
            type="date"
            min={TODAY}
            className={inputCls}
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
        </Field>
        <Field label="Override reason code" required error={err.reason} className="sm:col-span-2">
          <select
            id="ovr-reason"
            className={inputCls}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          >
            <option value="">Select reason…</option>
            {REASON_CODES.map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </select>
        </Field>
        {reason === "OTHER" && (
          <Field
            label="Reason text"
            required
            error={err.reasonText}
            hint="Required when the code is Other"
            className="sm:col-span-2"
          >
            <input
              id="ovr-reason-text"
              className={inputCls}
              value={reasonText}
              onChange={(e) => setReasonText(e.target.value)}
            />
          </Field>
        )}
      </form>
      <p className="text-xs text-muted-foreground mt-3">
        Deliberate overrides are kept when the parent price changes. After expiry the final price
        returns to the calculated price.
      </p>
    </Modal>
  );
}

/* ---------------- Derivation ---------------- */

/** Lifecycle events implied by a list's status, for lists without a recorded trail. */
function lifecycleTrail(l: PriceList): ApprovalEvent[] {
  const submitter = l.submittedBy ?? l.owner;
  const approver = submitter === "Priya Nair" ? "Tom Hale" : "Priya Nair"; // never the submitter (segregation of duties)
  const reached = (...st: ListStatus[]) => st.includes(l.status);
  const ev: ApprovalEvent[] = [{ at: l.lastUpdated, actor: l.owner, action: "CREATE", from: "—", to: "DRAFT" }];
  if (l.status === "DRAFT") return ev;
  if (l.status === "CANCELLED") return [...ev, { at: l.lastUpdated, actor: l.owner, action: "CANCEL", from: "DRAFT", to: "CANCELLED" }];
  ev.push({ at: l.lastUpdated, actor: submitter, action: "SUBMIT", from: "DRAFT", to: "SUBMITTED" });
  if (reached("APPROVED", "SCHEDULED", "ACTIVE", "SUPERSEDED", "EXPIRED")) ev.push({ at: l.lastUpdated, actor: approver, action: "APPROVE", from: "SUBMITTED", to: "APPROVED" });
  if (reached("SCHEDULED", "ACTIVE", "SUPERSEDED", "EXPIRED")) ev.push({ at: l.lastUpdated, actor: approver, action: "SCHEDULE", from: "APPROVED", to: "SCHEDULED" });
  // Activation runs at the effective date, or straight after approval when that date has already passed.
  const activatedAt = `${l.effectiveFrom} 00:00` > l.lastUpdated ? `${l.effectiveFrom} 00:00` : l.lastUpdated;
  if (reached("ACTIVE", "SUPERSEDED", "EXPIRED")) ev.push({ at: activatedAt, actor: "System (activation job)", action: "ACTIVATE", from: "SCHEDULED", to: "ACTIVE" });
  if (l.status === "SUPERSEDED") ev.push({ at: l.lastUpdated, actor: "System (activation job)", action: "SUPERSEDE", from: "ACTIVE", to: "SUPERSEDED" });
  if (l.status === "EXPIRED") ev.push({ at: `${l.effectiveTo ?? l.lastUpdated} 23:59`, actor: "System", action: "EXPIRE", from: "ACTIVE", to: "EXPIRED" });
  return ev;
}

function DerivationTab({
  list,
  setList,
}: {
  list: PriceList;
  setList: React.Dispatch<React.SetStateAction<PriceList>>;
}) {
  const chain = useMemo(() => chainOf(list), [list]);
  const [oldBase, setOldBase] = useState("100.00");
  const [newBase, setNewBase] = useState("110.00");
  const [ran, setRan] = useState(false);
  const nb = Number(newBase) || 0;
  const ob = Number(oldBase) || 0;

  // running price along chain after the base
  let running = nb;
  let runningOld = ob;
  const steps = chain.map((l, i) => {
    if (i > 0) {
      running = r2(running * factor(l));
      runningOld = r2(runningOld * factor(l));
    }
    return { list: l, oldP: runningOld, newP: running };
  });
  const factors = chain.slice(1).map((l) => factor(l).toFixed(2));

  return (
    <div className="space-y-6">
      <Card
        title="Derivation chain"
        subtitle="base → segment → customer · maximum depth 3 (configurable up to 5)"
      >
        <div className="flex flex-wrap items-stretch gap-3">
          {chain.map((l, i) => (
            <div key={l.id} className="flex items-center gap-3">
              <div
                className={`rounded-xl border p-4 min-w-[220px] ${l.id === list.id ? "border-brand bg-brand-soft" : "border-border bg-card"}`}
              >
                <div className="text-xs text-muted-foreground">
                  Level {i + 1} · {humanize(l.type)}
                </div>
                <div className="font-semibold">
                  {l.id === list.id ? (
                    <>
                      {l.name} <span className="sr-only">(this list)</span>
                    </>
                  ) : (
                    <RecordLink to="/pricing/price-lists/$id" params={{ id: l.id }}>
                      {l.name}
                    </RecordLink>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {l.id} · v{l.version}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {i === 0 ? (
                    <Tag>Source of truth</Tag>
                  ) : (
                    <Tag tone="info">
                      {humanize(l.adjustmentType ?? "")} {l.adjustmentValue}
                      {l.adjustmentType === "PERCENT" ? "%" : ""}
                    </Tag>
                  )}
                  {l.inheritanceMode && (
                    <Tag tone={l.inheritanceMode === "LIVE_LINK" ? "success" : "neutral"}>
                      {humanize(l.inheritanceMode)}
                    </Tag>
                  )}
                </div>
              </div>
              {i < chain.length - 1 && (
                <ArrowRight className="size-5 text-muted-foreground" aria-hidden />
              )}
            </div>
          ))}
        </div>
        {list.parentId && list.status !== "DRAFT" && (
          <p className="mt-5 text-sm text-muted-foreground">
            Inheritance mode: <span className="font-medium text-foreground">{list.inheritanceMode === "LIVE_LINK" ? "Live link (recalculates on parent change)" : "Snapshot (copied once, then independent)"}</span>
            {" "}— change it in a new draft version.
          </p>
        )}
        {list.parentId && list.status === "DRAFT" && (
          <div className="mt-5 flex flex-wrap items-center gap-4">
            {/* Switch label stays fixed; its on/off state (aria-checked) carries the mode. */}
            <Toggle
              checked={list.inheritanceMode === "LIVE_LINK"}
              onChange={(v) => {
                setList((l) => ({ ...l, inheritanceMode: v ? "LIVE_LINK" : "SNAPSHOT", lastUpdated: NOW }));
                notifySuccess(
                  v ? "Inheritance mode set to Live link" : "Inheritance mode set to Snapshot",
                  v
                    ? "Prices recalculate when the parent changes."
                    : "Prices were copied once; parent changes no longer apply.",
                );
              }}
              label="Live link — recalculate when the parent changes"
            />
            <span className="text-sm text-muted-foreground">
              Off = Snapshot (copied once, then independent)
            </span>
          </div>
        )}
      </Card>

      <Card
        title="Simulate base price change"
        subtitle="Rounding is applied after each adjustment using the list's rounding rule."
      >
        <div className="flex flex-wrap items-end gap-4">
          <Field label={`Base price (${chain[0].name}) — before`}>
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              className={`${inputCls} w-32`}
              value={oldBase}
              onChange={(e) => setOldBase(e.target.value)}
            />
          </Field>
          <Field label="Base price — after">
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              className={`${inputCls} w-32`}
              value={newBase}
              onChange={(e) => setNewBase(e.target.value)}
            />
          </Field>
          <Btn variant="outline" icon={ArrowRight} onClick={() => setRan(true)}>
            Recalculate chain
          </Btn>
        </div>
        {ran && (
          <div className="mt-5 space-y-4" role="status">
            <div
              className="relative overflow-x-auto rounded-lg border border-border"
              tabIndex={0}
              role="region"
              aria-label="Recalculated derivation chain"
            >
              <table className="w-full text-sm">
                <caption className="sr-only">
                  Recalculated prices along the derivation chain
                </caption>
                <thead>
                  <tr className="bg-navy text-navy-foreground text-left">
                    <th scope="col" className="px-4 py-3">
                      List
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Adjustment
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      Before
                    </th>
                    <th scope="col" className="px-4 py-3 text-right">
                      After
                    </th>
                    <th scope="col" className="px-4 py-3">
                      Result
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {steps.map((s, i) => {
                    const snapshot =
                      s.list.inheritanceMode === "SNAPSHOT" ||
                      (s.list.id === list.id && list.inheritanceMode === "SNAPSHOT");
                    return (
                      <tr
                        key={s.list.id}
                        className={s.list.id === list.id ? "bg-brand-soft/60" : ""}
                      >
                        <td className="px-4 py-3 font-medium whitespace-nowrap">{s.list.name}</td>
                        <td className="px-4 py-3">
                          {i === 0
                            ? "Base"
                            : `${s.list.adjustmentValue}% (× ${factor(s.list).toFixed(2)})`}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums">
                          {money(s.oldP, s.list.currency)}
                        </td>
                        <td className="px-4 py-3 text-right tabular-nums font-semibold">
                          {snapshot
                            ? money(s.oldP, s.list.currency)
                            : money(s.newP, s.list.currency)}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {snapshot ? (
                            <Tag>Snapshot — unchanged</Tag>
                          ) : i === 0 ? (
                            <Tag tone="brand">Changed</Tag>
                          ) : (
                            <Tag tone="success">Recalculated · would create a draft</Tag>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="rounded-lg border border-border p-4 bg-card">
                <div className="text-sm font-medium text-foreground mb-1">
                  Single step example (−5%)
                </div>
                {money(nb)} × 0.95 = <span className="font-semibold">{money(r2(nb * 0.95))}</span>
              </div>
              <div className="rounded-lg border border-border p-4 bg-card">
                <div className="text-sm font-medium text-foreground mb-1">
                  Derivation chain recorded
                </div>
                <code className="text-xs">
                  {nb.toFixed(2)} {factors.map((f) => `× ${f}`).join(" ")} ={" "}
                  {money(steps[steps.length - 1].newP)}
                </code>
              </div>
            </div>
            {list.lines.some((l) => l.overridePrice !== undefined && !overrideExpired(l)) && (
              <InfoBanner tone="brand" title="Overrides kept">
                {list.lines
                  .filter((l) => l.overridePrice !== undefined && !overrideExpired(l))
                  .map(
                    (l) =>
                      `${productBySku(l.sku)?.name ?? l.sku} stays at ${money(l.overridePrice, list.currency)} (flagged)`,
                  )
                  .join(" · ")}
              </InfoBanner>
            )}
            <p className="text-xs text-muted-foreground">
              A parent change that alters derived prices creates a draft for each derived list,
              which follows the normal approval path (auto-publish only where enabled for the list
              type).
            </p>
          </div>
        )}
      </Card>

      <section aria-labelledby="overrides-heading">
        <h2 id="overrides-heading" className="text-lg font-semibold tracking-tight mb-3">
          Overrides
        </h2>
        <DataTable
          caption={`Overrides on ${list.name}`}
          columns={[
            { key: "p", header: "Product", cell: (l: PriceLine) => <ProductCell sku={l.sku} /> },
            {
              key: "c",
              header: "Calculated",
              align: "right",
              cell: (l) => money(l.calculatedPrice, list.currency),
            },
            {
              key: "o",
              header: "Override",
              align: "right",
              cell: (l) => money(l.overridePrice, list.currency),
            },
            {
              key: "r",
              header: "Reason",
              cell: (l) =>
                `${humanize(l.overrideReason ?? "")}${l.overrideReasonText ? ` — ${l.overrideReasonText}` : ""}`,
            },
            {
              key: "e",
              header: "Expires",
              cell: (l) => <span className="whitespace-nowrap">{l.overrideExpires ?? "—"}</span>,
            },
            {
              key: "s",
              header: "Status",
              cell: (l) => (
                <StatusPill
                  status={overrideExpired(l) ? "EXPIRED" : "ACTIVE"}
                  label={overrideExpired(l) ? "Expired" : "Active override"}
                />
              ),
            },
          ]}
          rows={list.lines.filter((l) => l.overridePrice !== undefined)}
          rowKey={(l) => l.id}
          empty="No overrides on this list."
        />
      </section>
    </div>
  );
}

/* ---------------- Approval ---------------- */

function ApprovalTab({
  list,
  events,
  taskState,
}: {
  list: PriceList;
  events: ApprovalEvent[];
  taskState: "PENDING" | "COMPLETED" | "CANCELLED" | null;
}) {
  return (
    <div className="grid lg:grid-cols-3 gap-6">
      <Card title="Lifecycle timeline" className="lg:col-span-2">
        <ol className="relative border-l-2 border-border ml-2 space-y-6">
          {[...events].reverse().map((e, i) => (
            <li key={i} className="ml-6">
              <span
                className={`absolute -left-[9px] size-4 rounded-full border-2 border-card ${i === 0 ? "bg-brand" : "bg-muted-foreground/40"}`}
                aria-hidden
              />
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{humanize(e.action)}</span>
                {i === 0 && <span className="sr-only">(latest)</span>}
                {e.from !== "—" && <StatusPill status={e.from} />}
                <ArrowRight className="size-3.5 text-muted-foreground" aria-label="to" role="img" />
                <StatusPill status={e.to} />
              </div>
              <div className="text-sm text-muted-foreground mt-1">
                {e.actor} · {e.at}
              </div>
              {e.comment && (
                <div className="mt-2 text-sm bg-muted/60 rounded-md px-3 py-2">“{e.comment}”</div>
              )}
            </li>
          ))}
        </ol>
      </Card>
      <div className="space-y-6">
        <Card title="Approval task">
          {taskState ? (
            <DetailGrid
              items={[
                { label: "Assigned to", value: "Pricing Manager — Neel Kamat", full: true },
                { label: "Submitted by", value: list.submittedBy ?? "—", full: true },
                { label: "State", value: <StatusPill status={taskState} />, full: true },
              ]}
            />
          ) : (
            <p className="text-sm text-muted-foreground">No approval task for this list.</p>
          )}
        </Card>
        <Card title="Rules">
          <ul className="text-sm space-y-2 list-disc pl-5 text-muted-foreground">
            <li>Approver must be different from the submitter.</li>
            <li>A comment is required to reject, send back or cancel.</li>
            <li>Submitted or later lists are locked; changes need a new draft version.</li>
            <li>
              Activation job runs at the effective datetime in {list.timeZone} and writes an audit
              event.
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ---------------- Versions ---------------- */

type DiffRow = {
  sku: string;
  kind: "added" | "removed" | "changed" | "unchanged";
  oldP?: number;
  newP?: number;
};

function buildDiff(list: PriceList, a: number, b: number): DiffRow[] {
  const [lo, hi] = a < b ? [a, b] : [b, a];
  const gap = hi - lo;
  const rows: DiffRow[] = list.lines.map((l, i) => {
    const cur = l.price ?? 0;
    if (i === list.lines.length - 1 && gap >= 1 && list.lines.length > 2)
      return { sku: l.sku, kind: "added", newP: cur };
    if (i % 2 === 0)
      return { sku: l.sku, kind: "changed", oldP: r2(cur / (1 + 0.05 * gap)), newP: cur };
    return { sku: l.sku, kind: "unchanged", oldP: cur, newP: cur };
  });
  if (gap >= 2) rows.push({ sku: "LT-DWN-10", kind: "removed", oldP: 74 });
  return rows;
}

function VersionsTab({ list }: { list: PriceList }) {
  const versions: ListVersion[] =
    LIST_VERSIONS[list.id] ??
    Array.from({ length: list.version }, (_, i) => ({
      version: list.version - i,
      status: i === 0 ? list.status : ("SUPERSEDED" as ListStatus),
      createdBy: list.owner,
      createdAt: i === 0 ? list.lastUpdated : `2026-0${Math.max(1, 9 - i)}-01 09:00`,
      reason: i === 0 ? "ANNUAL_PRICE_INCREASE" : "CORRECTION",
      lines: list.lines.length,
    }));
  const [a, setA] = useState(versions[1]?.version ?? versions[0].version);
  const [b, setB] = useState(versions[0].version);
  const [diff, setDiff] = useState<DiffRow[] | null>(null);
  const sameVersion = a === b;
  const counts = diff
    ? (["added", "removed", "changed", "unchanged"] as const).map(
        (k) => [k, diff.filter((d) => d.kind === k).length] as const,
      )
    : [];

  return (
    <div className="space-y-6">
      <DataTable
        caption={`Versions of ${list.name}`}
        columns={[
          {
            key: "v",
            header: "Version",
            cell: (v: ListVersion) => <span className="font-semibold">v{v.version}</span>,
          },
          { key: "s", header: "Status", cell: (v) => <StatusPill status={v.status} /> },
          { key: "by", header: "Created by", cell: (v) => v.createdBy },
          {
            key: "at",
            header: "Created at",
            cell: (v) => <span className="whitespace-nowrap">{v.createdAt}</span>,
          },
          { key: "r", header: "Reason code", cell: (v) => <Tag>{humanize(v.reason)}</Tag> },
          { key: "l", header: "Lines", align: "right", cell: (v) => v.lines },
        ]}
        rows={versions}
        rowKey={(v) => String(v.version)}
        numbered={false}
      />
      <Card
        title="Compare versions"
        subtitle="Added, removed, changed and unchanged counts, then the line-level diff."
      >
        <div className="flex flex-wrap items-end gap-4">
          <Field label="Version A">
            <select
              className={`${inputCls} w-32`}
              value={a}
              onChange={(e) => {
                setA(Number(e.target.value));
                // The old diff no longer matches the chosen versions; ask for a fresh compare.
                setDiff(null);
              }}
            >
              {versions.map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Version B">
            <select
              className={`${inputCls} w-32`}
              value={b}
              onChange={(e) => {
                setB(Number(e.target.value));
                setDiff(null);
              }}
            >
              {versions.map((v) => (
                <option key={v.version} value={v.version}>
                  v{v.version}
                </option>
              ))}
            </select>
          </Field>
          <Btn
            variant="outline"
            icon={GitCompare}
            disabled={sameVersion}
            title={
              sameVersion
                ? versions.length > 1
                  ? "Choose two different versions"
                  : "Only one version exists"
                : undefined
            }
            onClick={() => setDiff(buildDiff(list, a, b))}
          >
            Compare versions
          </Btn>
        </div>
        {sameVersion && (
          <p className="text-sm text-muted-foreground mt-3" role="status">
            {versions.length === 1
              ? "Only one version exists, so there is nothing to compare yet."
              : "Choose two different versions to compare."}
          </p>
        )}
        {diff && (
          <div className="mt-5 space-y-4" role="status">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {counts.map(([k, n]) => (
                <KpiTile
                  key={k}
                  label={humanize(k)}
                  value={n}
                  tone={
                    k === "added"
                      ? "success"
                      : k === "removed"
                        ? "danger"
                        : k === "changed"
                          ? "brand"
                          : "neutral"
                  }
                />
              ))}
            </div>
            <DataTable
              caption={`Line differences between v${Math.min(a, b)} and v${Math.max(a, b)}`}
              columns={[
                { key: "p", header: "Product", cell: (d: DiffRow) => <ProductCell sku={d.sku} /> },
                {
                  key: "k",
                  header: "Change",
                  cell: (d) => (
                    <StatusPill
                      status={d.kind}
                      tone={
                        d.kind === "added"
                          ? "success"
                          : d.kind === "removed"
                            ? "danger"
                            : d.kind === "changed"
                              ? "brand"
                              : "neutral"
                      }
                    />
                  ),
                },
                {
                  key: "o",
                  header: `Old (v${Math.min(a, b)})`,
                  align: "right",
                  cell: (d) => money(d.oldP, list.currency),
                },
                {
                  key: "n",
                  header: `New (v${Math.max(a, b)})`,
                  align: "right",
                  cell: (d) => money(d.newP, list.currency),
                },
                {
                  key: "abs",
                  header: "Amount",
                  align: "right",
                  cell: (d) =>
                    d.oldP !== undefined && d.newP !== undefined
                      ? `${d.newP - d.oldP > 0 ? "+" : ""}${money(r2(d.newP - d.oldP), list.currency)}`
                      : "—",
                },
                {
                  key: "pct",
                  header: "% change",
                  align: "right",
                  cell: (d) =>
                    d.oldP && d.newP !== undefined
                      ? `${d.newP > d.oldP ? "+" : ""}${(((d.newP - d.oldP) / d.oldP) * 100).toFixed(2)}%`
                      : "—",
                },
              ]}
              rows={diff}
              rowKey={(d) => `${d.sku}-${d.kind}`}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

/* ---------------- Audit ---------------- */

function AuditTab({ list }: { list: PriceList }) {
  const rows = AUDIT_LOG.filter((e) => e.record.startsWith(list.name));
  return (
    <DataTable
      caption={`Audit trail for ${list.name}`}
      columns={[
        {
          key: "at",
          header: "Timestamp",
          cell: (e) => <span className="whitespace-nowrap">{e.at}</span>,
        },
        { key: "actor", header: "Actor", className: "whitespace-nowrap", cell: (e) => e.actor },
        {
          key: "a",
          header: "Action",
          className: "whitespace-nowrap",
          cell: (e) => <Tag>{humanize(e.action)}</Tag>,
        },
        { key: "rec", header: "Record", cell: (e) => e.record },
        { key: "b", header: "Before", align: "right", cell: (e) => e.before ?? "—" },
        {
          key: "af",
          header: "After",
          align: "right",
          cell: (e) => <span className="font-semibold">{e.after ?? "—"}</span>,
        },
        {
          key: "r",
          header: "Reason",
          cell: (e) =>
            e.reasonCode
              ? `${humanize(e.reasonCode)}${e.reasonText ? ` — ${e.reasonText}` : ""}`
              : "—",
        },
        { key: "v", header: "Version", cell: (e) => e.version ?? "—" },
      ]}
      rows={rows}
      rowKey={(e) => e.id}
      empty="No price changes recorded on this list yet. Lifecycle events (submit, approve, activate) are on the Approval tab."
    />
  );
}

/** Add a product line to a draft list (US-PL-01 AC#5 duplicate line, US-MD-01 AC#8/#9 lifecycle checks). */
function AddLineModal({ open, list, onClose, onAdd }: { open: boolean; list: PriceList; onClose: () => void; onAdd: (l: PriceLine) => void }) {
  const blank = { sku: "", price: "", uom: list.uom ?? "EA", minQty: "1", maxQty: "", allowZero: false };
  const [f, setF] = useState(blank);
  const [submitted, setSubmitted] = useState(false);
  useEffect(() => {
    if (open) {
      setF({ ...blank, uom: list.uom ?? "EA" });
      setSubmitted(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const product = PRODUCTS.find((p) => p.sku === f.sku);
  const min = Number(f.minQty);
  const max = f.maxQty === "" ? undefined : Number(f.maxQty);
  const e: Record<string, string> = {};
  if (!f.sku) e["al-product"] = "Choose a product.";
  else if (product?.lifecycleStatus === "BLOCKED") e["al-product"] = "PRODUCT_BLOCKED — this product is blocked in the ERP and can't be priced.";
  else if (list.lines.some((l) => l.sku === f.sku && l.uom === f.uom && l.minQty === min))
    e["al-minqty"] = "DUPLICATE_LINE — this product already has a line with the same UoM and min qty. Change the min qty for a new tier.";
  if (!f.allowZero && (f.price === "" || Number(f.price) <= 0)) e["al-price"] = "Enter a price above 0, or allow a zero price.";
  else if (f.price !== "" && Number(f.price) < 0) e["al-price"] = "The price can't be negative.";
  if (!Number.isInteger(min) || min < 1) e["al-minqty"] = e["al-minqty"] ?? "Enter a whole number of 1 or more.";
  if (max !== undefined && (!Number.isInteger(max) || max < min)) e["al-maxqty"] = "Max qty must be a whole number at least the min qty.";
  const fe = (k: string) => (submitted || (k === "al-product" && e[k]?.startsWith("PRODUCT_BLOCKED")) ? e[k] : undefined);

  const save = (ev: React.FormEvent) => {
    ev.preventDefault();
    setSubmitted(true);
    const first = Object.keys(e)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    onAdd({
      id: `${list.id}-L${list.lines.length + 1}-${Date.now().toString(36)}`,
      sku: f.sku,
      price: f.price === "" ? (f.allowZero ? 0 : null) : Number(f.price),
      uom: f.uom,
      minQty: min,
      maxQty: max,
      effectiveFrom: list.effectiveFrom,
      allowZeroPrice: f.allowZero,
    });
  };
  const dirty = JSON.stringify(f) !== JSON.stringify({ ...blank, uom: list.uom ?? "EA" });

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!dirty}
      title="Add product line"
      subtitle={`${list.name} · ${list.currency} · effective ${list.effectiveFrom} → list end`}
      footer={
        <>
          <Btn variant="subtle" onClick={onClose}>
            Cancel
          </Btn>
          <Btn type="submit" form="add-line-form" icon={Plus}>
            Add line
          </Btn>
        </>
      }
    >
      <form id="add-line-form" noValidate onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <p className="sm:col-span-2 text-xs text-muted-foreground">
          <span className="text-destructive" aria-hidden>*</span> Required
        </p>
        <Field label="Product" required error={fe("al-product")} className="sm:col-span-2">
          <select id="al-product" className={inputCls} value={f.sku} onChange={(ev) => setF({ ...f, sku: ev.target.value })}>
            <option value="">Choose a product…</option>
            {PRODUCTS.map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.sku} · {p.name}
                {p.lifecycleStatus === "BLOCKED" ? " (blocked)" : p.lifecycleStatus === "END_OF_LIFE" ? " (end of life)" : ""}
              </option>
            ))}
          </select>
        </Field>
        {product?.lifecycleStatus === "END_OF_LIFE" && (
          <div className="sm:col-span-2 -mt-2">
            <Flag tone="warning">End-of-life product — the line is allowed, with a warning on the list.</Flag>
          </div>
        )}
        <Field label={`Price (${list.currency})`} required={!f.allowZero} error={fe("al-price")}>
          <input id="al-price" type="number" inputMode="decimal" min={0} step="0.01" className={inputCls} value={f.price} onChange={(ev) => setF({ ...f, price: ev.target.value })} placeholder="e.g. 95.00" />
        </Field>
        <Field label="Unit of measure" required>
          <select className={inputCls} value={f.uom} onChange={(ev) => setF({ ...f, uom: ev.target.value })}>
            {UOMS.map((u) => (
              <option key={u}>{u}</option>
            ))}
          </select>
        </Field>
        <Field label="Min qty" required error={fe("al-minqty")}>
          <input id="al-minqty" type="number" inputMode="numeric" min={1} step={1} className={inputCls} value={f.minQty} onChange={(ev) => setF({ ...f, minQty: ev.target.value })} />
        </Field>
        <Field label="Max qty" hint="Leave blank for no upper limit" error={fe("al-maxqty")}>
          <input id="al-maxqty" type="number" inputMode="numeric" min={Number(f.minQty) || 1} step={1} className={inputCls} value={f.maxQty} onChange={(ev) => setF({ ...f, maxQty: ev.target.value })} />
        </Field>
        <div className="sm:col-span-2">
          <Toggle checked={f.allowZero} onChange={(v) => setF({ ...f, allowZero: v })} label="Allow a zero price on this line" />
        </div>
      </form>
    </Modal>
  );
}
