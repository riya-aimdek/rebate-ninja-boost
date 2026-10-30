import { createFileRoute } from "@tanstack/react-router";
import { useRef, useState, type FormEvent } from "react";
import { Check, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  FilterPills,
  Flag,
  InfoBanner,
  KpiTile,
  ListHeader,
  Modal,
  PillTabs,
  PricingLayout,
  Price,
  RecordLink,
  StatusPill,
  Tag,
  Toggle,
  humanize,
  inputCls,
  money,
  notifyUndo,
  pct,
  type Column,
} from "@/components/pricing/kit";
import {
  COMPETITOR_STRATEGIES,
  PROPOSALS,
  REPRICING_RULES,
  REPRICING_TRIGGERS,
  type Proposal,
  type RepricingRule,
} from "@/lib/pricing/data";

export const Route = createFileRoute("/pricing/repricing")({
  head: () => ({
    meta: [
      { title: "Automated repricing · Rebate Ninja" },
      {
        name: "description",
        content:
          "Cost, index and competitor events create capped price proposals within guardrails.",
      },
    ],
  }),
  component: RepricingPage,
});

type TabKey = "rules" | "proposals" | "events";
type EventRow = {
  at: string;
  eventId: string;
  trigger: string;
  sku: string;
  rule: string;
  outcome: string;
  tone: "success" | "warning" | "neutral" | "danger";
};

const EVENTS: EventRow[] = [
  {
    at: "2026-10-29 14:10",
    eventId: "EVT-79",
    trigger: "COST_CHANGE",
    sku: "A-100",
    rule: "RP-01",
    outcome: "suppressed by cooldown (24h; last proposal 2h ago)",
    tone: "warning",
  },
  {
    at: "2026-10-29 12:40",
    eventId: "EVT-77",
    trigger: "COST_CHANGE",
    sku: "A-100",
    rule: "RP-01",
    outcome: "Duplicate delivery ignored — EVT-77 already produced PCP-501 (no second proposal)",
    tone: "neutral",
  },
  {
    at: "2026-10-29 12:10",
    eventId: "EVT-77",
    trigger: "COST_CHANGE",
    sku: "A-100",
    rule: "RP-01",
    outcome: "Proposal PCP-501 created · capped at 8%",
    tone: "success",
  },
  {
    at: "2026-10-29 10:05",
    eventId: "EVT-83",
    trigger: "COMPETITOR_PRICE_CHANGE",
    sku: "LT-DWN-10",
    rule: "RP-03",
    outcome: "competitor data stale — price ignored, no change",
    tone: "neutral",
  },
  {
    at: "2026-10-29 09:42",
    eventId: "EVT-81",
    trigger: "COMPETITOR_PRICE_CHANGE",
    sku: "LT-PNL-60",
    rule: "RP-03",
    outcome: "Proposal PCP-503 created · capped by guardrail (22% margin floor)",
    tone: "success",
  },
  {
    at: "2026-10-29 07:15",
    eventId: "EVT-80",
    trigger: "COST_CHANGE",
    sku: "CB-6.0",
    rule: "RP-02",
    outcome: "Below minimum change threshold (0.3% < 0.5%) — no proposal",
    tone: "neutral",
  },
  {
    at: "2026-10-28 08:00",
    eventId: "EVT-74",
    trigger: "INDEX_CHANGE",
    sku: "CB-2.5",
    rule: "RP-02",
    outcome: "Proposal PCP-504 auto-approved (rule allows, inside policy)",
    tone: "success",
  },
];

const TAB_NOUN: Record<TabKey, string> = { rules: "rule", proposals: "proposal", events: "event" };

