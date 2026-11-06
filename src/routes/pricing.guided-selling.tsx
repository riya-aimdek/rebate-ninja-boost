import { createFileRoute } from "@tanstack/react-router";
import { useId, useMemo, useState } from "react";
import { Compass, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  ConfirmDialog,
  DataTable,
  Drawer,
  EmptyState,
  ErrorBanner,
  Field,
  FilterPills,
  InfoBanner,
  ListHeader,
  MissingHint,
  Modal,
  PricingLayout,
  StatusPill,
  Tag,
  Toggle,
  humanize,
  inputCls,
  missingFields,
  type ApiError,
} from "@/components/pricing/kit";
import { RequireAccess } from "@/components/pricing/access";
import { PRODUCTS, REASON_CODES } from "@/lib/pricing/data";
import { NOW, TODAY_ISO } from "@/lib/pricing/deals";
import { GUIDED_FLOWS, QUESTION_KINDS, outcomeFor, saveFlow, validateFlow, visibleQuestions, type Answers, type FlowOutcome, type FlowQuestion, type GuidedFlow } from "@/lib/pricing/cpq";
import { userName, useSession } from "@/lib/pricing/session";

export const Route = createFileRoute("/pricing/guided-selling")({
  head: () => ({ meta: [{ title: "Guided selling · Rebate Ninja" }] }),
  component: Page,
});

type Status = GuidedFlow["status"];
const STATUSES: Status[] = ["ACTIVE", "DRAFT", "SUPERSEDED", "INACTIVE"];
const TIERS: FlowOutcome["tier"][] = ["Good", "Better", "Best", "Volume"];

function Page() {
  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "CPQ & quoting" }, { label: "Guided selling" }]}>
      <RequireAccess roles={["PRICING_ADMIN", "DEAL_DESK", "SALES_MANAGER"]}>
        <Flows />
      </RequireAccess>
    </PricingLayout>
  );
}

/* Conditions are edited as text: "Q1 = NEW_BUILD; Q3 >= 100". */
const whenToText = (w: FlowOutcome["when"]) => w.map((c) => (/^(>=|<=|>|<)/.test(c.equals) ? `${c.questionId} ${c.equals.replace(/^(>=|<=|>|<)/, "$1 ")}` : `${c.questionId} = ${c.equals}`)).join("; ");
const textToWhen = (s: string): FlowOutcome["when"] =>
  s
    .split(";")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const m = x.match(/^(Q\d+)\s*(=|>=|<=|>|<)\s*(.+)$/i);
      return m ? { questionId: m[1].toUpperCase(), equals: m[2] === "=" ? m[3].trim().toUpperCase().replace(/\s+/g, "_") : `${m[2]}${m[3].trim()}` } : { questionId: "?", equals: x };
    });

