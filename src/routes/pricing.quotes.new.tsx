import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Compass, Send } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  ConfirmDialog,
  DataTable,
  DetailGrid,
  DetailTitle,
  ErrorBanner,
  Field,
  Flag,
  InfoBanner,
  MissingHint,
  PricingLayout,
  Stepper,
  Tag,
  humanize,
  inputCls,
  missingFields,
  money,
  pct,
  type ApiError,
} from "@/components/pricing/kit";
import { RequireAccess, Secure, pctBand } from "@/components/pricing/access";
import { QuoteLinesTable, useLivePricing } from "@/components/pricing/quote-lines";
import { CHANNELS, customerById } from "@/lib/pricing/data";
import {
  CRM_ACCOUNTS,
  CRM_OPPORTUNITIES,
  INCOTERMS,
  PAYMENT_TERMS,
  NOW,
  TODAY_ISO,
  nextQuoteId,
  saveQuote,
  type PricedLine,
  type Quote,
  type QuoteLineInput,
} from "@/lib/pricing/deals";
import { activeFlow, approvalNeed, outcomeFor, priceRange, submitQuote, visibleQuestions, type Answers } from "@/lib/pricing/cpq";
import { userName, useSession } from "@/lib/pricing/session";

type NewSearch = { opportunity?: string };

export const Route = createFileRoute("/pricing/quotes/new")({
  head: () => ({ meta: [{ title: "Create quote · Rebate Ninja" }] }),
  validateSearch: (s: Record<string, unknown>): NewSearch => ({ opportunity: typeof s.opportunity === "string" ? s.opportunity : undefined }),
  component: Page,
});

const STEPS = ["Customer & opportunity", "Guided selling", "Lines & pricing", "Review & submit"];
type Decision = "ACCEPTED" | "CHANGED" | "IGNORED" | "";

