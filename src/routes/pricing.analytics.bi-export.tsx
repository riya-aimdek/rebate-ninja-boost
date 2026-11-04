import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { Copy, Download, FileSpreadsheet, PlugZap } from "lucide-react";
import { toast } from "sonner";
import { Btn, Card, DataTable, DetailTitle, ErrorBanner, Field, Flag, InfoBanner, PricingLayout, Tag, humanize, inputCls, notifySuccess, type ApiError } from "@/components/pricing/kit";
import { RequireAccess } from "@/components/pricing/access";
import { Freshness } from "@/components/pricing/analytics-ui";
import { EXCEPTIONS, NOW, QUOTES, priceQuote, shortHash, type Transaction } from "@/lib/pricing/deals";
import { AUDIT_LOG, PRICE_LISTS } from "@/lib/pricing/data";
import { rlsNote, scopedTransactions } from "@/lib/pricing/analytics";
import { useSession, userName, type SecureField, type User } from "@/lib/pricing/session";

export const Route = createFileRoute("/pricing/analytics/bi-export")({
  head: () => ({ meta: [{ title: "BI export · Rebate Ninja" }] }),
  component: () => (
    <RequireAccess module="ANALYTICS">
      <Page />
    </RequireAccess>
  ),
});

const DATASETS = ["MARGIN_FACT", "WATERFALL_FACT", "PRICE_LIST_DIM", "QUOTE_FACT", "EXCEPTION_FACT"] as const;
type Dataset = (typeof DATASETS)[number];
type Format = "CSV" | "JSON" | "PARQUET";
type Row = Record<string, string | number | boolean | null>;

const DATASET_INFO: Record<Dataset, string> = {
  MARGIN_FACT: "One row per invoice line: revenue, volume, cost and margin.",
  WATERFALL_FACT: "Per-unit waterfall components from list to pocket price.",
  PRICE_LIST_DIM: "Price lists with type, status, version and effective dates.",
  QUOTE_FACT: "Quotes with status, totals and expected / actual margin.",
  EXCEPTION_FACT: "Pricing exceptions with justification, status and expiry.",
};

/** Column → secured field. Columns the viewer may not see are dropped from every export (US-AD-03 / US-AN-05). */
const SECURED_COLUMNS: Record<string, SecureField> = { cost: "costPrice", grossMargin: "marginAmount", pocketMargin: "marginAmount", expectedMarginPct: "marginPct", actualMarginPct: "marginPct", marginPct: "marginPct", competitorPrice: "competitorPrice", rebate: "rebateRate" };

const iso = (s: string) => `${s.replace(" ", "T")}${s.length <= 16 ? ":00Z" : "Z"}`;

function datasetRows(d: Dataset, user: User): Array<{ modifiedAt: string; row: Row }> {
  const tx = scopedTransactions(user);
  const fact = (t: Transaction): Row => ({ transactionId: t.id, invoiceDate: t.invoiceDate, customerId: t.customerId, sku: t.sku, region: t.region, channel: t.channel, salesRepId: t.salesRepId, qty: t.qty });
  switch (d) {
    case "MARGIN_FACT":
      return tx.map((t) => ({ modifiedAt: t.updatedAt, row: { ...fact(t), revenue: +(t.invoice * t.qty).toFixed(2), cost: +(t.cost * t.qty).toFixed(2), grossMargin: +((t.invoice - t.cost) * t.qty).toFixed(2), pocketMargin: +((t.pocket - t.cost) * t.qty).toFixed(2) } }));
    case "WATERFALL_FACT":
      return tx.map((t) => ({ modifiedAt: t.updatedAt, row: { ...fact(t), list: t.list, standardDiscount: t.standardDiscount, customerDiscount: t.customerDiscount, promotion: t.promotion, invoice: t.invoice, rebate: t.rebate, freight: t.freight, pocket: t.pocket, cost: t.cost } }));
    case "PRICE_LIST_DIM":
      return PRICE_LISTS.map((l) => ({ modifiedAt: l.lastUpdated, row: { priceListId: l.id, name: l.name, type: l.type, status: l.status, version: l.version, currency: l.currency, region: l.region, effectiveFrom: l.effectiveFrom, effectiveTo: l.effectiveTo ?? null } }));
    case "QUOTE_FACT": {
      const qs = user.role === "SALES_REP" ? QUOTES.filter((q) => q.ownerId === user.id) : QUOTES;
      return qs.map((q) => {
        const p = priceQuote(q);
        return { modifiedAt: q.updatedAt, row: { quoteId: q.id, customerId: q.customerId, ownerId: q.ownerId, status: q.status, revision: q.revision, netValue: p.totals.net, discountPct: p.totals.discountPct, marginPct: p.totals.marginPct, expectedMarginPct: q.expectedMarginPct ?? null, actualMarginPct: q.actualMarginPct ?? null } };
      });
    }
    case "EXCEPTION_FACT": {
      const es = user.role === "SALES_REP" ? EXCEPTIONS.filter((e) => e.requesterId === user.id) : EXCEPTIONS;
      return es.map((e) => ({ modifiedAt: e.updatedAt, row: { exceptionId: e.id, customerId: e.customerId, sku: e.sku, justification: e.justification, status: e.status, currentPrice: e.currentPrice, requestedPrice: e.requestedPrice, expiryDate: e.expiryDate, competitorPrice: e.competitorPrice ?? null } }));
    }
  }
}

