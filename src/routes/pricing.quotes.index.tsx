import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { FileText, Plus } from "lucide-react";
import {
  Btn,
  DataTable,
  EmptyState,
  FilterPills,
  InfoBanner,
  LinkBtn,
  ListHeader,
  PillTabs,
  PricingLayout,
  RecordLink,
  StatusPill,
  Tag,
  humanize,
  money,
  pct,
  type Column,
} from "@/components/pricing/kit";
import { RequireAccess, Secure, pctBand } from "@/components/pricing/access";
import { customerById } from "@/lib/pricing/data";
import { QUOTES, QUOTE_STATUSES, SYNC_STATUSES, priceQuote, type Quote, type QuoteStatus, type SyncStatus } from "@/lib/pricing/deals";
import { effectiveStatus } from "@/lib/pricing/cpq";
import { userName, useSession } from "@/lib/pricing/session";
import { downloadCsv } from "@/lib/pricing/csv";

export const Route = createFileRoute("/pricing/quotes/")({
  head: () => ({ meta: [{ title: "Quotes · Rebate Ninja" }] }),
  component: Page,
});

type Scope = "mine" | "team";
type Row = Quote & { shown: QuoteStatus; net: number; discountPct: number; marginPct: number };

const SYNC_TONE: Record<SyncStatus, "success" | "danger" | "warning" | "info" | "neutral"> = { SUCCESS: "success", FAILED: "danger", RETRYING: "warning", SENT: "info", PENDING: "neutral" };

function Page() {
  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "CPQ & quoting" }, { label: "Quotes" }]}>
      <RequireAccess roles={["PRICING_ADMIN", "SALES_REP", "SALES_MANAGER", "DEAL_DESK", "FINANCE_CONTROLLER"]}>
        <QuoteList />
      </RequireAccess>
    </PricingLayout>
  );
}

