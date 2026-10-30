import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, CornerDownRight, FileText, Star, Users } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  DataTable,
  DetailGrid,
  Drawer,
  EmptyState,
  ErrorBanner,
  FilterPills,
  InfoBanner,
  ListHeader,
  Locked,
  PricingLayout,
  RecordLink,
  StatusPill,
  SyncStatus,
  Tag,
  Toggle,
  notifySuccess,
  type ApiError,
  type Column,
} from "@/components/pricing/kit";
import { CUSTOMERS, CUSTOMER_SEGMENTS, MAX_HIERARCHY_DEPTH, SYNC_JOBS, childrenOf, customerById, type Customer } from "@/lib/pricing/data";

export const Route = createFileRoute("/pricing/customers/")({
  head: () => ({ meta: [{ title: "Customers · Rebate Ninja" }] }),
  component: Page,
});

/** Last nightly CRM/ERP customer sync (US-MD-02). */
const CUSTOMER_SYNC = SYNC_JOBS.find((j) => j.id === "SYNC-CUST-1029")!;

type Segment = (typeof CUSTOMER_SEGMENTS)[number];

/** Depth-first order so children sit under their parent. */
function treeOrder(list: Customer[]): Customer[] {
  const ids = new Set(list.map((c) => c.id));
  const out: Customer[] = [];
  const walk = (parent: string | undefined) => {
    list
      .filter((c) => (parent ? c.parentId === parent : !c.parentId || !ids.has(c.parentId)))
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((c) => {
        out.push(c);
        walk(c.id);
      });
  };
  walk(undefined);
  return out;
}

function Page() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [hierarchy, setHierarchy] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [syncedAt, setSyncedAt] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [preview, setPreview] = useState<Customer | null>(null);

  const refresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setSyncedAt(new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }));
      notifySuccess("Customers refreshed", "Loaded the latest CRM/ERP customer master.");
    }, 700);
  };
  const clearFilters = () => {
    setQ("");
    setSegments([]);
  };

  const rows = useMemo(() => {
    const t = q.toLowerCase();
    const filtered = CUSTOMERS.filter(
      (c) =>
        (!t || [c.id, c.name, c.industry, c.geography].some((v) => v.toLowerCase().includes(t))) &&
        (segments.length === 0 || segments.includes(c.segment as Segment)),
    );
    return hierarchy ? treeOrder(filtered) : [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  }, [q, segments, hierarchy]);

  const startQuote = (c: Customer) => {
    if (c.status === "BLOCKED") {
      setPreview(null);
      setError({
        errorClass: "BUSINESS_RULE",
        code: "CUSTOMER_BLOCKED",
        message: `${c.name} (${c.id}) is blocked, so a quote can't be created. Ask the account owner to unblock the customer in the ERP, then try again.`,
      });
      return;
    }
    setError(null);
    toast.success(`Quote started for ${c.name}`, { description: "Continue in the CPQ module." });
  };

  const columns: Column<Customer>[] = [
    { key: "id", header: "ID", cell: (c) => <span className="font-mono text-xs whitespace-nowrap">{c.id}</span> },
    {
      key: "name",
      header: "Name",
      cell: (c) => (
        <span className="inline-flex items-center gap-1.5" style={{ paddingLeft: hierarchy ? (c.level - 1) * 24 : 0 }}>
          {hierarchy && c.level > 1 && <CornerDownRight className="size-3.5 text-muted-foreground" aria-hidden />}
          <RecordLink to="/pricing/customers/$id" params={{ id: c.id }}>{c.name}</RecordLink>
          {c.strategic && <Star className="size-3.5 text-brand fill-brand" role="img" aria-label="Strategic customer" />}
        </span>
      ),
    },
    { key: "lvl", header: "Level", align: "center", cell: (c) => <span className="text-muted-foreground">L{c.level}</span> },
    { key: "seg", header: "Segment", cell: (c) => <span className="whitespace-nowrap"><Tag tone="brand">{c.segment}</Tag></span> },
    { key: "geo", header: "Geography", cell: (c) => <span className="whitespace-nowrap">{c.geography}</span> },
    { key: "ch", header: "Channel", cell: (c) => <span className="whitespace-nowrap">{c.channel}</span> },
    { key: "tier", header: "Tier", cell: (c) => <span className="whitespace-nowrap">{c.tier}</span> },
    { key: "st", header: "Status", cell: (c) => <StatusPill status={c.status} /> },
    {
      key: "act",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (c) => (
        <Btn
          size="sm"
          variant="subtle"
          icon={FileText}
          aria-label={`Start quote for ${c.name}`}
          onClick={(e) => {
            e.stopPropagation();
            startQuote(c);
          }}
        >
          Start quote
        </Btn>
      ),
    },
  ];

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Customers" }]}>
      <ListHeader
        title="Customers"
        noun="customer"
        count={rows.length}
        subtitle={`Synced from the CRM/ERP. Hierarchy up to ${MAX_HIERARCHY_DEPTH} levels.`}
        search={q}
        onSearch={setQ}
        actions={<Toggle checked={hierarchy} onChange={setHierarchy} label="Hierarchy view" />}
      />

      <SyncStatus job={CUSTOMER_SYNC} syncedAt={syncedAt} onRefresh={refresh} refreshing={refreshing} noun="customer records" />

      <FilterPills<Segment>
        label="Segment"
        selected={segments}
        onChange={setSegments}
        options={CUSTOMER_SEGMENTS.map((s) => ({ key: s, label: s, count: CUSTOMERS.filter((c) => c.segment === s).length }))}
      />

      <ErrorBanner error={error} onClose={() => setError(null)} />

      <DataTable
        caption="Customers"
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        selectedKey={preview?.id ?? null}
        onRowClick={setPreview}
        pageSize={25}
        rowClassName={(c) => (c.status === "BLOCKED" ? "bg-danger-soft/40" : "")}
        empty={
          <EmptyState
            icon={Users}
            title={q ? `No customers match “${q}”` : "No customers in these segments"}
            action={
              <Btn variant="subtle" onClick={clearFilters}>
                Clear filters
              </Btn>
            }
          >
            Customers arrive from the CRM/ERP. Try a different search term or segment.
          </EmptyState>
        }
      />

      <CustomerQuickView
        customer={preview}
        onClose={() => setPreview(null)}
        onSelect={setPreview}
        onQuote={startQuote}
        onOpen={(c) => navigate({ to: "/pricing/customers/$id", params: { id: c.id } })}
      />
    </PricingLayout>
  );
}

