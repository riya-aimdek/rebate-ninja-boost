import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, ChevronRight, ClipboardCheck, Database, Repeat, Sparkles, type LucideIcon } from "lucide-react";
import { Card, DataAsOf, DetailTitle, EmptyState, FilterPills, PricingLayout, StatusPill, humanize, type Tone } from "@/components/pricing/kit";
import { DQ_LOG, LIST_TYPES, PRICE_LISTS, PROPOSALS, RECOMMENDATIONS } from "@/lib/pricing/data";
import { TODAY, daysBetween, downloadCsv } from "@/lib/pricing/csv";

export const Route = createFileRoute("/pricing/")({
  head: () => ({ meta: [{ title: "Pricing dashboard · Rebate Ninja" }] }),
  component: Page,
});

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-12-31" -> "31 Dec 2026". String-based so server and client render the same text. */
function fmtDate(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** How far ahead the expiry card looks. FR-E-06 asks for contract-expiry alerts but sets no period; 90 days is a prototype default. */
const WINDOW_DAYS = 90;

/** Plain time ranges for the expiry filter (no urgency labels: none are defined in the docs). */
type Range = "lt30" | "30to60" | "60to90";
const RANGES: Record<Range, { label: string; text: string; test: (days: number) => boolean }> = {
  lt30: { label: "Under 30 days", text: "under 30 days", test: (d) => d < 30 },
  "30to60": { label: "30–60 days", text: "30–60 days", test: (d) => d >= 30 && d <= 60 },
  "60to90": { label: "60–90 days", text: "60–90 days", test: (d) => d > 60 && d <= WINDOW_DAYS },
};

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

function Page() {
  const count = (s: string) => PRICE_LISTS.filter((l) => l.status === s).length;

  const expiring = useMemo(
    () =>
      PRICE_LISTS.filter((l) => (l.status === "ACTIVE" || l.status === "SCHEDULED") && l.effectiveTo)
        .map((l) => {
          const days = daysBetween(TODAY, l.effectiveTo!);
          return { list: l, days };
        })
        .filter((x) => x.days >= 0 && x.days <= WINDOW_DAYS)
        .sort((a, b) => a.days - b.days),
    [],
  );

  const exportCsv = () =>
    downloadCsv(
      "price-lists.csv",
      PRICE_LISTS.map((l) => ({ id: l.id, name: l.name, type: l.type, status: l.status, version: l.version, currency: l.currency, from: l.effectiveFrom, to: l.effectiveTo ?? "open" })),
    );

  return (
    <PricingLayout crumbs={[{ label: "Pricing dashboard" }]}>
      <DetailTitle title="Pricing dashboard" subtitle="Price list portfolio, approvals and upcoming expiries at a glance." actions={<DataAsOf onExport={exportCsv} />} />

      {/* States and order follow the price list lifecycle in the user stories (US-PL, transitions table). */}
      <Lifecycle
        stages={[
          { key: "DRAFT", label: "Draft", value: count("DRAFT") },
          { key: "SUBMITTED", label: "Awaiting approval", value: count("SUBMITTED") },
          { key: "APPROVED", label: "Approved", value: count("APPROVED") },
          { key: "SCHEDULED", label: "Scheduled", value: count("SCHEDULED") },
          { key: "ACTIVE", label: "Active", value: count("ACTIVE"), primary: true },
        ]}
        ended={[
          { key: "SUPERSEDED", label: "Superseded", value: count("SUPERSEDED") },
          { key: "EXPIRED", label: "Expired", value: count("EXPIRED") },
          { key: "CANCELLED", label: "Cancelled", value: count("CANCELLED") },
        ]}
      />

      <div className="grid lg:grid-cols-3 gap-6 mb-6 [&>*]:min-w-0">
        <div className="lg:col-span-2">
          <AttentionQueue />
        </div>
        {/* Right card takes the left card's height on desktop instead of setting it. */}
        <div className="lg:relative">
          <div className="lg:absolute lg:inset-0">
            <TypeBreakdown />
          </div>
        </div>
      </div>

      <ExpiryTimeline items={expiring} />
    </PricingLayout>
  );
}

/* ------------------------------------------------------------------ */
/* 1. Lifecycle pipeline — the portfolio in one row                    */
/* ------------------------------------------------------------------ */

type Stage = { key: string; label: string; value: number; primary?: boolean };

function Lifecycle({ stages, ended }: { stages: Stage[]; ended: Stage[] }) {
  const sum = (xs: Stage[]) => xs.reduce((a, s) => a + s.value, 0);
  const inFlow = sum(stages);
  const done = sum(ended);
  return (
    <section aria-labelledby="lifecycle-h" className="bg-card border border-border rounded-xl shadow-sm mb-6">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-1 px-5 sm:px-6 pt-5 pb-4 border-b border-border">
        <div>
          <h2 id="lifecycle-h" className="text-lg font-semibold">
            Price list lifecycle
          </h2>
          <p className="text-sm text-muted-foreground">Every price list, by where it is from draft to end of life.</p>
        </div>
        <p className="text-sm text-muted-foreground tabular-nums">
          <span className="text-2xl font-bold text-foreground align-middle mr-1.5">{inFlow + done}</span>
          price lists
        </p>
      </header>

      <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,3fr)] gap-6 lg:gap-0 p-5 sm:p-6">
        <StageGroup title="In progress and live" count={inFlow} stages={stages} flow />
        <StageGroup title="Ended" count={done} stages={ended} className="lg:border-l lg:border-border lg:pl-6 lg:ml-6" />
      </div>
    </section>
  );
}

