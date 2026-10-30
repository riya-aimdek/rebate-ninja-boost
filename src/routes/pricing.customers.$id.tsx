import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Building2, Lock, Star } from "lucide-react";
import {
  Card,
  DataTable,
  DetailGrid,
  DetailTitle,
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
import { CUSTOMERS, MAX_HIERARCHY_DEPTH, SEGMENT_HISTORY, childrenOf, customerById, type Customer } from "@/lib/pricing/data";

export const Route = createFileRoute("/pricing/customers/$id")({
  head: ({ params }) => ({ meta: [{ title: `${customerById(params.id)?.name ?? "Customer"} · Customers · Rebate Ninja` }] }),
  component: Page,
});

type TabKey = "details" | "hierarchy" | "segments" | "source";

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

function TreeNode({ c, currentId }: { c: Customer; currentId: string }) {
  const kids = childrenOf(c.id);
  const on = c.id === currentId;
  return (
    <li>
      <Link
        to="/pricing/customers/$id"
        params={{ id: c.id }}
        aria-current={on ? "page" : undefined}
        className={`inline-flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg border my-1 ${on ? "bg-navy text-navy-foreground border-navy" : "bg-card border-border hover:border-brand"}`}
      >
        <Building2 className="size-4" aria-hidden />
        <span className="font-medium">{c.name}</span>
        <span className={`text-xs ${on ? "text-navy-foreground/80" : "text-muted-foreground"}`}>L{c.level} · {c.segment}</span>
        {on && <span className="sr-only">(this customer)</span>}
        {c.status === "BLOCKED" && <StatusPill status="BLOCKED" />}
      </Link>
      {kids.length > 0 && (
        <ul className="ml-6 pl-4 border-l-2 border-border">
          {kids.map((k) => (
            <TreeNode key={k.id} c={k} currentId={currentId} />
          ))}
        </ul>
      )}
    </li>
  );
}

function Page() {
  const { id } = Route.useParams();
  const c = customerById(id);
  const [tab, setTab] = useState<TabKey>("details");

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
        subtitle={`Customer ID ${c.id} · Level ${c.level} of max ${MAX_HIERARCHY_DEPTH}`}
        status={c.status}
        chips={
          <>
            <Tag tone="brand">{c.segment}</Tag>
            <Tag>{c.tier}</Tag>
            {c.strategic && (
              <Tag tone="warning">
                <Star className="size-3 mr-1 fill-current" aria-hidden /> Strategic account
              </Tag>
            )}
          </>
        }
      />

      {c.status === "BLOCKED" && (
        <InfoBanner tone="danger" title="Customer blocked">
          Quote creation is prevented for this customer (CUSTOMER_BLOCKED).
        </InfoBanner>
      )}

      <PillTabs<TabKey>
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "details", label: "Details" },
          { key: "hierarchy", label: "Hierarchy" },
          { key: "segments", label: "Segment history", count: history.length },
          { key: "source", label: "Source & lineage" },
        ]}
      />

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
              { label: "Customer hierarchy", value: [...chain, c].map((x) => x.name).join(" › ") },
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
        <Card title="Customer hierarchy" subtitle={`Synchronised from ${c.sourceSystem}. Cycles are rejected (HIERARCHY_CYCLE) and levels beyond ${MAX_HIERARCHY_DEPTH} are rejected (HIERARCHY_TOO_DEEP).`}>
          <ul aria-label={`Hierarchy of ${root.name}`}>
            <TreeNode c={root} currentId={c.id} />
          </ul>
          {CUSTOMERS.filter((x) => x.parentId === c.id).length === 0 && c.parentId === undefined && (
            <p className="text-sm text-muted-foreground mt-3">This customer has no parent or children.</p>
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
    </PricingLayout>
  );
}