function CustomerQuickView({
  customer: c,
  onClose,
  onSelect,
  onQuote,
  onOpen,
}: {
  customer: Customer | null;
  onClose: () => void;
  onSelect: (c: Customer) => void;
  onQuote: (c: Customer) => void;
  onOpen: (c: Customer) => void;
}) {
  const parent = c?.parentId ? customerById(c.parentId) : undefined;
  const kids = c ? childrenOf(c.id) : [];
  return (
    <Drawer
      open={!!c}
      onClose={onClose}
      size="md"
      title={c?.name ?? ""}
      subtitle={
        c && (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{c.id}</span>
            <StatusPill status={c.status} />
            <Tag tone="brand">{c.segment}</Tag>
            {c.strategic && <Tag>Strategic</Tag>}
          </span>
        )
      }
      footer={
        c && (
          <>
            <Btn variant="subtle" onClick={onClose}>
              Close
            </Btn>
            <Btn variant="outline" icon={FileText} onClick={() => onQuote(c)}>
              Start quote
            </Btn>
            <Btn icon={ArrowRight} onClick={() => onOpen(c)}>
              Open customer
            </Btn>
          </>
        )
      }
    >
      {c && (
        <>
          {c.status === "BLOCKED" && (
            <InfoBanner tone="danger" title="Quotes can’t be created">
              This customer is blocked in the source system (CUSTOMER_BLOCKED).
            </InfoBanner>
          )}
          <section className="bg-card border border-border rounded-xl px-5">
            <DetailGrid
              items={[
                { label: "Geography", value: <Locked owner={c.sourceSystem}>{c.geography}</Locked> },
                { label: "Channel", value: c.channel },
                { label: "Industry", value: c.industry },
                { label: "Tier", value: c.tier },
                { label: "Owner", value: c.owner },
                { label: "Source", value: <span className="font-mono text-sm">{c.sourceSystem} · {c.sourceId}</span> },
              ]}
            />
          </section>

          <section aria-labelledby="qv-hier" className="bg-card border border-border rounded-xl p-5">
            <h3 id="qv-hier" className="text-base font-semibold mb-3">
              Hierarchy <span className="text-sm font-normal text-muted-foreground">· level {c.level} of {MAX_HIERARCHY_DEPTH}</span>
            </h3>
            <ul className="space-y-2 text-sm">
              {parent && (
                <li>
                  <span className="text-muted-foreground">Parent: </span>
                  <button type="button" className="text-brand font-medium hover:underline" onClick={() => onSelect(parent)}>
                    {parent.name}
                  </button>
                </li>
              )}
              <li>
                <span className="text-muted-foreground">Children: </span>
                {kids.length === 0
                  ? "None"
                  : kids.map((k, i) => (
                      <span key={k.id}>
                        {i > 0 && ", "}
                        <button type="button" className="text-brand font-medium hover:underline" onClick={() => onSelect(k)}>
                          {k.name}
                        </button>
                      </span>
                    ))}
              </li>
            </ul>
          </section>
          <p className="text-xs text-muted-foreground">Name, parent and geography are owned by the source system and are read-only here.</p>
        </>
      )}
    </Drawer>
  );
}
