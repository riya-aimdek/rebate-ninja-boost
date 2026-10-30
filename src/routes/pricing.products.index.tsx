import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUp, ArrowUpDown, Package } from "lucide-react";
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
  Locked,
  Price,
  PricingLayout,
  RecordLink,
  StatusPill,
  SyncStatus,
  Tag,
  humanize,
  inputCls,
  notifySuccess,
  type Column,
} from "@/components/pricing/kit";
import { PRODUCTS, PRODUCT_STATUSES, SYNC_JOBS, type Product, type ProductStatus } from "@/lib/pricing/data";
import { sortBy, type SortDir } from "@/lib/pricing/csv";

export const Route = createFileRoute("/pricing/products/")({
  head: () => ({ meta: [{ title: "Products · Rebate Ninja" }] }),
  component: Page,
});

/** Last nightly ERP product sync (US-MD-01). */
const PRODUCT_SYNC = SYNC_JOBS.find((j) => j.id === "SYNC-PROD-1029")!;

type SortKey = "productId" | "sku" | "name" | "category" | "brand" | "cost" | "lifecycleStatus" | "lastUpdated";

function Page() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [statuses, setStatuses] = useState<ProductStatus[]>([]);
  const [category, setCategory] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: "productId", dir: "asc" });
  const [syncedAt, setSyncedAt] = useState<string>();
  const [refreshing, setRefreshing] = useState(false);
  const [preview, setPreview] = useState<Product | null>(null);

  const refresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setRefreshing(false);
      setSyncedAt(new Date().toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }));
      notifySuccess("Products refreshed", "Loaded the latest ERP product master.");
    }, 700);
  };
  const clearFilters = () => {
    setQ("");
    setStatuses([]);
    setCategory("all");
  };

  const categories = Array.from(new Set(PRODUCTS.map((p) => p.category))).sort();

  const rows = useMemo(() => {
    const t = q.toLowerCase();
    const filtered = PRODUCTS.filter(
      (p) =>
        (!t || [p.productId, p.sku, p.name, p.brand, p.category].some((v) => v.toLowerCase().includes(t))) &&
        (statuses.length === 0 || statuses.includes(p.lifecycleStatus)) &&
        (category === "all" || p.category === category),
    );
    return sortBy(filtered, (p) => p[sort.key] as string | number, sort.dir);
  }, [q, statuses, category, sort]);

  const head = (label: string, key: SortKey) => {
    const on = sort.key === key;
    const Icon = !on ? ArrowUpDown : sort.dir === "asc" ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        className="inline-flex items-center gap-1.5"
        onClick={() => setSort({ key, dir: on && sort.dir === "asc" ? "desc" : "asc" })}
        aria-label={on ? `${label}, sorted ${sort.dir === "asc" ? "ascending" : "descending"}. Sort ${sort.dir === "asc" ? "descending" : "ascending"}` : `Sort by ${label}`}
      >
        {label}
        <Icon className={`size-3.5 ${on ? "opacity-100" : "opacity-50"}`} aria-hidden />
      </button>
    );
  };

  const columns: Column<Product>[] = [
    { key: "id", header: head("Product ID", "productId"), className: "whitespace-nowrap", cell: (p) => <span className="font-mono text-xs">{p.productId}</span> },
    { key: "sku", header: head("SKU", "sku"), className: "whitespace-nowrap", cell: (p) => <span className="font-mono text-xs">{p.sku}</span> },
    { key: "name", header: head("Name", "name"), cell: (p) => <RecordLink to="/pricing/products/$id" params={{ id: p.productId }}>{p.name}</RecordLink> },
    { key: "category", header: head("Category", "category"), cell: (p) => p.category },
    { key: "brand", header: head("Brand", "brand"), className: "whitespace-nowrap", cell: (p) => p.brand },
    { key: "uom", header: "UoM", cell: (p) => p.uom },
    { key: "cost", header: head("Base cost", "cost"), align: "right", cell: (p) => <Price value={p.cost} currency={p.currency} uom={p.uom} /> },
    { key: "status", header: head("Lifecycle", "lifecycleStatus"), cell: (p) => <StatusPill status={p.lifecycleStatus} /> },
    { key: "updated", header: head("Last updated", "lastUpdated"), cell: (p) => <span className="text-muted-foreground whitespace-nowrap">{p.lastUpdated}</span> },
  ];

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Products" }]}>
      <ListHeader
        title="Products"
        noun="product"
        count={rows.length}
        subtitle="Synced from the ERP. Only pricing attributes are edited here."
        search={q}
        onSearch={setQ}
        filterCount={category !== "all" ? 1 : 0}
        onFilter={() => setShowFilters((s) => !s)}
      />

      <SyncStatus job={PRODUCT_SYNC} syncedAt={syncedAt} onRefresh={refresh} refreshing={refreshing} noun="product records" />

      <FilterPills<ProductStatus>
        label="Lifecycle"
        selected={statuses}
        onChange={setStatuses}
        options={PRODUCT_STATUSES.map((s) => ({ key: s, label: humanize(s), count: PRODUCTS.filter((p) => p.lifecycleStatus === s).length }))}
      />

      {showFilters && (
        <div className="bg-card border border-border rounded-xl p-4 mb-4 flex flex-wrap gap-4 items-end">
          <Field label="Category" className="w-full sm:w-64">
            <select className={inputCls} value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="all">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
      )}

      {category !== "all" && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <FilterChip label={`Category: ${category}`} onRemove={() => setCategory("all")} />
        </div>
      )}

      <DataTable
        caption="Products"
        columns={columns}
        rows={rows}
        rowKey={(p) => p.productId}
        selectedKey={preview?.productId ?? null}
        onRowClick={setPreview}
        pageSize={25}
        empty={
          <EmptyState
            icon={Package}
            title={q ? `No products match “${q}”` : "No products match these filters"}
            action={
              <Btn variant="subtle" onClick={clearFilters}>
                Clear filters
              </Btn>
            }
          >
            Products arrive from the ERP. Try a different search term or remove a filter.
          </EmptyState>
        }
      />

      <ProductQuickView product={preview} onClose={() => setPreview(null)} onOpen={(p) => navigate({ to: "/pricing/products/$id", params: { id: p.productId } })} />
    </PricingLayout>
  );
}

