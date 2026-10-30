import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { Pencil, Plus, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  DataTable,
  DetailGrid,
  Drawer,
  EmptyState,
  ErrorBanner,
  Field,
  FilterPills,
  InfoBanner,
  ListHeader,
  Modal,
  PricingLayout,
  RecordLink,
  StatusPill,
  Tag,
  humanize,
  inputCls,
  money,
  type ApiError,
  type Tone,
} from "@/components/pricing/kit";
import { CUSTOMERS, CUSTOMER_SEGMENTS, ENFORCEMENT_MODES, GUARDRAILS, PRODUCTS, REASON_CODES, type Guardrail } from "@/lib/pricing/data";

export const Route = createFileRoute("/pricing/guardrails")({
  head: () => ({ meta: [{ title: "Guardrails · Rebate Ninja" }] }),
  component: Page,
});

type Form = {
  scopeLevel: Guardrail["scopeLevel"];
  scope: string;
  product: string;
  priceFloor: string;
  priceCeiling: string;
  minMarginPct: string;
  maxDiscountPct: string;
  maxDiscountNoApprovalPct: string;
  enforcement: Guardrail["enforcement"];
  currency: string;
  effectiveFrom: string;
  effectiveTo: string;
  reasonCode: string;
  reasonText: string;
};

const toForm = (g?: Guardrail): Form => ({
  scopeLevel: g?.scopeLevel ?? "SEGMENT",
  scope: g?.scope ?? "",
  product: g?.product ?? "",
  priceFloor: g?.priceFloor?.toString() ?? "",
  priceCeiling: g?.priceCeiling?.toString() ?? "",
  minMarginPct: g?.minMarginPct?.toString() ?? "",
  maxDiscountPct: g?.maxDiscountPct?.toString() ?? "",
  maxDiscountNoApprovalPct: g?.maxDiscountNoApprovalPct?.toString() ?? "",
  enforcement: g?.enforcement ?? "REQUIRE_APPROVAL",
  currency: g?.currency ?? "GBP",
  effectiveFrom: "",
  effectiveTo: g?.effectiveTo ?? "",
  reasonCode: "",
  reasonText: "",
});

const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
const SPECIFICITY = { CUSTOMER: 3, SEGMENT: 2, GLOBAL: 1 } as const;
const TODAY = "2026-10-29";
const dayBefore = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

const FIELD_LABEL: Record<string, string> = {
  priceFloor: "Price floor",
  priceCeiling: "Price ceiling",
  minMarginPct: "Min margin",
  maxDiscountPct: "Max discount",
  maxDiscountNoApprovalPct: "Max discount without approval",
  enforcement: "Enforcement",
  effectiveFrom: "Effective from",
};

const ENFORCEMENT_HINT: Record<string, string> = {
  HARD_BLOCK: "Hard block — prices outside the limit can't be submitted",
  REQUIRE_APPROVAL: "Require approval — routes to the approval matrix",
  WARN: "Warn — shows a warning but allows the price",
};

type HistoryRow = Guardrail & { changedFields: string };
type Status = Guardrail["status"];
type Enforcement = Guardrail["enforcement"];
const STATUSES: Status[] = ["ACTIVE", "SCHEDULED", "SUPERSEDED"];
const ENFORCEMENT_TONE: Record<Enforcement, Tone> = { HARD_BLOCK: "danger", REQUIRE_APPROVAL: "info", WARN: "warning" };

