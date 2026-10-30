import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Download, FilterX } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  DataTable,
  DetailGrid,
  Drawer,
  EmptyState,
  Field,
  FilterChip,
  FilterPills,
  InfoBanner,
  ListHeader,
  PricingLayout,
  RecordLink,
  Tag,
  humanize,
  inputCls,
  type Column,
} from "@/components/pricing/kit";
import {
  AUDIT_LOG,
  PRICE_LISTS,
  REASON_CODES,
  RULES,
  productBySku,
  type AuditEntry,
} from "@/lib/pricing/data";
import { TODAY, downloadCsv } from "@/lib/pricing/csv";

export const Route = createFileRoute("/pricing/audit-log")({
  head: () => ({ meta: [{ title: "Audit log · Rebate Ninja" }] }),
  component: Page,
});

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
  const listPage: Record<string, string> = {
    Guardrail: "/pricing/guardrails",
    "Bulk Job": "/pricing/bulk-update",
    Recommendation: "/pricing/recommendations",
  };
  if (listPage[entry.entity])
    return <RecordLink to={listPage[entry.entity]}>{entry.record}</RecordLink>;
  return <span className="font-medium">{entry.record}</span>;
}

function Page() {
  const [q, setQ] = useState("");
  const [entities, setEntities] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [actor, setActor] = useState("all");
  const [reason, setReason] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selected, setSelected] = useState<AuditEntry | null>(null);

  const entityOptions = Array.from(new Set(AUDIT_LOG.map((a) => a.entity))).sort();
  const actors = Array.from(new Set(AUDIT_LOG.map((a) => a.actor)));

  const rows = useMemo(
    () =>
      AUDIT_LOG.filter((a) => {
        const t = q.toLowerCase();
        const day = a.at.slice(0, 10);
        return (
          (!t ||
            [a.record, a.actor, a.action, a.correlationId, a.reasonText ?? ""].some((v) =>
              v.toLowerCase().includes(t),
            )) &&
          (entities.length === 0 || entities.includes(a.entity)) &&
          (actor === "all" || a.actor === actor) &&
          (reason === "all" || a.reasonCode === reason) &&
          (!from || day >= from) &&
          (!to || day <= to)
        );
      }).sort((a, b) => b.at.localeCompare(a.at)),
    [q, entities, actor, reason, from, to],
  );

  const columns: Column<AuditEntry>[] = [
    {
      key: "id",
      header: "Entry",
      cell: (a) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelected(a);
          }}
          className="text-brand font-medium hover:underline whitespace-nowrap"
          aria-label={`View details of audit entry ${a.id}`}
        >
          {a.id}
        </button>
      ),
    },
    {
      key: "at",
      header: "Timestamp",
      cell: (a) => <span className="whitespace-nowrap tabular-nums">{a.at}</span>,
    },
    { key: "actor", header: "Actor", className: "whitespace-nowrap", cell: (a) => a.actor },
    {
      key: "entity",
      header: "Entity",
      className: "whitespace-nowrap",
      cell: (a) => <Tag>{humanize(a.entity)}</Tag>,
    },
    {
      key: "record",
      header: "Record",
      className: "min-w-56",
      cell: (a) => <AuditRecord entry={a} />,
    },
    {
      key: "action",
      header: "Action",
      cell: (a) => <span className="whitespace-nowrap">{humanize(a.action)}</span>,
    },
    {
      key: "before",
      header: "Before",
      align: "right",
      cell: (a) => <span className="tabular-nums text-muted-foreground">{a.before ?? "—"}</span>,
    },
    {
      key: "after",
      header: "After",
      align: "right",
      cell: (a) => <span className="tabular-nums font-semibold">{a.after ?? "—"}</span>,
    },
    {
      key: "reason",
      header: "Reason",
      className: "min-w-48",
      cell: (a) =>
        a.reasonCode ? (
          <div>
            <span className="whitespace-nowrap">
              <Tag tone="brand">{humanize(a.reasonCode)}</Tag>
            </span>
            {a.reasonText && (
              <div className="text-xs text-muted-foreground mt-1">“{a.reasonText}”</div>
            )}
          </div>
        ) : (
          "—"
        ),
    },
    { key: "v", header: "Version", className: "whitespace-nowrap", cell: (a) => a.version ?? "—" },
    {
      key: "cid",
      header: "Correlation ID",
      cell: (a) => (
        <span className="font-mono text-xs text-muted-foreground">{a.correlationId}</span>
      ),
    },
  ];

  const exportCsv = () => {
    downloadCsv(
      `audit-log-${TODAY}.csv`,
      rows.map((a) => ({
        id: a.id,
        timestamp: a.at,
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
      })),
    );
    toast.success(`${rows.length} audit ${rows.length === 1 ? "entry" : "entries"} exported`);
  };

  const active = [
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
    setActor("all");
    setReason("all");
    setFrom("");
    setTo("");
  };
  const anyFilter = active.length > 0 || entities.length > 0 || q !== "";

  return (
    <PricingLayout
      crumbs={[
        { label: "Pricing", to: "/pricing" },
        { label: "Administration" },
        { label: "Audit log" },
      ]}
    >
      <ListHeader
        title="Audit log"
        count={rows.length}
        noun="entry"
        nounPlural="entries"
        subtitle="Every price change, newest first."
        search={q}
        onSearch={setQ}
        filterCount={active.length}
        onFilter={() => setShowFilters((v) => !v)}
        actions={
          <Btn
            variant="outline"
            icon={Download}
            onClick={exportCsv}
            disabled={rows.length === 0}
            title={rows.length === 0 ? "No entries to export — clear filters first" : undefined}
          >
            Export CSV
          </Btn>
        }
      />
      <InfoBanner title="Immutable record">
        Audit entries are read-only and cannot be altered through the business UI. Every price
        change stores user, timestamp, before and after values, reason code and price list version.
        Retained for at least 3 years.
      </InfoBanner>

      <FilterPills
        label="Entity"
        selected={entities}
        onChange={setEntities}
        options={entityOptions.map((e) => ({
          key: e,
          label: humanize(e),
          count: AUDIT_LOG.filter((a) => a.entity === e).length,
        }))}
      />

      {(showFilters || active.length > 0) && (
        <div
          className="bg-card border border-border rounded-xl p-4 mb-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          role="group"
          aria-label="Filters"
        >
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
            title="No audit entries match these filters"
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
                { label: "Field", value: selected.field ?? "—" },
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
              ]}
            />
          </section>
        )}
      </Drawer>
    </PricingLayout>
  );
}
