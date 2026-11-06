import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Download, MoreVertical, Plus, RefreshCw, Tags } from "lucide-react";
import { Fragment, useEffect, useMemo, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DataTable,
  DetailGrid,
  Drawer,
  EmptyState,
  Field,
  FilterChip,
  FilterPills,
  LinkBtn,
  ListHeader,
  Modal,
  PricingLayout,
  RecordLink,
  StatusPill,
  Tag,
  Btn,
  humanize,
  inputCls,
  notifySuccess,
  type Column,
} from "@/components/pricing/kit";
import {
  CURRENCIES,
  LIST_STATUSES,
  LIST_TYPES,
  PRICE_LISTS,
  REGIONS,
  createDraftVersion,
  duplicatePriceList,
  openDraftOf,
  type ListStatus,
  type PriceList,
} from "@/lib/pricing/data";
import { TODAY, downloadCsv } from "@/lib/pricing/csv";

type ListSearch = { status?: string };

export const Route = createFileRoute("/pricing/price-lists/")({
  // `?status=ACTIVE` lets dashboard KPIs open this list pre-filtered.
  validateSearch: (s: Record<string, unknown>): ListSearch => ({
    status:
      typeof s.status === "string" && s.status.split(",").every((x) => (LIST_STATUSES as readonly string[]).includes(x))
        ? s.status
        : undefined,
  }),
  head: () => ({ meta: [{ title: "Price lists · Rebate Ninja" }] }),
  component: Page,
});

type Filters = { type: string; status: string; currency: string; region: string };
const EMPTY: Filters = { type: "", status: "", currency: "", region: "" };

const toCsv = (ls: PriceList[]) =>
  ls.map((l) => ({
    id: l.id,
    name: l.name,
    type: l.type,
    status: l.status,
    version: l.version,
    currency: l.currency,
    region: l.region,
    from: l.effectiveFrom,
    to: l.effectiveTo ?? "open",
    owner: l.owner,
  }));

/** Row actions allowed per status (US-PL-04 transitions + Appendix B actions). */
function actionsFor(l: PriceList): Array<{ key: string; label: string; enabled: boolean }> {
  const s = l.status;
  return [
    { key: "view", label: "View", enabled: true },
    { key: "edit", label: "Edit draft", enabled: s === "DRAFT" || s === "ACTIVE" },
    { key: "duplicate", label: "Duplicate", enabled: true },
    { key: "compare", label: "Compare versions", enabled: l.version > 1 },
    { key: "submit", label: "Submit for approval…", enabled: s === "DRAFT" },
    { key: "approve", label: "Approve…", enabled: s === "SUBMITTED" },
    { key: "schedule", label: "Schedule…", enabled: s === "APPROVED" },
    {
      key: "cancel",
      label: "Cancel price list…",
      enabled: ["DRAFT", "SUBMITTED", "APPROVED", "SCHEDULED"].includes(s),
    },
  ];
}

