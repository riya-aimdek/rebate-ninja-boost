import { useMemo } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Btn, Flag, inputCls, money, pct } from "@/components/pricing/kit";
import { Secure, pctBand } from "@/components/pricing/access";
import { PRODUCTS } from "@/lib/pricing/data";
import { priceBatch, type LineResult, type PricedLine, type Quote, type QuoteLineInput } from "@/lib/pricing/deals";
import { requiredApproverFor } from "@/lib/pricing/cpq";
import { useSession } from "@/lib/pricing/session";

/** Prices the lines of a (draft) quote on every render and times it (US-CQ-02 AC#1, NFR-01 < 3 s). */
export function useLivePricing(quote: Pick<Quote, "customerId" | "channel" | "pricingDate" | "lines">) {
  return useMemo(() => {
    const t0 = typeof performance !== "undefined" ? performance.now() : 0;
    const batch = priceBatch({ customerId: quote.customerId, channel: quote.channel, pricingDate: quote.pricingDate }, quote.lines);
    const ms = typeof performance !== "undefined" ? Math.max(1, Math.round(performance.now() - t0)) : 1;
    return { ...batch, ms };
  }, [quote.customerId, quote.channel, quote.pricingDate, quote.lines]);
}

const numOrUndef = (s: string) => (s.trim() === "" ? undefined : Number(s));

/** Guardrail outcome for one line — text + icon, never colour alone. */
export function GuardrailCell({ quote, r }: { quote: Quote; r: LineResult }) {
  if (!r.ok)
    return (
      <div className="space-y-1 min-w-48">
        <Flag tone="danger">{r.error.code}</Flag>
        <p className="text-xs text-muted-foreground">{r.error.message}</p>
      </div>
    );
  const g = r.guardrail;
  const approver = requiredApproverFor(quote, r);
  const limits = [
    g.floor !== undefined && (
      <Secure key="f" field="priceFloor">
        Floor {money(g.floor)}
      </Secure>
    ),
    g.minMarginPct !== undefined && <span key="m">Min margin {g.minMarginPct}%</span>,
    g.maxDiscountNoApprovalPct !== undefined && <span key="d">Up to {g.maxDiscountNoApprovalPct}% without approval</span>,
  ].filter(Boolean);
  return (
    <div className="space-y-1 min-w-52">
      {g.blocked ? (
        <Flag tone="danger">Blocked — can't be submitted</Flag>
      ) : g.approvalRequired ? (
        <Flag tone="info">Approval required{approver ? `: ${approver}` : ""}</Flag>
      ) : g.outcome === "WARN" && g.reasons.length ? (
        <Flag tone="warning">Warning — allowed</Flag>
      ) : (
        <Flag tone="success">Within band</Flag>
      )}
      {g.reasons.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {g.reasons.map((x) => (
            <code key={x} className="text-[11px] px-1 rounded bg-muted">
              {x}
            </code>
          ))}
        </div>
      )}
      {g.reasons.includes("BELOW_MIN_MARGIN") && (
        <p className="text-xs text-muted-foreground">
          Actual margin{" "}
          <Secure field="marginPct" band={pctBand(r.marginPct)}>
            <b className="text-foreground">{r.marginPct.toFixed(1)}%</b>
          </Secure>{" "}
          vs limit {g.minMarginPct}%
        </p>
      )}
      {limits.length > 0 && (
        <p className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
          {g.guardrailId && <span>{g.guardrailId}:</span>}
          {limits}
        </p>
      )}
      {r.warnings.map((w) => (
        <p key={w} className="text-xs text-warning-foreground">
          {w}
        </p>
      ))}
    </div>
  );
}

/**
 * Quote lines with live price, discount, rule, guardrail status and — for permitted roles only — cost and margin.
 * Editable in drafts; read-only otherwise.
 */
