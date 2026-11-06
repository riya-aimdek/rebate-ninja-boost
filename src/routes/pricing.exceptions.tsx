import { createFileRoute } from "@tanstack/react-router";
import { useId, useMemo, useState, type FormEvent } from "react";
import { FilePlus2, History, Pencil, Send, ShieldAlert, Undo2 } from "lucide-react";
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
  ListHeader,
  MissingHint,
  PillTabs,
  PricingLayout,
  RecordLink,
  StatusPill,
  humanize,
  inputCls,
  missingFields,
  money,
  type ApiError,
  type Column,
} from "@/components/pricing/kit";
import { RequireAccess, Secure } from "@/components/pricing/access";
import { CUSTOMERS, PRODUCTS, RECOMMENDATIONS, customerById, productBySku } from "@/lib/pricing/data";
import {
  EXCEPTIONS,
  EXCEPTION_STATUSES,
  JUSTIFICATIONS,
  MAX_EXCEPTION_MONTHS,
  NOW,
  TODAY_ISO,
  addMonths,
  nextExceptionId,
  priceLine,
  resolveApprovals,
  saveException,
  saveTask,
  taskById,
  type ExceptionStatus,
  type Justification,
  type PricingException,
} from "@/lib/pricing/deals";
import { submitException } from "@/lib/pricing/dealdesk";
import { useSession, userById, userName } from "@/lib/pricing/session";

export const Route = createFileRoute("/pricing/exceptions")({
  head: () => ({ meta: [{ title: "Pricing exceptions · Rebate Ninja" }] }),
  component: () => (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Deal desk" }, { label: "Pricing exceptions" }]}>
      <RequireAccess roles={["SALES_REP", "SALES_MANAGER", "DEAL_DESK", "PRICING_ADMIN", "FINANCE_CONTROLLER"]}>
        <Page />
      </RequireAccess>
    </PricingLayout>
  ),
});

type Tab = "new" | "mine" | "log";

const JUST_HINT: Record<Justification, string> = {
  COMPETITIVE_PRESSURE: "Routes to the Regional VP. Add the competitor's price as evidence.",
  VOLUME_COMMITMENT: "Routes to the deal desk or sales manager — either can approve.",
  STRATEGIC_ACCOUNT: "Routes to the CCO delegate.",
  END_OF_LIFE: "Routes to the deal desk or sales manager — either can approve.",
  OTHER: "Routes to the deal desk or sales manager — either can approve.",
};

type Form = {
  id?: string;
  customerId: string;
  sku: string;
  qty: string;
  requestedPrice: string;
  justification: Justification | "";
  reason: string;
  competitorName: string;
  competitorPrice: string;
  expiryDate: string;
};
const EMPTY: Form = { customerId: "", sku: "", qty: "", requestedPrice: "", justification: "", reason: "", competitorName: "", competitorPrice: "", expiryDate: "" };