function QuoteList() {
  const { user, own, can, access } = useSession();
  const navigate = useNavigate();
  const ownOnly = own("CPQ");
  const [scope, setScope] = useState<Scope>(ownOnly ? "mine" : "team");
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<QuoteStatus[]>([]);
  const [syncs, setSyncs] = useState<SyncStatus[]>([]);

  // Portal quotes belong to the partner workflow and are listed in the partner portal.
  const all = useMemo<Row[]>(
    () =>
      QUOTES.map((q) => {
        const p = priceQuote(q);
        return { ...q, shown: effectiveStatus(q), net: p.totals.net, discountPct: p.totals.discountPct, marginPct: p.totals.marginPct };
      }),
    [],
  );
  const scoped = all.filter((q) => (ownOnly || scope === "mine" ? q.ownerId === user.id : true));
  const rows = scoped
    .filter(
      (q) =>
        (!search || `${q.id} ${q.name} ${customerById(q.customerId)?.name ?? ""} ${q.crmOpportunityId ?? ""}`.toLowerCase().includes(search.toLowerCase())) &&
        (statuses.length === 0 || statuses.includes(q.shown)) &&
        (syncs.length === 0 || (q.sync && syncs.includes(q.sync.status))),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const filtered = !!(search || statuses.length || syncs.length);
  const clear = () => {
    setSearch("");
    setStatuses([]);
    setSyncs([]);
  };
  const canCreate = can("CPQ", "E");
  const marginAccess = access("marginPct");

  const columns: Column<Row>[] = [
    { key: "id", header: "Quote", className: "whitespace-nowrap", cell: (q) => <RecordLink to="/pricing/quotes/$id" params={{ id: q.id }}>{q.id}</RecordLink> },
    {
      key: "name",
      header: "Name",
      className: "min-w-56",
      cell: (q) => (
        <div>
          <div className="font-medium">{q.name}</div>
          <div className="text-xs text-muted-foreground">
            {customerById(q.customerId)?.name ?? q.customerId}
            {q.partnerId && <> · <Tag tone="info">Partner portal</Tag></>}
          </div>
        </div>
      ),
    },
    { key: "owner", header: "Owner", className: "whitespace-nowrap", cell: (q) => userName(q.ownerId) },
    { key: "rev", header: "Rev.", align: "right", cell: (q) => <span className="tabular-nums">{q.revision}</span> },
    { key: "net", header: "Net value", align: "right", cell: (q) => <span className="tabular-nums">{money(q.net, q.currency)}</span> },
    { key: "disc", header: "Discount", align: "right", cell: (q) => <span className="tabular-nums">{pct(-q.discountPct)}</span> },
    ...(marginAccess === "HIDE"
      ? []
      : [{ key: "margin", header: "Margin", align: "right" as const, cell: (q: Row) => <Secure field="marginPct" band={pctBand(q.marginPct)}><span className="tabular-nums">{q.marginPct.toFixed(1)}%</span></Secure> }]),
    { key: "status", header: "Status", cell: (q) => <StatusPill status={q.shown} /> },
    { key: "sync", header: "ERP sync", cell: (q) => (q.sync ? <StatusPill status={q.sync.status} tone={SYNC_TONE[q.sync.status]} /> : <span className="text-muted-foreground">—</span>) },
    { key: "valid", header: "Valid until", cell: (q) => <span className="tabular-nums whitespace-nowrap">{q.validUntil}</span> },
  ];

  const exportCsv = () =>
    downloadCsv(
      "quotes.csv",
      rows.map((q) => ({ id: q.id, name: q.name, customer: customerById(q.customerId)?.name, owner: userName(q.ownerId), status: q.shown, revision: q.revision, net: q.net, discountPct: q.discountPct, ...(marginAccess === "SHOW" ? { marginPct: q.marginPct } : {}), sync: q.sync?.status ?? "", validUntil: q.validUntil })),
    );

  return (
    <>
      <ListHeader
        title="Quotes"
        count={rows.length}
        noun="quote"
        subtitle={ownOnly ? "Quotes you own. Sales representatives only see their own quotes." : "Quotes across the team, priced in real time by the pricing engine."}
        search={search}
        onSearch={setSearch}
        actions={
          <>
            <Btn variant="subtle" onClick={exportCsv} disabled={!rows.length}>
              Export CSV
            </Btn>
            {canCreate && (
              <LinkBtn to="/pricing/quotes/new" icon={Plus}>
                Create quote
              </LinkBtn>
            )}
          </>
        }
      />

      {!ownOnly && (
        <PillTabs<Scope>
          tabs={[
            { key: "mine", label: "My quotes", count: all.filter((q) => q.ownerId === user.id).length },
            { key: "team", label: "Team quotes", count: all.length },
          ]}
          active={scope}
          onChange={setScope}
        />
      )}
      {ownOnly && (
        <InfoBanner title="Opening a quote from the CRM">
          From a Salesforce opportunity, use <b>Guided pricing</b> — the account and opportunity are filled in and you stay signed in.{" "}
          <LinkBtn to="/pricing/quotes/new" search={{ opportunity: "OPP-1" }} variant="ghost" size="sm">
            Try it with OPP-1
          </LinkBtn>
        </InfoBanner>
      )}

      <div className="flex flex-wrap items-center gap-x-6">
        <FilterPills<QuoteStatus>
          label="Status"
          selected={statuses}
          onChange={setStatuses}
          options={QUOTE_STATUSES.map((s) => ({ key: s, label: humanize(s), count: scoped.filter((q) => q.shown === s).length })).filter((o) => o.count > 0)}
        />
        <FilterPills<SyncStatus>
          label="ERP sync"
          selected={syncs}
          onChange={setSyncs}
          options={SYNC_STATUSES.map((s) => ({ key: s, label: humanize(s), count: scoped.filter((q) => q.sync?.status === s).length })).filter((o) => o.count > 0)}
        />
      </div>

      <DataTable<Row>
        caption="Quotes, most recently updated first"
        rows={rows}
        rowKey={(q) => q.id}
        onRowClick={(q) => navigate({ to: "/pricing/quotes/$id", params: { id: q.id } })}
        pageSize={25}
        columns={columns}
        empty={
          filtered ? (
            <EmptyState icon={FileText} title={search ? `No quotes match “${search}”` : "No quotes match these filters"} action={<Btn variant="subtle" onClick={clear}>Clear filters</Btn>}>
              Try a different search term or remove a filter.
            </EmptyState>
          ) : (
            <EmptyState icon={FileText} title={scope === "mine" ? "You don't own any quotes yet" : "No quotes yet"} action={canCreate ? <LinkBtn to="/pricing/quotes/new" icon={Plus}>Create quote</LinkBtn> : undefined}>
              Quotes are priced in real time and route to approval when a discount or margin is outside policy.
            </EmptyState>
          )
        }
      />
    </>
  );
}
