import { createFileRoute } from "@tanstack/react-router";
import { useId, useMemo, useState, type FormEvent } from "react";
import { History, KeyRound, Pencil, RefreshCw, RotateCcw, Send, ServerCog } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  ConfirmDialog,
  DataTable,
  DetailGrid,
  Drawer,
  EmptyState,
  ErrorBanner,
  Field,
  FilterPills,
  Flag,
  InfoBanner,
  ListHeader,
  MissingHint,
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
  notifySuccess,
  type ApiError,
  type Tone,
} from "@/components/pricing/kit";
import { RequireAccess } from "@/components/pricing/access";
import { PRICE_LISTS, PRODUCTS, REASON_CODES, REGIONS, LIST_TYPES } from "@/lib/pricing/data";
import { pushNotification } from "@/lib/pricing/deals";
import {
  DESTINATIONS,
  DESTINATION_TYPES,
  IDEMPOTENCY_KEYS,
  IDEMPOTENCY_RETENTION_DAYS,
  NOW,
  PUBLICATIONS,
  PUBLICATION_STATUSES,
  ROLLBACK_CAPABILITIES,
  TODAY_ISO,
  bodyHash,
  destinationAuthorized,
  destinationById,
  gateLines,
  listById,
  nextPublicationId,
  priceAsOf,
  publishableLists,
  rollbackModeFor,
  type Destination,
  type IdemKey,
  type Publication,
  type PublicationMode,
  type PubRecord,
  type RollbackMode,
} from "@/lib/pricing/execution";
import { userName, useSession } from "@/lib/pricing/session";

export const Route = createFileRoute("/pricing/publications")({
  head: () => ({ meta: [{ title: "Publications · Rebate Ninja" }] }),
  component: () => (
    <RequireAccess roles={["PRICING_ADMIN", "IT_ADMIN", "FINANCE_CONTROLLER"]}>
      <Page />
    </RequireAccess>
  ),
});

type TabKey = "publications" | "destinations" | "read-api" | "idempotency";
type Status = Publication["status"];

const KIND_TONE: Record<Publication["kind"], Tone> = { PUBLICATION: "neutral", ROLLBACK: "brand", COMPENSATING_CHANGE: "brand", CANCELLATION: "warning" };
const MODE_HINT: Record<RollbackMode, string> = {
  CANCEL_PENDING: "Cancel pending — the queued publication is withdrawn before the destination applies it.",
  NATIVE_ROLLBACK: "Native rollback — the destination reverses the change itself; a linked rollback publication records it.",
  COMPENSATING_CHANGE: "Compensating change — a new publication restores the previous version's prices.",
};
const KIND_FOR_MODE: Record<RollbackMode, Publication["kind"]> = { CANCEL_PENDING: "CANCELLATION", NATIVE_ROLLBACK: "ROLLBACK", COMPENSATING_CHANGE: "COMPENSATING_CHANGE" };
const stamp = () => NOW;
const corr = () => `c-${Math.random().toString(16).slice(2, 8)}`;

function Page() {
  const { user, role } = useSession();
  const operator = role === "PRICING_ADMIN" || role === "IT_ADMIN";
  const [tab, setTab] = useState<TabKey>("publications");
  const [pubs, setPubs] = useState<Publication[]>(PUBLICATIONS);
  const [dests, setDests] = useState<Destination[]>(DESTINATIONS);
  const [publishOpen, setPublishOpen] = useState(false);

  const save = (next: Publication[]) => {
    setPubs(next);
    PUBLICATIONS.splice(0, PUBLICATIONS.length, ...next);
  };

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Price execution" }, { label: "Publications" }]}>
      <ListHeader
        title="Publications"
        subtitle="Send approved, effective prices to the ERP, CRM and other systems — and track, retry or reverse every attempt."
        actions={
          operator ? (
            <Btn icon={Send} onClick={() => setPublishOpen(true)}>
              Publish price list
            </Btn>
          ) : (
            <Tag>View only</Tag>
          )
        }
      />
      <PillTabs<TabKey>
        idPrefix="pub"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "publications", label: "Publications", count: pubs.length },
          { key: "destinations", label: "Destinations", count: dests.length },
          { key: "read-api", label: "Price read API" },
          { key: "idempotency", label: "Idempotency keys", count: IDEMPOTENCY_KEYS.length },
        ]}
      />
      <div role="tabpanel" id={`pub-panel-${tab}`} aria-labelledby={`pub-tab-${tab}`}>
        {tab === "publications" && <PublicationsTab pubs={pubs} save={save} operator={operator} userId={user.id} dests={dests} />}
        {tab === "destinations" && <DestinationsTab dests={dests} setDests={setDests} operator={operator} />}
        {tab === "read-api" && <ReadApiTab />}
        {tab === "idempotency" && <IdempotencyTab />}
      </div>
      {publishOpen && <PublishModal onClose={() => setPublishOpen(false)} pubs={pubs} save={save} dests={dests} userId={user.id} onDone={() => setTab("publications")} />}
    </PricingLayout>
  );
}

/* ================================================================== */
/* Publish (US-EX-01)                                                 */
/* ================================================================== */