const plusDays = (iso: string, d: number) => {
  const x = new Date(`${iso}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};

function Page() {
  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Quotes", to: "/pricing/quotes" }, { label: "Create quote" }]}>
      <RequireAccess roles={["SALES_REP"]}>
        <Wizard />
      </RequireAccess>
    </PricingLayout>
  );
}

function Wizard() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { user } = useSession();
  const fromCrm = search.opportunity ? CRM_OPPORTUNITIES.find((o) => o.id === search.opportunity) : undefined;

  const [step, setStep] = useState(0);
  const [oppId, setOppId] = useState(fromCrm?.id ?? "");
  const [accountId, setAccountId] = useState(fromCrm?.accountId ?? "");
  const customer = accountId ? customerById(CRM_ACCOUNTS[accountId]) : undefined;
  const [name, setName] = useState(fromCrm?.name ?? "");
  const [channel, setChannel] = useState(customer?.channel ?? "Direct");
  const [pricingDate, setPricingDate] = useState(TODAY_ISO);
  const [validUntil, setValidUntil] = useState(plusDays(TODAY_ISO, 30));
  const [paymentTerms, setPaymentTerms] = useState<string>("Net 30");
  const [incoterms, setIncoterms] = useState<string>("DAP");
  const [answers, setAnswers] = useState<Answers>({});
  const [decision, setDecision] = useState<Decision>("");
  const [lines, setLines] = useState<QuoteLineInput[]>([]);
  const [comment, setComment] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState<"" | "draft" | "submit">("");
  const [leaving, setLeaving] = useState(false);
  const [quoteId] = useState(() => nextQuoteId());

  const flow = activeFlow(pricingDate);
  const outcome = flow ? outcomeFor(flow, answers) : undefined;
  const qty = Number(answers.Q3) > 0 ? Number(answers.Q3) : 1;

  const draft: Quote = useMemo(
    () => ({
      id: quoteId,
      name: name || "Untitled quote",
      customerId: customer?.id ?? "",
      crmOpportunityId: oppId || undefined,
      crmAccountId: accountId || undefined,
      ownerId: user.id,
      channel,
      currency: "GBP",
      pricingDate,
      status: "DRAFT",
      revision: 1,
      lines,
      history: [],
      paymentTerms,
      incoterms,
      shipTo: customer?.name ?? "",
      validUntil,
      createdAt: NOW,
      updatedAt: NOW,
      priceListVersion: "BL-001 v4",
      guidedFlowId: flow && decision ? `${flow.id} v${flow.version}` : undefined,
      guidedAnswers: flow && decision ? { ...answers, recommendation: outcome?.label ?? "", decision } : undefined,
      documents: [],
    }),
    [quoteId, name, customer, oppId, accountId, user.id, channel, pricingDate, lines, paymentTerms, incoterms, validUntil, flow, answers, outcome, decision],
  );
  const live = useLivePricing(draft);
  const ranges = useMemo(
    () => (customer && outcome ? outcome.products.map((sku) => priceRange({ customerId: customer.id, channel, pricingDate }, sku, qty)).filter((r): r is NonNullable<typeof r> => !!r) : []),
    [customer, outcome, channel, pricingDate, qty],
  );
  const belowRange = live.results.filter((r): r is PricedLine => r.ok).filter((r) => {
    const rg = ranges.find((x) => x.sku === r.sku);
    return rg && r.netPrice < rg.min;
  });
  /* Required fields per step — Next / Accept stay disabled until they are filled. */
  const missingContext = missingFields([
    ["CRM account", accountId],
    ["Quote name", name],
    ["Valid until", validUntil],
  ]);
  const missingAnswers = flow
    ? missingFields(visibleQuestions(flow, answers).filter((q) => q.required).map((q) => [q.text, answers[q.id] ?? ""] as [string, string]))
    : [];
  const missingLines = missingFields([["At least one line", lines]]);
  const answersHintId = useId();

  const dirty = lines.length > 0 || Object.keys(answers).length > 0 || (!fromCrm && !!accountId);

  /* ---------- Step 1: CRM context (US-CQ-01 AC#3, US-MD-02 AC#6) ---------- */
  const contextError = (): ApiError | null => {
    const missing = [!accountId && "crmAccountId", !name.trim() && "name", !validUntil && "validUntil"].filter(Boolean) as string[];
    if (missing.length) return { errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Fill in the required fields highlighted below.", field: missing.join(", ") };
    const opp = CRM_OPPORTUNITIES.find((o) => o.id === oppId);
    if (opp && opp.accountId !== accountId)
      return { errorClass: "VALIDATION", code: "ACCOUNT_OPPORTUNITY_MISMATCH", message: `Opportunity ${opp.id} belongs to account ${opp.accountId}, not ${accountId}. Pick the matching account or another opportunity.`, field: "crmAccountId" };
    if (customer?.status === "BLOCKED") return { errorClass: "BUSINESS_RULE", code: "CUSTOMER_BLOCKED", message: `${customer.name} is blocked, so a quote can't be created. Ask the account owner (${customer.owner}) to resolve the block in the ERP.`, field: "customerId" };
    if (validUntil < pricingDate) return { errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Valid until must be on or after the pricing date.", field: "validUntil" };
    return null;
  };
  const fe = (field: string) => (submitted && error?.field?.split(", ").includes(field) ? error.message : undefined);

  const next = (ev?: FormEvent) => {
    ev?.preventDefault();
    if (step === 0) {
      setSubmitted(true);
      const e = contextError();
      setError(e);
      if (e) return;
      setSubmitted(false);
    }
    if (step === 2) {
      const bad = live.results.filter((r) => !r.ok);
      if (lines.length === 0) {
        setError({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Add at least one line before reviewing.", field: "lines" });
        return;
      }
      if (bad.length) {
        setError({ errorClass: "VALIDATION", code: bad.length === lines.length ? "VALIDATION_REQUIRED" : "PARTIAL_SUCCESS", message: `${bad.length} of ${lines.length} lines can't be priced. Fix or remove them — each error is shown on its line.`, field: "lines" });
        return;
      }
    }
    setError(null);
    setStep((s) => Math.min(STEPS.length - 1, s + 1));
  };

  const pickOpp = (id: string) => {
    setOppId(id);
    const o = CRM_OPPORTUNITIES.find((x) => x.id === id);
    if (o) {
      setAccountId(o.accountId);
      setName(o.name);
      const c = customerById(CRM_ACCOUNTS[o.accountId]);
      if (c) setChannel(c.channel);
    }
  };

  /* ---------- Step 2: guided selling (US-CQ-03) ---------- */
  const acceptRecommendation = (d: Decision) => {
    setDecision(d);
    if (outcome && d !== "IGNORED") {
      const have = new Set(lines.map((l) => l.sku));
      const add = outcome.products.filter((s) => !have.has(s));
      setLines((ls) => [...ls, ...add.map((sku, i) => ({ id: `L${ls.length + i + 1}`, clientRequestId: `R${ls.length + i + 1}`, sku, qty }))]);
    }
    setStep(2);
    if (d === "ACCEPTED") toast.success("Recommendation accepted", { description: `${outcome?.products.length ?? 0} products added at ${qty.toLocaleString("en-GB")} each. Change them on the next step.` });
  };

  /* ---------- Step 4: save / submit ---------- */
  const need = useMemo(() => (customer && lines.length ? approvalNeed(draft) : null), [customer, lines.length, draft]);
  const blocked = need?.priced.blocked ?? false;

  const save = (mode: "draft" | "submit") => {
    if (mode === "submit" && blocked) {
      setError({ errorClass: "BUSINESS_RULE", code: "GUARDRAIL_HARD_BLOCK", message: "A line is outside a hard-block guardrail (for example below the price floor). Raise the price on that line — it can't be submitted for approval.", field: "lines" });
      return;
    }
    setSaving(mode);
    window.setTimeout(() => {
      if (mode === "draft") {
        saveQuote(draft);
        toast.success(`Quote ${draft.id} saved as draft`, { description: `Linked to ${oppId || "no opportunity"} · ${accountId}.` });
      } else {
        const res = submitQuote(draft, user.id, comment.trim() || undefined);
        if (res.autoApproved) toast.success(`Quote ${draft.id} approved`, { description: "Inside policy, so no approval was needed. You can generate the document now." });
        else
          toast.success(`Quote ${draft.id} submitted for approval`, {
            description: `${res.task?.id} assigned to ${res.task?.steps[0].approvers.map((a) => userName(a.userId)).join(" and ")}. They have been notified by email and Teams.`,
          });
      }
      setSaving("");
      navigate({ to: "/pricing/quotes/$id", params: { id: draft.id } });
    }, 400);
  };

  return (
    <>
      <DetailTitle
        title="Create quote"
        subtitle="Prices, discounts and guardrails are calculated live as you build the quote."
        unsaved={dirty}
        actions={
          <Btn variant="subtle" onClick={() => (dirty ? setLeaving(true) : navigate({ to: "/pricing/quotes" }))}>
            Cancel
          </Btn>
        }
      />
      {fromCrm && (
        <InfoBanner tone="success" title={`Opened from Salesforce opportunity ${fromCrm.id}`}>
          Account and opportunity are filled in from the CRM. You're signed in through single sign-on — no second login needed.
        </InfoBanner>
      )}
      {search.opportunity && !fromCrm && (
        <InfoBanner tone="warning" title="Opportunity not found">
          The CRM passed “{search.opportunity}”, which doesn't exist. Pick the opportunity below.
        </InfoBanner>
      )}
      <Stepper steps={STEPS} current={step} />
      <ErrorBanner error={error} onClose={() => setError(null)} note={error?.code === "PARTIAL_SUCCESS" ? "The priced lines are kept." : undefined} />

      {step === 0 && (
        <form onSubmit={next} noValidate>
          <Card title="Customer & opportunity" subtitle="The quote stays linked to the CRM opportunity and account.">
            <p className="text-xs text-muted-foreground mb-4">
              <span className="text-destructive" aria-hidden>*</span> Required
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <Field label="CRM opportunity" hint="Optional — picking one fills in the account.">
                <select className={inputCls} value={oppId} onChange={(e) => pickOpp(e.target.value)}>
                  <option value="">No opportunity</option>
                  {CRM_OPPORTUNITIES.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.id} · {o.name} ({o.stage})
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="CRM account" required error={fe("crmAccountId") ?? fe("customerId")}>
                <select
                  className={inputCls}
                  value={accountId}
                  onChange={(e) => {
                    setAccountId(e.target.value);
                    const c = customerById(CRM_ACCOUNTS[e.target.value]);
                    if (c) setChannel(c.channel);
                  }}
                >
                  <option value="">Select…</option>
                  {Object.entries(CRM_ACCOUNTS).map(([acc, cid]) => {
                    const c = customerById(cid);
                    return (
                      <option key={acc} value={acc}>
                        {acc} · {c?.name ?? cid}
                        {c?.status === "BLOCKED" ? " (blocked)" : ""}
                      </option>
                    );
                  })}
                </select>
              </Field>
              <Field label="Quote name" required error={fe("name")}>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Q4 lighting refresh" />
              </Field>
              <Field label="Channel" hint="Drives channel prices and volume tiers.">
                <select className={inputCls} value={channel} onChange={(e) => setChannel(e.target.value)}>
                  {CHANNELS.filter((c) => c !== "Partner").map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Pricing date" hint="Rules and guardrails effective on this date apply.">
                <input type="date" className={inputCls} value={pricingDate} min={TODAY_ISO} onChange={(e) => setPricingDate(e.target.value || TODAY_ISO)} />
              </Field>
              <Field label="Valid until" required error={fe("validUntil")}>
                <input type="date" className={inputCls} value={validUntil} min={pricingDate} onChange={(e) => setValidUntil(e.target.value)} />
              </Field>
              <Field label="Payment terms">
                <select className={inputCls} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)}>
                  {PAYMENT_TERMS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <Field label="Incoterms">
                <select className={inputCls} value={incoterms} onChange={(e) => setIncoterms(e.target.value)}>
                  {INCOTERMS.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
            </div>
            {customer && (
              <div className="mt-6 border-t border-border pt-2">
                <DetailGrid
                  items={[
                    { label: "Customer", value: `${customer.name} (${customer.id})` },
                    { label: "Segment · tier", value: `${customer.segment} · ${customer.tier}` },
                    { label: "Geography", value: customer.geography },
                    { label: "Status", value: customer.status === "BLOCKED" ? <Flag tone="danger">Blocked — quoting not allowed</Flag> : <Flag tone="success">Active</Flag> },
                  ]}
                />
              </div>
            )}
          </Card>
          <WizardFooter onBack={undefined} nextLabel="Next" missing={missingContext} />
        </form>
      )}

      {step === 1 && (
        <form onSubmit={next} noValidate>
          <Card
            title={
              <span className="inline-flex items-center gap-2">
                <Compass className="size-5 text-brand" aria-hidden /> Guided selling
              </span>
            }
            subtitle={flow ? `${flow.name} · v${flow.version}. Answers are stored on the quote for audit.` : "No active guided-selling flow."}
          >
            {!flow ? (
              <p className="text-sm text-muted-foreground">No flow is active on {pricingDate}. Skip to add lines yourself.</p>
            ) : (
              <div className="grid lg:grid-cols-2 gap-8">
                <div className="space-y-5">
                  {visibleQuestions(flow, answers).map((q) => (
                    <fieldset key={q.id}>
                      <legend className="text-sm font-medium mb-2">
                        {q.text}
                        {q.required && <span className="text-destructive ml-0.5" aria-hidden>*</span>}
                        {q.showIf && <span className="ml-2 text-xs text-muted-foreground font-normal">(shown because of {q.showIf.questionId})</span>}
                      </legend>
                      {q.kind === "NUMBER" ? (
                        <div className="flex items-center gap-2 max-w-xs">
                          <input type="number" min={1} inputMode="numeric" className={inputCls} aria-label={q.text} value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} placeholder="e.g. 150" />
                          <span className="text-sm text-muted-foreground">{q.unit}</span>
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {q.options.map((o) => {
                            const vals = (answers[q.id] ?? "").split(",").filter(Boolean);
                            const on = vals.includes(o.value);
                            const toggle = () => setAnswers({ ...answers, [q.id]: q.kind === "SINGLE" ? o.value : (on ? vals.filter((v) => v !== o.value) : [...vals, o.value]).join(",") });
                            return (
                              <label key={o.value} className={`inline-flex items-center gap-2 h-10 px-4 rounded-full border text-sm cursor-pointer focus-within:ring-2 focus-within:ring-brand/40 ${on ? "bg-navy text-navy-foreground border-navy" : "bg-card border-border"}`}>
                                <input type={q.kind === "SINGLE" ? "radio" : "checkbox"} name={q.id} className="sr-only" checked={on} onChange={toggle} />
                                {o.label}
                              </label>
                            );
                          })}
                        </div>
                      )}
                    </fieldset>
                  ))}
                </div>
                <div>
                  <h3 className="font-semibold mb-2">Recommendation</h3>
                  {outcome ? (
                    <div className="rounded-xl border border-border p-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{outcome.label}</span>
                        <Tag tone="brand">Price tier: {outcome.tier}</Tag>
                      </div>
                      <p className="text-sm text-muted-foreground">{outcome.note}</p>
                      {!customer ? (
                        <p className="text-sm">Pick a customer to see price ranges.</p>
                      ) : (
                        <DataTable
                          caption="Recommended products and price range"
                          numbered={false}
                          rows={ranges}
                          rowKey={(r) => r.sku}
                          columns={[
                            { key: "p", header: "Product", cell: (r) => <span className="whitespace-nowrap">{r.sku} · {r.name}</span> },
                            { key: "min", header: "Min", align: "right", cell: (r) => <Secure field="priceFloor">{money(r.min)}</Secure> },
                            { key: "rec", header: "Recommended", align: "right", cell: (r) => <b className="tabular-nums">{money(r.recommended)}</b> },
                            { key: "max", header: "Max", align: "right", cell: (r) => money(r.max) },
                          ]}
                        />
                      )}
                      <p className="text-xs text-muted-foreground">Ranges come from guardrails and segment guidance for this customer at {qty.toLocaleString("en-GB")} units, not from the flow author.</p>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Answer the questions to get a recommendation.</p>
                  )}
                </div>
              </div>
            )}
          </Card>
          <div className="flex flex-wrap justify-between gap-2 mt-6">
            <Btn variant="subtle" icon={ArrowLeft} onClick={() => setStep(0)}>
              Back
            </Btn>
            <div className="flex flex-wrap items-center gap-2">
              {outcome && <MissingHint id={answersHintId} missing={missingAnswers} />}
              <Btn variant="ghost" onClick={() => acceptRecommendation("IGNORED")}>
                Skip — add lines myself
              </Btn>
              {outcome && (
                <>
                  <Btn variant="outline" onClick={() => acceptRecommendation("CHANGED")} disabled={missingAnswers.length > 0} aria-describedby={missingAnswers.length ? answersHintId : undefined}>
                    Change products
                  </Btn>
                  <Btn icon={CheckCircle2} onClick={() => acceptRecommendation("ACCEPTED")} disabled={missingAnswers.length > 0} aria-describedby={missingAnswers.length ? answersHintId : undefined}>
                    Accept recommendation
                  </Btn>
                </>
              )}
            </div>
          </div>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={next} noValidate className="space-y-4">
          {belowRange.length > 0 && (
            <InfoBanner tone="warning" title="Below the recommended price range" className="">
              {belowRange.map((r) => `${r.sku} at ${money(r.netPrice)} (minimum ${money(ranges.find((x) => x.sku === r.sku)!.min)})`).join("; ")}. You can continue, but approval may be needed.
            </InfoBanner>
          )}
          <QuoteLinesTable quote={draft} editable onChange={setLines} />
          <WizardFooter onBack={() => setStep(1)} nextLabel="Review" missing={missingLines} />
        </form>
      )}

      {step === 3 && need && (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-4">
            <Summary label="Net value" value={money(need.priced.totals.net)} />
            <Summary label="Discount off list" value={pct(-need.priced.totals.discountPct)} />
            <Summary label="Margin" value={<Secure field="marginPct" band={pctBand(need.priced.totals.marginPct)}>{need.priced.totals.marginPct.toFixed(1)}%</Secure>} />
            <Summary label="Lines" value={String(lines.length)} />
          </div>
          {blocked ? (
            <InfoBanner tone="danger" title="Can't be submitted" className="">
              A line breaks a hard-block guardrail. Go back and raise the price; you can still save the quote as a draft.
            </InfoBanner>
          ) : need.required ? (
            <InfoBanner tone="info" title="This quote needs approval" className="">
              Routed by {need.resolved.matched.map((r) => `${r.id} ${r.name}`).join("; ") || "guardrail"}:{" "}
              {need.resolved.steps.map((s) => `Level ${s.level} — ${s.approverIds.map((id) => userName(id)).join(s.parallelRule === "ANY" ? " or " : " and ")}`).join(" → ") || "your manager"}.
              {need.priced.reasons.length > 0 && <> Reasons: {need.priced.reasons.map((r) => humanize(r)).join(", ")}.</>}
            </InfoBanner>
          ) : (
            <InfoBanner tone="success" title="Inside policy" className="">
              No approval is needed — submitting approves the quote straight away.
            </InfoBanner>
          )}
          <QuoteLinesTable quote={draft} editable={false} />
          {need.required && !blocked && (
            <Field label="Note for the approver" hint="Optional — why this price is needed.">
              <textarea className={`${inputCls} h-24 py-2`} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Competitor quoting £26.50 delivered" />
            </Field>
          )}
          <div className="flex flex-wrap justify-between gap-2 pt-2">
            <Btn variant="subtle" icon={ArrowLeft} onClick={() => setStep(2)} disabled={!!saving}>
              Back
            </Btn>
            <div className="flex flex-wrap gap-2">
              <Btn variant="outline" loading={saving === "draft"} disabled={!!saving} onClick={() => save("draft")}>
                Save draft
              </Btn>
              <Btn icon={Send} loading={saving === "submit"} disabled={!!saving || blocked} onClick={() => save("submit")} title={blocked ? "A line is hard-blocked by a guardrail" : undefined}>
                {need.required ? "Submit for approval" : "Submit quote"}
              </Btn>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={leaving}
        title="Discard this quote?"
        description="The customer, answers and lines you entered will be lost. Save it as a draft on the last step if you want to keep it."
        confirmLabel="Discard quote"
        tone="danger"
        onCancel={() => setLeaving(false)}
        onConfirm={() => navigate({ to: "/pricing/quotes" })}
      />
    </>
  );
}

function WizardFooter({ onBack, nextLabel, missing = [] }: { onBack?: () => void; nextLabel: string; missing?: string[] }) {
  const hintId = useId();
  return (
    <div className="flex flex-wrap justify-between gap-2 mt-6">
      {onBack ? (
        <Btn variant="subtle" icon={ArrowLeft} onClick={onBack}>
          Back
        </Btn>
      ) : (
        <span />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <MissingHint id={hintId} missing={missing} />
        <Btn type="submit" disabled={missing.length > 0} aria-describedby={missing.length ? hintId : undefined}>
          {nextLabel}
          <ArrowRight className="size-4" aria-hidden />
        </Btn>
      </div>
    </div>
  );
}

function Summary({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-4">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
    </div>
  );
}
