import { createFileRoute } from "@tanstack/react-router";
import { useId, useMemo, useState, type FormEvent } from "react";
import { Archive, Download, FileJson, FilterX, Lock, ShieldCheck, ShieldX } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  DataTable,
  DetailGrid,
  Drawer,
  EmptyState,
  ErrorBanner,
  Field,
  FilterChip,
  FilterPills,
  Flag,
  InfoBanner,
  ListHeader,
  MissingHint,
  Modal,
  PricingLayout,
  RecordLink,
  Tag,
  humanize,
  inputCls,
  missingFields,
  notifySuccess,
  type ApiError,
  type Column,
} from "@/components/pricing/kit";
import { RequireAccess } from "@/components/pricing/access";
import {
  PRICE_LISTS,
  REASON_CODES,
  RULES,
  productBySku,
  type AuditEntry,
} from "@/lib/pricing/data";
import { TODAY, downloadCsv } from "@/lib/pricing/csv";
import { NOW, pushNotification } from "@/lib/pricing/deals";
import {
  ACTOR_TYPES,
  AUDIT_EVENT_TYPES,
  AUDIT_SETTINGS,
  MIN_RETENTION_YEARS,
  actorTypeOf,
  auditChainSource,
  buildChain,
  eventTypeOf,
  verifyChain,
  type ActorType,
  type AuditEventType,
  type ChainedEntry,
} from "@/lib/pricing/execution";
import { useSession } from "@/lib/pricing/session";

export const Route = createFileRoute("/pricing/audit-log")({
  head: () => ({ meta: [{ title: "Audit log · Rebate Ninja" }] }),
  component: () => (
    <RequireAccess module="AUDIT_LOGS">
      <Page />
    </RequireAccess>
  ),
});

/** Entry used by the tamper demo: its stored "after" value is changed outside the application. */
const TAMPER_ID = "AU-77001";

/** Links an audit entry's record to the screen where that record lives (detail page where one exists). */
function AuditRecord({ entry }: { entry: AuditEntry }) {
  const [head, tail] = entry.record.split(" · ");
  if (entry.entity === "Price List") {
    const list = PRICE_LISTS.find((l) => l.name === head);
    const product = tail ? productBySku(tail) : undefined;
    return (
      <span className="inline-flex flex-wrap items-center gap-1">
        {list ? (
          <RecordLink to="/pricing/price-lists/$id" params={{ id: list.id }}>
            {head}
          </RecordLink>
        ) : (
          <span className="font-medium">{head}</span>
        )}
        {tail && (
          <>
            <span className="text-muted-foreground" aria-hidden>
              ·
            </span>
            {product ? (
              <RecordLink to="/pricing/products/$id" params={{ id: product.productId }}>
                {tail}
              </RecordLink>
            ) : (
              <span>{tail}</span>
            )}
          </>
        )}
      </span>
    );
  }
  if (entry.entity === "Pricing Rule") {
    const rule =
      RULES.find((r) => r.name === entry.record && r.status === "ACTIVE") ??
      RULES.find((r) => r.name === entry.record);
    if (rule)
      return (
        <RecordLink to="/pricing/rules/$id" params={{ id: rule.id }}>
          {entry.record}
        </RecordLink>
      );
  }
  if (entry.entity === "Quote")
    return (
      <RecordLink to="/pricing/quotes/$id" params={{ id: entry.record }}>
        {entry.record}
      </RecordLink>
    );
  const listPage: Record<string, string> = {
    Guardrail: "/pricing/guardrails",
    "Bulk Job": "/pricing/bulk-update",
    Recommendation: "/pricing/recommendations",
    Approval: "/pricing/approvals",
    Publication: "/pricing/publications",
    Role: "/pricing/admin/users",
    Session: "/pricing/admin/users",
    Export: "/pricing/analytics/bi-export",
  };
  if (listPage[entry.entity])
    return <RecordLink to={listPage[entry.entity]}>{entry.record}</RecordLink>;
  return <span className="font-medium">{entry.record}</span>;
}

