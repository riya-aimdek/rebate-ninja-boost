import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Check, PanelRightOpen, Pencil, RefreshCw, Settings2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  ErrorBanner,
  Field,
  FilterPills,
  Flag,
  InfoBanner,
  KpiTile,
  ListHeader,
  Modal,
  PricingLayout,
  Price,
  ProgressBar,
  RecordLink,
  StatusPill,
  Tag,
  humanize,
  inputCls,
  money,
  notifyUndo,
  pct,
  type ApiError,
  type Column,
} from "@/components/pricing/kit";
import {
  CUSTOMERS,
  GUARDRAILS,
  LOW_CONFIDENCE_THRESHOLD,
  OBJECTIVE_LABELS,
  PRODUCTS,
  RECOMMENDATIONS,
  REJECTION_REASONS,
  productBySku,
  type Recommendation,
} from "@/lib/pricing/data";

export const Route = createFileRoute("/pricing/recommendations")({
  head: () => ({
    meta: [
      { title: "Recommendations · Rebate Ninja" },
      { name: "description", content: "AI/ML price recommendations per product–customer with explainability and confidence." },
    ],
  }),
  component: RecommendationsPage,
});

type SortKey = "marginImpact" | "confidence" | "customer";
type RecStatus = Recommendation["status"];
const REC_STATUSES: RecStatus[] = ["OPEN", "ACCEPTED", "MODIFIED", "REJECTED", "EXPIRED"];

/** Displayed status: an expired item reads as Expired whatever its stored status. */
const statusOf = (r: Recommendation): RecStatus => (r.expired ? "EXPIRED" : r.status);

/** Deterministic en-GB timestamp for the disposition log, e.g. "29 Oct 2026, 14:30". */
const fmtStamp = (d: Date) => d.toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

/** "2026-11-12" -> "12 Nov 2026" without Date parsing (no timezone drift between server and client). */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return y && m && d ? `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}` : iso;
}
type Decision = "ACCEPT" | "MODIFY" | "REJECT";

/** Global minimum margin (G-001) used as the margin floor for MODIFY checks. */
const MARGIN_FLOOR_PCT = GUARDRAILS.find((g) => g.id === "G-001")?.minMarginPct ?? 20;

function costOf(sku: string) {
  return PRODUCTS.find((p) => p.sku === sku)?.cost;
}

function marginPct(price: number, sku: string) {
  const c = costOf(sku);
  if (c === undefined || price <= 0) return undefined;
  return ((price - c) / price) * 100;
}

/** Product name linked to its detail page (falls back to plain text if the SKU is unknown). */
function ProductRef({ sku, name }: { sku: string; name: string }) {
  const p = productBySku(sku);
  return p ? <RecordLink to="/pricing/products/$id" params={{ id: p.productId }}>{name}</RecordLink> : <span className="font-medium">{name}</span>;
}

/** Customer name linked to its detail page when it exists in master data. */
function CustomerRef({ name }: { name: string }) {
  const c = CUSTOMERS.find((x) => x.name === name);
  return c ? <RecordLink to="/pricing/customers/$id" params={{ id: c.id }}>{name}</RecordLink> : <>{name}</>;
}

function insideGuardrails(r: Recommendation) {
  const m = marginPct(r.suggestedPrice, r.sku);
  return m === undefined || m >= MARGIN_FLOOR_PCT;
}

