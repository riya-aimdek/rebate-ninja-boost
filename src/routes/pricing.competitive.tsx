import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, Download, Lock, Plus, Radar, Rss, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  DataAsOf,
  DataTable,
  DetailGrid,
  Drawer,
  EmptyState,
  Field,
  FilterPills,
  Flag,
  InfoBanner,
  KpiTile,
  ListHeader,
  Modal,
  PillTabs,
  PricingLayout,
  Price,
  RecordLink,
  StatusPill,
  Tag,
  inputCls,
  pct,
  type ApiError,
  type Column,
} from "@/components/pricing/kit";
import {
  COMPETITOR_MAPPINGS,
  COMPETITOR_OBS,
  PRICE_LISTS,
  PRODUCTS,
  STALE_DAYS,
  productBySku,
  type CompetitorObs,
} from "@/lib/pricing/data";
import { TODAY, downloadCsv } from "@/lib/pricing/csv";

export const Route = createFileRoute("/pricing/competitive")({
  head: () => ({
    meta: [
      { title: "Competitive intelligence · Rebate Ninja" },
      { name: "description", content: "Competitor price monitoring alongside our price, with SKU mapping and stale-data handling." },
    ],
  }),
  component: CompetitivePage,
});

type TabKey = "obs" | "map" | "feed";
type Mapping = (typeof COMPETITOR_MAPPINGS)[number];

/** Our current price from the active UK base list. */
function ourPrice(sku: string) {
  const base = PRICE_LISTS.find((l) => l.id === "BL-001");
  const line = base?.lines.find((ln) => productBySku(ln.sku)?.sku === sku);
  return line?.price ?? null;
}

/** Our SKU linked to its product detail page. */
function SkuLink({ sku }: { sku: string }) {
  const p = productBySku(sku);
  return p ? <RecordLink to="/pricing/products/$id" params={{ id: p.productId }}>{sku}</RecordLink> : <span className="font-medium">{sku}</span>;
}

