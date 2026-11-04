import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useId, useMemo, useState } from "react";
import { Coins, ExternalLink, ShieldCheck, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  DataTable,
  EmptyState,
  ErrorBanner,
  Field,
  FilterChip,
  FilterPills,
  InfoBanner,
  LinkBtn,
  ListHeader,
  Modal,
  PillTabs,
  Price,
  PricingLayout,
  RecordLink,
  StatusPill,
  Tag,
  humanize,
  inputCls,
  MissingHint,
  missingFields,
  money,
  notifySuccess,
  toneCls,
  type ApiError,
} from "@/components/pricing/kit";
import {
  APPROVED_COST_SOURCES,
  COSTS,
  COST_TYPES,
  CURRENCIES,
  MARGIN_COST_DEFINITION,
  PRODUCTS,
  REJECTED_COST_PAYLOADS,
  type CostRecord,
  type CostType,
} from "@/lib/pricing/data";
import { TODAY } from "@/lib/pricing/csv";

/** Timeline axis ticks, placed at their real dates. */
const AXIS_TICKS = [
  { date: "2026-01-01", label: "Jan 2026" },
  { date: "2026-07-01", label: "Jul 2026" },
  { date: "2027-01-01", label: "Jan 2027" },
  { date: "2027-07-01", label: "Jul 2027" },
  { date: "2027-12-31", label: "Dec 2027" },
];

type TabKey = "records" | "history" | "config";
const TABS: TabKey[] = ["records", "history", "config"];
type CostSearch = { tab?: TabKey; sku?: string };

export const Route = createFileRoute("/pricing/costs")({
  // `?tab=history&sku=A-100` lets product pages open the cost history for one SKU.
  validateSearch: (s: Record<string, unknown>): CostSearch => ({
    tab: TABS.includes(s.tab as TabKey) && s.tab !== "records" ? (s.tab as TabKey) : undefined,
    sku: typeof s.sku === "string" && s.sku ? s.sku : undefined,
  }),
  head: () => ({ meta: [{ title: "Cost data · Rebate Ninja" }] }),
  component: Page,
});

type Draft = { sku: string; plant: string; costType: string; amount: string; currency: string; effectiveFrom: string; effectiveTo: string; source: string; supersede: boolean };
const EMPTY: Draft = { sku: "", plant: "", costType: "", amount: "", currency: "GBP", effectiveFrom: "", effectiveTo: "", source: "SAP ERP", supersede: false };

type FieldKey = "sku" | "plant" | "costType" | "amount" | "currency" | "effectiveFrom" | "effectiveTo" | "source";
/** Mandatory payload fields in form order, with a fix-it message. */
const REQUIRED: Array<[FieldKey, string]> = [
  ["sku", "Enter the SKU, e.g. A-100."],
  ["plant", "Enter the plant code, e.g. UK01."],
  ["costType", "Choose a cost type."],
  ["amount", "Enter the cost amount."],
  ["currency", "Choose a currency."],
  ["effectiveFrom", "Choose the date this cost starts."],
  ["source", "Enter the source system."],
];
const FIELD_ORDER: FieldKey[] = ["sku", "plant", "costType", "amount", "currency", "effectiveFrom", "effectiveTo", "source"];
const fid = (k: FieldKey) => `cost-${k}`;

const dayBefore = (d: string) => {
  const x = new Date(d);
  x.setDate(x.getDate() - 1);
  return x.toISOString().slice(0, 10);
};

