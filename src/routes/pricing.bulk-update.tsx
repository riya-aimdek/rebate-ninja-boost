import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Download, FlaskConical, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  ConfirmDialog,
  DataTable,
  DetailGrid,
  Drawer,
  EmptyState,
  ErrorBanner,
  Field,
  FilterPills,
  Flag,
  InfoBanner,
  LinkBtn,
  ListHeader,
  PricingLayout,
  RecordLink,
  ProgressBar,
  StatusPill,
  Stepper,
  Tag,
  humanize,
  inputCls,
  money,
  pct,
  type ApiError,
  type Column,
} from "@/components/pricing/kit";
import {
  BULK_JOBS,
  BULK_METHODS,
  BULK_SELECTION,
  GUARDRAIL_HANDLING,
  PRICE_LISTS,
  REASON_CODES,
  productBySku,
  type BulkJob,
} from "@/lib/pricing/data";

export const Route = createFileRoute("/pricing/bulk-update")({
  head: () => ({ meta: [{ title: "Bulk price update · Rebate Ninja" }] }),
  component: Page,
});

const STEPS = ["Select products", "Adjustment method", "Preview", "Confirm"];
const SELECTION_COUNT: Record<string, number> = {
  "Product List": 14,
  "Product Hierarchy node": 100_000,
  "Saved filter": 4_210,
  "Uploaded file": 12_500,
};
const HIERARCHY_NODES = [
  "Electrical (100,000 SKUs)",
  "Electrical › Cable",
  "Electrical › Lighting",
  "Industrial › Fasteners",
];
const SAVED_FILTERS = ["Cable SKUs", "Phase-out lighting", "Premium ventilation"];

/** Sample lines for the preview (old prices + guardrails from ST-05 / PL-02 AC#5). */
const SAMPLE = [
  { sku: "A-100", old: 55, cost: 44, ceiling: 60 },
  { sku: "EW-3100", old: 689, cost: 436 },
  { sku: "CB-2.5", old: 1.05, cost: 0.66 },
  { sku: "LT-PNL-60", old: 34.5, cost: 18.2 },
  { sku: "SW-RCD-63", old: 38, cost: 21.75, floor: 36 },
  { sku: "HT-ELE-2K", old: 149, cost: 88 },
];

type PreviewRow = {
  sku: string;
  old: number;
  raw: number;
  next: number;
  flag?: string;
  breach: boolean;
};

const r2 = (x: number) => Math.round(Number((x * 100).toFixed(6))) / 100;

function applyMethod(method: string, value: number, old: number, cost: number) {
  switch (method) {
    case "PERCENTAGE":
      return old * (1 + value / 100);
    case "FIXED_AMOUNT":
      return old + value;
    case "FORMULA":
      return old * (1 + value / 100) + 0.5; // demo formula: old × (1 + v%) + 0.50 handling
    case "COST_CHANGE":
      return cost / (1 - value / 100); // reprice to target margin %
    case "CURRENCY_ADJUSTMENT":
      return old * value;
    default:
      return old;
  }
}

/** Input constraints per adjustment method (error prevention). */
const VALUE_RULES: Record<
  string,
  { min?: number; max?: number; step: string; unit: string; label: string }
> = {
  PERCENTAGE: {
    min: -99,
    max: 100,
    step: "0.1",
    unit: "%",
    label: "Enter a percentage between -99 and 100, e.g. 5 or -3",
  },
  FIXED_AMOUNT: { step: "0.01", unit: "£", label: "Enter an amount, e.g. 1.50 or -0.25" },
  FORMULA: {
    min: -99,
    max: 100,
    step: "0.1",
    unit: "%",
    label: "Enter an uplift between -99 and 100%, e.g. 5",
  },
  COST_CHANGE: {
    min: 0,
    max: 95,
    step: "0.1",
    unit: "%",
    label: "Enter a target margin between 0 and 95%, e.g. 30",
  },
  CURRENCY_ADJUSTMENT: {
    min: 0.0001,
    max: 100,
    step: "0.0001",
    unit: "×",
    label: "Enter an FX multiplier above 0, e.g. 1.17",
  },
};

