import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { BellRing, TrendingDown } from "lucide-react";
import { Btn, Card, DataTable, DetailTitle, EmptyState,  InfoBanner, KpiTile, PricingLayout, RecordLink, StatusPill, inputCls, notifySuccess, type Column, TableSection } from "@/components/pricing/kit";
import { RequireAccess, pctBand } from "@/components/pricing/access";
import { Freshness } from "@/components/pricing/analytics-ui";
import { NOTIFICATIONS, NOW, QUOTES, priceQuote, pushNotification, quoteById, type Quote } from "@/lib/pricing/deals";
import { customerName } from "@/lib/pricing/analytics";
import { USERS, useSession, userName, type User } from "@/lib/pricing/session";
import { downloadCsv } from "@/lib/pricing/csv";

export const Route = createFileRoute("/pricing/analytics/deal-profitability")({
  head: () => ({ meta: [{ title: "Deal profitability · Rebate Ninja" }] }),
  component: () => (
    <RequireAccess module="ANALYTICS">
      <Page />
    </RequireAccess>
  ),
});

/** Quotes a user may report on: reps their own, sales managers their team's, partners none, others all. */
function scopedQuotes(user: User): Quote[] {
  if (user.role === "SALES_REP") return QUOTES.filter((q) => q.ownerId === user.id);
  if (user.role === "SALES_MANAGER") {
    const team = new Set([user.id, ...USERS.filter((u) => u.managerId === user.id).map((u) => u.id)]);
    USERS.filter((u) => team.has(u.managerId ?? "")).forEach((u) => team.add(u.id));
    return QUOTES.filter((q) => team.has(q.ownerId) || q.partnerId);
  }
  if (user.role === "CHANNEL_PARTNER") return [];
  return QUOTES;
}

type Row = { quote: Quote; expected: number; actual?: number; variance?: number; current: number; breach: boolean; alerted: boolean };