function RowMenu({ list }: { list: PriceList }) {
  const navigate = useNavigate();
  const run = (key: string) => {
    if (key === "view") {
      navigate({ to: "/pricing/price-lists/$id", params: { id: list.id } });
      return;
    }
    if (key === "compare") {
      navigate({ to: "/pricing/price-lists/$id", params: { id: list.id }, search: { tab: "versions" } });
      return;
    }
    // "…" items open their confirmation dialog straight away on the detail page.
    const transition = { submit: "SUBMIT", approve: "APPROVE", schedule: "SCHEDULE", cancel: "CANCEL" } as const;
    if (key in transition) {
      navigate({
        to: "/pricing/price-lists/$id",
        params: { id: list.id },
        search: { action: transition[key as keyof typeof transition] },
      });
      return;
    }
    if (key === "edit") {
      // ACTIVE lists open a separate draft version n+1 (US-PL-01 AC#6).
      if (list.status === "ACTIVE") {
        const existing = openDraftOf(list.id);
        const draft = createDraftVersion(list, "Riya Shah", `${TODAY} 14:15`);
        notifySuccess(
          existing ? `Opening draft v${draft.version}` : `Draft v${draft.version} created`,
          `Active v${list.version} keeps pricing quotes until v${draft.version} is approved and active.`,
        );
        navigate({ to: "/pricing/price-lists/$id", params: { id: draft.id } });
      } else navigate({ to: "/pricing/price-lists/$id", params: { id: list.id } });
      return;
    }
    if (key === "duplicate") {
      const copy = duplicatePriceList(list, "Riya Shah", `${TODAY} 14:15`);
      notifySuccess(`${list.name} duplicated`, `Created ${copy.id} as draft v1.`);
      navigate({ to: "/pricing/price-lists/$id", params: { id: copy.id } });
    }
  };
  // Only actions valid for the list's current status are offered (no unexplained disabled items).
  const items = actionsFor(list).filter((a) => a.enabled);
  // Same Radix menu as the detail page header: arrow keys, Esc and focus return come built in.
  return (
    <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="size-10 grid place-items-center rounded-md hover:bg-muted"
            aria-label={`Actions for ${list.name}`}
          >
            <MoreVertical className="size-4" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {items.map((a) => (
            <Fragment key={a.key}>
              {a.key === "cancel" && <DropdownMenuSeparator />}
              <DropdownMenuItem
                className={`min-h-10 ${a.key === "cancel" ? "text-destructive focus:text-destructive" : ""}`}
                onSelect={() => run(a.key)}
              >
                {a.label}
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function Page() {
  const search = Route.useSearch();
  const [q, setQ] = useState("");
  const [filters, setFilters] = useState<Filters>({ ...EMPTY, status: search.status ?? "" });
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [showFilter, setShowFilter] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const navigate = useNavigate();

  // Follow the URL when a KPI/link changes ?status while this page is open.
  useEffect(() => {
    setFilters((f) => ({ ...f, status: search.status ?? "" }));
  }, [search.status]);

  const applyFilters = (next: Filters) => {
    setFilters(next);
    setSelected(new Set());
    // Keep status in the URL so Back and shared links restore the filtered view.
    navigate({
      to: "/pricing/price-lists",
      search: { status: next.status || undefined },
      replace: true,
    });
  };

  const refresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      notifySuccess("Price lists refreshed");
    }, 600);
  };

  const rows = useMemo(
    () =>
      PRICE_LISTS.filter(
        (l) =>
          (!q || `${l.id} ${l.name}`.toLowerCase().includes(q.toLowerCase())) &&
          (!filters.type || l.type === filters.type) &&
          (!filters.status || filters.status.split(",").includes(l.status)) &&
          (!filters.currency || l.currency === filters.currency) &&
          (!filters.region || l.region === filters.region),
      ),
    [q, filters],
  );
  const active = (Object.keys(filters) as Array<keyof Filters>).filter((k) => filters[k]);
  /** Advanced filters live in the modal; status is the pill row, so it isn't repeated as a chip. */
  const advanced = active.filter((k) => k !== "status");
  const [preview, setPreview] = useState<PriceList | null>(null);
  const visibleSelected = rows.filter((r) => selected.has(r.id));
  const allOn = rows.length > 0 && visibleSelected.length === rows.length;
  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const clearAll = () => {
    setQ("");
    applyFilters(EMPTY);
  };

  const columns: Column<PriceList>[] = [
    {
      key: "sel",
      header: (
        <input
          type="checkbox"
          className="size-4 accent-[var(--brand)] align-middle"
          checked={allOn}
          ref={(el) => {
            if (el) el.indeterminate = visibleSelected.length > 0 && !allOn;
          }}
          disabled={rows.length === 0}
          onChange={() => setSelected(allOn ? new Set() : new Set(rows.map((r) => r.id)))}
          aria-label="Select all price lists"
        />
      ),
      cell: (l) => (
        <input
          type="checkbox"
          className="size-4 accent-[var(--brand)] align-middle"
          checked={selected.has(l.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={() => toggle(l.id)}
          aria-label={`Select ${l.name}`}
        />
      ),
      width: "48px",
    },
    {
      key: "name",
      header: "Name",
      className: "min-w-48",
      cell: (l) => (
        <div>
          <RecordLink to="/pricing/price-lists/$id" params={{ id: l.id }}>
            {l.name}
          </RecordLink>
          <div className="text-xs text-muted-foreground mt-0.5">
            <span className="font-mono">{l.id}</span> · v{l.version} · {l.currency}
          </div>
        </div>
      ),
    },
    { key: "type", header: "Type", className: "whitespace-nowrap", cell: (l) => humanize(l.type) },
    { key: "status", header: "Status", cell: (l) => <StatusPill status={l.status} /> },
    {
      key: "scope",
      header: "Region · channel · segment",
      className: "min-w-40",
      cell: (l) => (
        <span className="text-muted-foreground">
          {l.region} · {l.channel} · {l.segment}
        </span>
      ),
    },
    {
      key: "eff",
      header: "Effective",
      cell: (l) => (
        <div className="whitespace-nowrap tabular-nums">
          <div>{l.effectiveFrom}</div>
          <div className="text-xs text-muted-foreground">
            to {l.openEnded ? <span className="italic">open-ended</span> : l.effectiveTo}
          </div>
        </div>
      ),
    },
    {
      key: "upd",
      header: "Owner · updated",
      cell: (l) => (
        <div className="whitespace-nowrap">
          <div>{l.owner}</div>
          <div className="text-xs text-muted-foreground tabular-nums">{l.lastUpdated}</div>
        </div>
      ),
    },
    { key: "act", header: "", align: "right", cell: (l) => <RowMenu list={l} /> },
  ];

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Price lists" }]}>
      <ListHeader
        title="Price lists"
        noun="price list"
        count={rows.length}
        search={q}
        onSearch={setQ}
        subtitle="Prices quoted to customers, by scope and effective dates."
        filterCount={advanced.length}
        onFilter={() => {
          setDraft(filters);
          setShowFilter(true);
        }}
        actions={
          <>
            <Btn variant="outline" icon={RefreshCw} loading={refreshing} onClick={refresh}>
              Refresh
            </Btn>
            <LinkBtn to="/pricing/price-lists/new" icon={Plus}>
              Create price list
            </LinkBtn>
          </>
        }
      />
      <FilterPills<ListStatus>
        label="Status"
        selected={filters.status ? (filters.status.split(",") as ListStatus[]) : []}
        onChange={(next) => applyFilters({ ...filters, status: next.join(",") })}
        options={LIST_STATUSES.map((s) => ({
          key: s,
          label: humanize(s),
          count: PRICE_LISTS.filter((l) => l.status === s).length,
        }))}
      />
      {advanced.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {advanced.map((k) => (
            <FilterChip
              key={k}
              label={`${humanize(k)}: ${k === "type" ? humanize(filters[k]) : filters[k]}`}
              onRemove={() => applyFilters({ ...filters, [k]: "" })}
            />
          ))}
          <Btn
            variant="ghost"
            size="sm"
            onClick={() => applyFilters({ ...EMPTY, status: filters.status })}
          >
            Clear all
          </Btn>
        </div>
      )}
      {visibleSelected.length > 0 && (
        <div
          className="sticky top-20 z-10 flex flex-wrap items-center gap-3 mb-4 rounded-lg border border-brand/40 bg-brand-soft px-4 py-2"
          role="region"
          aria-label="Bulk actions"
        >
          <span className="text-sm font-semibold" role="status">
            {visibleSelected.length} selected
          </span>
          <Btn variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Btn>
          <div className="flex-1" />
          <Btn
            variant="outline"
            size="sm"
            icon={Download}
            onClick={() => {
              downloadCsv("price-lists-selected.csv", toCsv(visibleSelected));
              notifySuccess(
                `${visibleSelected.length} price ${visibleSelected.length === 1 ? "list" : "lists"} exported`,
              );
            }}
          >
            Export CSV
          </Btn>
        </div>
      )}
      <DataTable
        caption="Price lists"
        columns={columns}
        rows={rows}
        rowKey={(l) => l.id}
        onRowClick={setPreview}
        selectedKey={preview?.id ?? null}
        pageSize={25}
        rowClassName={(l) => (selected.has(l.id) ? "!bg-brand-soft" : "")}
        empty={
          q || active.length ? (
            <EmptyState
              icon={Tags}
              title={q ? `No price lists match “${q}”` : "No price lists match these filters"}
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
              icon={Tags}
              title="No price lists yet"
              action={
                <LinkBtn to="/pricing/price-lists/new" icon={Plus}>
                  Create price list
                </LinkBtn>
              }
            >
              Create the first one to get started.
            </EmptyState>
          )
        }
      />

      <PriceListQuickView
        list={preview}
        onClose={() => setPreview(null)}
        onOpen={(l) => navigate({ to: "/pricing/price-lists/$id", params: { id: l.id } })}
      />

      <Modal
        open={showFilter}
        title="Filter price lists"
        onClose={() => setShowFilter(false)}
        footer={
          <>
            <Btn variant="ghost" onClick={() => setDraft(EMPTY)}>
              Clear all
            </Btn>
            <Btn variant="subtle" onClick={() => setShowFilter(false)}>
              Cancel
            </Btn>
            <Btn type="submit" form="price-list-filters">
              Apply
            </Btn>
          </>
        }
      >
        <form
          id="price-list-filters"
          className="grid sm:grid-cols-2 gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            applyFilters(draft);
            setShowFilter(false);
          }}
        >
          {(
            [
              ["type", "List type", LIST_TYPES],
              ["currency", "Currency", CURRENCIES],
              ["region", "Region", REGIONS],
            ] as const
          ).map(([k, label, opts]) => (
            <Field key={k} label={label}>
              <select
                className={inputCls}
                value={draft[k]}
                onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
              >
                <option value="">All</option>
                {opts.map((o) => (
                  <option key={o} value={o}>
                    {k === "type" ? humanize(o) : o}
                  </option>
                ))}
              </select>
            </Field>
          ))}
        </form>
      </Modal>
    </PricingLayout>
  );
}