function Page() {
  const [costs, setCosts] = useState<CostRecord[]>(COSTS);
  const [rejected, setRejected] = useState(REJECTED_COST_PAYLOADS);
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/pricing/costs" });
  const tab = search.tab ?? "records";
  const timelineSku = search.sku ?? "A-100";
  const setTab = (t: TabKey) => navigate({ search: (s: CostSearch) => ({ ...s, tab: t === "records" ? undefined : t }), replace: true });
  const setTimelineSku = (sku: string) => navigate({ search: (s: CostSearch) => ({ ...s, sku }), replace: true });
  const [q, setQ] = useState("");
  const [types, setTypes] = useState<CostType[]>([]);
  const [plant, setPlant] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [marginDef, setMarginDef] = useState<CostType[]>(MARGIN_COST_DEFINITION);
  const [savedMarginDef, setSavedMarginDef] = useState<CostType[]>(MARGIN_COST_DEFINITION);
  const [savingMargin, setSavingMargin] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [error, setError] = useState<ApiError | null>(null);
  const [fieldErr, setFieldErr] = useState<Partial<Record<FieldKey, string>>>({});
  const [importing, setImporting] = useState(false);
  const marginDirty = [...marginDef].sort().join() !== [...savedMarginDef].sort().join();
  const draftDirty = JSON.stringify(draft) !== JSON.stringify(EMPTY);
  const importHintId = useId();
  const marginHintId = useId();
  const importMissing = missingFields([
    ["SKU", draft.sku],
    ["Plant", draft.plant],
    ["Cost type", draft.costType],
    ["Amount", draft.amount],
    ["Currency", draft.currency],
    ["Effective from", draft.effectiveFrom],
    ["Source system", draft.source],
  ]);
  const setField = (patch: Partial<Draft>) => {
    setDraft((d) => ({ ...d, ...patch }));
    // Clear the inline error for fields the user is fixing.
    setFieldErr((fe) => {
      const next = { ...fe };
      for (const k of Object.keys(patch)) delete next[k as FieldKey];
      return next;
    });
  };

  const skus = Array.from(new Set(costs.map((c) => c.sku)));
  const plants = Array.from(new Set(costs.map((c) => c.plant)));

  const rows = useMemo(
    () =>
      costs
        .filter((c) => (!q || [c.sku, c.plant, c.source].some((v) => v.toLowerCase().includes(q.toLowerCase()))) && (types.length === 0 || types.includes(c.costType)) && (plant === "all" || c.plant === plant))
        .sort((a, b) => a.sku.localeCompare(b.sku) || a.costType.localeCompare(b.costType) || b.effectiveFrom.localeCompare(a.effectiveFrom)),
    [costs, q, types, plant],
  );

  const ingest = () => {
    const fe: Partial<Record<FieldKey, string>> = {};
    for (const [k, msg] of REQUIRED) if (!String(draft[k]).trim()) fe[k] = msg;
    if (draft.amount.trim() && (!Number.isFinite(Number(draft.amount)) || Number(draft.amount) < 0)) fe.amount = "Enter an amount of 0 or more, e.g. 76.50.";
    if (draft.effectiveFrom && draft.effectiveTo && draft.effectiveTo <= draft.effectiveFrom) fe.effectiveTo = "End date must be after the start date. Choose a later date or leave blank for open-ended.";
    setFieldErr(fe);
    const first = FIELD_ORDER.find((k) => fe[k]);
    if (first) {
      setError(null);
      document.getElementById(fid(first))?.focus();
      return;
    }
    if (!PRODUCTS.some((p) => p.sku === draft.sku.trim())) {
      setFieldErr({ sku: `No product with SKU ${draft.sku.trim()}. Check the SKU in Products, e.g. A-100.` });
      setError({ errorClass: "VALIDATION", code: "PRODUCT_NOT_FOUND", message: `Payload rejected — SKU "${draft.sku.trim()}" is not in the product master. No record was created.`, field: "sku" });
      document.getElementById(fid("sku"))?.focus();
      return;
    }
    if (!APPROVED_COST_SOURCES.some((s) => s.source === draft.source)) {
      setRejected((r) => [{ at: `${TODAY} 14:20`, source: draft.source, reason: "Source not registered as approved (no service account mapping)", records: 1 }, ...r]);
      setError({ errorClass: "AUTHORIZATION", code: "SOURCE_NOT_APPROVED", message: `Payload rejected and logged with source identity "${draft.source}".` });
      return;
    }
    const newFrom = draft.effectiveFrom;
    const newTo = draft.effectiveTo || "9999-12-31";
    const same = costs.filter((c) => c.sku === draft.sku && c.plant === draft.plant && c.costType === draft.costType && c.status !== "SUPERSEDED");
    const clashes = same.filter((c) => newFrom <= (c.effectiveTo ?? "9999-12-31") && c.effectiveFrom <= newTo);
    const closable = clashes.filter((c) => newFrom > c.effectiveFrom && (!c.effectiveTo || draft.supersede));
    if (clashes.length !== closable.length) {
      const c = clashes.find((x) => !closable.includes(x))!;
      setError({
        errorClass: "BUSINESS_RULE",
        code: "COST_PERIOD_OVERLAP",
        message: `${draft.costType} cost for ${draft.sku} ${newFrom}…${draft.effectiveTo || "open"} overlaps existing ${c.effectiveFrom}…${c.effectiveTo ?? "open"}. Tick "Supersede existing" or adjust dates.`,
      });
      return;
    }
    const closeTo = dayBefore(newFrom);
    const rec: CostRecord = {
      id: `CR-${costs.length + 1}`,
      sku: draft.sku,
      plant: draft.plant,
      costType: draft.costType as CostType,
      amount: Number(draft.amount),
      currency: draft.currency,
      effectiveFrom: newFrom,
      effectiveTo: draft.effectiveTo || undefined,
      source: draft.source,
      status: newFrom > TODAY ? "SCHEDULED" : "ACTIVE",
      receivedAt: `${TODAY} 14:20`,
    };
    setError(null);
    setImporting(true);
    setTimeout(() => {
      setCosts((cur) => [rec, ...cur.map((c) => (closable.includes(c) ? { ...c, effectiveTo: closeTo, status: (closeTo < TODAY ? "SUPERSEDED" : c.status) as CostRecord["status"] } : c))]);
      setImporting(false);
      setOpen(false);
      toast.success(`Cost record imported for ${draft.sku}`, {
        description: closable.length ? `Previous record's effective-to set to ${closeTo}. Cost-change event raised for repricing.` : "Cost-change event raised for repricing.",
      });
    }, 600);
  };

  const preset = (d: Partial<Draft>) => {
    setDraft({ ...EMPTY, ...d });
    setError(null);
    setFieldErr({});
  };

  const saveMargin = () => {
    if (marginDef.length === 0) {
      toast.error("Select at least one cost type", { description: "Margin needs a cost definition to calculate against." });
      return;
    }
    setSavingMargin(true);
    setTimeout(() => {
      setSavingMargin(false);
      setSavedMarginDef(marginDef);
      notifySuccess("Margin definition saved", `Cost = ${marginDef.map(humanize).join(" + ")}`);
    }, 500);
  };

  const timelineRows = costs.filter((c) => c.sku === timelineSku);
  const typesForSku = Array.from(new Set(timelineRows.map((c) => c.costType)));
  const productName = (sku: string) => PRODUCTS.find((p) => p.sku === sku)?.name;
  // Change log: each record compared with the previous record of the same type and plant, newest first.
  const changes = [...timelineRows]
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))
    .map((c, i, all) => {
      const prev = all.slice(0, i).reverse().find((p) => p.costType === c.costType && p.plant === c.plant);
      return { rec: c, prev, delta: prev ? c.amount - prev.amount : undefined };
    })
    .reverse();
  const axisFrom = new Date("2026-01-01").getTime();
  const axisTo = new Date("2027-12-31").getTime();
  const pos = (d: string) => Math.max(0, Math.min(100, ((new Date(d).getTime() - axisFrom) / (axisTo - axisFrom)) * 100));

  const exampleCost = costs
    .filter((c) => c.sku === "A-100" && marginDef.includes(c.costType) && c.effectiveFrom <= TODAY && (!c.effectiveTo || c.effectiveTo >= TODAY))
    .reduce((a, c) => a + c.amount, 0);
  const examplePrice = 110;

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Cost data" }]}>
      <ListHeader
        title="Cost data"
        noun="cost record"
        count={rows.length}
        search={q}
        onSearch={(v) => {
          setQ(v);
          setTab("records");
        }}
        subtitle="Effective-dated and never overwritten. Accepted only from approved sources."
        filterCount={plant !== "all" ? 1 : 0}
        onFilter={() => {
          setShowFilters((s) => !s);
          setTab("records");
        }}
        actions={
          <Btn icon={Upload} onClick={() => { preset({}); setOpen(true); }}>
            Import cost
          </Btn>
        }
      />
      {rejected.length > 0 && (
        <InfoBanner
          tone="warning"
          title={`${rejected.length} payload${rejected.length === 1 ? "" : "s"} rejected recently`}
          action={
            <Btn size="sm" variant="subtle" onClick={() => setTab("config")}>
              Review rejected payloads
            </Btn>
          }
        >
          Latest from <span className="font-mono">{rejected[0].source}</span> on <span className="whitespace-nowrap">{rejected[0].at}</span>. Rejected payloads are logged with
          their source identity and reason.
        </InfoBanner>
      )}

      <PillTabs<TabKey>
        idPrefix="costs"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "records", label: "Cost records", count: costs.length },
          { key: "history", label: "Cost history" },
          { key: "config", label: "Margin definition & sources" },
        ]}
      />

      {/* One tabpanel wraps whichever tab is showing, so screen readers hear which tab owns the content. */}
      <div role="tabpanel" id={`costs-panel-${tab}`} aria-labelledby={`costs-tab-${tab}`}>
      {tab === "records" && (
        <>
          <FilterPills<CostType>
            label="Cost type"
            selected={types}
            onChange={setTypes}
            options={COST_TYPES.filter((t) => costs.some((c) => c.costType === t)).map((t) => ({ key: t, label: humanize(t), count: costs.filter((c) => c.costType === t).length }))}
          />
          {showFilters && (
            <div className="bg-card border border-border rounded-xl p-4 mb-4 flex flex-wrap gap-4 items-end">
              <Field label="Plant" className="w-full sm:w-64">
                <select className={inputCls} value={plant} onChange={(e) => setPlant(e.target.value)}>
                  <option value="all">All plants</option>
                  {plants.map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </Field>
            </div>
          )}
          {plant !== "all" && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <FilterChip label={`Plant: ${plant}`} onRemove={() => setPlant("all")} />
            </div>
          )}
          <DataTable<CostRecord>
            caption="Cost records"
            rows={rows}
            rowKey={(c) => c.id}
            pageSize={25}
            empty={
              <EmptyState
                icon={Coins}
                title={q ? `No cost records match “${q}”` : "No cost records match these filters"}
                action={
                  <Btn
                    variant="subtle"
                    onClick={() => {
                      setQ("");
                      setTypes([]);
                      setPlant("all");
                    }}
                  >
                    Clear filters
                  </Btn>
                }
              >
                Try a different SKU or remove a filter.
              </EmptyState>
            }
            columns={[
              {
                key: "sku",
                header: "Product",
                cell: (c) => (
                  <div className="whitespace-nowrap">
                    <RecordLink to="/pricing/products/$id" params={{ id: c.sku }}>
                      {c.sku}
                    </RecordLink>
                    {productName(c.sku) && <div className="text-xs text-muted-foreground">{productName(c.sku)}</div>}
                  </div>
                ),
              },
              { key: "plant", header: "Plant", cell: (c) => <span className="whitespace-nowrap">{c.plant}</span> },
              { key: "type", header: "Cost type", cell: (c) => humanize(c.costType) },
              { key: "amt", header: "Amount", align: "right", cell: (c) => <Price value={c.amount} currency={c.currency} /> },
              { key: "from", header: "Effective from", cell: (c) => <span className="whitespace-nowrap tabular-nums">{c.effectiveFrom}</span> },
              { key: "to", header: "Effective to", cell: (c) => <span className="whitespace-nowrap tabular-nums">{c.effectiveTo ?? "—"}</span> },
              { key: "src", header: "Source", cell: (c) => <span className="whitespace-nowrap">{c.source}</span> },
              { key: "rcv", header: "Received", cell: (c) => <span className="text-muted-foreground whitespace-nowrap tabular-nums">{c.receivedAt}</span> },
              { key: "st", header: "Status", cell: (c) => <StatusPill status={c.status} /> },
            ]}
          />
        </>
      )}

      {tab === "history" && (
        <div className="space-y-6">
        <Card
          title="Timeline"
          subtitle="Jan 2026 – Dec 2027. Each bar is one cost record; records of the same type never overlap."
          actions={
            <>
              <label htmlFor="timeline-sku" className="sr-only">
                Product
              </label>
              <select
                id="timeline-sku"
                className={`${inputCls} w-64`}
                value={timelineSku}
                onChange={(e) => setTimelineSku(e.target.value)}
              >
                {skus.map((s) => (
                  <option key={s} value={s}>
                    {s}
                    {productName(s) ? ` — ${productName(s)}` : ""}
                  </option>
                ))}
              </select>
              {productName(timelineSku) && (
                <LinkBtn to="/pricing/products/$id" params={{ id: timelineSku }} variant="outline" icon={ExternalLink}>
                  View product
                </LinkBtn>
              )}
            </>
          }
        >
          {typesForSku.length === 0 ? (
            <p className="text-sm text-muted-foreground">No cost records received for {timelineSku}. Choose another product above.</p>
          ) : (
          /* Fits the card at every width — no horizontal scroll. */
          <div role="region" aria-label={`Cost timeline for ${timelineSku}`}>
          <div>
            {/* Axis — ticks sit at their real dates, on the same track as the bars. */}
            <div className="flex gap-4">
              <div className="w-20 sm:w-32 shrink-0" />
              <div className="relative flex-1 h-8" aria-hidden>
                {AXIS_TICKS.map((t, i) => (
                  <span
                    key={t.date}
                    className={`absolute top-0 text-xs text-muted-foreground whitespace-nowrap ${i === 0 ? "" : i === AXIS_TICKS.length - 1 ? "-translate-x-full" : "-translate-x-1/2 hidden md:inline"}`}
                    style={{ left: `${pos(t.date)}%` }}
                  >
                    {t.label}
                  </span>
                ))}
                <span
                  className="absolute bottom-0 -translate-x-1/2 rounded-full bg-brand px-2 py-0.5 text-[11px] font-semibold text-brand-foreground whitespace-nowrap"
                  style={{ left: `${pos(TODAY)}%` }}
                >
                  Today
                </span>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-20 sm:w-32 shrink-0">
                {typesForSku.map((t) => (
                  <div key={t} className="h-14 flex items-center text-xs sm:text-sm font-medium">
                    {humanize(t)}
                  </div>
                ))}
              </div>
              <div className="relative flex-1">
                {/* Gridlines and today marker span every row. */}
                {AXIS_TICKS.map((t) => (
                  <span key={t.date} className="absolute inset-y-0 w-px bg-border/70" style={{ left: `${pos(t.date)}%` }} aria-hidden />
                ))}
                <span className="absolute inset-y-0 w-0.5 -translate-x-1/2 bg-brand z-10" style={{ left: `${pos(TODAY)}%` }} aria-hidden />
                {typesForSku.map((t) => (
                  <div key={t} className="relative h-14 border-b border-border/70 last:border-b-0">
                    {timelineRows
                      .filter((c) => c.costType === t)
                      .map((c) => {
                        const l = pos(c.effectiveFrom);
                        const r = pos(c.effectiveTo ?? "2027-12-31");
                        const tone = toneCls[c.status === "SUPERSEDED" ? "neutral" : c.status === "SCHEDULED" ? "info" : "success"];
                        const openEnded = !c.effectiveTo;
                        return (
                          <div
                            key={c.id}
                            className={`absolute top-2.5 bottom-2.5 rounded-md border px-1.5 sm:px-2.5 flex items-center gap-2 overflow-hidden whitespace-nowrap text-xs ${tone.soft} ${tone.border} ${openEnded ? "rounded-r-none border-r-0 [mask-image:linear-gradient(to_right,black_85%,transparent)]" : ""}`}
                            style={{ left: `${l}%`, width: `${Math.max(2, r - l)}%` }}
                            title={`${humanize(c.status)} · ${c.effectiveFrom} → ${c.effectiveTo ?? "open-ended"} · ${money(c.amount, c.currency)}`}
                          >
                            <span className={`size-1.5 shrink-0 rounded-full ${tone.dot}`} aria-hidden />
                            <span className={`font-semibold tabular-nums ${tone.text}`}>{money(c.amount, c.currency)}</span>
                            <span className="hidden lg:inline text-muted-foreground tabular-nums truncate">
                              {c.effectiveFrom} → {c.effectiveTo ?? "open-ended"}
                            </span>
                            <span className="sr-only">, {humanize(c.status)}</span>
                          </div>
                        );
                      })}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-4 pt-4 border-t border-border text-xs text-muted-foreground">
              {(["ACTIVE", "SCHEDULED", "SUPERSEDED"] as const).map((s) => (
                <StatusPill key={s} status={s} />
              ))}
              <span className="flex items-center gap-1.5">
                <span className="w-0.5 h-3.5 bg-brand" aria-hidden /> Today ({TODAY})
              </span>
              <span>Faded end = open-ended (no end date yet)</span>
            </div>
          </div>
          </div>
          )}
        </Card>
        <section aria-labelledby="cost-changes-h">
          <h2 id="cost-changes-h" className="text-lg font-semibold tracking-tight">
            Change log
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5 mb-4">Newest first. Each change is a new record; the previous one is closed, never overwritten.</p>
          <DataTable
            caption={`Cost changes for ${timelineSku}`}
            rows={changes}
            rowKey={(r) => r.rec.id}
            empty="No cost records received for this product."
            columns={[
              { key: "from", header: "Effective from", cell: (r) => <span className="whitespace-nowrap tabular-nums">{r.rec.effectiveFrom}</span> },
              { key: "type", header: "Cost type", cell: (r) => <span className="whitespace-nowrap">{humanize(r.rec.costType)} · {r.rec.plant}</span> },
              {
                key: "prev",
                header: "Previous",
                align: "right",
                cell: (r) => (r.prev ? <span className="text-muted-foreground"><Price value={r.prev.amount} currency={r.prev.currency} /></span> : <span className="text-muted-foreground">First record</span>),
              },
              { key: "amt", header: "New", align: "right", cell: (r) => <Price value={r.rec.amount} currency={r.rec.currency} /> },
              {
                key: "delta",
                header: "Change",
                align: "right",
                cell: (r) =>
                  r.delta === undefined || !r.prev ? (
                    "—"
                  ) : (
                    <span className={`whitespace-nowrap tabular-nums font-medium ${r.delta > 0 ? "text-destructive" : r.delta < 0 ? "text-success" : ""}`}>
                      {r.delta > 0 ? "▲ +" : r.delta < 0 ? "▼ " : ""}
                      {money(r.delta, r.rec.currency)} ({((r.delta / r.prev.amount) * 100).toFixed(1)}%)
                    </span>
                  ),
              },
              { key: "src", header: "Source", cell: (r) => <span className="whitespace-nowrap">{r.rec.source}</span> },
              { key: "st", header: "Status", cell: (r) => <StatusPill status={r.rec.status} /> },
            ]}
          />
        </section>
        </div>
      )}

      {tab === "config" && (
        <div className="grid xl:grid-cols-2 gap-6">
          <Card
            title="Margin cost definition"
            subtitle="Tenant setting — which cost types add up to “cost” for margin"
            actions={
              <>
                <MissingHint id={marginHintId} missing={missingFields([["At least one cost type", marginDef]])} />
                {marginDirty && <Tag tone="warning">Unsaved changes</Tag>}
                {marginDirty && (
                  <Btn size="sm" variant="subtle" onClick={() => setMarginDef(savedMarginDef)} disabled={savingMargin}>
                    Cancel
                  </Btn>
                )}
                <Btn
                  size="sm"
                  onClick={saveMargin}
                  loading={savingMargin}
                  disabled={!marginDirty || marginDef.length === 0}
                  aria-describedby={marginDef.length === 0 ? marginHintId : undefined}
                  title={!marginDirty ? "No changes to save" : undefined}
                >
                  Save
                </Btn>
              </>
            }
          >
            <div className="grid sm:grid-cols-3 gap-2" role="group" aria-label="Cost types included in margin cost">
              {COST_TYPES.map((t) => {
                const on = marginDef.includes(t);
                return (
                  <label key={t} className={`flex items-center gap-2 px-3 py-2 rounded-lg border cursor-pointer text-sm ${on ? "border-brand bg-brand-soft" : "border-border"}`}>
                    <input type="checkbox" checked={on} onChange={() => setMarginDef((cur) => (on ? cur.filter((x) => x !== t) : [...cur, t]))} className="accent-[var(--brand)]" />
                    {humanize(t)}
                  </label>
                );
              })}
            </div>
            <div className="mt-4 rounded-lg bg-muted/50 p-4 text-sm">
              <div className="font-semibold mb-1">Example · A-100 at list price {money(examplePrice)}</div>
              Cost ({marginDef.length ? marginDef.map(humanize).join(" + ") : "none selected"}) = <b>{money(exampleCost)}</b> → margin{" "}
              <b>{examplePrice ? (((examplePrice - exampleCost) / examplePrice) * 100).toFixed(1) : "0"}%</b>
            </div>
          </Card>

          <Card title="Approved sources" subtitle="Each source system is registered and mapped to a service account (US-AD-08)">
            <ul className="divide-y divide-border">
              {APPROVED_COST_SOURCES.map((s) => (
                <li key={s.source} className="py-3 flex flex-wrap items-center gap-3">
                  <ShieldCheck className="size-5 text-success" aria-hidden />
                  <div className="flex-1">
                    <div className="font-medium">{s.source}</div>
                    <div className="text-xs text-muted-foreground font-mono">{s.serviceAccount}</div>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {s.costTypes.map((t) => (
                      <Tag key={t}>{humanize(t)}</Tag>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <section className="xl:col-span-2" aria-labelledby="rejected-payloads-h">
            <h2 id="rejected-payloads-h" className="text-lg font-semibold tracking-tight">
              Rejected payloads
            </h2>
            <p className="text-sm text-muted-foreground mt-0.5 mb-4">Logged with source identity and reason</p>
            <DataTable
              caption="Rejected cost payloads"
              rows={rejected}
              rowKey={(r) => r.at + r.source}
              empty="No payloads have been rejected."
              columns={[
                { key: "at", header: "Received", cell: (r) => <span className="whitespace-nowrap tabular-nums">{r.at}</span> },
                { key: "src", header: "Source identity", cell: (r) => <span className="font-mono text-xs whitespace-nowrap">{r.source}</span> },
                { key: "reason", header: "Reason", cell: (r) => r.reason },
                { key: "n", header: "Records", align: "right", cell: (r) => <span className="tabular-nums">{r.records.toLocaleString("en-GB")}</span> },
              ]}
            />
          </section>
        </div>
      )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!draftDirty && !importing}
        size="lg"
        title="Import cost record"
        subtitle="Simulates a payload from an integration — validation runs exactly as the API would."
        footer={
          <>
            {(draftDirty || importMissing.length > 0) && (
              <div className="mr-auto self-center flex flex-col gap-0.5">
                {draftDirty && (
                  <span role="status" className="text-xs font-medium text-warning-foreground">
                    Unsaved changes
                  </span>
                )}
                <MissingHint id={importHintId} missing={importMissing} />
              </div>
            )}
            <Btn variant="subtle" onClick={() => setOpen(false)} disabled={importing}>
              Cancel
            </Btn>
            <Btn
              type="submit"
              form="cost-import"
              icon={Upload}
              loading={importing}
              disabled={importMissing.length > 0}
              aria-describedby={importMissing.length ? importHintId : undefined}
            >
              Import
            </Btn>
          </>
        }
      >
        <details className="mb-4 rounded-lg border border-border bg-muted/30 px-4 py-2">
          <summary className="cursor-pointer text-sm font-semibold py-1">Example payloads</summary>
          <p className="text-xs text-muted-foreground mt-1 mb-2">Fill the form with a scenario that exercises a validation rule.</p>
          <div className="flex flex-wrap gap-2 pb-2">
            <Btn size="sm" variant="subtle" onClick={() => preset({ sku: "A-100", plant: "UK01", costType: "STANDARD", amount: "76", effectiveFrom: "2027-01-01" })}>
              Supersede (standard 76 from 2027-01-01)
            </Btn>
            <Btn size="sm" variant="subtle" onClick={() => preset({ sku: "A-100", plant: "UK01", costType: "LANDED", amount: "80.1", effectiveFrom: "2026-06-01", effectiveTo: "2027-06-01", source: "Landed Cost Engine" })}>
              Overlap (landed 2026-06-01 → 2027-06-01)
            </Btn>
            <Btn size="sm" variant="subtle" onClick={() => preset({ sku: "A-100", costType: "FREIGHT", amount: "5.4", effectiveFrom: "2026-11-01", source: "TMS Freight" })}>
              Missing plant
            </Btn>
            <Btn size="sm" variant="subtle" onClick={() => preset({ sku: "A-100", plant: "UK01", costType: "TARIFF", amount: "2.3", effectiveFrom: "2026-11-01", source: "ftp-legacy-costs" })}>
              Unapproved source
            </Btn>
          </div>
        </details>
        <ErrorBanner error={error} onClose={() => setError(null)} />
        <form
          id="cost-import"
          noValidate
          className="grid sm:grid-cols-2 gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            ingest();
          }}
        >
          <p className="sm:col-span-2 text-xs text-muted-foreground">
            <span className="text-destructive" aria-hidden>*</span> Required
          </p>
          <Field label="SKU" required error={fieldErr.sku}>
            <input id={fid("sku")} className={inputCls} value={draft.sku} onChange={(e) => setField({ sku: e.target.value })} placeholder="e.g. A-100" />
          </Field>
          <Field label="Plant" required error={fieldErr.plant}>
            <input id={fid("plant")} className={inputCls} value={draft.plant} onChange={(e) => setField({ plant: e.target.value })} placeholder="e.g. UK01" />
          </Field>
          <Field label="Cost type" required error={fieldErr.costType}>
            <select id={fid("costType")} className={inputCls} value={draft.costType} onChange={(e) => setField({ costType: e.target.value })}>
              <option value="">Select…</option>
              {COST_TYPES.map((t) => (
                <option key={t} value={t}>{humanize(t)}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-[1fr_7rem] gap-2">
            <Field label="Amount" required error={fieldErr.amount}>
              <input
                id={fid("amount")}
                type="number"
                inputMode="decimal"
                min={0}
                step="0.01"
                className={inputCls}
                value={draft.amount}
                onChange={(e) => setField({ amount: e.target.value })}
                onBlur={() => {
                  // Inline validation on blur, same rule as on submit.
                  const v = draft.amount.trim();
                  if (v && (!Number.isFinite(Number(v)) || Number(v) < 0)) setFieldErr((fe) => ({ ...fe, amount: "Enter an amount of 0 or more, e.g. 76.50." }));
                }}
                placeholder="e.g. 76.50"
              />
            </Field>
            <Field label="Currency" required error={fieldErr.currency}>
              <select id={fid("currency")} className={inputCls} value={draft.currency} onChange={(e) => setField({ currency: e.target.value })}>
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Effective from" required error={fieldErr.effectiveFrom}>
            <input id={fid("effectiveFrom")} type="date" className={inputCls} value={draft.effectiveFrom} onChange={(e) => setField({ effectiveFrom: e.target.value })} />
          </Field>
          <Field label="Effective to" hint="Leave blank for open-ended" error={fieldErr.effectiveTo}>
            <input
              id={fid("effectiveTo")}
              type="date"
              min={draft.effectiveFrom || undefined}
              className={inputCls}
              value={draft.effectiveTo}
              onChange={(e) => setField({ effectiveTo: e.target.value })}
              onBlur={() => {
                if (draft.effectiveFrom && draft.effectiveTo && draft.effectiveTo <= draft.effectiveFrom)
                  setFieldErr((fe) => ({ ...fe, effectiveTo: "End date must be after the start date. Choose a later date or leave blank for open-ended." }));
              }}
            />
          </Field>
          <Field label="Source system" required error={fieldErr.source} hint="Must be a registered source">
            <input id={fid("source")} className={inputCls} value={draft.source} onChange={(e) => setField({ source: e.target.value })} list="cost-sources" />
          </Field>
          <datalist id="cost-sources">
            {APPROVED_COST_SOURCES.map((s) => (
              <option key={s.source} value={s.source} />
            ))}
          </datalist>
          <label className="flex items-center gap-2 text-sm self-end min-h-10">
            <input type="checkbox" checked={draft.supersede} onChange={(e) => setField({ supersede: e.target.checked })} className="size-4 accent-[var(--brand)]" />
            Supersede existing record (close its effective-to date)
          </label>
        </form>
      </Modal>
    </PricingLayout>
  );
}