function Page() {
  const { user, access } = useSession();
  const [threshold, setThreshold] = useState("2");
  const [tick, setTick] = useState(0);
  const t = Number(threshold);
  const thresholdError = threshold.trim() === "" || Number.isNaN(t) || t < 0.5 || t > 20 ? "Enter a threshold between 0.5 and 20 points." : undefined;
  const limit = thresholdError ? 2 : t;
  const marginAccess = access("marginPct");

  const rows: Row[] = useMemo(
    () =>
      scopedQuotes(user)
        .filter((q) => q.expectedMarginPct !== undefined)
        .map((q) => {
          const expected = q.expectedMarginPct!;
          const actual = q.actualMarginPct;
          const variance = actual === undefined ? undefined : Math.round((actual - expected) * 10) / 10;
          const alerted = NOTIFICATIONS.some((n) => n.event === "THRESHOLD_BREACH" && n.body.includes(q.id) || (n.event === "THRESHOLD_BREACH" && n.title.includes(q.id)));
          return { quote: q, expected, actual, variance, current: priceQuote(q).totals.marginPct, breach: variance !== undefined && variance < -limit, alerted };
        })
        .sort((a, b) => (a.variance ?? 99) - (b.variance ?? 99)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, limit, tick],
  );
  const renewals = scopedQuotes(user).filter((q) => q.renewalOf);
  const invoiced = rows.filter((r) => r.actual !== undefined);
  const breaches = rows.filter((r) => r.breach);
  const pending = breaches.filter((r) => !r.alerted);

  const fmt = (v: number | undefined) => (v === undefined ? "—" : marginAccess === "ROUND" ? pctBand(v) : `${v.toFixed(1)}%`);

  const sendAlerts = () => {
    for (const r of pending)
      pushNotification({
        event: "THRESHOLD_BREACH",
        recipientId: r.quote.ownerId,
        at: NOW,
        title: `Margin drift on ${r.quote.id} · ${customerName(r.quote.customerId)}`,
        body: `Expected ${r.expected.toFixed(1)}%, invoiced ${r.actual!.toFixed(1)}% — ${Math.abs(r.variance!).toFixed(1)} points below (threshold ${limit} points).`,
        link: { to: "/pricing/analytics/deal-profitability" },
        deliveries: [
          { channel: "EMAIL", status: "DELIVERED", attempts: 1 },
          { channel: "IN_APP", status: "DELIVERED", attempts: 1 },
        ],
      });
    setTick((x) => x + 1);
    notifySuccess(`${pending.length} threshold alert${pending.length === 1 ? "" : "s"} sent`, "Quote owners were notified by email and in-app.");
  };

  const exportCsv = () =>
    downloadCsv(
      "deal-profitability.csv",
      rows.map((r) => ({ quote: r.quote.id, customer: customerName(r.quote.customerId), owner: userName(r.quote.ownerId), status: r.quote.status, expectedMarginPct: fmt(r.expected), actualMarginPct: fmt(r.actual), variancePts: r.variance ?? "", breach: r.breach })),
    );

  if (marginAccess === "HIDE")
    return (
      <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Analytics & reporting" }, { label: "Deal profitability" }]}>
        <DetailTitle title="Deal profitability" subtitle="Expected versus actual margin at quote and renewal stage." />
        <Card>
          <EmptyState icon={TrendingDown} title="Margin is restricted for your role">
            Deal profitability compares margin percentages, which field-level security hides from {user.title.toLowerCase()}s. Your sales manager or the deal desk can share this view.
          </EmptyState>
        </Card>
      </PricingLayout>
    );

  const cols: Column<Row>[] = [
    { key: "q", header: "Quote", className: "whitespace-nowrap", cell: (r) => <RecordLink to="/pricing/quotes/$id" params={{ id: r.quote.id }}>{r.quote.id}</RecordLink> },
    { key: "c", header: "Customer", cell: (r) => <span className="whitespace-nowrap">{customerName(r.quote.customerId)}</span> },
    { key: "o", header: "Owner", cell: (r) => <span className="whitespace-nowrap">{userName(r.quote.ownerId)}</span> },
    { key: "s", header: "Status", cell: (r) => <StatusPill status={r.quote.status} /> },
    { key: "e", header: "Expected", align: "right", cell: (r) => <span className="tabular-nums">{fmt(r.expected)}</span> },
    { key: "a", header: "Actual", align: "right", cell: (r) => (r.actual === undefined ? <span className="text-muted-foreground">Awaiting invoices</span> : <span className="tabular-nums">{fmt(r.actual)}</span>) },
    {
      key: "v",
      header: "Variance",
      align: "right",
      className: "whitespace-nowrap",
      // One column: the drift, and under it whether it breached the threshold. Banded viewers see only the flag.
      cell: (r) =>
        r.variance === undefined ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="inline-flex flex-col items-end">
            {marginAccess !== "ROUND" && (
              <span className={`tabular-nums font-semibold ${r.breach ? "text-destructive" : ""}`}>
                {r.variance > 0 ? "+" : r.variance < 0 ? "−" : ""}
                {Math.abs(r.variance).toFixed(1)} pts
              </span>
            )}
            <span className={`text-xs ${r.breach ? "text-destructive" : "text-muted-foreground"}`}>
              {r.breach ? (r.alerted ? "Breach · owner notified" : "Breach · not notified") : "Within threshold"}
            </span>
          </span>
        ),
    },
  ];

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Analytics & reporting" }, { label: "Deal profitability" }]}>
      <DetailTitle
        title="Deal profitability"
        subtitle="Expected margin at approval against what was actually invoiced — spot margin erosion early."
        actions={
          <>
            <Freshness />
            <Btn variant="outline" onClick={exportCsv} disabled={rows.length === 0}>
              Export CSV
            </Btn>
          </>
        }
      />
      <InfoBanner title="Expected margin is a snapshot">
        It is captured when the quote is approved. Later cost changes don't rewrite it — the “Today” column shows what the same quote would earn at current cost. Actual margin comes from ERP billing plus Rebate Ninja accruals.
      </InfoBanner>

      <section aria-label="Profitability summary" className="grid gap-2 grid-cols-2 sm:grid-cols-[repeat(auto-fill,minmax(12rem,16rem))] mb-6">
        <KpiTile label="Approved quotes tracked" value={rows.length} tone="default" />
        <KpiTile label="Invoiced so far" value={invoiced.length} tone="default" />
        <KpiTile label="Margin drift alerts" value={breaches.length} tone={breaches.length ? "danger" : "success"} hint={`More than ${limit} points below expected`} />
      </section>

      <TableSection
        title="Expected vs actual margin"
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Alert when more than</span>
              <input type="number" min={0.5} max={20} step={0.5} inputMode="decimal" className={`${inputCls} w-20`} value={threshold} onChange={(e) => setThreshold(e.target.value)} aria-invalid={!!thresholdError || undefined} aria-describedby={thresholdError ? "dp-threshold-err" : undefined} />
              <span className="text-muted-foreground">pts below expected</span>
            </label>
            {thresholdError && (
              <p id="dp-threshold-err" className="basis-full text-sm text-destructive">
                {thresholdError}
              </p>
            )}
            <Btn icon={BellRing} onClick={sendAlerts} disabled={pending.length === 0 || !!thresholdError} title={pending.length === 0 ? "Every breach has already been notified" : undefined}>
              {pending.length ? `Notify ${pending.length} owner${pending.length === 1 ? "" : "s"}` : "All owners notified"}
            </Btn>
          </div>
        }
        className="mb-6"
      >
        <DataTable<Row>
          caption="Expected versus actual margin by quote"
          rows={rows}
          rowKey={(r) => r.quote.id}
          empty={<EmptyState icon={TrendingDown} title="No approved quotes yet">Quotes appear here once they are approved and their expected margin is captured.</EmptyState>}
          columns={[
            ...cols.slice(0, 5),
            ...(marginAccess === "SHOW" ? [{ key: "now", header: "Today", align: "right" as const, cell: (r: Row) => <span className="tabular-nums text-muted-foreground">{fmt(r.current)}</span> }] : []),
            ...cols.slice(5),
          ]}
        />
      </TableSection>

      <TableSection title="Renewals" subtitle="Start a renewal from what the prior term really earned.">
        <DataTable<Quote>
          caption="Renewal quotes"
          rows={renewals}
          rowKey={(q) => q.id}
          empty="No renewal quotes in your scope."
          columns={[
            { key: "q", header: "Renewal quote", cell: (q) => <RecordLink to="/pricing/quotes/$id" params={{ id: q.id }}>{q.id}</RecordLink> },
            { key: "c", header: "Customer", cell: (q) => customerName(q.customerId) },
            { key: "p", header: "Renews", cell: (q) => <span className="font-mono text-xs">{q.renewalOf}{quoteById(q.renewalOf!) ? "" : " (archived)"}</span> },
            { key: "r", header: "Prior-term realized", align: "right", cell: (q) => <span className="tabular-nums">{fmt(q.priorTermRealizedMarginPct)}</span> },
            { key: "n", header: "Proposed", align: "right", cell: (q) => <span className="tabular-nums">{fmt(q.expectedMarginPct ?? priceQuote(q).totals.marginPct)}</span> },
            {
              key: "d",
              header: "Difference",
              align: "right",
              cell: (q) => {
                const d = (q.expectedMarginPct ?? priceQuote(q).totals.marginPct) - (q.priorTermRealizedMarginPct ?? 0);
                return <span className="tabular-nums">{d >= 0 ? "+" : "−"}{Math.abs(d).toFixed(1)} pts</span>;
              },
            },
          ]}
        />
      </TableSection>
    </PricingLayout>
  );
}
