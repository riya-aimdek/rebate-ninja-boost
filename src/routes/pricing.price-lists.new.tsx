import { createFileRoute, useBlocker, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  ConfirmDialog,
  DetailGrid,
  DetailTitle,
  ErrorBanner,
  Field,
  Flag,
  InfoBanner,
  PricingLayout,
  Stepper,
  Tag,
  Toggle,
  humanize,
  inputCls,
  notifyUndo,
  type ApiError,
} from "@/components/pricing/kit";
import {
  ADJUSTMENT_TYPES,
  CHANNELS,
  CURRENCIES,
  CUSTOMER_SEGMENTS,
  INHERITANCE_MODES,
  LIST_TYPES,
  PRICE_LISTS,
  PRODUCTS,
  REASON_CODES,
  REGIONS,
  UOMS,
  productBySku,
  type PriceList,
} from "@/lib/pricing/data";
import { TODAY } from "@/lib/pricing/csv";

export const Route = createFileRoute("/pricing/price-lists/new")({
  head: () => ({ meta: [{ title: "Create price list · Rebate Ninja" }] }),
  component: Page,
});

type Line = {
  key: number;
  sku: string;
  price: string;
  uom: string;
  minQty: string;
  maxQty: string;
  effectiveFrom: string;
  effectiveTo: string;
  allowZeroPrice: boolean;
};

type Header = {
  name: string;
  type: string;
  currency: string;
  effectiveFrom: string;
  effectiveTo: string;
  openEnded: boolean;
  region: string;
  channel: string;
  segment: string;
  uom: string;
  timeZone: string;
  rounding: string;
  parentId: string;
  adjustmentType: string;
  adjustmentValue: string;
  inheritanceMode: string;
  reasonCode: string;
  reasonText: string;
};

const TIME_ZONES = [
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "Asia/Kolkata",
];
const ROUNDINGS = [
  "2 decimals · NEAREST",
  "2 decimals · UP",
  "2 decimals · DOWN",
  "0 decimals · NEAREST",
];

let seq = 3;
const blankLine = (): Line => ({
  key: seq++,
  sku: "",
  price: "",
  uom: "EA",
  minQty: "1",
  maxQty: "",
  effectiveFrom: "",
  effectiveTo: "",
  allowZeroPrice: false,
});

const MANDATORY: Array<[keyof Header, string]> = [
  ["name", "Enter a name, e.g. UK Base 2027."],
  ["type", "Choose a list type."],
  ["currency", "Choose a currency."],
  ["effectiveFrom", "Choose the date the list starts."],
  ["region", "Choose a region."],
  ["channel", "Choose a channel, or All."],
  ["segment", "Choose a customer segment, or All."],
  ["uom", "Choose a unit of measure."],
];

/** Wizard steps; each step validates only its own fields before Next. */
const STEPS = ["List details", "Derivation", "Product lines", "Reason & review"];
/** Form order of header fields, used to focus the first invalid one. */
const FIELD_ORDER: Array<keyof Header> = [
  "name",
  "type",
  "currency",
  "effectiveFrom",
  "effectiveTo",
  "region",
  "channel",
  "segment",
  "uom",
  "adjustmentValue",
  "reasonCode",
  "reasonText",
];
const STEP_OF: Partial<Record<keyof Header, number>> = {
  adjustmentValue: 1,
  reasonCode: 3,
  reasonText: 3,
};
const fid = (k: keyof Header) => `pl-${k}`;