function PublishModal({ onClose, pubs, save, dests, userId, onDone }: { onClose: () => void; pubs: Publication[]; save: (p: Publication[]) => void; dests: Destination[]; userId: string; onDone: () => void }) {
  const lists = publishableLists();
  const [listId, setListId] = useState("BL-001");
  const [destId, setDestId] = useState("DST-ERP");
  const [mode, setMode] = useState<PublicationMode>("BATCH");
  const [runDate, setRunDate] = useState("2026-11-15");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const publishHintId = useId();
  const missingPublish = missingFields([
    ["Price list", listId],
    ["Destination", destId],
    ["Mode", mode],
    ["Run date", runDate],
  ]);
  const list = listById(listId)!;
  const dest = destinationById(destId) ?? dests[0];
  const gates = gateLines(list, runDate);
  const authorized = destinationAuthorized(dest, list);
  const sent = gates.filter((g) => g.sent);
  const rejected = gates.filter((g) => !g.sent && g.code !== "NOT_YET_EFFECTIVE");
  const held = gates.filter((g) => g.code === "NOT_YET_EFFECTIVE");
  const modeOk = dest.modes.includes(mode);
  const scope = `${list.name} · ${list.channel === "All" ? "All channels" : list.channel}`;
  const sample = sent[0];
  const key = `pub-${list.id.toLowerCase()}-v${list.version}-${dest.id.toLowerCase()}-${runDate}`;

  const publish = (e?: FormEvent) => {
    e?.preventDefault();
    if (!authorized) {
      setError({ errorClass: "AUTHORIZATION", code: "DESTINATION_NOT_AUTHORIZED", message: `${dest.name} isn't authorized for ${list.region} ${humanize(list.type).toLowerCase()} lists. Choose another destination or ask an IT administrator to extend its scope.`, field: "destination" });
      return;
    }
    if (!modeOk) {
      setError({ errorClass: "VALIDATION", code: "MODE_NOT_SUPPORTED", message: `${dest.name} accepts ${dest.modes.map((m) => humanize(m).toLowerCase()).join(" or ")} only.`, field: "mode" });
      return;
    }
    const dup = pubs.find((p) => p.idempotencyKey === key && p.kind === "PUBLICATION");
    if (dup) {
      toast.info(`Already processed — ${dup.id} returned`, { description: "Same list version, destination and date. No duplicate prices were sent (idempotency key reused)." });
      onClose();
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      const records: PubRecord[] = [...sent, ...rejected].map((g, i) => ({
        id: `R-${String(i + 1).padStart(4, "0")}`,
        sku: g.line.sku,
        scope,
        price: g.line.price,
        currency: list.currency,
        uom: g.line.uom,
        qtyBand: `${g.line.minQty}${g.line.maxQty ? `–${g.line.maxQty}` : "+"}`,
        validFrom: g.effectiveFrom,
        validTo: g.line.effectiveTo ?? list.effectiveTo,
        listVersion: `${list.id} v${list.version}`,
        changeType: list.version > 1 ? "UPDATE" : "CREATE",
        status: g.sent ? "ACKNOWLEDGED" : "REJECTED",
        attempts: g.sent ? 1 : 0,
        error: g.sent ? undefined : { code: g.code!, errorClass: g.code === "VALIDATION_ERROR" ? "VALIDATION" : "BUSINESS_RULE", message: g.reason!, retryable: false },
      }));
      const status: Status = records.length === 0 ? "SUCCEEDED" : sent.length === 0 ? "FAILED" : rejected.length ? "PARTIAL_SUCCESS" : "SUCCEEDED";
      const pub: Publication = {
        id: nextPublicationId(pubs),
        kind: "PUBLICATION",
        destinationId: dest.id,
        listId: list.id,
        listName: list.name,
        listVersion: `v${list.version}`,
        mode,
        runDate,
        startedAt: stamp(),
        finishedAt: stamp(),
        status,
        recordCount: records.length,
        failedCount: 0,
        rejectedCount: rejected.length,
        triggeredBy: userId,
        idempotencyKey: key,
        ack: sent.length ? `${dest.name} acknowledged ${sent.length} record${sent.length === 1 ? "" : "s"}` : undefined,
        retries: [],
        records,
        correlationId: corr(),
      };
      save([pub, ...pubs]);
      setBusy(false);
      onClose();
      onDone();
      const heldNote = held.length ? ` ${held.length} held until ${held[0].effectiveFrom}.` : "";
      if (status === "SUCCEEDED") notifySuccess(`${pub.id} published`, `${sent.length} records sent to ${dest.name}.${heldNote}`);
      else {
        toast.error(status === "FAILED" ? `${pub.id} failed — nothing was sent` : `${pub.id} partly succeeded`, { description: `${rejected.length} record${rejected.length === 1 ? "" : "s"} rejected at the gate and logged.${heldNote}` });
        pushNotification({ event: "PUBLICATION_FAILURE", recipientId: userId, at: NOW, title: `Publication ${pub.id} ${status === "FAILED" ? "failed" : "partly failed"}`, body: `${rejected.length} of ${records.length} records rejected for ${dest.name}.`, link: { to: "/pricing/publications" }, deliveries: [{ channel: "IN_APP", status: "DELIVERED", attempts: 1 }, { channel: "EMAIL", status: "DELIVERED", attempts: 1 }] });
      }
    }, 800);
  };

  return (
    <Modal
      open
      size="xl"
      onClose={onClose}
      dismissible={!busy}
      title="Publish price list"
      subtitle="Only approved, valid prices effective on the run date are sent. Everything else is rejected or held and logged."
      footer={
        <>
          <MissingHint id={publishHintId} missing={missingPublish} />
          <Btn variant="subtle" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn type="submit" form="publish-form" icon={Send} loading={busy} disabled={missingPublish.length > 0} aria-describedby={missingPublish.length ? publishHintId : undefined}>
            {sent.length ? `Publish ${sent.length} record${sent.length === 1 ? "" : "s"}` : "Record rejected attempt"}
          </Btn>
        </>
      }
    >
      <form id="publish-form" onSubmit={publish} noValidate>
        <ErrorBanner error={error} onClose={() => setError(null)} note="Nothing was sent." />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Field label="Price list" required>
            <select className={inputCls} value={listId} onChange={(e) => (setListId(e.target.value), setError(null))}>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.id} · {l.name} (v{l.version}, {humanize(l.status).toLowerCase()})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Destination" required>
            <select className={inputCls} value={destId} onChange={(e) => (setDestId(e.target.value), setError(null))}>
              {dests.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Mode" required hint={modeOk ? undefined : `Not supported by ${dest.name}`}>
            <select className={inputCls} value={mode} onChange={(e) => setMode(e.target.value as PublicationMode)}>
              <option value="BATCH">Batch</option>
              <option value="EVENT">Event (price-updated)</option>
            </select>
          </Field>
          <Field label="Run date" required hint="Lines starting after this date are held.">
            <input type="date" className={inputCls} value={runDate} onChange={(e) => setRunDate(e.target.value || TODAY_ISO)} />
          </Field>
        </div>

        <div className="flex flex-wrap gap-2 mt-4" role="status">
          {authorized ? <Flag tone="success">Destination authorized for {list.region} · {humanize(list.type).toLowerCase()}</Flag> : <Flag tone="danger">Destination not authorized for {list.region} · {humanize(list.type).toLowerCase()}</Flag>}
          <Flag tone="success">{sent.length} to send</Flag>
          {held.length > 0 && <Flag tone="info">{held.length} held (not yet effective)</Flag>}
          {rejected.length > 0 && <Flag tone="danger">{rejected.length} rejected</Flag>}
        </div>

        <h3 className="text-sm font-semibold mt-6 mb-2">Gate check per record</h3>
        <DataTable
          caption="Publication gate check per record"
          rows={gates}
          rowKey={(g) => g.line.id}
          columns={[
            { key: "sku", header: "Product", cell: (g) => <span className="whitespace-nowrap font-medium">{g.line.sku} · {PRODUCTS.find((p) => p.sku === g.line.sku)?.name ?? "—"}</span> },
            { key: "price", header: "Price", align: "right", cell: (g) => (g.line.price === null ? <span className="text-muted-foreground">No price</span> : `${money(g.line.price, list.currency)} / ${g.line.uom}`) },
            { key: "band", header: "Qty band", cell: (g) => `${g.line.minQty}${g.line.maxQty ? `–${g.line.maxQty}` : "+"}` },
            { key: "eff", header: "Effective from", cell: (g) => <span className="tabular-nums">{g.effectiveFrom}</span> },
            { key: "out", header: "Outcome", cell: (g) => (g.sent ? <Flag tone="success">Send</Flag> : g.code === "NOT_YET_EFFECTIVE" ? <Flag tone="info">Held</Flag> : <Flag tone="danger">Reject · {g.code}</Flag>) },
            { key: "why", header: "Reason", className: "min-w-64", cell: (g) => <span className="text-muted-foreground">{g.reason ?? "Approved, valid and effective"}</span> },
          ]}
        />
        {sample && (
          <details className="mt-4 text-sm">
            <summary className="cursor-pointer font-semibold text-brand">Payload preview (first record)</summary>
            <pre className="mt-2 p-3 rounded-lg bg-muted text-xs overflow-x-auto overflow-y-hidden">
              {JSON.stringify(
                { product: sample.line.sku, scope, price: sample.line.price, currency: list.currency, uom: sample.line.uom, quantityBand: { min: sample.line.minQty, max: sample.line.maxQty ?? null }, validFrom: sample.effectiveFrom, validTo: sample.line.effectiveTo ?? list.effectiveTo ?? null, listVersion: `${list.id} v${list.version}`, changeType: list.version > 1 ? "UPDATE" : "CREATE" },
                null,
                2,
              )}
            </pre>
            <p className="text-xs text-muted-foreground mt-1">
              Idempotency key <code>{key}</code> — publishing the same version to the same destination on the same date again returns the original result.
            </p>
          </details>
        )}
      </form>
    </Modal>
  );
}