const MAX_EXPIRY = addMonths(TODAY_ISO, MAX_EXCEPTION_MONTHS);
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Approved exceptions past their expiry date show as expired: standard pricing applies again (AC#3). */
const effective = (e: PricingException): ExceptionStatus => (e.status === "APPROVED" && e.expiryDate < TODAY_ISO ? "EXPIRED" : e.status);

/** Current (engine) price and recommended price for a customer + product (AC#1 auto-fill). */
type Auto = { error: string } | { current: number; recommended: number; recSource: string; cost: number; uom: string };
function autoPrices(customerId: string, sku: string, qty: number): Auto | undefined {
  const c = customerById(customerId);
  if (!c || !sku) return undefined;
  const r = priceLine({ customerId, channel: c.channel, pricingDate: TODAY_ISO }, { sku, qty: qty > 0 ? qty : 1 });
  if (!r.ok) return { error: r.error.message };
  const rec = RECOMMENDATIONS.find((x) => x.sku === sku && x.customer === c.name && !x.expired);
  return { current: r.netPrice, recommended: rec?.suggestedPrice ?? r2(r.netPrice * 0.97), recSource: rec ? `${rec.id} (${rec.method === "ML" ? "model" : "rule-based"})` : "Segment guidance (−3%)", cost: r.cost, uom: r.uom };
}

function Page() {
  const { user, sees, role } = useSession();
  const canCreate = role !== "FINANCE_CONTROLLER";
  const seeAll = role === "DEAL_DESK" || role === "PRICING_ADMIN" || role === "FINANCE_CONTROLLER" || role === "SALES_MANAGER";
  const [tab, setTab] = useState<Tab>(canCreate ? "mine" : "log");
  const [tick, setTick] = useState(0);
  const [form, setForm] = useState<Form>(EMPTY);
  const [origin, setOrigin] = useState(JSON.stringify(EMPTY));
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState<"draft" | "submit" | null>(null);
  const [audit, setAudit] = useState<PricingException | null>(null);
  const [withdraw, setWithdraw] = useState<PricingException | null>(null);
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<ExceptionStatus[]>([]);
  const [justs, setJusts] = useState<Justification[]>([]);

  const all = useMemo(() => [...EXCEPTIONS], [tick]); // eslint-disable-line react-hooks/exhaustive-deps
  const mine = all.filter((e) => e.requesterId === user.id);
  const scope = tab === "mine" ? mine : seeAll ? all : mine;
  const list = scope.filter(
    (e) =>
      (!search || `${e.id} ${customerById(e.customerId)?.name ?? ""} ${e.sku} ${e.reason}`.toLowerCase().includes(search.toLowerCase())) &&
      (statuses.length === 0 || statuses.includes(effective(e))) &&
      (justs.length === 0 || justs.includes(e.justification)),
  );

  /* ---------------- form ---------------- */
  const qty = Number(form.qty);
  const auto = form.customerId && form.sku ? autoPrices(form.customerId, form.sku, qty) : undefined;
  const autoOk = auto && !("error" in auto) ? auto : undefined;
  const req = form.requestedPrice.trim() === "" ? undefined : Number(form.requestedPrice);
  const margin = autoOk && req ? ((req - autoOk.cost) / req) * 100 : undefined;
  const discount = autoOk && req ? ((autoOk.current - req) / autoOk.current) * 100 : undefined;
  const routing = form.justification && autoOk && req
    ? resolveApprovals({ appliesTo: "EXCEPTION", exceptionType: form.justification, discountPct: discount, marginPct: margin, dealValue: req * (qty || 1), customerId: form.customerId, sku: form.sku, requesterId: user.id })
    : undefined;

  const errs: Record<string, string> = {};
  if (!form.customerId) errs["ex-customer"] = "Select the customer.";
  if (!form.sku) errs["ex-product"] = "Select the product.";
  else if (auto && "error" in auto) errs["ex-product"] = auto.error;
  if (!form.qty || !(qty > 0)) errs["ex-qty"] = "Enter a quantity of 1 or more.";
  if (req === undefined || Number.isNaN(req)) errs["ex-req"] = "Enter the price you need.";
  else if (req <= 0) errs["ex-req"] = "Enter a price above 0.";
  else if (autoOk && req >= autoOk.current) errs["ex-req"] = `The current price is ${money(autoOk.current)}. An exception is only needed for a lower price.`;
  if (!form.justification) errs["ex-just"] = "Choose a justification — it decides who approves.";
  if (!form.reason.trim()) errs["ex-reason"] = "Explain why this deal needs a price outside policy.";
  if (form.competitorPrice && !(Number(form.competitorPrice) > 0)) errs["ex-comp-price"] = "Enter the competitor's price, or leave it blank.";
  if (!form.expiryDate) errs["ex-expiry"] = "Choose when the exception price ends.";
  else if (form.expiryDate <= TODAY_ISO) errs["ex-expiry"] = "Choose a date after today.";
  else if (form.expiryDate > MAX_EXPIRY) errs["ex-expiry"] = `Exceptions can last up to ${MAX_EXCEPTION_MONTHS} months — choose ${MAX_EXPIRY} or earlier.`;
  const fe = (k: string) => (submitted ? errs[k] : undefined);
  const dirty = JSON.stringify(form) !== origin;
  /* Empty required fields — Submit (all of them) and Save draft (customer + product) stay disabled. */
  const missingSubmit = missingFields([
    ["Customer", form.customerId],
    ["Product", form.sku],
    ["Quantity", form.qty],
    ["Requested price", form.requestedPrice],
    ["Expiry date", form.expiryDate],
    ["Category", form.justification],
    ["Reason", form.reason],
  ]);
  const missingDraft = missingFields([
    ["Customer", form.customerId],
    ["Product", form.sku],
  ]);
  const formHintId = useId();

  const rejection = (): ApiError | null => {
    if (form.expiryDate && form.expiryDate > MAX_EXPIRY)
      return { errorClass: "VALIDATION", code: "EXPIRY_TOO_FAR", message: `The expiry ${form.expiryDate} is more than ${MAX_EXCEPTION_MONTHS} months away. Choose ${MAX_EXPIRY} or earlier.`, field: "expiryDate" };
    const missing = [!form.customerId && "customer", !form.sku && "product", !(qty > 0) && "quantity", req === undefined && "requestedPrice", !form.justification && "justification", !form.reason.trim() && "reason", !form.expiryDate && "expiryDate"].filter(Boolean) as string[];
    if (missing.length) return { errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: form.justification ? "Fill in the required fields highlighted below." : "A justification is required before you can submit.", field: missing.join(", ") };
    return null;
  };

  const startNew = (e?: PricingException) => {
    const f: Form = e
      ? { id: e.id, customerId: e.customerId, sku: e.sku, qty: String(e.qty), requestedPrice: String(e.requestedPrice), justification: e.justification, reason: e.reason, competitorName: e.competitorName ?? "", competitorPrice: e.competitorPrice?.toString() ?? "", expiryDate: e.expiryDate }
      : EMPTY;
    setForm(f);
    setOrigin(JSON.stringify(f));
    setSubmitted(false);
    setError(null);
    setTab("new");
  };

  const toRecord = (status: ExceptionStatus): PricingException => {
    const prev = form.id ? all.find((x) => x.id === form.id) : undefined;
    return {
      id: form.id ?? nextExceptionId(),
      customerId: form.customerId,
      sku: form.sku,
      qty,
      currentPrice: autoOk?.current ?? 0,
      requestedPrice: req ?? 0,
      recommendedPrice: autoOk?.recommended ?? 0,
      justification: (form.justification || "OTHER") as Justification,
      reason: form.reason.trim(),
      competitorName: form.competitorName.trim() || undefined,
      competitorPrice: form.competitorPrice ? Number(form.competitorPrice) : undefined,
      expiryDate: form.expiryDate,
      status,
      requesterId: prev?.requesterId ?? user.id,
      createdAt: prev?.createdAt ?? NOW,
      updatedAt: NOW,
      approvalTaskId: undefined,
    };
  };

  const saveDraft = () => {
    if (!form.customerId || !form.sku) {
      setSubmitted(true);
      setError({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Choose at least a customer and product to save a draft.", field: "customer, product" });
      return;
    }
    setSaving("draft");
    window.setTimeout(() => {
      const rec = toRecord("DRAFT");
      saveException(rec);
      setSaving(null);
      setOrigin(JSON.stringify({ ...form, id: rec.id }));
      setForm({ ...form, id: rec.id });
      setTick((n) => n + 1);
      toast.success(`Draft ${rec.id} saved`, { description: "Submit it when the details are complete." });
    }, 350);
  };

  const submit = (ev?: FormEvent) => {
    ev?.preventDefault();
    setSubmitted(true);
    setError(rejection());
    const first = Object.keys(errs)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    if (routing && routing.steps.length === 0) {
      setError({ errorClass: "BUSINESS_RULE", code: "NO_APPROVAL_ROUTE", message: "No approval rule covers this request, so it can't be routed. Ask a pricing administrator to check the approval matrix." });
      return;
    }
    setSaving("submit");
    window.setTimeout(() => {
      const rec = toRecord("SUBMITTED");
      saveException(rec);
      const { task } = submitException(rec);
      setSaving(null);
      setTick((n) => n + 1);
      setForm(EMPTY);
      setOrigin(JSON.stringify(EMPTY));
      setSubmitted(false);
      setTab("mine");
      toast.success(`${rec.id} submitted for approval`, {
        description: task ? `Routed to ${task.steps[0].approvers.map((a) => userName(a.userId)).join(" or ")}.` : "No approval rule matched — check the approval matrix.",
      });
    }, 500);
  };

  const doWithdraw = () => {
    const e = withdraw!;
    const t = taskById(e.approvalTaskId);
    if (t) saveTask({ ...t, status: "WITHDRAWN", trail: [...t.trail, { id: `T${t.trail.length + 1}`, at: NOW, actorId: user.id, action: "WITHDRAWN", comment: "Withdrawn by the requester." }] });
    saveException({ ...e, status: "WITHDRAWN", updatedAt: NOW });
    setWithdraw(null);
    setTick((n) => n + 1);
    toast.success(`${e.id} withdrawn`, { description: "The approval task was cancelled. Standard pricing applies." });
  };

  /* ---------------- table ---------------- */
  const columns: Column<PricingException>[] = [
    { key: "id", header: "ID", cell: (e) => <span className="font-mono text-xs whitespace-nowrap">{e.id}</span> },
    {
      key: "cust",
      header: "Customer & product",
      className: "min-w-56",
      cell: (e) => (
        <div>
          <RecordLink to="/pricing/customers/$id" params={{ id: e.customerId }}>
            {customerById(e.customerId)?.name ?? e.customerId}
          </RecordLink>
          <div className="text-sm text-muted-foreground mt-0.5">
            {productBySku(e.sku)?.name ?? e.sku} <span className="font-mono text-xs whitespace-nowrap">{e.sku}</span>
          </div>
        </div>
      ),
    },
    { key: "qty", header: "Qty", align: "right", cell: (e) => <span className="tabular-nums">{e.qty.toLocaleString("en-GB")}</span> },
    {
      key: "price",
      header: "Current → requested",
      align: "right",
      cell: (e) => (
        <span className="tabular-nums whitespace-nowrap">
          {money(e.currentPrice)} → <b>{money(e.requestedPrice)}</b>
          <span className="block text-xs text-muted-foreground">−{(((e.currentPrice - e.requestedPrice) / e.currentPrice) * 100).toFixed(1)}%</span>
        </span>
      ),
    },
    ...(sees("marginPct")
      ? [{ key: "m", header: "Margin", align: "right" as const, cell: (e: PricingException) => { const c = productBySku(e.sku)?.cost ?? 0; return <Secure field="marginPct"><span className="tabular-nums">{(((e.requestedPrice - c) / e.requestedPrice) * 100).toFixed(1)}%</span></Secure>; } }]
      : []),
    { key: "j", header: "Justification", className: "whitespace-nowrap", cell: (e) => humanize(e.justification) },
    { key: "exp", header: "Expires", cell: (e) => <span className="tabular-nums whitespace-nowrap">{e.expiryDate}</span> },
    {
      key: "st",
      header: "Status",
      className: "whitespace-nowrap",
      cell: (e) => <StatusPill status={effective(e)} />,
    },
    ...(tab === "log" ? [{ key: "req", header: "Requester", className: "whitespace-nowrap", cell: (e: PricingException) => userName(e.requesterId) }] : []),
    {
      key: "act",
      header: <span className="sr-only">Actions</span>,
      align: "right",
      cell: (e) => {
        const own = e.requesterId === user.id;
        const st = effective(e);
        return (
          <div className="flex justify-end gap-1.5">
            {own && (st === "DRAFT" || st === "SENT_BACK") && canCreate && (
              <Btn size="sm" variant="subtle" icon={Pencil} onClick={() => startNew(e)}>
                {st === "SENT_BACK" ? "Edit and resubmit" : "Edit draft"}
              </Btn>
            )}
            {own && (st === "SUBMITTED" || st === "IN_APPROVAL") && (
              <Btn size="sm" variant="subtle" icon={Undo2} onClick={() => setWithdraw(e)}>
                Withdraw
              </Btn>
            )}
            <Btn size="sm" variant="ghost" icon={History} onClick={() => setAudit(e)} aria-label={`View audit for ${e.id}`} title="Audit history" />
          </div>
        );
      },
    },
  ];
  const filtered = !!(search || statuses.length || justs.length);

  return (
    <>
      <ListHeader
        title="Pricing exceptions"
        subtitle="Request a price outside policy with a justification and an expiry. Approved prices end automatically."
        actions={
          canCreate && (
            <Btn icon={FilePlus2} onClick={() => startNew()}>
              Request exception
            </Btn>
          )
        }
      />
      <PillTabs<Tab>
        idPrefix="exc"
        active={tab}
        onChange={setTab}
        tabs={[
          ...(canCreate ? [{ key: "new" as Tab, label: form.id ? `Edit ${form.id}` : "New exception" }, { key: "mine" as Tab, label: "My requests", count: mine.length }] : []),
          { key: "log", label: "Exception log", count: (seeAll ? all : mine).length },
        ]}
      />

      {tab === "new" && canCreate && (
        <div role="tabpanel" id="exc-panel-new" aria-labelledby="exc-tab-new" className="grid grid-cols-1 xl:grid-cols-[1fr_360px] gap-6 items-start">
          <Card title={form.id ? `Edit ${form.id}` : "New exception"} subtitle={dirty ? "Unsaved changes" : "Everything below goes to the approver and the audit trail."}>
            <form id="exc-form" onSubmit={submit} noValidate>
              <ErrorBanner error={error} onClose={() => setError(null)} />
              <p className="text-xs text-muted-foreground mb-4">
                <span className="text-destructive" aria-hidden>*</span> Required
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                <Field label="Customer" required error={fe("ex-customer")}>
                  <select id="ex-customer" className={inputCls} value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })}>
                    <option value="">Select…</option>
                    {CUSTOMERS.filter((c) => c.status === "ACTIVE").map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Product" required error={fe("ex-product") ?? (auto && "error" in auto ? auto.error : undefined)}>
                  <select id="ex-product" className={inputCls} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })}>
                    <option value="">Select…</option>
                    {PRODUCTS.filter((p) => p.lifecycleStatus !== "BLOCKED").map((p) => (
                      <option key={p.sku} value={p.sku}>
                        {p.sku} · {p.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={`Quantity${autoOk ? ` (${autoOk.uom})` : ""}`} required error={fe("ex-qty")}>
                  <input id="ex-qty" type="number" inputMode="numeric" min={1} step={1} className={inputCls} value={form.qty} onChange={(e) => setForm({ ...form, qty: e.target.value })} placeholder="e.g. 500" />
                </Field>
                <Field label="Current price (£)" hint="Calculated by the pricing engine for this customer today.">
                  <div className="h-10 px-3 rounded-lg bg-muted flex items-center tabular-nums text-base" aria-live="polite">
                    {autoOk ? money(autoOk.current) : "—"}
                  </div>
                </Field>
                <Field label="Recommended price (£)" hint={autoOk ? `Source: ${autoOk.recSource}` : "Shown once customer and product are chosen."}>
                  <div className="h-10 px-3 rounded-lg bg-muted flex items-center tabular-nums text-base">{autoOk ? money(autoOk.recommended) : "—"}</div>
                </Field>
                <Field label="Requested price (£)" required error={fe("ex-req")} hint={discount !== undefined && !Number.isNaN(discount) ? `${discount.toFixed(1)}% below the current price` : undefined}>
                  <input id="ex-req" type="number" inputMode="decimal" min={0} step="0.01" className={inputCls} value={form.requestedPrice} onChange={(e) => setForm({ ...form, requestedPrice: e.target.value })} placeholder="e.g. 26.90" />
                </Field>
                {sees("marginPct") && (
                  <Field label="Resulting margin" hint="Visible to roles allowed to see margin.">
                    <div className={`min-h-10 py-2 px-3 rounded-lg bg-muted flex items-center tabular-nums text-base ${margin !== undefined && margin < 20 ? "text-destructive font-semibold" : ""}`}>
                      {margin !== undefined && Number.isFinite(margin) ? `${margin.toFixed(1)}%${margin < 20 ? " — below the 20% global floor" : ""}` : "—"}
                    </div>
                  </Field>
                )}
                <Field label="Expiry date" required error={fe("ex-expiry")} hint={`Up to ${MAX_EXCEPTION_MONTHS} months (${MAX_EXPIRY}). Standard pricing resumes the day after.`}>
                  <input id="ex-expiry" type="date" min={TODAY_ISO} className={inputCls} value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })} />
                </Field>
              </div>

              <fieldset className="mt-6 border-t border-border pt-4">
                <legend className="text-sm font-semibold">Justification</legend>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mt-2">
                  <Field label="Category" required error={fe("ex-just")} hint={form.justification ? JUST_HINT[form.justification] : undefined}>
                    <select id="ex-just" className={inputCls} value={form.justification} onChange={(e) => setForm({ ...form, justification: e.target.value as Justification })}>
                      <option value="">Select…</option>
                      {JUSTIFICATIONS.map((j) => (
                        <option key={j} value={j}>
                          {humanize(j)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Reason" required error={fe("ex-reason")} className="md:col-span-2">
                    <textarea id="ex-reason" rows={3} className={`${inputCls} h-auto py-2`} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="e.g. VoltDirect quoting £26.50 delivered for the Q4 refresh" />
                  </Field>
                </div>
              </fieldset>

              <fieldset className="mt-6 border-t border-border pt-4">
                <legend className="text-sm font-semibold">Competitor evidence (optional)</legend>
                <p className="text-xs text-muted-foreground mb-3">Helps the approver and feeds the exception trend report.</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                  <Field label="Competitor">
                    <input className={inputCls} value={form.competitorName} onChange={(e) => setForm({ ...form, competitorName: e.target.value })} placeholder="e.g. VoltDirect" />
                  </Field>
                  <Field label="Competitor price (£)" error={fe("ex-comp-price")}>
                    <input id="ex-comp-price" type="number" inputMode="decimal" min={0} step="0.01" className={inputCls} value={form.competitorPrice} onChange={(e) => setForm({ ...form, competitorPrice: e.target.value })} />
                  </Field>
                </div>
              </fieldset>

              <div className="mt-6 flex flex-wrap items-center justify-end gap-2 border-t border-border pt-4">
                <MissingHint id={formHintId} missing={missingSubmit} />
                <Btn variant="subtle" onClick={() => { setForm(EMPTY); setOrigin(JSON.stringify(EMPTY)); setError(null); setSubmitted(false); setTab("mine"); }} disabled={!!saving}>
                  Cancel
                </Btn>
                <Btn variant="outline" onClick={saveDraft} loading={saving === "draft"} disabled={saving === "submit" || missingDraft.length > 0} aria-describedby={missingDraft.length ? formHintId : undefined}>
                  Save draft
                </Btn>
                <Btn type="submit" icon={Send} loading={saving === "submit"} disabled={saving === "draft" || missingSubmit.length > 0} aria-describedby={missingSubmit.length ? formHintId : undefined}>
                  Submit for approval
                </Btn>
              </div>
            </form>
          </Card>

          <Card title="Who will approve" subtitle="Live preview from the approval matrix">
            {!routing ? (
              <p className="text-base text-muted-foreground">Choose a customer, product, requested price and justification to see the route.</p>
            ) : routing.steps.length === 0 ? (
              <InfoBanner tone="warning" className="">No approval rule matches. Submitting will be blocked — ask a pricing administrator to check the approval matrix.</InfoBanner>
            ) : (
              <ol className="space-y-3 text-sm">
                {routing.steps.map((s) => (
                  <li key={s.level} className="rounded-lg border border-border p-3">
                    <div className="font-semibold">Level {s.level}</div>
                    <div>{s.approverIds.map((id) => `${userName(id)} (${userById(id)?.title})`).join(s.parallelRule === "ANY" ? " or " : " and ")}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      SLA {s.slaHours} h · rules {s.fromRules.join(", ")}
                    </div>
                  </li>
                ))}
                {routing.conflicts.map((c, i) => (
                  <li key={i}>
                    <Flag tone="info">You can't approve your own request — routed to {userName(c.replacedWith)}</Flag>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      )}

      {tab !== "new" && (
        <div role="tabpanel" id={`exc-panel-${tab}`} aria-labelledby={`exc-tab-${tab}`}>
          <div className="flex flex-wrap items-center gap-x-6 empty:hidden">
            <FilterPills<ExceptionStatus> label="Status" selected={statuses} onChange={setStatuses} options={EXCEPTION_STATUSES.filter((s) => scope.some((e) => effective(e) === s)).map((s) => ({ key: s, label: humanize(s), count: scope.filter((e) => effective(e) === s).length }))} />
            <FilterPills<Justification> label="Justification" selected={justs} onChange={setJusts} options={JUSTIFICATIONS.map((j) => ({ key: j, label: humanize(j), count: scope.filter((e) => e.justification === j).length }))} />
          </div>
          <div className="mb-4 max-w-sm">
            <label className="sr-only" htmlFor="exc-search">Search exceptions</label>
            <input id="exc-search" data-page-search type="search" className={inputCls} placeholder="Search exceptions" value={search} onChange={(e) => setSearch(e.target.value)} aria-keyshortcuts="/" />
          </div>
          <DataTable<PricingException>
            caption={tab === "mine" ? "My exception requests" : "Exception log"}
            rows={list}
            rowKey={(e) => e.id}
            pageSize={25}
            columns={columns}
            empty={
              filtered ? (
                <EmptyState icon={ShieldAlert} title="No exceptions match these filters" action={<Btn variant="subtle" onClick={() => { setSearch(""); setStatuses([]); setJusts([]); }}>Clear filters</Btn>}>
                  Try a different search term or remove a filter.
                </EmptyState>
              ) : (
                <EmptyState icon={ShieldAlert} title="No exception requests yet" />
              )
            }
          />
        </div>
      )}

      <ConfirmDialog
        open={!!withdraw}
        title={`Withdraw ${withdraw?.id}?`}
        description="The approval task is cancelled and the request can't be decided. You can raise a new exception later."
        confirmLabel="Withdraw request"
        tone="danger"
        onConfirm={doWithdraw}
        onCancel={() => setWithdraw(null)}
      />

      <AuditDrawer exc={audit} onClose={() => setAudit(null)} />
    </>
  );
}

function AuditDrawer({ exc, onClose }: { exc: PricingException | null; onClose: () => void }) {
  const { sees } = useSession();
  if (!exc) return null;
  const t = taskById(exc.approvalTaskId);
  const p = productBySku(exc.sku);
  const st = effective(exc);
  return (
    <Drawer
      open
      size="md"
      onClose={onClose}
      title={`${exc.id} · audit`}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          {customerById(exc.customerId)?.name} · {exc.sku}
          <StatusPill status={st} />
        </span>
      }
      footer={<Btn variant="subtle" onClick={onClose}>Close</Btn>}
    >
      {st === "EXPIRED" && <InfoBanner className="" title="Expired">The exception price ended on {exc.expiryDate}. Standard pricing applies.</InfoBanner>}
      <section className="bg-card border border-border rounded-xl px-5">
        <DetailGrid
          items={[
            { label: "Quantity", value: `${exc.qty.toLocaleString("en-GB")} ${p?.uom ?? ""}` },
            { label: "Expiry", value: exc.expiryDate },
            { label: "Current price", value: money(exc.currentPrice) },
            { label: "Requested price", value: money(exc.requestedPrice) },
            { label: "Recommended price", value: money(exc.recommendedPrice) },
            ...(sees("marginPct") && p ? [{ label: "Resulting margin", value: `${(((exc.requestedPrice - p.cost) / exc.requestedPrice) * 100).toFixed(1)}%` }] : []),
            { label: "Justification", value: humanize(exc.justification) },
            { label: "Requested by", value: userName(exc.requesterId) },
            { label: "Reason", value: exc.reason, full: true },
            ...(exc.competitorName ? [{ label: "Competitor evidence", value: `${exc.competitorName}${exc.competitorPrice ? ` at ${money(exc.competitorPrice)}` : ""}`, full: true }] : []),
            ...(exc.decisionComment ? [{ label: "Decision comment", value: exc.decisionComment, full: true }] : []),
          ]}
        />
      </section>
      <h3 className="text-lg lg:text-xl leading-[1.2] font-semibold">History</h3>
      <ol className="space-y-3 text-sm">
        <li className="border-l-2 border-border pl-3">
          <span className="font-medium">Created</span> by {userName(exc.requesterId)} <span className="text-xs text-muted-foreground tabular-nums">{exc.createdAt}</span>
        </li>
        {t?.trail.map((e) => (
          <li key={e.id} className="border-l-2 border-border pl-3">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={e.action} label={humanize(e.action)} />
              <span className="font-medium">{e.actorId === "System" ? "System" : userName(e.actorId)}</span>
              {e.onBehalfOf && <span className="text-muted-foreground">for {userName(e.onBehalfOf)}</span>}
              <span className="text-xs text-muted-foreground tabular-nums">{e.at}</span>
            </div>
            {e.comment && <p className="mt-1">{e.comment}</p>}
            {(e.previousValue || e.newValue) && <p className="text-xs text-muted-foreground mt-1 tabular-nums">{e.previousValue ?? "—"} → {e.newValue ?? "unchanged"}</p>}
          </li>
        ))}
        {!t && <li className="text-muted-foreground">Not submitted yet.</li>}
      </ol>
    </Drawer>
  );
}