function Flows() {
  const { user, role } = useSession();
  const canEdit = role === "PRICING_ADMIN" || role === "DEAL_DESK";
  const [rows, setRows] = useState<GuidedFlow[]>(() => [...GUIDED_FLOWS]);
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [editing, setEditing] = useState<GuidedFlow | null>(null);
  const [origin, setOrigin] = useState("");
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState<"" | "save" | "activate">("");
  const [testing, setTesting] = useState<GuidedFlow | null>(null);
  const [activating, setActivating] = useState<GuidedFlow | null>(null);

  const list = rows.filter((f) => (!search || `${f.id} ${f.name}`.toLowerCase().includes(search.toLowerCase())) && (statuses.length === 0 || statuses.includes(f.status))).sort((a, b) => a.name.localeCompare(b.name) || b.version - a.version);
  const sync = () => setRows([...GUIDED_FLOWS]);

  const openEdit = (f?: GuidedFlow) => {
    const base: GuidedFlow = f
      ? f.status === "DRAFT"
        ? structuredClone(f)
        : { ...structuredClone(f), id: `${f.id.replace(/v\d+$/, "")}v${f.version + 1}`, version: f.version + 1, status: "DRAFT", effectiveFrom: TODAY_ISO, reasonCode: "" }
      : { id: `GF-${String(rows.length + 1).padStart(2, "0")}`, name: "", version: 1, status: "DRAFT", effectiveFrom: TODAY_ISO, updatedBy: user.id, updatedAt: NOW, questions: [{ id: "Q1", text: "", kind: "SINGLE", required: true, options: [] }], outcomes: [{ id: "O1", label: "Default", when: [], products: [], tier: "Better", note: "" }] };
    setEditing(base);
    setOrigin(JSON.stringify(base));
    setError(null);
  };
  const dirty = editing !== null && JSON.stringify(editing) !== origin;
  const hintId = useId();
  const missing = editing
    ? missingFields([
        ["Flow name", editing.name],
        ["Effective from", editing.effectiveFrom],
        ["Reason code", editing.reasonCode ?? "", editing.version > 1],
        ...editing.questions.map((q) => [`${q.id} question`, q.text] as [string, string]),
        ...editing.outcomes.map((o, i) => [`Outcome ${i + 1} name`, o.label] as [string, string]),
      ])
    : [];

  const save = (activate: boolean) => {
    if (!editing) return;
    const e = validateFlow(editing) ?? (editing.version > 1 && !editing.reasonCode ? ({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Select a reason code for the new version.", field: "reasonCode" } as ApiError) : null);
    setError(e as ApiError | null);
    if (e) return;
    setSaving(activate ? "activate" : "save");
    window.setTimeout(() => {
      const f: GuidedFlow = { ...editing, updatedBy: user.id, updatedAt: NOW };
      if (activate) doActivate(f);
      else {
        saveFlow(f);
        toast.success(`Flow ${f.name} v${f.version} saved as draft`, { description: "The active version keeps running until you activate this one." });
      }
      sync();
      setSaving("");
      setEditing(null);
    }, 400);
  };

  const doActivate = (f: GuidedFlow) => {
    const future = f.effectiveFrom > TODAY_ISO;
    for (const x of GUIDED_FLOWS) if (x.name === f.name && x.status === "ACTIVE" && x.id !== f.id && !future) saveFlow({ ...x, status: "SUPERSEDED" });
    saveFlow({ ...f, status: "ACTIVE" });
    toast.success(`${f.name} v${f.version} activated`, { description: future ? `Takes over from the current version on ${f.effectiveFrom}.` : "Earlier versions are superseded. New quotes use this flow." });
  };

  const set = (patch: Partial<GuidedFlow>) => editing && setEditing({ ...editing, ...patch });
  const setQ = (i: number, patch: Partial<FlowQuestion>) => editing && set({ questions: editing.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) });
  const setO = (i: number, patch: Partial<FlowOutcome>) => editing && set({ outcomes: editing.outcomes.map((o, j) => (j === i ? { ...o, ...patch } : o)) });

  return (
    <>
      <ListHeader
        title="Guided selling"
        count={list.length}
        noun="flow"
        subtitle="No-code question flows that lead reps to the right products and price tier in the quote wizard."
        search={search}
        onSearch={setSearch}
        actions={
          canEdit && (
            <Btn icon={Plus} onClick={() => openEdit()}>
              Create flow
            </Btn>
          )
        }
      />
      <InfoBanner title="Where the price range comes from">
        The minimum, recommended and maximum price a rep sees comes from guardrails and segment guidance for that customer — never from the flow author. Flows are versioned and activated like pricing rules.
      </InfoBanner>
      {!canEdit && <InfoBanner tone="neutral">You can view and test flows. Pricing administrators and the deal desk can change them.</InfoBanner>}
      <FilterPills<Status> label="Status" selected={statuses} onChange={setStatuses} options={STATUSES.map((s) => ({ key: s, label: humanize(s), count: rows.filter((f) => f.status === s).length }))} />

      <DataTable<GuidedFlow>
        caption="Guided selling flows"
        rows={list}
        rowKey={(f) => f.id}
        onRowClick={setTesting}
        empty={
          search || statuses.length ? (
            <EmptyState icon={Compass} title="No flows match" action={<Btn variant="subtle" onClick={() => (setSearch(""), setStatuses([]))}>Clear filters</Btn>}>
              Try a different search or status.
            </EmptyState>
          ) : (
            <EmptyState icon={Compass} title="No guided-selling flows yet" />
          )
        }
        columns={[
          { key: "name", header: "Flow", className: "min-w-52", cell: (f) => <div><div className="font-medium">{f.name}</div><div className="text-xs font-mono text-muted-foreground">{f.id}</div></div> },
          { key: "v", header: "Version", align: "right", cell: (f) => `v${f.version}` },
          { key: "q", header: "Questions", align: "right", cell: (f) => f.questions.length },
          { key: "o", header: "Outcomes", align: "right", cell: (f) => f.outcomes.length },
          { key: "eff", header: "Effective from", cell: (f) => <span className="tabular-nums">{f.effectiveFrom}</span> },
          { key: "by", header: "Updated", cell: (f) => <span className="whitespace-nowrap">{userName(f.updatedBy)} · {f.updatedAt}</span> },
          { key: "st", header: "Status", cell: (f) => <StatusPill status={f.status} /> },
          {
            key: "act",
            header: <span className="sr-only">Actions</span>,
            align: "right",
            cell: (f) =>
              canEdit && (
                <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                  {f.status === "DRAFT" && (
                    <Btn variant="outline" size="sm" icon={Power} onClick={() => (validateFlow(f) ? openEdit(f) : setActivating(f))}>
                      Activate
                    </Btn>
                  )}
                  {(f.status === "ACTIVE" || f.status === "DRAFT") && (
                    <Btn variant="subtle" size="sm" icon={Pencil} onClick={() => openEdit(f)}>
                      {f.status === "ACTIVE" ? "New version" : "Edit"}
                    </Btn>
                  )}
                </div>
              ),
          },
        ]}
      />

      <ConfirmDialog
        open={!!activating}
        title={`Activate ${activating?.name} v${activating?.version}?`}
        description={activating && activating.effectiveFrom > TODAY_ISO ? `It takes over on ${activating.effectiveFrom}; the current version runs until then.` : "New quotes will use this version straight away and the current version is superseded."}
        confirmLabel="Activate flow"
        onCancel={() => setActivating(null)}
        onConfirm={() => {
          if (activating) doActivate(activating);
          sync();
          setActivating(null);
        }}
      />

      <TestDrawer flow={testing} onClose={() => setTesting(null)} />

      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        dismissible={!dirty && !saving}
        size="lg"
        title={editing?.version && editing.version > 1 ? `${editing.name} — version ${editing.version} (draft)` : "Create flow"}
        subtitle={dirty ? "Unsaved changes" : "Questions, branching and outcomes. Saving keeps it in draft."}
        footer={
          <>
            <MissingHint id={hintId} missing={missing} />
            <Btn variant="subtle" onClick={() => setEditing(null)} disabled={!!saving}>
              Cancel
            </Btn>
            <Btn variant="outline" loading={saving === "save"} disabled={!!saving || missing.length > 0} aria-describedby={missing.length ? hintId : undefined} onClick={() => save(false)}>
              Save draft
            </Btn>
            <Btn loading={saving === "activate"} disabled={!!saving || missing.length > 0} aria-describedby={missing.length ? hintId : undefined} onClick={() => save(true)}>
              Save and activate
            </Btn>
          </>
        }
      >
        {editing && (
          <div className="space-y-6">
            <ErrorBanner error={error} onClose={() => setError(null)} />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Flow name" required>
                <input className={inputCls} value={editing.name} onChange={(e) => set({ name: e.target.value })} />
              </Field>
              <Field label="Effective from" required>
                <input type="date" className={inputCls} min={TODAY_ISO} value={editing.effectiveFrom} onChange={(e) => set({ effectiveFrom: e.target.value })} />
              </Field>
              {editing.version > 1 && (
                <Field label="Reason code" required>
                  <select className={inputCls} value={editing.reasonCode ?? ""} onChange={(e) => set({ reasonCode: e.target.value })}>
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

            <fieldset>
              <legend className="text-base font-semibold mb-3">Questions</legend>
              <ol className="space-y-3">
                {editing.questions.map((q, i) => (
                  <li key={i} className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between gap-3 mb-3">
                      <span className="text-sm font-semibold">Question {i + 1}</span>
                      <div className="flex items-center gap-2">
                        <Toggle checked={q.required} onChange={(v) => setQ(i, { required: v })} label="Mandatory" />
                        <button type="button" aria-label={`Remove question ${i + 1}`} onClick={() => set({ questions: editing.questions.filter((_, j) => j !== i) })} className="size-10 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-danger-soft">
                          <Trash2 className="size-4" aria-hidden />
                        </button>
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-x-4 gap-y-3">
                      <Field label="Question" required>
                        <input className={inputCls} value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} placeholder="e.g. What is the main use case?" />
                      </Field>
                      <Field label="Answer type">
                        <select className={inputCls} value={q.kind} onChange={(e) => setQ(i, { kind: e.target.value as FlowQuestion["kind"], options: e.target.value === "NUMBER" ? [] : q.options })}>
                          {QUESTION_KINDS.map((k) => (
                            <option key={k} value={k}>
                              {k === "SINGLE" ? "Single select" : k === "MULTI" ? "Multi select" : "Number"}
                            </option>
                          ))}
                        </select>
                      </Field>
                      {q.kind !== "NUMBER" && (
                        <Field label="Options" hint="Separate with commas">
                          <input
                            className={inputCls}
                            value={q.options.map((o) => o.label).join(", ")}
                            onChange={(e) =>
                              setQ(i, {
                                options: e.target.value
                                  .split(",")
                                  .map((x) => x.trim())
                                  .filter(Boolean)
                                  .map((label) => ({ label, value: label.toUpperCase().replace(/[^A-Z0-9]+/g, "_") })),
                              })
                            }
                            placeholder="e.g. New build, Refurbishment"
                          />
                        </Field>
                      )}
                      <Field label="Show only if">
                        <select className={inputCls} value={q.showIf?.questionId ?? ""} onChange={(e) => setQ(i, { showIf: e.target.value ? { questionId: e.target.value, equals: "" } : undefined })}>
                          <option value="">Always show</option>
                          {editing.questions.map((x, j) =>
                            x.id === q.id ? null : (
                              <option key={x.id} value={x.id}>
                                Question {j + 1}{x.text ? `: ${x.text}` : ""}
                              </option>
                            ),
                          )}
                        </select>
                      </Field>
                      {q.showIf &&
                        (() => {
                          const src = editing.questions.find((x) => x.id === q.showIf!.questionId);
                          const set2 = (v: string) => setQ(i, { showIf: { questionId: q.showIf!.questionId, equals: v } });
                          return (
                            <Field label="…is answered">
                              {src && src.options.length > 0 ? (
                                <select className={inputCls} value={q.showIf.equals} onChange={(e) => set2(e.target.value)}>
                                  <option value="">Choose an answer…</option>
                                  {src.options.map((o) => (
                                    <option key={o.value} value={o.value}>
                                      {o.label}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <input className={inputCls} value={q.showIf.equals} onChange={(e) => set2(e.target.value.toUpperCase().replace(/\s+/g, "_"))} placeholder="e.g. NEW_BUILD" />
                              )}
                            </Field>
                          );
                        })()}
                    </div>
                  </li>
                ))}
              </ol>
              <Btn variant="outline" size="sm" icon={Plus} className="mt-3" onClick={() => set({ questions: [...editing.questions, { id: `Q${Math.max(0, ...editing.questions.map((x) => Number(x.id.slice(1)))) + 1}`, text: "", kind: "SINGLE", required: false, options: [] }] })}>
                Add question
              </Btn>
            </fieldset>

            <fieldset>
              <legend className="text-base font-semibold mb-1">Outcomes</legend>
              <p className="text-base text-muted-foreground mb-3">The first outcome whose conditions all match wins. An outcome with no conditions is the default.</p>
              <ol className="space-y-3">
                {editing.outcomes.map((o, i) => (
                  <li key={i} className="rounded-lg border border-border p-4 grid sm:grid-cols-2 gap-x-4 gap-y-3">
                    <Field label="Outcome name" required>
                      <input className={inputCls} value={o.label} onChange={(e) => setO(i, { label: e.target.value })} />
                    </Field>
                    <Field label="Conditions" hint="e.g. Q1 = NEW_BUILD; Q3 >= 100">
                      <input className={inputCls} defaultValue={whenToText(o.when)} onBlur={(e) => setO(i, { when: textToWhen(e.target.value) })} />
                    </Field>
                    <Field label="Price tier">
                      <select className={inputCls} value={o.tier} onChange={(e) => setO(i, { tier: e.target.value as FlowOutcome["tier"] })}>
                        {TIERS.map((t) => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </Field>
                    <fieldset className="sm:col-span-2">
                      <legend className="text-sm font-medium mb-2">Recommended products</legend>
                      <div className="flex flex-wrap gap-2">
                        {PRODUCTS.filter((p) => p.lifecycleStatus !== "BLOCKED").map((p) => {
                          const on = o.products.includes(p.sku);
                          return (
                            <label key={p.sku} className={`inline-flex items-center gap-2 h-10 px-3 rounded-full border text-sm cursor-pointer focus-within:ring-2 focus-within:ring-brand/40 ${on ? "bg-navy text-navy-foreground border-navy" : "bg-card border-border"}`}>
                              <input type="checkbox" className="sr-only" checked={on} onChange={() => setO(i, { products: on ? o.products.filter((x) => x !== p.sku) : [...o.products, p.sku] })} />
                              {p.sku}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>
                  </li>
                ))}
              </ol>
              <Btn variant="outline" size="sm" icon={Plus} className="mt-3" onClick={() => set({ outcomes: [...editing.outcomes, { id: `O${editing.outcomes.length + 1}`, label: "", when: [], products: [], tier: "Better", note: "" }] })}>
                Add outcome
              </Btn>
            </fieldset>
          </div>
        )}
      </Modal>
    </>
  );
}

/** Try a flow the way a rep sees it, without creating a quote. */
function TestDrawer({ flow, onClose }: { flow: GuidedFlow | null; onClose: () => void }) {
  const [answers, setAnswers] = useState<Answers>({});
  const outcome = useMemo(() => (flow ? outcomeFor(flow, answers) : undefined), [flow, answers]);
  if (!flow) return null;
  const invalid = validateFlow(flow);
  const shown = visibleQuestions(flow, answers);
  const hidden = flow.questions.length - shown.length;
  const answered = Object.values(answers).some((v) => v !== "");
  const fallback = outcome?.when.length === 0;
  return (
    <Drawer
      open
      onClose={() => (setAnswers({}), onClose())}
      title={`Preview: ${flow.name}`}
      subtitle={
        <span className="flex flex-wrap items-center gap-2">
          <StatusPill status={flow.status} /> Version {flow.version} · Nothing is saved and no quote is created.
        </span>
      }
      size="md"
    >
      {invalid && <ErrorBanner error={invalid as ApiError} note="Fix this before activating." />}
      <section aria-labelledby="pv-q">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 id="pv-q" className="text-lg lg:text-xl leading-[1.2] font-semibold">
            Questions
          </h3>
          {answered && (
            <Btn variant="ghost" size="sm" onClick={() => setAnswers({})}>
              Reset answers
            </Btn>
          )}
        </div>
        <div className="space-y-4">
          {shown.map((q) => (
            <Field key={q.id} label={q.text} required={q.required}>
              {q.kind === "NUMBER" ? (
                <input type="number" min={0} className={inputCls} value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })} />
              ) : (
                <select className={inputCls} value={answers[q.id] ?? ""} onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}>
                  <option value="">Select…</option>
                  {q.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              )}
            </Field>
          ))}
        </div>
        {hidden > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            {hidden} more {hidden === 1 ? "question appears" : "questions appear"} depending on the answers.
          </p>
        )}
      </section>

      <section aria-labelledby="pv-r" aria-live="polite" className="rounded-xl border border-border bg-card p-4">
        <h3 id="pv-r" className="text-lg lg:text-xl leading-[1.2] font-semibold mb-2">
          Recommendation
        </h3>
        {!answered ? (
          <p className="text-base text-muted-foreground">Answer the questions to see what the rep is offered.</p>
        ) : !outcome ? (
          <p className="text-base text-muted-foreground">Nothing matches these answers, and the flow has no fallback outcome.</p>
        ) : (
          <div className="space-y-3">
            <p className="flex flex-wrap items-center gap-2 text-base font-semibold">
              {outcome.label} <Tag tone="brand">{outcome.tier} tier</Tag>
              {fallback && <Tag tone="neutral">Fallback — no specific match</Tag>}
            </p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {outcome.products.map((sku) => (
                <li key={sku} className="flex items-baseline justify-between gap-3 px-3 py-2 text-sm">
                  <span>{PRODUCTS.find((p) => p.sku === sku)?.name ?? sku}</span>
                  <span className="font-mono text-xs text-muted-foreground">{sku}</span>
                </li>
              ))}
            </ul>
            {outcome.note && !/^default\.?$/i.test(outcome.note.trim()) && <p className="text-sm text-muted-foreground">{outcome.note}</p>}
          </div>
        )}
      </section>
    </Drawer>
  );
}

