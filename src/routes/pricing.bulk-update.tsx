import { createFileRoute, useBlocker, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  ArrowUpDown,
  Banknote,
  Calculator,
  Download,
  FlaskConical,
  Percent,
  Play,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Sigma,
  TrendingDown,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  ChoiceCards,
  RadioPills,
  ConfirmDialog,
  DataTable,
  DetailGrid,
  Drawer,
  EmptyState,
  ErrorBanner,
  FileDrop,
  Field,
  FilterPills,
  Flag,
  InfoBanner,
  PillTabs,
  LinkBtn,
  ListHeader,
  PricingLayout,
  RecordLink,
  SearchInput,
  ProgressBar,
  StatusPill,
  Stepper,
  Tag,
  humanize,
  inputCls,
  money,
  pct,
  toneCls,
  type Tone,
  type ApiError,
  type Column,
  MissingHint,
  missingFields,
} from "@/components/pricing/kit";
import {
  BULK_JOBS,
  BULK_METHODS,
  BULK_SELECTION,
  GUARDRAIL_HANDLING,
  PRICE_LISTS,
  PRODUCTS,
  REASON_CODES,
  productBySku,
  type BulkJob,
} from "@/lib/pricing/data";
import { downloadCsv } from "@/lib/pricing/csv";
import { NOW } from "@/lib/pricing/deals";
import { useSession } from "@/lib/pricing/session";

type Tab = "new" | "jobs";
type BulkSearch = { pct?: number; list?: string; scenario?: string; tab?: "jobs" };

export const Route = createFileRoute("/pricing/bulk-update")({
  // `?pct=3&scenario=A%20%2B3%25&list=BL-001` — the scenario simulator opens the preview prefilled (US-OP-03 AC#7).
  validateSearch: (s: Record<string, unknown>): BulkSearch => ({
    pct: typeof s.pct === "number" && Number.isFinite(s.pct) ? s.pct : undefined,
    list:
      typeof s.list === "string" && PRICE_LISTS.some((l) => l.id === s.list) ? s.list : undefined,
    scenario: typeof s.scenario === "string" && s.scenario ? s.scenario : undefined,
    // `?tab=jobs` opens the job history directly (e.g. from a "track progress" link).
    tab: s.tab === "jobs" ? "jobs" : undefined,
  }),
  head: () => ({ meta: [{ title: "Bulk price update · Rebate Ninja" }] }),
  component: Page,
});

