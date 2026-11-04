import { createFileRoute } from "@tanstack/react-router";
import { useId, useMemo, useState } from "react";
import {
  Check,
  Clock,
  Database,
  Download,
  EyeOff,
  FilterX,
  Lock,
  Package,
  RefreshCw,
  RotateCcw,
  Users,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  ConfirmDialog,
  DataAsOf,
  DataTable,
  DetailGrid,
  Drawer,
  EmptyState,
  ErrorBanner,
  Field,
  FilterChip,
  FilterPills,
  ListHeader,
  MissingHint,
  PricingLayout,
  RecordLink,
  StatusPill,
  Tag,
  humanize,
  inputCls,
  missingFields,
  notifyUndo,
  toneCls,
  type ApiError,
  type Column,
  type Tone,
} from "@/components/pricing/kit";
import {
  CUSTOMERS,
  DQ_LOG,
  DQ_STATUSES,
  PRODUCTS,
  SYNC_JOBS,
  type DqEntry,
  type DqStatus,
} from "@/lib/pricing/data";
import { TODAY, downloadCsv } from "@/lib/pricing/csv";

export const Route = createFileRoute("/pricing/data-quality")({
  // `?status=OPEN` lets the pricing dashboard open the list its "open issues" count summarises.
  validateSearch: (s: Record<string, unknown>): { status?: DqStatus } => ({
    status: DQ_STATUSES.includes(s.status as DqStatus) ? (s.status as DqStatus) : undefined,
  }),
  head: () => ({ meta: [{ title: "Data quality log · Rebate Ninja" }] }),
  component: Page,
});

const JOB_TONE: Record<string, Tone> = {
  SUCCEEDED: "success",
  PARTIAL_SUCCESS: "warning",
  FAILED: "danger",
  RUNNING: "info",
  QUEUED: "info",
};
const ENTITY_ICON: Record<string, LucideIcon> = { Product: Package, Customer: Users };

const ENTITIES = ["Product", "Customer", "Cost", "Competitor Price"] as const;

/** Allowed next statuses — OPEN → ACKNOWLEDGED → FIXED_AT_SOURCE → REPROCESSED, or IGNORED. */
const NEXT: Record<DqStatus, DqStatus[]> = {
  OPEN: ["ACKNOWLEDGED", "IGNORED"],
  ACKNOWLEDGED: ["FIXED_AT_SOURCE", "IGNORED"],
  FIXED_AT_SOURCE: ["IGNORED"],
  REPROCESSED: [],
  IGNORED: [],
};

/** Where the rejected record lives in the app: its detail page if it already exists, else the list it would land in. */
function SourceRecordLink({ d }: { d: DqEntry }) {
  if (d.entity === "Product") {
    const p = PRODUCTS.find((x) => x.sourceId === d.sourceId);
    return p ? (
      <RecordLink to="/pricing/products/$id" params={{ id: p.productId }}>
        {p.name} ({p.sku})
      </RecordLink>
    ) : (
      <RecordLink to="/pricing/products">Not yet in Products — open list</RecordLink>
    );
  }
  if (d.entity === "Customer") {
    const c = CUSTOMERS.find((x) => x.sourceId === d.sourceId);
    return c ? (
      <RecordLink to="/pricing/customers/$id" params={{ id: c.id }}>
        {c.name}
      </RecordLink>
    ) : (
      <RecordLink to="/pricing/customers">Not yet in Customers — open list</RecordLink>
    );
  }
  if (d.entity === "Cost") return <RecordLink to="/pricing/costs">Open cost data</RecordLink>;
  return <RecordLink to="/pricing/competitive">Open competitive intelligence</RecordLink>;
}

