import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, ListChecks, Plus } from "lucide-react";
import {
  Btn,
  DataTable,
  DetailGrid,
  Drawer,
  EmptyState,
  Field,
  FilterChip,
  FilterPills,
  LinkBtn,
  ListHeader,
  PricingLayout,
  RecordLink,
  StatusPill,
  Tag,
  humanize,
  inputCls,
} from "@/components/pricing/kit";
import { RULES, RULE_STATUSES, RULE_TYPES, STRATEGIES, type PricingRule } from "@/lib/pricing/data";
import { actionSummary, conditionSummary } from "@/lib/pricing/rules";

export const Route = createFileRoute("/pricing/rules/")({
  head: () => ({ meta: [{ title: "Pricing rules · Rebate Ninja" }] }),
  component: Page,
});

type Status = PricingRule["status"];

function Page() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [strategy, setStrategy] = useState("");
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const [preview, setPreview] = useState<PricingRule | null>(null);

  const rows = useMemo(
    () =>
      RULES.filter(
        (r) =>
          (!search || `${r.id} ${r.name}`.toLowerCase().includes(search.toLowerCase())) &&
          (!type || r.type === type) &&
          (!strategy || r.strategy === strategy) &&
          (statuses.length === 0 || statuses.includes(r.status)),
      ),
    [search, type, strategy, statuses],
  );
  const filterCount = [type, strategy].filter(Boolean).length;
  const clearAll = () => {
    setType("");
    setStrategy("");
    setStatuses([]);
    setSearch("");
  };

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Strategy & segmentation" }, { label: "Pricing rules" }]}>
      <ListHeader
        title="Pricing rules"
        count={rows.length}
        noun="rule"
        subtitle="Configure customer, contract, discount and formula rules without custom code."
        search={search}
        onSearch={setSearch}
        filterCount={filterCount}
        onFilter={() => setShowFilters((s) => !s)}
        actions={
          <LinkBtn to="/pricing/rules/$id" params={{ id: "new" }} icon={Plus}>
            Create rule
          </LinkBtn>
        }
      />

      <FilterPills<Status>
        label="Status"
        selected={statuses}
        onChange={setStatuses}
        options={RULE_STATUSES.map((s) => ({ key: s, label: humanize(s), count: RULES.filter((r) => r.status === s).length }))}
      />

      {showFilters && (
        <div className="bg-card border border-border rounded-xl p-4 mb-4 flex flex-wrap gap-4 items-end" role="group" aria-label="Rule filters">
          <Field label="Rule type" className="w-full sm:w-64">
            <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="">All rule types</option>
              {RULE_TYPES.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Strategy" className="w-full sm:w-64">
            <select className={inputCls} value={strategy} onChange={(e) => setStrategy(e.target.value)}>
              <option value="">All strategies</option>
              {STRATEGIES.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {filterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {type && <FilterChip label={`Rule type: ${humanize(type)}`} onRemove={() => setType("")} />}
          {strategy && <FilterChip label={`Strategy: ${humanize(strategy)}`} onRemove={() => setStrategy("")} />}
        </div>
      )}

      <DataTable<PricingRule>
        caption="Pricing rules"
        rows={rows}
        rowKey={(r) => r.id}
        selectedKey={preview?.id ?? null}
        onRowClick={setPreview}
        pageSize={25}
        empty={
          search || filterCount || statuses.length ? (
            <EmptyState
              icon={ListChecks}
              title={search ? `No rules match “${search}”` : "No rules match these filters"}
              action={
                <Btn variant="subtle" onClick={clearAll}>
                  Clear filters
                </Btn>
              }
            >
              Try a different search term or remove a filter.
            </EmptyState>
          ) : (
            <EmptyState
              icon={ListChecks}
              title="No pricing rules yet"
              action={
                <LinkBtn to="/pricing/rules/$id" params={{ id: "new" }} icon={Plus}>
                  Create rule
                </LinkBtn>
              }
            >
              Rules set customer, contract and volume prices from attributes and one action.
            </EmptyState>
          )
        }
        columns={[
          { key: "id", header: "ID", className: "whitespace-nowrap", cell: (r) => <span className="font-mono text-xs">{r.id}</span> },
          { key: "name", header: "Name", className: "min-w-48", cell: (r) => <RecordLink to="/pricing/rules/$id" params={{ id: r.id }}>{r.name}</RecordLink> },
          { key: "type", header: "Rule type", className: "whitespace-nowrap", cell: (r) => <Tag tone="info">{humanize(r.type)}</Tag> },
          { key: "strategy", header: "Strategy", className: "min-w-32", cell: (r) => humanize(r.strategy) },
          { key: "action", header: "Action", cell: (r) => <span className="block min-w-40">{actionSummary(r.action)}</span> },
          { key: "prio", header: "Priority", align: "right", cell: (r) => <span className="tabular-nums">{r.priority}</span> },
          { key: "ver", header: "Version", align: "right", cell: (r) => <span className="tabular-nums">v{r.version}</span> },
          { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
          { key: "eff", header: "Effective", cell: (r) => <span className="text-muted-foreground tabular-nums whitespace-nowrap">{r.effectiveFrom} → {r.effectiveTo ?? "open"}</span> },
        ]}
      />

      <RuleQuickView rule={preview} onClose={() => setPreview(null)} onOpen={(r) => navigate({ to: "/pricing/rules/$id", params: { id: r.id } })} />
    </PricingLayout>
  );
}

/** Row preview that keeps the list in place (Option C drawer). Editing stays on the rule page. */
function RuleQuickView({ rule: r, onClose, onOpen }: { rule: PricingRule | null; onClose: () => void; onOpen: (r: PricingRule) => void }) {
  return (
    <Drawer
      open={!!r}
      onClose={onClose}
      size="md"
      title={r?.name ?? ""}
      subtitle={
        r && (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{r.id}</span>
            <StatusPill status={r.status} />
            <Tag tone="info">{humanize(r.type)}</Tag>
          </span>
        )
      }
      footer={
        r && (
          <>
            <Btn variant="subtle" onClick={onClose}>
              Close
            </Btn>
            <Btn icon={ArrowRight} onClick={() => onOpen(r)}>
              Open rule
            </Btn>
          </>
        )
      }
    >
      {r && (
        <>
          <section className="bg-card border border-border rounded-xl px-5">
            <DetailGrid
              items={[
                { label: `Conditions (${r.conditions.length})`, value: <span className="text-sm">{conditionSummary(r.conditions)}</span>, full: true },
                { label: "Action", value: actionSummary(r.action), full: true },
                { label: "Strategy", value: humanize(r.strategy) },
                { label: "Priority", value: <span className="tabular-nums">{r.priority}</span> },
                { label: "Version", value: <span className="tabular-nums">v{r.version}</span> },
                { label: "Effective", value: <span className="tabular-nums whitespace-nowrap">{r.effectiveFrom} → {r.effectiveTo ?? "open"}</span> },
                { label: "Owner", value: r.owner },
                { label: "Last updated", value: <span className="tabular-nums">{r.lastUpdated}</span> },
                ...(r.reasonCode ? [{ label: "Reason code", value: humanize(r.reasonCode), full: true }] : []),
              ]}
            />
          </section>
          <p className="text-xs text-muted-foreground">Within a precedence tier, the lower priority number wins. Edit conditions, test the rule and see its version history on the full rule page.</p>
        </>
      )}
    </Drawer>
  );
}