const STEPS = ["Select products", "Adjustment", "Preview impact", "Review & apply"];
/** Scope sizes for the modes that select by rule; Product list counts what the user ticks. */
const SELECTION_COUNT: Record<string, number> = {
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

/**
 * Current prices for the preview (old prices + guardrails from ST-05 / PL-02 AC#5). The first six are
 * the sample shown for rule-based selections; Product list previews exactly the products ticked.
 */
const SAMPLE = [
  { sku: "A-100", old: 55, cost: 44, ceiling: 60 },
  { sku: "EW-3100", old: 689, cost: 436 },
  { sku: "CB-2.5", old: 1.05, cost: 0.66 },
  { sku: "LT-PNL-60", old: 34.5, cost: 18.2 },
  { sku: "SW-RCD-63", old: 38, cost: 21.75, floor: 36 },
  { sku: "HT-ELE-2K", old: 149, cost: 88 },
  { sku: "EW-3110", old: 799, cost: 498 },
  { sku: "CB-6.0", old: 2.35, cost: 1.48 },
  { sku: "LT-DWN-10", old: 72, cost: 46 },
];
const RULE_SAMPLE = SAMPLE.slice(0, 6);
/** Blocked products are listed in the picker but can't be repriced (PRODUCT_BLOCKED). */
const PICKABLE = PRODUCTS.filter((p) => p.lifecycleStatus !== "BLOCKED");

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

/** What each selection mode picks, shown on its option card. */
const SELECTION_HELP: Record<string, string> = {
  "Product List": "A hand-picked list of products.",
  "Product Hierarchy node": "Every SKU under one category.",
  "Saved filter": "A filter saved on the Products page.",
  "Uploaded file": "CSV or XLSX with a SKU column.",
};

/** One-line explanation under the method picker, so each option says what it does to a price. */
const METHOD_HELP: Record<string, string> = {
  PERCENTAGE: "New price = current price × (1 + value%).",
  FIXED_AMOUNT: "Adds the same amount to every price. Use a negative value to reduce.",
  FORMULA: "New price = current price × (1 + uplift%) + £0.50 handling.",
  COST_CHANGE: "Reprices each SKU from its current cost to hit a target margin.",
  CURRENCY_ADJUSTMENT: "Multiplies every price by an FX rate, e.g. GBP → EUR.",
};

const METHOD_ICON: Record<string, LucideIcon> = {
  PERCENTAGE: Percent,
  FIXED_AMOUNT: Banknote,
  FORMULA: Sigma,
  COST_CHANGE: Calculator,
  CURRENCY_ADJUSTMENT: ArrowLeftRight,
};

/** Worked example on a £10.00 price, so the effect of each method is clear before choosing. */
const METHOD_EXAMPLE: Record<string, string> = {
  PERCENTAGE: "£10.00 + 5% = £10.50",
  FIXED_AMOUNT: "£10.00 + £1.50 = £11.50",
  FORMULA: "£10.00 × 1.05 + £0.50 = £11.00",
  COST_CHANGE: "£7.00 cost @ 30% margin = £10.00",
  CURRENCY_ADJUSTMENT: "£10.00 × 1.17 = €11.70",
};

/** What happens to breaching SKUs, per guardrail handling. */
const BREACH_OUTCOME: Record<string, string> = {
  SKIP: "Will be skipped",
  CLAMP: "Will be clamped",
  FAIL: "Will fail",
};

/** Changes at or above this size are flagged for a second look (likely a typo, e.g. 50 instead of 5). */
const LARGE_CHANGE_PCT = 50;

/** One figure in the preview impact strip: icon, label, value and a line of context. */
function ImpactStat({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note?: ReactNode;
  tone: Tone;
}) {
  const t = toneCls[tone];
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 min-w-0">
      <span
        className={`grid place-items-center size-8 shrink-0 rounded-full ${tone === "neutral" ? "bg-muted text-muted-foreground" : `${t.soft} ${t.text}`}`}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <div className="min-w-0">
        <dt className="text-xs text-muted-foreground">{label}</dt>
        <dd className="flex items-baseline gap-2 min-w-0">
          <span className={`text-xl font-bold tabular-nums ${tone === "neutral" ? "text-foreground" : t.text}`}>
            {value}
          </span>
          {note && (
            <span className="text-xs text-muted-foreground truncate" title={typeof note === "string" ? note : undefined}>
              {note}
            </span>
          )}
        </dd>
      </div>
    </div>
  );
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

const HANDLING_LABEL: Record<string, string> = {
  SKIP: "Skip — leave price unchanged",
  CLAMP: "Clamp — set to the limit",
  FAIL: "Fail — fail the record",
};

function formatAdjustment(method: string, v: number) {
  if (method === "PERCENTAGE" || method === "FORMULA") return `${v > 0 ? "+" : ""}${v}%`;
  if (method === "COST_CHANGE") return `target margin ${v}%`;
  if (method === "CURRENCY_ADJUSTMENT") return `× ${v}`;
  return `${v > 0 ? "+" : ""}${v}`;
}

function Page() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useSession();
  const fromScenario = search.pct !== undefined;
  const [tab, setTab] = useState<Tab>(search.tab ?? "new");
  const [discardOpen, setDiscardOpen] = useState(false);
  // Opened from a simulator scenario: land on the preview with the same adjustment.
  const [step, setStep] = useState(fromScenario ? 2 : 0);
  const [selection, setSelection] = useState<string>(BULK_SELECTION[1]);
  const [selectionDetail, setSelectionDetail] = useState(HIERARCHY_NODES[0]);
  const [picked, setPicked] = useState<string[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [target, setTarget] = useState(search.list ?? "BL-002");
  const [method, setMethod] = useState<string>("PERCENTAGE");
  const [value, setValue] = useState(fromScenario ? String(search.pct) : "5");
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
  const byList = selection === "Product List";
  const count = byList ? picked.length : SELECTION_COUNT[selection];
  const v = Number(value);
  const rule = VALUE_RULES[method] ?? VALUE_RULES.PERCENTAGE;
  const previewSource = useMemo(
    () => (byList ? SAMPLE.filter((s) => picked.includes(s.sku)) : RULE_SAMPLE),
    [byList, picked],
  );

  const preview: PreviewRow[] = useMemo(
    () =>
      previewSource.map((s) => {
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
    [previewSource, method, v, handling],
  );
  const changes = preview.map((p) => ((p.next - p.old) / p.old) * 100);
  const avg = changes.reduce((a, b) => a + b, 0) / changes.length;
  const maxIdx = changes.reduce((m, c, i) => (Math.abs(c) > Math.abs(changes[m]) ? i : m), 0);
  const max = changes[maxIdx] ?? 0;
  const maxSku = preview[maxIdx]?.sku;
  const breaches = preview.filter((p) => p.breach).length;
  // A hand-picked list is previewed in full, so its breaches are exact rather than extrapolated.
  const breachEstimate = byList
    ? breaches
    : Math.round((count * breaches) / (RULE_SAMPLE.length * 300)) || breaches;

  // Inline validation for step 2 (kept as the user typed it — never cleared on error).
  // Negative results are checked before the range so -120% reports ADJUSTMENT_RESULT_NEGATIVE (US-PL-02 AC#4).
  const negative = value.trim() !== "" && !Number.isNaN(v) && preview.some((p) => p.raw < 0);
  const valueError =
    value.trim() === "" || Number.isNaN(v)
      ? `Enter an adjustment value. ${rule.label}.`
      : negative
        ? "This adjustment makes some prices negative. Enter a smaller decrease."
        : (rule.min !== undefined && v < rule.min) || (rule.max !== undefined && v > rule.max)
          ? `${rule.label}.`
          : undefined;
  const fileMissing = selection === "Uploaded file" && !selectionDetail;
  const reasonError = reason
    ? undefined
    : "Select a reason code — every price change needs one for the audit trail.";
  const adjustmentLabel = formatAdjustment(method, v);
  // Next/Preview stays disabled until this step's required fields are filled.
  const stepHintId = useId();
  const stepMissing =
    step === 0
      ? missingFields([
          ["Products", picked.length ? picked : "", byList],
          ["SKU file", selectionDetail, selection === "Uploaded file"],
          ["Target price list", target],
        ])
      : step === 1
        ? missingFields([
            ["Adjustment value", Number.isNaN(v) ? "" : value],
            ["Reason code", reason],
          ])
        : [];

  const next = (e?: FormEvent) => {
    e?.preventDefault();
    if (stepMissing.length > 0) return;
    setError(null);
    if (step === 0 && fileMissing) {
      setShowErrors(true);
      document.getElementById("bulk-file")?.focus();
      return;
    }
    if (step === 0) setShowErrors(false);
    if (step === 1) {
      if (valueError || reasonError) {
        setShowErrors(true);
        if (value.trim() === "")
          setError({
            errorClass: "VALIDATION",
            code: "VALIDATION_REQUIRED",
            message: `Enter an adjustment value to continue. ${rule.label}.`,
            field: "Adjustment value",
          });
        else if (negative)
          setError({
            errorClass: "VALIDATION",
            code: "ADJUSTMENT_RESULT_NEGATIVE",
            message: `${adjustmentLabel} would make some prices negative. Enter a smaller decrease.`,
          });
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

  // Nothing entered yet → Cancel leaves; part-way through → confirm before discarding the setup.
  const cancel = () => (step > 0 ? setDiscardOpen(true) : navigate({ to: "/pricing" }));
  // Same guard as Create price list: leaving part-way through asks before the setup is lost.
  const blocker = useBlocker({
    shouldBlockFn: () => step > 0,
    enableBeforeUnload: () => step > 0,
    withResolver: true,
  });

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
      selection: `${humanize(selection)}: ${byList ? `${count} products` : selectionDetail}`,
      handling: handling as BulkJob["handling"],
      status: "QUEUED",
      total: count,
      succeeded: 0,
      failed: 0,
      clamped: 0,
      startedBy: user.name,
      startedAt: NOW,
      published: false,
      rolledBack: false,
    };
    setJobs((j) => [job, ...j]);
    resetFlow();
    // Land where the work continues: the job list, with the new job open.
    setTab("jobs");
    setOpenJob(job);
    toast(`Bulk update ${id} started`, {
      description: `${count.toLocaleString("en-GB")} SKUs queued. Results land in a draft version of ${job.targetList}.`,
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
          const clamped = j.handling === "CLAMP" ? breachEstimate : 0;
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
  }, [jobs, breachEstimate]);

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
          className="hit text-brand-strong font-medium hover:underline whitespace-nowrap"
          onClick={(e) => {
            e.stopPropagation();
            setOpenJob(j);
          }}
        >
          {j.id}
        </button>
      ),
    },
    { key: "t", header: "Target list (draft)", className: "min-w-32", cell: (j) => j.targetList },
    {
      key: "m",
      header: "Method",
      cell: (j) => (
        <div className="whitespace-nowrap">
          <div>{humanize(j.method)}</div>
          <div className="text-xs text-muted-foreground">{j.value}</div>
        </div>
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
            label={`${j.id} progress`}
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
      key: "res",
      header: "Results",
      cell: (j) => (
        <dl className="text-sm tabular-nums whitespace-nowrap grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5">
          <dt className="text-muted-foreground">Succeeded</dt>
          <dd className="text-right font-semibold text-success">
            {j.succeeded.toLocaleString("en-GB")}
          </dd>
          <dt className="text-muted-foreground">Failed</dt>
          <dd className={`text-right ${j.failed ? "font-semibold text-destructive" : ""}`}>
            {j.failed.toLocaleString("en-GB")}
          </dd>
          {j.clamped > 0 && (
            <>
              <dt className="text-muted-foreground">Clamped</dt>
              <dd className="text-right">{j.clamped.toLocaleString("en-GB")}</dd>
            </>
          )}
        </dl>
      ),
    },
    {
      key: "by",
      header: "Started",
      cell: (j) => (
        <div className="whitespace-nowrap">
          <div>{j.startedBy}</div>
          <div className="text-xs text-muted-foreground tabular-nums">{j.startedAt}</div>
        </div>
      ),
    },
  ];

  const stepCard: Array<{ title: string; subtitle: string }> = [
    {
      title: "Choose products",
      subtitle: "Pick which SKUs change and which price list receives the new prices.",
    },
    {
      title: "Set the adjustment",
      subtitle: "How prices change, what happens at a guardrail, and why.",
    },
    {
      title: "Preview impact",
      subtitle: byList
        ? `Your ${count} ${count === 1 ? "product" : "products"}, calculated with ${adjustmentLabel}.`
        : `${RULE_SAMPLE.length} sample SKUs from your ${count.toLocaleString("en-GB")} selection, calculated with ${adjustmentLabel}.`,
    },
    {
      title: "Review & apply",
      subtitle:
        "Applying starts a background job.",
    },
  ];
  const guardedSamples = previewSource
    .filter((s) => s.ceiling !== undefined || s.floor !== undefined)
    .map((s) =>
      s.ceiling !== undefined
        ? `${s.sku} ceiling ${money(s.ceiling, targetList?.currency)}`
        : `${s.sku} floor ${money(s.floor as number, targetList?.currency)}`,
    )
    .join(", ");
  // Grouped by the step that sets them; a group appears once its step is reached and offers Edit after it.
  const detailRow: Array<[string, string]> =
    selection === "Product List"
      ? []
      : [
          [
            selection === "Product Hierarchy node"
              ? "Node"
              : selection === "Saved filter"
                ? "Filter"
                : "File",
            selectionDetail.replace(/\s*\(.*\)$/, "") || "Not chosen yet",
          ],
        ];
  const summaryGroups: Array<{ title: string; at: number; rows: Array<[string, string]> }> = [
    {
      title: "Products",
      at: 0,
      rows: [
        ["Scope", humanize(selection)],
        ...detailRow,
        ["SKUs", count.toLocaleString("en-GB")],
        ["Target list", targetList?.name ?? target],
      ],
    },
    ...(step >= 1
      ? [
          {
            title: "Adjustment",
            at: 1,
            rows: [
              ["Method", humanize(method)],
              ["Change", adjustmentLabel],
              ["Guardrails", humanize(handling)],
              ["Reason", reason ? humanize(reason) : "—"],
            ] as Array<[string, string]>,
          },
        ]
      : []),
  ];

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Bulk price update" }]}>
      <ListHeader
        title="Bulk price update"
        subtitle="Apply one controlled change across many SKUs. Preview the impact first; results land in a draft version you can roll back until it is published."
      />

      <PillTabs
        idPrefix="bulk"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "new", label: "New update" },
          { key: "jobs", label: "Jobs", count: jobs.length },
        ]}
      />

      <div role="tabpanel" id={`bulk-panel-${tab}`} aria-labelledby={`bulk-tab-${tab}`}>
        {tab === "new" && (
          <>
            {fromScenario ? (
              <InfoBanner
                tone="info"
                title={`Prefilled from scenario ${search.scenario ?? ""}`.trim()}
                action={
                  <LinkBtn to="/pricing/simulator" variant="outline" size="sm" icon={ArrowLeft}>
                    Back to simulator
                  </LinkBtn>
                }
              >
                Same scope and a {pct(search.pct ?? 0)} percentage adjustment. Check the preview,
                then continue to review.
              </InfoBanner>
            ) : (
              step === 0 && (
                <InfoBanner
                  tone="brand"
                  title="Simulate before you change"
                  action={
                    <LinkBtn
                      to="/pricing/simulator"
                      variant="outline"
                      size="sm"
                      icon={FlaskConical}
                    >
                      Run simulation
                    </LinkBtn>
                  }
                >
                  See volume, revenue and margin sensitivity before committing.
                </InfoBanner>
              )
            )}

            <Stepper steps={STEPS} current={step} onStepClick={setStep} />
            <ErrorBanner error={error} onClose={() => setError(null)} />

            <form onSubmit={next} noValidate>
              {/* Buttons sit under the step card they act on; the summary keeps its own height and stays in view. */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start pb-6">
                <div className="lg:col-span-2 min-w-0">
                  <Card title={stepCard[step].title} subtitle={stepCard[step].subtitle}>
                    {step === 0 && (
                      <div className="space-y-6">
                        <fieldset>
                          <legend className="text-sm font-medium text-foreground mb-2">
                            Selection mode
                            <span className="text-destructive ml-0.5" aria-hidden>
                              *
                            </span>
                          </legend>
                          <RadioPills<string>
                            label="Selection mode"
                            value={selection}
                            onChange={(s) => {
                              setSelection(s);
                              setFile(null);
                              setSelectionDetail(
                                s === "Product Hierarchy node"
                                  ? HIERARCHY_NODES[0]
                                  : s === "Saved filter"
                                    ? SAVED_FILTERS[0]
                                    : "",
                              );
                            }}
                            options={BULK_SELECTION.map((s) => ({
                              key: s,
                              label: humanize(s),
                              meta:
                                s === "Product List"
                                  ? picked.length
                                    ? `${picked.length} selected`
                                    : undefined
                                  : SELECTION_COUNT[s] >= 10_000
                                    ? `${Math.round(SELECTION_COUNT[s] / 1000)}k SKUs`
                                    : `${SELECTION_COUNT[s].toLocaleString("en-GB")} SKUs`,
                            }))}
                          />
                          <p className="text-xs text-muted-foreground mt-2" role="status">
                            {SELECTION_HELP[selection]}
                          </p>
                        </fieldset>
                        {/* The control for the chosen mode sits right under the options it belongs to. */}
                        {selection === "Product List" && (
                          <ProductPicker picked={picked} onChange={setPicked} />
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 empty:hidden">
                          {selection === "Product Hierarchy node" && (
                            <Field label="Hierarchy node" required>
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
                            <Field label="Saved filter" required>
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
                        </div>
                        {selection === "Uploaded file" && (
                          <FileDrop
                            id="bulk-file"
                            label="SKU file"
                            required
                            accept=".csv,.xlsx"
                            file={file}
                            onChange={(f) => {
                              setFile(f);
                              setSelectionDetail(f?.name ?? "");
                            }}
                            error={
                              showErrors && fileMissing ? "Choose a file to upload." : undefined
                            }
                            onTemplate={() => {
                              downloadCsv("bulk-update-skus-template.csv", [
                                { sku: "A-100" },
                                { sku: "EW-3100" },
                              ]);
                              toast.success("Template downloaded", {
                                description: "One SKU per row in the sku column.",
                              });
                            }}
                          />
                        )}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 border-t border-border pt-6">
                          <Field
                            label="Target price list"
                            required
                            hint="Results go into a new draft version of this list and follow approval"
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
                          <legend className="text-sm font-medium text-foreground mb-2">
                            Adjustment method
                            <span className="text-destructive ml-0.5" aria-hidden>
                              *
                            </span>
                          </legend>
                          <ChoiceCards<string>
                            label="Adjustment method"
                            layout="compact"
                            value={method}
                            onChange={setMethod}
                            options={BULK_METHODS.map((m) => ({
                              key: m,
                              label: humanize(m),
                              hint: METHOD_HELP[m],
                              icon: METHOD_ICON[m],
                              example: METHOD_EXAMPLE[m],
                            }))}
                          />
                        </fieldset>
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4">
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
                                  {HANDLING_LABEL[g] ?? humanize(g)}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field
                            label="Reason code"
                            required
                            hint="Recorded in the audit trail"
                            error={showErrors ? reasonError : undefined}
                          >
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
                      <div className="space-y-4">
                        {/* One slim row: icon, label over value, short context beside the value. */}
                        <dl className="grid grid-cols-1 sm:grid-cols-3 rounded-lg border border-border bg-card divide-y sm:divide-y-0 sm:divide-x divide-border">
                          <ImpactStat
                            icon={avg < 0 ? TrendingDown : TrendingUp}
                            label="Average change"
                            value={pct(avg || 0, 2)}
                            tone={Math.abs(avg) >= LARGE_CHANGE_PCT ? "warning" : "neutral"}
                          />
                          <ImpactStat
                            icon={ArrowUpDown}
                            label="Largest change"
                            value={pct(max, 2)}
                            tone={Math.abs(max) >= LARGE_CHANGE_PCT ? "warning" : "neutral"}
                            note={
                              Math.abs(max) >= LARGE_CHANGE_PCT
                                ? "Check the value"
                                : maxSku
                                  ? (productBySku(maxSku)?.name ?? maxSku)
                                  : undefined
                            }
                          />
                          <ImpactStat
                            icon={breachEstimate > 0 ? ShieldAlert : ShieldCheck}
                            label={byList ? "Breaches" : "Breaches (est.)"}
                            value={breachEstimate > 0 ? breachEstimate.toLocaleString("en-GB") : "None"}
                            tone={breachEstimate > 0 ? "warning" : "success"}
                            note={
                              breachEstimate > 0
                                ? (BREACH_OUTCOME[handling] ?? humanize(handling))
                                : "All within limits"
                            }
                          />
                        </dl>
                        <DataTable
                          caption="Preview of sample prices before and after the update"
                          columns={[
                            {
                              key: "p",
                              header: byList ? "Product" : "Sample product",
                              cell: (r: PreviewRow) => (
                                <div className="flex items-baseline gap-2 min-w-0">
                                  <RecordLink to="/pricing/products/$id" params={{ id: r.sku }}>
                                    {productBySku(r.sku)?.name ?? r.sku}
                                  </RecordLink>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap">{r.sku}</span>
                                </div>
                              ),
                            },
                            {
                              key: "o",
                              header: "Before",
                              align: "right",
                              cell: (r) => (
                                <span className="tabular-nums">
                                  {money(r.old, targetList?.currency)}
                                </span>
                              ),
                            },
                            // "Calculated" only differs from "After" when a guardrail clamps or skips a price.
                            ...(preview.some((p) => p.raw !== p.next)
                              ? [
                                  {
                                    key: "raw",
                                    header: "Calculated",
                                    align: "right" as const,
                                    cell: (r: PreviewRow) => (
                                      <span className="tabular-nums">
                                        {money(r.raw, targetList?.currency)}
                                      </span>
                                    ),
                                  },
                                ]
                              : []),
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
                              header: "Guardrail",
                              cell: (r) =>
                                r.flag ? (
                                  <Flag tone={r.flag.startsWith("failed") ? "danger" : "warning"}>
                                    {r.flag}
                                  </Flag>
                                ) : (
                                  <span className="text-muted-foreground text-xs">
                                    Within limits
                                  </span>
                                ),
                            },
                          ]}
                          rows={preview}
                          rowKey={(r) => r.sku}
                          numbered={false}
                          dense
                        />
                        {guardedSamples && (
                          <p className="text-xs text-muted-foreground">
                            Guardrails: {guardedSamples}. Breaches are handled by “
                            {HANDLING_LABEL[handling] ?? humanize(handling)}”.
                          </p>
                        )}
                      </div>
                    )}

                    {step === 3 && (
                      <div className="space-y-4">
                        <DetailGrid
                          columns={2}
                          items={[
                            {
                              label: "Creates",
                              value: targetList ? (
                                <span>
                                  Draft v{targetList.version + 1} of{" "}
                                  <RecordLink
                                    to="/pricing/price-lists/$id"
                                    params={{ id: targetList.id }}
                                  >
                                    {targetList.name}
                                  </RecordLink>
                                </span>
                              ) : (
                                target
                              ),
                            },
                            {
                              label: "Estimated duration",
                              value:
                                count >= 100_000
                                  ? "≈ 45 min (SLA: 100,000 SKUs within 1 hour)"
                                  : "< 5 min",
                            },
                            {
                              label: "Guardrail breaches (est.)",
                              value: breachEstimate
                                ? `${breachEstimate.toLocaleString("en-GB")} · ${HANDLING_LABEL[handling] ?? humanize(handling)}`
                                : "None expected",
                            },
                            { label: "Publishing", value: "Only after the list is approved" },
                          ]}
                        />
                        <InfoBanner tone="info">
                          Job status: Queued → Running → Succeeded, Partial success or
                          Failed. Every failed record is listed. Rollback restores prior prices
                          until the draft is published.
                        </InfoBanner>
                      </div>
                    )}
                  </Card>

                  <div className="flex flex-wrap items-center gap-3 mt-6">
                    <Btn variant="subtle" onClick={cancel}>
                      Cancel
                    </Btn>
                    <div className="flex-1" />
                    <MissingHint id={stepHintId} missing={stepMissing} className="mr-0" />
                    {step > 0 && (
                      <Btn variant="subtle" icon={ArrowLeft} onClick={() => setStep((s) => s - 1)}>
                        Back
                      </Btn>
                    )}
                    {step < 3 ? (
                      <Btn
                        type="submit"
                        disabled={stepMissing.length > 0}
                        aria-describedby={stepMissing.length ? stepHintId : undefined}
                      >
                        {step === 1 ? "Preview" : step === 2 ? "Review" : "Next"}
                        <ArrowRight className="size-4" aria-hidden />
                      </Btn>
                    ) : (
                      <Btn type="submit" icon={Play}>
                        Apply update
                      </Btn>
                    )}
                  </div>
                </div>

                <aside className="lg:sticky lg:top-4" aria-label="Bulk update summary">
                  <Card title="Summary">
                    <div className="space-y-6">
                      {summaryGroups.map((g) => (
                        <section key={g.title} aria-labelledby={`bulk-sum-${g.at}`}>
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h3
                              id={`bulk-sum-${g.at}`}
                              className="text-lg lg:text-xl leading-[1.2] font-semibold text-foreground"
                            >
                              {g.title}
                            </h3>
                            {step > g.at && (
                              <Btn
                                variant="ghost"
                                size="sm"
                                onClick={() => setStep(g.at)}
                                aria-label={`Edit ${g.title.toLowerCase()}`}
                              >
                                Edit
                              </Btn>
                            )}
                          </div>
                          <dl className="divide-y divide-border text-sm">
                            {g.rows.map(([label, val]) => (
                              <div
                                key={label}
                                className="flex items-baseline justify-between gap-4 py-2"
                              >
                                <dt className="text-muted-foreground shrink-0">{label}</dt>
                                <dd className="font-medium text-right min-w-0 break-words">
                                  {val}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        </section>
                      ))}
                    </div>
                  </Card>
                </aside>
              </div>
            </form>
          </>
        )}

        {tab === "jobs" && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
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
              <span className="sr-only" role="status">
                {shownJobs.length} {shownJobs.length === 1 ? "job" : "jobs"}
              </span>
            </div>
            <DataTable
              caption="Bulk update jobs"
              columns={jobCols}
              rows={shownJobs}
              rowKey={(j) => j.id}
              onRowClick={setOpenJob}
              selectedKey={openJob?.id ?? null}
              pageSize={10}
              empty={
                jobStatus.length ? (
                  <EmptyState
                    title="No jobs match this status"
                    action={
                      <Btn variant="subtle" onClick={() => setJobStatus([])}>
                        Clear filters
                      </Btn>
                    }
                  />
                ) : (
                  <EmptyState
                    title="No bulk jobs yet"
                    action={
                      <Btn variant="subtle" onClick={() => setTab("new")}>
                        Start a bulk update
                      </Btn>
                    }
                  >
                    Jobs appear here once you apply a bulk update.
                  </EmptyState>
                )
              }
            />
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={`Update ${count.toLocaleString("en-GB")} prices by ${adjustmentLabel}?`}
        description={`${humanize(method)} ${adjustmentLabel} will be applied to ${count.toLocaleString("en-GB")} SKUs in a new draft version of ${targetList?.name ?? target}. About ${breachEstimate.toLocaleString("en-GB")} guardrail breaches will be handled by "${humanize(handling)}". Nothing is published until the list is approved.`}
        confirmLabel={`Update ${count.toLocaleString("en-GB")} prices`}
        loading={starting}
        onConfirm={confirm}
        onCancel={() => setConfirmOpen(false)}
      />

      <ConfirmDialog
        open={discardOpen}
        tone="danger"
        title="Start this bulk update over?"
        description="You'll go back to step 1. No prices have changed."
        confirmLabel="Start over"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setDiscardOpen(false);
          resetFlow();
        }}
        onCancel={() => setDiscardOpen(false)}
      />

      <ConfirmDialog
        open={blocker.status === "blocked"}
        tone="danger"
        title="Leave this bulk update?"
        description="Your selection and adjustment haven't been applied. If you leave now, the setup is lost. No prices have changed."
        confirmLabel="Discard and leave"
        cancelLabel="Keep editing"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
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

/** Searchable checklist for Product list mode. Blocked products stay visible with the reason they can't be picked. */
function ProductPicker({
  picked,
  onChange,
}: {
  picked: string[];
  onChange: (skus: string[]) => void;
}) {
  const [q, setQ] = useState("");
  const ql = q.trim().toLowerCase();
  const shown = PRODUCTS.filter(
    (p) => !ql || p.name.toLowerCase().includes(ql) || p.sku.toLowerCase().includes(ql),
  );
  const shownPickable = shown.filter((p) => p.lifecycleStatus !== "BLOCKED").map((p) => p.sku);
  const allShown = shownPickable.length > 0 && shownPickable.every((s) => picked.includes(s));
  const toggle = (sku: string) =>
    onChange(picked.includes(sku) ? picked.filter((s) => s !== sku) : [...picked, sku]);
  const toggleAll = () =>
    onChange(
      allShown
        ? picked.filter((s) => !shownPickable.includes(s))
        : [...picked, ...shownPickable.filter((s) => !picked.includes(s))],
    );
  return (
    <fieldset>
      <legend className="text-sm font-medium text-foreground mb-2">
        Products
        <span className="text-destructive ml-0.5" aria-hidden>
          *
        </span>
      </legend>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mb-3">
        <SearchInput
          value={q}
          onChange={setQ}
          placeholder="Search products"
          label="Search products by name or SKU"
          className="basis-full sm:basis-auto sm:flex-1"
        />
        <span className="flex items-center gap-2 ml-auto">
          <span
            className="text-sm text-muted-foreground tabular-nums whitespace-nowrap"
            role="status"
          >
            {picked.length} of {PICKABLE.length} selected
          </span>
          {picked.length > 0 && (
            <Btn variant="ghost" size="sm" onClick={() => onChange([])}>
              Clear
            </Btn>
          )}
        </span>
      </div>
      <div className="rounded-lg border border-border overflow-hidden">
        {/* Header stays outside the scroll area, so the scrollbar starts below it. */}
        {shownPickable.length > 0 && (
          <label className="flex items-center gap-3 px-4 min-h-10 bg-muted border-b border-border text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              className="size-4 accent-[var(--brand)]"
              checked={allShown}
              onChange={toggleAll}
            />
            {ql
              ? `Select all ${shownPickable.length} matching`
              : `Select all ${shownPickable.length}`}
          </label>
        )}
        {/* One-line rows, capped at about five so the step stays short; the cut-off row shows it scrolls. */}
        <div className="divide-y divide-border max-h-52 overflow-y-auto">
          {shown.map((p) => {
            const blocked = p.lifecycleStatus === "BLOCKED";
            const on = picked.includes(p.sku);
            return (
              <label
                key={p.sku}
                className={`flex items-center gap-3 px-4 py-2 min-h-10 text-sm ${
                  blocked
                    ? "cursor-not-allowed"
                    : on
                      ? "bg-brand-soft cursor-pointer"
                      : "cursor-pointer hover:bg-muted/40"
                }`}
              >
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-[var(--brand)]"
                  disabled={blocked}
                  checked={on}
                  onChange={() => toggle(p.sku)}
                />
                <span className="min-w-0 flex-1 flex flex-wrap items-baseline gap-x-2">
                  <span className={`font-medium ${blocked ? "text-muted-foreground" : ""}`}>
                    {p.name}
                  </span>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">{p.sku}</span>
                </span>
                {/* Only exceptions get a label; "Active" on every row would be noise. */}
                {blocked ? (
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    Blocked in ERP
                  </span>
                ) : (
                  p.lifecycleStatus !== "ACTIVE" && <StatusPill status={p.lifecycleStatus} />
                )}
              </label>
            );
          })}
          {shown.length === 0 && (
            <p className="px-4 py-6 text-base text-muted-foreground text-center">
              No products match “{q}”.
            </p>
          )}
        </div>
      </div>
    </fieldset>
  );
}

const FAIL_REASONS = [
  ["VALIDATION_REQUIRED", "Unit of Measure missing on target line"],
  ["PRODUCT_BLOCKED", "Product A-200 is blocked (lifecycle status)"],
  ["GUARDRAIL_BREACH", "New price below Distributor floor"],
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
                  downloadCsv(`${job.id}-results.csv`, [
                    {
                      job: job.id,
                      targetList: job.targetList,
                      method: `${job.method} ${job.value}`,
                      status: job.status,
                      total: job.total,
                      succeeded: job.succeeded,
                      failed: job.failed,
                      clamped: job.clamped,
                      sku: "",
                      errorCode: "",
                      message: "",
                    },
                    ...failures.map((f) => ({
                      job: job.id,
                      targetList: job.targetList,
                      method: "",
                      status: "FAILED",
                      total: "",
                      succeeded: "",
                      failed: "",
                      clamped: "",
                      sku: f.sku,
                      errorCode: f.code,
                      message: f.message,
                    })),
                  ]);
                  toast.success(`${job.id} results exported`, {
                    description: "Job summary plus one row per failed record.",
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
            Failed records are listed below; successful updates are kept.
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
              { label: "Selection", value: job.selection },
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
              label={`${job.id} progress`}
              value={((job.succeeded + job.failed) / job.total) * 100}
              tone={job.failed ? "warning" : "success"}
            />
          </div>
        </Card>
        {job.failed > 0 && (
          <section aria-labelledby="failed-records-heading">
            <h3 id="failed-records-heading" className="text-lg lg:text-xl leading-[1.2] font-semibold mb-3">
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
                    <span className="font-mono text-sm">{f.sku}</span>
                  ),
                },
                { key: "m", header: "Reason", cell: (f) => f.message },
              ]}
              rows={failures}
              rowKey={(f) => f.sku}
            />
            {job.failed > failures.length && (
              <p className="mt-2 text-base text-muted-foreground">
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