function Page() {
  const [log, setLog] = useState<DqEntry[]>(DQ_LOG);
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("all");
  const initialStatus = Route.useSearch().status;
  const [statuses, setStatuses] = useState<DqStatus[]>(initialStatus ? [initialStatus] : []);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [bulkIgnore, setBulkIgnore] = useState(false);
  const [bulkNote, setBulkNote] = useState("");
  const [bulkNoteErr, setBulkNoteErr] = useState<string | undefined>();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshedAt, setRefreshedAt] = useState<Date | undefined>(undefined);
  const ignoreHintId = useId();
  const [showFilters, setShowFilters] = useState(false);

  const rows = useMemo(
    () =>
      log.filter((d) => {
        const day = d.lastSeen.slice(0, 10);
        const t = q.toLowerCase();
        return (
          (!t || [d.sourceId, d.code, d.message].some((v) => v.toLowerCase().includes(t))) &&
          (entity === "all" || d.entity === entity) &&
          (statuses.length === 0 || statuses.includes(d.status)) &&
          (!from || day >= from) &&
          (!to || day <= to)
        );
      }),
    [log, q, entity, statuses, from, to],
  );

  const selected = log.find((d) => d.id === selectedId) ?? null;

  const update = (id: string, patch: Partial<DqEntry>) =>
    setLog((cur) => cur.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  /** Restore entries to a snapshot (used by every Undo toast on this page). */
  const restore = (snap: DqEntry[]) =>
    setLog((cur) => cur.map((d) => snap.find((s) => s.id === d.id) ?? d));

  const transition = (target: DqStatus) => {
    if (!selected) return;
    if (target === "IGNORED" && !note.trim()) {
      setError({
        errorClass: "VALIDATION",
        code: "VALIDATION_REQUIRED",
        message: "Add a resolution note explaining why this record can be ignored.",
        field: "resolutionNote",
      });
      // Land keyboard and screen-reader users on the field to fix.
      document.getElementById("dq-note")?.focus();
      return;
    }
    const snap = [selected];
    update(selected.id, { status: target, resolutionNote: note.trim() || selected.resolutionNote });
    setError(null);
    notifyUndo(`${selected.id} marked ${humanize(target).toLowerCase()}`, () => restore(snap));
  };

  const eligible = (d: DqEntry) => d.status === "OPEN" || d.status === "ACKNOWLEDGED";
  const checkedRows = log.filter((d) => checked.has(d.id));
  const canAck = checkedRows.filter((d) => NEXT[d.status].includes("ACKNOWLEDGED"));
  const canIgnore = checkedRows.filter((d) => NEXT[d.status].includes("IGNORED"));
  const visibleEligible = rows.filter(eligible);
  const allChecked = visibleEligible.length > 0 && visibleEligible.every((d) => checked.has(d.id));

  const bulkAcknowledge = () => {
    const snap = [...canAck];
    setLog((cur) =>
      cur.map((d) => (canAck.some((x) => x.id === d.id) ? { ...d, status: "ACKNOWLEDGED" } : d)),
    );
    setChecked(new Set());
    notifyUndo(`${snap.length} ${snap.length === 1 ? "record" : "records"} acknowledged`, () =>
      restore(snap),
    );
  };

  const confirmBulkIgnore = () => {
    if (!bulkNote.trim()) {
      setBulkNoteErr("Add a resolution note — it is stored on every ignored record.");
      return;
    }
    const snap = [...canIgnore];
    setLog((cur) =>
      cur.map((d) =>
        canIgnore.some((x) => x.id === d.id)
          ? { ...d, status: "IGNORED", resolutionNote: bulkNote.trim() }
          : d,
      ),
    );
    setChecked(new Set());
    setBulkIgnore(false);
    setBulkNote("");
    setBulkNoteErr(undefined);
    notifyUndo(`${snap.length} ${snap.length === 1 ? "record" : "records"} ignored`, () =>
      restore(snap),
    );
  };

  const refresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setRefreshedAt(new Date());
      toast.success("Data quality log refreshed");
    }, 600);
  };

  const clearFilters = () => {
    setQ("");
    setEntity("all");
    setStatuses([]);
    setFrom("");
    setTo("");
  };
  const dateError =
    from && to && from > to
      ? "“From” is after “To”. Choose a start date on or before the end date."
      : undefined;

  const reprocess = () => {
    if (!selected || selected.status !== "FIXED_AT_SOURCE" || reprocessing) return;
    setReprocessing(true);
    const id = selected.id;
    setTimeout(() => {
      update(id, {
        status: "REPROCESSED",
        resolutionNote: note.trim() || "Re-submitted stored payload — accepted",
        lastSeen: `${TODAY} 14:22`,
      });
      setReprocessing(false);
      toast.success(`${id} reprocessed`, {
        description: "Stored payload re-submitted once and accepted.",
      });
    }, 900);
  };

  const exportCsv = () => {
    downloadCsv(
      `data-quality-log-${TODAY}.csv`,
      rows.map((d) => ({
        id: d.id,
        entity: d.entity,
        sourceSystem: d.sourceSystem,
        sourceId: d.sourceId,
        errorCode: d.code,
        errorMessage: d.message,
        firstSeen: d.firstSeen,
        lastSeen: d.lastSeen,
        occurrenceCount: d.occurrenceCount,
        status: d.status,
        owner: d.owner,
        resolutionNote: d.resolutionNote ?? "",
      })),
    );
    toast.success(`${rows.length} ${rows.length === 1 ? "entry" : "entries"} exported`);
  };

  const openEntry = (d: DqEntry) => {
    setSelectedId(d.id);
    setNote(d.resolutionNote ?? "");
    setError(null);
  };

  const columns: Column<DqEntry>[] = [
    {
      key: "sel",
      header: (
        <input
          type="checkbox"
          aria-label="Select all open or acknowledged records shown"
          checked={allChecked}
          disabled={visibleEligible.length === 0}
          onChange={(e) =>
            setChecked((s) => {
              const n = new Set(s);
              visibleEligible.forEach((d) => (e.target.checked ? n.add(d.id) : n.delete(d.id)));
              return n;
            })
          }
          className="size-4 accent-[var(--brand)]"
        />
      ),
      cell: (d) => (
        <input
          type="checkbox"
          aria-label={`Select ${d.id}`}
          disabled={!eligible(d)}
          title={eligible(d) ? undefined : "Only open or acknowledged records can be bulk updated"}
          checked={checked.has(d.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            setChecked((s) => {
              const n = new Set(s);
              if (e.target.checked) n.add(d.id);
              else n.delete(d.id);
              return n;
            })
          }
          className="size-4 accent-[var(--brand)]"
        />
      ),
    },
    {
      key: "id",
      header: "Entry",
      cell: (d) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            openEntry(d);
          }}
          className="hit text-brand font-medium hover:underline whitespace-nowrap"
          aria-label={`Review data quality entry ${d.id}: ${d.code}`}
        >
          {d.id}
        </button>
      ),
    },
    {
      key: "entity",
      header: "Entity",
      className: "whitespace-nowrap",
      cell: (d) => <Tag>{d.entity}</Tag>,
    },
    {
      key: "src",
      header: "Source ID",
      cell: (d) => (
        <div className="whitespace-nowrap">
          <div className="font-mono text-xs">{d.sourceId}</div>
          <div className="text-xs text-muted-foreground">{d.sourceSystem}</div>
        </div>
      ),
    },
    {
      key: "err",
      header: "Error",
      className: "min-w-[180px] max-w-[280px]",
      cell: (d) => (
        <div>
          <div className="font-mono text-xs font-semibold">{d.code}</div>
          <div className="line-clamp-2 mt-0.5 text-muted-foreground">{d.message}</div>
        </div>
      ),
    },
    {
      key: "ts",
      header: "Last seen",
      cell: (d) => <span className="whitespace-nowrap tabular-nums">{d.lastSeen}</span>,
    },
    {
      key: "occ",
      header: "Occurrences",
      align: "right",
      cell: (d) => <span className="tabular-nums">{d.occurrenceCount}</span>,
    },
    { key: "st", header: "Status", cell: (d) => <StatusPill status={d.status} /> },
    {
      key: "own",
      header: "Owner",
      className: "whitespace-nowrap",
      cell: (d) => d.owner,
    },
  ];

  // Status has its own pill row, so the filter button counts only the panel's filters.
  const filterCount = (entity !== "all" ? 1 : 0) + (from || to ? 1 : 0);
  const anyFilter = filterCount > 0 || statuses.length > 0 || q !== "";

  const countOf = (s: DqStatus) => log.filter((d) => d.status === s).length;

  return (
    <PricingLayout
      crumbs={[
        { label: "Pricing", to: "/pricing" },
        { label: "Administration" },
        { label: "Data quality log" },
      ]}
    >
      <ListHeader
        eyebrow={
          <>
            Administration <span aria-hidden>›</span> Integration monitor
          </>
        }
        title="Data quality log"
        count={rows.length}
        noun="rejected record"
        subtitle="Rejected and warned records from every integration. Fix at source, then reprocess."
        search={q}
        onSearch={setQ}
        filterCount={filterCount}
        onFilter={() => setShowFilters((v) => !v)}
        actions={
          <>
            <Btn variant="outline" icon={Download} onClick={exportCsv} disabled={rows.length === 0}>
              Export CSV
            </Btn>
            <Btn variant="outline" icon={RefreshCw} onClick={refresh} loading={refreshing}>
              Refresh
            </Btn>
          </>
        }
      />

      {/* Latest job results — created, updated and failed counts; partial success stated (US-MD-01 AC#2). */}
      <section aria-labelledby="dq-jobs-h" className="mb-6">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mb-3">
          <h2 id="dq-jobs-h" className="text-lg font-semibold tracking-tight">
            Latest sync jobs
          </h2>
          <DataAsOf at={refreshedAt} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {SYNC_JOBS.map((j) => {
            const tone = JOB_TONE[j.status] ?? "neutral";
            const Icon = ENTITY_ICON[j.entity] ?? Database;
            return (
              <article
                key={j.id}
                aria-labelledby={`job-${j.id}`}
                className="overflow-hidden bg-card border border-border rounded-xl shadow-sm flex flex-col"
              >
                <div className="p-5 flex flex-col gap-4 flex-1">
                  <div className="flex items-start gap-3">
                    <span
                      className={`size-10 shrink-0 rounded-lg grid place-items-center ${toneCls[tone].soft} ${toneCls[tone].text}`}
                      aria-hidden
                    >
                      <Icon className="size-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 id={`job-${j.id}`} className="font-semibold leading-tight">
                        {j.entity} sync
                      </h3>
                      <p className="text-xs text-muted-foreground truncate">{j.source}</p>
                    </div>
                    <StatusPill status={j.status} />
                  </div>

                  <dl className="grid grid-cols-3 gap-2">
                    {[
                      { label: "Created", value: j.created, danger: false },
                      { label: "Updated", value: j.updated, danger: false },
                      { label: "Failed", value: j.failed, danger: j.failed > 0 },
                    ].map((s) => (
                      <div
                        key={s.label}
                        className={`rounded-lg px-3 py-2 ${s.danger ? "bg-danger-soft" : "bg-muted/60"}`}
                      >
                        <dt
                          className={`text-xs font-medium ${s.danger ? "text-destructive" : "text-muted-foreground"}`}
                        >
                          {s.label}
                        </dt>
                        <dd
                          className={`text-xl font-bold tabular-nums ${s.danger ? "text-destructive" : ""}`}
                        >
                          {s.value.toLocaleString("en-GB")}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <footer className="px-5 py-3 border-t border-border bg-muted/30 text-xs text-muted-foreground flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono">{j.id}</span>
                  <span className="inline-flex items-center gap-1.5 tabular-nums">
                    <Clock className="size-3.5" aria-hidden />
                    {j.started.slice(0, 10)}, {j.started.slice(11)}–{j.finished.slice(11)}
                  </span>
                </footer>
              </article>
            );
          })}
        </div>
      </section>

      <h2 id="dq-records-h" className="text-lg font-semibold tracking-tight mb-3 scroll-mt-24">
        Rejected records
      </h2>
      <FilterPills<DqStatus>
        label="Status"
        selected={statuses}
        onChange={setStatuses}
        options={DQ_STATUSES.map((s) => ({ key: s, label: humanize(s), count: countOf(s) }))}
      />

      {(showFilters || filterCount > 0) && (
        <div
          className="bg-card border border-border rounded-xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-3 gap-4"
          role="group"
          aria-label="Filters"
        >
          <Field label="Entity">
            <select className={inputCls} value={entity} onChange={(e) => setEntity(e.target.value)}>
              <option value="all">All entities</option>
              {ENTITIES.map((e) => (
                <option key={e}>{e}</option>
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

      {filterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {entity !== "all" && (
            <FilterChip label={`Entity: ${entity}`} onRemove={() => setEntity("all")} />
          )}
          {(from || to) && (
            <FilterChip
              label={`Date: ${from || "…"} → ${to || "…"}`}
              onRemove={() => {
                setFrom("");
                setTo("");
              }}
            />
          )}
          <Btn variant="ghost" size="sm" icon={FilterX} onClick={clearFilters}>
            Clear filters
          </Btn>
        </div>
      )}

      {checked.size > 0 && (
        <div
          className="sticky top-20 z-10 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand/40 bg-brand-soft px-4 py-3"
          role="region"
          aria-label="Bulk actions"
        >
          <span className="text-sm font-semibold" role="status">
            {checked.size} selected
          </span>
          <Btn variant="ghost" size="sm" onClick={() => setChecked(new Set())}>
            Clear
          </Btn>
          <div className="flex-1" />
          <Btn
            variant="subtle"
            icon={EyeOff}
            onClick={() => setBulkIgnore(true)}
            disabled={canIgnore.length === 0}
          >
            Ignore ({canIgnore.length})
          </Btn>
          <Btn
            icon={Check}
            onClick={bulkAcknowledge}
            disabled={canAck.length === 0}
            title={canAck.length === 0 ? "Only open records can be acknowledged" : undefined}
          >
            Acknowledge ({canAck.length})
          </Btn>
        </div>
      )}

      <DataTable
        caption="Rejected integration records"
        columns={columns}
        rows={rows}
        rowKey={(d) => d.id}
        onRowClick={openEntry}
        selectedKey={selectedId}
        pageSize={25}
        empty={
          <EmptyState
            icon={Database}
            title={q ? `No rejected records match “${q}”` : "No rejected records match these filters"}
            action={
              anyFilter ? (
                <Btn variant="subtle" icon={FilterX} onClick={clearFilters}>
                  Clear filters
                </Btn>
              ) : undefined
            }
          >
            Try a different source ID, error code or status.
          </EmptyState>
        }
      />

      <ConfirmDialog
        open={bulkIgnore}
        tone="danger"
        title={`Ignore ${canIgnore.length} ${canIgnore.length === 1 ? "record" : "records"}?`}
        description="Ignored records stop appearing as open issues and will not be reprocessed. The note is stored on each record."
        confirmLabel={`Ignore ${canIgnore.length}`}
        missing={missingFields([["Resolution note", bulkNote]])}
        onConfirm={confirmBulkIgnore}
        onCancel={() => {
          setBulkIgnore(false);
          setBulkNoteErr(undefined);
        }}
      >
        <Field label="Resolution note" required error={bulkNoteErr} className="mt-4">
          <textarea
            className={`${inputCls} h-24 py-2`}
            value={bulkNote}
            onChange={(e) => {
              setBulkNote(e.target.value);
              setBulkNoteErr(undefined);
            }}
            placeholder="e.g. Discontinued material — not priced"
          />
        </Field>
      </ConfirmDialog>

      <Drawer
        open={!!selected}
        onClose={() => setSelectedId(null)}
        // A typed but unapplied note isn't lost to Esc or a backdrop click.
        dismissible={note === (selected?.resolutionNote ?? "")}
        title={selected ? `${selected.code}` : ""}
        subtitle={
          selected ? `${selected.id} · ${selected.entity} · ${selected.sourceSystem}` : undefined
        }
        footer={
          selected && (
            <>
              {/* Only Ignore needs the note, so the hint names that action. */}
              {NEXT[selected.status].includes("IGNORED") && (
                <MissingHint
                  id={ignoreHintId}
                  missing={missingFields([["Resolution note (to ignore)", note]])}
                />
              )}
              <Btn variant="subtle" onClick={() => setSelectedId(null)}>
                Close
              </Btn>
              {NEXT[selected.status].includes("IGNORED") && (
                <Btn
                  variant="subtle"
                  icon={EyeOff}
                  onClick={() => transition("IGNORED")}
                  disabled={!note.trim()}
                  aria-describedby={!note.trim() ? ignoreHintId : undefined}
                >
                  Ignore
                </Btn>
              )}
              {/* One primary: the next step of the resolution workflow. */}
              {selected.status === "OPEN" && (
                <Btn icon={Check} onClick={() => transition("ACKNOWLEDGED")}>
                  Acknowledge
                </Btn>
              )}
              {selected.status === "ACKNOWLEDGED" && (
                <Btn icon={Wrench} onClick={() => transition("FIXED_AT_SOURCE")}>
                  Mark fixed at source
                </Btn>
              )}
              {selected.status === "FIXED_AT_SOURCE" && (
                <Btn icon={RotateCcw} onClick={reprocess} loading={reprocessing}>
                  {reprocessing ? "Reprocessing…" : "Reprocess"}
                </Btn>
              )}
            </>
          )
        }
      >
        {selected && (
          <>
            <ErrorBanner error={error} onClose={() => setError(null)} />
            <ol
              className="flex flex-wrap items-center gap-2 text-sm"
              aria-label="Resolution workflow"
            >
              {(["OPEN", "ACKNOWLEDGED", "FIXED_AT_SOURCE", "REPROCESSED"] as DqStatus[]).map(
                (s, i) => (
                  <li
                    key={s}
                    className="flex items-center gap-2"
                    aria-current={selected.status === s ? "step" : undefined}
                  >
                    <span
                      className={
                        selected.status === s ? "rounded-full ring-2 ring-brand ring-offset-2" : ""
                      }
                    >
                      <StatusPill status={s} />
                    </span>
                    {selected.status === s && <span className="sr-only">(current status)</span>}
                    {i < 3 && (
                      <span className="text-muted-foreground" aria-hidden>
                        →
                      </span>
                    )}
                  </li>
                ),
              )}
              {selected.status === "IGNORED" && (
                <li aria-current="step">
                  <StatusPill status="IGNORED" />
                  <span className="sr-only">(current status)</span>
                </li>
              )}
            </ol>
            <Card title="Record">
              <DetailGrid
                items={[
                  { label: "Entity type", value: selected.entity },
                  {
                    label: "Source ID",
                    value: <span className="font-mono">{selected.sourceId}</span>,
                  },
                  { label: "Record in app", value: <SourceRecordLink d={selected} /> },
                  {
                    label: "Error code",
                    value: <span className="font-mono text-destructive">{selected.code}</span>,
                  },
                  { label: "Occurrence count", value: selected.occurrenceCount },
                  { label: "Error message", value: selected.message, full: true },
                  {
                    label: "First seen",
                    value: <span className="tabular-nums">{selected.firstSeen}</span>,
                  },
                  {
                    label: "Last seen",
                    value: <span className="tabular-nums">{selected.lastSeen}</span>,
                  },
                  { label: "Job", value: selected.job },
                  { label: "Owner", value: selected.owner },
                ]}
              />
            </Card>
            <Card
              title="Stored payload"
              subtitle="Encrypted at rest; visible only to roles with access"
            >
              <div className="flex items-center gap-3 rounded-lg bg-muted/60 p-4 text-sm text-muted-foreground">
                <Lock className="size-5 shrink-0" aria-hidden />
                <span>
                  Payload masked. Your role does not have{" "}
                  <code className="text-xs">integration.payload.read</code>. Reprocess re-submits
                  the stored payload without exposing it.
                </span>
              </div>
            </Card>
            <Field
              label="Resolution note"
              hint="Required when ignoring a record"
              error={
                error?.field === "resolutionNote"
                  ? "Add a note explaining why this record can be ignored."
                  : undefined
              }
            >
              <textarea
                id="dq-note"
                className={`${inputCls} h-24 py-2`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={selected.status === "REPROCESSED" || selected.status === "IGNORED"}
              />
            </Field>
          </>
        )}
      </Drawer>
    </PricingLayout>
  );
}