function RepricingPage() {
  const [tab, setTab] = useState<TabKey>("proposals");
  const [rules, setRules] = useState<RepricingRule[]>(REPRICING_RULES);
  const [proposals, setProposals] = useState<Proposal[]>(PROPOSALS);
  const [editing, setEditing] = useState<RepricingRule | "new" | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulk, setBulk] = useState<"approve" | "reject" | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [propStatus, setPropStatus] = useState<Proposal["status"][]>([]);

  const pending = proposals.filter((p) => p.status === "PENDING_APPROVAL").length;
  const q = search.trim().toLowerCase();
  const match = (...vals: Array<string | undefined>) =>
    !q || vals.some((v) => v?.toLowerCase().includes(q));
  const shownRules = rules.filter((r) => match(r.name, r.id, r.scope, r.trigger));
  const shownProposals = proposals.filter(
    (p) =>
      match(p.id, p.sku, p.eventId, p.ruleId, p.trigger) &&
      (propStatus.length === 0 || propStatus.includes(p.status)),
  );
  const shownEvents = EVENTS.filter((e) => match(e.eventId, e.sku, e.rule, e.trigger, e.outcome));
  const shownCount =
    tab === "rules"
      ? shownRules.length
      : tab === "proposals"
        ? shownProposals.length
        : shownEvents.length;
  const pendingShown = shownProposals.filter((p) => p.status === "PENDING_APPROVAL");
  const selectedPending = selected.filter((id) =>
    proposals.some((p) => p.id === id && p.status === "PENDING_APPROVAL"),
  );

  const setStatus = (ids: string[], status: Proposal["status"]) =>
    setProposals((ps) => ps.map((x) => (ids.includes(x.id) ? { ...x, status } : x)));

  // Single decision: reversible while the price sits in a draft → undo toast rather than a confirm dialog.
  const decide = (p: Proposal, approve: boolean) => {
    setStatus([p.id], approve ? "APPROVED" : "REJECTED");
    setSelected((s) => s.filter((id) => id !== p.id));
    notifyUndo(
      `${p.id} ${approve ? "approved" : "rejected"}`,
      () => setStatus([p.id], "PENDING_APPROVAL"),
      approve ? "Price lands in a draft version of the target list." : undefined,
    );
  };

  const runBulk = () => {
    if (!bulk) return;
    setBulkBusy(true);
    window.setTimeout(() => {
      const ids = selectedPending;
      setStatus(ids, bulk === "approve" ? "APPROVED" : "REJECTED");
      setSelected([]);
      setBulkBusy(false);
      setBulk(null);
      toast.success(`${ids.length} proposals ${bulk === "approve" ? "approved" : "rejected"}`, {
        description:
          bulk === "approve" ? "Prices land in draft versions of their target lists." : undefined,
      });
    }, 500);
  };

  const toggleSel = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const allPendingSelected =
    pendingShown.length > 0 && pendingShown.every((p) => selected.includes(p.id));

  const ruleCols: Column<RepricingRule>[] = [
    {
      key: "name",
      header: "Rule",
      cell: (r) => (
        <div>
          <div className="font-medium">{r.name}</div>
          <div className="text-xs text-muted-foreground font-mono whitespace-nowrap">{r.id}</div>
        </div>
      ),
    },
    {
      key: "trig",
      header: "Trigger",
      className: "whitespace-nowrap",
      cell: (r) => <Tag tone="info">{humanize(r.trigger)}</Tag>,
    },
    { key: "scope", header: "Scope", className: "min-w-48", cell: (r) => r.scope },
    {
      key: "strategy",
      header: "Strategy",
      cell: (r) =>
        r.competitorStrategy ? (
          <span>
            {humanize(r.competitorStrategy)}
            {r.undercutPct !== undefined && ` ${r.undercutPct}%`}
            {r.marginFloorPct !== undefined && (
              <span className="text-xs text-muted-foreground"> · floor {r.marginFloorPct}%</span>
            )}
          </span>
        ) : r.targetMarginPct !== undefined ? (
          `Maintain ${r.targetMarginPct}% margin`
        ) : (
          "Follow input"
        ),
    },
    {
      key: "thr",
      header: "Min change",
      align: "right",
      cell: (r) => <span className="tabular-nums">{r.minChangePct}%</span>,
    },
    {
      key: "caps",
      header: "Caps (↑ / ↓)",
      align: "right",
      cell: (r) => (
        <span className="tabular-nums">
          {r.maxIncreasePct}% / {r.maxDecreasePct}%
        </span>
      ),
    },
    {
      key: "cool",
      header: "Cooldown",
      align: "right",
      cell: (r) => <span className="tabular-nums">{r.cooldownHours}h</span>,
    },
    {
      key: "auto",
      header: "Auto-approve",
      className: "whitespace-nowrap",
      cell: (r) =>
        r.autoApprove ? <Tag tone="success">Inside policy</Tag> : <Tag>Approval matrix</Tag>,
    },
    { key: "status", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
    {
      key: "edit",
      header: <span className="sr-only">Actions</span>,
      cell: (r) => (
        <Btn
          variant="ghost"
          size="sm"
          icon={Pencil}
          onClick={() => setEditing(r)}
          aria-label={`Edit ${r.name}`}
        >
          Edit
        </Btn>
      ),
    },
  ];

  const propCols: Column<Proposal>[] = [
    {
      key: "sel",
      header: (
        <input
          type="checkbox"
          className="size-4"
          aria-label="Select all pending proposals"
          checked={allPendingSelected}
          disabled={pendingShown.length === 0}
          onChange={() => setSelected(allPendingSelected ? [] : pendingShown.map((p) => p.id))}
        />
      ),
      cell: (p) =>
        p.status === "PENDING_APPROVAL" ? (
          <input
            type="checkbox"
            className="size-4"
            aria-label={`Select ${p.id}`}
            checked={selected.includes(p.id)}
            onChange={() => toggleSel(p.id)}
          />
        ) : null,
    },
    {
      key: "sku",
      header: "SKU · proposal",
      className: "whitespace-nowrap",
      cell: (p) => (
        <div>
          <RecordLink to="/pricing/products/$id" params={{ id: p.sku }}>
            {p.sku}
          </RecordLink>
          <div className="font-mono text-xs text-muted-foreground">{p.id}</div>
        </div>
      ),
    },
    {
      key: "trig",
      header: "Trigger source",
      className: "min-w-44",
      cell: (p) => (
        <div className="text-xs">
          <div>{humanize(p.trigger)}</div>
          <div className="text-muted-foreground font-mono whitespace-nowrap">
            {p.eventId} · {p.ruleId}
          </div>
        </div>
      ),
    },
    {
      key: "prop",
      header: "Current → proposed",
      align: "right",
      cell: (p) => (
        <div>
          <span className="text-muted-foreground">{money(p.currentPrice)} → </span>
          <span className="font-semibold">
            <Price value={p.proposedPrice} />
          </span>
          <div className="text-xs text-muted-foreground tabular-nums">
            {pct(((p.proposedPrice - p.currentPrice) / p.currentPrice) * 100)}
            {p.uncappedPrice !== p.proposedPrice && <> · uncapped {money(p.uncappedPrice)}</>}
          </div>
        </div>
      ),
    },
    {
      key: "flags",
      header: "Flags",
      className: "min-w-40",
      cell: (p) => (
        <div className="flex flex-col gap-1 items-start">
          {p.flags.map((f) => (
            <Flag key={f} tone={f.toLowerCase().includes("stale") ? "neutral" : "warning"}>
              {f
                .replace("maxIncreasePct", "max increase")
                .replace("maxDecreasePct", "max decrease")}
            </Flag>
          ))}
          {p.note && <span className="text-xs text-muted-foreground">{p.note}</span>}
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (p) => <StatusPill status={p.status} /> },
    {
      key: "act",
      header: <span className="sr-only">Actions</span>,
      className: "whitespace-nowrap",
      cell: (p) =>
        p.status === "PENDING_APPROVAL" ? (
          <div className="flex gap-2">
            <Btn
              size="sm"
              variant="subtle"
              icon={X}
              onClick={() => decide(p, false)}
              aria-label={`Reject ${p.id}`}
            >
              Reject
            </Btn>
            <Btn
              size="sm"
              icon={Check}
              onClick={() => decide(p, true)}
              aria-label={`Approve ${p.id}`}
            >
              Approve
            </Btn>
          </div>
        ) : null,
    },
  ];

  const filteredEmpty = (noun: string) =>
    q ? (
      <EmptyState
        title={`No ${noun} match “${search}”`}
        action={
          <Btn variant="subtle" onClick={() => setSearch("")}>
            Clear search
          </Btn>
        }
      />
    ) : (
      <EmptyState title={`No ${noun} yet`} />
    );

  return (
    <PricingLayout
      crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Automated repricing" }]}
    >
      <ListHeader
        title="Automated repricing"
        count={shownCount}
        noun={TAB_NOUN[tab]}
        subtitle="Cost, index and competitor events create capped price proposals within guardrails."
        search={search}
        onSearch={setSearch}
        actions={
          <Btn icon={Plus} onClick={() => setEditing("new")}>
            Create rule
          </Btn>
        }
      />

      <div className="grid gap-4 grid-cols-2 xl:grid-cols-4 mb-6">
        <KpiTile label="Active rules" value={rules.filter((r) => r.status === "ACTIVE").length} />
        <KpiTile
          label="Pending proposals"
          value={pending}
          tone="warning"
          hint="Routed via approval matrix"
        />
        <KpiTile
          label="Capped proposals"
          value={
            proposals.filter((p) => p.flags.some((f) => f.toLowerCase().includes("capped"))).length
          }
          tone="info"
        />
        <KpiTile
          label="Suppressed proposals"
          value={proposals.filter((p) => p.status === "SUPPRESSED").length}
          tone="neutral"
          hint="Cooldown or stale data"
        />
      </div>

      <PillTabs
        tabs={[
          { key: "rules", label: "Rules", count: rules.length },
          { key: "proposals", label: "Proposals", count: proposals.length },
          { key: "events", label: "Event log", count: EVENTS.length },
        ]}
        active={tab}
        onChange={(k) => {
          setTab(k);
          setSelected([]);
        }}
      />

      {tab === "rules" && (
        <>
          <WorkedExample />
          <DataTable
            caption="Repricing rules"
            columns={ruleCols}
            rows={shownRules}
            rowKey={(r) => r.id}
            empty={filteredEmpty("rules")}
          />
        </>
      )}
      {tab === "proposals" && (
        <>
          <InfoBanner title="Price change proposals">
            One proposal per product. Caps (max increase / max decrease) apply first; guardrails
            always apply on top. Proposals enter the approval flow, or auto-approve only if the rule
            allows it and the change is inside policy.
          </InfoBanner>
          {selectedPending.length > 0 && (
            <div
              className="sticky top-20 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-brand/40 bg-brand-soft px-4 py-2 mb-4"
              role="region"
              aria-label="Bulk actions"
            >
              <span className="text-sm font-semibold">{selectedPending.length} selected</span>
              <Btn size="sm" variant="ghost" onClick={() => setSelected([])}>
                Clear
              </Btn>
              <div className="flex-1" />
              <Btn size="sm" variant="subtle" icon={X} onClick={() => setBulk("reject")}>
                Reject {selectedPending.length}
              </Btn>
              <Btn size="sm" icon={Check} onClick={() => setBulk("approve")}>
                Approve {selectedPending.length}
              </Btn>
            </div>
          )}
          <FilterPills<Proposal["status"]>
            label="Status"
            selected={propStatus}
            onChange={(next) => {
              setPropStatus(next);
              setSelected([]);
            }}
            options={(["PENDING_APPROVAL", "APPROVED", "REJECTED", "SUPPRESSED"] as const).map(
              (st) => ({
                key: st,
                label: humanize(st),
                count: proposals.filter((p) => p.status === st).length,
              }),
            )}
          />
          <DataTable
            caption="Price change proposals"
            columns={propCols}
            rows={shownProposals}
            rowKey={(p) => p.id}
            numbered={false}
            pageSize={25}
            empty={
              q || propStatus.length ? (
                <EmptyState
                  title={q ? `No proposals match “${search}”` : "No proposals match this status"}
                  action={
                    <Btn
                      variant="subtle"
                      onClick={() => {
                        setSearch("");
                        setPropStatus([]);
                      }}
                    >
                      Clear filters
                    </Btn>
                  }
                />
              ) : (
                <EmptyState title="No proposals yet">
                  Cost, index and competitor events create proposals when a rule applies.
                </EmptyState>
              )
            }
          />
        </>
      )}
      {tab === "events" && (
        <DataTable
          caption="Repricing event log"
          columns={[
            {
              key: "at",
              header: "Received",
              cell: (e: EventRow) => (
                <span className="text-muted-foreground tabular-nums whitespace-nowrap">{e.at}</span>
              ),
            },
            {
              key: "id",
              header: "Event ID",
              className: "whitespace-nowrap",
              cell: (e: EventRow) => <span className="font-mono text-xs">{e.eventId}</span>,
            },
            {
              key: "t",
              header: "Trigger",
              className: "whitespace-nowrap",
              cell: (e: EventRow) => <Tag tone="info">{humanize(e.trigger)}</Tag>,
            },
            {
              key: "sku",
              header: "SKU",
              className: "whitespace-nowrap",
              cell: (e: EventRow) => (
                <RecordLink to="/pricing/products/$id" params={{ id: e.sku }}>
                  {e.sku}
                </RecordLink>
              ),
            },
            {
              key: "r",
              header: "Rule",
              cell: (e: EventRow) => <span className="font-mono text-xs">{e.rule}</span>,
            },
            {
              key: "o",
              header: "Outcome",
              className: "min-w-64",
              cell: (e: EventRow) => (
                <Flag tone={e.tone === "success" ? "info" : e.tone}>
                  {e.outcome.charAt(0).toUpperCase() + e.outcome.slice(1)}
                </Flag>
              ),
            },
          ]}
          rows={shownEvents}
          rowKey={(e) => e.at + e.eventId}
          pageSize={25}
          empty={filteredEmpty("events")}
        />
      )}

      <ConfirmDialog
        open={bulk !== null}
        tone={bulk === "reject" ? "danger" : "primary"}
        title={`${bulk === "approve" ? "Approve" : "Reject"} ${selectedPending.length} price proposals?`}
        description={
          bulk === "approve"
            ? `${selectedPending.length} proposed prices will be written to draft versions of their target price lists. Nothing is published until each list is approved.`
            : `${selectedPending.length} proposals will be rejected and their prices left unchanged. New events can still create fresh proposals.`
        }
        confirmLabel={`${bulk === "approve" ? "Approve" : "Reject"} ${selectedPending.length} proposals`}
        loading={bulkBusy}
        onConfirm={runBulk}
        onCancel={() => setBulk(null)}
      />

      {editing && (
        <RuleModal
          rule={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(r) => {
            const isNew = !rules.some((x) => x.id === r.id);
            setRules((rs) =>
              rs.some((x) => x.id === r.id) ? rs.map((x) => (x.id === r.id ? r : x)) : [r, ...rs],
            );
            setEditing(null);
            setTab("rules");
            toast.success(`${r.name} ${isNew ? "created" : "saved"}`);
          }}
        />
      )}
    </PricingLayout>
  );
}

function WorkedExample() {
  const cost0 = 82.5;
  const price0 = 110;
  const cost1 = cost0 * 1.12;
  const target = cost1 / (1 - 0.25);
  const capped = price0 * 1.08;
  return (
    <Card title="Worked example — RP-01 Widget margin keeper" className="mb-6">
      <ol className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
        <Step n={1} label="Rule">
          Maintain <b>25% margin</b> on Widget · max automatic increase <b>8%</b>
        </Step>
        <Step n={2} label="Event">
          Cost rises <b>+12%</b>: {cost0.toFixed(2)} → {cost1.toFixed(2)}
        </Step>
        <Step n={3} label="Uncapped">
          Price for 25% margin = <b>{target.toFixed(2)}</b> (
          {pct(((target - price0) / price0) * 100)})
        </Step>
        <Step n={4} label="Proposal">
          Capped at 8% → <b className="text-brand">{capped.toFixed(2)}</b>. Routed for approval per
          the approval matrix.
        </Step>
      </ol>
    </Card>
  );
}

function Step({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <li className="rounded-lg border border-border p-4">
      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
        <span
          className="size-6 rounded-full bg-navy text-navy-foreground grid place-items-center"
          aria-hidden
        >
          {n}
        </span>
        {label}
      </div>
      <div className="mt-2">{children}</div>
    </li>
  );
}

type RuleErrors = Partial<
  Record<
    | "name"
    | "scope"
    | "targetMarginPct"
    | "minChangePct"
    | "maxIncreasePct"
    | "maxDecreasePct"
    | "cooldownHours"
    | "undercutPct"
    | "marginFloorPct",
    string
  >
>;

const inRange = (v: number | undefined, min: number, max: number) =>
  v === undefined || (!Number.isNaN(v) && v >= min && v <= max);

function validateRule(r: RepricingRule): RuleErrors {
  const e: RuleErrors = {};
  if (!r.name.trim()) e.name = "Enter a rule name, e.g. Widget margin keeper.";
  if (!r.scope.trim())
    e.scope = "Enter the products and price list this rule covers, e.g. Widget · UK Base 2026.";
  if (!inRange(r.targetMarginPct, 0, 95)) e.targetMarginPct = "Enter a margin between 0 and 95%.";
  if (Number.isNaN(r.minChangePct) || !inRange(r.minChangePct, 0, 100))
    e.minChangePct = "Enter a percentage between 0 and 100.";
  if (Number.isNaN(r.maxIncreasePct) || !inRange(r.maxIncreasePct, 0, 100))
    e.maxIncreasePct = "Enter a percentage between 0 and 100.";
  if (Number.isNaN(r.maxDecreasePct) || !inRange(r.maxDecreasePct, 0, 100))
    e.maxDecreasePct = "Enter a percentage between 0 and 100.";
  if (!e.minChangePct && !e.maxIncreasePct && r.minChangePct > r.maxIncreasePct)
    e.minChangePct = `The minimum change can't exceed the max increase (${r.maxIncreasePct}%) — no proposal could ever be created.`;
  if (
    Number.isNaN(r.cooldownHours) ||
    !inRange(r.cooldownHours, 0, 720) ||
    !Number.isInteger(r.cooldownHours)
  )
    e.cooldownHours = "Enter whole hours between 0 and 720.";
  if (r.trigger === "COMPETITOR_PRICE_CHANGE" && r.competitorStrategy === "UNDERCUT_BY_PCT") {
    if (r.undercutPct === undefined || Number.isNaN(r.undercutPct))
      e.undercutPct = "Undercut by % needs a percentage, e.g. 2.5.";
    else if (!inRange(r.undercutPct, 0, 50)) e.undercutPct = "Enter a percentage between 0 and 50.";
  }
  if (r.trigger === "COMPETITOR_PRICE_CHANGE" && !inRange(r.marginFloorPct, 0, 95))
    e.marginFloorPct = "Enter a margin between 0 and 95%.";
  return e;
}

const FIELD_ORDER: Array<keyof RuleErrors> = [
  "name",
  "scope",
  "targetMarginPct",
  "minChangePct",
  "maxIncreasePct",
  "maxDecreasePct",
  "cooldownHours",
  "undercutPct",
  "marginFloorPct",
];

function RuleModal({
  rule,
  onClose,
  onSave,
}: {
  rule: RepricingRule | null;
  onClose: () => void;
  onSave: (r: RepricingRule) => void;
}) {
  const initial = rule ?? {
    id: `RP-0${REPRICING_RULES.length + 1}`,
    name: "",
    trigger: "COST_CHANGE" as RepricingRule["trigger"],
    scope: "",
    minChangePct: 1,
    maxIncreasePct: 8,
    maxDecreasePct: 5,
    cooldownHours: 24,
    autoApprove: false,
    status: "DRAFT" as RepricingRule["status"],
  };
  const [r, setR] = useState<RepricingRule>(initial);
  const [touched, setTouched] = useState<Partial<Record<keyof RuleErrors, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const set = <K extends keyof RepricingRule>(k: K, v: RepricingRule[K]) =>
    setR((x) => ({ ...x, [k]: v }));
  const num = (v: string) => (v === "" ? undefined : Number(v));
  const dirty = JSON.stringify(r) !== JSON.stringify(initial);
  const errors = validateRule(r);
  const show = (k: keyof RuleErrors) => (submitted || touched[k] ? errors[k] : undefined);
  const blur = (k: keyof RuleErrors) => () => setTouched((t) => ({ ...t, [k]: true }));

  const save = (ev?: FormEvent) => {
    ev?.preventDefault();
    setSubmitted(true);
    const first = FIELD_ORDER.find((k) => errors[k]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setSaving(true);
    window.setTimeout(() => {
      setSaving(false);
      onSave(r);
    }, 400);
  };
  const isComp = r.trigger === "COMPETITOR_PRICE_CHANGE";

  return (
    <Modal
      open
      size="lg"
      title={rule ? `Edit ${rule.name}` : "Create repricing rule"}
      subtitle={dirty ? "Unsaved changes" : undefined}
      onClose={onClose}
      dismissible={!dirty && !saving}
      footer={
        <>
          <Btn variant="subtle" onClick={onClose} disabled={saving}>
            Cancel
          </Btn>
          <Btn type="submit" form="repricing-rule-form" loading={saving}>
            {rule ? "Save rule" : "Create rule"}
          </Btn>
        </>
      }
    >
      <form id="repricing-rule-form" ref={formRef} onSubmit={save} noValidate>
        <p className="text-xs text-muted-foreground mb-4">
          <span className="text-destructive" aria-hidden>
            *
          </span>{" "}
          Required
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          <Field label="Rule name" required error={show("name")}>
            <input
              name="name"
              value={r.name}
              onChange={(e) => set("name", e.target.value)}
              onBlur={blur("name")}
              className={inputCls}
            />
          </Field>
          <Field label="Trigger" required>
            <select
              value={r.trigger}
              onChange={(e) => set("trigger", e.target.value as RepricingRule["trigger"])}
              className={inputCls}
            >
              {REPRICING_TRIGGERS.map((t) => (
                <option key={t} value={t}>
                  {humanize(t)}
                </option>
              ))}
            </select>
          </Field>
          <Field
            label="Scope (products · price list)"
            required
            error={show("scope")}
            className="sm:col-span-2"
          >
            <input
              name="scope"
              value={r.scope}
              onChange={(e) => set("scope", e.target.value)}
              onBlur={blur("scope")}
              className={inputCls}
              placeholder="e.g. Widget · UK Base 2026"
            />
          </Field>
          <Field
            label="Target margin (%)"
            hint="Optional — maintain this margin on cost change"
            error={show("targetMarginPct")}
          >
            <input
              name="targetMarginPct"
              type="number"
              inputMode="decimal"
              min={0}
              max={95}
              step="0.1"
              value={r.targetMarginPct ?? ""}
              onChange={(e) => set("targetMarginPct", num(e.target.value))}
              onBlur={blur("targetMarginPct")}
              className={inputCls}
            />
          </Field>
          <Field
            label="Minimum change (%)"
            hint="Changes smaller than this are ignored to prevent noise"
            error={show("minChangePct")}
          >
            <input
              name="minChangePct"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.1"
              value={r.minChangePct}
              onChange={(e) => set("minChangePct", Number(e.target.value))}
              onBlur={blur("minChangePct")}
              className={inputCls}
            />
          </Field>
          <Field label="Max increase (%)" error={show("maxIncreasePct")}>
            <input
              name="maxIncreasePct"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.1"
              value={r.maxIncreasePct}
              onChange={(e) => set("maxIncreasePct", Number(e.target.value))}
              onBlur={blur("maxIncreasePct")}
              className={inputCls}
            />
          </Field>
          <Field label="Max decrease (%)" error={show("maxDecreasePct")}>
            <input
              name="maxDecreasePct"
              type="number"
              inputMode="decimal"
              min={0}
              max={100}
              step="0.1"
              value={r.maxDecreasePct}
              onChange={(e) => set("maxDecreasePct", Number(e.target.value))}
              onBlur={blur("maxDecreasePct")}
              className={inputCls}
            />
          </Field>
          <Field
            label="Cooldown (hours)"
            hint="Stops repeated changes from rapid feed updates"
            error={show("cooldownHours")}
          >
            <input
              name="cooldownHours"
              type="number"
              inputMode="numeric"
              min={0}
              max={720}
              step="1"
              value={r.cooldownHours}
              onChange={(e) => set("cooldownHours", Number(e.target.value))}
              onBlur={blur("cooldownHours")}
              className={inputCls}
            />
          </Field>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-foreground">
              Approval
            </span>
            <div className="h-10 flex items-center">
              <Toggle
                checked={r.autoApprove}
                onChange={(v) => set("autoApprove", v)}
                label="Auto-approve when inside policy"
              />
            </div>
          </div>
          {isComp && (
            <>
              <Field label="Competitor strategy">
                <select
                  value={r.competitorStrategy ?? ""}
                  onChange={(e) =>
                    set(
                      "competitorStrategy",
                      (e.target.value || undefined) as RepricingRule["competitorStrategy"],
                    )
                  }
                  className={inputCls}
                >
                  <option value="">None</option>
                  {COMPETITOR_STRATEGIES.map((s) => (
                    <option key={s} value={s}>
                      {humanize(s)}
                    </option>
                  ))}
                </select>
              </Field>
              {r.competitorStrategy === "UNDERCUT_BY_PCT" && (
                <Field label="Undercut by (%)" required error={show("undercutPct")}>
                  <input
                    name="undercutPct"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={50}
                    step="0.1"
                    value={r.undercutPct ?? ""}
                    onChange={(e) => set("undercutPct", num(e.target.value))}
                    onBlur={blur("undercutPct")}
                    className={inputCls}
                  />
                </Field>
              )}
              <Field
                label="Margin floor (%)"
                hint="Proposals never go below this margin"
                error={show("marginFloorPct")}
                className={r.competitorStrategy === "UNDERCUT_BY_PCT" ? "sm:col-span-2" : ""}
              >
                <input
                  name="marginFloorPct"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  max={95}
                  step="0.1"
                  value={r.marginFloorPct ?? ""}
                  onChange={(e) => set("marginFloorPct", num(e.target.value))}
                  onBlur={blur("marginFloorPct")}
                  className={inputCls}
                />
              </Field>
            </>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-4">
          Guardrails always apply on top of caps. Each proposal records the trigger that caused it.
        </p>
      </form>
    </Modal>
  );
}