function RecommendationsPage() {
  const [recs, setRecs] = useState<Recommendation[]>(RECOMMENDATIONS);
  const [threshold, setThreshold] = useState(LOW_CONFIDENCE_THRESHOLD);
  const [expiryDays, setExpiryDays] = useState(14);
  const [retrain, setRetrain] = useState("WEEKLY");
  const [showSettings, setShowSettings] = useState(false);
  const [q, setQ] = useState("");
  const [statuses, setStatuses] = useState<RecStatus[]>([]);
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "marginImpact", dir: -1 });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Recommendation | null>(null);
  const [decision, setDecision] = useState<{ rec: Recommendation; kind: Decision } | null>(null);
  const [bulk, setBulk] = useState<"ACCEPT" | "REJECT" | null>(null);
  const [bulkReason, setBulkReason] = useState("");
  const [bulkReasonErr, setBulkReasonErr] = useState<string | undefined>();
  const [log, setLog] = useState<Array<{ at: string; id: string; text: string }>>([
    { at: "24 Oct 2026, 09:00", id: "REC-8870", text: "Accepted by Riya Shah · 2.40 → 2.52 · proposal PCP-480 entered approval" },
  ]);

  const isLow = (r: Recommendation) => r.confidence < threshold;

  const rows = useMemo(() => {
    const t = q.toLowerCase();
    const f = recs.filter(
      (r) =>
        (!t || r.product.toLowerCase().includes(t) || r.customer.toLowerCase().includes(t) || r.sku.toLowerCase().includes(t)) &&
        (statuses.length === 0 || statuses.includes(statusOf(r))),
    );
    return [...f].sort((a, b) => {
      const v =
        sort.key === "customer" ? a.customer.localeCompare(b.customer) : (a[sort.key] as number) - (b[sort.key] as number);
      return v * sort.dir;
    });
  }, [recs, q, statuses, sort]);

  const open_ = recs.filter((r) => r.status === "OPEN" && !r.expired);
  const lowCount = open_.filter(isLow).length;
  const totalImpact = open_.reduce((a, r) => a + r.marginImpact, 0);
  const eligibleBulk = (r: Recommendation) => r.status === "OPEN" && !r.expired && !isLow(r) && r.method === "ML" && insideGuardrails(r);

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: key === "customer" ? 1 : -1 }));

  const SortHead = ({ k, label }: { k: SortKey; label: string }) => (
    <button
      type="button"
      onClick={() => toggleSort(k)}
      className="inline-flex items-center gap-1 hover:text-brand"
      aria-label={`Sort by ${label}${sort.key === k ? (sort.dir === 1 ? ", currently ascending" : ", currently descending") : ""}`}
    >
      {label}
      {sort.key === k ? sort.dir === 1 ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUpDown className="size-3.5 opacity-60" aria-hidden />}
    </button>
  );

  const addLog = (id: string, text: string) =>
    setLog((l) => [{ at: fmtStamp(new Date()), id, text }, ...l]);

  const settle = (rec: Recommendation, status: Recommendation["status"], text: string) => {
    setRecs((rs) => rs.map((r) => (r.id === rec.id ? { ...r, status } : r)));
    addLog(rec.id, text);
    setSelected((s) => {
      const n = new Set(s);
      n.delete(rec.id);
      return n;
    });
  };

  /** Reverts decisions (undo toast) back to their previous status and logs the reversal. */
  const revert = (items: Array<{ id: string; prev: Recommendation["status"] }>) => {
    setRecs((rs) => rs.map((r) => {
      const hit = items.find((i) => i.id === r.id);
      return hit ? { ...r, status: hit.prev } : r;
    }));
    items.forEach((i) => addLog(i.id, `Undone · decision reverted to ${humanize(i.prev).toLowerCase()}`));
  };

  /** Single accept: no modal — act immediately and offer Undo. */
  const acceptOne = (rec: Recommendation) => {
    const prev = rec.status;
    settle(rec, "ACCEPTED", `Accepted · ${rec.currentPrice} → ${rec.suggestedPrice} · price change proposal entered approval`);
    setOpen(null);
    notifyUndo(`${rec.id} accepted`, () => revert([{ id: rec.id, prev }]), "A Price Change Proposal was created and routed to approval. It is not applied directly.");
  };

  const startDecision = (rec: Recommendation, kind: Decision) => {
    if (rec.expired && kind !== "REJECT") {
      toast.error("Recommendation expired", {
        description: "This recommendation passed its expiry. Regenerate it from the latest optimization run.",
        action: { label: "Regenerate", onClick: () => toast.success(`Regeneration queued for ${rec.id}`) },
      });
      return;
    }
    if (kind === "ACCEPT") {
      acceptOne(rec);
      return;
    }
    setDecision({ rec, kind });
  };

  const selectedRecs = recs.filter((r) => selected.has(r.id));
  const bulkAcceptable = selectedRecs.filter(eligibleBulk);
  const bulkAcceptImpact = bulkAcceptable.reduce((a, r) => a + r.marginImpact, 0);
  const bulkRejectable = selectedRecs.filter((r) => r.status === "OPEN");
  const bulkRejectImpact = bulkRejectable.reduce((a, r) => a + r.marginImpact, 0);
  const signedMoney = (n: number) => `${n >= 0 ? "+" : "−"}${money(Math.abs(n), "GBP", 0)}`;

  const bulkAccept = () => {
    const done = bulkAcceptable.map((r) => ({ id: r.id, prev: r.status }));
    bulkAcceptable.forEach((r) => settle(r, "ACCEPTED", `Accepted (bulk) · ${r.currentPrice} → ${r.suggestedPrice} · price change proposal entered approval`));
    setBulk(null);
    notifyUndo(
      `${done.length} ${done.length === 1 ? "recommendation" : "recommendations"} accepted`,
      () => revert(done),
      "Each became a Price Change Proposal routed to the approval workflow.",
    );
  };

  const bulkReject = () => {
    if (!bulkReason) {
      setBulkReasonErr("Choose a reason code — every rejection is logged with its reason.");
      return;
    }
    const done = bulkRejectable.map((r) => ({ id: r.id, prev: r.status }));
    bulkRejectable.forEach((r) => settle(r, "REJECTED", `Rejected (bulk) · ${humanize(bulkReason)}`));
    setBulk(null);
    setBulkReason("");
    setBulkReasonErr(undefined);
    notifyUndo(`${done.length} ${done.length === 1 ? "recommendation" : "recommendations"} rejected`, () => revert(done));
  };

  const selectableVisible = rows.filter((r) => r.status === "OPEN");
  const allVisibleSelected = selectableVisible.length > 0 && selectableVisible.every((r) => selected.has(r.id));
  const toggleAllVisible = (on: boolean) =>
    setSelected((s) => {
      const n = new Set(s);
      selectableVisible.forEach((r) => (on ? n.add(r.id) : n.delete(r.id)));
      return n;
    });

  const columns: Column<Recommendation>[] = [
    {
      key: "sel",
      header: (
        <input
          type="checkbox"
          aria-label="Select all open recommendations shown"
          checked={allVisibleSelected}
          disabled={selectableVisible.length === 0}
          onChange={(e) => toggleAllVisible(e.target.checked)}
          className="size-4 accent-[var(--brand)]"
        />
      ),
      cell: (r) => (
        <input
          type="checkbox"
          aria-label={`Select ${r.id}`}
          disabled={r.status !== "OPEN"}
          title={
            r.status !== "OPEN"
              ? "Already decided"
              : eligibleBulk(r)
                ? "Eligible for bulk accept or reject"
                : "Can be bulk rejected; bulk accept only for high-confidence ML items inside guardrails"
          }
          checked={selected.has(r.id)}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) =>
            setSelected((s) => {
              const n = new Set(s);
              if (e.target.checked) n.add(r.id);
              else n.delete(r.id);
              return n;
            })
          }
          className="size-4 accent-[var(--brand)]"
        />
      ),
    },
    {
      key: "pair",
      header: <SortHead k="customer" label="Product · Customer" />,
      className: "min-w-[240px]",
      cell: (r) => (
        <div>
          <ProductRef sku={r.sku} name={r.product} />
          <div className="text-xs text-muted-foreground">
            {r.sku} · <CustomerRef name={r.customer} />
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (r) => <StatusPill status={statusOf(r)} /> },
    { key: "cur", header: "Current", align: "right", cell: (r) => <Price value={r.currentPrice} currency={r.currency} uom={r.uom} /> },
    {
      key: "sug",
      header: "Suggested",
      align: "right",
      cell: (r) => (
        <span className="font-semibold">
          <Price value={r.suggestedPrice} currency={r.currency} uom={r.uom} />
        </span>
      ),
    },
    {
      key: "delta",
      header: "Δ %",
      align: "right",
      cell: (r) => {
        const d = ((r.suggestedPrice - r.currentPrice) / r.currentPrice) * 100;
        return <span className={`tabular-nums font-medium ${d >= 0 ? "text-success" : "text-destructive"}`}>{pct(d)}</span>;
      },
    },
    {
      key: "impact",
      header: <SortHead k="marginImpact" label="Expected margin impact" />,
      align: "right",
      cell: (r) => (
        <span className={`tabular-nums font-semibold ${r.marginImpact >= 0 ? "text-success" : "text-destructive"}`}>
          {r.marginImpact >= 0 ? "+" : "−"}
          {money(Math.abs(r.marginImpact), r.currency, 0)}
        </span>
      ),
    },
    {
      key: "conf",
      header: <SortHead k="confidence" label="Confidence" />,
      cell: (r) => (
        <div className="flex flex-col gap-1 items-start whitespace-nowrap">
          <span className="tabular-nums text-sm">{r.confidence.toFixed(2)}</span>
          {isLow(r) && <Flag tone="danger">Low confidence</Flag>}
        </div>
      ),
    },
    {
      key: "method",
      header: "Method",
      className: "whitespace-nowrap",
      cell: (r) => (r.method === "ML" ? <Tag tone="info">ML</Tag> : <Flag tone="warning">Rule-based</Flag>),
    },
    {
      key: "exp",
      header: "Expires",
      className: "whitespace-nowrap",
      cell: (r) => <span className={r.expired ? "text-destructive font-medium" : "text-muted-foreground"}>{fmtDate(r.expiresAt)}</span>,
    },
    {
      key: "run",
      header: "Run · objective",
      className: "whitespace-nowrap",
      cell: (r) => (
        <div className="text-xs">
          <RecordLink to="/pricing/optimization">{r.runId}</RecordLink>
          <div className="text-muted-foreground">{OBJECTIVE_LABELS[r.objective]}</div>
        </div>
      ),
    },
    {
      key: "open",
      header: <span className="sr-only">Details</span>,
      cell: (r) => (
        <Btn
          variant="ghost"
          size="sm"
          icon={PanelRightOpen}
          aria-label={`Review ${r.id}: ${r.product} for ${r.customer}`}
          onClick={(e) => {
            e.stopPropagation();
            setOpen(r);
          }}
        >
          Review
        </Btn>
      ),
    },
  ];

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Price optimization" }, { label: "Recommendations" }]}>
      <ListHeader
        title="Recommendations"
        count={rows.length}
        noun="recommendation"
        subtitle="From optimization runs. Accepting creates a price change proposal for approval."
        search={q}
        onSearch={setQ}
        actions={
          <Btn variant="subtle" icon={Settings2} onClick={() => setShowSettings((s) => !s)} aria-expanded={showSettings} aria-controls="rec-settings">
            {showSettings ? "Hide settings" : "Settings"}
          </Btn>
        }
      />

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 mb-6">
        <KpiTile label="Open recommendations" value={open_.length} />
        <KpiTile label="Expected margin impact" value={signedMoney(totalImpact)} tone={totalImpact >= 0 ? "success" : "danger"} hint="Sum of open, unexpired items" />
        <KpiTile label="Low confidence" value={lowCount} tone="danger" hint={`Below threshold ${threshold.toFixed(2)}`} />
        <KpiTile label="Eligible for bulk accept" value={recs.filter(eligibleBulk).length} tone="info" hint="High confidence · ML · inside guardrails" />
      </div>

      <FilterPills<RecStatus>
        label="Status"
        selected={statuses}
        onChange={setStatuses}
        options={REC_STATUSES.map((s) => ({ key: s, label: humanize(s), count: recs.filter((r) => statusOf(r) === s).length }))}
      />

      {showSettings && (
        <div id="rec-settings">
        <Card title="Recommendation settings" subtitle="Changes apply live to the workspace." className="mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Field
              label="Low confidence threshold"
              hint="Items scoring below are flagged low confidence (0–1)"
              error={!(threshold >= 0 && threshold <= 1) ? "Enter a value between 0 and 1, e.g. 0.6." : undefined}
            >
              <input
                type="number"
                min={0}
                max={1}
                step={0.05}
                value={threshold}
                inputMode="decimal"
                onChange={(e) => setThreshold(Number(e.target.value))}
                className={inputCls}
              />
            </Field>
            <Field
              label="Expiry (days)"
              hint="Undecided items also expire when inputs change materially"
              error={!(expiryDays >= 1 && Number.isInteger(expiryDays)) ? "Enter a whole number of days, 1 or more." : undefined}
            >
              <input type="number" min={1} max={365} step={1} inputMode="numeric" value={expiryDays} onChange={(e) => setExpiryDays(Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="Model retrain schedule" hint="Orders, quotes & win/loss history (≥ 24 months)">
              <select value={retrain} onChange={(e) => setRetrain(e.target.value)} className={inputCls}>
                <option value="DAILY">Daily</option>
                <option value="WEEKLY">Weekly · Sun 02:00</option>
                <option value="MONTHLY">Monthly</option>
                <option value="MANUAL">Manual</option>
              </select>
            </Field>
          </div>
        </Card>
        </div>
      )}

      {selected.size > 0 && (
        <div className="sticky top-20 z-10 mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-brand/40 bg-brand-soft px-4 py-3" role="region" aria-label="Bulk actions">
          <span className="text-sm font-semibold" role="status">
            {selected.size} selected
          </span>
          <Btn variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
            Clear
          </Btn>
          <div className="flex-1" />
          <Btn variant="subtle" icon={X} onClick={() => setBulk("REJECT")} disabled={bulkRejectable.length === 0}>
            Reject selected
          </Btn>
          <Btn
            icon={Check}
            onClick={() => setBulk("ACCEPT")}
            disabled={bulkAcceptable.length === 0}
            title={bulkAcceptable.length === 0 ? "None of the selected items are eligible: bulk accept needs high-confidence ML items inside guardrails" : undefined}
          >
            Accept selected ({bulkAcceptable.length})
          </Btn>
        </div>
      )}

      <DataTable
        caption="Price recommendations by product and customer"
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={setOpen}
        selectedKey={open?.id ?? null}
        empty={
          q || statuses.length ? (
            <EmptyState
              icon={Sparkles}
              title={q ? `No recommendations match “${q}”` : "No recommendations match these filters"}
              action={
                <Btn
                  variant="subtle"
                  onClick={() => {
                    setQ("");
                    setStatuses([]);
                  }}
                >
                  Clear filters
                </Btn>
              }
            >
              Try a different search term or remove a status filter.
            </EmptyState>
          ) : (
            <EmptyState icon={Sparkles} title="No recommendations yet">
              Run an optimization to generate recommendations for review.
            </EmptyState>
          )
        }
      />

      <Card title="Disposition log" subtitle="Every decision is logged with its reason." className="mt-6">
        <ul className="divide-y divide-border text-sm" aria-live="polite">
          {log.map((l, i) => (
            <li key={i} className="py-2.5 flex flex-wrap gap-3">
              <span className="text-muted-foreground tabular-nums whitespace-nowrap">{l.at}</span>
              <span className="text-xs font-medium bg-muted rounded px-2 py-0.5">{l.id}</span>
              <span>{l.text}</span>
            </li>
          ))}
        </ul>
      </Card>

      <RecDrawer rec={open} threshold={threshold} onClose={() => setOpen(null)} onDecide={(k) => open && startDecision(open, k)} />

      {decision && (
        <DecisionModal
          rec={decision.rec}
          kind={decision.kind}
          onClose={() => setDecision(null)}
          onDone={(status, text, toastMsg) => {
            const prev = decision.rec.status;
            const id = decision.rec.id;
            settle(decision.rec, status, text);
            setDecision(null);
            setOpen(null);
            notifyUndo(toastMsg, () => revert([{ id, prev }]));
          }}
        />
      )}

      <ConfirmDialog
        open={bulk === "ACCEPT"}
        title={`Accept ${bulkAcceptable.length} ${bulkAcceptable.length === 1 ? "recommendation" : "recommendations"}?`}
        description={`Expected margin impact ${signedMoney(bulkAcceptImpact)}. Each becomes a Price Change Proposal routed to approval; prices are not applied directly.`}
        confirmLabel={`Accept ${bulkAcceptable.length}`}
        onConfirm={bulkAccept}
        onCancel={() => setBulk(null)}
      >
        {selectedRecs.length > bulkAcceptable.length && (
          <p className="text-sm text-muted-foreground mt-2">
            {selectedRecs.length - bulkAcceptable.length} selected item(s) will be skipped: bulk accept is limited to high-confidence ML items inside guardrails.
          </p>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={bulk === "REJECT"}
        tone="danger"
        title={`Reject ${bulkRejectable.length} ${bulkRejectable.length === 1 ? "recommendation" : "recommendations"}?`}
        description={`Forgoes ${signedMoney(bulkRejectImpact)} of expected margin impact. The reason is logged against each item.`}
        confirmLabel={`Reject ${bulkRejectable.length}`}
        onConfirm={bulkReject}
        onCancel={() => {
          setBulk(null);
          setBulkReasonErr(undefined);
        }}
      >
        <Field label="Reason code" required error={bulkReasonErr} className="mt-4">
          <select
            value={bulkReason}
            onChange={(e) => {
              setBulkReason(e.target.value);
              setBulkReasonErr(undefined);
            }}
            className={inputCls}
          >
            <option value="">Select a reason…</option>
            {REJECTION_REASONS.filter((r) => r !== "OTHER").map((r) => (
              <option key={r} value={r}>
                {humanize(r)}
              </option>
            ))}
          </select>
        </Field>
      </ConfirmDialog>
    </PricingLayout>
  );
}

function RecDrawer({
  rec,
  threshold,
  onClose,
  onDecide,
}: {
  rec: Recommendation | null;
  threshold: number;
  onClose: () => void;
  onDecide: (k: Decision) => void;
}) {
  if (!rec) return null;
  const low = rec.confidence < threshold;
  const factors = [...rec.factors].sort((a, b) => b.contribution - a.contribution).slice(0, 5);
  const band = [Math.max(0, rec.confidence - 0.08), Math.min(1, rec.confidence + 0.08)];
  const decided = rec.status !== "OPEN";
  return (
    <Drawer
      open
      onClose={onClose}
      title={`${rec.product} · ${rec.customer}`}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          {rec.id} · {rec.runId} · {OBJECTIVE_LABELS[rec.objective]} <StatusPill status={statusOf(rec)} />
        </span>
      }
      footer={
        <>
          {decided && <span className="text-sm text-muted-foreground mr-auto self-center">Already decided — see the disposition log.</span>}
          <Btn variant="subtle" icon={X} disabled={decided} onClick={() => onDecide("REJECT")}>
            Reject
          </Btn>
          <Btn variant="outline" icon={Pencil} disabled={decided} onClick={() => onDecide("MODIFY")}>
            Modify
          </Btn>
          <Btn icon={Check} disabled={decided} onClick={() => onDecide("ACCEPT")}>
            Accept
          </Btn>
        </>
      }
    >
      {rec.expired && (
        <InfoBanner tone="danger" title="Recommendation expired">
          This recommendation passed its expiry ({fmtDate(rec.expiresAt)}). Regenerate it before acting.{" "}
          <button type="button" className="text-brand font-semibold inline-flex items-center gap-1" onClick={() => toast.success(`Regeneration queued for ${rec.id}`)}>
            <RefreshCw className="size-3.5" aria-hidden /> Regenerate
          </button>
        </InfoBanner>
      )}
      <p className="text-sm flex flex-wrap gap-x-4 gap-y-1">
        <span>
          Product: <ProductRef sku={rec.sku} name={`${rec.product} (${rec.sku})`} />
        </span>
        <span>
          Customer: <CustomerRef name={rec.customer} />
        </span>
      </p>
      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-center">
          <div>
            <div className="text-xs font-medium text-muted-foreground">Current</div>
            <div className="text-lg font-semibold mt-1">
              <Price value={rec.currentPrice} currency={rec.currency} uom={rec.uom} />
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">Suggested</div>
            <div className="text-lg font-bold text-brand mt-1">
              <Price value={rec.suggestedPrice} currency={rec.currency} uom={rec.uom} />
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-muted-foreground">Margin impact</div>
            <div className={`text-lg font-bold mt-1 tabular-nums ${rec.marginImpact >= 0 ? "text-success" : "text-destructive"}`}>
              {rec.marginImpact >= 0 ? "+" : "−"}
              {money(Math.abs(rec.marginImpact), rec.currency, 0)}
            </div>
          </div>
        </div>
      </Card>

      <Card title="Confidence">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span className="text-2xl font-bold tabular-nums">{rec.confidence.toFixed(2)}</span>
          {low ? <Flag tone="danger">Low confidence</Flag> : <Tag tone="success">Above threshold {threshold.toFixed(2)}</Tag>}
          {rec.method === "RULE_BASED" ? <Flag tone="warning">Rule-based, not ML</Flag> : <Tag tone="info">ML</Tag>}
        </div>
        <ProgressBar value={rec.confidence * 100} tone={low ? "danger" : "success"} label={`Confidence ${rec.confidence.toFixed(2)}`} />
        <p className="text-xs text-muted-foreground mt-2">
          Confidence band {band[0].toFixed(2)} – {band[1].toFixed(2)}
        </p>
        {rec.missingInputs && rec.missingInputs.length > 0 && (
          <p className="text-sm mt-3">
            <Flag tone="warning">Missing input</Flag> <span className="ml-1">{rec.missingInputs.join(", ")} unavailable — confidence reduced.</span>
          </p>
        )}
      </Card>

      {rec.method === "RULE_BASED" ? (
        <Card title="Why this price?">
          <InfoBanner tone="warning" title="Rule-based, not ML">
            {rec.coldStartReason ?? "Insufficient history for ML."} The system used rule-based defaults.
          </InfoBanner>
          <ul className="text-sm space-y-1">
            {rec.factors.map((f) => (
              <li key={f.name}>• {f.name}</li>
            ))}
          </ul>
        </Card>
      ) : (
        <Card title="Top 5 influence factors" subtitle="Ranked by relative contribution">
          <ol className="space-y-3.5">
            {factors.map((f, i) => (
              <li key={f.name} className="flex items-center gap-3">
                <span className="size-6 rounded-full bg-navy text-navy-foreground text-xs font-bold grid place-items-center" aria-hidden>
                  {i + 1}
                </span>
                <span className={`flex items-center gap-1 text-xs font-semibold w-16 ${f.direction === "up" ? "text-success" : "text-destructive"}`}>
                  {f.direction === "up" ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />}
                  {f.direction === "up" ? "Raises" : "Lowers"}
                </span>
                <div className="flex-1">
                  <div className="text-sm font-medium">{f.name}</div>
                  <div className="mt-1 h-2 rounded-full bg-muted overflow-hidden" aria-hidden>
                    <div className={`h-full ${f.direction === "up" ? "bg-success" : "bg-destructive"}`} style={{ width: `${f.contribution}%` }} />
                  </div>
                </div>
                <span className="tabular-nums text-sm w-10 text-right">{f.contribution}%</span>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </Drawer>
  );
}

function DecisionModal({
  rec,
  kind,
  onClose,
  onDone,
}: {
  rec: Recommendation;
  kind: Decision;
  onClose: () => void;
  onDone: (status: Recommendation["status"], text: string, toastMsg: string) => void;
}) {
  const [modified, setModified] = useState("");
  const [reason, setReason] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [err, setErr] = useState<ApiError | null>(null);

  const modNum = Number(modified);
  const modMargin = modified ? marginPct(modNum, rec.sku) : undefined;
  const breach = modMargin !== undefined && modMargin < MARGIN_FLOOR_PCT;

  const submit = () => {
    setErr(null);
    if (kind === "ACCEPT") {
      onDone(
        "ACCEPTED",
        `Accepted · ${rec.currentPrice} → ${rec.suggestedPrice} · price change proposal entered approval`,
        "Accepted — price change proposal created and routed to approval",
      );
      return;
    }
    if (kind === "MODIFY") {
      if (!modified || !(modNum > 0)) {
        setErr({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Enter a modified price greater than 0, e.g. 104.50.", field: "decision.modifiedPrice" });
        return;
      }
      onDone(
        "MODIFIED",
        `Modified · original ${rec.suggestedPrice} · modified ${modNum.toFixed(2)}${breach ? " · flagged guardrail breach → approval matrix" : ""}`,
        breach ? `${rec.id} modified — flagged guardrail breach and routed to the approval matrix` : `${rec.id} modified — proposal entered approval`,
      );
      return;
    }
    if (!reason) {
      setErr({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "A rejection reason code is required.", field: "decision.reasonCode" });
      return;
    }
    if (reason === "OTHER" && !reasonText.trim()) {
      setErr({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Describe the reason — “Other” needs reason text.", field: "decision.reasonText" });
      return;
    }
    onDone("REJECTED", `Rejected · ${humanize(reason)}${reasonText ? ` — ${reasonText}` : ""}`, `${rec.id} rejected`);
  };

  const title = { ACCEPT: "Accept recommendation", MODIFY: "Modify & accept", REJECT: "Reject recommendation" }[kind];
  return (
    <Modal
      open
      title={title}
      subtitle={`${rec.product} · ${rec.customer}`}
      onClose={onClose}
      footer={
        <>
          <Btn variant="subtle" onClick={onClose}>
            Cancel
          </Btn>
          <Btn variant={kind === "REJECT" ? "danger" : "primary"} onClick={submit} disabled={kind === "MODIFY" && !modified} title={kind === "MODIFY" && !modified ? "Enter a modified price first" : undefined}>
            {kind === "REJECT" ? "Reject" : kind === "MODIFY" ? "Save modification" : "Accept"}
          </Btn>
        </>
      }
    >
      <ErrorBanner error={err} onClose={() => setErr(null)} />
      {kind === "ACCEPT" && (
        <p className="text-sm">
          Accepting creates a <b>Price Change Proposal</b> at <Price value={rec.suggestedPrice} currency={rec.currency} uom={rec.uom} /> that
          enters the approval workflow. It is not applied directly.
        </p>
      )}
      {kind === "MODIFY" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Original suggestion <Price value={rec.suggestedPrice} currency={rec.currency} uom={rec.uom} />. Both values are stored.
          </p>
          <Field label="Modified price" required error={err?.field === "decision.modifiedPrice" ? err.message : undefined}>
            <input
              type="number"
              step="0.01"
              min={0.01}
              inputMode="decimal"
              onKeyDown={(e) => e.key === "Enter" && submit()}
              value={modified}
              aria-invalid={err?.field === "decision.modifiedPrice"}
              onChange={(e) => setModified(e.target.value)}
              className={inputCls}
              placeholder={rec.suggestedPrice.toFixed(2)}
            />
          </Field>
          {modMargin !== undefined && (
            <div className="text-sm flex flex-wrap items-center gap-2">
              Resulting margin <b className="tabular-nums">{modMargin.toFixed(1)}%</b> (floor {MARGIN_FLOOR_PCT}%)
              {breach && <Flag tone="danger">Guardrail breach — routes to approval matrix</Flag>}

            </div>
          )}
        </div>
      )}
      {kind === "REJECT" && (
        <div className="space-y-4">
          <Field label="Reason code" required error={err?.field === "decision.reasonCode" ? err.message : undefined}>
            <select value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} aria-invalid={err?.field === "decision.reasonCode"}>
              <option value="">Select a reason…</option>
              {REJECTION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {humanize(r)}
                </option>
              ))}
            </select>
          </Field>
          {reason === "OTHER" && (
            <Field label="Reason text" required error={err?.field === "decision.reasonText" ? err.message : undefined}>
              <textarea value={reasonText} onChange={(e) => setReasonText(e.target.value)} className={`${inputCls} h-24 py-2`} />
            </Field>
          )}
        </div>
      )}
    </Modal>
  );
}
