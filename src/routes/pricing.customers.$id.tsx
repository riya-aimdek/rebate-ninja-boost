import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { CustomerTree } from "@/components/pricing/CustomerTree";
import { ArrowLeft, Lock, Star } from "lucide-react";
import {
  Card,
  DataTable,
  DetailGrid,
  DetailTitle,
  RecordId,
  Locked,
  EmptyState,
  Flag,
  InfoBanner,
  LinkBtn,
  PillTabs,
  PricingLayout,
  RecordLink,
  StatusPill,
  Tag,
  humanize,
  money,
} from "@/components/pricing/kit";
import { MAX_HIERARCHY_DEPTH, SEGMENT_HISTORY, childrenOf, customerById, type Customer } from "@/lib/pricing/data";

type TabKey = "details" | "hierarchy" | "segments" | "source";
const TABS: TabKey[] = ["details", "hierarchy", "segments", "source"];

export const Route = createFileRoute("/pricing/customers/$id")({
  // Tab lives in the URL so Back and shared links return to the same view.
  validateSearch: (s: Record<string, unknown>): { tab?: TabKey } => ({
    tab: TABS.includes(s.tab as TabKey) && s.tab !== "details" ? (s.tab as TabKey) : undefined,
  }),
  head: ({ params }) => ({ meta: [{ title: `${customerById(params.id)?.name ?? "Customer"} · Customers · Rebate Ninja` }] }),
  component: Page,
});

const Ro = ({ children }: { children: React.ReactNode }) => <Locked owner="the source system">{children}</Locked>;

function ancestors(c: Customer): Customer[] {
  const out: Customer[] = [];
  let cur = c.parentId ? customerById(c.parentId) : undefined;
  while (cur) {
    out.unshift(cur);
    cur = cur.parentId ? customerById(cur.parentId) : undefined;
  }
  return out;
}

/** The customer's whole family: top-level ancestor plus every descendant. */
function family(root: Customer): Customer[] {
  const out: Customer[] = [root];
  for (let i = 0; i < out.length; i++) out.push(...childrenOf(out[i].id));
  return out;
}