/* ================================================================== */
/* Attempts, retry, rollback (US-EX-02, US-EX-04)                     */
/* ================================================================== */

function PublicationsTab({ pubs, save, operator, userId, dests }: { pubs: Publication[]; save: (p: Publication[]) => void; operator: boolean; userId: string; dests: Destination[] }) {
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const rows = useMemo(() => pubs.filter((p) => statuses.length === 0 || statuses.includes(p.status)).sort((a, b) => b.startedAt.localeCompare(a.startedAt)), [pubs, statuses]);
  const failing = pubs.filter((p) => p.failedCount > 0 || p.status === "FAILED");
  const open = pubs.find((p) => p.id === openId) ?? null;
  const update = (p: Publication) => save(pubs.map((x) => (x.id === p.id ? p : x)));

  return (
    <>
      {failing.length > 0 && (
        <InfoBanner tone="warning" title={`${failing.length} publication${failing.length === 1 ? "" : "s"} need attention`} action={<Btn variant="subtle" size="sm" onClick={() => setOpenId(failing[0].id)}>Open {failing[0].id}</Btn>}>
          {failing.map((p) => `${p.id}: ${p.failedCount ? `${p.failedCount} failed` : ""}${p.failedCount && p.rejectedCount ? ", " : ""}${p.rejectedCount ? `${p.rejectedCount} rejected` : ""}`).join(" · ")}. A PUBLICATION_FAILURE alert was sent to the requester.
        </InfoBanner>
      )}
      <FilterPills<Status> label="Status" selected={statuses} onChange={setStatuses} options={PUBLICATION_STATUSES.map((s) => ({ key: s, label: humanize(s), count: pubs.filter((p) => p.status === s).length }))} />
      <DataTable<Publication>
        caption="Publication attempts, newest first"
        rows={rows}
        rowKey={(p) => p.id}
        onRowClick={(p) => setOpenId(p.id)}
        selectedKey={openId}
        pageSize={25}
        empty={
          statuses.length ? (
            <EmptyState icon={History} title="No publications match these filters" action={<Btn variant="subtle" onClick={() => setStatuses([])}>Clear filters</Btn>}>
              Remove a status filter to see more attempts.
            </EmptyState>
          ) : (
            <EmptyState icon={Send} title="Nothing published yet">
              Approved price lists you publish appear here with their delivery status.
            </EmptyState>
          )
        }
        columns={[
          {
            key: "id",
            header: "Publication",
            cell: (p) => (
              <div className="whitespace-nowrap">
                <RecordId>{p.id}</RecordId>
                <div className="mt-1">
                  <Tag tone={KIND_TONE[p.kind]}>{humanize(p.kind)}</Tag>
                </div>
              </div>
            ),
          },
          {
            key: "list",
            header: "Price list",
            className: "min-w-48",
            cell: (p) => (
              <div>
                {PRICE_LISTS.some((l) => l.id === p.listId) ? (
                  <RecordLink to="/pricing/price-lists/$id" params={{ id: p.listId }}>
                    {p.listName}
                  </RecordLink>
                ) : (
                  <span className="font-medium">{p.listName}</span>
                )}
                <div className="text-xs text-muted-foreground">
                  {p.listId} {p.listVersion}
                  {p.reverses && ` · reverses ${p.reverses}`}
                  {p.reversedBy && ` · reversed by ${p.reversedBy}`}
                </div>
              </div>
            ),
          },
          { key: "dest", header: "Destination", className: "whitespace-nowrap", cell: (p) => destinationById(p.destinationId)?.name ?? p.destinationId },
          { key: "mode", header: "Mode", cell: (p) => humanize(p.mode) },
          { key: "at", header: "Started", cell: (p) => <span className="tabular-nums whitespace-nowrap">{p.startedAt}</span> },
          { key: "n", header: "Records", align: "right", cell: (p) => p.recordCount.toLocaleString("en-GB") },
          { key: "f", header: "Failed / rejected", align: "right", cell: (p) => (p.failedCount + p.rejectedCount ? <span className="font-semibold text-destructive">{p.failedCount} / {p.rejectedCount}</span> : <span className="text-muted-foreground">0 / 0</span>) },
          { key: "st", header: "Status", cell: (p) => <StatusPill status={p.awaitingApprovalBy ? "PENDING_APPROVAL" : p.status} /> },
        ]}
      />
      {open && <PublicationDrawer pub={open} all={pubs} onClose={() => setOpenId(null)} update={update} save={save} operator={operator} userId={userId} dests={dests} onOpen={setOpenId} />}
    </>
  );
}

