import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { ArrowLeft, CalendarX, Pause, Plus, Save, Trash2, Undo2, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  ConfirmDialog,
  DetailTitle,
  EmptyState,
  ErrorBanner,
  Field,
  InfoBanner,
  LinkBtn,
  Modal,
  PricingLayout,
  RecordLink,
  StatusPill,
  Tag,
  humanize,
  inputCls,
  notifyUndo,
  type ApiError,
} from "@/components/pricing/kit";
import {
  FORMULAS,
  OPERATORS,
  REASON_CODES,
  RULES,
  RULE_ACTIONS,
  RULE_ATTRIBUTES,
  RULE_TYPES,
  STRATEGIES,
  type Condition,
  type PricingRule,
} from "@/lib/pricing/data";
import { actionSummary, conditionSummary } from "@/lib/pricing/rules";

export const Route = createFileRoute("/pricing/rules/$id")({
  head: () => ({ meta: [{ title: "Pricing rule · Rebate Ninja" }] }),
  component: Page,
});

type Tier = { from: string; to: string; pct: string };

function parseTiers(v?: string): Tier[] {
  if (!v) return [{ from: "1", to: "99", pct: "0" }];
  return v.split("·").map((s) => {
    const m = s.trim().match(/^(\d+)(?:–(\d+)|\+):\s*([\d.]+)%$/);
    return m ? { from: m[1], to: m[2] ?? "", pct: m[3] } : { from: "", to: "", pct: "" };
  });
}
/** Operator enums arrive Title Case ("Equal To"); labels are sentence case. */
const sentence = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();
const tiersToValue = (t: Tier[]) => t.map((x) => `${x.from}${x.to ? `–${x.to}` : "+"}: ${x.pct}%`).join(" · ");

const blankRule = (): PricingRule => ({
  id: "new",
  name: "",
  type: "CUSTOMER_PRICE",
  strategy: "VALUE_BASED",
  status: "DRAFT",
  version: 1,
  priority: 10,
  conditions: [],
  action: { type: "SET_PRICE", value: "" },
  effectiveFrom: "",
  owner: "Riya Shah",
  lastUpdated: "2026-10-29 14:15",
});

function Page() {
  const { id } = Route.useParams();
  return <Editor key={id} id={id} />;
}

const ACTION_INPUT: Partial<Record<PricingRule["action"]["type"], { label: string; min: number; max?: number; step: string; hint: string }>> = {
  SET_PRICE: { label: "Price (GBP)", min: 0, step: "0.01", hint: "Net price per unit, e.g. 95.00" },
  DISCOUNT_PCT: { label: "Discount (%)", min: 0, max: 100, step: "0.1", hint: "Between 0 and 100, e.g. 4" },
  MARKUP_PCT: { label: "Markup (%)", min: 0, max: 500, step: "0.1", hint: "Added on top of the list price, e.g. 2" },
  TARGET_MARGIN: { label: "Target margin (%)", min: 0, max: 95, step: "0.1", hint: "Between 0 and 95, e.g. 30" },
  COST_PLUS_PCT: { label: "Cost plus (%)", min: 0, max: 500, step: "0.1", hint: "Uplift on cost, e.g. 35" },
};

