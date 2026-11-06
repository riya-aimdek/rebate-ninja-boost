import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useId, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, Download, Lock, Plus, Radar, RefreshCw, Rss, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  DataAsOf,
  DataTable,
  DetailGrid,
  Drawer,
  EmptyState,
  FileDrop,
  Field,
  FilterPills,
  Flag,
  InfoBanner,
  KpiTile,
  ListHeader,
  MissingHint,
  Modal,
  PillTabs,
  PricingLayout,
  Price,
  RecordLink,
  Tag,
  inputCls,
  missingFields,
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

type FeedRow = { competitor: string; competitorSku: string; price: number };
type Rejected = { label: string; reason: string; link?: { competitor: string; competitorSku: string } };
type FeedResult = { from: { kind: "SYNC" } | { kind: "FILE"; name: string }; at: Date; added: number; rejected: Rejected[] };

/** Reads a price file with columns competitor, competitor_sku, price (header row required, any order). */
function parseFeedCsv(text: string): { rows: FeedRow[]; invalid: Rejected[] } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const head = (lines[0] ?? "").split(",").map((h) => h.trim().toLowerCase().replace(/\s+/g, "_"));
  const col = (name: string) => head.indexOf(name);
  const [ci, si, pi] = [col("competitor"), col("competitor_sku"), col("price")];
  if (ci < 0 || si < 0 || pi < 0)
    return { rows: [], invalid: [{ label: "File", reason: "needs the columns competitor, competitor_sku and price. Download the template to see the layout." }] };
  const rows: FeedRow[] = [];
  const invalid: Rejected[] = [];
  lines.slice(1).forEach((line, i) => {
    const cells = line.split(",").map((c) => c.trim());
    const price = Number(cells[pi]);
    if (!cells[ci] || !cells[si] || !(price > 0)) invalid.push({ label: `Row ${i + 2}`, reason: "needs a competitor, a competitor SKU and a price above 0." });
    else rows.push({ competitor: cells[ci], competitorSku: cells[si], price });
  });
  return { rows, invalid };
}

const fmtSync = (d: Date) =>
  `${d.toDateString() === new Date(`${TODAY}T12:00:00`).toDateString() || d > new Date(`${TODAY}T00:00:00`) ? "Today" : d.toLocaleDateString("en-GB")}, ${d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}`;