/** Field errors keyed by input id, in visual order (first key is focused on save). */
function validateForm(f: Form): Record<string, string> {
  const e: Record<string, string> = {};
  if (f.scopeLevel !== "GLOBAL" && !f.scope) e["gr-scope"] = `Select the ${f.scopeLevel === "CUSTOMER" ? "customer" : "segment"} this guardrail covers.`;
  if (!f.product) e["gr-product"] = "Select a product, or All products.";
  const floor = num(f.priceFloor);
  const ceil = num(f.priceCeiling);
  const margin = num(f.minMarginPct);
  const maxD = num(f.maxDiscountPct);
  const maxNA = num(f.maxDiscountNoApprovalPct);
  if (floor !== undefined && (Number.isNaN(floor) || floor < 0)) e["gr-floor"] = "Enter an amount of 0 or more.";
  if (ceil !== undefined && (Number.isNaN(ceil) || ceil < 0)) e["gr-ceiling"] = "Enter an amount of 0 or more.";
  else if (floor !== undefined && ceil !== undefined && floor > ceil) e["gr-ceiling"] = `The ceiling must be at least the floor (${f.priceFloor}).`;
  if (margin !== undefined && (Number.isNaN(margin) || margin < 0 || margin > 95)) e["gr-margin"] = "Enter a margin between 0 and 95%.";
  if (maxD !== undefined && (Number.isNaN(maxD) || maxD < 0 || maxD > 100)) e["gr-maxdisc"] = "Enter a discount between 0 and 100%.";
  if (maxNA !== undefined && (Number.isNaN(maxNA) || maxNA < 0 || maxNA > 100)) e["gr-maxdisc-na"] = "Enter a discount between 0 and 100%.";
  else if (maxNA !== undefined && maxD !== undefined && maxNA > maxD) e["gr-maxdisc-na"] = `Can't exceed the maximum discount (${f.maxDiscountPct}%).`;
  if ([f.priceFloor, f.priceCeiling, f.minMarginPct, f.maxDiscountPct, f.maxDiscountNoApprovalPct].every((x) => x.trim() === ""))
    e["gr-floor"] = e["gr-floor"] ?? "Set at least one limit — a floor, ceiling, margin or discount.";
  if (!f.effectiveFrom) e["gr-from"] = "Choose the date this guardrail starts.";
  else if (f.effectiveFrom < TODAY) e["gr-from"] = "Choose today or a future date.";
  if (f.effectiveTo && f.effectiveFrom && f.effectiveTo < f.effectiveFrom) e["gr-to"] = "The end date must be on or after the start date.";
  if (!f.reasonCode) e["gr-reason"] = "Select why this guardrail is changing — it is kept in the history.";
  else if (f.reasonCode === "OTHER" && !f.reasonText.trim()) e["gr-reason-text"] = "Describe the reason for this change.";
  return e;
}