/** "2026-10-29 06:00" -> "29 Oct 2026, 06:00" without Date parsing (deterministic on server and client). */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtStamp(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(s);
  if (!m) return s;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}${m[4] ? `, ${m[4]}` : ""}`;
}

type Freshness = "FRESH" | "STALE";
const SOURCE_LABEL: Record<CompetitorObs["source"], string> = { FEED: "Feed", FILE: "File", MANUAL: "Manual" };

/** Our price minus the competitor's, as % of the competitor price (positive = we are more expensive). */
function gapPct(o: CompetitorObs) {
  const ours = ourPrice(o.sku);
  return ours === null ? null : ((ours - o.price) / o.price) * 100;
}

/** Time of the last scheduled competitor feed (PriceSpider, daily 06:00). */
const LAST_FEED_SYNC = new Date(`${TODAY}T06:00:00`);

const SAMPLE_FEED = [
  { competitor: "VoltDirect", competitorSku: "VD-W100", price: 103.49 },
  { competitor: "LightHub", competitorSku: "LH-6060-40", price: 27.5 },
  { competitor: "LightHub", competitorSku: "LH-DL10-W", price: 74.0 },
  { competitor: "VoltDirect", competitorSku: "VD-RCD63A", price: 35.9 },
];

function CompetitivePage() {
  const [tab, setTab] = useState<TabKey>("obs");
  const [obs, setObs] = useState<CompetitorObs[]>(COMPETITOR_OBS);
  const [maps, setMaps] = useState<Mapping[]>(COMPETITOR_MAPPINGS);
  const [q, setQ] = useState("");
  const [fresh, setFresh] = useState<Freshness[]>([]);
  const [preview, setPreview] = useState<CompetitorObs | null>(null);
  const navigate = useNavigate();
  const [showManual, setShowManual] = useState(false);
  const [feedResult, setFeedResult] = useState<null | { loaded: number; unmapped: string[] }>(null);
  const [loadingFeed, setLoadingFeed] = useState(false);
  const [syncedAt, setSyncedAt] = useState<Date>(LAST_FEED_SYNC);

  const rows = useMemo(
    () =>
      obs.filter(
        (o) =>
          (!q || o.sku.toLowerCase().includes(q.toLowerCase()) || o.competitor.toLowerCase().includes(q.toLowerCase())) &&
          (fresh.length === 0 || fresh.includes(o.ageDays > STALE_DAYS ? "STALE" : "FRESH")),
      ),
    [obs, q, fresh],
  );
  const stale = obs.filter((o) => o.ageDays > STALE_DAYS).length;
  const undercut = obs.filter((o) => {
    const ours = ourPrice(o.sku);
    return ours !== null && o.ageDays <= STALE_DAYS && o.price < ours;
  }).length;

  const columns: Column<CompetitorObs>[] = [
    {
      key: "sku",
      header: "SKU",
      className: "min-w-[180px]",
      cell: (o) => (
        <div>
          <SkuLink sku={o.sku} />
          <div className="text-xs text-muted-foreground">{productBySku(o.sku)?.name}</div>
        </div>
      ),
    },
    { key: "ours", header: "Our price", align: "right", cell: (o) => <Price value={ourPrice(o.sku)} currency="GBP" uom={productBySku(o.sku)?.uom} /> },
    {
      key: "comp",
      header: "Competitor",
      className: "whitespace-nowrap",
      cell: (o) => (
        <div>
          {o.competitor}
          <div className="text-xs text-muted-foreground">{o.competitorSku}</div>
        </div>
      ),
    },
    { key: "cp", header: "Competitor price", align: "right", cell: (o) => <Price value={o.price} currency={o.currency} /> },
    {
      key: "gap",
      header: "Gap %",
      align: "right",
      cell: (o) => {
        const g = gapPct(o);
        if (g === null) return "—";
        return (
          <span className={`tabular-nums font-semibold ${g > 0 ? "text-destructive" : "text-success"}`} title={g > 0 ? "We are more expensive" : "We are cheaper"}>
            {pct(g)}
            <span className="sr-only">{g > 0 ? " — we are more expensive" : " — we are cheaper"}</span>
          </span>
        );
      },
    },
    {
      key: "age",
      header: "Observation age",
      cell: (o) => (
        <div className="flex flex-col items-start gap-1 whitespace-nowrap">
          <span className="text-sm">
            {o.ageDays === 0 ? "Today" : `${o.ageDays} day${o.ageDays > 1 ? "s" : ""}`}
            <span className="text-xs text-muted-foreground"> · {fmtStamp(o.observedAt)}</span>
          </span>
          {o.ageDays > STALE_DAYS && <Flag tone="neutral">Stale — excluded from repricing</Flag>}
        </div>
      ),
    },
    { key: "src", header: "Source", cell: (o) => <Tag>{SOURCE_LABEL[o.source]}</Tag> },
  ];

  const exportCsv = () => {
    downloadCsv(
      `competitor-prices-${TODAY}.csv`,
      rows.map((o) => ({
        sku: o.sku,
        product: productBySku(o.sku)?.name ?? "",
        ourPrice: ourPrice(o.sku) ?? "",
        competitor: o.competitor,
        competitorSku: o.competitorSku,
        competitorPrice: o.price,
        currency: o.currency,
        observedAt: o.observedAt,
        ageDays: o.ageDays,
        stale: o.ageDays > STALE_DAYS ? "yes" : "no",
        source: o.source,
      })),
    );
    toast.success(`${rows.length} ${rows.length === 1 ? "observation" : "observations"} exported`);
  };

  const loadFeed = () => {
    setLoadingFeed(true);
    setTimeout(() => {
      setLoadingFeed(false);
      ingestFeed();
    }, 700);
  };

  const ingestFeed = () => {
    const unmapped: string[] = [];
    const added: CompetitorObs[] = [];
    SAMPLE_FEED.forEach((row, i) => {
      const m = maps.find((x) => x.competitorSku === row.competitorSku);
      if (!m) {
        unmapped.push(row.competitorSku);
        return;
      }
      added.push({
        id: `CO-F${Date.now()}-${i}`,
        sku: m.sku,
        competitor: row.competitor,
        competitorSku: row.competitorSku,
        price: row.price,
        currency: "GBP",
        observedAt: "2026-10-29 14:30",
        ageDays: 0,
        source: "FILE",
      });
    });
    setObs((o) => [...added, ...o]);
    setFeedResult({ loaded: added.length, unmapped });
    setSyncedAt(new Date());
    if (unmapped.length) {
      toast.warning(`${unmapped.length} unmapped ${unmapped.length === 1 ? "row" : "rows"} sent to the data quality log`, {
        description: `${unmapped.join(", ")} ${unmapped.length === 1 ? "is" : "are"} not mapped to a product. Map ${unmapped.length === 1 ? "it" : "them"} in SKU mapping, then load the feed again.`,
        action: { label: "Map SKU", onClick: () => setTab("map") },
      });
    } else toast.success(`${added.length} observations loaded`);
  };

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Price optimization" }, { label: "Competitive intelligence" }]}>
      <ListHeader
        title="Competitive intelligence"
        count={tab === "obs" ? rows.length : tab === "map" ? maps.length : undefined}
        noun={tab === "map" ? "mapping" : "observation"}
        subtitle="Competitor prices compared with our UK base list."
        search={tab === "obs" ? q : undefined}
        onSearch={tab === "obs" ? setQ : undefined}
        actions={
          <>
            {tab === "obs" && (
              <Btn variant="outline" icon={Download} onClick={exportCsv} disabled={rows.length === 0}>
                Export CSV
              </Btn>
            )}
            <Btn icon={Plus} onClick={() => setShowManual(true)}>
              Create observation
            </Btn>
          </>
        }
      />
      <InfoBanner
        tone="info"
        title="PriceSpider feed · daily at 06:00"
        action={
          tab !== "feed" ? (
            <Btn variant="outline" size="sm" icon={Rss} onClick={() => setTab("feed")}>
              Open feed
            </Btn>
          ) : undefined
        }
      >
        <DataAsOf at={syncedAt} />
        <span className="inline-flex items-center gap-1.5 mt-1">
          <Lock className="size-3.5 shrink-0" aria-hidden /> Internal data — hidden from Sales and Partner roles unless explicitly granted.
        </span>
      </InfoBanner>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <KpiTile label="Observations" value={obs.length} />
        <KpiTile label="Mapped competitor SKUs" value={maps.length} tone="info" />
        <KpiTile label="Competitor below our price" value={undercut} tone="danger" hint="Fresh observations only" />
        <KpiTile label="Stale observations" value={stale} tone="neutral" hint={`Older than ${STALE_DAYS} days — excluded from repricing`} />
      </div>

      <PillTabs
        tabs={[
          { key: "obs", label: "Observations", count: obs.length },
          { key: "map", label: "SKU mapping", count: maps.length },
          { key: "feed", label: "Feed" },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "obs" && (
        <>
          <FilterPills<Freshness>
            label="Freshness"
            selected={fresh}
            onChange={setFresh}
            multiple={false}
            options={[
              { key: "FRESH", label: "Fresh", count: obs.length - stale },
              { key: "STALE", label: "Stale", count: stale },
            ]}
          />
          <DataTable
            caption="Competitor price observations compared with our price"
            columns={columns}
            rows={rows}
            rowKey={(o) => o.id}
            onRowClick={setPreview}
            selectedKey={preview?.id ?? null}
            rowClassName={(o) => (o.ageDays > STALE_DAYS ? "text-muted-foreground" : "")}
            empty={
              q || fresh.length ? (
                <EmptyState
                  icon={Radar}
                  title={q ? `No observations match “${q}”` : "No observations match these filters"}
                  action={
                    <Btn
                      variant="subtle"
                      onClick={() => {
                        setQ("");
                        setFresh([]);
                      }}
                    >
                      Clear filters
                    </Btn>
                  }
                >
                  Try a different search term or remove the freshness filter.
                </EmptyState>
              ) : (
                <EmptyState
                  icon={Radar}
                  title="No competitor observations yet"
                  action={
                    <Btn icon={Plus} onClick={() => setShowManual(true)}>
                      Create observation
                    </Btn>
                  }
                >
                  Load the competitor feed or record a price you observed.
                </EmptyState>
              )
            }
          />
          <ObservationQuickView
            obs={preview}
            onClose={() => setPreview(null)}
            onOpenProduct={(id) => navigate({ to: "/pricing/products/$id", params: { id } })}
          />
        </>
      )}

      {tab === "map" && <MappingTab maps={maps} setMaps={setMaps} />}

      {tab === "feed" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Feed ingestion" subtitle="API feed or file upload. Each competitor SKU must be mapped to our SKU.">
            <div className="rounded-xl border-2 border-dashed border-border p-6 sm:p-8 text-center">
              <Upload className="size-8 text-brand mx-auto" aria-hidden />
              <div className="font-semibold mt-2 break-all">competitor_prices_2026-10-29.csv</div>
              <div className="text-xs text-muted-foreground">Sample feed · {SAMPLE_FEED.length} rows</div>
              <Btn className="mt-4" icon={Upload} onClick={loadFeed} loading={loadingFeed}>
                {loadingFeed ? "Loading feed…" : "Load feed"}
              </Btn>
            </div>
            <div role="status">
            {feedResult && (
              <div className="mt-5 space-y-3 text-sm">
                <div className="flex items-center gap-2">
                  <StatusPill status={feedResult.unmapped.length ? "PARTIAL_SUCCESS" : "SUCCEEDED"} />
                  {feedResult.loaded} loaded · {feedResult.unmapped.length} rejected
                </div>
                {feedResult.unmapped.map((s) => (
                  <div key={s} className="rounded-lg border border-destructive/30 bg-danger-soft px-3 py-2">
                    <b className="text-destructive">Unmapped competitor SKU</b> — {s} is not mapped to any product. Row written to the{" "}
                    <Link to="/pricing/data-quality" className="text-brand font-semibold hover:underline">
                      data quality log
                    </Link>
                    .{" "}
                    <button type="button" className="text-brand font-semibold hover:underline" onClick={() => setTab("map")}>
                      Map SKU
                    </button>
                  </div>
                ))}
              </div>
            )}
            </div>
          </Card>
          <Card title="Feed settings" subtitle="Managed by a pricing administrator in integration settings — shown read-only here.">
            <div className="space-y-4">
              <Field label="Feed source">
                <input className={`${inputCls} bg-muted border-transparent`} value="PriceSpider (API, daily 06:00)" readOnly />
              </Field>
              <Field label="Stale after (days)" hint="Stale observations are shown muted, flagged and excluded from repricing">
                <input className={`${inputCls} bg-muted border-transparent`} value={STALE_DAYS} readOnly />
              </Field>
              <div className="flex flex-col gap-1.5" role="group" aria-labelledby="comp-roles-label">
                <span id="comp-roles-label" className="text-sm font-medium text-foreground">
                  Roles allowed to view competitor data
                </span>
                <div className="flex flex-wrap gap-2">
                  {["Pricing Administrator", "Pricing Analyst", "Pricing Manager", "Deal Desk"].map((r) => (
                    <Tag key={r} tone="info">
                      {r}
                    </Tag>
                  ))}
                  <Tag tone="danger">Sales Rep — hidden</Tag>
                  <Tag tone="danger">Channel Partner — hidden</Tag>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {showManual && (
        <ManualEntryModal
          maps={maps}
          onClose={() => setShowManual(false)}
          onSave={(o) => {
            setObs((x) => [o, ...x]);
            setShowManual(false);
            setTab("obs");
            toast.success("Observation saved", { description: `${o.competitor} · ${o.sku} @ ${o.price.toFixed(2)}` });
          }}
        />
      )}
    </PricingLayout>
  );
}

function MappingTab({ maps, setMaps }: { maps: Mapping[]; setMaps: (fn: (m: Mapping[]) => Mapping[]) => void }) {
  const [competitor, setCompetitor] = useState("");
  const [cSku, setCSku] = useState("LH-DL10-W");
  const [sku, setSku] = useState("");
  const [err, setErr] = useState<ApiError | null>(null);
  const duplicate = maps.some((m) => m.competitor === competitor && m.competitorSku.toLowerCase() === cSku.trim().toLowerCase());
  const add = () => {
    setErr(null);
    const missing = !competitor ? "competitor" : !cSku.trim() ? "competitorSku" : !sku ? "sku" : null;
    if (missing) {
      const fix = { competitor: "Choose the competitor.", competitorSku: "Enter the competitor's SKU, e.g. LH-DL10-W.", sku: "Choose our SKU to map it to." }[missing];
      setErr({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: fix, field: missing });
      return;
    }
    if (duplicate) {
      setErr({ errorClass: "CONFLICT", code: "DUPLICATE_MAPPING", message: `${cSku} is already mapped for ${competitor}. Choose another competitor SKU.`, field: "competitorSku" });
      return;
    }
    setMaps((m) => [{ competitor, competitorSku: cSku, sku, mappedBy: "Riya Shah", mappedAt: "2026-10-29" }, ...m]);
    toast.success(`${cSku} mapped to ${sku}`);
    setCSku("");
  };
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
      <div className="xl:col-span-2">
        <DataTable
          caption="Competitor SKU mappings"
          columns={[
            { key: "c", header: "Competitor", cell: (m: Mapping) => m.competitor },
            { key: "cs", header: "Competitor SKU", className: "whitespace-nowrap", cell: (m: Mapping) => <span className="font-mono text-xs">{m.competitorSku}</span> },
            { key: "s", header: "Our SKU", className: "whitespace-nowrap", cell: (m: Mapping) => <SkuLink sku={m.sku} /> },
            { key: "n", header: "Product", cell: (m: Mapping) => productBySku(m.sku)?.name },
            { key: "b", header: "Mapped", className: "whitespace-nowrap", cell: (m: Mapping) => <span className="text-xs text-muted-foreground">{m.mappedBy} · {fmtStamp(m.mappedAt)}</span> },
          ]}
          rows={maps}
          rowKey={(m) => m.competitor + m.competitorSku}
        />
      </div>
      <Card title="Create mapping">
        <form
          noValidate
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            add();
          }}
        >
          <Field label="Competitor" required error={err?.field === "competitor" ? err.message : undefined}>
            <select value={competitor} onChange={(e) => setCompetitor(e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              {["VoltDirect", "BrightCo", "LightHub"].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field
            label="Competitor SKU"
            required
            error={err?.field === "competitorSku" ? err.message : duplicate && cSku ? `${cSku} is already mapped for ${competitor}.` : undefined}
          >
            <input value={cSku} onChange={(e) => setCSku(e.target.value)} className={inputCls} maxLength={40} placeholder="e.g. LH-DL10-W" />
          </Field>
          <Field label="Our SKU" required error={err?.field === "sku" ? err.message : undefined}>
            <select value={sku} onChange={(e) => setSku(e.target.value)} className={inputCls}>
              <option value="">Select…</option>
              {PRODUCTS.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.sku} — {p.name}
                </option>
              ))}
            </select>
          </Field>
          <div className="flex justify-end">
            <Btn type="submit" icon={Plus}>
              Save mapping
            </Btn>
          </div>

        </form>
      </Card>
    </div>
  );
}

function ManualEntryModal({ maps, onClose, onSave }: { maps: Mapping[]; onClose: () => void; onSave: (o: CompetitorObs) => void }) {
  const [mapKey, setMapKey] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState("2026-10-29");
  const [err, setErr] = useState<ApiError | null>(null);
  const save = () => {
    const m = maps.find((x) => x.competitor + "|" + x.competitorSku === mapKey);
    if (!m) return setErr({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Select a mapped competitor SKU. Unmapped SKUs must be mapped first.", field: "competitorSku" });
    if (!(Number(price) > 0)) return setErr({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Enter the observed price above 0, e.g. 34.99.", field: "price" });
    if (!date || date > TODAY) return setErr({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Choose a date on or before today.", field: "observedAt" });
    const age = Math.max(0, Math.round((new Date("2026-10-29").getTime() - new Date(date).getTime()) / 86_400_000));
    onSave({ id: `CO-M${Date.now()}`, sku: m.sku, competitor: m.competitor, competitorSku: m.competitorSku, price: Number(price), currency: "GBP", observedAt: `${date} 12:00`, ageDays: age, source: "MANUAL" });
  };
  return (
    <Modal
      open
      title="Create observation"
      subtitle="Record a competitor price you observed manually."
      onClose={onClose}
      dismissible={!mapKey && !price}
      footer={
        <>
          <Btn variant="subtle" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={save}>Save observation</Btn>
        </>
      }
    >
      <form
        noValidate
        className="grid grid-cols-1 sm:grid-cols-2 gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label="Competitor SKU (mapped)" required className="sm:col-span-2" error={err?.field === "competitorSku" ? err.message : undefined}>
          <select value={mapKey} onChange={(e) => setMapKey(e.target.value)} className={inputCls}>
            <option value="">Select…</option>
            {maps.map((m) => (
              <option key={m.competitor + m.competitorSku} value={m.competitor + "|" + m.competitorSku}>
                {m.competitor} · {m.competitorSku} → {m.sku}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Observed price (GBP)" required error={err?.field === "price" ? err.message : undefined}>
          <input type="number" step="0.01" min={0.01} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} className={inputCls} placeholder="e.g. 34.99" />
        </Field>
        <Field label="Observed on" required hint={`Older than ${STALE_DAYS} days is stale`} error={err?.field === "observedAt" ? err.message : undefined}>
          <input type="date" max={TODAY} value={date} onChange={(e) => setDate(e.target.value)} className={inputCls} />
        </Field>
        <button type="submit" className="sr-only" tabIndex={-1} aria-hidden>
          Save observation
        </button>
      </form>
    </Modal>
  );
}

/** Observation quick view (Option C drawer): both prices, the gap and provenance, with the product one click away. */
function ObservationQuickView({ obs: o, onClose, onOpenProduct }: { obs: CompetitorObs | null; onClose: () => void; onOpenProduct: (productId: string) => void }) {
  const product = o ? productBySku(o.sku) : undefined;
  const g = o ? gapPct(o) : null;
  return (
    <Drawer
      open={!!o}
      onClose={onClose}
      size="md"
      title={o ? `${o.competitor} · ${o.competitorSku}` : ""}
      subtitle={
        o && (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{o.sku}</span>
            {product && <span>{product.name}</span>}
            <Tag>{SOURCE_LABEL[o.source]}</Tag>
          </span>
        )
      }
      footer={
        o && (
          <>
            <Btn variant="subtle" onClick={onClose}>
              Close
            </Btn>
            {product && (
              <Btn icon={ArrowRight} onClick={() => onOpenProduct(product.productId)}>
                Open product
              </Btn>
            )}
          </>
        )
      }
    >
      {o && (
        <>
          {o.ageDays > STALE_DAYS && (
            <InfoBanner tone="warning" title="Stale observation">
              Older than {STALE_DAYS} days, so it is excluded from automated repricing until a fresh price arrives.
            </InfoBanner>
          )}
          <section className="bg-card border border-border rounded-xl px-5">
            <DetailGrid
              items={[
                { label: "Our price", value: <Price value={ourPrice(o.sku)} currency="GBP" uom={product?.uom} /> },
                { label: "Competitor price", value: <Price value={o.price} currency={o.currency} /> },
                {
                  label: "Gap",
                  value:
                    g === null ? (
                      "—"
                    ) : (
                      <span className={`tabular-nums ${g > 0 ? "text-destructive" : "text-success"}`}>
                        {pct(g)} · {g > 0 ? "we are more expensive" : "we are cheaper"}
                      </span>
                    ),
                  full: true,
                },
                { label: "Observed", value: `${fmtStamp(o.observedAt)} · ${o.ageDays === 0 ? "today" : `${o.ageDays} day${o.ageDays > 1 ? "s" : ""} ago`}` },
                { label: "Source", value: SOURCE_LABEL[o.source] },
              ]}
            />
          </section>
        </>
      )}
    </Drawer>
  );
}