function StageGroup({ title, count, stages, flow = false, className = "" }: { title: string; count: number; stages: Stage[]; flow?: boolean; className?: string }) {
  const id = `stage-${title.replace(/\W+/g, "-").toLowerCase()}`;
  return (
    <div className={className}>
      <h3 id={id} className="text-sm font-medium text-muted-foreground mb-3">
        {title} <span className="tabular-nums">({count})</span>
      </h3>
      <ol
        aria-labelledby={id}
        className={`grid gap-3 ${flow ? "grid-cols-2 sm:grid-cols-5 sm:gap-6" : "grid-cols-3 sm:gap-6 lg:gap-3"}`}
      >
        {stages.map((s, i) => (
          <li key={s.key} className={`relative ${flow ? "last:col-span-2 sm:last:col-span-1" : ""}`}>
            <StageCard stage={s} compact={!flow} />
            {flow && i < stages.length - 1 && (
              // Direction of travel between stages, centred in the gap (one row from sm up).
              <ArrowRight className="hidden sm:block absolute top-1/2 -right-[19px] -translate-y-1/2 size-3.5 text-muted-foreground/60" aria-hidden />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function StageCard({ stage: s, compact }: { stage: Stage; compact: boolean }) {
  const empty = s.value === 0;
  const tone = s.primary
    ? "bg-navy text-navy-foreground border-navy hover:bg-navy/90"
    : compact
      ? "bg-muted/40 border-border hover:border-brand/50 hover:bg-brand-soft/40"
      : "bg-background border-border hover:border-brand/50 hover:bg-brand-soft/40";
  return (
    <Link
      to="/pricing/price-lists"
      search={{ status: s.key } as never}
      aria-label={`${s.label}: ${plural(s.value, "price list")}. View list`}
      className={`group flex h-full min-h-[88px] flex-col justify-between gap-2 rounded-lg border px-4 py-3 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${tone}`}
    >
      <span className={`text-sm font-medium leading-tight ${s.primary ? "text-navy-foreground/85" : "text-muted-foreground"}`}>{s.label}</span>
      <span className="flex items-end justify-between gap-2">
        <span className={`font-bold tabular-nums leading-none ${compact ? "text-2xl" : "text-3xl"} ${empty && !s.primary ? "text-muted-foreground/60" : ""}`}>{s.value}</span>
        <ChevronRight
          className={`size-4 shrink-0 transition group-hover:translate-x-0.5 ${s.primary ? "" : "text-brand opacity-60 group-hover:opacity-100"}`}
          aria-hidden
        />
      </span>
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* 2. Needs your attention — the work queue                            */
/* ------------------------------------------------------------------ */

type Task = {
  key: string;
  icon: LucideIcon;
  tone: Tone;
  count: number;
  title: string;
  detail: string;
  action: string;
  to: "/pricing/price-lists" | "/pricing/data-quality" | "/pricing/recommendations" | "/pricing/repricing";
  search?: { status: string };
};

function AttentionQueue() {
  const submitted = PRICE_LISTS.filter((l) => l.status === "SUBMITTED");
  const dq = DQ_LOG.filter((d) => d.status === "OPEN");
  const dqEntities = Array.from(new Set(dq.map((d) => d.entity.toLowerCase())));
  const proposals = PROPOSALS.filter((p) => p.status === "PENDING_APPROVAL");
  const recs = RECOMMENDATIONS.filter((r) => r.status === "OPEN");
  const nextRecExpiry = recs.map((r) => r.expiresAt).sort()[0];

  const tasks: Task[] = [
    {
      key: "approve",
      icon: ClipboardCheck,
      tone: "warning",
      count: submitted.length,
      title: `${plural(submitted.length, "price list")} awaiting approval`,
      detail: submitted.map((l) => `${l.name} v${l.version}`).join(", "),
      action: "Review",
      to: "/pricing/price-lists",
      search: { status: "SUBMITTED" },
    },
    {
      key: "dq",
      icon: Database,
      tone: "danger",
      count: dq.length,
      title: `${plural(dq.length, "open data quality issue")}`,
      detail: dqEntities.length ? `Rejected ${dqEntities.join(", ")} records from the last sync.` : "",
      action: "Resolve",
      to: "/pricing/data-quality",
    },
    {
      key: "repricing",
      icon: Repeat,
      tone: "warning",
      count: proposals.length,
      title: `${plural(proposals.length, "repricing proposal")} pending approval`,
      detail: `Triggered by cost changes on ${plural(new Set(proposals.map((p) => p.sku)).size, "SKU")}.`,
      action: "Review",
      to: "/pricing/repricing",
    },
    {
      key: "recs",
      icon: Sparkles,
      tone: "info",
      count: recs.length,
      title: `${plural(recs.length, "open recommendation")}`,
      detail: nextRecExpiry ? `Next one expires ${fmtDate(nextRecExpiry)}.` : "",
      action: "Review",
      to: "/pricing/recommendations",
    },
  ];
  const open = tasks.filter((t) => t.count > 0);
  const totalItems = open.reduce((a, t) => a + t.count, 0);

  return (
    <Card title="Needs your attention" subtitle={open.length ? `${plural(totalItems, "item")} across ${plural(open.length, "area")}` : undefined} padded={false}>
      {open.length === 0 ? (
        <div className="px-6 py-10 flex flex-col items-center text-center gap-2">
          <CheckCircle2 className="size-8 text-success" aria-hidden />
          <p className="font-semibold">You’re all caught up</p>
          <p className="text-sm text-muted-foreground">Nothing is waiting for approval, review or a fix.</p>
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {open.map((t) => (
            <li key={t.key}>
              <Link
                to={t.to}
                search={t.search as never}
                className="group flex items-center gap-4 px-5 sm:px-6 py-4 hover:bg-muted/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
              >
                <TaskIcon icon={t.icon} tone={t.tone} />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{t.title}</p>
                  {t.detail && <p className="text-sm text-muted-foreground truncate" title={t.detail}>{t.detail}</p>}
                </div>
                <span className="hidden sm:inline-flex items-center gap-1 text-sm font-semibold text-brand whitespace-nowrap group-hover:underline">
                  {t.action}
                  <ArrowRight className="size-4" aria-hidden />
                </span>
                <ChevronRight className="sm:hidden size-5 text-muted-foreground shrink-0" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const ICON_TONE: Partial<Record<Tone, string>> = {
  danger: "bg-danger-soft text-destructive",
  warning: "bg-warning-soft text-warning-foreground",
  info: "bg-info-soft text-info",
};

function TaskIcon({ icon: Icon, tone }: { icon: LucideIcon; tone: Tone }) {
  return (
    <span className={`size-10 shrink-0 rounded-lg grid place-items-center ${ICON_TONE[tone] ?? "bg-muted text-muted-foreground"}`}>
      <Icon className="size-5" aria-hidden />
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Price lists by type — ranked bar list (one series, one hue)      */
/* ------------------------------------------------------------------ */

function TypeBreakdown() {
  const rows = LIST_TYPES.map((t) => ({ type: t, value: PRICE_LISTS.filter((l) => l.type === t).length }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);
  const total = rows.reduce((a, r) => a + r.value, 0);
  const share = (v: number) => Math.round((v / Math.max(1, total)) * 100);
  const top = rows[0];

  return (
    <Card
      title="Price lists by type"
      subtitle={`${plural(total, "price list")} across ${plural(rows.length, "type")}`}
      actions={
        <Link to="/pricing/price-lists" className="inline-flex items-center gap-1 text-sm font-semibold text-brand hover:underline whitespace-nowrap">
          View all
          <ArrowRight className="size-4" aria-hidden />
        </Link>
      }
      padded={false}
      className="h-full flex flex-col overflow-hidden [&>div:last-child]:overflow-y-auto [&>div:last-child]:min-h-0"
    >
      {top && (
        <p className="px-6 pt-3 pb-1.5 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">{humanize(top.type)}</span> is the largest type:{" "}
          <span className="font-semibold text-foreground tabular-nums">
            {top.value} of {total}
          </span>{" "}
          lists.
        </p>
      )}
      <table className="w-full text-sm">
        <caption className="sr-only">Price lists by type, largest first</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Type</th>
            <th scope="col">Share of portfolio</th>
            <th scope="col">Price lists</th>
            <th scope="col">Share</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.type}>
              <td className="pl-6 pr-2 py-1.5 w-28 whitespace-nowrap">{humanize(r.type)}</td>
              <td className="px-2 py-1.5">
                {/* Bar length = share of the whole portfolio, so it reads the same as the % column. */}
                <span className="block h-1.5 rounded-full bg-muted overflow-hidden" aria-hidden>
                  <span className="block h-full rounded-full bg-navy/80" style={{ width: `${share(r.value)}%` }} />
                </span>
              </td>
              <td className="px-2 py-1.5 w-8 text-right font-semibold tabular-nums">{r.value}</td>
              <td className="pl-1 pr-6 py-1.5 w-14 text-right text-muted-foreground tabular-nums">{share(r.value)}%</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-border font-semibold">
            <td className="pl-6 pr-2 py-2.5" colSpan={2}>
              Total
            </td>
            <td className="px-2 py-2.5 text-right tabular-nums">{total}</td>
            <td className="pl-1 pr-6 py-2.5 text-right tabular-nums">100%</td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* 4. Expiry timeline — where each list sits on a 90-day scale         */
/* ------------------------------------------------------------------ */

function ExpiryTimeline({ items }: { items: Array<{ list: (typeof PRICE_LISTS)[number]; days: number }> }) {
  const [sel, setSel] = useState<Range[]>([]);
  const shown = sel.length ? items.filter((e) => RANGES[sel[0]].test(e.days)) : items;
  const n = (r: Range) => items.filter((e) => RANGES[r].test(e.days)).length;

  return (
    <Card
      title={`Expiring in the next ${WINDOW_DAYS} days`}
      subtitle="Active and scheduled price lists, soonest first"
      actions={
        <FilterPills<Range>
          label="Expires in"
          showLabel={false}
          multiple={false}
          selected={sel}
          onChange={setSel}
          className=""
          options={(Object.keys(RANGES) as Range[]).map((r) => ({ key: r, label: RANGES[r].label, count: n(r) }))}
        />
      }
      padded={false}
    >
      {shown.length === 0 ? (
        <div className="px-6 py-6">
          <EmptyState title={sel.length ? `No price lists expire in ${RANGES[sel[0]].text}` : `Nothing expires in the next ${WINDOW_DAYS} days`}>
            {sel.length ? "Choose another range or clear the filter." : "All active and scheduled price lists run beyond this period."}
          </EmptyState>
        </div>
      ) : (
        <>
          {/* Scale header, aligned with the bar column below (desktop). */}
          <div className="hidden md:grid grid-cols-[minmax(0,1.4fr)_9rem_minmax(0,1fr)_7rem] gap-6 px-6 pt-4 pb-2 text-xs text-muted-foreground">
            <span>Price list</span>
            <span>Expires</span>
            <span className="relative" aria-hidden>
              <span className="absolute left-0">Today</span>
              <span className="absolute right-0">{WINDOW_DAYS} days</span>
            </span>
            <span className="text-right">Days left</span>
          </div>
          <ul className="divide-y divide-border md:border-t md:border-border">
            {shown.map(({ list, days }) => (
              <li key={list.id}>
                <Link
                  to="/pricing/price-lists/$id"
                  params={{ id: list.id }}
                  className="group grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,1.4fr)_9rem_minmax(0,1fr)_7rem] items-center gap-x-6 gap-y-2 px-5 sm:px-6 py-4 hover:bg-muted/40 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                >
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-brand group-hover:underline">{list.name}</span>
                      <StatusPill status={list.status} />
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      {humanize(list.type)} · {list.currency} · v{list.version} · {list.id}
                    </span>
                  </span>

                  <span className="text-sm tabular-nums whitespace-nowrap md:order-none order-3">
                    <span className="md:hidden text-muted-foreground">Expires </span>
                    {fmtDate(list.effectiveTo!)}
                  </span>

                  <RunwayBar days={days} />

                  <span className="text-right row-start-1 col-start-2 md:row-auto md:col-auto whitespace-nowrap">
                    <span className="text-lg font-bold tabular-nums">{days}</span>
                    <span className="text-sm text-muted-foreground"> {days === 1 ? "day" : "days"}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Card>
  );
}

/** Time left before expiry: fill runs from today to the expiry date across the card's window. */
function RunwayBar({ days }: { days: number }) {
  const pos = Math.min(100, Math.max(0, (days / WINDOW_DAYS) * 100));
  return (
    <span className="relative col-span-2 md:col-span-1 order-4 md:order-none h-6 flex items-center" role="img" aria-label={`${plural(days, "day")} left of ${WINDOW_DAYS}`}>
      <span className="absolute inset-x-0 h-2 rounded-full bg-muted" aria-hidden />
      <span className="absolute left-0 h-2 rounded-full bg-navy/80" style={{ width: `${pos}%` }} aria-hidden />
    </span>
  );
}