function Editor({ id }: { id: string }) {
  const isNew = id === "new";
  const navigate = useNavigate();
  const original = RULES.find((r) => r.id === id);
  const [rules, setRules] = useState<PricingRule[]>(RULES);
  const [rule, setRule] = useState<PricingRule>(original ? structuredClone(original) : blankRule());
  const [tiers, setTiers] = useState<Tier[]>(parseTiers(original?.action.type === "APPLY_TIERS" ? original.action.value : undefined));
  const [baseline, setBaseline] = useState(() => JSON.stringify({ rule: original ?? blankRule(), tiers: parseTiers(original?.action.type === "APPLY_TIERS" ? original.action.value : undefined) }));
  const [error, setError] = useState<ApiError | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState<"save" | "activate" | "version" | null>(null);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasonCode, setReasonCode] = useState("");
  const [reasonText, setReasonText] = useState("");
  const [reasonSubmitted, setReasonSubmitted] = useState(false);

  if (!isNew && !original) {
    return (
      <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Strategy & segmentation" }, { label: "Pricing rules", to: "/pricing/rules" }, { label: id }]}>
        <h1 className="sr-only">Rule not found</h1>
        <EmptyState
          title={`Rule ${id} not found`}
          action={
            <LinkBtn to="/pricing/rules" variant="subtle" icon={ArrowLeft}>
              Back to pricing rules
            </LinkBtn>
          }
        >
          It may have been removed, or the link is out of date.
        </EmptyState>
      </PricingLayout>
    );
  }

  const versions = rules.filter((r) => r.name === rule.name && rule.name).sort((a, b) => b.version - a.version);
  const effective: PricingRule = rule.action.type === "APPLY_TIERS" ? { ...rule, action: { ...rule.action, value: tiersToValue(tiers) } } : rule;
  const dirty = JSON.stringify({ rule, tiers }) !== baseline;

  const setCond = (i: number, patch: Partial<Condition>) => setRule((r) => ({ ...r, conditions: r.conditions.map((c, j) => (j === i ? { ...c, ...patch } : c)) }));
  const nextGroup = () => Math.max(0, ...rule.conditions.map((c) => c.group ?? 0)) + 1;

  /** Field errors keyed by input id — order = visual order, so the first key is focused on submit. */
  const fieldErrors = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!rule.name.trim()) e["rule-name"] = "Enter a rule name, e.g. Customer A — Widget.";
    if (!Number.isInteger(rule.priority) || rule.priority < 1 || rule.priority > 999) e["rule-priority"] = "Enter a whole number between 1 and 999.";
    if (!rule.effectiveFrom) e["rule-from"] = "Choose the date this rule starts.";
    if (rule.effectiveFrom && rule.effectiveTo && rule.effectiveTo < rule.effectiveFrom) e["rule-to"] = "The end date must be on or after the start date.";
    rule.conditions.forEach((c, i) => {
      if (!c.value.trim()) e[`rule-cond-${i}`] = c.operator === "Between" ? "Enter a range, e.g. 100 … 499." : "Enter a value to match, e.g. Widget.";
    });
    if (rule.conditions.length === 0) e["rule-add-condition"] = "Add at least one condition so the rule knows when to apply.";
    if (rule.action.type === "APPLY_TIERS") {
      tiers.forEach((t, i) => {
        const from = Number(t.from);
        const to = t.to === "" ? Infinity : Number(t.to);
        const p = Number(t.pct);
        if (t.from === "" || from < 1 || !Number.isInteger(from)) e[`rule-tier-${i}`] = "Enter a whole starting quantity of 1 or more.";
        else if (to < from) e[`rule-tier-${i}`] = "The ‘to’ quantity must be at least the ‘from’ quantity.";
        else if (t.pct === "" || p < 0 || p > 100) e[`rule-tier-${i}`] = "Enter a discount between 0 and 100%.";
      });
    } else {
      const v = effective.action.value?.trim() ?? "";
      const spec = ACTION_INPUT[rule.action.type];
      if (!v) e["rule-action-value"] = rule.action.type === "APPLY_FORMULA" ? "Select the formula this rule applies." : `Enter a value. ${spec?.hint ?? ""}`;
      else if (spec && (Number(v) < spec.min || (spec.max !== undefined && Number(v) > spec.max))) e["rule-action-value"] = spec.hint + ".";
    }
    return e;
  };
  const errs = fieldErrors();
  const fe = (k: string) => (submitted ? errs[k] : undefined);

  /** Rejection banner with the US-ST-01 error code; field errors stay inline. */
  const rejection = (): ApiError | null => {
    if (rule.conditions.length === 0)
      return { errorClass: "VALIDATION", code: "RULE_NEEDS_CONDITION", message: "A rule needs at least one condition. Add an AND condition or an OR group.", field: "conditions" };
    const missing = [
      !rule.name.trim() && "name",
      !rule.effectiveFrom && "effectiveFrom",
      rule.action.type !== "APPLY_TIERS" && !effective.action.value?.trim() && "action.value",
    ].filter(Boolean) as string[];
    if (missing.length) return { errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Fill in the required fields highlighted below.", field: missing.join(", ") };
    return null;
  };

  /** Returns true when valid; otherwise shows errors and focuses the first invalid field. */
  const check = () => {
    setSubmitted(true);
    setError(rejection());
    const first = Object.keys(errs)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return false;
    }
    return true;
  };

  const persist = (r: PricingRule) => {
    // Keep the in-memory mock store in sync so version links resolve after navigation.
    const i = RULES.findIndex((x) => x.id === r.id);
    if (i >= 0) RULES[i] = r;
    else RULES.push(r);
    setRules((rs) => (rs.some((x) => x.id === r.id) ? rs.map((x) => (x.id === r.id ? r : x)) : [...rs, r]));
  };
  const markClean = (r: PricingRule) => setBaseline(JSON.stringify({ rule: r, tiers }));

  const saveDraft = (ev?: FormEvent) => {
    ev?.preventDefault();
    if (!check()) return;
    if (original?.status === "ACTIVE") {
      setReasonSubmitted(false);
      setReasonOpen(true);
      return;
    }
    setBusy("save");
    window.setTimeout(() => {
      const saved = { ...effective, id: isNew ? `R-${200 + rules.length}` : effective.id, status: "DRAFT" as const, lastUpdated: "2026-10-29 14:15" };
      persist(saved);
      setRule(saved);
      markClean(saved);
      setBusy(null);
      toast.success(`${saved.name} saved as draft`, { description: "No custom code required — the rule is stored as configuration." });
      // After create, land on the created record.
      if (isNew) navigate({ to: "/pricing/rules/$id", params: { id: saved.id } });
    }, 400);
  };

  const reasonError = !reasonCode ? "Select why this rule is changing." : reasonCode === "OTHER" && !reasonText.trim() ? "Describe the reason — it is kept in the version history." : undefined;
  const confirmNewVersion = (ev?: FormEvent) => {
    ev?.preventDefault();
    setReasonSubmitted(true);
    if (reasonError) {
      document.getElementById(!reasonCode ? "rule-reason-code" : "rule-reason-text")?.focus();
      return;
    }
    setBusy("version");
    window.setTimeout(() => {
      const v: PricingRule = { ...effective, id: `${original!.id}v${original!.version + 1}`, version: original!.version + 1, status: "DRAFT", reasonCode, lastUpdated: "2026-10-29 14:15" };
      persist(v);
      setBusy(null);
      setReasonOpen(false);
      toast.success(`Version ${v.version} created as draft`, { description: `Version ${original!.version} stays active until v${v.version} is activated.` });
      navigate({ to: "/pricing/rules/$id", params: { id: v.id } });
    }, 400);
  };

  const future = rule.effectiveFrom > "2026-10-29";
  const supersedes = rules.filter((x) => x.name === rule.name && x.status === "ACTIVE" && x.id !== rule.id);

  const requestActivate = () => {
    if (!check()) return;
    setConfirmActivate(true);
  };

  const activate = () => {
    setBusy("activate");
    window.setTimeout(() => {
      // A future effective date schedules the rule; the current active version keeps pricing until then.
      if (!future) supersedes.forEach((x) => persist({ ...x, status: "SUPERSEDED" }));
      const act = { ...effective, status: future ? ("SCHEDULED" as const) : ("ACTIVE" as const) };
      persist(act);
      setRule(act);
      markClean(act);
      setBusy(null);
      setConfirmActivate(false);
      toast.success(future ? `${act.name} scheduled to activate on ${rule.effectiveFrom}` : `${act.name} activated`, {
        description: future
          ? supersedes.length
            ? `${supersedes.map((s) => `v${s.version}`).join(", ")} keeps pricing until then.`
            : "Current prices are unchanged until then."
          : supersedes.length
            ? "The previous version is now superseded."
            : undefined,
      });
    }, 400);
  };

  // Unscheduling is reversible → undo toast instead of a confirm dialog.
  const unschedule = () => {
    const before = rule;
    const r = { ...rule, status: "DRAFT" as const };
    persist(r);
    setRule(r);
    markClean(r);
    notifyUndo(`${rule.name} unscheduled — back to draft`, () => {
      persist(before);
      setRule(before);
      markClean(before);
    });
  };

  // Deactivation is reversible → undo toast instead of a confirm dialog.
  const deactivate = () => {
    const before = rule;
    const r = { ...rule, status: "INACTIVE" as const };
    persist(r);
    setRule(r);
    markClean(r);
    notifyUndo(`${rule.name} deactivated`, () => {
      persist(before);
      setRule(before);
      markClean(before);
    });
  };

  const discard = () => {
    const b = JSON.parse(baseline) as { rule: PricingRule; tiers: Tier[] };
    setRule(b.rule);
    setTiers(b.tiers);
    setSubmitted(false);
    setError(null);
    setConfirmDiscard(false);
    toast("Changes discarded");
  };

  const scheduled = rule.status === "SCHEDULED";
  const readOnly = rule.status === "SUPERSEDED" || scheduled;
  const actionSpec = ACTION_INPUT[rule.action.type];

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Strategy & segmentation" }, { label: "Pricing rules", to: "/pricing/rules" }, { label: isNew ? "Create rule" : rule.name }]}>
      <DetailTitle
        title={isNew && rule.id === "new" ? "Create pricing rule" : rule.name || "Untitled rule"}
        status={rule.status}
        subtitle={
          <span className="inline-flex flex-wrap items-center gap-2">
            {!isNew ? `${rule.id} · v${rule.version} · owner ${rule.owner} · last updated ${rule.lastUpdated}` : "Build a rule from attributes and one action. Saved as draft."}
            {dirty && <StatusPill status="PENDING" label="Unsaved changes" />}
          </span>
        }
        chips={
          <>
            <Tag tone="info">{humanize(rule.type)}</Tag>
            <Tag tone="brand">{humanize(rule.strategy)}</Tag>
          </>
        }
        actions={
          <>
            {dirty ? (
              <Btn variant="subtle" icon={Undo2} onClick={() => setConfirmDiscard(true)} disabled={!!busy}>
                Discard changes
              </Btn>
            ) : (
              // Existing rules use the page's back link; a new rule still needs an explicit Cancel.
              isNew && (
                <LinkBtn to="/pricing/rules" variant="subtle" icon={ArrowLeft}>
                  Cancel
                </LinkBtn>
              )
            )}
            {scheduled ? (
              <Btn variant="outline" icon={CalendarX} onClick={unschedule}>
                Unschedule
              </Btn>
            ) : rule.status === "ACTIVE" && !dirty ? (
              <Btn variant="outline" icon={Pause} onClick={deactivate}>
                Deactivate
              </Btn>
            ) : (
              <Btn variant="outline" icon={Save} type="submit" form="rule-form" loading={busy === "save"} disabled={readOnly || (!!busy && busy !== "save")}>
                Save draft
              </Btn>
            )}
            {rule.status !== "ACTIVE" && !scheduled && (
              <Btn icon={Zap} onClick={requestActivate} disabled={readOnly || !!busy || dirty} title={dirty ? "Save your changes before activating" : undefined}>
                Activate
              </Btn>
            )}
          </>
        }
      />
      {scheduled ? (
        <InfoBanner title={`Scheduled to activate on ${rule.effectiveFrom}`}>
          This version starts pricing on its effective date{supersedes.length ? ` and supersedes ${supersedes.map((s) => `v${s.version}`).join(", ")} then` : ""}. It is read-only while scheduled — unschedule it to make changes.
        </InfoBanner>
      ) : (
        readOnly && <InfoBanner title="Superseded version">This version is read-only. Open the current version above to make changes.</InfoBanner>
      )}
      {rule.status !== "ACTIVE" && dirty && !readOnly && <p className="text-xs text-muted-foreground -mt-2 mb-4">Save your changes before activating.</p>}

      {versions.length > 1 && (
        <nav className="flex flex-wrap items-center gap-2 mb-4 text-sm" aria-label="Rule versions">
          <span className="text-muted-foreground">Versions:</span>
          {versions.map((v) => (
            <Link key={v.id} to="/pricing/rules/$id" params={{ id: v.id }} aria-current={v.id === rule.id ? "page" : undefined} className={`inline-flex items-center gap-2 px-3 py-1.5 min-h-10 rounded-full border ${v.id === rule.id ? "border-brand bg-brand-soft" : "border-border bg-card hover:bg-muted"}`}>
              v{v.version} <StatusPill status={v.status} />
            </Link>
          ))}
        </nav>
      )}
      {original?.status === "ACTIVE" && (
        <InfoBanner title="Editing an active rule">Saving creates a new draft version with a reason code. This version stays active until the new version is activated.</InfoBanner>
      )}

      <ErrorBanner error={error} onClose={() => setError(null)} />

      <form id="rule-form" onSubmit={saveDraft} noValidate className="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-6">
        <div className="space-y-6 min-w-0">
          <Card title="Rule details" subtitle={<><span className="text-destructive" aria-hidden>*</span> Required</>}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Rule name" required error={fe("rule-name")}>
                <input id="rule-name" className={inputCls} value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} disabled={readOnly} placeholder="e.g. Customer A — Widget" />
              </Field>
              <Field label="Rule type" required>
                <select className={inputCls} value={rule.type} onChange={(e) => setRule({ ...rule, type: e.target.value as PricingRule["type"] })} disabled={readOnly}>
                  {RULE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {humanize(t)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Strategy" required>
                <select className={inputCls} value={rule.strategy} onChange={(e) => setRule({ ...rule, strategy: e.target.value as PricingRule["strategy"] })} disabled={readOnly}>
                  {STRATEGIES.map((t) => (
                    <option key={t} value={t}>
                      {humanize(t)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority" required hint="Lower number wins inside the same precedence tier." error={fe("rule-priority")}>
                <input id="rule-priority" type="number" inputMode="numeric" min={1} max={999} step={1} className={inputCls} value={Number.isNaN(rule.priority) ? "" : rule.priority} onChange={(e) => setRule({ ...rule, priority: e.target.value === "" ? NaN : Number(e.target.value) })} disabled={readOnly} />
              </Field>
              <Field label="Effective from" required hint="A future date schedules activation." error={fe("rule-from")}>
                <input id="rule-from" type="date" className={inputCls} value={rule.effectiveFrom} onChange={(e) => setRule({ ...rule, effectiveFrom: e.target.value })} disabled={readOnly} />
              </Field>
              <Field label="Effective to" hint="Leave blank for open-ended." error={fe("rule-to")}>
                <input id="rule-to" type="date" min={rule.effectiveFrom || undefined} className={inputCls} value={rule.effectiveTo ?? ""} onChange={(e) => setRule({ ...rule, effectiveTo: e.target.value || undefined })} disabled={readOnly} />
              </Field>
            </div>
            <p className="text-xs text-muted-foreground mt-4">
              See how this rule ranks against other rule tiers in{" "}
              <Link to="/pricing/precedence" className="text-brand font-medium hover:underline">
                Rule precedence
              </Link>
              .
            </p>
          </Card>

          <Card
            title="Conditions"
            subtitle="All conditions must match. Conditions in the same OR group match if any one is true."
            actions={
              !readOnly && (
                <>
                  <Btn variant="subtle" size="sm" icon={Plus} onClick={() => { const g = nextGroup(); setRule((r) => ({ ...r, conditions: [...r.conditions, { attribute: "Geography", operator: "Equal To", value: "", group: g }, { attribute: "Geography", operator: "Equal To", value: "", group: g }] })); }}>
                    Add OR group
                  </Btn>
                  <Btn id="rule-add-condition" variant="outline" size="sm" icon={Plus} onClick={() => setRule((r) => ({ ...r, conditions: [...r.conditions, { attribute: "Product", operator: "Equal To", value: "" }] }))}>
                    Add AND condition
                  </Btn>
                </>
              )
            }
          >
            {rule.conditions.length === 0 && (
              <div role={fe("rule-add-condition") ? "alert" : undefined} className={`rounded-lg border border-dashed p-6 text-center text-sm ${fe("rule-add-condition") ? "border-destructive text-destructive" : "border-border text-muted-foreground"}`}>
                No conditions yet. Add at least one so the rule knows when to apply.
              </div>
            )}
            <div className="space-y-4">
              {rule.conditions.map((c, i) => {
                const err = fe(`rule-cond-${i}`);
                const label = c.group ? `OR group ${c.group}` : i === 0 ? "Where" : "And";
                return (
                  <div key={i} className={`grid grid-cols-1 sm:grid-cols-[96px_1fr_1fr_1.3fr_40px] gap-2 items-start ${c.group ? "pl-3 border-l-4 border-info" : ""}`}>
                    <span className="text-sm font-medium text-foreground sm:pt-3">{label}</span>
                    <select className={inputCls} value={c.attribute} onChange={(e) => setCond(i, { attribute: e.target.value })} disabled={readOnly} aria-label={`Condition ${i + 1} attribute`}>
                      {RULE_ATTRIBUTES.map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                    </select>
                    <select className={inputCls} value={c.operator} onChange={(e) => setCond(i, { operator: e.target.value })} disabled={readOnly} aria-label={`Condition ${i + 1} operator`}>
                      {OPERATORS.map((o) => (
                        <option key={o} value={o}>
                          {sentence(o)}
                        </option>
                      ))}
                    </select>
                    <div>
                      <input
                        id={`rule-cond-${i}`}
                        className={inputCls}
                        value={c.value}
                        aria-invalid={!!err || undefined}
                        aria-describedby={err ? `rule-cond-${i}-msg` : undefined}
                        placeholder={c.operator === "Between" ? "e.g. 100 … 499" : c.operator.includes("In") ? "e.g. CB-2.5, CB-6.0" : "e.g. Widget"}
                        onChange={(e) => setCond(i, { value: e.target.value })}
                        disabled={readOnly}
                        aria-label={`Condition ${i + 1} value`}
                      />
                      {err && (
                        <p id={`rule-cond-${i}-msg`} className="text-xs text-destructive mt-1.5">
                          {err}
                        </p>
                      )}
                    </div>
                    {!readOnly && (
                      <button
                        type="button"
                        aria-label={`Remove condition ${i + 1}`}
                        className="size-10 grid place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted"
                        onClick={() => setRule((r) => ({ ...r, conditions: r.conditions.filter((_, j) => j !== i) }))}
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>

          <Card title="Action" subtitle="Exactly one action per rule.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Action type" required>
                <select className={inputCls} value={rule.action.type} onChange={(e) => setRule({ ...rule, action: { type: e.target.value as PricingRule["action"]["type"], value: "" } })} disabled={readOnly}>
                  {RULE_ACTIONS.map((a) => (
                    <option key={a} value={a}>
                      {humanize(a)}
                    </option>
                  ))}
                </select>
              </Field>
              {rule.action.type === "APPLY_FORMULA" ? (
                <Field label="Formula" required error={fe("rule-action-value")}>
                  <select id="rule-action-value" className={inputCls} value={rule.action.value ?? ""} onChange={(e) => setRule({ ...rule, action: { ...rule.action, value: e.target.value } })} disabled={readOnly}>
                    <option value="">Select formula…</option>
                    {FORMULAS.map((f) => (
                      <option key={f.id} value={`${f.id} ${f.name}`}>
                        {f.id} · {f.name} ({humanize(f.status)})
                      </option>
                    ))}
                  </select>
                </Field>
              ) : rule.action.type !== "APPLY_TIERS" ? (
                <Field label={actionSpec?.label ?? "Value"} required hint={actionSpec?.hint} error={fe("rule-action-value")}>
                  <input
                    id="rule-action-value"
                    type="number"
                    inputMode="decimal"
                    min={actionSpec?.min}
                    max={actionSpec?.max}
                    step={actionSpec?.step ?? "any"}
                    className={inputCls}
                    value={rule.action.value ?? ""}
                    onChange={(e) => setRule({ ...rule, action: { ...rule.action, value: e.target.value } })}
                    disabled={readOnly}
                  />
                </Field>
              ) : null}
            </div>
            {rule.action.type === "APPLY_FORMULA" && (
              <p className="text-xs text-muted-foreground mt-3">
                Build or edit formulas in{" "}
                <Link to="/pricing/formulas" className="text-brand font-medium hover:underline">
                  Formula pricing
                </Link>
                .
              </p>
            )}
            {rule.action.type === "APPLY_TIERS" && (
              <fieldset className="mt-4">
                <legend className="text-sm font-medium text-foreground mb-2">Volume tiers</legend>
                <div className="space-y-4">
                  {tiers.map((t, i) => {
                    const err = fe(`rule-tier-${i}`);
                    return (
                      <div key={i}>
                        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_40px] gap-2">
                          <input id={`rule-tier-${i}`} type="number" inputMode="numeric" min={1} step={1} aria-label={`Tier ${i + 1} from quantity`} aria-invalid={!!err || undefined} aria-describedby={err ? `rule-tier-${i}-msg` : undefined} className={inputCls} placeholder="From qty, e.g. 100" value={t.from} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} disabled={readOnly} />
                          <input type="number" inputMode="numeric" min={1} step={1} aria-label={`Tier ${i + 1} to quantity (blank for and above)`} className={inputCls} placeholder="To qty (blank = and above)" value={t.to} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} disabled={readOnly} />
                          <input type="number" inputMode="decimal" min={0} max={100} step="0.1" aria-label={`Tier ${i + 1} discount (%)`} className={inputCls} placeholder="Discount %, e.g. 3" value={t.pct} onChange={(e) => setTiers(tiers.map((x, j) => (j === i ? { ...x, pct: e.target.value } : x)))} disabled={readOnly} />
                          {!readOnly && (
                            <button type="button" aria-label={`Remove tier ${i + 1}`} disabled={tiers.length === 1} className="size-10 grid place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted disabled:opacity-50" onClick={() => setTiers(tiers.filter((_, j) => j !== i))}>
                              <Trash2 className="size-4" aria-hidden />
                            </button>
                          )}
                        </div>
                        {err && (
                          <p id={`rule-tier-${i}-msg`} className="text-xs text-destructive mt-1.5">
                            {err}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
                {!readOnly && (
                  <Btn variant="outline" size="sm" icon={Plus} className="mt-3" onClick={() => setTiers([...tiers, { from: "", to: "", pct: "" }])}>
                    Add tier
                  </Btn>
                )}
              </fieldset>
            )}
          </Card>
        </div>

        <div className="space-y-6 min-w-0">
          <Card title="Rule summary">
            <p className="text-sm leading-relaxed">
              <b>When</b> {conditionSummary(rule.conditions)}
              <br />
              <b>then</b> {actionSummary(effective.action)}
              <br />
              <span className="text-muted-foreground">
                Priority {Number.isNaN(rule.priority) ? "—" : rule.priority} · effective {rule.effectiveFrom || "—"} → {rule.effectiveTo ?? "open"}
              </span>
            </p>
          </Card>
          <div className="[&>div]:mb-0">
          <InfoBanner tone="success" title="No custom code">
            Rules are stored as configuration (attributes, operators, one action) and evaluated by the pricing engine. Lifecycle: Draft → Active → Inactive → Superseded. Activating with a future date schedules the rule until that date.
          </InfoBanner>
          </div>
          <Card title="Version history" padded={false}>
            <ul className="divide-y divide-border" aria-label="Rule version history">
              {(versions.length ? versions : [rule]).map((r) => (
                <li key={r.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-6 py-3 text-sm ${r.id === rule.id ? "bg-brand-soft/60" : ""}`}>
                  {r.id === rule.id || r.id === "new" ? (
                    <span className="font-semibold tabular-nums">v{r.version}</span>
                  ) : (
                    <RecordLink to="/pricing/rules/$id" params={{ id: r.id }}>
                      v{r.version}
                    </RecordLink>
                  )}
                  <StatusPill status={r.status} />
                  <span className="text-muted-foreground">{r.reasonCode ? humanize(r.reasonCode) : "No reason code"}</span>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums whitespace-nowrap">{r.lastUpdated}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </form>

      <ConfirmDialog
        open={confirmActivate}
        title={future ? `Schedule ${rule.name} to activate?` : `Activate ${rule.name}?`}
        description={
          future
            ? `The rule will start pricing on ${rule.effectiveFrom}. Until then it stays scheduled and current prices are unchanged.`
            : `The rule starts pricing immediately${supersedes.length ? `, and ${supersedes.map((s) => `v${s.version}`).join(", ")} will be superseded` : ""}. ${conditionSummary(rule.conditions)} → ${actionSummary(effective.action)}.`
        }
        confirmLabel={future ? "Schedule activation" : "Activate rule"}
        loading={busy === "activate"}
        onConfirm={activate}
        onCancel={() => setConfirmActivate(false)}
      />

      <ConfirmDialog
        open={confirmDiscard}
        tone="danger"
        title="Discard unsaved changes?"
        description="Your edits to this rule will be lost and the last saved version restored."
        confirmLabel="Discard changes"
        onConfirm={discard}
        onCancel={() => setConfirmDiscard(false)}
      />

      <Modal
        open={reasonOpen}
        onClose={() => setReasonOpen(false)}
        dismissible={busy !== "version"}
        title={`Create version ${(original?.version ?? 0) + 1}`}
        subtitle={`Version ${original?.version} stays active until the new version is activated.`}
        footer={
          <>
            <Btn variant="subtle" onClick={() => setReasonOpen(false)} disabled={busy === "version"}>
              Cancel
            </Btn>
            <Btn type="submit" form="rule-reason-form" loading={busy === "version"}>
              Create draft version
            </Btn>
          </>
        }
      >
        <form id="rule-reason-form" className="space-y-4" onSubmit={confirmNewVersion} noValidate>
          <Field label="Reason code" required error={reasonSubmitted && !reasonCode ? reasonError : undefined}>
            <select id="rule-reason-code" className={inputCls} value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
              <option value="">Select reason…</option>
              {REASON_CODES.map((r) => (
                <option key={r} value={r}>
                  {humanize(r)}
                </option>
              ))}
            </select>
          </Field>
          {reasonCode === "OTHER" && (
            <Field label="Reason text" required error={reasonSubmitted ? reasonError : undefined}>
              <textarea id="rule-reason-text" rows={2} className={`${inputCls} h-auto py-2`} value={reasonText} onChange={(e) => setReasonText(e.target.value)} />
            </Field>
          )}
        </form>
      </Modal>
    </PricingLayout>
  );
}