function Page() {
  const { id } = Route.useParams();
  const c = customerById(id);
  const navigate = useNavigate();
  const tab = Route.useSearch().tab ?? "details";
  const setTab = (t: TabKey) =>
    navigate({ to: "/pricing/customers/$id", params: { id }, search: { tab: t === "details" ? undefined : t }, replace: true });

  if (!c) {
    return (
      <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Customers", to: "/pricing/customers" }, { label: id }]}>
        <EmptyState
          title={`Customer ${id} not found`}
          action={
            <LinkBtn to="/pricing/customers" variant="outline" icon={ArrowLeft}>
              Back to customers
            </LinkBtn>
          }
        >
          It may not have been synchronised from the CRM/ERP yet.
        </EmptyState>
      </PricingLayout>
    );
  }

  const chain = ancestors(c);
  const root = chain[0] ?? c;
  const history = SEGMENT_HISTORY.filter((h) => h.customerId === c.id).sort((a, b) => b.from.localeCompare(a.from));

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Customers", to: "/pricing/customers" }, { label: c.name }]}>
      <DetailTitle
        title={c.name}
        meta={[<RecordId key="id">{c.id}</RecordId>, `Level ${c.level} of ${MAX_HIERARCHY_DEPTH}`, `Owner ${c.owner}`, `Updated ${c.lastUpdated}`]}
        status={c.status}
        attributes={[
          { label: "Segment", value: c.segment },
          { value: c.tier },
          { label: "Channel", value: c.channel },
          ...(c.strategic ? [{ value: "Strategic account", tone: "warning" as const, icon: Star }] : []),
        ]}
      />

      {c.status === "BLOCKED" && (
        <InfoBanner tone="danger" title="Customer blocked">
          Quote creation is prevented for this customer (CUSTOMER_BLOCKED).
        </InfoBanner>
      )}

      <PillTabs<TabKey>
        idPrefix="customer"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "details", label: "Details" },
          { key: "hierarchy", label: "Hierarchy" },
          { key: "segments", label: "Segment history", count: history.length },
          { key: "source", label: "Source & lineage" },
        ]}
      />

      {/* One tabpanel wraps whichever tab is showing, so screen readers hear which tab owns the content. */}
      <div role="tabpanel" id={`customer-panel-${tab}`} aria-labelledby={`customer-tab-${tab}`}>
      {tab === "details" && (
        <Card title="Customer details" subtitle={<span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" aria-hidden /> Source attributes (name, parent, geography) are read-only in the platform.</span>}>
          <DetailGrid
            items={[
              { label: "Customer", value: <Ro>{c.name}</Ro> },
              { label: "Customer ID", value: c.id },
              {
                label: "Parent customer",
                value: <Ro>{c.parentId ? <RecordLink to="/pricing/customers/$id" params={{ id: c.parentId }}>{customerById(c.parentId)?.name ?? c.parentId}</RecordLink> : "— (top level)"}</Ro>,
              },
              {
                label: "Customer hierarchy",
                value: (
                  <span className="flex flex-wrap items-center gap-x-1.5">
                    {chain.map((x) => (
                      <span key={x.id} className="inline-flex items-center gap-1.5">
                        <RecordLink to="/pricing/customers/$id" params={{ id: x.id }}>{x.name}</RecordLink>
                        <span className="text-muted-foreground" aria-hidden>›</span>
                      </span>
                    ))}
                    <span aria-current="page">{c.name}</span>
                  </span>
                ),
              },
              { label: "Customer segment", value: c.segment },
              { label: "Industry", value: c.industry },
              { label: "Geography", value: <Ro>{c.geography}</Ro> },
              { label: "Channel", value: c.channel },
              { label: "Customer tier", value: c.tier },
              { label: "Strategic customer", value: c.strategic ? "Yes" : "No" },
              { label: "Annual revenue", value: <span className="tabular-nums">{money(c.annualRevenue, "GBP", 0)}</span> },
              { label: "Rolling 12-month volume", value: <span className="tabular-nums">{money(c.rolling12mVolume, "GBP", 0)}</span> },
              { label: "Status", value: <StatusPill status={c.status} /> },
              { label: "Owner", value: c.owner },
              { label: "Last updated", value: <span className="tabular-nums">{c.lastUpdated}</span> },
            ]}
          />
        </Card>
      )}

      {tab === "hierarchy" && (
        <Card
          title="Customer hierarchy"
          subtitle={`Synchronised from ${c.sourceSystem}, read-only here. Loops (HIERARCHY_CYCLE) and accounts deeper than level ${MAX_HIERARCHY_DEPTH} (HIERARCHY_TOO_DEEP) are rejected at sync.`}
        >
          {chain.length === 0 && childrenOf(c.id).length === 0 ? (
            <p className="text-sm text-muted-foreground">This customer has no parent or child accounts.</p>
          ) : (
            <CustomerTree
              nodes={family(root)}
              currentId={c.id}
              label={`Hierarchy of ${root.name}`}
              onSelect={(x) => x.id !== c.id && navigate({ to: "/pricing/customers/$id", params: { id: x.id }, search: { tab: "hierarchy" } })}
            />
          )}
        </Card>
      )}

      {tab === "segments" && (
        <DataTable
          caption={`Segment history for ${c.name}`}
          rows={history}
          rowKey={(h) => `${h.segment}-${h.from}`}
          empty={`No segment changes recorded. Current segment: ${c.segment}.`}
          columns={[
            { key: "seg", header: "Segment", cell: (h) => <Tag tone="brand">{h.segment}</Tag> },
            { key: "from", header: "From", cell: (h) => <span className="whitespace-nowrap tabular-nums">{h.from}</span> },
            { key: "to", header: "To", cell: (h) => (h.to ? <span className="whitespace-nowrap tabular-nums">{h.to}</span> : <StatusPill status="ACTIVE" label="Current" />) },
            { key: "m", header: "Method", cell: (h) => humanize(h.method) },
            { key: "r", header: "Reason", cell: (h) => <span className="text-muted-foreground">{h.reason ?? "—"}</span> },
            { key: "o", header: "Override", cell: (h) => (h.override ? <Flag tone="brand">Override</Flag> : "—") },
          ]}
        />
      )}

      {tab === "source" && (
        <Card title="Source & lineage">
          <DetailGrid
            items={[
              { label: "Source system", value: c.sourceSystem },
              { label: "Source system ID", value: <span className="font-mono">{c.sourceId}</span> },
              { label: "Import timestamp", value: c.importedAt },
              { label: "Last sync job", value: "SYNC-CUST-1029 (nightly batch)" },
              { label: "Lineage", value: `${c.sourceSystem} → Integration layer → Customer Master (${c.id})`, full: true },
            ]}
          />
        </Card>
      )}
      </div>
    </PricingLayout>
  );
}
