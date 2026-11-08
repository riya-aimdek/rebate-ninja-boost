import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Activity, Download, Network, Play, RefreshCw, RotateCcw, Search, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  DataTable,
  DetailGrid,
  Drawer,
  EmptyState,
  FilterPills,
  Flag,
  InfoBanner,
  KpiTile,
  ListHeader,
  PillTabs,
  PricingLayout,
  RecordId,
  SearchInput,
  StatusPill,
  Tag,
  Toggle,
  humanize,
  type Tone,
  TableSection,
} from "@/components/pricing/kit";
import { RequireAccess } from "@/components/pricing/access";
import { useSession } from "@/lib/pricing/session";
import { NOW, shortHash } from "@/lib/pricing/deals";
import {
  CORRELATION_TRACE,
  ERROR_CLASSES,
  EVENTS,
  INTEGRATIONS,
  INTEGRATION_STATUSES,
  MAX_EVENT_ATTEMPTS,
  type BusEvent,
  type Integration,
  type IntegrationStatus,
} from "@/lib/pricing/admin";

export const Route = createFileRoute("/pricing/admin/integrations")({
  head: () => ({ meta: [{ title: "Integration monitor · Rebate Ninja" }] }),
  component: () => (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Administration" }, { label: "Integration monitor" }]}>
      <RequireAccess roles={["IT_ADMIN", "PRICING_ADMIN"]}>
        <Page />
      </RequireAccess>
    </PricingLayout>
  ),
});

const VIEW_ONLY = "View only — running, replaying or switching integrations needs System Admin full access.";

type TabKey = "integrations" | "events" | "errors" | "api";
const STATUS_TONE: Record<IntegrationStatus, Tone> = { HEALTHY: "success", DEGRADED: "warning", FAILED: "danger", DISABLED: "neutral" };
const EVENT_TONE: Record<BusEvent["status"], Tone> = { PROCESSED: "success", RETRYING: "warning", DEAD_LETTER: "danger", DUPLICATE_IGNORED: "neutral" };
const iso = (s: string) => `${s.replace(" ", "T")}${s.length === 16 ? ":00" : ""}Z`;

