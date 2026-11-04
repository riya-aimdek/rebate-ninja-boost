import { createFileRoute } from "@tanstack/react-router";
import { useId, useMemo, useState, type FormEvent } from "react";
import { BadgeCheck, CalendarClock, Plus, Trash2, UserCheck, X } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  DataTable,
  EmptyState,
  ErrorBanner,
  Field,
  Flag,
  InfoBanner,
  ListHeader,
  MissingHint,
  Modal,
  PillTabs,
  PricingLayout,
  StatusPill,
  Tag,
  Toggle,
  humanize,
  inputCls,
  missingFields,
  notifyUndo,
  type ApiError,
} from "@/components/pricing/kit";
import { RequireAccess } from "@/components/pricing/access";
import { CHANNELS, CUSTOMERS, PRODUCTS, REASON_CODES, REGIONS } from "@/lib/pricing/data";
import {
  APPLIES_TO,
  APPROVAL_ATTRIBUTES,
  APPROVAL_OPERATORS,
  APPROVAL_POOLS,
  APPROVAL_RULES,
  APPROVER_TYPES,
  DELEGATIONS,
  JUSTIFICATIONS,
  MAX_APPROVAL_LEVELS,
  NOW,
  OPERATOR_LABEL,
  RUNTIME_VARIABLES,
  SOD_LOG,
  SOD_POLICY,
  SOD_RULES,
  TODAY_ISO,
  resolveApprovals,
  type AppliesTo,
  type ApprovalCondition,
  type ApprovalContext,
  type ApprovalLevel,
  type ApprovalRule,
  type Approver,
  type Delegation,
} from "@/lib/pricing/deals";
import { PARTNER_TIERS, USERS, useSession, userById, userName } from "@/lib/pricing/session";

export const Route = createFileRoute("/pricing/approval-matrix")({
  head: () => ({ meta: [{ title: "Approval matrix · Rebate Ninja" }] }),
  component: () => (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Deal desk" }, { label: "Approval matrix" }]}>
      <RequireAccess roles={["PRICING_ADMIN", "DEAL_DESK", "FINANCE_CONTROLLER"]}>
        <Page />
      </RequireAccess>
    </PricingLayout>
  ),
});

type Tab = "rules" | "test" | "sod" | "delegations";

const ATTR_LABEL: Record<string, string> = {
  DISCOUNT_PCT: "Discount %",
  MARGIN_PCT: "Margin %",
  DEAL_VALUE: "Deal value (£)",
  CUSTOMER: "Customer",
  CUSTOMER_SEGMENT: "Customer segment",
  PRODUCT: "Product (SKU)",
  PRODUCT_CATEGORY: "Product category",
  REGION: "Region",
  CHANNEL: "Channel",
  EXCEPTION_TYPE: "Exception type",
};
const TITLES = Array.from(new Set(USERS.filter((u) => u.approvalAuthorityPct !== undefined || u.title === "Pricing Manager").map((u) => u.title)));
const APPROVERS = USERS.filter((u) => u.status === "ACTIVE" && (u.approvalAuthorityPct !== undefined || u.title === "Pricing Manager"));

const condText = (c: ApprovalCondition) => `${ATTR_LABEL[c.attribute]} ${OPERATOR_LABEL[c.operator]} ${c.value}`;
const approverText = (a: Approver) => (a.type === "ROLE" ? a.value : a.type === "USER" ? userName(a.value) : a.type === "POOL" ? `${a.value} (pool)` : "Requester's manager");
const levelText = (l: ApprovalLevel) => l.approvers.map(approverText).join(l.mode === "PARALLEL" ? (l.parallelRule === "ANY" ? " or " : " + ") : ", ");
const dayBefore = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

function Page() {
  const { role } = useSession();
  const canEdit = role !== "FINANCE_CONTROLLER";
  const [tab, setTab] = useState<Tab>("rules");
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((n) => n + 1);
  return (
    <>
      <ListHeader
        title="Approval matrix"
        subtitle="Who must approve what — by discount, margin, deal value, customer, product, region and exception type. No code needed."
        eyebrow="Deal desk"
      />
      {!canEdit && <InfoBanner title="View only">Finance controllers can review the matrix but not change it.</InfoBanner>}
      <PillTabs<Tab>
        idPrefix="am"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "rules", label: "Rules", count: APPROVAL_RULES.length },
          { key: "test", label: "Test a deal" },
          { key: "sod", label: "Segregation of duties" },
          { key: "delegations", label: "Delegations", count: DELEGATIONS.length },
        ]}
      />
      <div role="tabpanel" id={`am-panel-${tab}`} aria-labelledby={`am-tab-${tab}`} key={tick}>
        {tab === "rules" && <RulesTab canEdit={canEdit} onChange={refresh} />}
        {tab === "test" && <TestTab />}
        {tab === "sod" && <SodTab canEdit={canEdit} />}
        {tab === "delegations" && <DelegationsTab canEdit={canEdit} onChange={refresh} />}
      </div>
    </>
  );
}

/* ================================================================== */
/* Rules                                                               */
/* ================================================================== */

type RuleForm = {
  name: string;
  appliesTo: AppliesTo[];
  conditions: ApprovalCondition[];
  levels: ApprovalLevel[];
  effectiveFrom: string;
  effectiveTo: string;
  reasonCode: string;
};
const newLevel = (): ApprovalLevel => ({ mode: "SEQUENTIAL", approvers: [{ type: "ROLE", value: "Sales Manager" }], slaHours: 24, escalateTo: "Sales VP" });
const toForm = (r?: ApprovalRule): RuleForm => ({
  name: r?.name ?? "",
  appliesTo: r?.appliesTo ?? ["QUOTE"],
  conditions: r ? structuredClone(r.conditions) : [{ attribute: "DISCOUNT_PCT", operator: "GT", value: "" }],
  levels: r ? structuredClone(r.levels) : [newLevel()],
  effectiveFrom: r ? "" : TODAY_ISO,
  effectiveTo: r?.effectiveTo ?? "",
  reasonCode: "",
});