function formatAdjustment(method: string, v: number) {
  if (method === "PERCENTAGE" || method === "FORMULA") return `${v > 0 ? "+" : ""}${v}%`;
  if (method === "COST_CHANGE") return `target margin ${v}%`;
  if (method === "CURRENCY_ADJUSTMENT") return `× ${v}`;
  return `${v > 0 ? "+" : ""}${v}`;
}

function Page() {
  const [step, setStep] = useState(0);
  const [selection, setSelection] = useState<string>(BULK_SELECTION[1]);
  const [selectionDetail, setSelectionDetail] = useState(HIERARCHY_NODES[0]);
  const [target, setTarget] = useState("BL-002");
  const [method, setMethod] = useState<string>("PERCENTAGE");
  const [value, setValue] = useState("5");
  const [handling, setHandling] = useState<string>("CLAMP");
  const [reason, setReason] = useState("ANNUAL_PRICE_INCREASE");
  const [error, setError] = useState<ApiError | null>(null);
  const [jobs, setJobs] = useState<BulkJob[]>(BULK_JOBS);
  const [openJob, setOpenJob] = useState<BulkJob | null>(null);
  const [showErrors, setShowErrors] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [jobStatus, setJobStatus] = useState<BulkJob["status"][]>([]);
  const valueRef = useRef<HTMLInputElement>(null);
  const reasonRef = useRef<HTMLSelectElement>(null);

  const targetList = PRICE_LISTS.find((l) => l.id === target);
  const count = SELECTION_COUNT[selection];
  const v = Number(value);
  const rule = VALUE_RULES[method] ?? VALUE_RULES.PERCENTAGE;

  const preview: PreviewRow[] = useMemo(
    () =>
      SAMPLE.map((s) => {
        const raw = r2(applyMethod(method, v, s.old, s.cost));
        let next = raw;
        let flag: string | undefined;
        const breach =
          (s.ceiling !== undefined && raw > s.ceiling) || (s.floor !== undefined && raw < s.floor);
        if (breach) {
          const limit =
            s.ceiling !== undefined && raw > s.ceiling ? s.ceiling : (s.floor as number);
          if (handling === "CLAMP") {
            next = limit;
            flag = "clamped by guardrail";
          } else if (handling === "SKIP") {
            next = s.old;
            flag = "skipped — guardrail breach";
          } else flag = "failed — guardrail breach";
        }
        return { sku: s.sku, old: s.old, raw, next, flag, breach };
      }),
    [method, v, handling],
  );
  const changes = preview.map((p) => ((p.next - p.old) / p.old) * 100);
  const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
  const max = Math.max(...changes.map(Math.abs));
  const breaches = preview.filter((p) => p.breach).length;
  const breachEstimate = Math.round((count * breaches) / (SAMPLE.length * 300)) || breaches;

  // Inline validation for step 2 (kept as the user typed it — never cleared on error).
  const valueError =
    value.trim() === "" || Number.isNaN(v)
      ? `Enter an adjustment value. ${rule.label}.`
      : (rule.min !== undefined && v < rule.min) || (rule.max !== undefined && v > rule.max)
        ? `${rule.label}.`
        : preview.some((p) => p.raw < 0)
          ? "This adjustment makes some prices negative. Enter a smaller decrease."
          : undefined;
  const reasonError = reason
    ? undefined
    : "Select a reason code — every price change needs one for the audit trail.";
  const adjustmentLabel = formatAdjustment(method, v);

  const next = (e?: FormEvent) => {
    e?.preventDefault();
    setError(null);
    if (step === 1) {
      if (valueError || reasonError) {
        setShowErrors(true);
        (valueError ? valueRef.current : reasonRef.current)?.focus();
        return;
      }
      setShowErrors(false);
    }
    if (step === 3) {
      setConfirmOpen(true);
      return;
    }
    setStep((s) => s + 1);
  };

  const resetFlow = () => {
    setStep(0);
    setShowErrors(false);
    setError(null);
  };

  const confirm = () => {
    setStarting(true);
    window.setTimeout(() => {
      setStarting(false);
      setConfirmOpen(false);
      startJob();
    }, 600);
  };

  const startJob = () => {
    const id = `JOB-${2292 + jobs.length - BULK_JOBS.length}`;
    const job: BulkJob = {
      id,
      targetList: targetList?.name ?? target,
      method: method as BulkJob["method"],
      value:
        method === "PERCENTAGE"
          ? `${v > 0 ? "+" : ""}${v}%`
          : method === "COST_CHANGE"
            ? `Target margin ${v}%`
            : method === "CURRENCY_ADJUSTMENT"
              ? `× ${v}`
              : `${v > 0 ? "+" : ""}${v}`,
      selection: `${humanize(selection)}: ${selection === "Product List" ? "14 products" : selectionDetail}`,
      handling: handling as BulkJob["handling"],
      status: "QUEUED",
      total: count,
      succeeded: 0,
      failed: 0,
      clamped: 0,
      startedBy: "Riya Shah",
      startedAt: "2026-10-29 14:15",
      published: false,
      rolledBack: false,
    };
    setJobs((j) => [job, ...j]);
    setStep(0);
    toast(`Bulk update ${id} started`, {
      description: `${count.toLocaleString("en-GB")} SKUs queued. Results land in a draft version of ${job.targetList} — track progress in Bulk jobs below.`,
    });
  };

  // Simulate job progress for newly queued jobs: QUEUED → RUNNING → SUCCEEDED / PARTIAL_SUCCESS
  useEffect(() => {
    const live = jobs.find(
      (j) =>
        (j.status === "QUEUED" || j.status === "RUNNING") && !BULK_JOBS.some((b) => b.id === j.id),
    );
    if (!live) return;
    const t = setTimeout(() => {
      setJobs((all) =>
        all.map((j) => {
          if (j.id !== live.id) return j;
          if (j.status === "QUEUED") return { ...j, status: "RUNNING" };
          const succeeded = Math.min(j.total, j.succeeded + Math.ceil(j.total / 3));
          if (succeeded < j.total) return { ...j, succeeded };
          const failed = j.total >= 100_000 ? 120 : 0;
          const clamped = handling === "CLAMP" ? breachEstimate : 0;
          const done = {
            ...j,
            succeeded: j.total - failed,
            failed,
            clamped,
            status: (failed ? "PARTIAL_SUCCESS" : "SUCCEEDED") as BulkJob["status"],
            finishedAt: "2026-10-29 14:58",
          };
          toast[failed ? "warning" : "success"](
            failed
              ? `${j.id} finished with partial success — ${failed} failed records listed`
              : `${j.id} completed`,
          );
          return done;
        }),
      );
    }, 900);
    return () => clearTimeout(t);
  }, [jobs, handling, breachEstimate]);

  const JOB_STATUS_ORDER: BulkJob["status"][] = [
    "QUEUED",
    "RUNNING",
    "SUCCEEDED",
    "PARTIAL_SUCCESS",
    "FAILED",
  ];
  const jobStatuses = JOB_STATUS_ORDER.filter((st) => jobs.some((j) => j.status === st));
  const shownJobs = jobStatus.length ? jobs.filter((j) => jobStatus.includes(j.status)) : jobs;

  const jobCols: Column<BulkJob>[] = [
    {
      key: "id",
      header: "Job",
      cell: (j) => (
        <button
          type="button"
          className="text-brand font-medium hover:underline whitespace-nowrap"
          onClick={(e) => {
            e.stopPropagation();
            setOpenJob(j);
          }}
        >
          {j.id}
        </button>
      ),
    },
    { key: "t", header: "Target list (draft)", className: "min-w-40", cell: (j) => j.targetList },
    {
      key: "m",
      header: "Method",
      cell: (j) => (
        <span className="whitespace-nowrap">
          {humanize(j.method)} · {j.value}
        </span>
      ),
    },
    {
      key: "s",
      header: "Status",
      cell: (j) => (
        <div className="flex flex-col items-start gap-1">
          {<StatusPill status={j.status} />}
          {j.rolledBack && <Tag tone="info">Rolled back</Tag>}
        </div>
      ),
    },
    {
      key: "p",
      header: "Progress",
      cell: (j) => (
        <div className="min-w-[160px] space-y-1">
          <ProgressBar
            value={((j.succeeded + j.failed) / j.total) * 100}
            tone={
              j.status === "FAILED"
                ? "danger"
                : j.status === "PARTIAL_SUCCESS"
                  ? "warning"
                  : "success"
            }
          />
          <div className="text-xs text-muted-foreground tabular-nums">
            {(j.succeeded + j.failed).toLocaleString("en-GB")} / {j.total.toLocaleString("en-GB")}
          </div>
        </div>
      ),
    },
    {
      key: "ok",
      header: "Succeeded",
      align: "right",
      cell: (j) => (
        <span className="tabular-nums text-success font-semibold">
          {j.succeeded.toLocaleString("en-GB")}
        </span>
      ),
    },
    {
      key: "f",
      header: "Failed",
      align: "right",
      cell: (j) => (
        <span className={`tabular-nums ${j.failed ? "text-destructive font-semibold" : ""}`}>
          {j.failed.toLocaleString("en-GB")}
        </span>
      ),
    },
    {
      key: "c",
      header: "Clamped",
      align: "right",
      cell: (j) => <span className="tabular-nums">{j.clamped.toLocaleString("en-GB")}</span>,
    },
    {
      key: "by",
      header: "Started",
      cell: (j) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {j.startedBy} · {j.startedAt}
        </span>
      ),
    },
  ];

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Bulk price update" }]}>
      <ListHeader
        title="Bulk price update"
        subtitle="Apply one controlled change across many SKUs — preview the impact first; results land in a draft version you can roll back until it is published."
      />

      <InfoBanner
        tone="brand"
        title="Simulate before you change"
        action={
          <LinkBtn to="/pricing/simulator" variant="outline" size="sm" icon={FlaskConical}>
            Run simulation
          </LinkBtn>
        }
      >
        See volume, revenue and margin sensitivity before committing.
      </InfoBanner>

      <Card
        className="mb-8"
        title="Create bulk update"
        subtitle={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step]}`}
      >
        <form onSubmit={next} noValidate>
          <Stepper steps={STEPS} current={step} />
          <ErrorBanner error={error} onClose={() => setError(null)} />
          <p className="text-xs text-muted-foreground mb-4">
            <span className="text-destructive" aria-hidden>
              *
            </span>{" "}
            Required
          </p>

          {step === 0 && (
            <div className="grid md:grid-cols-2 gap-6">
              <fieldset>
                <legend className="text-sm font-medium text-foreground mb-1.5">
                  Selection mode
                  <span className="text-destructive ml-0.5" aria-hidden>
                    *
                  </span>
                </legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {BULK_SELECTION.map((s) => (
                    <button
                      key={s}
                      type="button"
                      aria-pressed={selection === s}
                      onClick={() => {
                        setSelection(s);
                        setSelectionDetail(
                          s === "Product Hierarchy node"
                            ? HIERARCHY_NODES[0]
                            : s === "Saved filter"
                              ? SAVED_FILTERS[0]
                              : "",
                        );
                      }}
                      className={`text-left rounded-lg border px-3 py-2 min-h-10 text-sm ${selection === s ? "border-brand bg-brand-soft font-semibold" : "border-border bg-card hover:bg-muted"}`}
                    >
                      {humanize(s)}
                      <div className="text-xs text-muted-foreground font-normal">
                        {SELECTION_COUNT[s].toLocaleString("en-GB")} SKUs
                      </div>
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="space-y-4">
                {selection === "Product Hierarchy node" && (
                  <Field label="Hierarchy node">
                    <select
                      className={inputCls}
                      value={selectionDetail}
                      onChange={(e) => setSelectionDetail(e.target.value)}
                    >
                      {HIERARCHY_NODES.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </Field>
                )}
                {selection === "Saved filter" && (
                  <Field label="Saved filter">
                    <select
                      className={inputCls}
                      value={selectionDetail}
                      onChange={(e) => setSelectionDetail(e.target.value)}
                    >
                      {SAVED_FILTERS.map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </Field>
                )}
                {selection === "Uploaded file" && (
                  <Field label="Upload file" hint="CSV or XLSX with a SKU column">
                    <input
                      type="file"
                      accept=".csv,.xlsx"
                      className={`${inputCls} py-1.5`}
                      onChange={(e) => setSelectionDetail(e.target.files?.[0]?.name ?? "")}
                    />
                  </Field>
                )}
                {selection === "Product List" && (
                  <div>
                    <p className="text-sm font-medium text-foreground mb-1.5">
                      Products
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {SAMPLE.map((s) => (
                        <Tag key={s.sku}>{s.sku}</Tag>
                      ))}
                      <Tag tone="brand">+8 more</Tag>
                    </div>
                  </div>
                )}
                <Field
                  label="Target price list"
                  required
                  hint="Results go into a draft version of this list and follow approval"
                >
                  <select
                    className={inputCls}
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  >
                    {PRICE_LISTS.filter(
                      (l) => !["CANCELLED", "EXPIRED", "SUPERSEDED"].includes(l.status),
                    ).map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name} ({humanize(l.status)} v{l.version})
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-6">
              <fieldset>
                <legend className="text-sm font-medium text-foreground mb-1.5">
                  Adjustment method
                  <span className="text-destructive ml-0.5" aria-hidden>
                    *
                  </span>
                </legend>
                <div className="flex flex-wrap gap-2">
                  {BULK_METHODS.map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={method === m}
                      onClick={() => setMethod(m)}
                      className={`rounded-lg border px-4 h-10 text-sm ${method === m ? "border-brand bg-brand-soft text-brand font-semibold" : "border-border bg-card hover:bg-muted"}`}
                    >
                      {humanize(m)}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="grid md:grid-cols-3 gap-x-6 gap-y-4">
                <Field
                  label={`Adjustment value (${method === "FIXED_AMOUNT" ? (targetList?.currency ?? "GBP") : rule.unit})`}
                  required
                  error={showErrors ? valueError : undefined}
                  hint={
                    method === "PERCENTAGE"
                      ? "Percent change, e.g. 5 or -3"
                      : method === "FIXED_AMOUNT"
                        ? `Amount in ${targetList?.currency ?? "GBP"} added to each price, e.g. 1.50`
                        : method === "COST_CHANGE"
                          ? "Target margin % on current cost, e.g. 30"
                          : method === "CURRENCY_ADJUSTMENT"
                            ? "FX rate multiplier, e.g. 1.17"
                            : "Formula uplift %, e.g. 5"
                  }
                >
                  <input
                    ref={valueRef}
                    type="number"
                    inputMode="decimal"
                    min={rule.min}
                    max={rule.max}
                    step={rule.step}
                    className={inputCls}
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onBlur={() => setShowErrors(true)}
                    placeholder="e.g. 5"
                  />
                </Field>
                <Field
                  label="Guardrail handling"
                  required
                  hint="What happens when a new price breaks a floor or ceiling"
                >
                  <select
                    className={inputCls}
                    value={handling}
                    onChange={(e) => setHandling(e.target.value)}
                  >
                    {GUARDRAIL_HANDLING.map((g) => (
                      <option key={g} value={g}>
                        {g === "SKIP"
                          ? "Skip — leave price unchanged"
                          : g === "CLAMP"
                            ? "Clamp — set to the limit"
                            : "Fail — fail the record"}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Reason code" required error={showErrors ? reasonError : undefined}>
                  <select
                    ref={reasonRef}
                    className={inputCls}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  >
                    <option value="">Select…</option>
                    {REASON_CODES.map((r) => (
                      <option key={r} value={r}>
                        {humanize(r)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" role="status">
                {[
                  ["SKUs in scope", count.toLocaleString("en-GB")],
                  ["Average change", pct(avg, 2)],
                  ["Maximum change", `${max.toFixed(2)}%`],
                  ["Guardrail breaches (est.)", breachEstimate.toLocaleString("en-GB")],
                ].map(([l, val]) => (
                  <div key={l} className="rounded-xl border border-border p-4 bg-card">
                    <div className="text-sm font-medium text-foreground">
                      {l}
                    </div>
                    <div className="text-2xl font-bold tabular-nums mt-1">{val}</div>
                  </div>
                ))}
              </div>
              <DataTable
                caption="Preview of sample prices before and after the update"
                columns={[
                  {
                    key: "p",
                    header: "Sample product",
                    cell: (r: PreviewRow) => (
                      <div>
                        <RecordLink to="/pricing/products/$id" params={{ id: r.sku }}>
                          {productBySku(r.sku)?.name ?? r.sku}
                        </RecordLink>
                        <div className="text-xs text-muted-foreground">{r.sku}</div>
                      </div>
                    ),
                  },
                  {
                    key: "o",
                    header: "Before",
                    align: "right",
                    cell: (r) => (
                      <span className="tabular-nums">{money(r.old, targetList?.currency)}</span>
                    ),
                  },
                  {
                    key: "raw",
                    header: "Calculated",
                    align: "right",
                    cell: (r) => (
                      <span className="tabular-nums">{money(r.raw, targetList?.currency)}</span>
                    ),
                  },
                  {
                    key: "n",
                    header: "After",
                    align: "right",
                    cell: (r) => (
                      <span className="font-semibold tabular-nums">
                        {money(r.next, targetList?.currency)}
                      </span>
                    ),
                  },
                  {
                    key: "c",
                    header: "Change",
                    align: "right",
                    cell: (r) => {
                      const d = ((r.next - r.old) / r.old) * 100;
                      return (
                        <span
                          className={`tabular-nums ${d > 0 ? "text-success" : d < 0 ? "text-destructive" : ""}`}
                        >
                          {pct(d, 2)}
                        </span>
                      );
                    },
                  },
                  {
                    key: "f",
                    header: "Flag",
                    cell: (r) =>
                      r.flag ? (
                        <Flag tone={r.flag.startsWith("failed") ? "danger" : "warning"}>
                          {r.flag}
                        </Flag>
                      ) : (
                        <span className="text-muted-foreground text-xs">OK</span>
                      ),
                  },
                ]}
                rows={preview}
                rowKey={(r) => r.sku}
              />
              <p className="text-xs text-muted-foreground">
                Guardrails: A-100 ceiling £60 (a +20% change on £55 gives £66 → Clamp sets £60),
                SW-RCD-63 floor £36.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <DetailGrid
                items={[
                  {
                    label: "Selection",
                    value: `${humanize(selection)} · ${selection === "Product List" ? "14 products" : selectionDetail || "—"}`,
                  },
                  { label: "SKUs", value: count.toLocaleString("en-GB") },
                  { label: "Method", value: `${humanize(method)} · ${adjustmentLabel}` },
                  { label: "Guardrail handling", value: humanize(handling) },
                  {
                    label: "Target",
                    value: targetList ? (
                      <span>
                        <RecordLink to="/pricing/price-lists/$id" params={{ id: targetList.id }}>
                          {targetList.name}
                        </RecordLink>{" "}
                        → new draft version v{targetList.version + 1}
                      </span>
                    ) : (
                      target
                    ),
                  },
                  { label: "Reason code", value: humanize(reason) },
                  {
                    label: "Estimated duration",
                    value:
                      count >= 100_000 ? "≈ 45 min (SLA: 100,000 SKUs within 1 hour)" : "< 5 min",
                  },
                  { label: "Publishing", value: "Nothing is published until the list is approved" },
                ]}
              />
              <InfoBanner tone="info">
                Runs in the background: Queued → Running → Succeeded, Partial success or Failed.
                Every failed record is listed. Rollback restores prior prices until the draft is
                published.
              </InfoBanner>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 mt-6 pt-5 border-t border-border">
            {step > 0 && (
              <Btn variant="ghost" onClick={resetFlow}>
                Cancel
              </Btn>
            )}
            <div className="flex-1" />
            <div className="flex flex-wrap items-center gap-2">
              {step > 0 && (
                <Btn variant="subtle" icon={ArrowLeft} onClick={() => setStep((s) => s - 1)}>
                  Back
                </Btn>
              )}
              {step < 3 ? (
                <Btn type="submit">
                  {step === 1 ? "Preview" : "Next"}
                  <ArrowRight className="size-4" aria-hidden />
                </Btn>
              ) : (
                <Btn type="submit" icon={Play}>
                  Apply update
                </Btn>
              )}
            </div>
          </div>
        </form>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        title={`Update ${count.toLocaleString("en-GB")} prices by ${adjustmentLabel}?`}
        description={`${humanize(method)} ${adjustmentLabel} will be applied to ${count.toLocaleString("en-GB")} SKUs in a new draft version of ${targetList?.name ?? target}. About ${breachEstimate.toLocaleString("en-GB")} guardrail breaches will be handled by "${humanize(handling)}". Nothing is published until the list is approved.`}
        confirmLabel={`Update ${count.toLocaleString("en-GB")} prices`}
        loading={starting}
        onConfirm={confirm}
        onCancel={() => setConfirmOpen(false)}
      />

      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h2 className="text-lg font-semibold tracking-tight">Bulk jobs</h2>
        <span className="text-sm text-muted-foreground tabular-nums" role="status">
          {shownJobs.length} {shownJobs.length === 1 ? "job" : "jobs"}
        </span>
      </div>
      <FilterPills<BulkJob["status"]>
        label="Status"
        selected={jobStatus}
        onChange={setJobStatus}
        options={jobStatuses.map((st) => ({
          key: st,
          label: humanize(st),
          count: jobs.filter((j) => j.status === st).length,
        }))}
      />
      <DataTable
        caption="Bulk update jobs"
        columns={jobCols}
        rows={shownJobs}
        rowKey={(j) => j.id}
        onRowClick={setOpenJob}
        selectedKey={openJob?.id ?? null}
        pageSize={10}
        empty={
          <EmptyState
            title="No jobs match this status"
            action={
              <Btn variant="subtle" onClick={() => setJobStatus([])}>
                Clear filters
              </Btn>
            }
          />
        }
      />

      <JobDrawer
        job={openJob ? (jobs.find((j) => j.id === openJob.id) ?? openJob) : null}
        onClose={() => setOpenJob(null)}
        onRollback={(id) =>
          setJobs((all) => all.map((j) => (j.id === id ? { ...j, rolledBack: true } : j)))
        }
      />
    </PricingLayout>
  );
}

const FAIL_REASONS = [
  ["VALIDATION_REQUIRED", "Unit of Measure missing on target line"],
  ["PRODUCT_BLOCKED", "Product A-200 has lifecycle status BLOCKED"],
  ["GUARDRAIL_BREACH", "New price below Distributor floor (FAIL handling)"],
  ["ADJUSTMENT_RESULT_NEGATIVE", "Result below zero after adjustment"],
  ["DUPLICATE_LINE", "Same SKU, UoM and Min Qty already in draft"],
] as const;

function JobDrawer({
  job,
  onClose,
  onRollback,
}: {
  job: BulkJob | null;
  onClose: () => void;
  onRollback: (id: string) => void;
}) {
  const [error, setError] = useState<ApiError | null>(null);
  const [lastId, setLastId] = useState<string | null>(null);
  const [confirmRollback, setConfirmRollback] = useState(false);
  const [exporting, setExporting] = useState(false);
  if (job && job.id !== lastId) {
    setLastId(job.id);
    setError(null);
    setConfirmRollback(false);
  }
  if (!job) return null;
  const failures = Array.from({ length: Math.min(job.failed, 8) }, (_, i) => ({
    sku: `SKU-${(410_200 + i * 37).toString()}`,
    code: FAIL_REASONS[i % FAIL_REASONS.length][0],
    message: FAIL_REASONS[i % FAIL_REASONS.length][1],
  }));
  const finished = ["SUCCEEDED", "PARTIAL_SUCCESS", "FAILED"].includes(job.status);
  const rollbackBlocked = !finished
    ? "Available when the job finishes"
    : job.rolledBack
      ? "Already rolled back"
      : job.status === "FAILED"
        ? "Nothing to roll back — no records changed"
        : null;
  return (
    <>
      <Drawer
        open
        title={job.id}
        subtitle={
          <span className="inline-flex items-center gap-2">
            <StatusPill status={job.status} /> {job.targetList}
          </span>
        }
        onClose={onClose}
        dismissible={!confirmRollback}
        footer={
          <>
            {rollbackBlocked && (
              <span className="text-xs text-muted-foreground mr-auto self-center">
                {rollbackBlocked}
              </span>
            )}
            <Btn
              variant="subtle"
              icon={Download}
              loading={exporting}
              onClick={() => {
                setExporting(true);
                window.setTimeout(() => {
                  setExporting(false);
                  toast.success(`${job.id} results exported`, {
                    description: "CSV with one row per record.",
                  });
                }, 500);
              }}
            >
              Export CSV
            </Btn>
            <Btn
              variant="outline"
              icon={RotateCcw}
              disabled={!!rollbackBlocked}
              onClick={() => {
                if (job.published) {
                  setError({
                    errorClass: "BUSINESS_RULE",
                    code: "ROLLBACK_AFTER_PUBLISH",
                    message:
                      "The draft produced by this job has been published. Rollback is no longer allowed — create a new change instead.",
                  });
                  return;
                }
                setConfirmRollback(true);
              }}
            >
              {job.rolledBack ? "Rolled back" : "Roll back"}
            </Btn>
          </>
        }
      >
        <ErrorBanner error={error} onClose={() => setError(null)} />
        {job.status === "PARTIAL_SUCCESS" && (
          <InfoBanner tone="warning" title="Partial success">
            {job.succeeded.toLocaleString("en-GB")} of {job.total.toLocaleString("en-GB")} records
            updated. {job.failed.toLocaleString("en-GB")} records failed and are listed below;
            successes are kept.
          </InfoBanner>
        )}
        {job.status === "FAILED" && (
          <InfoBanner tone="danger" title="Job failed">
            No records were updated.
          </InfoBanner>
        )}
        <InfoBanner tone={job.published ? "success" : "info"}>
          {job.published
            ? "The resulting draft has been approved and published."
            : `Results are held in a Draft version of ${job.targetList}. Nothing is published until the list is approved.`}
        </InfoBanner>
        <Card title="Job summary">
          <DetailGrid
            items={[
              { label: "Method", value: `${humanize(job.method)} · ${job.value}` },
              { label: "Guardrail handling", value: humanize(job.handling) },
              { label: "Selection", value: job.selection, full: true },
              { label: "Total", value: job.total.toLocaleString("en-GB") },
              { label: "Succeeded", value: job.succeeded.toLocaleString("en-GB") },
              { label: "Failed", value: job.failed.toLocaleString("en-GB") },
              { label: "Clamped by guardrail", value: job.clamped.toLocaleString("en-GB") },
              { label: "Started", value: `${job.startedBy} · ${job.startedAt}` },
              { label: "Finished", value: job.finishedAt ?? "—" },
            ]}
          />
          <div className="mt-4">
            <ProgressBar
              value={((job.succeeded + job.failed) / job.total) * 100}
              tone={job.failed ? "warning" : "success"}
            />
          </div>
        </Card>
        {job.failed > 0 && (
          <section aria-labelledby="failed-records-heading">
            <h3 id="failed-records-heading" className="text-base font-semibold mb-3">
              Failed records ({job.failed.toLocaleString("en-GB")})
            </h3>
            <DataTable
              caption={`Failed records for ${job.id}`}
              columns={[
                {
                  key: "s",
                  header: "SKU",
                  className: "whitespace-nowrap",
                  cell: (f: { sku: string; code: string; message: string }) => (
                    <span className="font-mono text-xs">{f.sku}</span>
                  ),
                },
                {
                  key: "c",
                  header: "Error code",
                  className: "whitespace-nowrap",
                  cell: (f) => <Tag tone="danger">{f.code}</Tag>,
                },
                { key: "m", header: "Message", cell: (f) => f.message },
              ]}
              rows={failures}
              rowKey={(f) => f.sku}
            />
            {job.failed > failures.length && (
              <p className="mt-2 text-sm text-muted-foreground">
                …and {(job.failed - failures.length).toLocaleString("en-GB")} more — export results
                for the full list.
              </p>
            )}
          </section>
        )}
        {job.rolledBack && (
          <InfoBanner tone="info" title="Rolled back">
            Prior prices restored for this job's records. Audit trail retains both the bulk update
            and the rollback.
          </InfoBanner>
        )}
      </Drawer>
      <ConfirmDialog
        open={confirmRollback}
        tone="danger"
        title={`Roll back ${job.id}?`}
        description={`Prior prices will be restored for ${job.succeeded.toLocaleString("en-GB")} records in the draft of ${job.targetList}. The audit trail keeps both the update and the rollback.`}
        confirmLabel={`Roll back ${job.succeeded.toLocaleString("en-GB")} prices`}
        onCancel={() => setConfirmRollback(false)}
        onConfirm={() => {
          setConfirmRollback(false);
          onRollback(job.id);
          toast.success(`${job.id} rolled back`, {
            description:
              "Prior prices restored. Audit history keeps both the update and the rollback.",
          });
        }}
      />
    </>
  );
}