const SAMPLE_FEED: FeedRow[] = [
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
  const [feedResult, setFeedResult] = useState<FeedResult | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  // "Link it" on a rejected row opens SKU mapping with that competitor and SKU filled in.
  const [mapPrefill, setMapPrefill] = useState<{ competitor: string; competitorSku: string } | null>(null);
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
    {
      key: "ours",
      header: "Our price",
      align: "right",
      cell: (o) =>
        ourPrice(o.sku) == null ? (
          <span className="text-xs text-muted-foreground">Not on UK Base list</span>
        ) : (
          <Price value={ourPrice(o.sku)} currency="GBP" uom={productBySku(o.sku)?.uom} />
        ),
    },
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
    { key: "src", header: "Source", className: "whitespace-nowrap", cell: (o) => SOURCE_LABEL[o.source] },
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

  /** Runs feed rows through the SKU mapping: mapped rows become observations, the rest are rejected with a reason. */
  const ingest = (rows: FeedRow[], invalid: Rejected[], from: FeedResult["from"]) => {
    const rejected: Rejected[] = [...invalid];
    const added: CompetitorObs[] = [];
    rows.forEach((row, i) => {
      const m = maps.find((x) => x.competitor === row.competitor && x.competitorSku === row.competitorSku);
      if (!m) {
        rejected.push({
          label: row.competitorSku,
          reason: `from ${row.competitor} isn't linked to one of our products.`,
          link: { competitor: row.competitor, competitorSku: row.competitorSku },
        });
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
        source: from.kind === "SYNC" ? "FEED" : "FILE",
      });
    });
    setObs((o) => [...added, ...o]);
    const at = new Date();
    setFeedResult({ from, at, added: added.length, rejected });
    if (from.kind === "SYNC") setSyncedAt(at);
  };

  const syncNow = () => {
    setSyncing(true);
    // The daily PriceSpider pull, run on demand (demo payload).
    window.setTimeout(() => {
      setSyncing(false);
      ingest(SAMPLE_FEED, [], { kind: "SYNC" });
    }, 700);
  };

  const importFile = async () => {
    if (!file) return;
    setImporting(true);
    const { rows, invalid } = parseFeedCsv(await file.text());
    setImporting(false);
    ingest(rows, invalid, { kind: "FILE", name: file.name });
    setFile(null);
  };

  const linkSku = (link: { competitor: string; competitorSku: string }) => {
    setMapPrefill(link);
    setTab("map");
  };

  // Shown under whichever card started it, so the outcome sits next to the button you pressed.
  const resultCard = feedResult && (
          <Card
            title="Result"
            subtitle={`${feedResult.from.kind === "SYNC" ? "PriceSpider sync" : feedResult.from.name} · ${fmtSync(feedResult.at)}`}
          >
            <div className="space-y-3 text-base" role="status">
              <div className="flex flex-wrap items-center gap-3">
                <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden />
                <span className="font-medium">
                  {feedResult.added} {feedResult.added === 1 ? "price" : "prices"} added
                </span>
                {feedResult.added > 0 && (
                  <Btn variant="ghost" size="sm" icon={ArrowRight} onClick={() => setTab("obs")}>
                    View in Observations
                  </Btn>
                )}
              </div>
              {feedResult.rejected.length > 0 && (
                <div className="rounded-lg border border-warning/40 bg-warning-soft px-4 py-3">
                  <p className="font-medium">
                    {feedResult.rejected.length} {feedResult.rejected.length === 1 ? "row" : "rows"} not added
                  </p>
                  <ul className="mt-2 space-y-2">
                    {feedResult.rejected.map((r) => (
                      <li key={r.label} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <span>
                          <span className="font-mono text-sm">{r.label}</span> {r.reason}
                        </span>
                        {r.link && (
                          <Btn variant="ghost" size="sm" onClick={() => linkSku(r.link!)} aria-label={`Link ${r.label} to one of our products`}>
                            Link it
                          </Btn>
                        )}
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Also recorded in the{" "}
                    <Link to="/pricing/data-quality" className="hit text-brand-strong font-semibold hover:underline">
                      data quality log
                    </Link>
                    . After linking, sync or import again to add them.
                  </p>
                </div>
              )}
            </div>
          </Card>
  );

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
      {/* The Feed tab shows the same schedule, last sync and visibility in its own cards. */}
      {tab !== "feed" && (
        <InfoBanner
          tone="info"
          title="PriceSpider feed · daily at 06:00"
          action={
            <Btn variant="outline" size="sm" icon={Rss} onClick={() => setTab("feed")}>
              Open feed
            </Btn>
          }
        >
          <DataAsOf at={syncedAt} />
          <span className="inline-flex items-center gap-1.5 mt-1">
            <Lock className="size-3.5 shrink-0" aria-hidden /> Internal data — hidden from Sales and Partner roles unless explicitly granted.
          </span>
        </InfoBanner>
      )}

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

      {tab === "map" && (
        <MappingTab
          key={mapPrefill ? `${mapPrefill.competitor}|${mapPrefill.competitorSku}` : "new"}
          maps={maps}
          setMaps={setMaps}
          prefill={mapPrefill}
        />
      )}

      {tab === "feed" && (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_23rem] gap-6 items-start">
          <div className="space-y-6 min-w-0">
            <Card
              title="Daily feed from PriceSpider"
              subtitle="Competitor prices arrive automatically every day at 06:00. Sync now if you need them sooner."
              actions={
                <Btn variant="outline" size="sm" icon={RefreshCw} loading={syncing} onClick={syncNow}>
                  {syncing ? "Syncing…" : "Sync now"}
                </Btn>
              }
            >
              <DetailGrid
                columns={2}
                items={[
                  { label: "Last sync", value: fmtSync(syncedAt) },
                  { label: "Next sync", value: "Tomorrow, 06:00" },
                ]}
              />
            </Card>
            {feedResult?.from.kind === "SYNC" && resultCard}

            <Card title="Import a price file" subtitle="For prices outside the daily feed, such as a competitor price list you received.">
              <div className="space-y-4">
                <FileDrop
                  id="feed-file"
                  label="Price file"
                  accept=".csv"
                  file={file}
                  onChange={setFile}
                  onTemplate={() =>
                    downloadCsv("competitor-prices-template.csv", [
                      { competitor: "LightHub", competitor_sku: "LH-DL10-W", price: "74.00" },
                    ])
                  }
                />
                {file && (
                  <div className="flex justify-end">
                    <Btn icon={Upload} loading={importing} onClick={importFile}>
                      Import prices
                    </Btn>
                  </div>
                )}
              </div>
            </Card>

            {feedResult?.from.kind === "FILE" && resultCard}
          </div>

          <Card title="Feed settings" subtitle="Managed in integration settings.">
            <DetailGrid
              columns={1}
              items={[
                { label: "Source", value: "PriceSpider API" },
                { label: "Schedule", value: "Daily at 06:00" },
                { label: "Stale after", value: `${STALE_DAYS} days — older prices are flagged and left out of repricing` },
                {
                  label: "Who can see competitor data",
                  value: (
                    <span className="flex flex-wrap gap-2 mt-1">
                      {["Pricing Administrator", "Pricing Analyst", "Pricing Manager", "Deal Desk"].map((r) => (
                        <Tag key={r} tone="info">
                          {r}
                        </Tag>
                      ))}
                      <Tag tone="danger">Sales Rep — hidden</Tag>
                      <Tag tone="danger">Channel Partner — hidden</Tag>
                    </span>
                  ),
                },
              ]}
            />
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

function MappingTab({
  maps,
  setMaps,
  prefill,
}: {
  maps: Mapping[];
  setMaps: (fn: (m: Mapping[]) => Mapping[]) => void;
  prefill: { competitor: string; competitorSku: string } | null;
}) {
  const [competitor, setCompetitor] = useState(prefill?.competitor ?? "");
  const [cSku, setCSku] = useState(prefill?.competitorSku ?? "");
  const [sku, setSku] = useState("");
  const [err, setErr] = useState<ApiError | null>(null);
  const duplicate = maps.some((m) => m.competitor === competitor && m.competitorSku.toLowerCase() === cSku.trim().toLowerCase());
  const mapHintId = useId();
  const mapMissing = missingFields([
    ["Competitor", competitor],
    ["Competitor SKU", cSku],
    ["Our SKU", sku],
  ]);
  const add = () => {
    if (mapMissing.length > 0) return;
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
    // The form column is exactly one field wide (20rem fields + card padding); the table takes the rest.
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_23rem] gap-6 items-start">
      <div className="min-w-0">
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
          empty={
            <EmptyState icon={Radar} title="No SKU mappings yet">
              Map a competitor SKU to our SKU so its feed prices can be compared. Use Create mapping.
            </EmptyState>
          }
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
          <div className="flex justify-end gap-3">
            <MissingHint id={mapHintId} missing={mapMissing} />
            <Btn type="submit" icon={Plus} disabled={mapMissing.length > 0} aria-describedby={mapMissing.length ? mapHintId : undefined}>
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
  const hintId = useId();
  const missing = missingFields([
    ["Competitor SKU", mapKey],
    ["Observed price", price],
    ["Observed on", date],
  ]);
  const save = () => {
    if (missing.length > 0) return;
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
          <MissingHint id={hintId} missing={missing} />
          <Btn variant="subtle" onClick={onClose}>
            Cancel
          </Btn>
          <Btn onClick={save} disabled={missing.length > 0} aria-describedby={missing.length ? hintId : undefined}>
            Save observation
          </Btn>
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
              ]}
            />
          </section>
        </>
      )}
    </Drawer>
  );
}