function Page() {
  const navigate = useNavigate();
  const [h, setH] = useState<Header>({
    name: "",
    type: "BASE",
    currency: "GBP",
    effectiveFrom: "",
    effectiveTo: "",
    openEnded: false,
    region: "UK",
    channel: "",
    segment: "",
    uom: "EA",
    timeZone: "Europe/London",
    rounding: ROUNDINGS[0],
    parentId: "",
    adjustmentType: "PERCENT",
    adjustmentValue: "",
    inheritanceMode: "LIVE_LINK",
    reasonCode: "",
    reasonText: "",
  });
  const [lines, setLines] = useState<Line[]>([
    {
      key: 1,
      sku: "A-100",
      price: "110.00",
      uom: "EA",
      minQty: "1",
      maxQty: "",
      effectiveFrom: "",
      effectiveTo: "",
      allowZeroPrice: false,
    },
    {
      key: 2,
      sku: "EW-3100",
      price: "",
      uom: "EA",
      minQty: "1",
      maxQty: "",
      effectiveFrom: "",
      effectiveTo: "",
      allowZeroPrice: false,
    },
  ]);
  const [step, setStep] = useState(0);
  const [error, setError] = useState<ApiError | null>(null);
  const [fieldErr, setFieldErr] = useState<Partial<Record<keyof Header, string>>>({});
  const [lineErr, setLineErr] = useState<Record<number, string>>({});
  const [validated, setValidated] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // Warn before leaving (route change or tab close) with unsaved entries.
  const skipBlock = useRef(false);
  const blocker = useBlocker({
    shouldBlockFn: () => dirty && !skipBlock.current,
    enableBeforeUnload: () => dirty && !skipBlock.current,
    withResolver: true,
  });

  const derived = h.type !== "BASE" && !!h.parentId;
  const set = <K extends keyof Header>(k: K, v: Header[K]) => {
    setH((p) => ({ ...p, [k]: v }));
    setFieldErr((fe) => {
      if (!fe[k]) return fe;
      const next = { ...fe };
      delete next[k];
      return next;
    });
    setValidated(false);
    setDirty(true);
  };

  const setLine = (key: number, patch: Partial<Line>) => {
    setValidated(false);
    setDirty(true);
    if (patch.sku) {
      const p = productBySku(patch.sku);
      if (p?.lifecycleStatus === "BLOCKED") {
        setError({
          errorClass: "BUSINESS_RULE",
          code: "PRODUCT_BLOCKED",
          message: `Product ${p.sku} (${p.name}) has lifecycle status Blocked, so the line was rejected. Choose a different product.`,
          field: "lines.productReference",
        });
        return;
      }
    }
    setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: number) => {
    const idx = lines.findIndex((x) => x.key === key);
    const removed = lines[idx];
    setLines((ls) => ls.filter((x) => x.key !== key));
    setDirty(true);
    setValidated(false);
    notifyUndo(`Line ${idx + 1} removed`, () =>
      setLines((ls) => {
        const next = [...ls];
        next.splice(Math.min(idx, next.length), 0, removed);
        return next;
      }),
    );
  };

  /** Line-level checks (US-PL-01 AC#2, AC#5). */
  const checkLines = () => {
    const errs: Record<number, string> = {};
    const seen = new Map<string, number>();
    for (const l of lines) {
      if (!l.sku) errs[l.key] = "Choose a product for this line";
      else if (l.price === "" && !l.allowZeroPrice) errs[l.key] = "Enter a price for this line";
      else if (l.price !== "" && Number(l.price) < 0)
        errs[l.key] = "Price can't be negative — enter 0 or more";
      else if (l.price !== "" && Number(l.price) === 0 && !l.allowZeroPrice)
        errs[l.key] = "Zero price not allowed — enter a price or tick Allow zero";
      else if (l.maxQty && Number(l.maxQty) < Number(l.minQty))
        errs[l.key] = "Max qty must be at least the min qty";
      else if (l.effectiveFrom && l.effectiveTo && l.effectiveTo <= l.effectiveFrom)
        errs[l.key] = "Line end date must be after its start date";
      const k = `${l.sku}|${l.uom}|${l.minQty}`;
      if (l.sku && seen.has(k))
        errs[l.key] =
          "DUPLICATE_LINE — same product, UoM and min qty already on this list. Change the min qty or remove the line.";
      seen.set(k, l.key);
    }
    return errs;
  };

  const validateLines = () => {
    const errs = checkLines();
    setLineErr(errs);
    const dup = Object.values(errs).find((e) => e.startsWith("DUPLICATE_LINE"));
    if (dup) {
      setError({
        errorClass: "VALIDATION",
        code: "DUPLICATE_LINE",
        message:
          "Two lines share the same product, UoM and min qty. Change the min qty or remove one line.",
      });
    } else setError(null);
    const ok = Object.keys(errs).length === 0;
    setValidated(ok);
    if (ok)
      toast.success("All lines valid", {
        description: "The list can be submitted for approval after saving.",
      });
    else
      toast.error(`${Object.keys(errs).length} invalid line(s) highlighted`, {
        description: "The list can't be submitted until they are corrected.",
      });
    return errs;
  };

  /** Header-field errors for one step. */
  const headerErrors = (s: number) => {
    const fe: Partial<Record<keyof Header, string>> = {};
    if (s === 0) {
      for (const [k, msg] of MANDATORY) if (!String(h[k]).trim()) fe[k] = msg;
      if (!h.openEnded && !h.effectiveTo)
        fe.effectiveTo = "Choose an end date, or turn on Open-ended.";
      else if (!h.openEnded && h.effectiveFrom && h.effectiveTo <= h.effectiveFrom)
        fe.effectiveTo = "End date must be after the start date. Choose a later date.";
    }
    if (s === 1 && derived && h.adjustmentType !== "NONE") {
      const v = h.adjustmentValue.trim();
      if (!v)
        fe.adjustmentValue =
          h.adjustmentType === "FORMULA"
            ? "Enter a formula ID, e.g. F-01."
            : "Enter an adjustment value.";
      else if (
        h.adjustmentType === "PERCENT" &&
        (!Number.isFinite(Number(v)) || Number(v) < -100 || Number(v) > 100)
      )
        fe.adjustmentValue = "Enter a percentage between −100 and 100, e.g. -5.";
      else if (h.adjustmentType === "ABSOLUTE" && !Number.isFinite(Number(v)))
        fe.adjustmentValue = "Enter an amount, e.g. -2.00.";
    }
    if (s === 3) {
      if (!h.reasonCode) fe.reasonCode = "Choose a reason code.";
      if (h.reasonCode === "OTHER" && !h.reasonText.trim())
        fe.reasonText = "Describe the reason — required when the code is Other.";
    }
    return fe;
  };

  const focusLater = (id: string) => setTimeout(() => document.getElementById(id)?.focus(), 0);

  /** Validate one step; shows inline errors and focuses the first invalid field. */
  const checkStep = (s: number) => {
    if (s === 2) {
      const errs = validateLines();
      // Only duplicates block progress; other invalid lines can be saved as a draft (fix before submitting).
      if (Object.values(errs).some((e) => e.startsWith("DUPLICATE_LINE"))) {
        const first = lines.find((l) => errs[l.key]?.startsWith("DUPLICATE_LINE"));
        if (first) focusLater(`pl-line-${first.key}-sku`);
        return false;
      }
      return true;
    }
    const fe = headerErrors(s);
    setFieldErr((cur) => {
      const next = { ...cur };
      for (const k of Object.keys(next) as Array<keyof Header>)
        if ((STEP_OF[k] ?? 0) === s) delete next[k];
      return { ...next, ...fe };
    });
    const first = FIELD_ORDER.find((k) => fe[k]);
    const n = Object.keys(fe).length;
    if (n > 2)
      setError({
        errorClass: "VALIDATION",
        code: "VALIDATION_REQUIRED",
        message: `${n} fields need attention. Fix the highlighted fields to continue.`,
      });
    else if (error?.code === "VALIDATION_REQUIRED") setError(null);
    if (first) {
      focusLater(fid(first));
      return false;
    }
    return true;
  };

  const next = (e?: FormEvent) => {
    e?.preventDefault();
    if (!checkStep(step)) return;
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
    window.scrollTo({ top: 0 });
  };

  const back = () => {
    // Going back never loses entered data — all steps share one state.
    setStep((s) => Math.max(0, s - 1));
    window.scrollTo({ top: 0 });
  };

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    // Re-check every step (silently for lines) and jump to the first one that needs a fix.
    const errs = checkLines();
    setLineErr(errs);
    for (const s of [0, 1, 2, 3]) {
      const ok =
        s === 2 ? !Object.values(errs).some((x) => x.startsWith("DUPLICATE_LINE")) : checkStep(s);
      if (!ok) {
        setStep(s);
        if (s === 2)
          setError({
            errorClass: "VALIDATION",
            code: "DUPLICATE_LINE",
            message:
              "Two lines share the same product, UoM and min qty. Change the min qty or remove one line.",
          });
        return;
      }
    }
    setError(null);
    setSaving(true);
    setTimeout(() => {
      let n = PRICE_LISTS.length + 1;
      while (PRICE_LISTS.some((l) => l.id === `DR-${String(n).padStart(3, "0")}`)) n++;
      const id = `DR-${String(n).padStart(3, "0")}`;
      const isNumericAdj =
        derived &&
        (h.adjustmentType === "PERCENT" || h.adjustmentType === "ABSOLUTE") &&
        h.adjustmentValue !== "";
      const rec: PriceList = {
        id,
        name: h.name.trim(),
        type: h.type as PriceList["type"],
        status: "DRAFT",
        version: 1,
        currency: h.currency,
        region: h.region,
        channel: h.channel,
        segment: h.segment,
        uom: h.uom,
        effectiveFrom: h.effectiveFrom,
        effectiveTo: h.openEnded ? undefined : h.effectiveTo,
        openEnded: h.openEnded,
        timeZone: h.timeZone,
        owner: "Riya Shah",
        lastUpdated: `${TODAY} ${new Date().toTimeString().slice(0, 5)}`,
        parentId: derived ? h.parentId : undefined,
        adjustmentType: derived ? (h.adjustmentType as PriceList["adjustmentType"]) : undefined,
        adjustmentValue: isNumericAdj ? Number(h.adjustmentValue) : undefined,
        inheritanceMode: derived ? (h.inheritanceMode as PriceList["inheritanceMode"]) : undefined,
        rounding: h.rounding,
        lines: lines
          .filter((l) => l.sku)
          .map((l, i) => ({
            id: `${id}-L${i + 1}`,
            sku: l.sku,
            price: l.price === "" ? null : Number(l.price),
            uom: l.uom,
            minQty: Number(l.minQty) || 1,
            maxQty: l.maxQty ? Number(l.maxQty) : undefined,
            effectiveFrom: l.effectiveFrom || h.effectiveFrom,
            effectiveTo: l.effectiveTo || (h.openEnded ? undefined : h.effectiveTo),
            allowZeroPrice: l.allowZeroPrice,
          })),
      };
      PRICE_LISTS.unshift(rec);
      skipBlock.current = true;
      setSaving(false);
      toast.success(`Price list "${rec.name}" created`, {
        description: Object.keys(errs).length
          ? `Saved as draft v1. ${Object.keys(errs).length} line(s) still invalid — fix before submitting.`
          : "Saved as draft v1. Ready to submit for approval.",
      });
      navigate({ to: "/pricing/price-lists/$id", params: { id } });
    }, 600);
  };

  const parent = PRICE_LISTS.find((l) => l.id === h.parentId);
  const last = step === STEPS.length - 1;
  const adjNumeric = h.adjustmentType === "PERCENT" || h.adjustmentType === "ABSOLUTE";
  const requiredNote = (
    <p className="text-xs text-muted-foreground mb-4">
      <span className="text-destructive" aria-hidden>
        *
      </span>{" "}
      Required
    </p>
  );

  return (
    <PricingLayout
      crumbs={[
        { label: "Pricing", to: "/pricing" },
        { label: "Price lists", to: "/pricing/price-lists" },
        { label: "Create price list" },
      ]}
    >
      <DetailTitle
        title="Create price list"
        subtitle="Draft data never reaches live pricing until the list is approved and active."
        status="DRAFT"
        chips={dirty ? <Tag tone="warning">Unsaved changes</Tag> : undefined}
      />
      <Stepper steps={STEPS} current={step} />
      <ErrorBanner error={error} onClose={() => setError(null)} />

      <form onSubmit={last ? save : next} noValidate className="space-y-6">
        {step === 0 && (
          <Card title="Price list details">
            {requiredNote}
            <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-4">
              <Field label="Name" required error={fieldErr.name} className="md:col-span-2">
                <input
                  id={fid("name")}
                  className={inputCls}
                  value={h.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. UK Base 2027"
                />
              </Field>
              <Field label="List type" required error={fieldErr.type}>
                <select
                  id={fid("type")}
                  className={inputCls}
                  value={h.type}
                  onChange={(e) => set("type", e.target.value)}
                >
                  {LIST_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {humanize(t)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Currency" required error={fieldErr.currency}>
                <select
                  id={fid("currency")}
                  className={inputCls}
                  value={h.currency}
                  onChange={(e) => set("currency", e.target.value)}
                >
                  {CURRENCIES.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Effective from" required error={fieldErr.effectiveFrom}>
                <input
                  id={fid("effectiveFrom")}
                  type="date"
                  className={inputCls}
                  value={h.effectiveFrom}
                  onChange={(e) => set("effectiveFrom", e.target.value)}
                />
              </Field>
              <div className="flex flex-col gap-3">
                <Field
                  label="Effective to"
                  required={!h.openEnded}
                  error={fieldErr.effectiveTo}
                  hint={
                    h.openEnded ? "Open-ended list — no end date" : "Must be after the start date"
                  }
                >
                  <input
                    id={fid("effectiveTo")}
                    type="date"
                    disabled={h.openEnded}
                    min={h.effectiveFrom || undefined}
                    className={inputCls}
                    value={h.effectiveTo}
                    onChange={(e) => set("effectiveTo", e.target.value)}
                  />
                </Field>
                <Toggle
                  checked={h.openEnded}
                  onChange={(v) => set("openEnded", v)}
                  label="Open-ended (no end date)"
                />
              </div>
              <Field label="Region" required error={fieldErr.region}>
                <select
                  id={fid("region")}
                  className={inputCls}
                  value={h.region}
                  onChange={(e) => set("region", e.target.value)}
                >
                  <option value="">Select…</option>
                  {REGIONS.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </Field>
              <Field label="Channel" required error={fieldErr.channel}>
                <select
                  id={fid("channel")}
                  className={inputCls}
                  value={h.channel}
                  onChange={(e) => set("channel", e.target.value)}
                >
                  <option value="">Select…</option>
                  <option>All</option>
                  {CHANNELS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Customer segment" required error={fieldErr.segment}>
                <select
                  id={fid("segment")}
                  className={inputCls}
                  value={h.segment}
                  onChange={(e) => set("segment", e.target.value)}
                >
                  <option value="">Select…</option>
                  <option>All</option>
                  {CUSTOMER_SEGMENTS.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Unit of measure" required error={fieldErr.uom}>
                <select
                  id={fid("uom")}
                  className={inputCls}
                  value={h.uom}
                  onChange={(e) => set("uom", e.target.value)}
                >
                  {UOMS.map((u) => (
                    <option key={u}>{u}</option>
                  ))}
                </select>
              </Field>
            </div>
            <details className="mt-6 rounded-lg border border-border px-4 py-2">
              <summary className="cursor-pointer text-sm font-semibold py-1">
                Advanced: time zone and rounding
              </summary>
              <div className="grid md:grid-cols-2 gap-x-6 gap-y-4 py-4">
                <Field
                  label="Time zone"
                  hint="Activation job runs at the effective datetime in this zone"
                >
                  <select
                    className={inputCls}
                    value={h.timeZone}
                    onChange={(e) => set("timeZone", e.target.value)}
                  >
                    {TIME_ZONES.map((t) => (
                      <option key={t}>{t}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Rounding rule" hint="Applied after derivation adjustment">
                  <select
                    className={inputCls}
                    value={h.rounding}
                    onChange={(e) => set("rounding", e.target.value)}
                  >
                    {ROUNDINGS.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </details>
          </Card>
        )}

        {step === 1 && (
          <Card
            title="Derivation (optional)"
            subtitle="Derive this list from a parent: base → segment → customer. Maximum chain depth 3 (configurable up to 5)."
          >
            <div className="grid md:grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Parent list">
                <select
                  className={inputCls}
                  value={h.parentId}
                  onChange={(e) => set("parentId", e.target.value)}
                  disabled={h.type === "BASE"}
                >
                  <option value="">None — independent list</option>
                  {PRICE_LISTS.filter((l) => l.status === "ACTIVE").map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.id} · {l.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Adjustment type">
                <select
                  className={inputCls}
                  disabled={!derived}
                  value={h.adjustmentType}
                  onChange={(e) => set("adjustmentType", e.target.value)}
                >
                  {ADJUSTMENT_TYPES.map((a) => (
                    <option key={a} value={a}>
                      {humanize(a)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={
                  h.adjustmentType === "PERCENT"
                    ? "Adjustment value (%)"
                    : h.adjustmentType === "ABSOLUTE"
                      ? `Adjustment value (${h.currency})`
                      : "Adjustment value"
                }
                required={derived && h.adjustmentType !== "NONE"}
                error={fieldErr.adjustmentValue}
                hint={
                  h.adjustmentType === "PERCENT"
                    ? "Between −100 and 100"
                    : h.adjustmentType === "FORMULA"
                      ? "Formula ID"
                      : undefined
                }
              >
                <input
                  id={fid("adjustmentValue")}
                  className={inputCls}
                  type={adjNumeric ? "number" : "text"}
                  inputMode={adjNumeric ? "decimal" : undefined}
                  min={h.adjustmentType === "PERCENT" ? -100 : undefined}
                  max={h.adjustmentType === "PERCENT" ? 100 : undefined}
                  step={adjNumeric ? (h.adjustmentType === "PERCENT" ? 0.1 : 0.01) : undefined}
                  disabled={!derived || h.adjustmentType === "NONE"}
                  value={h.adjustmentValue}
                  onChange={(e) => set("adjustmentValue", e.target.value)}
                  placeholder={
                    h.adjustmentType === "PERCENT"
                      ? "e.g. -5"
                      : h.adjustmentType === "FORMULA"
                        ? "e.g. F-01"
                        : "e.g. -2.00"
                  }
                />
              </Field>
              <Field
                label="Inheritance mode"
                hint={
                  h.inheritanceMode === "LIVE_LINK"
                    ? "Recalculates when the parent list changes"
                    : "Copied once, then independent of the parent"
                }
              >
                <select
                  className={inputCls}
                  disabled={!derived}
                  value={h.inheritanceMode}
                  onChange={(e) => set("inheritanceMode", e.target.value)}
                >
                  {INHERITANCE_MODES.map((m) => (
                    <option key={m} value={m}>
                      {humanize(m)}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            {h.type === "BASE" && (
              <p className="text-sm text-muted-foreground mt-4">
                Base lists are not derived. Go back and choose another list type to set a parent, or
                select Next to continue.
              </p>
            )}
            {h.type !== "BASE" && !h.parentId && (
              <p className="text-sm text-muted-foreground mt-4">
                Choose a parent list to enable the adjustment fields, or select Next to create an
                independent list.
              </p>
            )}
            {derived && parent && (
              <div className="mt-4">
                <InfoBanner title="Derived lines">
                  Lines will be calculated from {parent.name} ({parent.lines.length} lines) using{" "}
                  {humanize(h.adjustmentType)} {h.adjustmentValue || "…"}. Each line keeps
                  calculated, override and final price; overrides require a reason code.
                </InfoBanner>
              </div>
            )}
          </Card>
        )}

        {step === 2 && (
          <Card
            title="Product lines"
            subtitle={`${lines.length} ${lines.length === 1 ? "line" : "lines"} · prices in ${h.currency}`}
            actions={
              <>
                {validated && (
                  <span
                    className="inline-flex items-center gap-1 text-sm text-success font-semibold"
                    role="status"
                  >
                    <CheckCircle2 className="size-4" aria-hidden /> Validated
                  </span>
                )}
                <Btn variant="outline" icon={ShieldCheck} onClick={validateLines}>
                  Validate lines
                </Btn>
                <Btn
                  variant="outline"
                  icon={Plus}
                  onClick={() => {
                    const nl = blankLine();
                    setLines((ls) => [...ls, nl]);
                    setDirty(true);
                    focusLater(`pl-line-${nl.key}-sku`);
                  }}
                >
                  Add line
                </Btn>
              </>
            }
            padded={false}
          >
            <div
              className="relative overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label="Product lines"
            >
              <table className="w-full text-sm">
                <caption className="sr-only">Product lines for this price list</caption>
                <thead>
                  <tr className="bg-navy text-navy-foreground text-left">
                    <th scope="col" className="px-3 py-3 w-10">
                      <span aria-hidden>#</span>
                      <span className="sr-only">Line number</span>
                    </th>
                    <th scope="col" className="px-3 py-3 min-w-[220px] whitespace-nowrap">
                      Product reference <span aria-hidden>*</span>
                    </th>
                    <th scope="col" className="px-3 py-3 whitespace-nowrap">
                      Price ({h.currency}) <span aria-hidden>*</span>
                    </th>
                    <th scope="col" className="px-3 py-3 whitespace-nowrap">
                      UoM
                    </th>
                    <th scope="col" className="px-3 py-3 whitespace-nowrap">
                      Min qty
                    </th>
                    <th scope="col" className="px-3 py-3 whitespace-nowrap">
                      Max qty
                    </th>
                    <th scope="col" className="px-3 py-3 whitespace-nowrap">
                      Effective from
                    </th>
                    <th scope="col" className="px-3 py-3 whitespace-nowrap">
                      Effective to
                    </th>
                    <th scope="col" className="px-3 py-3 text-center whitespace-nowrap">
                      Allow zero
                    </th>
                    <th scope="col" className="px-3 py-3">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lines.length === 0 && (
                    <tr>
                      <td colSpan={10} className="px-4 py-10 text-center text-muted-foreground">
                        No lines yet. Select Add line to add the first product.
                      </td>
                    </tr>
                  )}
                  {lines.map((l, i) => {
                    const err = lineErr[l.key];
                    const p = productBySku(l.sku);
                    const n = i + 1;
                    const errId = `pl-line-${l.key}-err`;
                    return (
                      <tr key={l.key} className={err ? "bg-danger-soft" : ""}>
                        <td className="px-3 py-2 text-muted-foreground align-top pt-4">{n}</td>
                        <td className="px-3 py-2 align-top">
                          <select
                            id={`pl-line-${l.key}-sku`}
                            className={inputCls}
                            aria-label={`Product, line ${n}`}
                            aria-required
                            aria-invalid={!!err && !l.sku}
                            aria-describedby={err ? errId : undefined}
                            value={l.sku}
                            onChange={(e) => setLine(l.key, { sku: e.target.value })}
                          >
                            <option value="">Select product…</option>
                            {PRODUCTS.map((pr) => (
                              <option key={pr.sku} value={pr.sku}>
                                {pr.sku} · {pr.name}
                                {pr.lifecycleStatus !== "ACTIVE"
                                  ? ` (${humanize(pr.lifecycleStatus)})`
                                  : ""}
                              </option>
                            ))}
                          </select>
                          {p?.lifecycleStatus === "END_OF_LIFE" && (
                            <div className="mt-1">
                              <Flag tone="warning">End-of-life product — line allowed</Flag>
                            </div>
                          )}
                          {err && (
                            <div
                              id={errId}
                              className="mt-1 text-xs text-destructive flex items-center gap-1"
                            >
                              <AlertTriangle className="size-3.5 shrink-0" aria-hidden /> {err}
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            inputMode="decimal"
                            className={`${inputCls} w-28 text-right tabular-nums`}
                            aria-label={`Price in ${h.currency}, line ${n}`}
                            aria-invalid={!!err && (l.price === "" || Number(l.price) <= 0)}
                            aria-describedby={err ? errId : undefined}
                            value={l.price}
                            onChange={(e) => setLine(l.key, { price: e.target.value })}
                            placeholder="0.00"
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <select
                            className={`${inputCls} w-24`}
                            aria-label={`Unit of measure, line ${n}`}
                            value={l.uom}
                            onChange={(e) => setLine(l.key, { uom: e.target.value })}
                          >
                            {UOMS.map((u) => (
                              <option key={u}>{u}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            inputMode="numeric"
                            className={`${inputCls} w-20`}
                            aria-label={`Min qty, line ${n}`}
                            value={l.minQty}
                            onChange={(e) => setLine(l.key, { minQty: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            type="number"
                            min={Number(l.minQty) || 1}
                            step={1}
                            inputMode="numeric"
                            className={`${inputCls} w-20`}
                            aria-label={`Max qty, line ${n} (optional)`}
                            value={l.maxQty}
                            onChange={(e) => setLine(l.key, { maxQty: e.target.value })}
                            placeholder="—"
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            type="date"
                            className={`${inputCls} w-36`}
                            aria-label={`Effective from, line ${n}`}
                            min={h.effectiveFrom || undefined}
                            max={(!h.openEnded && h.effectiveTo) || undefined}
                            value={l.effectiveFrom}
                            onChange={(e) => setLine(l.key, { effectiveFrom: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2 align-top">
                          <input
                            type="date"
                            className={`${inputCls} w-36`}
                            aria-label={`Effective to, line ${n}`}
                            min={l.effectiveFrom || h.effectiveFrom || undefined}
                            max={(!h.openEnded && h.effectiveTo) || undefined}
                            value={l.effectiveTo}
                            onChange={(e) => setLine(l.key, { effectiveTo: e.target.value })}
                          />
                        </td>
                        <td className="px-3 py-2 align-top text-center pt-4">
                          <input
                            type="checkbox"
                            className="size-4 accent-[var(--brand)]"
                            checked={l.allowZeroPrice}
                            onChange={(e) => setLine(l.key, { allowZeroPrice: e.target.checked })}
                            aria-label={`Allow zero price, line ${n}`}
                          />
                        </td>
                        <td className="px-3 py-2 align-top pt-2">
                          <button
                            type="button"
                            className="size-10 grid place-items-center rounded-md hover:bg-muted text-muted-foreground"
                            aria-label={`Remove line ${n}${p ? ` (${p.name})` : ""}`}
                            onClick={() => removeLine(l.key)}
                          >
                            <Trash2 className="size-4" aria-hidden />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-6 py-3 text-xs text-muted-foreground border-t border-border">
              Line dates default to the list dates when blank. Try: duplicate A-100 / EA / min qty 1
              → DUPLICATE_LINE · select A-200 → PRODUCT_BLOCKED.
            </div>
          </Card>
        )}

        {step === 3 && (
          <>
            <Card
              title="Reason for change"
              subtitle="Every price change is audited with user, timestamp, before/after value and reason code."
            >
              {requiredNote}
              <div className="grid md:grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Reason code" required error={fieldErr.reasonCode}>
                  <select
                    id={fid("reasonCode")}
                    className={inputCls}
                    value={h.reasonCode}
                    onChange={(e) => set("reasonCode", e.target.value)}
                  >
                    <option value="">Select reason…</option>
                    {REASON_CODES.map((r) => (
                      <option key={r} value={r}>
                        {humanize(r)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Reason text"
                  required={h.reasonCode === "OTHER"}
                  error={fieldErr.reasonText}
                  hint={h.reasonCode === "OTHER" ? "Required when the code is Other" : "Optional"}
                >
                  <input
                    id={fid("reasonText")}
                    className={inputCls}
                    value={h.reasonText}
                    onChange={(e) => set("reasonText", e.target.value)}
                  />
                </Field>
              </div>
            </Card>
            <Card
              title="Review"
              subtitle="Check the summary, then save. The list is created as a draft and can be edited before submitting for approval."
              actions={
                <Btn variant="ghost" size="sm" onClick={() => setStep(0)}>
                  Edit details
                </Btn>
              }
            >
              <DetailGrid
                items={[
                  { label: "Name", value: h.name || "—" },
                  { label: "List type", value: humanize(h.type) },
                  { label: "Currency", value: h.currency },
                  {
                    label: "Effective",
                    value: `${h.effectiveFrom || "—"} → ${h.openEnded ? "open-ended" : h.effectiveTo || "—"}`,
                  },
                  {
                    label: "Scope",
                    value: `${h.region || "—"} · ${h.channel || "—"} · ${h.segment || "—"}`,
                  },
                  {
                    label: "Parent list",
                    value:
                      derived && parent
                        ? `${parent.name} (${humanize(h.adjustmentType)} ${h.adjustmentValue})`
                        : "None (independent)",
                  },
                  {
                    label: "Product lines",
                    value: (
                      <span className="inline-flex flex-wrap items-center gap-2">
                        {lines.length}
                        {Object.keys(lineErr).length > 0 && (
                          <Flag tone="warning">
                            {Object.keys(lineErr).length} invalid — fix before submitting
                          </Flag>
                        )}
                      </span>
                    ),
                  },
                  { label: "Time zone · rounding", value: `${h.timeZone} · ${h.rounding}` },
                ]}
              />
            </Card>
          </>
        )}

        <div className="flex flex-wrap items-center gap-3 pb-6">
          <Btn
            variant="ghost"
            onClick={() => navigate({ to: "/pricing/price-lists" })}
            disabled={saving}
          >
            Cancel
          </Btn>
          <div className="flex-1" />
          {step > 0 && (
            <Btn variant="subtle" icon={ArrowLeft} onClick={back} disabled={saving}>
              Back
            </Btn>
          )}
          {last ? (
            <Btn type="submit" icon={Save} loading={saving}>
              Save as draft
            </Btn>
          ) : (
            <Btn type="submit">
              Next
              <ArrowRight className="size-4" aria-hidden />
            </Btn>
          )}
        </div>
      </form>

      <ConfirmDialog
        open={blocker.status === "blocked"}
        title="Discard this price list?"
        description="You haven't saved this price list. If you leave now, everything you've entered in all steps will be lost."
        confirmLabel="Discard and leave"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      />
    </PricingLayout>
  );
}