function Page() {
  const editable = useSession().can("SYSTEM_ADMIN", "F");
  const [tab, setTab] = useState<TabKey>("integrations");
  const [rows, setRows] = useState<Integration[]>(INTEGRATIONS);
  const [events, setEvents] = useState<BusEvent[]>(EVENTS);
  const dlq = events.filter((e) => e.status === "DEAD_LETTER").length;

  return (
    <>
      <ListHeader
        title="Integration monitor"
        eyebrow="Administration"
        subtitle={
          <>
            Health of every ERP, CRM, BI, event-bus, Rebate Ninja and notification integration. Data as of <time dateTime={iso(NOW)}>{NOW}</time>.
          </>
        }
      />
      {!editable && (
        <InfoBanner tone="neutral" title="View only">
          You can monitor integrations, events and errors. Running, replaying or switching integrations needs System Admin full access.
        </InfoBanner>
      )}
      <div className="grid gap-2 grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(10rem,13rem))] mb-6">
        {INTEGRATION_STATUSES.map((s) => (
          <KpiTile key={s} label={humanize(s)} value={rows.filter((r) => r.status === s).length} tone={STATUS_TONE[s] === "neutral" ? "default" : STATUS_TONE[s]} />
        ))}
      </div>
      <PillTabs<TabKey>
        idPrefix="int"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "integrations", label: "Integrations", count: rows.length },
          { key: "events", label: "Events & dead letters", count: dlq || undefined },
          { key: "errors", label: "Error handling" },
          { key: "api", label: "API & rate limits" },
        ]}
      />
      <div role="tabpanel" id={`int-panel-${tab}`} aria-labelledby={`int-tab-${tab}`}>
        {tab === "integrations" && <IntegrationsTab rows={rows} setRows={setRows} editable={editable} />}
        {tab === "events" && <EventsTab events={events} setEvents={setEvents} editable={editable} />}
        {tab === "errors" && <ErrorsTab />}
        {tab === "api" && <ApiTab />}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function IntegrationsTab({ rows, setRows, editable }: { rows: Integration[]; setRows: (r: Integration[]) => void; editable: boolean }) {
  const [statuses, setStatuses] = useState<IntegrationStatus[]>([]);
  const [open, setOpen] = useState<Integration | null>(null);
  const [running, setRunning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [syncStatus, setSyncStatus] = useState<object | null>(null);
  const list = rows.filter((r) => statuses.length === 0 || statuses.includes(r.status));

  const update = (next: Integration) => {
    setRows(rows.map((r) => (r.id === next.id ? next : r)));
    setOpen(next);
  };
  const runNow = () => {
    if (!open) return;
    setRunning(true);
    window.setTimeout(() => {
      setRunning(false);
      update({ ...open, lastRun: NOW, status: open.status === "FAILED" ? "FAILED" : open.status, isLatest: open.status !== "FAILED", lastSyncAt: open.status === "FAILED" ? open.lastSyncAt : NOW });
      if (open.status === "FAILED") toast.error(`${open.name} run failed`, { description: open.lastError });
      else toast.success(`${open.name} ran`, { description: "Counts and status refreshed." });
    }, 900);
  };
  const checkSync = () => {
    if (!open) return;
    setChecking(true);
    window.setTimeout(() => {
      setChecking(false);
      setSyncStatus({ integration: open.id, version: open.version, lastSyncAt: iso(open.lastSyncAt), isLatest: open.isLatest, lastError: open.lastError ?? null });
    }, 400);
  };

  return (
    <>
      <FilterPills<IntegrationStatus>
        label="Status"
        selected={statuses}
        onChange={setStatuses}
        options={INTEGRATION_STATUSES.map((s) => ({ key: s, label: humanize(s), count: rows.filter((r) => r.status === s).length }))}
      />
      <DataTable<Integration>
        caption="Integrations"
        rows={list}
        rowKey={(r) => r.id}
        selectedKey={open?.id ?? null}
        onRowClick={(r) => (setOpen(r), setSyncStatus(null))}
        empty={<EmptyState icon={Network} title="No integrations match this status" action={<Btn variant="subtle" onClick={() => setStatuses([])}>Clear filters</Btn>} />}
        columns={[
          {
            key: "name",
            header: "Integration",
            className: "min-w-60",
            cell: (r) => (
              <div>
                <div className="font-medium text-brand-strong">{r.name}</div>
                <div className="text-xs text-muted-foreground">
                  {humanize(r.type)} · {humanize(r.mode)} · {humanize(r.direction)}
                </div>
              </div>
            ),
          },
          { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} tone={STATUS_TONE[r.status]} /> },
          { key: "run", header: "Last run", cell: (r) => <span className="tabular-nums whitespace-nowrap">{r.lastRun}</span> },
          { key: "ok", header: "Processed", align: "right", cell: (r) => <span className="tabular-nums">{r.processed.toLocaleString("en-GB")}</span> },
          { key: "fail", header: "Failed", align: "right", cell: (r) => <span className={`tabular-nums ${r.failed ? "text-destructive font-semibold" : ""}`}>{r.failed.toLocaleString("en-GB")}</span> },
          { key: "err", header: "Last error", className: "min-w-64", cell: (r) => (r.lastError ? <span className="text-sm">{r.lastError}</span> : <span className="text-muted-foreground">—</span>) },
        ]}
      />

      <Drawer
        open={!!open}
        onClose={() => setOpen(null)}
        size="md"
        title={open?.name ?? ""}
        subtitle={open && <span className="flex flex-wrap items-center gap-2"><RecordId>{open.id}</RecordId><StatusPill status={open.status} tone={STATUS_TONE[open.status]} /></span>}
        footer={
          open && (
            <>
              <Btn variant="subtle" onClick={() => setOpen(null)}>
                Close
              </Btn>
              {editable && (
                <Btn icon={Play} loading={running} disabled={open.status === "DISABLED"} onClick={runNow}>
                  Run now
                </Btn>
              )}
            </>
          )
        }
      >
        {open && (
          <>
            {open.lastError && (
              <InfoBanner tone={open.status === "FAILED" ? "danger" : "warning"} title="Last error" className="">
                {open.lastError}
              </InfoBanner>
            )}
            <section className="bg-card border border-border rounded-xl px-5">
              <DetailGrid
                items={[
                  { label: "Type", value: humanize(open.type) },
                  { label: "Mode", value: humanize(open.mode) },
                  { label: "Direction", value: humanize(open.direction) },
                  { label: "Service account", value: <span className="font-mono text-sm">{open.serviceAccount}</span> },
                  { label: "Last run", value: open.lastRun },
                  { label: "Processed / failed", value: `${open.processed.toLocaleString("en-GB")} / ${open.failed.toLocaleString("en-GB")}` },
                ]}
              />
            </section>
            <section className="bg-card border border-border rounded-xl p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h3 className="text-lg lg:text-xl leading-[1.2] font-semibold">Sync status endpoint</h3>
                <Btn variant="outline" size="sm" icon={RefreshCw} loading={checking} onClick={checkSync}>
                  Check sync status
                </Btn>
              </div>
              <p className="text-xs text-muted-foreground mt-1 font-mono">GET /api/v1/integrations/{open.id}/sync-status</p>
              {syncStatus && (
                <pre role="status" className="mt-3 bg-muted rounded-lg p-4 text-xs overflow-x-auto overflow-y-hidden">
                  {JSON.stringify(syncStatus, null, 2)}
                </pre>
              )}
            </section>
            <section className="bg-card border border-border rounded-xl p-5">
              {!editable ? (
                <p className="text-base">
                  <StatusPill status={open.status === "DISABLED" ? "DISABLED" : "ACTIVE"} label={open.status === "DISABLED" ? "Disabled" : "Enabled"} />{" "}
                  <span className="text-muted-foreground">{VIEW_ONLY}</span>
                </p>
              ) : (
              <Toggle
                label={open.status === "DISABLED" ? "Integration disabled" : "Integration enabled"}
                checked={open.status !== "DISABLED"}
                onChange={(v) => {
                  update({ ...open, status: v ? "HEALTHY" : "DISABLED" });
                  toast.success(`${open.name} ${v ? "enabled" : "disabled"}`);
                }}
              />
              )}
            </section>
          </>
        )}
      </Drawer>
    </>
  );
}