/** Row preview that keeps the list in place (Option C drawer). Full record stays one click away. */
function ProductQuickView({ product: p, onClose, onOpen }: { product: Product | null; onClose: () => void; onOpen: (p: Product) => void }) {
  return (
    <Drawer
      open={!!p}
      onClose={onClose}
      size="md"
      title={p?.name ?? ""}
      subtitle={
        p && (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{p.productId}</span>
            <StatusPill status={p.lifecycleStatus} />
            <Tag tone="brand">{p.productSegment}</Tag>
          </span>
        )
      }
      footer={
        p && (
          <>
            <Btn variant="subtle" onClick={onClose}>
              Close
            </Btn>
            <Btn icon={ArrowRight} onClick={() => onOpen(p)}>
              Open product
            </Btn>
          </>
        )
      }
    >
      {p && (
        <>
          {p.lifecycleStatus === "BLOCKED" && (
            <InfoBanner tone="danger" title="Can’t be added to price lists">
              Blocked in the ERP. Price list lines for this product are rejected with PRODUCT_BLOCKED.
            </InfoBanner>
          )}
          {p.lifecycleStatus === "END_OF_LIFE" && (
            <InfoBanner tone="warning" title="End of life">
              You can still add it to a draft price list; a warning is shown on the line.
            </InfoBanner>
          )}
          <section className="bg-card border border-border rounded-xl px-5">
            <DetailGrid
              items={[
                { label: "SKU", value: <Locked>{p.sku}</Locked> },
                { label: "Unit of measure", value: <Locked>{p.uom}</Locked> },
                { label: "Category", value: <Locked>{p.category}</Locked> },
                { label: "Brand", value: <Locked>{p.brand}</Locked> },
                { label: "Base cost", value: <Locked><Price value={p.cost} currency={p.currency} uom={p.uom} /></Locked>, full: true },
                { label: "Source", value: <span className="font-mono text-sm">{p.sourceSystem} · {p.sourceId}</span> },
                { label: "Last updated", value: p.lastUpdated },
              ]}
            />
          </section>
          <p className="text-xs text-muted-foreground">
            Fields with a lock are owned by the ERP. Change them in the ERP; they update on the next sync. Costs, price lists and lineage are on the full
            product page.
          </p>
        </>
      )}
    </Drawer>
  );
}
