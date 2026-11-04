import { createFileRoute } from "@tanstack/react-router";
import { useId, useMemo, useState, type FormEvent } from "react";
import { Code2, FileText, Handshake, Plus, Search, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  DataTable,
  DetailGrid,
  Drawer,
  EmptyState,
  ErrorBanner,
  Field,
  Flag,
  InfoBanner,
  KpiTile,
  ListHeader,
  MissingHint,
  Modal,
  ProgressBar,
  StatusPill,
  PricingLayout,
  humanize,
  inputCls,
  missingFields,
  money,
  pct,
  type ApiError,
} from "@/components/pricing/kit";
import { RequireAccess } from "@/components/pricing/access";
import { PRODUCTS, customerById } from "@/lib/pricing/data";
import { NOW, QUOTES, TODAY_ISO, nextQuoteId, priceLine, priceQuote, pushNotification, saveQuote, taskById, type PricedLine, type Quote } from "@/lib/pricing/deals";
import { PARTNER_REBATES, effectiveStatus, submitQuote } from "@/lib/pricing/cpq";
import { PARTNER_TIERS, userById, useSession } from "@/lib/pricing/session";

export const Route = createFileRoute("/pricing/partner-portal")({
  head: () => ({ meta: [{ title: "Partner portal · Rebate Ninja" }] }),
  component: Page,
});

function Page() {
  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "CPQ & quoting" }, { label: "Partner portal" }]}>
      <RequireAccess roles={["CHANNEL_PARTNER", "PRICING_ADMIN", "SALES_MANAGER", "DEAL_DESK"]}>
        <Portal />
      </RequireAccess>
    </PricingLayout>
  );
}

const plusDays = (iso: string, d: number) => {
  const x = new Date(`${iso}T00:00:00Z`);
  x.setUTCDate(x.getUTCDate() + d);
  return x.toISOString().slice(0, 10);
};

/** What the portal API returns for a quote — field-level security strips cost, margin and internal data (US-CQ-05 AC#6). */
function partnerView(q: Quote) {
  const p = priceQuote(q);
  const task = taskById(q.approvalTaskId);
  return {
    id: q.id,
    name: q.name,
    status: effectiveStatus(q),
    validUntil: q.validUntil,
    currency: q.currency,
    lines: p.results.filter((r): r is PricedLine => r.ok).map((r) => ({ sku: r.sku, product: r.productName, quantity: r.qty, uom: r.uom, listPrice: r.listPrice, netPrice: r.netPrice, discountPct: r.discountPct })),
    total: p.totals.net,
    approval: task ? { status: task.status, waitingOn: task.steps.find((s) => s.level === task.currentLevel)?.approvers.map((a) => userById(a.userId)?.title ?? "Approver") } : null,
  };
}