/* ------------------------------------------------------------------ */

function EventsTab({ events, setEvents, editable }: { events: BusEvent[]; setEvents: (e: BusEvent[]) => void; editable: boolean }) {
  const [statuses, setStatuses] = useState<BusEvent["status"][]>([]);
  const [replaying, setReplaying] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const list = events.filter((e) => statuses.length === 0 || statuses.includes(e.status));
  const dead = events.filter((e) => e.status === "DEAD_LETTER");

  const replay = (ev: BusEvent) => {
    setReplaying(ev.id);
    window.setTimeout(() => {
      setReplaying(null);
      setEvents(events.map((e) => (e.id === ev.id ? { ...e, status: "PROCESSED", attempts: e.attempts + 1, latencyMs: 730, error: undefined } : e)));
      toast.success(`${ev.id} replayed`, { description: "Processed once — consumers are idempotent, so a replay never duplicates data." });
    }, 800);
  };
  const simulate = () => {
    setSending(true);
    window.setTimeout(() => {
      setSending(false);
      const id = `EVT-${90122 + events.length - EVENTS.length}`;
      setEvents([{ id, at: NOW, topic: "cost.changed", style: "CHANGE_NOTIFICATION", entityType: "Cost", changeType: "UPDATE", key: "EW-3100/UK01/LANDED", status: "PROCESSED", attempts: 1, latencyMs: 580, signature: "HMAC verified", correlationId: `c-${shortHash(id).slice(0, 6)}` }, ...events]);
      toast.success("Cost-change event processed in 0.6 s", { description: "Repricing rules for EW-3100 were evaluated." });
    }, 600);
  };

  return (
    <>
      <InfoBanner title="How events are delivered">
        A <b>change notification</b> carries only the key, so the record is fetched; a <b>data message</b> carries the whole record. Every event is
        delivered at least once, and one that fails {MAX_EVENT_ATTEMPTS} times moves to the dead-letter queue for replay.
      </InfoBanner>

      <Card
        title="Dead-letter queue"
        className="mb-6"
        padded={false}
      >
        {dead.length === 0 ? (
          <EmptyState icon={Activity} title="No dead letters">Events that fail {MAX_EVENT_ATTEMPTS} times will appear here.</EmptyState>
        ) : (
          <ul className="divide-y divide-border">
            {dead.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div className="text-sm min-w-0">
                  <div className="font-medium">
                    <RecordId>{e.id}</RecordId> · {e.topic} · {e.key}
                  </div>
                  <div className="text-muted-foreground mt-0.5">
                    {e.attempts} attempts · {e.error} · correlation <span className="font-mono">{e.correlationId}</span>
                  </div>
                </div>
                {editable ? (
                  <Btn variant="outline" size="sm" icon={RotateCcw} loading={replaying === e.id} onClick={() => replay(e)}>
                    Replay
                  </Btn>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterPills<BusEvent["status"]>
          label="Status"
          selected={statuses}
          onChange={setStatuses}
          options={(["PROCESSED", "RETRYING", "DEAD_LETTER", "DUPLICATE_IGNORED"] as const).map((s) => ({ key: s, label: humanize(s), count: events.filter((e) => e.status === s).length }))}
        />
        {editable && (
          <Btn variant="outline" icon={Zap} loading={sending} onClick={simulate} className="mb-4">
            Send test cost-change event
          </Btn>
        )}
      </div>
      <DataTable<BusEvent>
        caption="Recent events"
        rows={list}
        rowKey={(e) => e.id}
        pageSize={25}
        empty={<EmptyState title="No events match this status" action={<Btn variant="subtle" onClick={() => setStatuses([])}>Clear filters</Btn>} />}
        columns={[
          { key: "id", header: "Event", cell: (e) => <RecordId>{e.id}</RecordId> },
          { key: "at", header: "Received", cell: (e) => <span className="tabular-nums whitespace-nowrap">{e.at}</span> },
          { key: "topic", header: "Topic · key", className: "min-w-56", cell: (e) => <span><span className="font-mono text-xs">{e.topic}</span><span className="block text-xs text-muted-foreground">{humanize(e.changeType)} {e.entityType} · {e.key}</span></span> },
          { key: "style", header: "Style", className: "whitespace-nowrap", cell: (e) => humanize(e.style) },
          { key: "sig", header: "Authenticity", cell: (e) => <span className="whitespace-nowrap text-sm">{e.signature}</span> },
          { key: "lat", header: "Latency", align: "right", cell: (e) => (e.latencyMs ? <span className="tabular-nums">{(e.latencyMs / 1000).toFixed(1)} s</span> : <span className="text-muted-foreground">—</span>) },
          { key: "att", header: "Attempts", align: "right", cell: (e) => <span className="tabular-nums">{e.attempts}</span> },
          { key: "st", header: "Status", cell: (e) => <StatusPill status={e.status} tone={EVENT_TONE[e.status]} /> },
        ]}
      />
    </>
  );
}

/* ------------------------------------------------------------------ */

function ErrorsTab() {
  const [cid, setCid] = useState("c-2d9f40");
  const [exception, setException] = useState(false);
  const trace = useMemo(() => (cid.trim() === "c-2d9f40" ? CORRELATION_TRACE : []), [cid]);
  const timeoutResponse = {
    errorCode: "ERP_TIMEOUT",
    errorClass: "TRANSIENT_TECHNICAL",
    message: "SAP did not answer within 30 seconds. The order sync will retry automatically with back-off.",
    retryable: true,
    correlationId: "c-2d9f40",
    timestamp: "2026-10-29T13:58:11Z",
  };
  const internal = {
    errorCode: "INTERNAL_ERROR",
    errorClass: "PERMANENT_TECHNICAL",
    message: "Something went wrong on our side and nothing was changed. Quote the correlation ID to support.",
    retryable: false,
    correlationId: "c-8b33e0",
    timestamp: `${NOW.replace(" ", "T")}:00Z`,
  };
  return (
    <div className="grid gap-6">
      <TableSection title="Error classes" subtitle="Every API, job and integration returns one of six classes, so callers know whether to retry.">
        <DataTable
          caption="Error classes"
          rows={ERROR_CLASSES}
          rowKey={(r) => r.cls}
          numbered={false}
          columns={[
            { key: "c", header: "Class", className: "whitespace-nowrap", cell: (r) => <span><span className="font-medium">{humanize(r.cls)}</span><span className="block font-mono text-xs text-muted-foreground">{r.cls}</span></span> },
            { key: "r", header: "Retry?", cell: (r) => <Flag tone={r.retryable === true ? "success" : r.retryable === "depends" ? "info" : "neutral"}>{r.retry}</Flag> },
            { key: "e", header: "Example", cell: (r) => <span className="font-mono text-xs">{r.example}</span> },
          ]}
        />
      </TableSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Standard error response" subtitle="Example: the ERP times out during a quote sync.">
          <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto overflow-y-hidden">{JSON.stringify(timeoutResponse, null, 2)}</pre>
          <p className="text-base mt-3">
            <Flag tone="success">Retryable</Flag> <span className="text-muted-foreground">Transient technical errors retry automatically; validation, authorisation and business-rule errors never do.</span>
          </p>
        </Card>
        <Card
          title="Internal exception"
          subtitle="What a caller sees when the platform itself fails."
          actions={
            <Btn variant="outline" size="sm" onClick={() => setException(true)}>
              Trigger test exception
            </Btn>
          }
        >
          {exception ? (
            <>
              <pre role="status" className="bg-muted rounded-lg p-4 text-xs overflow-x-auto overflow-y-hidden">{JSON.stringify(internal, null, 2)}</pre>
              <ul className="mt-3 space-y-1 text-base">
                <li><Flag tone="success">No stack trace</Flag></li>
                <li><Flag tone="success">No credentials or connection strings</Flag></li>
                <li className="text-muted-foreground">The full exception is written only to the restricted platform log under correlation ID c-8b33e0.</li>
              </ul>
            </>
          ) : (
            <p className="text-base text-muted-foreground">Trigger a test exception to see the sanitised response.</p>
          )}
        </Card>
      </div>

      <Card title="Trace a correlation ID" subtitle="The same ID appears in the platform and integration logs, so one search follows a request end to end.">
        <div className="max-w-sm mb-4">
          <SearchInput value={cid} onChange={setCid} label="Correlation ID" placeholder="e.g. c-2d9f40" />
        </div>
        {trace.length === 0 ? (
          <EmptyState icon={Search} title={cid ? `No log lines for ${cid}` : "Enter a correlation ID"}>Try c-2d9f40 (the ERP timeout on Q-10238).</EmptyState>
        ) : (
          <ol className="relative border-l border-border ml-2 space-y-4">
            {trace.map((t) => (
              <li key={t.at} className="ml-4">
                <span className="absolute -left-1.5 mt-1.5 size-3 rounded-full bg-brand" aria-hidden />
                <div className="text-xs text-muted-foreground tabular-nums">
                  {t.at} · <Tag tone={t.level === "WARN" ? "warning" : "neutral"}>{t.system}</Tag>
                </div>
                <p className="text-sm mt-1">{t.message}</p>
              </li>
            ))}
          </ol>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ */

const RATE_LIMITS = [
  { api: "Price calculation · POST /price:calculate", limit: "600 requests / minute per client", burst: "100" },
  { api: "Master data import · POST /*:batch", limit: "60 requests / minute, 10,000 records each", burst: "10" },
  { api: "Datasets · GET /datasets/*", limit: "120 requests / hour per service account", burst: "20" },
  { api: "Everything else", limit: "1,200 requests / minute per tenant", burst: "200" },
];

function ApiTab() {
  const download = () => {
    const spec = { openapi: "3.1.0", info: { title: "Rebate Ninja Pricing API", version: "1.0.0" }, servers: [{ url: "https://api.rebateninja.example/api/v1" }], paths: { "/price:calculate": { post: { summary: "Real-time price lookup" } }, "/integrations/{id}/sync-status": { get: { summary: "Sync status" } } } };
    const url = URL.createObjectURL(new Blob([JSON.stringify(spec, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "rebate-ninja-pricing-openapi.json";
    a.click();
    URL.revokeObjectURL(url);
    toast.success("OpenAPI spec downloaded");
  };
  return (
    <div className="grid gap-6 lg:grid-cols-[3fr_2fr] items-start">
      <TableSection title="Rate limits" subtitle="Documented per API; current usage is returned in response headers." actions={<Btn variant="outline" size="sm" icon={Download} onClick={download}>Download OpenAPI spec</Btn>}>
        <DataTable
          caption="API rate limits"
          rows={RATE_LIMITS}
          rowKey={(r) => r.api}
          numbered={false}
          columns={[
            { key: "a", header: "API", className: "min-w-56", cell: (r) => r.api },
            { key: "l", header: "Limit", cell: (r) => r.limit },
            { key: "b", header: "Burst", align: "right", cell: (r) => <span className="tabular-nums">{r.burst}</span> },
          ]}
        />
      </TableSection>
      <Card title="Response headers">
        <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto overflow-y-hidden">{`X-RateLimit-Limit: 600
X-RateLimit-Remaining: 587
X-RateLimit-Reset: 1793284260
X-Correlation-Id: c-91f0aa

HTTP 429 → errorClass TRANSIENT_TECHNICAL,
retryable: true, Retry-After: 12`}</pre>
      </Card>
    </div>
  );
}