function RulesTab({ canEdit, onChange }: { canEdit: boolean; onChange: () => void }) {
  const [editing, setEditing] = useState<ApprovalRule | "new" | null>(null);
  const [form, setForm] = useState<RuleForm>(toForm());
  const [origin, setOrigin] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const rows = [...APPROVAL_RULES].sort((a, b) => a.id.localeCompare(b.id) || b.version - a.version);

  const open = (r?: ApprovalRule) => {
    if (!canEdit) return;
    const f = toForm(r);
    setForm(f);
    setOrigin(JSON.stringify(f));
    setEditing(r ?? "new");
    setSubmitted(false);
    setError(null);
  };
  const dirty = editing !== null && JSON.stringify(form) !== origin;
  const prev = editing && editing !== "new" ? editing : undefined;

  const errs: Record<string, string> = {};
  if (!form.name.trim()) errs["ar-name"] = "Name the rule so approvers know why they were asked.";
  if (!form.appliesTo.length) errs["ar-applies"] = "Choose at least one record type.";
  if (!form.conditions.length) errs["ar-conds"] = "Add at least one condition — a rule without conditions would match everything.";
  form.conditions.forEach((c, i) => {
    if (!c.value.trim()) errs[`ar-cv-${i}`] = "Enter a value.";
    else if (["DISCOUNT_PCT", "MARGIN_PCT", "DEAL_VALUE"].includes(c.attribute) && !c.value.startsWith("$") && c.operator !== "BETWEEN" && Number.isNaN(Number(c.value))) errs[`ar-cv-${i}`] = "Enter a number or a runtime variable.";
  });
  if (!form.levels.length) errs["ar-levels"] = "Add at least one approval level.";
  else if (form.levels.length > MAX_APPROVAL_LEVELS) errs["ar-levels"] = `A flow can have up to ${MAX_APPROVAL_LEVELS} levels. Remove ${form.levels.length - MAX_APPROVAL_LEVELS}.`;
  form.levels.forEach((l, i) => {
    if (!l.approvers.length) errs[`ar-la-${i}`] = "Add an approver.";
    if (!(l.slaHours > 0)) errs[`ar-ls-${i}`] = "Enter hours above 0.";
  });
  if (!form.effectiveFrom) errs["ar-from"] = "Choose the date this rule takes effect.";
  else if (form.effectiveFrom < TODAY_ISO) errs["ar-from"] = "Choose today or a future date.";
  if (form.effectiveTo && form.effectiveFrom && form.effectiveTo < form.effectiveFrom) errs["ar-to"] = "The end date must be on or after the start date.";
  if (prev && !form.reasonCode) errs["ar-reason"] = "Select why the rule is changing — kept in the version history.";
  const fe = (k: string) => (submitted || k === "ar-levels" ? errs[k] : undefined);
  const ruleHintId = useId();
  const missingRule = missingFields([
    ["Rule name", form.name],
    ["Applies to", form.appliesTo],
    ["A condition", form.conditions],
    ...form.conditions.map((c, i) => [`Condition ${i + 1} value`, c.value] as [string, string]),
    ["An approval level", form.levels],
    ...form.levels.map((l, i) => [`Level ${i + 1} approver`, l.approvers] as [string, unknown[]]),
    ["Effective from", form.effectiveFrom],
    ["Reason code", form.reasonCode, !!prev],
  ]);

  const rejection = (): ApiError | null => {
    if (!form.conditions.length) return { errorClass: "VALIDATION", code: "RULE_NEEDS_CONDITION", message: "Every approval rule needs at least one condition.", field: "conditions" };
    if (form.levels.length > MAX_APPROVAL_LEVELS) return { errorClass: "VALIDATION", code: "TOO_MANY_APPROVAL_LEVELS", message: `This flow has ${form.levels.length} levels; the maximum is ${MAX_APPROVAL_LEVELS}.`, field: "levels" };
    const keys = Object.keys(errs);
    if (keys.length) return { errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Fix the fields highlighted below.", field: keys.map((k) => k.replace(/^ar-/, "")).join(", ") };
    return null;
  };

  const save = (ev?: FormEvent) => {
    ev?.preventDefault();
    setSubmitted(true);
    const rej = rejection();
    setError(rej);
    if (rej) {
      const first = Object.keys(errs)[0];
      if (first) document.getElementById(first)?.focus();
      return;
    }
    setSaving(true);
    window.setTimeout(() => {
      const future = form.effectiveFrom > TODAY_ISO;
      const next: ApprovalRule = {
        id: prev?.id ?? `AR-${String(Math.max(...APPROVAL_RULES.map((r) => Number(r.id.slice(3)))) + 1).padStart(2, "0")}`,
        name: form.name.trim(),
        appliesTo: form.appliesTo,
        conditions: form.conditions.map((c) => ({ ...c, value: c.value.trim() })),
        levels: form.levels,
        effectiveFrom: form.effectiveFrom,
        effectiveTo: form.effectiveTo || undefined,
        version: (prev?.version ?? 0) + 1,
        status: future ? "SCHEDULED" : "ACTIVE",
        updatedBy: "U-01",
        updatedAt: NOW,
      };
      if (prev) {
        // The previous version keeps applying until the new one starts (effective dating).
        prev.effectiveTo = dayBefore(form.effectiveFrom);
        if (!future) prev.status = "INACTIVE";
      }
      APPROVAL_RULES.push(next);
      setSaving(false);
      setEditing(null);
      onChange();
      toast.success(prev ? `${next.id} version ${next.version} saved` : `Rule ${next.id} created`, {
        description: future ? `Takes effect on ${next.effectiveFrom}.${prev ? ` Version ${prev.version} applies until then.` : ""}` : "In effect now.",
      });
    }, 400);
  };

  const setCond = (i: number, c: Partial<ApprovalCondition>) => setForm({ ...form, conditions: form.conditions.map((x, j) => (j === i ? { ...x, ...c } : x)) });
  const setLevel = (i: number, l: Partial<ApprovalLevel>) => setForm({ ...form, levels: form.levels.map((x, j) => (j === i ? { ...x, ...l } : x)) });

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-muted-foreground max-w-2xl">All matching rules apply. Approvers already in an earlier step are merged out, so nobody approves the same item twice. Example: discount up to 10% needs none, 10–20% needs the Sales Manager, above 20% the Sales VP.</p>
        {canEdit && (
          <Btn icon={Plus} onClick={() => open()}>
            Create rule
          </Btn>
        )}
      </div>
      <DataTable<ApprovalRule>
        caption="Approval rules"
        rows={rows}
        rowKey={(r) => `${r.id}-v${r.version}`}
        onRowClick={canEdit ? (r) => (r.status === "INACTIVE" ? undefined : open(r)) : undefined}
        empty={<EmptyState icon={BadgeCheck} title="No approval rules yet" action={canEdit ? <Btn icon={Plus} onClick={() => open()}>Create rule</Btn> : undefined}>Without rules, every quote and exception is approved automatically.</EmptyState>}
        columns={[
          { key: "id", header: "ID", cell: (r) => <span className="font-mono text-xs whitespace-nowrap">{r.id}</span> },
          { key: "name", header: "Rule", className: "min-w-52", cell: (r) => <span className="font-medium">{r.name}</span> },
          { key: "applies", header: "Applies to", cell: (r) => <div className="flex flex-wrap gap-1">{r.appliesTo.map((a) => <Tag key={a}>{humanize(a)}</Tag>)}</div> },
          { key: "cond", header: "When", className: "min-w-56", cell: (r) => <ul className="space-y-0.5 text-sm">{r.conditions.map((c, i) => <li key={i}>{i > 0 && <span className="text-muted-foreground">and </span>}{condText(c)}</li>)}</ul> },
          {
            key: "levels",
            header: "Approval flow",
            className: "min-w-56",
            cell: (r) => (
              <ol className="space-y-0.5 text-sm">
                {r.levels.map((l, i) => (
                  <li key={i}>
                    <span className="text-muted-foreground tabular-nums">{i + 1}.</span> {levelText(l)} <span className="text-xs text-muted-foreground">· {l.slaHours} h</span>
                  </li>
                ))}
              </ol>
            ),
          },
          { key: "eff", header: "Effective", cell: (r) => <span className="tabular-nums whitespace-nowrap">{r.effectiveFrom} → {r.effectiveTo ?? "open"}</span> },
          { key: "v", header: "Version", align: "right", cell: (r) => <span className="tabular-nums">v{r.version}</span> },
          { key: "st", header: "Status", cell: (r) => <StatusPill status={r.status} /> },
        ]}
      />

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        dismissible={!dirty && !saving}
        size="xl"
        title={editing === "new" ? "Create approval rule" : `Edit ${prev?.id} — creates version ${(prev?.version ?? 0) + 1}`}
        subtitle={dirty ? "Unsaved changes · rules are effective-dated and versioned." : "Declarative only — custom steps use outbound webhooks."}
        footer={
          <>
            <MissingHint id={ruleHintId} missing={missingRule} />
            <Btn variant="subtle" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Btn>
            <Btn type="submit" form="rule-form" loading={saving} disabled={missingRule.length > 0} aria-describedby={missingRule.length ? ruleHintId : undefined}>
              Save rule
            </Btn>
          </>
        }
      >
        <form id="rule-form" onSubmit={save} noValidate className="space-y-6">
          <ErrorBanner error={error} onClose={() => setError(null)} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Rule name" required error={fe("ar-name")}>
              <input id="ar-name" className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Discount over 20%" />
            </Field>
            <fieldset>
              <legend className="text-sm font-medium mb-1.5">
                Applies to<span className="text-destructive ml-0.5" aria-hidden>*</span>
              </legend>
              <div id="ar-applies" tabIndex={-1} className="flex flex-wrap gap-x-4 gap-y-2">
                {APPLIES_TO.map((a) => (
                  <label key={a} className="inline-flex items-center gap-2 text-sm h-10">
                    <input type="checkbox" className="size-4 accent-[var(--color-brand)]" checked={form.appliesTo.includes(a)} onChange={(e) => setForm({ ...form, appliesTo: e.target.checked ? [...form.appliesTo, a] : form.appliesTo.filter((x) => x !== a) })} />
                    {humanize(a)}
                  </label>
                ))}
              </div>
              {fe("ar-applies") && <p className="text-xs text-destructive mt-1">{errs["ar-applies"]}</p>}
            </fieldset>
          </div>

          <fieldset className="border-t border-border pt-4">
            <legend className="text-sm font-semibold">Conditions — all must match</legend>
            <p className="text-xs text-muted-foreground mb-3">Values can use runtime variables: {RUNTIME_VARIABLES.join(", ")}. "Between" takes two numbers, e.g. 10..20.</p>
            {fe("ar-conds") && <p id="ar-conds" tabIndex={-1} className="text-xs text-destructive mb-2">{errs["ar-conds"]}</p>}
            <datalist id="runtime-vars">
              {RUNTIME_VARIABLES.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
            <ul className="space-y-3">
              {form.conditions.map((c, i) => (
                <li key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_140px_1fr_auto] gap-3 items-end">
                  <Field label={`Attribute ${i + 1}`}>
                    <select className={inputCls} value={c.attribute} onChange={(e) => setCond(i, { attribute: e.target.value as ApprovalCondition["attribute"] })}>
                      {APPROVAL_ATTRIBUTES.map((a) => (
                        <option key={a} value={a}>
                          {ATTR_LABEL[a]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Operator">
                    <select className={inputCls} value={c.operator} onChange={(e) => setCond(i, { operator: e.target.value as ApprovalCondition["operator"] })}>
                      {APPROVAL_OPERATORS.map((o) => (
                        <option key={o} value={o}>
                          {OPERATOR_LABEL[o]} ({o})
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Value" error={fe(`ar-cv-${i}`)}>
                    <input id={`ar-cv-${i}`} list="runtime-vars" className={inputCls} value={c.value} onChange={(e) => setCond(i, { value: e.target.value })} placeholder={c.attribute === "EXCEPTION_TYPE" ? "e.g. COMPETITIVE_PRESSURE" : "e.g. 20"} />
                  </Field>
                  <Btn variant="ghost" icon={X} aria-label={`Remove condition ${i + 1}`} onClick={() => setForm({ ...form, conditions: form.conditions.filter((_, j) => j !== i) })} className="mb-0.5 w-10 px-0" />
                </li>
              ))}
            </ul>
            <Btn variant="subtle" size="sm" icon={Plus} className="mt-3" onClick={() => setForm({ ...form, conditions: [...form.conditions, { attribute: "DISCOUNT_PCT", operator: "GT", value: "" }] })}>
              Add condition
            </Btn>
          </fieldset>

          <fieldset className="border-t border-border pt-4">
            <legend className="text-sm font-semibold">Approval levels</legend>
            <p className="text-xs text-muted-foreground mb-3">Up to {MAX_APPROVAL_LEVELS} levels, run in order. A parallel level has several approvers: all, or any one, must approve.</p>
            {fe("ar-levels") && <p id="ar-levels" tabIndex={-1} className="text-xs text-destructive mb-2" role="alert">{errs["ar-levels"]}</p>}
            <ol className="space-y-4">
              {form.levels.map((l, i) => (
                <li key={i} className={`rounded-lg border p-4 ${i >= MAX_APPROVAL_LEVELS ? "border-destructive/50 bg-danger-soft/40" : "border-border"}`}>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <h4 className="font-semibold text-sm">Level {i + 1}</h4>
                    <Btn variant="ghost" size="sm" icon={Trash2} onClick={() => setForm({ ...form, levels: form.levels.filter((_, j) => j !== i) })}>
                      Remove level
                    </Btn>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <Field label="Mode">
                      <select className={inputCls} value={l.mode} onChange={(e) => setLevel(i, { mode: e.target.value as ApprovalLevel["mode"], parallelRule: e.target.value === "PARALLEL" ? "ALL" : undefined })}>
                        <option value="SEQUENTIAL">Sequential</option>
                        <option value="PARALLEL">Parallel</option>
                      </select>
                    </Field>
                    <Field label="Parallel rule">
                      <select className={inputCls} disabled={l.mode !== "PARALLEL"} value={l.parallelRule ?? "ALL"} onChange={(e) => setLevel(i, { parallelRule: e.target.value as "ALL" | "ANY" })}>
                        <option value="ALL">All must approve</option>
                        <option value="ANY">Any one approves</option>
                      </select>
                    </Field>
                    <Field label="SLA (hours)" error={fe(`ar-ls-${i}`)}>
                      <input id={`ar-ls-${i}`} type="number" inputMode="numeric" min={1} step={1} className={inputCls} value={l.slaHours} onChange={(e) => setLevel(i, { slaHours: Number(e.target.value) })} />
                    </Field>
                    <Field label="Escalate to">
                      <select className={inputCls} value={l.escalateTo} onChange={(e) => setLevel(i, { escalateTo: e.target.value })}>
                        {TITLES.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </Field>
                  </div>
                  <ul className="mt-3 space-y-2">
                    {l.approvers.map((a, k) => (
                      <li key={k} className="grid grid-cols-1 sm:grid-cols-[180px_1fr_auto] gap-3 items-end">
                        <Field label={`Approver ${k + 1} type`}>
                          <select
                            className={inputCls}
                            value={a.type}
                            onChange={(e) => {
                              const type = e.target.value as Approver["type"];
                              const value = type === "ROLE" ? "Sales Manager" : type === "USER" ? APPROVERS[0].id : type === "POOL" ? Object.keys(APPROVAL_POOLS)[0] : "";
                              setLevel(i, { approvers: l.approvers.map((x, j) => (j === k ? { type, value } : x)) });
                            }}
                          >
                            {APPROVER_TYPES.map((t) => (
                              <option key={t} value={t}>
                                {t === "REQUESTER_MANAGER" ? "Requester's manager" : humanize(t)}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Approver">
                          {a.type === "REQUESTER_MANAGER" ? (
                            <div className="h-10 px-3 rounded-lg bg-muted flex items-center text-sm">Resolved from the requester's manager link</div>
                          ) : (
                            <select className={inputCls} value={a.value} onChange={(e) => setLevel(i, { approvers: l.approvers.map((x, j) => (j === k ? { ...x, value: e.target.value } : x)) })}>
                              {(a.type === "ROLE" ? TITLES.map((t) => [t, t]) : a.type === "USER" ? APPROVERS.map((u) => [u.id, `${u.name} · ${u.title}`]) : Object.keys(APPROVAL_POOLS).map((p) => [p, p])).map(([v, label]) => (
                                <option key={v} value={v}>
                                  {label}
                                </option>
                              ))}
                            </select>
                          )}
                        </Field>
                        <Btn variant="ghost" icon={X} aria-label={`Remove approver ${k + 1} from level ${i + 1}`} className="mb-0.5 w-10 px-0" onClick={() => setLevel(i, { approvers: l.approvers.filter((_, j) => j !== k) })} />
                      </li>
                    ))}
                  </ul>
                  {fe(`ar-la-${i}`) && <p className="text-xs text-destructive mt-1">{errs[`ar-la-${i}`]}</p>}
                  <Btn variant="subtle" size="sm" icon={Plus} className="mt-2" onClick={() => setLevel(i, { approvers: [...l.approvers, { type: "ROLE", value: "Sales VP" }], mode: "PARALLEL", parallelRule: l.parallelRule ?? "ALL" })}>
                    Add approver
                  </Btn>
                </li>
              ))}
            </ol>
            <Btn variant="subtle" size="sm" icon={Plus} className="mt-3" onClick={() => setForm({ ...form, levels: [...form.levels, newLevel()] })}>
              Add level
            </Btn>
          </fieldset>

          <fieldset className="border-t border-border pt-4">
            <legend className="text-sm font-semibold">Effective dates{prev ? " and reason" : ""}</legend>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 mt-2">
              <Field label="Effective from" required error={fe("ar-from")} hint="A future date schedules this version.">
                <input id="ar-from" type="date" min={TODAY_ISO} className={inputCls} value={form.effectiveFrom} onChange={(e) => setForm({ ...form, effectiveFrom: e.target.value })} />
              </Field>
              <Field label="Effective to" error={fe("ar-to")} hint="Leave blank for open-ended.">
                <input id="ar-to" type="date" min={form.effectiveFrom || TODAY_ISO} className={inputCls} value={form.effectiveTo} onChange={(e) => setForm({ ...form, effectiveTo: e.target.value })} />
              </Field>
              {prev && (
                <Field label="Reason code" required error={fe("ar-reason")}>
                  <select id="ar-reason" className={inputCls} value={form.reasonCode} onChange={(e) => setForm({ ...form, reasonCode: e.target.value })}>
                    <option value="">Select reason…</option>
                    {REASON_CODES.map((r) => (
                      <option key={r} value={r}>
                        {humanize(r)}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
            </div>
          </fieldset>
        </form>
      </Modal>
    </>
  );
}

/* ================================================================== */
/* Test a deal                                                         */
/* ================================================================== */

type TestForm = { appliesTo: AppliesTo; discountPct: string; marginPct: string; minMarginPct: string; dealValue: string; customerId: string; sku: string; channel: string; region: string; exceptionType: string; requesterId: string };
const PRESETS: Array<{ label: string; f: Partial<TestForm> }> = [
  { label: "18% discount", f: { appliesTo: "QUOTE", discountPct: "18", marginPct: "30", dealValue: "24000", channel: "Direct", customerId: "C-003" } },
  { label: "Two rules need the Sales VP", f: { appliesTo: "QUOTE", discountPct: "24", marginPct: "18", minMarginPct: "22", dealValue: "25800", channel: "Distributor", customerId: "878075" } },
  { label: "£300k deal", f: { appliesTo: "QUOTE", discountPct: "6", marginPct: "36", dealValue: "300000", channel: "Direct", customerId: "C-001" } },
  { label: "Competitive pressure exception", f: { appliesTo: "EXCEPTION", exceptionType: "COMPETITIVE_PRESSURE", discountPct: "22", marginPct: "32", dealValue: "26900", customerId: "878070" } },
  { label: "Requester is an approver", f: { appliesTo: "QUOTE", discountPct: "15", marginPct: "30", dealValue: "12000", channel: "Direct", customerId: "C-003", requesterId: "U-05" } },
];
const BLANK_TEST: TestForm = { appliesTo: "QUOTE", discountPct: "18", marginPct: "30", minMarginPct: "", dealValue: "24000", customerId: "C-003", sku: "", channel: "Direct", region: "", exceptionType: "", requesterId: "U-04" };

function TestTab() {
  const [f, setF] = useState<TestForm>(BLANK_TEST);
  const n = (s: string) => (s.trim() === "" ? undefined : Number(s));
  const ctx: ApprovalContext = {
    appliesTo: f.appliesTo,
    discountPct: n(f.discountPct),
    marginPct: n(f.marginPct),
    minMarginPct: n(f.minMarginPct),
    dealValue: n(f.dealValue),
    customerId: f.customerId || undefined,
    sku: f.sku || undefined,
    channel: f.channel || undefined,
    region: f.region || undefined,
    exceptionType: f.exceptionType || undefined,
    partnerLimitPct: f.customerId ? PARTNER_TIERS[f.customerId]?.discountLimitPct : undefined,
    requesterId: f.requesterId,
  };
  const res = useMemo(() => resolveApprovals(ctx), [JSON.stringify(ctx)]); // eslint-disable-line react-hooks/exhaustive-deps
  const set = (k: keyof TestForm) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[1fr_1fr] gap-6 items-start">
      <Card title="Deal to test" subtitle="Nothing is saved — this runs the live matrix.">
        <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Examples">
          {PRESETS.map((p) => (
            <Btn key={p.label} variant="subtle" size="sm" onClick={() => setF({ ...BLANK_TEST, ...p.f })}>
              {p.label}
            </Btn>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
          <Field label="Record type">
            <select className={inputCls} value={f.appliesTo} onChange={set("appliesTo")}>
              {APPLIES_TO.map((a) => (
                <option key={a} value={a}>
                  {humanize(a)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Requester">
            <select className={inputCls} value={f.requesterId} onChange={set("requesterId")}>
              {USERS.filter((u) => u.status === "ACTIVE" && u.role !== "CHANNEL_PARTNER").map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.title}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Discount (%)">
            <input type="number" inputMode="decimal" className={inputCls} value={f.discountPct} onChange={set("discountPct")} />
          </Field>
          <Field label="Margin (%)">
            <input type="number" inputMode="decimal" className={inputCls} value={f.marginPct} onChange={set("marginPct")} />
          </Field>
          <Field label="Margin floor in force (%)" hint="Value of $guardrail.minMarginPct">
            <input type="number" inputMode="decimal" className={inputCls} value={f.minMarginPct} onChange={set("minMarginPct")} placeholder="e.g. 22" />
          </Field>
          <Field label="Deal value (£)">
            <input type="number" inputMode="decimal" className={inputCls} value={f.dealValue} onChange={set("dealValue")} />
          </Field>
          <Field label="Customer">
            <select className={inputCls} value={f.customerId} onChange={set("customerId")}>
              <option value="">Any</option>
              {CUSTOMERS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.segment})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Product">
            <select className={inputCls} value={f.sku} onChange={set("sku")}>
              <option value="">Any</option>
              {PRODUCTS.map((p) => (
                <option key={p.sku} value={p.sku}>
                  {p.sku} · {p.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Channel">
            <select className={inputCls} value={f.channel} onChange={set("channel")}>
              <option value="">Any</option>
              {CHANNELS.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
          <Field label="Region" hint="Defaults to the customer's geography">
            <select className={inputCls} value={f.region} onChange={set("region")}>
              <option value="">From customer</option>
              {REGIONS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </Field>
          <Field label="Exception type">
            <select className={inputCls} value={f.exceptionType} onChange={set("exceptionType")}>
              <option value="">None</option>
              {JUSTIFICATIONS.map((j) => (
                <option key={j} value={j}>
                  {humanize(j)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </Card>
      <Card title="Result" subtitle={res.required ? `${res.steps.length} approval level${res.steps.length === 1 ? "" : "s"}` : "No approval needed"}>
        <div aria-live="polite">
          <h3 className="text-sm font-semibold mb-2">Matched rules</h3>
          {res.matched.length ? (
            <ul className="space-y-1.5 text-sm mb-5">
              {res.matched.map((r) => (
                <li key={`${r.id}-${r.version}`} className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs">{r.id}</span>
                  <span>{r.name}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground mb-5">No rule matches — the deal is approved automatically.</p>
          )}
          {res.steps.length > 0 && (
            <>
              <h3 className="text-sm font-semibold mb-2">Approval tasks</h3>
              <ol className="space-y-3">
                {res.steps.map((s) => (
                  <li key={s.level} className="rounded-lg border border-border p-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold">Level {s.level}</span>
                      <span className="text-xs text-muted-foreground">
                        {s.mode === "PARALLEL" ? (s.parallelRule === "ANY" ? "Parallel — any one" : "Parallel — all") : "Sequential"} · SLA {s.slaHours} h
                      </span>
                    </div>
                    <ul className="mt-1.5">
                      {s.approverIds.map((id) => (
                        <li key={id} className="flex items-center gap-2">
                          <UserCheck className="size-4 text-muted-foreground" aria-hidden />
                          {userName(id)} <span className="text-xs text-muted-foreground">{userById(id)?.title}</span>
                        </li>
                      ))}
                    </ul>
                    {s.fromRules.length > 1 && s.approverIds.length === 1 && <p className="mt-1.5"><Flag tone="info">{`${s.fromRules.join(" and ")} both need this approver — merged into one task`}</Flag></p>}
                    {s.fromRules.length > 0 && !(s.fromRules.length > 1 && s.approverIds.length === 1) && <p className="text-xs text-muted-foreground mt-1">From {s.fromRules.join(", ")}</p>}
                  </li>
                ))}
              </ol>
            </>
          )}
          {res.conflicts.map((c, i) => (
            <InfoBanner key={i} tone="warning" className="mt-4" title="Segregation of duties">
              {userName(c.requesterId)} can't approve their own request at level {c.level} — {c.action === "BLOCKED" ? "blocked by policy" : c.action === "ESCALATED_FALLBACK" ? `escalated to the fallback approver ${userName(c.replacedWith)}` : `reassigned to ${userName(c.replacedWith)}`}. The conflict is logged.
            </InfoBanner>
          ))}
        </div>
      </Card>
    </div>
  );
}

/* ================================================================== */
/* Segregation of duties                                               */
/* ================================================================== */

const SOD_RULE_HINT: Record<string, string> = {
  REQUESTER_NE_APPROVER: "The person who submits can't approve.",
  CREATOR_NE_APPROVER: "The person who created the record can't approve.",
  APPROVER_CHAIN_DISTINCT: "Nobody approves twice in one chain.",
};
const SOD_APPLIES = ["QUOTE", "EXCEPTION", "PRICE_LIST", "GUARDRAIL", "RULE"];

function SodTab({ canEdit }: { canEdit: boolean }) {
  const [p, setP] = useState(() => structuredClone(SOD_POLICY));
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(p) !== JSON.stringify(SOD_POLICY);
  const save = () => {
    if (!p.rules.length) {
      toast.error("Keep at least one rule", { description: "SOX controls require requester and approver to differ for high-risk transactions." });
      return;
    }
    setSaving(true);
    window.setTimeout(() => {
      Object.assign(SOD_POLICY, structuredClone(p));
      setSaving(false);
      toast.success("Segregation of duties policy saved", { description: "Enforced on the server for the UI, API and integrations." });
    }, 400);
  };
  return (
    <div className="space-y-6">
      <Card
        title="Policy"
        subtitle={dirty ? "Unsaved changes" : "Enforced server-side for UI, API and integrations — hiding a button is never the only control."}
        actions={
          canEdit && (
            <>
              <Btn variant="subtle" disabled={!dirty || saving} onClick={() => setP(structuredClone(SOD_POLICY))}>
                Cancel
              </Btn>
              <Btn loading={saving} disabled={!dirty} onClick={save}>
                Save policy
              </Btn>
            </>
          )
        }
      >
        <fieldset disabled={!canEdit} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="space-y-5">
            <div>
              <p className="text-sm font-semibold mb-2">Rules</p>
              <ul className="space-y-3">
                {SOD_RULES.map((r) => (
                  <li key={r}>
                    <Toggle checked={p.rules.includes(r)} onChange={(v) => setP({ ...p, rules: v ? [...p.rules, r] : p.rules.filter((x) => x !== r) })} label={humanize(r)} />
                    <p className="text-xs text-muted-foreground ml-12">{SOD_RULE_HINT[r]}</p>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-sm font-semibold mb-2">Applies to</p>
              <div className="flex flex-wrap gap-x-4">
                {SOD_APPLIES.map((a) => (
                  <label key={a} className="inline-flex items-center gap-2 text-sm h-10">
                    <input type="checkbox" className="size-4" checked={p.appliesTo.includes(a)} onChange={(e) => setP({ ...p, appliesTo: e.target.checked ? [...p.appliesTo, a] : p.appliesTo.filter((x) => x !== a) })} />
                    {humanize(a)}
                  </label>
                ))}
              </div>
            </div>
          </div>
          <div className="space-y-4">
            <p className="text-sm font-semibold">High-risk when</p>
            <Field label="Deal value above (£)">
              <input type="number" inputMode="numeric" min={0} className={inputCls} value={p.highRisk.dealValueAbove} onChange={(e) => setP({ ...p, highRisk: { ...p.highRisk, dealValueAbove: Number(e.target.value) } })} />
            </Field>
            <Toggle checked={p.highRisk.marginBelowFloor} onChange={(v) => setP({ ...p, highRisk: { ...p.highRisk, marginBelowFloor: v } })} label="Margin is below the floor" />
            <Toggle checked={p.highRisk.priceListPublication} onChange={(v) => setP({ ...p, highRisk: { ...p.highRisk, priceListPublication: v } })} label="A price list is published" />
            <Toggle checked={p.highRisk.ruleOrGuardrailChange} onChange={(v) => setP({ ...p, highRisk: { ...p.highRisk, ruleOrGuardrailChange: v } })} label="A rule or guardrail changes" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
              <Field label="On conflict" hint={p.onConflict === "BLOCK" ? "The request can't proceed." : "Moves to the next eligible approver."}>
                <select className={inputCls} value={p.onConflict} onChange={(e) => setP({ ...p, onConflict: e.target.value as "REASSIGN_NEXT" | "BLOCK" })}>
                  <option value="REASSIGN_NEXT">Reassign to next approver</option>
                  <option value="BLOCK">Block</option>
                </select>
              </Field>
              <Field label="Fallback approver" hint="Used when no other approver exists.">
                <select className={inputCls} value={p.fallbackApproverId} onChange={(e) => setP({ ...p, fallbackApproverId: e.target.value })}>
                  {APPROVERS.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} · {u.title}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </fieldset>
      </Card>

      <section aria-labelledby="sod-log-h">
        <h2 id="sod-log-h" className="text-lg font-semibold mb-3">Conflict log</h2>
        <DataTable
          caption="Segregation of duties conflicts"
          rows={SOD_LOG}
          rowKey={(r) => r.id}
          empty={<EmptyState title="No conflicts logged" />}
          columns={[
            { key: "at", header: "When", cell: (r) => <span className="tabular-nums whitespace-nowrap">{r.at}</span> },
            { key: "ref", header: "Record", cell: (r) => <span className="whitespace-nowrap"><Tag>{humanize(r.entity)}</Tag> <span className="font-mono text-xs ml-1">{r.ref}</span></span> },
            { key: "req", header: "Requester", cell: (r) => userName(r.requesterId) },
            { key: "act", header: "Outcome", cell: (r) => <StatusPill status={r.action === "DENIED" ? "BLOCKED" : r.action === "REASSIGNED" ? "ACTIVE" : "PENDING"} label={humanize(r.action)} /> },
            { key: "to", header: "Routed to", cell: (r) => (r.toId ? userName(r.toId) : "—") },
            { key: "ch", header: "Channel", cell: (r) => <Tag tone="neutral">{r.channel}</Tag> },
            { key: "note", header: "Detail", className: "min-w-72", cell: (r) => <span className="text-sm">{r.note}</span> },
          ]}
        />
      </section>
    </div>
  );
}

/* ================================================================== */
/* Delegations                                                         */
/* ================================================================== */

type DlgForm = { fromId: string; toId: string; from: string; to: string; reason: string };

function DelegationsTab({ canEdit, onChange }: { canEdit: boolean; onChange: () => void }) {
  const { user } = useSession();
  const blank = (): DlgForm => ({ fromId: APPROVERS.some((u) => u.id === user.id) ? user.id : APPROVERS[0].id, toId: "", from: "", to: "", reason: "" });
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<DlgForm>(blank);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const rows = [...DELEGATIONS].sort((a, b) => a.from.localeCompare(b.from));
  const state = (d: Delegation) => (TODAY_ISO > d.to ? "EXPIRED" : TODAY_ISO >= d.from ? "ACTIVE" : "SCHEDULED");

  const errs: Record<string, string> = {};
  if (!f.toId) errs["dl-to"] = "Choose who decides while the approver is away.";
  else if (f.toId === f.fromId) errs["dl-to"] = "Choose someone other than the approver.";
  if (!f.from) errs["dl-from"] = "Choose the first day of the delegation.";
  else if (f.from < TODAY_ISO) errs["dl-from"] = "Choose today or a future date.";
  if (!f.to) errs["dl-until"] = "Choose the last day of the delegation.";
  else if (f.from && f.to < f.from) errs["dl-until"] = "The end date must be on or after the start date.";
  const overlap = f.from && f.to ? DELEGATIONS.find((d) => d.fromId === f.fromId && !(f.to < d.from || f.from > d.to)) : undefined;
  if (overlap) errs["dl-from"] = `${userName(f.fromId)} already delegates to ${userName(overlap.toId)} from ${overlap.from} to ${overlap.to}.`;
  if (!f.reason.trim()) errs["dl-reason"] = "Add a reason — it's shown in the approval trail.";
  const fe = (k: string) => (submitted ? errs[k] : undefined);
  const dlgHintId = useId();
  const missingDlg = missingFields([
    ["Approver", f.fromId],
    ["Delegate to", f.toId],
    ["From", f.from],
    ["Until", f.to],
    ["Reason", f.reason],
  ]);

  const save = (ev?: FormEvent) => {
    ev?.preventDefault();
    setSubmitted(true);
    if (overlap) setError({ errorClass: "BUSINESS_RULE", code: "DELEGATION_OVERLAP", message: errs["dl-from"], field: "from" });
    else if (Object.keys(errs).length) setError({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Fill in the required fields highlighted below.", field: Object.keys(errs).map((k) => k.slice(3)).join(", ") });
    else setError(null);
    const first = Object.keys(errs)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    setSaving(true);
    window.setTimeout(() => {
      const d: Delegation = { id: `DLG-${Math.max(...DELEGATIONS.map((x) => Number(x.id.slice(4))), 0) + 1}`, ...f, reason: f.reason.trim(), createdAt: NOW };
      DELEGATIONS.push(d);
      setSaving(false);
      setOpen(false);
      onChange();
      toast.success("Delegation created", { description: `${userName(d.toId)} decides for ${userName(d.fromId)} from ${d.from} to ${d.to}. Decisions are recorded as “on behalf of”.` });
    }, 350);
  };

  const remove = (d: Delegation) => {
    const i = DELEGATIONS.findIndex((x) => x.id === d.id);
    DELEGATIONS.splice(i, 1);
    onChange();
    notifyUndo(`Delegation ${d.id} deleted`, () => {
      DELEGATIONS.splice(i, 0, d);
      onChange();
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="text-sm text-muted-foreground">An approver can hand their decisions to a colleague for a date range. The trail records the delegate as deciding on their behalf.</p>
        {canEdit && (
          <Btn
            icon={CalendarClock}
            onClick={() => {
              setF(blank());
              setSubmitted(false);
              setError(null);
              setOpen(true);
            }}
          >
            Create delegation
          </Btn>
        )}
      </div>
      <DataTable<Delegation>
        caption="Delegations of authority"
        rows={rows}
        rowKey={(d) => d.id}
        empty={<EmptyState icon={CalendarClock} title="No delegations">Create one when an approver will be away so requests don't stall.</EmptyState>}
        columns={[
          { key: "id", header: "ID", cell: (d) => <span className="font-mono text-xs">{d.id}</span> },
          { key: "from", header: "Approver", cell: (d) => <span>{userName(d.fromId)} <span className="text-xs text-muted-foreground">· {userById(d.fromId)?.title}</span></span> },
          { key: "to", header: "Delegate", cell: (d) => <span>{userName(d.toId)} <span className="text-xs text-muted-foreground">· {userById(d.toId)?.title}</span></span> },
          { key: "dates", header: "Dates", cell: (d) => <span className="tabular-nums whitespace-nowrap">{d.from} → {d.to}</span> },
          { key: "reason", header: "Reason", className: "min-w-52", cell: (d) => d.reason },
          { key: "st", header: "Status", cell: (d) => <StatusPill status={state(d)} /> },
          {
            key: "act",
            header: <span className="sr-only">Actions</span>,
            align: "right",
            cell: (d) =>
              canEdit && state(d) !== "EXPIRED" ? (
                <Btn variant="ghost" size="sm" icon={Trash2} onClick={() => remove(d)} aria-label={`Delete delegation ${d.id}`}>
                  Delete
                </Btn>
              ) : null,
          },
        ]}
      />
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        dismissible={!saving}
        title="Create delegation"
        subtitle="Delegated decisions are recorded as made on behalf of the approver."
        footer={
          <>
            <MissingHint id={dlgHintId} missing={missingDlg} />
            <Btn variant="subtle" onClick={() => setOpen(false)} disabled={saving}>
              Cancel
            </Btn>
            <Btn type="submit" form="dlg-form" loading={saving} disabled={missingDlg.length > 0} aria-describedby={missingDlg.length ? dlgHintId : undefined}>
              Save delegation
            </Btn>
          </>
        }
      >
        <form id="dlg-form" onSubmit={save} noValidate>
          <ErrorBanner error={error} onClose={() => setError(null)} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
            <Field label="Approver" required>
              <select className={inputCls} value={f.fromId} onChange={(e) => setF({ ...f, fromId: e.target.value })}>
                {APPROVERS.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {u.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Delegate to" required error={fe("dl-to")} hint={f.toId ? `Authority up to ${userById(f.toId)?.approvalAuthorityPct ?? "—"}% discount` : undefined}>
              <select id="dl-to" className={inputCls} value={f.toId} onChange={(e) => setF({ ...f, toId: e.target.value })}>
                <option value="">Select…</option>
                {APPROVERS.filter((u) => u.id !== f.fromId).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {u.title}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="From" required error={fe("dl-from")}>
              <input id="dl-from" type="date" min={TODAY_ISO} className={inputCls} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} />
            </Field>
            <Field label="Until" required error={fe("dl-until")}>
              <input id="dl-until" type="date" min={f.from || TODAY_ISO} className={inputCls} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} />
            </Field>
            <Field label="Reason" required error={fe("dl-reason")} className="md:col-span-2">
              <input id="dl-reason" className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Annual leave" />
            </Field>
          </div>
        </form>
      </Modal>
    </>
  );
}