function Page() {
  const { user, role } = useSession();
  const [q, setQ] = useState("");
  const [entities, setEntities] = useState<string[]>([]);
  const [events, setEvents] = useState<AuditEventType[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [actor, setActor] = useState("all");
  const [actorType, setActorType] = useState<"all" | ActorType>("all");
  const [reason, setReason] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<ChainedEntry | null>(null);
  // Append-only source, oldest first. New events (exports, retention changes) are only ever appended.
  const [source, setSource] = useState<AuditEntry[]>(auditChainSource);
  const [tampered, setTampered] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [integrity, setIntegrity] = useState<{ ok: boolean; at: string; checked: number; brokenAt?: string }>({ ok: AUDIT_SETTINGS.lastVerifiedOk, at: AUDIT_SETTINGS.lastVerifiedAt, checked: 0 });
  const [retention, setRetention] = useState(AUDIT_SETTINGS.retentionYears);
  const [retentionOpen, setRetentionOpen] = useState(false);
  const isItAdmin = role === "IT_ADMIN";

  const chain = useMemo(() => buildChain(source), [source]);
  // What storage holds: the tamper demo edits one row's data directly, without recomputing its hash.
  const stored = useMemo(() => (tampered ? chain.map((e) => (e.id === TAMPER_ID ? { ...e, after: "105.00" } : e)) : chain), [chain, tampered]);

  const entityOptions = Array.from(new Set(stored.map((a) => a.entity))).sort();
  const actors = Array.from(new Set(stored.map((a) => a.actor))).sort();

  const rows = useMemo(
    () =>
      stored
        .filter((a) => {
          const t = q.toLowerCase();
          const day = a.at.slice(0, 10);
          return (
            (!t ||
              [a.id, a.record, a.actor, a.action, a.correlationId, a.reasonText ?? ""].some((v) =>
                v.toLowerCase().includes(t),
              )) &&
            (entities.length === 0 || entities.includes(a.entity)) &&
            (events.length === 0 || events.includes(eventTypeOf(a))) &&
            (actor === "all" || a.actor === actor) &&
            (actorType === "all" || actorTypeOf(a) === actorType) &&
            (reason === "all" || a.reasonCode === reason) &&
            (!from || day >= from) &&
            (!to || day <= to)
          );
        })
        .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)),
    [stored, q, entities, events, actor, actorType, reason, from, to],
  );

  const append = (e: Omit<AuditEntry, "id">) =>
    setSource((s) => [...s, { ...e, id: `AU-${Math.max(...s.map((x) => Number(x.id.slice(3)))) + 1}` }]);

  const verify = () => {
    setVerifying(true);
    window.setTimeout(() => {
      const r = verifyChain(stored);
      setIntegrity({ ok: r.ok, at: NOW, checked: r.checked, brokenAt: r.ok ? undefined : r.brokenAt.id });
      setVerifying(false);
      if (r.ok) notifySuccess("Audit log integrity verified", `${r.checked} entries checked — the hash chain is intact.`);
      else {
        toast.error("Integrity check failed", { description: `Entry ${r.brokenAt.id} no longer matches its hash. An alert was raised to the IT administrator.` });
        pushNotification({ event: "THRESHOLD_BREACH", recipientId: "U-14", at: NOW, title: "Audit log integrity check failed", body: `Hash chain broken at ${r.brokenAt.id} — stored data was altered outside the application. Investigate the storage layer.`, link: { to: "/pricing/audit-log" }, deliveries: [{ channel: "EMAIL", status: "DELIVERED", attempts: 1 }, { channel: "IN_APP", status: "DELIVERED", attempts: 1 }] });
      }
    }, 700);
  };

  const columns: Column<ChainedEntry>[] = [
    {
      key: "id",
      header: "Entry · time",
      cell: (a) => (
        <div className="whitespace-nowrap">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelected(a);
          }}
          className="hit text-brand-strong font-medium hover:underline whitespace-nowrap"
          aria-label={`View details of audit entry ${a.id}`}
        >
          {a.id}
        </button>
          <div className="text-xs text-muted-foreground tabular-nums">{a.at}</div>
        </div>
      ),
    },
    {
      key: "actor",
      header: "Actor",
      className: "whitespace-nowrap",
      cell: (a) => (
        <div>
          {a.actor}
          <div className="text-xs text-muted-foreground">{humanize(actorTypeOf(a))}</div>
        </div>
      ),
    },
    {
      key: "record",
      header: "Record",
      className: "min-w-52",
      cell: (a) => (
        <div>
          <AuditRecord entry={a} />
          <div className="text-xs text-muted-foreground">{humanize(a.entity)}</div>
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      cell: (a) => (
        <div className="whitespace-nowrap">
          {humanize(a.action)}
          <div className="text-xs text-muted-foreground">{humanize(eventTypeOf(a))}</div>
        </div>
      ),
    },
    {
      key: "change",
      header: "Before → after",
      align: "right",
      cell: (a) => (
        <span className="tabular-nums inline-block max-w-64">
          <span className="text-muted-foreground">{a.before ?? "—"}</span> → <span className="font-semibold">{a.after ?? "—"}</span>
        </span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      className: "min-w-40",
      cell: (a) =>
        a.reasonCode ? (
          <div>
            <span className="font-medium">{humanize(a.reasonCode)}</span>
            {a.reasonText && (
              <div className="text-sm text-muted-foreground mt-1">“{a.reasonText}”</div>
            )}
          </div>
        ) : (
          "—"
        ),
    },
  ];

  const exportRows = () =>
    rows.map((a) => ({
      id: a.id,
      timestamp: a.at,
      eventType: eventTypeOf(a),
      actorType: actorTypeOf(a),
      actor: a.actor,
      entity: a.entity,
      record: a.record,
      action: a.action,
      field: a.field ?? "",
      before: a.before ?? "",
      after: a.after ?? "",
      reasonCode: a.reasonCode ?? "",
      reasonText: a.reasonText ?? "",
      version: a.version ?? "",
      correlationId: a.correlationId,
      prevHash: a.prevHash,
      hash: a.hash,
    }));

  /** Every export is itself an audit event (US-AD-04). */
  const exportFile = (format: "CSV" | "JSON") => {
    const data = exportRows();
    if (format === "CSV") downloadCsv(`audit-log-${TODAY}.csv`, data);
    else {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-log-${TODAY}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
    const filters = [q && `search="${q}"`, entities.length && `entity=${entities.join("|")}`, events.length && `event=${events.join("|")}`, actor !== "all" && `actor=${actor}`, actorType !== "all" && `actorType=${actorType}`, reason !== "all" && `reason=${reason}`, (from || to) && `date=${from || "…"}→${to || "…"}`].filter(Boolean).join("; ");
    append({ at: NOW, actor: user.name, entity: "Export", record: "Audit log", action: "EXPORT", after: `${data.length} rows · ${format}`, reasonText: filters ? `Filters: ${filters}` : "No filters", correlationId: `c-exp-${Date.now().toString(36)}` });
    toast.success(`${data.length} audit ${data.length === 1 ? "entry" : "entries"} exported`, { description: "The export was recorded in the audit log as a data export event." });
  };

  const active = [
    entities.length > 0 && { label: `Record type: ${entities.map(humanize).join(", ")}`, clear: () => setEntities([]) },
    actorType !== "all" && { label: `Actor type: ${humanize(actorType)}`, clear: () => setActorType("all") },
    actor !== "all" && { label: `Actor: ${actor}`, clear: () => setActor("all") },
    reason !== "all" && { label: `Reason: ${humanize(reason)}`, clear: () => setReason("all") },
    (from || to) && {
      label: `Date: ${from || "…"} → ${to || "…"}`,
      clear: () => {
        setFrom("");
        setTo("");
      },
    },
  ].filter(Boolean) as Array<{ label: string; clear: () => void }>;
  const dateError =
    from && to && from > to
      ? "“From” is after “To”. Choose a start date on or before the end date."
      : undefined;
  const clearFilters = () => {
    setQ("");
    setEntities([]);
    setEvents([]);
    setActor("all");
    setActorType("all");
    setReason("all");
    setFrom("");
    setTo("");
  };
  const anyFilter = active.length > 0 || events.length > 0 || q !== "";

  return (
    <PricingLayout
      crumbs={[
        { label: "Pricing", to: "/pricing" },
        { label: "Administration" },
        { label: "Audit log" },
      ]}
    >
      <ListHeader
        eyebrow="Administration"
        title="Audit log"
        count={rows.length}
        noun="entry"
        nounPlural="entries"
        subtitle="Every price change, approval, override, export, login and publication — newest first."
        search={q}
        onSearch={setQ}
        filterCount={active.length}
        onFilter={() => setShowFilters((v) => !v)}
        filtersOpen={showFilters}
        actions={
          <>
            <Btn variant="outline" icon={FileJson} onClick={() => exportFile("JSON")} disabled={rows.length === 0} title={rows.length === 0 ? "No entries to export — clear filters first" : undefined}>
              Export JSON
            </Btn>
            <Btn variant="outline" icon={Download} onClick={() => exportFile("CSV")} disabled={rows.length === 0} title={rows.length === 0 ? "No entries to export — clear filters first" : undefined}>
              Export CSV
            </Btn>
          </>
        }
      />
      {integrity.ok ? (
        <InfoBanner
          title="Immutable, tamper-evident record"
          action={
            <span className="flex flex-wrap gap-2">
              <Btn variant="outline" size="sm" icon={ShieldCheck} loading={verifying} onClick={verify}>
                Verify integrity
              </Btn>
              <Btn variant="subtle" size="sm" icon={Archive} onClick={() => setRetentionOpen(true)} disabled={!isItAdmin} title={isItAdmin ? undefined : "Only IT administrators change retention"}>
                Retention: {retention} years
              </Btn>
              {isItAdmin && (
                <Btn variant="ghost" size="sm" onClick={() => setTampered(true)}>
                  Simulate tampering (demo)
                </Btn>
              )}
            </span>
          }
        >
          Nothing can be edited or deleted, and each entry is hash-chained to the one before. Last verified {integrity.at}
          {integrity.checked ? ` · ${integrity.checked} entries intact` : ""}.
        </InfoBanner>
      ) : (
        <div role="alert" className="flex flex-wrap items-start gap-3 rounded-lg border border-destructive/40 bg-danger-soft px-4 py-3 mb-4 text-base">
          <ShieldX className="size-5 text-destructive shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1 min-w-[200px]">
            <div className="font-semibold text-destructive">Integrity check failed — hash chain broken at {integrity.brokenAt}</div>
            <div className="">Stored data for that entry was changed outside the application. An alert was sent to the IT administrator. Entries after it can't be trusted until the storage is restored from backup.</div>
          </div>
          {tampered && (
            <Btn
              variant="subtle"
              size="sm"
              onClick={() => {
                setTampered(false);
                setIntegrity({ ok: true, at: NOW, checked: 0 });
              }}
            >
              Restore from backup (demo)
            </Btn>
          )}
        </div>
      )}
      {tampered && integrity.ok && (
        <InfoBanner tone="warning" title="Demo: stored data altered">
          {TAMPER_ID}'s stored “after” value was changed directly in the database. Select Verify integrity to detect it.
        </InfoBanner>
      )}

      <FilterPills<AuditEventType>
        label="Event"
        selected={events}
        onChange={setEvents}
        options={AUDIT_EVENT_TYPES.map((e) => ({ key: e, label: humanize(e), count: stored.filter((a) => eventTypeOf(a) === e).length }))}
      />

      {(showFilters || active.length > 0) && (
        <div
          className="bg-card border border-border rounded-xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          role="group"
          aria-label="Filters"
        >
          <Field label="Record type">
            <select className={inputCls} value={entities[0] ?? ""} onChange={(e) => setEntities(e.target.value ? [e.target.value] : [])}>
              <option value="">All record types</option>
              {entityOptions.map((e) => (
                <option key={e} value={e}>
                  {humanize(e)} ({stored.filter((a) => a.entity === e).length})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Actor type">
            <select className={inputCls} value={actorType} onChange={(e) => setActorType(e.target.value as "all" | ActorType)}>
              <option value="all">All actor types</option>
              {ACTOR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Actor">
            <select className={inputCls} value={actor} onChange={(e) => setActor(e.target.value)}>
              <option value="all">All actors</option>
              {actors.map((a) => (
                <option key={a}>{a}</option>
              ))}
            </select>
          </Field>
          <Field label="Reason code">
            <select className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="all">All reasons</option>
              {REASON_CODES.map((r) => (
                <option key={r} value={r}>
                  {humanize(r)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="From">
            <input
              type="date"
              className={inputCls}
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field label="To" error={dateError}>
            <input
              type="date"
              className={inputCls}
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </div>
      )}

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {active.map((f) => (
            <FilterChip key={f.label} label={f.label} onRemove={f.clear} />
          ))}
          <Btn variant="ghost" size="sm" icon={FilterX} onClick={clearFilters}>
            Clear filters
          </Btn>
        </div>
      )}

      <DataTable
        caption="Audit log entries, newest first"
        columns={columns}
        rows={rows}
        rowKey={(a) => a.id}
        onRowClick={setSelected}
        selectedKey={selected?.id ?? null}
        pageSize={25}
        empty={
          <EmptyState
            title={q ? `No audit entries match “${q}”` : "No audit entries match these filters"}
            action={
              anyFilter ? (
                <Btn variant="subtle" icon={FilterX} onClick={clearFilters}>
                  Clear filters
                </Btn>
              ) : undefined
            }
          >
            Widen the date range or remove a filter to see more changes.
          </EmptyState>
        }
      />

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        size="md"
        title={selected?.id ?? ""}
        subtitle={
          selected ? `${humanize(selected.entity)} · ${humanize(selected.action)}` : undefined
        }
        footer={
          <Btn variant="subtle" onClick={() => setSelected(null)}>
            Close
          </Btn>
        }
      >
        {selected && (
          <section className="bg-card border border-border rounded-xl px-5">
            <DetailGrid
              items={[
                { label: "Actor", value: selected.actor },
                { label: "Timestamp", value: selected.at },
                { label: "Entity", value: humanize(selected.entity) },
                { label: "Record", value: <AuditRecord entry={selected} /> },
                { label: "Action", value: humanize(selected.action) },
                { label: "Field", value: selected.field ? humanize(selected.field.replace(/([a-z])([A-Z])/g, "$1_$2")) : "—" },
                { label: "Before", value: selected.before ?? "—" },
                { label: "After", value: selected.after ?? "—" },
                {
                  label: "Reason code",
                  value: selected.reasonCode ? humanize(selected.reasonCode) : "—",
                },
                { label: "Reason text", value: selected.reasonText ?? "—" },
                { label: "Price list version", value: selected.version ?? "—" },
                {
                  label: "Correlation ID",
                  value: <span className="font-mono">{selected.correlationId}</span>,
                },
                { label: "Event type", value: humanize(eventTypeOf(selected)) },
                { label: "Actor type", value: humanize(actorTypeOf(selected)) },
                { label: "Hash", value: <span className="font-mono text-sm break-all">{selected.hash}</span> },
                { label: "Previous hash", value: <span className="font-mono text-sm break-all">{selected.prevHash}</span> },
              ]}
            />
          </section>
        )}
        {selected && (
          <p className="flex items-start gap-2 text-base text-muted-foreground">
            <Lock className="size-4 shrink-0 mt-1" aria-hidden />
            Read-only. Audit entries can't be edited or deleted through the UI or API — a correction is a new entry.
          </p>
        )}
        {selected && tampered && selected.id === TAMPER_ID && <Flag tone="danger">Stored data no longer matches this entry's hash</Flag>}
      </Drawer>

      {retentionOpen && (
        <RetentionModal
          current={retention}
          onClose={() => setRetentionOpen(false)}
          onSave={(years) => {
            append({ at: NOW, actor: user.name, entity: "System Settings", record: "Audit retention", action: "RETENTION_CHANGE", field: "retentionYears", before: String(retention), after: String(years), correlationId: `c-ret-${Date.now().toString(36)}` });
            setRetention(years);
            AUDIT_SETTINGS.retentionYears = years;
            setRetentionOpen(false);
            notifySuccess("Retention saved", `Audit data is now kept for ${years} years. The change is in the audit log.`);
          }}
        />
      )}
    </PricingLayout>
  );
}

/** Retention can only go up, and never below the 3-year minimum (US-AD-04 AC#4–5). */
function RetentionModal({ current, onClose, onSave }: { current: number; onClose: () => void; onSave: (years: number) => void }) {
  const [value, setValue] = useState(String(current));
  const [error, setError] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);
  const years = Number(value);
  const fieldError =
    value.trim() === "" || !Number.isInteger(years)
      ? "Enter a whole number of years."
      : years < MIN_RETENTION_YEARS
        ? `Enter ${MIN_RETENTION_YEARS} years or more — the minimum retention.`
        : years < current
          ? `Retention can only be raised. Enter ${current} or more.`
          : undefined;
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (years < MIN_RETENTION_YEARS) return setError({ errorClass: "VALIDATION", code: "RETENTION_BELOW_MINIMUM", message: `Audit data must be kept for at least ${MIN_RETENTION_YEARS} years.`, field: "retentionYears" });
    if (fieldError) return setError({ errorClass: "BUSINESS_RULE", code: "RETENTION_DECREASE_NOT_ALLOWED", message: fieldError, field: "retentionYears" });
    setBusy(true);
    window.setTimeout(() => onSave(years), 400);
  };
  const hintId = useId();
  const missing = missingFields([["Retention (years)", value]]);
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      dismissible={!busy}
      title="Audit retention"
      subtitle="Configurable upward only. Entries older than the retention period are archived, never edited."
      footer={
        <>
          <MissingHint id={hintId} missing={missing} />
          <Btn variant="subtle" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn
            type="submit"
            form="retention-form"
            loading={busy}
            disabled={missing.length > 0}
            aria-describedby={missing.length ? hintId : undefined}
          >
            Save retention
          </Btn>
        </>
      }
    >
      <form id="retention-form" onSubmit={submit} noValidate>
        <ErrorBanner error={error} onClose={() => setError(null)} note="Retention was not changed." />
        <Field label="Retention (years)" required error={value !== String(current) ? fieldError : undefined} hint={`Minimum ${MIN_RETENTION_YEARS}. Currently ${current}.`}>
          <input type="number" min={MIN_RETENTION_YEARS} step={1} inputMode="numeric" className={inputCls} value={value} onChange={(e) => (setValue(e.target.value), setError(null))} />
        </Field>
      </form>
    </Modal>
  );
}