function Page() {
  const [rows, setRows] = useState<Guardrail[]>(GUARDRAILS);
  const [history, setHistory] = useState<Record<string, HistoryRow[]>>({});
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Guardrail | null | "new">(null);
  const [form, setForm] = useState<Form>(toForm());
  const [origin, setOrigin] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState<Guardrail | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [enforcements, setEnforcements] = useState<Enforcement[]>([]);
  const [error, setError] = useState<ApiError | null>(null);

  const list = useMemo(
    () =>
      rows
        .filter(
          (g) =>
            (!search || `${g.id} ${g.scope} ${g.product}`.toLowerCase().includes(search.toLowerCase())) &&
            (statuses.length === 0 || statuses.includes(g.status)) &&
            (enforcements.length === 0 || enforcements.includes(g.enforcement)),
        )
        .sort((a, b) => SPECIFICITY[b.scopeLevel] - SPECIFICITY[a.scopeLevel]),
    [rows, search, statuses, enforcements],
  );
  const clearFilters = () => {
    setSearch("");
    setStatuses([]);
    setEnforcements([]);
  };

  const open = (g?: Guardrail) => {
    const f = toForm(g);
    setEditing(g ?? "new");
    setForm(f);
    setOrigin(JSON.stringify(f));
    setSubmitted(false);
    setError(null);
  };

  const errs = validateForm(form);
  // Contradictions (floor > ceiling, approval > max discount, end < start) show as soon as both values exist.
  const LIVE = ["gr-ceiling", "gr-maxdisc-na", "gr-to"];
  const fe = (k: string) => (submitted || (LIVE.includes(k) && errs[k] && !errs[k].startsWith("Enter")) ? errs[k] : undefined);
  const dirty = editing !== null && JSON.stringify(form) !== origin;

  /** Rejection banner carrying the US-ST-05 error code; field errors stay inline. */
  const rejection = (): ApiError | null => {
    const floor = num(form.priceFloor);
    const ceil = num(form.priceCeiling);
    if (floor !== undefined && ceil !== undefined && floor > ceil)
      return { errorClass: "VALIDATION", code: "FLOOR_ABOVE_CEILING", message: `The price floor (${form.priceFloor}) is above the ceiling (${form.priceCeiling}). Lower the floor or raise the ceiling.`, field: "priceCeiling" };
    if ([form.priceFloor, form.priceCeiling, form.minMarginPct, form.maxDiscountPct, form.maxDiscountNoApprovalPct].every((x) => x.trim() === ""))
      return { errorClass: "VALIDATION", code: "GUARDRAIL_NEEDS_LIMIT", message: "Set at least one limit: a floor, ceiling, minimum margin or discount limit.", field: "limits" };
    const missing = [
      form.scopeLevel !== "GLOBAL" && !form.scope && "scope",
      !form.product && "product",
      !form.effectiveFrom && "effectiveFrom",
      !form.reasonCode && "reasonCode",
      form.reasonCode === "OTHER" && !form.reasonText.trim() && "reasonText",
    ].filter(Boolean) as string[];
    if (missing.length) return { errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Fill in the required fields highlighted below.", field: missing.join(", ") };
    return null;
  };

  const save = (ev?: FormEvent) => {
    ev?.preventDefault();
    setSubmitted(true);
    setError(rejection());
    const first = Object.keys(errs)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    setSaving(true);
    window.setTimeout(() => {
      commit();
      setSaving(false);
    }, 400);
  };

  const commit = () => {
    const f = form;
    const prev = editing !== "new" ? editing : null;
    const g: Guardrail = {
      id: prev?.id ?? `G-${100 + rows.length}`,
      scopeLevel: f.scopeLevel,
      scope: f.scopeLevel === "GLOBAL" ? "All customers" : f.scope,
      product: f.product,
      priceFloor: num(f.priceFloor),
      priceCeiling: num(f.priceCeiling),
      minMarginPct: num(f.minMarginPct),
      maxDiscountPct: num(f.maxDiscountPct),
      maxDiscountNoApprovalPct: num(f.maxDiscountNoApprovalPct),
      enforcement: f.enforcement,
      currency: f.currency,
      effectiveFrom: f.effectiveFrom,
      effectiveTo: f.effectiveTo || undefined,
      version: (prev?.version ?? 0) + 1,
      status: f.effectiveFrom > TODAY ? "SCHEDULED" : "ACTIVE",
      reasonCode: f.reasonCode === "OTHER" ? `OTHER: ${f.reasonText}` : f.reasonCode,
      lastChangedBy: "Riya Shah",
      lastChangedAt: "2026-10-29 14:15",
    };
    if (prev) {
      const changed = (["priceFloor", "priceCeiling", "minMarginPct", "maxDiscountPct", "maxDiscountNoApprovalPct", "enforcement", "effectiveFrom"] as const)
        .filter((k) => prev[k] !== g[k])
        .map((k) => `${FIELD_LABEL[k]}: ${prev[k] ?? "—"} → ${g[k] ?? "—"}`)
        .join("; ");
      // A future-dated version is scheduled: the previous version keeps enforcing until the new one starts.
      const scheduled = g.status === "SCHEDULED" && prev.status === "ACTIVE";
      const prevRow: HistoryRow = scheduled
        ? { ...prev, effectiveTo: prev.effectiveTo && prev.effectiveTo < g.effectiveFrom ? prev.effectiveTo : dayBefore(g.effectiveFrom), changedFields: `Stays active until version ${g.version} starts` }
        : { ...prev, status: "SUPERSEDED", changedFields: "Previous version retained" };
      setHistory((h) => ({ ...h, [g.id]: [{ ...g, changedFields: changed || "No limit change" }, prevRow, ...(h[g.id]?.slice(1) ?? [])] }));
      setRows((rs) => rs.map((x) => (x.id === g.id ? g : x)));
      toast.success(`${g.id} version ${g.version} saved`, {
        description: scheduled ? `Version ${prev.version} stays active until ${g.effectiveFrom}.` : `Version ${prev.version} is retained in the history.`,
      });
    } else {
      setRows((rs) => [...rs, g]);
      toast.success(`Guardrail ${g.id} created`, { description: g.status === "SCHEDULED" ? `Becomes active on ${g.effectiveFrom}.` : "Active now." });
    }
    setEditing(null);
  };

  const fmtLimit = (v: number | undefined, kind: "money" | "pct", cur: string) => (v === undefined ? <span className="text-muted-foreground">—</span> : <span className="tabular-nums">{kind === "money" ? money(v, cur) : `${v}%`}</span>);
  const versionsOf = (g: Guardrail): HistoryRow[] => history[g.id] ?? [{ ...g, changedFields: "Initial version" }];
  const reasonLabel = (r: string) => (r.startsWith("OTHER: ") ? `Other: ${r.slice(7)}` : humanize(r));

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Strategy & segmentation" }, { label: "Guardrails" }]}>
      <ListHeader
        title="Guardrails"
        count={list.length}
        noun="guardrail"
        subtitle="Price floors, ceilings, margin and discount limits that every quote and reprice must respect."
        search={search}
        onSearch={setSearch}
        actions={
          <Btn icon={Plus} onClick={() => open()}>
            Create guardrail
          </Btn>
        }
      />
      <InfoBanner title="Resolution by specificity">
        A guardrail can be defined at several scopes (Global → Segment → Customer). The most specific scope wins. Every quote, recommendation and automated reprice must stay inside it.
      </InfoBanner>

      <div className="flex flex-wrap items-center gap-x-6">
        <FilterPills<Status>
          label="Status"
          selected={statuses}
          onChange={setStatuses}
          options={STATUSES.map((s) => ({ key: s, label: humanize(s), count: rows.filter((g) => g.status === s).length }))}
        />
        <FilterPills<Enforcement>
          label="Enforcement"
          selected={enforcements}
          onChange={setEnforcements}
          options={ENFORCEMENT_MODES.map((m) => ({ key: m, label: humanize(m), count: rows.filter((g) => g.enforcement === m).length }))}
        />
      </div>

      <DataTable<Guardrail>
        caption="Guardrails, most specific scope first"
        rows={list}
        rowKey={(g) => g.id}
        selectedKey={preview?.id ?? null}
        onRowClick={setPreview}
        pageSize={25}
        empty={
          search || statuses.length || enforcements.length ? (
            <EmptyState
              icon={ShieldCheck}
              title={search ? `No guardrails match “${search}”` : "No guardrails match these filters"}
              action={
                <Btn variant="subtle" onClick={clearFilters}>
                  Clear filters
                </Btn>
              }
            >
              Try a different search term or remove a filter.
            </EmptyState>
          ) : (
            <EmptyState icon={ShieldCheck} title="No guardrails yet" action={<Btn icon={Plus} onClick={() => open()}>Create guardrail</Btn>}>
              Guardrails stop prices going below a floor, above a ceiling or past a discount limit.
            </EmptyState>
          )
        }
        columns={[
          { key: "id", header: "ID", className: "whitespace-nowrap", cell: (g) => <span className="font-mono text-xs">{g.id}</span> },
          {
            key: "scope",
            header: "Scope",
            className: "min-w-44",
            cell: (g) => {
              const c = g.scopeLevel === "CUSTOMER" ? CUSTOMERS.find((x) => x.name === g.scope) : undefined;
              return (
                <div className="min-w-40">
                  {c ? (
                    <span onClick={(e) => e.stopPropagation()}>
                      <RecordLink to="/pricing/customers/$id" params={{ id: c.id }}>
                        {g.scope}
                      </RecordLink>
                    </span>
                  ) : (
                    <span className="font-medium">{g.scope}</span>
                  )}
                  <div className="mt-1">
                    <Tag tone={g.scopeLevel === "CUSTOMER" ? "brand" : g.scopeLevel === "SEGMENT" ? "info" : "neutral"}>{humanize(g.scopeLevel)}</Tag>
                  </div>
                </div>
              );
            },
          },
          {
            key: "product",
            header: "Product",
            className: "whitespace-nowrap",
            cell: (g) => {
              const p = PRODUCTS.find((x) => x.name === g.product);
              return p ? (
                <span onClick={(e) => e.stopPropagation()}>
                  <RecordLink to="/pricing/products/$id" params={{ id: p.productId }}>
                    {g.product}
                  </RecordLink>
                </span>
              ) : (
                g.product
              );
            },
          },
          { key: "floor", header: "Floor", align: "right", cell: (g) => fmtLimit(g.priceFloor, "money", g.currency) },
          { key: "ceil", header: "Ceiling", align: "right", cell: (g) => fmtLimit(g.priceCeiling, "money", g.currency) },
          { key: "mm", header: "Min margin", align: "right", cell: (g) => fmtLimit(g.minMarginPct, "pct", g.currency) },
          { key: "md", header: "Max discount", align: "right", cell: (g) => fmtLimit(g.maxDiscountPct, "pct", g.currency) },
          { key: "mdna", header: <span className="inline-block whitespace-normal w-32 text-right leading-tight">Max discount without approval</span>, align: "right", cell: (g) => fmtLimit(g.maxDiscountNoApprovalPct, "pct", g.currency) },
          { key: "enf", header: "Enforcement", className: "whitespace-nowrap", cell: (g) => <Tag tone={ENFORCEMENT_TONE[g.enforcement]}>{humanize(g.enforcement)}</Tag> },
          { key: "eff", header: "Effective from", cell: (g) => <span className="tabular-nums whitespace-nowrap">{g.effectiveFrom}</span> },
          { key: "v", header: "Version", align: "right", cell: (g) => <span className="tabular-nums">v{g.version}</span> },
          { key: "st", header: "Status", cell: (g) => <StatusPill status={g.status} /> },
          {
            key: "act",
            header: <span className="sr-only">Actions</span>,
            cell: (g) => (
              <button
                type="button"
                aria-label={`Edit ${g.id}`}
                title="Edit"
                className="size-10 grid place-items-center rounded-lg hover:bg-muted"
                onClick={(e) => {
                  e.stopPropagation();
                  open(g);
                }}
              >
                <Pencil className="size-4" aria-hidden />
              </button>
            ),
          },
        ]}
      />

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        dismissible={!dirty && !saving}
        size="lg"
        title={editing === "new" ? "Create guardrail" : `Edit ${editing?.id} — creates version ${(editing?.version ?? 0) + 1}`}
        subtitle={dirty ? "Unsaved changes · limits are effective-dated and versioned." : "Limits are effective-dated and versioned. History is retained."}
        footer={
          <>
            <Btn variant="subtle" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Btn>
            <Btn type="submit" form="guardrail-form" loading={saving}>
              Save guardrail
            </Btn>
          </>
        }
      >
        <form id="guardrail-form" onSubmit={save} noValidate>
          <ErrorBanner error={error} onClose={() => setError(null)} />
          <p className="text-xs text-muted-foreground mb-4">
            <span className="text-destructive" aria-hidden>*</span> Required
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Scope level" required>
              <select className={inputCls} value={form.scopeLevel} onChange={(e) => setForm({ ...form, scopeLevel: e.target.value as Form["scopeLevel"], scope: "" })}>
                <option value="GLOBAL">Global</option>
                <option value="SEGMENT">Segment</option>
                <option value="CUSTOMER">Customer</option>
              </select>
            </Field>
            <Field label={form.scopeLevel === "CUSTOMER" ? "Customer" : "Segment"} required={form.scopeLevel !== "GLOBAL"} error={fe("gr-scope")} hint={form.scopeLevel === "GLOBAL" ? "Global guardrails apply to all customers." : undefined}>
              <select id="gr-scope" className={inputCls} disabled={form.scopeLevel === "GLOBAL"} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })}>
                <option value="">{form.scopeLevel === "GLOBAL" ? "All customers" : "Select…"}</option>
                {(form.scopeLevel === "CUSTOMER" ? CUSTOMERS.map((c) => c.name) : [...CUSTOMER_SEGMENTS]).map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Product" required error={fe("gr-product")}>
              <select id="gr-product" className={inputCls} value={form.product} onChange={(e) => setForm({ ...form, product: e.target.value })}>
                <option value="">Select…</option>
                <option>All products</option>
                {PRODUCTS.map((p) => (
                  <option key={p.productId} value={p.name}>
                    {p.sku} · {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Enforcement mode" required hint={ENFORCEMENT_HINT[form.enforcement]}>
              <select className={inputCls} value={form.enforcement} onChange={(e) => setForm({ ...form, enforcement: e.target.value as Form["enforcement"] })}>
                {ENFORCEMENT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {humanize(m)}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <fieldset className="mt-6 border-t border-border pt-4">
            <legend className="text-sm font-semibold px-0">Limits</legend>
            <p className="text-xs text-muted-foreground mb-4">Set at least one. Leave a limit blank to not enforce it.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <Field label={`Price floor (${form.currency})`} error={fe("gr-floor")}>
                <input id="gr-floor" type="number" inputMode="decimal" min={0} step="0.01" className={inputCls} value={form.priceFloor} onChange={(e) => setForm({ ...form, priceFloor: e.target.value })} placeholder="e.g. 36.00" />
              </Field>
              <Field label={`Price ceiling (${form.currency})`} error={fe("gr-ceiling")}>
                <input id="gr-ceiling" type="number" inputMode="decimal" min={num(form.priceFloor) ?? 0} step="0.01" className={inputCls} value={form.priceCeiling} onChange={(e) => setForm({ ...form, priceCeiling: e.target.value })} placeholder="e.g. 60.00" />
              </Field>
              <Field label="Minimum margin (%)" error={fe("gr-margin")}>
                <input id="gr-margin" type="number" inputMode="decimal" min={0} max={95} step="0.1" className={inputCls} value={form.minMarginPct} onChange={(e) => setForm({ ...form, minMarginPct: e.target.value })} placeholder="e.g. 22" />
              </Field>
              <Field label="Maximum discount (%)" error={fe("gr-maxdisc")}>
                <input id="gr-maxdisc" type="number" inputMode="decimal" min={0} max={100} step="0.1" className={inputCls} value={form.maxDiscountPct} onChange={(e) => setForm({ ...form, maxDiscountPct: e.target.value })} placeholder="e.g. 15" />
              </Field>
              <Field label="Maximum discount without approval (%)" hint="Discounts above this go to approval" error={fe("gr-maxdisc-na")}>
                <input id="gr-maxdisc-na" type="number" inputMode="decimal" min={0} max={num(form.maxDiscountPct) ?? 100} step="0.1" className={inputCls} value={form.maxDiscountNoApprovalPct} onChange={(e) => setForm({ ...form, maxDiscountNoApprovalPct: e.target.value })} placeholder="e.g. 8" />
              </Field>
              <Field label="Currency">
                <select className={inputCls} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                  {["GBP", "USD", "EUR", "INR"].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
            </div>
          </fieldset>

          <fieldset className="mt-6 border-t border-border pt-4">
            <legend className="text-sm font-semibold px-0">Effective dates and reason</legend>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mt-2">
              <Field label="Effective from" required error={fe("gr-from")} hint="A future date schedules the guardrail.">
                <input id="gr-from" type="date" min={TODAY} className={inputCls} value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
              </Field>
              <Field label="Effective to" error={fe("gr-to")} hint="Leave blank for open-ended.">
                <input id="gr-to" type="date" min={form.effectiveFrom || TODAY} className={inputCls} value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} />
              </Field>
              <Field label="Reason code" required error={fe("gr-reason")}>
                <select id="gr-reason" className={inputCls} value={form.reasonCode} onChange={(e) => setForm({ ...form, reasonCode: e.target.value })}>
                  <option value="">Select reason…</option>
                  {REASON_CODES.map((r) => (
                    <option key={r} value={r}>
                      {humanize(r)}
                    </option>
                  ))}
                </select>
              </Field>
              {form.reasonCode === "OTHER" && (
                <Field label="Reason text" required error={fe("gr-reason-text")}>
                  <input id="gr-reason-text" className={inputCls} value={form.reasonText} onChange={(e) => setForm({ ...form, reasonText: e.target.value })} />
                </Field>
              )}
            </div>
          </fieldset>
        </form>
      </Modal>

      <Drawer
        open={!!preview}
        onClose={() => setPreview(null)}
        size="md"
        title={preview ? `${preview.id} · ${preview.scope}` : ""}
        subtitle={
          preview && (
            <span className="flex flex-wrap items-center gap-2">
              <span>{preview.product}</span>
              <StatusPill status={preview.status} />
              <Tag tone={ENFORCEMENT_TONE[preview.enforcement]}>{humanize(preview.enforcement)}</Tag>
            </span>
          )
        }
        footer={
          preview && (
            <>
              <Btn variant="subtle" onClick={() => setPreview(null)}>
                Close
              </Btn>
              <Btn
                icon={Pencil}
                onClick={() => {
                  const g = preview;
                  setPreview(null);
                  open(g);
                }}
              >
                Edit guardrail
              </Btn>
            </>
          )
        }
      >
        {preview && (
          <>
            <section className="bg-card border border-border rounded-xl px-5">
              <DetailGrid
                items={[
                  { label: "Scope level", value: humanize(preview.scopeLevel) },
                  { label: "Currency", value: preview.currency },
                  { label: "Price floor", value: fmtLimit(preview.priceFloor, "money", preview.currency) },
                  { label: "Price ceiling", value: fmtLimit(preview.priceCeiling, "money", preview.currency) },
                  { label: "Min margin", value: fmtLimit(preview.minMarginPct, "pct", preview.currency) },
                  { label: "Max discount", value: fmtLimit(preview.maxDiscountPct, "pct", preview.currency) },
                  { label: "Max discount without approval", value: fmtLimit(preview.maxDiscountNoApprovalPct, "pct", preview.currency), full: true },
                  { label: "Enforcement", value: ENFORCEMENT_HINT[preview.enforcement], full: true },
                ]}
              />
            </section>
            <h3 className="font-semibold">Version history</h3>
            {versionsOf(preview).map((v) => (
              <section key={`${v.id}-${v.version}`} className="bg-card border border-border rounded-xl p-4" aria-label={`Version ${v.version}`}>
                <div className="flex items-center justify-between gap-2">
                  <h4 className="font-semibold">Version {v.version}</h4>
                  <StatusPill status={v.status} />
                </div>
                <dl className="mt-3 grid grid-cols-[96px_1fr] gap-y-2 text-sm">
                  <dt className="text-muted-foreground">Who</dt>
                  <dd>{v.lastChangedBy}</dd>
                  <dt className="text-muted-foreground">When</dt>
                  <dd className="tabular-nums">{v.lastChangedAt}</dd>
                  <dt className="text-muted-foreground">What</dt>
                  <dd>{v.changedFields}</dd>
                  <dt className="text-muted-foreground">Reason</dt>
                  <dd>
                    <Tag>{reasonLabel(v.reasonCode)}</Tag>
                  </dd>
                  <dt className="text-muted-foreground">Effective</dt>
                  <dd className="tabular-nums">
                    {v.effectiveFrom} → {v.effectiveTo ?? "open"}
                  </dd>
                </dl>
              </section>
            ))}
          </>
        )}
      </Drawer>
    </PricingLayout>
  );
}