/** Row preview that keeps the list in place (Option C drawer). The full record is one click away. */
function PriceListQuickView({
  list: l,
  onClose,
  onOpen,
}: {
  list: PriceList | null;
  onClose: () => void;
  onOpen: (l: PriceList) => void;
}) {
  return (
    <Drawer
      open={!!l}
      onClose={onClose}
      size="md"
      title={l?.name ?? ""}
      subtitle={
        l && (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{l.id}</span>
            <StatusPill status={l.status} />
            <Tag>{humanize(l.type)}</Tag>
          </span>
        )
      }
      footer={
        l && (
          <>
            <Btn variant="subtle" onClick={onClose}>
              Close
            </Btn>
            <Btn icon={ArrowRight} onClick={() => onOpen(l)}>
              Open price list
            </Btn>
          </>
        )
      }
    >
      {l && (
        <section className="bg-card border border-border rounded-xl px-5">
          <DetailGrid
            items={[
              { label: "Version", value: `v${l.version}` },
              { label: "Currency", value: l.currency },
              { label: "Effective from", value: l.effectiveFrom },
              { label: "Effective to", value: l.openEnded ? "Open-ended" : (l.effectiveTo ?? "—") },
              { label: "Region", value: l.region },
              { label: "Channel", value: l.channel },
              { label: "Customer segment", value: l.segment },
              { label: "Lines", value: l.lines.length },
              { label: "Owner", value: l.owner },
              { label: "Last updated", value: l.lastUpdated },
            ]}
          />
        </section>
      )}
    </Drawer>
  );
}
