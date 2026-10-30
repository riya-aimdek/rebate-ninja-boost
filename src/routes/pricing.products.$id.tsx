import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { AlertTriangle, ArrowLeft, Lock, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  DataTable,
  DetailGrid,
  DetailTitle,
  EmptyState,
  Field,
  InfoBanner,
  LinkBtn,
  Locked,
  Modal,
  PillTabs,
  Price,
  PricingLayout,
  RecordLink,
  StatusPill,
  Tag,
  humanize,
  inputCls,
} from "@/components/pricing/kit";
import { COSTS, PRICE_LISTS, PRODUCT_SEGMENTS, PRODUCTS, type CostRecord } from "@/lib/pricing/data";

export const Route = createFileRoute("/pricing/products/$id")({
  head: ({ params }) => {
    const p = PRODUCTS.find((x) => x.productId === params.id || x.sku === params.id);
    return { meta: [{ title: `${p?.name ?? "Product"} · Products · Rebate Ninja` }] };
  },
  component: Page,
});

type EditErrors = { segment?: string; minOrderMultiple?: string };

type TabKey = "details" | "costs" | "lists" | "source";

const ErpValue = Locked;

function Page() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const product = PRODUCTS.find((p) => p.productId === id || p.sku === id);
  const [tab, setTab] = useState<TabKey>("details");
  const [segment, setSegment] = useState(product?.productSegment ?? "");
  const [ext, setExt] = useState({ pricingFamily: "Core range", minOrderMultiple: "1" });
  const [editOpen, setEditOpen] = useState(false);
  const [draft, setDraft] = useState({ segment, ...ext });
  const [errors, setErrors] = useState<EditErrors>({});
  const [saving, setSaving] = useState(false);

  if (!product) {
    return (
      <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Products", to: "/pricing/products" }, { label: id }]}>
        <EmptyState
          title={`Product ${id} not found`}
          action={
            <LinkBtn to="/pricing/products" variant="outline" icon={ArrowLeft}>
              Back to products
            </LinkBtn>
          }
        >
          It may not have been synchronised from the ERP yet.
        </EmptyState>
      </PricingLayout>
    );
  }

  const costs = COSTS.filter((c) => c.sku === product.sku);
  const lines = PRICE_LISTS.flatMap((l) => l.lines.filter((ln) => ln.sku === product.sku || ln.sku === product.productId).map((ln) => ({ list: l, line: ln })));
  const dirty = draft.segment !== segment || draft.pricingFamily !== ext.pricingFamily || draft.minOrderMultiple !== ext.minOrderMultiple;

  const save = () => {
    const e: EditErrors = {};
    if (!draft.segment) e.segment = "Choose a product segment.";
    const mom = Number(draft.minOrderMultiple);
    if (!draft.minOrderMultiple || !Number.isInteger(mom) || mom < 1) e.minOrderMultiple = "Enter a whole number of 1 or more.";
    setErrors(e);
    if (e.segment || e.minOrderMultiple) {
      // Focus the first invalid field so keyboard and screen-reader users land on the fix.
      document.getElementById(e.segment ? "pa-segment" : "pa-mom")?.focus();
      return;
    }
    setSaving(true);
    setTimeout(() => {
      setSegment(draft.segment);
      setExt({ pricingFamily: draft.pricingFamily, minOrderMultiple: draft.minOrderMultiple });
      setSaving(false);
      setEditOpen(false);
      toast.success("Pricing attributes saved", { description: "Audit entry written (who, what, when)." });
    }, 500);
  };

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Products", to: "/pricing/products" }, { label: product.name }]}>
      <DetailTitle
        title={product.name}
        subtitle={`${product.productId} · SKU ${product.sku}`}
        status={product.lifecycleStatus}
        chips={
          <>
            <Tag>{product.category}</Tag>
            <Tag tone="brand">{segment}</Tag>
          </>
        }
        actions={
          <Btn icon={Pencil} onClick={() => { setDraft({ segment, ...ext }); setErrors({}); setEditOpen(true); }}>
            Edit pricing attributes
          </Btn>
        }
      />

      {product.lifecycleStatus === "BLOCKED" && (
        <InfoBanner tone="danger" title="Product blocked">
          This product cannot be added to price lists (PRODUCT_BLOCKED). Lines referencing it are rejected.
        </InfoBanner>
      )}
      {product.lifecycleStatus === "END_OF_LIFE" && (
        <InfoBanner tone="warning" title="End-of-life product">
          You can still add it to a draft price list; a warning is shown on the line.
        </InfoBanner>
      )}

      <PillTabs<TabKey>
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "details", label: "Details" },
          { key: "costs", label: "Costs", count: costs.length },
          { key: "lists", label: "Price lists", count: lines.length },
          { key: "source", label: "Source & lineage" },
        ]}
      />

      {tab === "details" && (
        <div className="space-y-6">
          <Card title="Product details" subtitle={<span className="inline-flex items-center gap-1.5"><Lock className="size-3.5" aria-hidden /> Fields with a lock are owned by the ERP and are read-only here.</span>}>
            <DetailGrid
              items={[
                { label: "Product ID", value: <ErpValue>{product.productId}</ErpValue> },
                { label: "SKU", value: <ErpValue>{product.sku}</ErpValue> },
                { label: "Name", value: <ErpValue>{product.name}</ErpValue> },
                { label: "Description", value: <ErpValue>{product.description}</ErpValue> },
                { label: "Category", value: <ErpValue>{product.category}</ErpValue> },
                { label: "Brand", value: <ErpValue>{product.brand}</ErpValue> },
                { label: "Unit of measure", value: <ErpValue>{product.uom}</ErpValue> },
                { label: "Base cost", value: <ErpValue><Price value={product.cost} currency={product.currency} uom={product.uom} /></ErpValue> },
                { label: "Currency", value: <ErpValue>{product.currency}</ErpValue> },
                { label: "Lifecycle status", value: <StatusPill status={product.lifecycleStatus} /> },
                { label: "Owner", value: product.owner },
                { label: "Effective dates", value: <span className="tabular-nums">{product.effectiveFrom} → {product.effectiveTo ?? "Open-ended"}</span> },
                { label: "Last updated", value: product.lastUpdated },
                {
                  label: "Validation errors",
                  value:
                    product.validationErrors.length === 0 ? (
                      <span className="text-success">None</span>
                    ) : (
                      <ul className="space-y-1">
                        {product.validationErrors.map((e) => (
                          <li key={e} className="flex items-center gap-1.5 text-destructive">
                            <AlertTriangle className="size-4" aria-hidden /> {e}
                          </li>
                        ))}
                      </ul>
                    ),
                },
              ]}
            />
          </Card>
          <Card title="Pricing attributes" subtitle="Editable in the pricing platform">
            <DetailGrid
              items={[
                { label: "Product segment", value: segment },
                { label: "Pricing family (extension)", value: ext.pricingFamily },
                { label: "Min order multiple (extension)", value: ext.minOrderMultiple },
              ]}
            />
          </Card>
        </div>
      )}

      {tab === "costs" && (
        <DataTable<CostRecord>
          caption={`Cost records for ${product.name}`}
          rows={costs}
          rowKey={(c) => c.id}
          empty="No cost records received for this product."
          columns={[
            { key: "type", header: "Cost type", cell: (c) => humanize(c.costType) },
            { key: "plant", header: "Plant", cell: (c) => c.plant },
            { key: "amt", header: "Amount", align: "right", cell: (c) => <Price value={c.amount} currency={c.currency} /> },
            { key: "from", header: "Effective from", cell: (c) => <span className="whitespace-nowrap tabular-nums">{c.effectiveFrom}</span> },
            { key: "to", header: "Effective to", cell: (c) => <span className="whitespace-nowrap tabular-nums">{c.effectiveTo ?? "—"}</span> },
            { key: "src", header: "Source", cell: (c) => c.source },
            { key: "st", header: "Status", cell: (c) => <StatusPill status={c.status} /> },
          ]}
        />
      )}

      {tab === "lists" && (
        <DataTable
          caption={`Price lists containing ${product.name}`}
          rows={lines}
          rowKey={(r) => `${r.list.id}-${r.line.id}`}
          onRowClick={(r) => navigate({ to: "/pricing/price-lists/$id", params: { id: r.list.id } })}
          empty="This product is not on any price list."
          columns={[
            { key: "list", header: "Price list", cell: (r) => <RecordLink to="/pricing/price-lists/$id" params={{ id: r.list.id }}>{r.list.name}</RecordLink> },
            { key: "type", header: "Type", cell: (r) => humanize(r.list.type) },
            { key: "st", header: "Status", cell: (r) => <StatusPill status={r.list.status} /> },
            { key: "v", header: "Version", cell: (r) => `v${r.list.version}` },
            { key: "qty", header: "Min qty", align: "right", cell: (r) => r.line.minQty },
            { key: "price", header: "Price", align: "right", cell: (r) => <Price value={r.line.price} currency={r.list.currency} uom={r.line.uom} /> },
          ]}
        />
      )}

      {tab === "source" && (
        <Card title="Source & lineage">
          <DetailGrid
            items={[
              { label: "Source system", value: product.sourceSystem },
              { label: "Source identifier", value: <span className="font-mono">{product.sourceId}</span> },
              { label: "Import timestamp", value: product.importedAt },
              { label: "Last sync job", value: "SYNC-PROD-1029 (nightly batch)" },
              { label: "Product hierarchy", value: product.hierarchy.join(" › "), full: true },
            ]}
          />
        </Card>
      )}

      <Modal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        dismissible={!dirty && !saving}
        title="Edit pricing attributes"
        subtitle="ERP-owned fields (identity, description, UoM, base cost) cannot be edited."
        footer={
          <>
            <Btn variant="subtle" onClick={() => setEditOpen(false)} disabled={saving}>
              Cancel
            </Btn>
            <Btn type="submit" form="pricing-attributes" loading={saving}>
              Save
            </Btn>
          </>
        }
      >
        <form
          id="pricing-attributes"
          className="grid gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <p className="text-xs text-muted-foreground">
            <span className="text-destructive" aria-hidden>*</span> Required
          </p>
          <Field label="Product segment" required error={errors.segment}>
            <select id="pa-segment" className={inputCls} value={draft.segment} onChange={(e) => setDraft({ ...draft, segment: e.target.value })}>
              <option value="">Select segment…</option>
              {PRODUCT_SEGMENTS.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Pricing family (extension attribute)">
            <input className={inputCls} value={draft.pricingFamily} onChange={(e) => setDraft({ ...draft, pricingFamily: e.target.value })} />
          </Field>
          <Field label="Min order multiple (extension attribute)" required error={errors.minOrderMultiple} hint="Whole number, 1 or more">
            <input
              id="pa-mom"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              className={inputCls}
              value={draft.minOrderMultiple}
              onChange={(e) => setDraft({ ...draft, minOrderMultiple: e.target.value })}
            />
          </Field>
          <Field label="Description" hint="Owned by ERP — read-only">
            <input className={`${inputCls} bg-muted`} value={product.description} readOnly />
          </Field>
        </form>
      </Modal>
    </PricingLayout>
  );
}