function Portal() {
  const { user, role } = useSession();
  const isPartner = role === "CHANNEL_PARTNER";
  const [previewId, setPreviewId] = useState(Object.keys(PARTNER_TIERS)[0]);
  const pid = isPartner ? user.partnerId! : previewId;
  const partner = customerById(pid);
  const tier = PARTNER_TIERS[pid];
  const [version, setVersion] = useState(0);
  const quotes = useMemo(() => QUOTES.filter((q) => q.partnerId === pid).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)), [pid, version]);
  const [open, setOpen] = useState<Quote | null>(null);
  const [apiOpen, setApiOpen] = useState(false);
  const [lookup, setLookup] = useState("");
  const [lookupErr, setLookupErr] = useState<ApiError | null>(null);
  const [requesting, setRequesting] = useState(false);

  const openById = (e: FormEvent) => {
    e.preventDefault();
    const id = lookup.trim().toUpperCase();
    const q = QUOTES.find((x) => x.id === id);
    // Same answer whether the quote is another partner's or doesn't exist, so IDs can't be probed (US-CQ-05 AC#4).
    if (!q || q.partnerId !== pid) {
      setLookupErr({ errorClass: "AUTHORIZATION", code: "PERMISSION_DENIED", message: `You don't have access to quote ${id || "—"}, or it doesn't exist. Partners can only open their own quotes.`, correlationId: `c-${id.toLowerCase().replace(/\W/g, "")}7f` });
      return;
    }
    setLookupErr(null);
    setOpen(q);
  };

  const rebates = PARTNER_REBATES[pid] ?? [];
  const awaiting = quotes.filter((q) => effectiveStatus(q) === "PENDING_APPROVAL").length;

  return (
    <>
      <ListHeader
        title="Partner portal"
        eyebrow={partner?.name}
        count={quotes.length}
        noun="quote"
        subtitle={tier ? `${tier.tier} partner · up to ${tier.discountLimitPct}% discount without approval` : "No partner tier configured"}
        actions={
          <Btn icon={Plus} onClick={() => setRequesting(true)} disabled={!isPartner} title={isPartner ? undefined : "Only partner users can request quotes"}>
            Request quote
          </Btn>
        }
      />
      {isPartner ? (
        <InfoBanner tone="success" title="Signed in with corporate single sign-on and MFA">
          {user.name} · federated identity from {user.email.split("@")[1]}. You see only {partner?.name}'s quotes and rebate status.
        </InfoBanner>
      ) : (
        <InfoBanner title="Previewing the partner view" action={
          <select className={`${inputCls} w-auto`} aria-label="Partner to preview" value={previewId} onChange={(e) => (setPreviewId(e.target.value), setOpen(null))}>
            {Object.keys(PARTNER_TIERS).map((id) => (
              <option key={id} value={id}>
                {customerById(id)?.name}
              </option>
            ))}
          </select>
        }>
          You're seeing what a partner user sees. Requests can only be raised by partner users; approve them in the approval queue.
        </InfoBanner>
      )}

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-3 mb-6">
        <KpiTile label="Open quotes" value={quotes.filter((q) => ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT"].includes(effectiveStatus(q))).length} />
        <KpiTile label="Awaiting approval" value={awaiting} tone={awaiting ? "warning" : "success"} />
        <KpiTile label="Discount limit" value={`${tier?.discountLimitPct ?? 0}%`} tone="navy" hint="Above this, quotes route to approval and need a justification." />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <form onSubmit={openById} className="flex flex-wrap items-end gap-3">
            <Field label="Open quote by ID" className="flex-1 min-w-48">
              <input className={inputCls} value={lookup} onChange={(e) => setLookup(e.target.value)} placeholder="e.g. Q-10234" />
            </Field>
            <Btn type="submit" variant="outline" icon={Search}>
              Open
            </Btn>
          </form>
          <ErrorBanner error={lookupErr} onClose={() => setLookupErr(null)} note={false} />
          <DataTable<Quote>
            caption="Your quotes"
            rows={quotes}
            rowKey={(q) => q.id}
            onRowClick={setOpen}
            selectedKey={open?.id ?? null}
            empty={
              <EmptyState icon={FileText} title="No quotes yet" action={isPartner ? <Btn icon={Plus} onClick={() => setRequesting(true)}>Request quote</Btn> : undefined}>
                Request a quote to get your partner price. Inside your discount limit it's approved straight away.
              </EmptyState>
            }
            columns={[
              { key: "id", header: "Quote", cell: (q) => <span className="font-mono text-xs">{q.id}</span> },
              { key: "n", header: "Name", className: "min-w-48", cell: (q) => q.name },
              { key: "v", header: "Total", align: "right", cell: (q) => money(priceQuote(q).totals.net) },
              { key: "d", header: "Discount", align: "right", cell: (q) => pct(-priceQuote(q).totals.discountPct) },
              { key: "s", header: "Status", cell: (q) => <StatusPill status={effectiveStatus(q)} /> },
              { key: "u", header: "Updated", cell: (q) => <span className="tabular-nums whitespace-nowrap">{q.updatedAt}</span> },
            ]}
          />
        </div>
        <Card title="Rebate programs" subtitle="Read-only from Rebate Ninja">
          {rebates.length === 0 ? (
            <EmptyState icon={Handshake} title="No rebate programs">Ask your channel manager about available programs.</EmptyState>
          ) : (
            <ul className="space-y-5">
              {rebates.map((r) => (
                <li key={r.programId}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium">{r.name}</span>
                    <Flag tone={r.status === "ACHIEVED" ? "success" : r.status === "AT_RISK" ? "warning" : "info"}>{humanize(r.status)}</Flag>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {r.programId} · {r.period}
                  </p>
                  <div className="mt-2">
                    <ProgressBar value={(r.achieved / r.target) * 100} tone={r.status === "AT_RISK" ? "warning" : "success"} label={`${r.name} progress`} />
                  </div>
                  <p className="text-xs mt-1.5 tabular-nums">
                    {money(r.achieved, "GBP", 0)} of {money(r.target, "GBP", 0)} · accrued {money(r.accrued, "GBP", 0)}
                  </p>
                </li>
              ))}
              <li className="text-xs text-muted-foreground">As of {rebates[0].asOf}</li>
            </ul>
          )}
        </Card>
      </div>

      <Drawer
        open={!!open}
        onClose={() => (setOpen(null), setApiOpen(false))}
        size="md"
        title={open ? `${open.id} · ${open.name}` : ""}
        subtitle={open && <StatusPill status={effectiveStatus(open)} />}
        footer={
          <>
            <Btn variant="subtle" icon={Code2} onClick={() => setApiOpen((v) => !v)} aria-expanded={apiOpen}>
              {apiOpen ? "Hide API response" : "View API response"}
            </Btn>
            <Btn variant="subtle" onClick={() => setOpen(null)}>
              Close
            </Btn>
          </>
        }
      >
        {open &&
          (() => {
            const v = partnerView(open);
            return (
              <>
                {v.approval && v.approval.status === "PENDING" && (
                  <InfoBanner title="Waiting for approval" className="">
                    With: {v.approval.waitingOn?.join(", ")}. You'll get an email when it's decided.
                  </InfoBanner>
                )}
                <section className="bg-card border border-border rounded-xl px-5">
                  <DetailGrid
                    items={[
                      { label: "Total", value: money(v.total) },
                      { label: "Valid until", value: v.validUntil },
                      ...(open.justification ? [{ label: "Your justification", value: open.justification, full: true }] : []),
                    ]}
                  />
                </section>
                <DataTable
                  caption="Quote lines"
                  numbered={false}
                  rows={v.lines}
                  rowKey={(l) => l.sku}
                  columns={[
                    { key: "p", header: "Product", cell: (l) => `${l.sku} · ${l.product}` },
                    { key: "q", header: "Qty", align: "right", cell: (l) => `${l.quantity} ${l.uom}` },
                    { key: "n", header: "Your price", align: "right", cell: (l) => money(l.netPrice) },
                    { key: "d", header: "Discount", align: "right", cell: (l) => pct(-l.discountPct) },
                  ]}
                />
                {apiOpen && (
                  <div>
                    <h3 className="text-sm font-semibold mb-2">GET /partner/quotes/{v.id}</h3>
                    <pre className="text-xs bg-muted rounded-lg p-4 overflow-x-auto overflow-y-hidden">{JSON.stringify(v, null, 2)}</pre>
                    <p className="text-xs text-muted-foreground mt-2">No cost, margin, internal comments, competitor data or other partners' prices — removed by field-level security on the server.</p>
                  </div>
                )}
              </>
            );
          })()}
      </Drawer>

      {isPartner && tier && (
        <RequestModal
          open={requesting}
          onClose={() => setRequesting(false)}
          partnerId={pid}
          limit={tier.discountLimitPct}
          onDone={(q) => {
            setVersion((x) => x + 1);
            setRequesting(false);
            setOpen(q);
          }}
        />
      )}
    </>
  );
}

function RequestModal({ open, onClose, partnerId, limit, onDone }: { open: boolean; onClose: () => void; partnerId: string; limit: number; onDone: (q: Quote) => void }) {
  const { user } = useSession();
  const [sku, setSku] = useState("LT-PNL-60");
  const [qty, setQty] = useState("100");
  const [discount, setDiscount] = useState("");
  const [delivery, setDelivery] = useState("");
  const [justification, setJustification] = useState("");
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const d = discount.trim() === "" ? undefined : Number(discount);
  const over = d !== undefined && d > limit;
  const preview = priceLine({ customerId: partnerId, channel: "Partner", pricingDate: TODAY_ISO }, { sku, qty: Number(qty), requestedDiscountPct: d });
  const hintId = useId();
  // Justification becomes required once the discount is above the partner's limit.
  const missing = missingFields([
    ["Product", sku],
    ["Quantity", qty],
    ["Justification", justification, over],
  ]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!preview.ok) return setError({ errorClass: preview.error.errorClass === "CONFLICT" ? "CONFLICT" : "VALIDATION", code: preview.error.code, message: preview.error.message, field: preview.error.field });
    if (d !== undefined && (Number.isNaN(d) || d < 0 || d > 100)) return setError({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Enter a discount between 0 and 100%.", field: "requestedDiscount" });
    if (over && !justification.trim()) return setError({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: `${d}% is above your ${limit}% limit, so a justification is required.`, field: "justification" });
    if (preview.guardrail.blocked) return setError({ errorClass: "BUSINESS_RULE", code: "GUARDRAIL_HARD_BLOCK", message: "That price is below what we can offer. Lower the discount.", field: "requestedDiscount" });
    setError(null);
    setBusy(true);
    window.setTimeout(() => {
      const q: Quote = {
        id: nextQuoteId(),
        name: `${customerById(partnerId)?.name.split(" ")[0]} portal request — ${preview.productName}`,
        customerId: partnerId,
        partnerId,
        ownerId: user.id,
        channel: "Partner",
        currency: "GBP",
        pricingDate: TODAY_ISO,
        status: "DRAFT",
        revision: 1,
        lines: [{ id: "L1", sku, qty: Number(qty), requestedDiscountPct: d }],
        history: [],
        paymentTerms: "Net 30",
        incoterms: "DAP",
        shipTo: customerById(partnerId)?.name ?? "",
        requestedDelivery: delivery || undefined,
        validUntil: plusDays(TODAY_ISO, 30),
        createdAt: NOW,
        updatedAt: NOW,
        priceListVersion: "BL-001 v4",
        justification: justification.trim() || undefined,
        documents: [],
      };
      let saved: Quote;
      if (!over) {
        // Within the tier limit the portal auto-approves (US-CQ-05).
        saved = { ...q, status: "APPROVED", expectedMarginPct: priceQuote(q).totals.marginPct };
        saveQuote(saved);
        toast.success(`Quote ${q.id} approved`, { description: `Inside your ${limit}% limit, so it was approved straight away.` });
      } else {
        saved = submitQuote(q, user.id, q.justification).quote;
        toast.success(`Quote ${q.id} sent for approval`, { description: "It's above your discount limit. We've emailed you a confirmation and will email the decision." });
      }
      pushNotification({
        event: over ? "APPROVAL_REMINDER" : "DECISION_MADE",
        recipientId: user.id,
        at: NOW,
        title: over ? `${q.id} is awaiting approval` : `${q.id} approved`,
        body: over ? "Your request is above your discount limit and is with our sales team." : "Your partner quote was approved automatically.",
        link: { to: "/pricing/partner-portal" },
        deliveries: [
          { channel: "EMAIL", status: "DELIVERED", attempts: 1 },
          { channel: "IN_APP", status: "DELIVERED", attempts: 1 },
        ],
      });
      setBusy(false);
      setDiscount("");
      setJustification("");
      setTried(false);
      onDone(saved);
    }, 400);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      dismissible={!busy}
      title="Request quote"
      subtitle={`Your partner price is shown as you type. Up to ${limit}% off is approved straight away.`}
      footer={
        <>
          <MissingHint id={hintId} missing={missing} />
          <Btn variant="subtle" onClick={onClose} disabled={busy}>
            Cancel
          </Btn>
          <Btn type="submit" form="partner-quote" loading={busy} disabled={missing.length > 0} aria-describedby={missing.length ? hintId : undefined}>
            {over ? "Submit for approval" : "Request quote"}
          </Btn>
        </>
      }
    >
      <form id="partner-quote" onSubmit={submit} noValidate className="space-y-4">
        <ErrorBanner error={error} onClose={() => setError(null)} />
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Product" required>
            <select className={inputCls} value={sku} onChange={(e) => setSku(e.target.value)}>
              {PRODUCTS.filter((p) => p.lifecycleStatus !== "BLOCKED").map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.sku} · {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Quantity" required error={tried && !(Number(qty) > 0) ? "Enter a quantity of 1 or more." : undefined}>
            <input type="number" min={1} inputMode="numeric" className={inputCls} value={qty} onChange={(e) => setQty(e.target.value)} />
          </Field>
          <Field label="Requested discount (%)" hint={`Your limit is ${limit}%`}>
            <input type="number" min={0} max={100} step="0.5" inputMode="decimal" className={inputCls} value={discount} onChange={(e) => setDiscount(e.target.value)} placeholder="e.g. 10" />
          </Field>
          <Field label="Requested delivery">
            <input type="date" min={TODAY_ISO} className={inputCls} value={delivery} onChange={(e) => setDelivery(e.target.value)} />
          </Field>
          {over && (
            <Field label="Justification" required className="sm:col-span-2" error={tried && !justification.trim() ? "Say why you need more than your limit, e.g. a competitor quote." : undefined}>
              <textarea className={`${inputCls} h-24 py-2`} value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="e.g. VoltDirect is offering £27.49 on the same panel" />
            </Field>
          )}
        </div>
        <div className="rounded-lg border border-border p-4 text-sm" role="status" aria-live="polite">
          {preview.ok ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                Your price <b className="tabular-nums">{money(preview.netPrice)}</b> / {preview.uom} · total <b className="tabular-nums">{money(preview.extended)}</b> · {pct(-preview.discountPct)} off list
              </span>
              {over ? <Flag tone="info">Needs approval — above your {limit}% limit</Flag> : <Flag tone="success">Approved straight away</Flag>}
            </div>
          ) : (
            <span className="text-destructive">{preview.error.message}</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <ShieldCheck className="size-3.5" aria-hidden /> Signed in as {user.name}. Status changes are emailed to {user.email}.
        </p>
      </form>
    </Modal>
  );
}