function PublicationDrawer({ pub, all, onClose, update, save, operator, userId, dests, onOpen }: { pub: Publication; all: Publication[]; onClose: () => void; update: (p: Publication) => void; save: (p: Publication[]) => void; operator: boolean; userId: string; dests: Destination[]; onOpen: (id: string) => void }) {
  const dest = destinationById(pub.destinationId) ?? dests[0];
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [rollbackOpen, setRollbackOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const eligible = pub.records.filter((r) => r.status === "FAILED" && r.error?.retryable);
  const problems = pub.records.filter((r) => r.status === "FAILED" || r.status === "REJECTED");
  const samples = pub.records.filter((r) => r.status === "SENT" || r.status === "ACKNOWLEDGED");

  const resend = (ids: string[]) => {
    setRetrying(true);
    window.setTimeout(() => {
      const records = pub.records.map((r) => (ids.includes(r.id) ? { ...r, status: "ACKNOWLEDGED" as const, attempts: r.attempts + 1, error: undefined } : r));
      const failedCount = pub.failedCount - ids.length;
      const status: Status = failedCount === 0 && pub.rejectedCount === 0 ? "SUCCEEDED" : "PARTIAL_SUCCESS";
      update({ ...pub, records, failedCount, status, retries: [...pub.retries, { at: NOW, by: userId, resent: ids.length, succeeded: ids.length }] });
      setSelected([]);
      setRetrying(false);
      notifySuccess(`${ids.length} record${ids.length === 1 ? "" : "s"} resent`, `Only the eligible failures were sent again. ${pub.id} is now ${humanize(status).toLowerCase()}.`);
    }, 700);
  };

  const retrySelected = () => {
    const bad = pub.records.filter((r) => selected.includes(r.id) && !(r.status === "FAILED" && r.error?.retryable));
    if (bad.length) {
      setError({ errorClass: "BUSINESS_RULE", code: "RECORD_NOT_RETRY_ELIGIBLE", message: `${bad.map((r) => r.id).join(", ")} failed with a permanent error (${bad[0].error?.code ?? "not failed"}). Fix the cause at source, then republish. Transient failures only are retried.`, field: "recordIds", correlationId: pub.correlationId });
      return;
    }
    setError(null);
    resend(selected);
  };

  const approveRollback = () => {
    setApproving(true);
    window.setTimeout(() => {
      update({ ...pub, awaitingApprovalBy: undefined, status: "SUCCEEDED", finishedAt: NOW, ack: `${dest.name} applied the ${humanize(pub.kind).toLowerCase()}` });
      setApproving(false);
      notifySuccess(`${pub.id} approved and sent`, `${dest.name} received the corrected prices. ${pub.reverses} stays in the history.`);
    }, 600);
  };

  const pending = pub.status === "QUEUED" || pub.status === "IN_PROGRESS";
  const canRollback = operator && pub.kind === "PUBLICATION" && !pub.reversedBy && samples.length > 0;
  const selfRequested = pub.triggeredBy === userId;

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${pub.id} · ${pub.listName}`}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <span>{dest.name}</span>
          <StatusPill status={pub.awaitingApprovalBy ? "PENDING_APPROVAL" : pub.status} />
          <Tag tone={KIND_TONE[pub.kind]}>{humanize(pub.kind)}</Tag>
        </span>
      }
      footer={
        <>
          <Btn variant="subtle" onClick={onClose}>
            Close
          </Btn>
          {canRollback && (
            <Btn variant="outline" icon={RotateCcw} onClick={() => setRollbackOpen(true)}>
              Roll back…
            </Btn>
          )}
          {operator && eligible.length > 0 && (
            <Btn icon={RefreshCw} loading={retrying} onClick={() => resend(eligible.map((r) => r.id))}>
              Retry eligible failures ({eligible.length})
            </Btn>
          )}
          {pub.awaitingApprovalBy && operator && (
            <Btn icon={Send} loading={approving} disabled={selfRequested} title={selfRequested ? "You requested this reversal — another approver must send it (segregation of duties)." : undefined} onClick={approveRollback}>
              Approve and send
            </Btn>
          )}
        </>
      }
    >
      {pub.awaitingApprovalBy && (
        <InfoBanner tone="warning" title="Waiting for approval" className="">
          The original change went through the approval matrix, so this {humanize(pub.kind).toLowerCase()} does too. {userName(pub.awaitingApprovalBy)} approves before it is sent{selfRequested ? " — you requested it, so you can't approve it yourself." : "."}
        </InfoBanner>
      )}
      <section className="bg-card border border-border rounded-xl px-5">
        <DetailGrid
          items={[
            { label: "Status", value: <span className="inline-flex flex-wrap gap-2"><StatusPill status={pub.status} />{pub.failedCount > 0 && <Flag tone="danger">{pub.failedCount} failed</Flag>}{pub.rejectedCount > 0 && <Flag tone="danger">{pub.rejectedCount} rejected</Flag>}</span> },
            { label: "Records", value: pub.recordCount.toLocaleString("en-GB") },
            { label: "Mode", value: humanize(pub.mode) },
            { label: "Run date", value: pub.runDate },
            { label: "Started", value: pub.startedAt },
            { label: "Finished", value: pub.finishedAt ?? "—" },
            { label: "Requested by", value: userName(pub.triggeredBy) },
            { label: "Correlation ID", value: <span className="font-mono text-sm">{pub.correlationId}</span> },
            { label: "Destination acknowledgement", value: pub.ack ?? "None received", full: true },
            { label: "Idempotency key", value: <code className="text-xs">{pub.idempotencyKey}</code> },
            ...(pub.reverses || pub.reversedBy
              ? [
                  {
                    label: "Linked publications",
                    full: true,
                    value: (
                      <span className="flex flex-wrap gap-3">
                        {pub.reverses && (
                          <button type="button" className="hit text-brand font-medium hover:underline" onClick={() => onOpen(pub.reverses!)}>
                            Reverses {pub.reverses}
                          </button>
                        )}
                        {pub.reversedBy && (
                          <button type="button" className="hit text-brand font-medium hover:underline" onClick={() => onOpen(pub.reversedBy!)}>
                            Reversed by {pub.reversedBy}
                          </button>
                        )}
                      </span>
                    ),
                  },
                ]
              : []),
            ...(pub.reasonCode ? [{ label: "Reason", value: <Tag tone="brand">{humanize(pub.reasonCode)}</Tag> }, { label: "Comments", value: pub.comments ?? "—" }] : []),
          ]}
        />
      </section>

      {pub.retries.length > 0 && (
        <section>
          <h3 className="font-semibold mb-2">Retries</h3>
          <ul className="space-y-1 text-sm">
            {pub.retries.map((r, i) => (
              <li key={i} className="tabular-nums">
                {r.at} · {userName(r.by)} resent {r.resent}, {r.succeeded} succeeded
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
          <h3 className="font-semibold">Failed and rejected records ({problems.length})</h3>
          {operator && problems.length > 0 && (
            <Btn variant="subtle" size="sm" icon={RefreshCw} disabled={selected.length === 0 || retrying} onClick={retrySelected}>
              Retry selected ({selected.length})
            </Btn>
          )}
        </div>
        <ErrorBanner error={error} onClose={() => setError(null)} note="Nothing was resent." />
        {problems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No failures — every record was delivered.</p>
        ) : (
          <ul className="space-y-2">
            {problems.map((r) => (
              <li key={r.id} className="bg-card border border-border rounded-lg p-3 flex gap-3">
                {operator && (
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-[var(--color-brand)]"
                    aria-label={`Select ${r.id} for retry`}
                    checked={selected.includes(r.id)}
                    onChange={(e) => setSelected(e.target.checked ? [...selected, r.id] : selected.filter((x) => x !== r.id))}
                  />
                )}
                <div className="min-w-0 flex-1 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <RecordId>{r.id}</RecordId>
                    <span className="font-medium">{r.sku}</span>
                    <span className="text-muted-foreground tabular-nums">{r.price === null ? "no price" : money(r.price, r.currency)} · {r.qtyBand}</span>
                    <Flag tone={r.error?.retryable ? "warning" : "danger"}>{r.error?.retryable ? "Retry eligible" : "Not retry eligible"}</Flag>
                  </div>
                  <p className="mt-1">
                    <code className="text-xs">{r.error?.code}</code> <span className="text-xs text-muted-foreground">({r.error?.errorClass})</span> — {r.error?.message}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">Attempts: {r.attempts}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {samples.length > 0 && (
        <section>
          <h3 className="font-semibold mb-2">Delivered records (sample)</h3>
          <ul className="text-sm divide-y divide-border bg-card border border-border rounded-lg">
            {samples.map((r) => (
              <li key={r.id} className="px-3 py-2 flex flex-wrap justify-between gap-2">
                <span>
                  <RecordId>{r.id}</RecordId> {r.sku} · {humanize(r.changeType)}
                </span>
                <span className="tabular-nums">
                  {r.price === null ? "Previous version price" : `${money(r.price, r.currency)} / ${r.uom}`} · {r.validFrom} → {r.validTo ?? "open"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {rollbackOpen && (
        <RollbackModal
          pub={pub}
          dest={dest}
          pending={pending}
          userId={userId}
          onClose={() => setRollbackOpen(false)}
          onCreate={(created) => {
            save([created, ...all.map((p) => (p.id === pub.id ? { ...p, reversedBy: created.id } : p))]);
            setRollbackOpen(false);
            onOpen(created.id);
          }}
          nextId={nextPublicationId(all)}
        />
      )}
    </Drawer>
  );
}

function RollbackModal({ pub, dest, pending, userId, onClose, onCreate, nextId }: { pub: Publication; dest: Destination; pending: boolean; userId: string; onClose: () => void; onCreate: (p: Publication) => void; nextId: string }) {
  const mode = rollbackModeFor(dest, pending);
  const candidates = pub.records.filter((r) => r.status === "SENT" || r.status === "ACKNOWLEDGED");
  const [scope, setScope] = useState<"ALL" | "SELECTED">("ALL");
  const [picked, setPicked] = useState<string[]>([]);
  const [reasonCode, setReasonCode] = useState("");
  const [comments, setComments] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const approver = userId === "U-02" ? "U-09" : "U-02";

  const errs: Record<string, string> = {};
  if (!reasonCode) errs["rb-reason"] = "Select why the change is being reversed.";
  if (!comments.trim()) errs["rb-comments"] = "Explain what was wrong and what is being restored.";
  if (scope === "SELECTED" && picked.length === 0) errs["rb-scope"] = "Select at least one record, or reverse the whole publication.";
  const fe = (k: string) => (submitted ? errs[k] : undefined);
  const rollbackHintId = useId();
  const missingRollback = missingFields([
    ["Selected records", picked, scope === "SELECTED"],
    ["Reason code", reasonCode],
    ["Comments", comments],
  ]);

  const review = (e?: FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    if (!comments.trim()) setError({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "A rollback needs comments explaining the correction.", field: "comments" });
    else if (!reasonCode) setError({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "A rollback needs a reason code.", field: "reasonCode" });
    else setError(null);
    const first = Object.keys(errs)[0];
    if (first) return document.getElementById(first)?.focus();
    setConfirm(true);
  };

  const create = () => {
    setBusy(true);
    window.setTimeout(() => {
      const chosen = scope === "ALL" ? candidates : candidates.filter((r) => picked.includes(r.id));
      const count = scope === "ALL" ? pub.recordCount - pub.failedCount - pub.rejectedCount : chosen.length;
      const created: Publication = {
        id: nextId,
        kind: KIND_FOR_MODE[mode],
        destinationId: pub.destinationId,
        listId: pub.listId,
        listName: pub.listName,
        listVersion: pub.listVersion,
        mode: pub.mode,
        runDate: NOW.slice(0, 10),
        startedAt: NOW,
        status: "QUEUED",
        recordCount: count,
        failedCount: 0,
        rejectedCount: 0,
        triggeredBy: userId,
        idempotencyKey: `rb-${pub.id.toLowerCase()}-${Date.now().toString(36)}`,
        reverses: pub.id,
        reasonCode,
        comments: comments.trim(),
        awaitingApprovalBy: approver,
        retries: [],
        correlationId: pub.correlationId,
        records: chosen.map((r, i) => ({ ...r, id: `R-${String(i + 1).padStart(4, "0")}`, price: mode === "CANCEL_PENDING" ? r.price : null, changeType: "UPDATE", status: "SENT", attempts: 0 })),
      };
      onCreate(created);
      pushNotification({ event: "APPROVAL_ASSIGNED", recipientId: approver, at: NOW, title: `Approve ${created.id} · reversal of ${pub.id}`, body: `${humanize(mode)} on ${dest.name}, ${count} records. Reason: ${humanize(reasonCode)}.`, link: { to: "/pricing/publications" }, deliveries: [{ channel: "IN_APP", status: "DELIVERED", attempts: 1 }, { channel: "EMAIL", status: "DELIVERED", attempts: 1 }] });
      if (pub.triggeredBy !== userId)
        pushNotification({ event: "DECISION_MADE", recipientId: pub.triggeredBy, at: NOW, title: `${pub.id} is being reversed`, body: `${userName(userId)} requested a ${humanize(mode).toLowerCase()}: ${comments.trim()}`, link: { to: "/pricing/publications" }, deliveries: [{ channel: "IN_APP", status: "DELIVERED", attempts: 1 }, { channel: "EMAIL", status: "DELIVERED", attempts: 1 }] });
      setBusy(false);
      setConfirm(false);
      toast.success(`${created.id} created — waiting for approval`, {
        description: `${mode === "COMPENSATING_CHANGE" ? `${dest.name} can't roll back, so a compensating change restores the previous prices. ` : ""}${userName(approver)}, the requester and affected account owners were notified. ${pub.id} stays in the history.`,
      });
    }, 600);
  };

  return (
    <>
      <Modal
        open={!confirm}
        size="lg"
        onClose={onClose}
        dismissible={!comments && !reasonCode}
        title={`Roll back ${pub.id}`}
        subtitle={`${pub.listName} ${pub.listVersion} on ${dest.name}. Nothing is deleted — the original, the request and the correction all stay in the audit history.`}
        footer={
          <>
            <MissingHint id={rollbackHintId} missing={missingRollback} />
            <Btn variant="subtle" onClick={onClose}>
              Cancel
            </Btn>
            <Btn type="submit" form="rollback-form" icon={RotateCcw} disabled={missingRollback.length > 0} aria-describedby={missingRollback.length ? rollbackHintId : undefined}>
              Review rollback
            </Btn>
          </>
        }
      >
        <form id="rollback-form" onSubmit={review} noValidate className="space-y-4">
          <ErrorBanner error={error} onClose={() => setError(null)} />
          <InfoBanner tone={mode === "COMPENSATING_CHANGE" ? "warning" : "info"} title={`Mode: ${humanize(mode)}`} className="">
            {MODE_HINT[mode]}
            {mode === "COMPENSATING_CHANGE" && ` ${dest.name} doesn't support rollback, so the system applies a compensating change instead.`}
          </InfoBanner>
          <fieldset>
            <legend className="text-sm font-medium mb-2">Scope</legend>
            <div className="flex flex-wrap gap-4 text-sm">
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="rb-scope" checked={scope === "ALL"} onChange={() => setScope("ALL")} /> Whole publication ({(pub.recordCount - pub.failedCount - pub.rejectedCount).toLocaleString("en-GB")} delivered records)
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="radio" name="rb-scope" checked={scope === "SELECTED"} onChange={() => setScope("SELECTED")} /> Selected records
              </label>
            </div>
            {scope === "SELECTED" && (
              <div id="rb-scope" tabIndex={-1} className="mt-3 grid sm:grid-cols-2 gap-2">
                {candidates.map((r) => (
                  <label key={r.id} className="inline-flex items-center gap-2 text-sm border border-border rounded-lg px-3 h-10">
                    <input type="checkbox" checked={picked.includes(r.id)} onChange={(e) => setPicked(e.target.checked ? [...picked, r.id] : picked.filter((x) => x !== r.id))} />
                    {r.sku} · {r.price === null ? "—" : money(r.price, r.currency)}
                  </label>
                ))}
              </div>
            )}
            {fe("rb-scope") && <p className="text-xs text-destructive mt-1">{fe("rb-scope")}</p>}
          </fieldset>
          <Field label="Reason code" required error={fe("rb-reason")}>
            <select id="rb-reason" className={inputCls} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              <option value="">Select reason…</option>
              {REASON_CODES.map((r) => (
                <option key={r} value={r}>
                  {humanize(r)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Comments" required error={fe("rb-comments")} hint="Kept in the audit history and sent to the requester and account owners.">
            <textarea id="rb-comments" rows={3} className={`${inputCls} h-auto py-2`} value={comments} onChange={(e) => setComments(e.target.value)} placeholder="e.g. Widget keyed as 92.00; approved price is 100.00" />
          </Field>
          <p className="text-sm text-muted-foreground">
            Governance: the original change followed the approval matrix, so {userName(approver)} must approve this reversal before it is sent.
          </p>
        </form>
      </Modal>
      <ConfirmDialog
        open={confirm}
        title={`Roll back ${pub.id} on ${dest.name}?`}
        description={`${humanize(mode)} for ${scope === "ALL" ? "the whole publication" : `${picked.length} selected record${picked.length === 1 ? "" : "s"}`}. A linked publication is created and sent after approval. The original stays in the history.`}
        confirmLabel="Request rollback"
        loading={busy}
        onConfirm={create}
        onCancel={() => setConfirm(false)}
      />
    </>
  );
}

/* ================================================================== */
/* Destinations                                                       */
/* ================================================================== */

function DestinationsTab({ dests, setDests, operator }: { dests: Destination[]; setDests: (d: Destination[]) => void; operator: boolean }) {
  const [view, setView] = useState<Destination | null>(null);
  const [edit, setEdit] = useState<Destination | null>(null);
  return (
    <>
      <InfoBanner title="Authorized destinations only">
        Each destination is configured once and may only receive the price list scopes listed here. Credentials live in the secrets vault and are never shown after saving.
      </InfoBanner>
      <DataTable<Destination>
        caption="Publication destinations"
        rows={dests}
        rowKey={(d) => d.id}
        onRowClick={setView}
        selectedKey={view?.id ?? null}
        columns={[
          { key: "name", header: "Destination", className: "min-w-52", cell: (d) => <div><span className="font-medium">{d.name}</span><div className="text-xs text-muted-foreground font-mono break-all">{d.endpoint}</div></div> },
          { key: "type", header: "Type", cell: (d) => <Tag>{humanize(d.type)}</Tag> },
          { key: "modes", header: "Modes", cell: (d) => d.modes.map((m) => humanize(m)).join(", ") },
          { key: "scope", header: "Authorized scope", className: "min-w-48", cell: (d) => <span className="text-sm">{d.authorizedRegions.join(", ")}<div className="text-xs text-muted-foreground">{d.authorizedListTypes.length === LIST_TYPES.length ? "All list types" : d.authorizedListTypes.map((t) => humanize(t)).join(", ")}</div></span> },
          { key: "rb", header: "Rollback", cell: (d) => (d.rollback === "NONE" ? <Tag tone="warning">Compensating only</Tag> : <Tag tone="success">{humanize(d.rollback)}</Tag>) },
          { key: "batch", header: "Batch size", align: "right", cell: (d) => d.batchSize.toLocaleString("en-GB") },
          { key: "st", header: "Status", cell: (d) => <StatusPill status={d.status} /> },
        ]}
      />
      <Drawer
        open={!!view}
        onClose={() => setView(null)}
        size="md"
        title={view?.name ?? ""}
        subtitle={view && <span className="flex gap-2 items-center"><Tag>{humanize(view.type)}</Tag><StatusPill status={view.status} /></span>}
        footer={
          view && (
            <>
              <Btn variant="subtle" onClick={() => setView(null)}>
                Close
              </Btn>
              {operator && (
                <Btn icon={Pencil} onClick={() => (setEdit(view), setView(null))}>
                  Edit destination
                </Btn>
              )}
            </>
          )
        }
      >
        {view && (
          <section className="bg-card border border-border rounded-xl px-5">
            <DetailGrid
              items={[
                { label: "Endpoint", value: <span className="font-mono text-sm break-all">{view.endpoint}</span>, full: true },
                { label: "Authentication", value: humanize(view.auth) },
                { label: "Service account", value: <code className="text-sm">{view.serviceAccount}</code> },
                { label: "Secret", value: <span className="inline-flex items-center gap-1.5"><KeyRound className="size-4 text-muted-foreground" aria-hidden />Stored in vault · rotated {view.secretRotatedAt}</span>, full: true },
                { label: "Mapping", value: view.mapping, full: true },
                { label: "Batch size", value: view.batchSize.toLocaleString("en-GB") },
                { label: "Schedule", value: view.schedule },
                { label: "Modes", value: view.modes.map((m) => humanize(m)).join(", ") },
                { label: "Rollback capability", value: humanize(view.rollback) },
                { label: "Authorized regions", value: view.authorizedRegions.join(", ") },
                { label: "Authorized list types", value: view.authorizedListTypes.map((t) => humanize(t)).join(", ") },
              ]}
            />
          </section>
        )}
      </Drawer>
      {edit && (
        <DestinationForm
          dest={edit}
          onClose={() => setEdit(null)}
          onSave={(d) => {
            setDests(dests.map((x) => (x.id === d.id ? d : x)));
            const i = DESTINATIONS.findIndex((x) => x.id === d.id);
            if (i >= 0) DESTINATIONS[i] = d;
            setEdit(null);
            notifySuccess(`${d.name} saved`, "Change recorded in the audit log as a configuration change.");
          }}
        />
      )}
    </>
  );
}

function DestinationForm({ dest, onClose, onSave }: { dest: Destination; onClose: () => void; onSave: (d: Destination) => void }) {
  const [f, setF] = useState(dest);
  const [secret, setSecret] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(f) !== JSON.stringify(dest) || !!secret;
  const errs: Record<string, string> = {};
  if (!f.name.trim()) errs["d-name"] = "Enter a name people will recognise.";
  if (!/^(https|sftp|snowflake):\/\//.test(f.endpoint)) errs["d-endpoint"] = "Use an https://, sftp:// or snowflake:// address — plain http isn't allowed (TLS 1.2+).";
  if (!(f.batchSize >= 1 && f.batchSize <= 50_000)) errs["d-batch"] = "Enter a batch size from 1 to 50,000.";
  if (f.authorizedRegions.length === 0) errs["d-regions"] = "Authorize at least one region.";
  if (f.modes.length === 0) errs["d-modes"] = "Choose at least one mode.";
  const fe = (k: string) => (submitted ? errs[k] : undefined);
  const destHintId = useId();
  const missingDest = missingFields([
    ["Name", f.name],
    ["Endpoint", f.endpoint],
    ["Batch size", f.batchSize ? String(f.batchSize) : ""],
    ["Modes", f.modes],
    ["Authorized regions", f.authorizedRegions],
  ]);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setSubmitted(true);
    const first = Object.keys(errs)[0];
    if (first) return document.getElementById(first)?.focus();
    setBusy(true);
    window.setTimeout(() => onSave({ ...f, secretRotatedAt: secret ? NOW.slice(0, 10) : f.secretRotatedAt }), 400);
  };
  const toggle = <T extends string>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      dismissible={!dirty && !busy}
      title={`Edit ${dest.name}`}
      subtitle={dirty ? "Unsaved changes" : "Changes apply to the next publication."}
      footer={
        <>
          <MissingHint id={destHintId} missing={missingDest} />
          <Btn variant="subtle" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn type="submit" form="dest-form" loading={busy} disabled={missingDest.length > 0} aria-describedby={missingDest.length ? destHintId : undefined}>
            Save destination
          </Btn>
        </>
      }
    >
      <form id="dest-form" onSubmit={submit} noValidate className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Name" required error={fe("d-name")}>
          <input id="d-name" className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </Field>
        <Field label="Type">
          <select className={inputCls} value={f.type} disabled>
            {DESTINATION_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Endpoint" required error={fe("d-endpoint")} className="md:col-span-2">
          <input id="d-endpoint" className={inputCls} value={f.endpoint} onChange={(e) => setF({ ...f, endpoint: e.target.value })} />
        </Field>
        <Field label="Replace secret" hint="Write-only. Leave blank to keep the current secret." className="md:col-span-2">
          <input type="password" autoComplete="new-password" className={inputCls} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="••••••••" />
        </Field>
        <Field label="Mapping" className="md:col-span-2">
          <input className={inputCls} value={f.mapping} onChange={(e) => setF({ ...f, mapping: e.target.value })} />
        </Field>
        <Field label="Batch size" required error={fe("d-batch")}>
          <input id="d-batch" type="number" min={1} max={50000} className={inputCls} value={f.batchSize} onChange={(e) => setF({ ...f, batchSize: Number(e.target.value) })} />
        </Field>
        <Field label="Schedule">
          <input className={inputCls} value={f.schedule} onChange={(e) => setF({ ...f, schedule: e.target.value })} />
        </Field>
        <Field label="Rollback capability" hint="Destinations without rollback get compensating changes.">
          <select className={inputCls} value={f.rollback} onChange={(e) => setF({ ...f, rollback: e.target.value as Destination["rollback"] })}>
            {ROLLBACK_CAPABILITIES.map((r) => (
              <option key={r} value={r}>
                {r === "NONE" ? "None — compensating changes" : humanize(r)}
              </option>
            ))}
          </select>
        </Field>
        <fieldset id="d-modes" tabIndex={-1}>
          <legend className="text-sm font-medium mb-2">
            Modes<span className="text-destructive ml-0.5" aria-hidden>*</span>
          </legend>
          <div className="flex gap-4 text-sm">
            {(["BATCH", "EVENT"] as const).map((m) => (
              <label key={m} className="inline-flex items-center gap-2 h-10">
                <input type="checkbox" checked={f.modes.includes(m)} onChange={() => setF({ ...f, modes: toggle(f.modes, m) })} /> {humanize(m)}
              </label>
            ))}
          </div>
          {fe("d-modes") && <p className="text-xs text-destructive">{fe("d-modes")}</p>}
        </fieldset>
        <fieldset id="d-regions" tabIndex={-1} className="md:col-span-2">
          <legend className="text-sm font-medium mb-2">
            Authorized regions<span className="text-destructive ml-0.5" aria-hidden>*</span>
          </legend>
          <div className="flex flex-wrap gap-4 text-sm">
            {REGIONS.map((r) => (
              <label key={r} className="inline-flex items-center gap-2 h-10">
                <input type="checkbox" checked={f.authorizedRegions.includes(r)} onChange={() => setF({ ...f, authorizedRegions: toggle(f.authorizedRegions, r) })} /> {r}
              </label>
            ))}
          </div>
          {fe("d-regions") && <p className="text-xs text-destructive">{fe("d-regions")}</p>}
        </fieldset>
      </form>
    </Modal>
  );
}

/* ================================================================== */
/* Price read API (US-EX-01 AC#5)                                     */
/* ================================================================== */

function ReadApiTab() {
  const [sku, setSku] = useState("A-100");
  const [region, setRegion] = useState("UK");
  const [type, setType] = useState("BASE");
  const [asOf, setAsOf] = useState("2026-11-15");
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<{ status: number; body: unknown; req: string } | null>(null);
  const send = (e?: FormEvent, override?: string) => {
    e?.preventDefault();
    const date = override ?? asOf;
    if (override) setAsOf(override);
    setBusy(true);
    window.setTimeout(() => {
      const req = `GET /v1/prices/${sku}?region=${encodeURIComponent(region)}&listType=${type}&asOf=${date}`;
      const hit = priceAsOf(sku, region, type, date);
      setResp(
        hit
          ? { req, status: 200, body: { sku, asOf: date, price: hit.line.price, currency: hit.list.currency, uom: hit.line.uom, quantityBand: { min: hit.line.minQty, max: hit.line.maxQty ?? null }, validFrom: hit.from, validTo: hit.line.effectiveTo ?? hit.list.effectiveTo ?? null, priceList: hit.list.id, listVersion: hit.list.version, listStatus: hit.list.status } }
          : { req, status: 404, body: { errorCode: "PRICE_NOT_FOUND", errorClass: "BUSINESS_RULE", message: `No approved ${humanize(type).toLowerCase()} price for ${sku} in ${region} effective on ${date}.`, retryable: false, correlationId: corr(), timestamp: NOW } },
      );
      setBusy(false);
    }, 350);
  };
  return (
    <Card title="Price read API" subtitle="Synchronous lookup for downstream systems. Returns the approved price effective on the requested date — never a draft." actions={<Tag tone="info">Rate limit 600 req/min · headers X-RateLimit-*</Tag>}>
      <form onSubmit={send} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
        <Field label="Product">
          <select className={inputCls} value={sku} onChange={(e) => setSku(e.target.value)}>
            {PRODUCTS.map((p) => (
              <option key={p.sku} value={p.sku}>
                {p.sku} · {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Region">
          <select className={inputCls} value={region} onChange={(e) => setRegion(e.target.value)}>
            {REGIONS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
        </Field>
        <Field label="List type">
          <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
            {LIST_TYPES.map((t) => (
              <option key={t} value={t}>
                {humanize(t)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="As of">
          <input type="date" className={inputCls} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
        </Field>
        <Btn type="submit" icon={ServerCog} loading={busy}>
          Send request
        </Btn>
      </form>
      <div className="flex flex-wrap gap-2 mt-4">
        <span className="text-sm text-muted-foreground self-center">Try:</span>
        {["2026-11-15", "2026-12-01", "2027-01-05"].map((d) => (
          <Btn key={d} variant="subtle" size="sm" onClick={() => send(undefined, d)}>
            As of {d}
          </Btn>
        ))}
      </div>
      {resp && (
        <div className="mt-4" role="status">
          <p className="text-sm font-mono break-all">
            {resp.req} → <span className={resp.status === 200 ? "text-success" : "text-destructive"}>{resp.status}</span>
          </p>
          <pre className="mt-2 p-3 rounded-lg bg-muted text-xs overflow-x-auto overflow-y-hidden">{JSON.stringify(resp.body, null, 2)}</pre>
        </div>
      )}
    </Card>
  );
}

/* ================================================================== */
/* Idempotency (US-EX-03)                                             */
/* ================================================================== */

const ENDPOINTS = ["POST /v1/publications", "POST /v1/events/price-updated", "POST /v1/erp/orders", "POST /v1/bulk-jobs"];
const SCOPE_OF: Record<string, IdemKey["scope"]> = { "POST /v1/publications": "PUBLICATION", "POST /v1/events/price-updated": "EVENT", "POST /v1/erp/orders": "ERP_SYNC", "POST /v1/bulk-jobs": "BULK_JOB" };

function IdempotencyTab() {
  const [keys, setKeys] = useState<IdemKey[]>(IDEMPOTENCY_KEYS);
  const [endpoint, setEndpoint] = useState(ENDPOINTS[1]);
  const [key, setKey] = useState("evt-cost-MSG-1001");
  const [messageId, setMessageId] = useState("MSG-1001");
  const [body, setBody] = useState('{ "sku": "A-100", "price": 110.00, "list": "BL-001", "version": 4 }');
  const [busy, setBusy] = useState(false);
  const [resp, setResp] = useState<{ status: number; body: unknown; note: string } | null>(null);

  const err = (status: number, errorCode: string, errorClass: string, message: string, retryable: boolean, note: string) =>
    setResp({ status, note, body: { errorCode, errorClass, message, retryable, correlationId: corr(), timestamp: NOW } });

  const process = (k: string, b: string, msg: string, concurrent = false) => {
    if (!k.trim()) return err(422, "VALIDATION_REQUIRED", "VALIDATION", "The Idempotency-Key header is required on every state-changing request.", false, "Rejected — nothing processed.");
    const h = bodyHash(b);
    const existing = keys.find((x) => x.key === k.trim());
    if (existing) {
      if (existing.bodyHash !== h) return err(409, "IDEMPOTENCY_KEY_REUSED", "CONFLICT", `Key ${k} was first used with a different request body. Use a new key for a different request.`, false, "Rejected — the original result is unchanged.");
      if (existing.state === "IN_PROGRESS") return err(409, "REQUEST_IN_PROGRESS", "TRANSIENT_TECHNICAL", `A request with key ${k} is still being processed. Retry after it completes.`, true, "Not processed twice.");
      setKeys(keys.map((x) => (x.key === existing.key ? { ...x, replays: x.replays + 1, lastSeen: NOW } : x)));
      return setResp({ status: 200, note: "Already processed — original result returned, no duplicate active price created.", body: { alreadyProcessed: true, originalResult: existing.result, firstSeen: existing.firstSeen, messageId: existing.messageId ?? null } });
    }
    const dupMsg = msg && keys.find((x) => x.messageId === msg.trim() && x.state === "COMPLETED");
    if (dupMsg) {
      setKeys(keys.map((x) => (x.key === dupMsg.key ? { ...x, replays: x.replays + 1, lastSeen: NOW } : x)));
      return setResp({ status: 200, note: `Message ${msg} was already processed under key ${dupMsg.key}. No duplicate active price created.`, body: { alreadyProcessed: true, originalResult: dupMsg.result } });
    }
    const entry: IdemKey = { key: k.trim(), scope: SCOPE_OF[endpoint], endpoint, bodyHash: h, messageId: msg.trim() || undefined, state: concurrent ? "IN_PROGRESS" : "COMPLETED", firstSeen: NOW, lastSeen: NOW, replays: 0, result: concurrent ? "Processing…" : "201 · processed once", expiresAt: "2026-11-05 14:30" };
    setKeys((ks) => [entry, ...ks]);
    if (concurrent) {
      err(409, "REQUEST_IN_PROGRESS", "TRANSIENT_TECHNICAL", `Two requests arrived with key ${k}. The first is processing; this one was not processed.`, true, "Only one of the two concurrent requests was processed.");
      window.setTimeout(() => setKeys((ks) => ks.map((x) => (x.key === entry.key ? { ...x, state: "COMPLETED", result: "201 · processed once" } : x))), 1500);
      return;
    }
    setResp({ status: 201, note: "Processed once. Repeating this request returns the same result.", body: { processed: true, key: entry.key } });
  };

  const send = (e?: FormEvent) => {
    e?.preventDefault();
    setBusy(true);
    window.setTimeout(() => {
      process(key, body, messageId);
      setBusy(false);
    }, 350);
  };
  const preset = (k: string, m: string, b: string, ep = endpoint, concurrent = false) => {
    setEndpoint(ep);
    setKey(k);
    setMessageId(m);
    setBody(b);
    setBusy(true);
    window.setTimeout(() => {
      process(k, b, m, concurrent);
      setBusy(false);
    }, 350);
  };

  return (
    <div className="space-y-6">
      <InfoBanner title="Duplicate protection">
        Every state-changing request carries an Idempotency-Key, kept for {IDEMPOTENCY_RETENTION_DAYS} days. A uniqueness rule also guarantees one active price per product, customer scope, UoM, quantity band and start date. Applies to publication, ERP sync, event consumption and bulk jobs.
      </InfoBanner>
      <Card title="Request simulator" subtitle="Send a request the way an integration would and see how retries are handled.">
        <div className="flex flex-wrap gap-2 mb-4">
          <Btn variant="subtle" size="sm" onClick={() => preset("", "", body)}>Missing key</Btn>
          <Btn variant="subtle" size="sm" onClick={() => preset("evt-cost-MSG-1001", "MSG-1001", '{ "sku": "A-100", "price": 110.00, "list": "BL-001", "version": 4 }', ENDPOINTS[1])}>Replay MSG-1001</Btn>
          <Btn variant="subtle" size="sm" onClick={() => preset("evt-cost-MSG-1001", "MSG-1001", '{ "sku": "A-100", "price": 125.00, "list": "BL-001", "version": 4 }', ENDPOINTS[1])}>Same key, different body</Btn>
          <Btn variant="subtle" size="sm" onClick={() => preset(`K2-${Date.now().toString(36)}`, "", '{ "list": "BL-001", "version": 4, "destination": "DST-ERP" }', ENDPOINTS[0], true)}>Two at once</Btn>
          <Btn variant="subtle" size="sm" onClick={() => preset("q-10238-r1-5f22", "", "{}", ENDPOINTS[2])}>Key still in progress</Btn>
        </div>
        <form onSubmit={send} className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Endpoint">
            <select className={inputCls} value={endpoint} onChange={(e) => setEndpoint(e.target.value)}>
              {ENDPOINTS.map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Idempotency-Key header">
            <input className={inputCls} value={key} onChange={(e) => setKey(e.target.value)} placeholder="e.g. pub-bl001-v4-20261029" />
          </Field>
          <Field label="Message ID" hint="Optional — event consumers dedupe on this too.">
            <input className={inputCls} value={messageId} onChange={(e) => setMessageId(e.target.value)} placeholder="e.g. MSG-1001" />
          </Field>
          <Field label="Body (JSON)" className="md:col-span-3">
            <textarea rows={3} className={`${inputCls} h-auto py-2 font-mono text-xs`} value={body} onChange={(e) => setBody(e.target.value)} />
          </Field>
          <div className="md:col-span-3 flex justify-end">
            <Btn type="submit" icon={Send} loading={busy}>
              Send request
            </Btn>
          </div>
        </form>
        {resp && (
          <div className="mt-4" role="status">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={`font-mono font-semibold ${resp.status < 300 ? "text-success" : "text-destructive"}`}>HTTP {resp.status}</span>
              <span>{resp.note}</span>
            </div>
            <pre className="mt-2 p-3 rounded-lg bg-muted text-xs overflow-x-auto overflow-y-hidden">{JSON.stringify(resp.body, null, 2)}</pre>
          </div>
        )}
      </Card>
      <DataTable<IdemKey>
        caption="Idempotency keys, newest first"
        rows={[...keys].sort((a, b) => b.firstSeen.localeCompare(a.firstSeen))}
        rowKey={(k) => k.key}
        columns={[
          { key: "k", header: "Key", className: "min-w-52", cell: (k) => <div><code className="text-xs break-all">{k.key}</code><div className="text-xs text-muted-foreground">{k.endpoint}</div></div> },
          { key: "s", header: "Scope", cell: (k) => <Tag>{humanize(k.scope)}</Tag> },
          { key: "m", header: "Message", cell: (k) => k.messageId ?? "—" },
          { key: "st", header: "State", cell: (k) => <StatusPill status={k.state === "IN_PROGRESS" ? "RUNNING" : k.state} label={humanize(k.state)} /> },
          { key: "r", header: "Replays", align: "right", cell: (k) => k.replays },
          { key: "res", header: "Original result", className: "min-w-48", cell: (k) => k.result },
          { key: "exp", header: "Expires", cell: (k) => <span className="tabular-nums whitespace-nowrap">{k.expiresAt}</span> },
        ]}
      />
    </div>
  );
}