type ExportEntry = { id: string; at: string; userId: string; dataset: Dataset; filters: string; format: Format; rows: number; channel: "UI" | "API" };
const SEED_LOG: ExportEntry[] = [
  { id: "EX-311", at: "2026-10-29 06:00", userId: "svc-powerbi", dataset: "MARGIN_FACT", filters: "modifiedSince=2026-10-28T06:00:00Z", format: "PARQUET", rows: 1_204, channel: "API" },
  { id: "EX-310", at: "2026-10-28 16:12", userId: "U-10", dataset: "QUOTE_FACT", filters: "—", format: "CSV", rows: 11, channel: "UI" },
  { id: "EX-309", at: "2026-10-28 06:00", userId: "svc-powerbi", dataset: "WATERFALL_FACT", filters: "modifiedSince=2026-10-27T06:00:00Z", format: "PARQUET", rows: 980, channel: "API" },
];

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
const toCsv = (rows: Row[]) => {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => (v === null || v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
};

function Page() {
  const { user, sees, can } = useSession();
  const [tool, setTool] = useState("POWER_BI");
  const [method, setMethod] = useState("REST_API");
  const [connected, setConnected] = useState(true);
  const [dataset, setDataset] = useState<Dataset>("MARGIN_FACT");
  const [since, setSince] = useState("2026-10-01T00:00");
  const [format, setFormat] = useState<Format>("CSV");
  const [log, setLog] = useState<ExportEntry[]>(SEED_LOG);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const all = useMemo(() => datasetRows(dataset, user), [dataset, user]);
  const sinceIso = since ? `${since}:00Z` : undefined;
  // Incremental pull: only rows changed after "Modified since" (US-AN-05 AC#3).
  const changed = sinceIso ? all.filter((r) => iso(r.modifiedAt) > sinceIso) : all;
  const allCols = all[0] ? Object.keys(all[0].row) : [];
  const dropped = allCols.filter((c) => SECURED_COLUMNS[c] && !sees(SECURED_COLUMNS[c]));
  const visible = (r: Row): Row => Object.fromEntries(Object.entries(r).filter(([k]) => !dropped.includes(k)));

  const endpoint = `https://api.rebateninja.example/v1/datasets/${dataset.toLowerCase()}?${sinceIso ? `modifiedSince=${encodeURIComponent(sinceIso)}&` : ""}format=${format.toLowerCase()}`;
  const request = `GET ${endpoint}\nAuthorization: Bearer <service-account token>\n\n200 OK\nX-RateLimit-Limit: 600\nX-RateLimit-Remaining: 587\nX-RateLimit-Reset: 60\nX-Correlation-Id: c-${shortHash(endpoint)}\nX-Row-Count: ${changed.length}`;

  const exportNow = (ev?: FormEvent) => {
    ev?.preventDefault();
    if (since && Number.isNaN(Date.parse(`${since}:00Z`))) {
      setError({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Enter a valid date and time, or clear the field for a full export.", field: "modifiedSince" });
      return;
    }
    setError(null);
    setBusy(true);
    window.setTimeout(() => {
      const rows = changed.map((r) => visible(r.row));
      const stamp = NOW.replace(/[: ]/g, "-");
      if (format === "CSV") download(`${dataset.toLowerCase()}-${stamp}.csv`, toCsv(rows), "text/csv");
      else if (format === "JSON") download(`${dataset.toLowerCase()}-${stamp}.json`, JSON.stringify({ dataset, modifiedSince: sinceIso ?? null, rows }, null, 2), "application/json");
      const entry: ExportEntry = { id: `EX-${312 + log.length - SEED_LOG.length}`, at: NOW, userId: user.id, dataset, filters: sinceIso ? `modifiedSince=${sinceIso}` : "—", format, rows: rows.length, channel: "UI" };
      setLog((l) => [entry, ...l]);
      // Every export is an audit event (US-AN-05 AC#2, US-AD-04).
      AUDIT_LOG.unshift({ id: `AU-${78000 + log.length}`, at: NOW, actor: user.name, entity: "Data Export", record: dataset, action: "DATA_EXPORT", after: `${rows.length} rows · ${format}`, reasonText: entry.filters, correlationId: `c-${shortHash(entry.id + NOW)}` });
      setBusy(false);
      if (format === "PARQUET") toast.success(`${dataset} Parquet file is being built`, { description: `${rows.length} rows. Parquet is produced server-side — your BI tool picks it up from the API link. Export recorded in the audit log.` });
      else notifySuccess(`${rows.length.toLocaleString("en-GB")} rows exported`, "Export recorded in the audit log.");
    }, 500);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(endpoint);
      notifySuccess("Request URL copied");
    } catch {
      toast.error("Couldn't copy — select the URL and copy it manually.");
    }
  };

  const note = rlsNote(user);
  const canConfigure = can("ANALYTICS", "E") || user.role === "IT_ADMIN";

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Analytics & reporting" }, { label: "BI export" }]}>
      <DetailTitle title="BI export" subtitle="Governed pricing datasets for Power BI, Tableau and the data warehouse — incremental, secured and logged." actions={<Freshness />} />
      {note && <InfoBanner title="Row-level security">{note} Exports contain the same rows you can see.</InfoBanner>}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] mb-6">
        <Card title="BI connection" subtitle={connected ? "Connected · scheduled pull daily 06:00 UTC" : "Not connected"}>
          <div className="space-y-4">
            <Field label="BI tool">
              <select className={inputCls} value={tool} onChange={(e) => setTool(e.target.value)} disabled={!canConfigure}>
                <option value="POWER_BI">Microsoft Power BI</option>
                <option value="TABLEAU">Tableau</option>
              </select>
            </Field>
            <Field label="Connection method" hint={method === "REST_API" ? "Pulls through the REST API with the svc-bi-export service account." : "Pushes nightly to the Snowflake PRICING schema."}>
              <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)} disabled={!canConfigure}>
                <option value="REST_API">REST API</option>
                <option value="WAREHOUSE">Data-warehouse connector (Snowflake)</option>
              </select>
            </Field>
            <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
              <dt className="text-muted-foreground">Service account</dt>
              <dd className="font-mono text-xs">svc-bi-export</dd>
              <dt className="text-muted-foreground">Scopes</dt>
              <dd className="flex flex-wrap gap-1">{DATASETS.map((d) => <Tag key={d}>{d}</Tag>)}</dd>
              <dt className="text-muted-foreground">Rate limit</dt>
              <dd>600 requests / minute, returned in response headers</dd>
            </dl>
            {canConfigure ? (
              <div className="flex flex-wrap justify-end gap-2">
                {connected && (
                  <Btn variant="subtle" onClick={() => { setConnected(false); toast("BI connection paused", { description: "Scheduled pulls stop until you reconnect.", action: { label: "Undo", onClick: () => setConnected(true) } }); }}>
                    Pause connection
                  </Btn>
                )}
                <Btn icon={PlugZap} onClick={() => { setConnected(true); notifySuccess("BI connection saved", `${tool === "POWER_BI" ? "Power BI" : "Tableau"} via ${method === "REST_API" ? "REST API" : "Snowflake connector"}.`); }}>
                  Save connection
                </Btn>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Only pricing and IT administrators can change the connection.</p>
            )}
          </div>
        </Card>

        <Card title="Export a dataset">
          <form onSubmit={exportNow} noValidate>
            <ErrorBanner error={error} onClose={() => setError(null)} note="Nothing was exported." />
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Dataset" className="sm:col-span-3" hint={DATASET_INFO[dataset]}>
                <select className={inputCls} value={dataset} onChange={(e) => setDataset(e.target.value as Dataset)}>
                  {DATASETS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Modified since (UTC)" hint="Leave blank for a full export." className="sm:col-span-2">
                <input type="datetime-local" className={inputCls} value={since} onChange={(e) => setSince(e.target.value)} />
              </Field>
              <Field label="Format">
                <select className={inputCls} value={format} onChange={(e) => setFormat(e.target.value as Format)}>
                  <option value="CSV">CSV</option>
                  <option value="JSON">JSON</option>
                  <option value="PARQUET">Parquet</option>
                </select>
              </Field>
            </div>
            <p className="mt-4 text-sm" role="status">
              <strong className="tabular-nums">{changed.length.toLocaleString("en-GB")}</strong> of {all.length.toLocaleString("en-GB")} rows {sinceIso ? "changed since then" : "in the dataset"}.
            </p>
            {dropped.length > 0 && (
              <p className="mt-2 text-sm">
                <Flag tone="info">Field-level security</Flag> <span className="text-muted-foreground">Removed for your role: {dropped.map(humanize).join(", ")}.</span>
              </p>
            )}
            <div className="mt-4">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="text-sm font-medium">API request preview</span>
                <Btn type="button" variant="ghost" size="sm" icon={Copy} onClick={copy}>
                  Copy URL
                </Btn>
              </div>
              <pre className="rounded-lg bg-muted px-4 py-3 text-xs overflow-x-auto whitespace-pre" tabIndex={0} aria-label="API request and response headers">
                {request}
              </pre>
            </div>
            <div className="mt-4 flex justify-end">
              <Btn type="submit" icon={Download} loading={busy} disabled={changed.length === 0}>
                Export {changed.length.toLocaleString("en-GB")} rows
              </Btn>
            </div>
          </form>
        </Card>
      </div>

      <Card title="Export log" subtitle="Every export — by a person or a service — is recorded here and in the audit log." padded={false}>
        <DataTable<ExportEntry>
          caption="Export log"
          rows={log}
          rowKey={(e) => e.id}
          pageSize={10}
          empty={<span className="inline-flex items-center gap-2"><FileSpreadsheet className="size-4" aria-hidden /> No exports yet.</span>}
          columns={[
            { key: "at", header: "When", cell: (e) => <span className="tabular-nums whitespace-nowrap">{e.at}</span> },
            { key: "u", header: "User or service", cell: (e) => (e.userId.startsWith("svc-") ? <span className="font-mono text-xs">{e.userId}</span> : userName(e.userId)) },
            { key: "d", header: "Dataset", cell: (e) => <span className="font-mono text-xs">{e.dataset}</span> },
            { key: "f", header: "Filters", cell: (e) => <span className="text-xs break-all">{e.filters}</span> },
            { key: "fmt", header: "Format", cell: (e) => <Tag>{e.format}</Tag> },
            { key: "r", header: "Rows", align: "right", cell: (e) => <span className="tabular-nums">{e.rows.toLocaleString("en-GB")}</span> },
            { key: "c", header: "Channel", cell: (e) => <Tag tone={e.channel === "API" ? "info" : "neutral"}>{e.channel}</Tag> },
          ]}
        />
      </Card>
    </PricingLayout>
  );
}