export function QuoteLinesTable({ quote, editable, onChange }: { quote: Quote; editable: boolean; onChange?: (lines: QuoteLineInput[]) => void }) {
  const { sees, access } = useSession();
  const showMargin = access("marginPct") !== "HIDE";
  const live = useLivePricing(quote);
  const showCost = sees("costPrice");
  const setLine = (i: number, patch: Partial<QuoteLineInput>) => onChange?.(quote.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const nextId = () => `L${Math.max(0, ...quote.lines.map((l) => Number(l.id.slice(1)) || 0)) + 1}`;
  const ok = live.results.filter((r): r is PricedLine => r.ok);
  const net = ok.reduce((a, r) => a + r.extended, 0);
  const list = ok.reduce((a, r) => a + r.listPrice * r.qty, 0);
  const cost = ok.reduce((a, r) => a + r.cost * r.qty, 0);
  const margin = net ? ((net - cost) / net) * 100 : 0;

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <datalist id="quote-skus">
        {PRODUCTS.map((p) => (
          <option key={p.sku} value={p.sku}>
            {p.name}
          </option>
        ))}
      </datalist>
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-border text-sm" role="status" aria-live="polite">
        <span className="text-muted-foreground">
          Priced {quote.lines.length} {quote.lines.length === 1 ? "line" : "lines"} in <b className="text-foreground tabular-nums">{live.ms} ms</b> · pricing date {quote.pricingDate}
        </span>
        {live.status === "PARTIAL_SUCCESS" && <Flag tone="warning">Partial success — {live.failed} of {quote.lines.length} lines failed</Flag>}
        {live.status === "FAILED" && quote.lines.length > 0 && <Flag tone="danger">No lines could be priced</Flag>}
      </div>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Quote lines">
        <table className="w-full text-sm" style={{ minWidth: editable ? 1200 : 1000 }}>
          <caption className="sr-only">Quote lines with real-time pricing</caption>
          <thead>
            <tr className="bg-navy text-navy-foreground">
              <th scope="col" className="px-3 py-3 text-left font-semibold">Product</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Qty</th>
              {editable && <th scope="col" className="px-3 py-3 text-right font-semibold">Requested price (£)</th>}
              {editable && <th scope="col" className="px-3 py-3 text-right font-semibold">Requested discount (%)</th>}
              <th scope="col" className="px-3 py-3 text-right font-semibold">List</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Net</th>
              <th scope="col" className="px-3 py-3 text-right font-semibold">Discount</th>
              <th scope="col" className="px-3 py-3 text-left font-semibold">Winning rule</th>
              {showCost && <th scope="col" className="px-3 py-3 text-right font-semibold">Cost</th>}
              {showMargin && <th scope="col" className="px-3 py-3 text-right font-semibold">Margin</th>}
              <th scope="col" className="px-3 py-3 text-left font-semibold">Guardrail</th>
              {editable && (
                <th scope="col" className="px-3 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {quote.lines.length === 0 && (
              <tr>
                <td colSpan={12} className="px-4 py-10 text-center text-muted-foreground">
                  No lines yet. Add a product to see its price, discount and guardrail status.
                </td>
              </tr>
            )}
            {quote.lines.map((l, i) => {
              const r = live.results[i];
              const p = r?.ok ? r : undefined;
              return (
                <tr key={l.id} className={`align-top ${r && !r.ok ? "bg-danger-soft/40" : ""}`}>
                  <td className="px-3 py-3 min-w-44">
                    {editable ? (
                      <input
                        className={inputCls}
                        list="quote-skus"
                        aria-label={`Line ${i + 1} product SKU`}
                        aria-invalid={r && !r.ok && r.error.field === "sku" ? true : undefined}
                        value={l.sku}
                        onChange={(e) => setLine(i, { sku: e.target.value.trim().toUpperCase() })}
                        placeholder="e.g. LT-PNL-60"
                      />
                    ) : (
                      <span className="font-medium">{l.sku}</span>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      {p?.productName ?? "—"}
                      {l.clientRequestId && <span className="ml-1 font-mono">· {l.clientRequestId}</span>}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {editable ? (
                      <input type="number" min={1} step={1} inputMode="numeric" className={`${inputCls} w-24 text-right`} aria-label={`Line ${i + 1} quantity`} value={Number.isFinite(l.qty) ? l.qty : ""} onChange={(e) => setLine(i, { qty: e.target.value === "" ? NaN : Number(e.target.value) })} />
                    ) : (
                      <span className="tabular-nums">
                        {l.qty.toLocaleString("en-GB")} <span className="text-xs text-muted-foreground">{p?.uom}</span>
                      </span>
                    )}
                  </td>
                  {editable && (
                    <td className="px-3 py-3 text-right">
                      <input type="number" min={0} step="0.01" inputMode="decimal" className={`${inputCls} w-28 text-right`} aria-label={`Line ${i + 1} requested unit price`} aria-invalid={r && !r.ok && r.error.code === "REQUEST_CONFLICT" ? true : undefined} value={l.requestedUnitPrice ?? ""} placeholder="Engine" onChange={(e) => setLine(i, { requestedUnitPrice: numOrUndef(e.target.value) })} />
                    </td>
                  )}
                  {editable && (
                    <td className="px-3 py-3 text-right">
                      <input type="number" min={0} max={100} step="0.1" inputMode="decimal" className={`${inputCls} w-24 text-right`} aria-label={`Line ${i + 1} requested discount percent`} aria-invalid={r && !r.ok && r.error.code === "REQUEST_CONFLICT" ? true : undefined} value={l.requestedDiscountPct ?? ""} placeholder="—" onChange={(e) => setLine(i, { requestedDiscountPct: numOrUndef(e.target.value) })} />
                    </td>
                  )}
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{p ? money(p.listPrice) : "—"}</td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap font-semibold">
                    {p ? money(p.netPrice) : "—"}
                    {p && <div className="text-xs font-normal text-muted-foreground">GBP / {p.uom}</div>}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{p ? pct(-p.discountPct) : "—"}</td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    {p ? (
                      <>
                        <span>{p.winningRule}</span>
                        <div className="text-xs text-muted-foreground font-mono">{p.ruleRef}</div>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  {showCost && <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{p ? money(p.cost) : "—"}</td>}
                  {showMargin && <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">
                    {p ? (
                      <Secure field="marginPct" band={pctBand(p.marginPct)}>
                        {p.marginPct.toFixed(1)}%
                        {showCost && <div className="text-xs text-muted-foreground">{money(p.marginAmount)}</div>}
                      </Secure>
                    ) : (
                      "—"
                    )}
                  </td>}
                  <td className="px-3 py-3">{r ? <GuardrailCell quote={quote} r={r} /> : null}</td>
                  {editable && (
                    <td className="px-3 py-3 text-right">
                      <button type="button" onClick={() => onChange?.(quote.lines.filter((_, j) => j !== i))} aria-label={`Remove line ${i + 1} (${l.sku || "empty"})`} className="size-10 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-danger-soft">
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
          {ok.length > 0 && (
            <tfoot className="bg-muted/50 font-semibold">
              <tr>
                <td className="px-3 py-3" colSpan={editable ? 4 : 2}>
                  Total ({ok.length} priced {ok.length === 1 ? "line" : "lines"})
                </td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{money(list)}</td>
                <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{money(net)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{pct(-(list ? ((list - net) / list) * 100 : 0))}</td>
                <td />
                {showCost && <td className="px-3 py-3 text-right tabular-nums whitespace-nowrap">{money(cost)}</td>}
                {showMargin && (
                  <td className="px-3 py-3 text-right tabular-nums">
                    <Secure field="marginPct" band={pctBand(margin)}>
                      {margin.toFixed(1)}%
                    </Secure>
                  </td>
                )}
                <td colSpan={editable ? 2 : 1} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {editable && (
        <div className="px-4 py-3 border-t border-border flex flex-wrap items-center gap-3">
          <Btn variant="outline" size="sm" icon={Plus} onClick={() => onChange?.([...quote.lines, { id: nextId(), clientRequestId: `R${quote.lines.length + 1}`, sku: "", qty: 1 }])}>
            Add line
          </Btn>
          <span className="text-xs text-muted-foreground">Enter a requested price <i>or</i> a requested discount, not both. Leave both blank to use the engine price.</span>
        </div>
      )}
    </div>
  );
}
