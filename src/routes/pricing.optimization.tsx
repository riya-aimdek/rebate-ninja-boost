import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { ArrowRight, FlaskConical, Play, Save } from "lucide-react";
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
  FilterPills,
  Flag,
  InfoBanner,
  LinkBtn,
  ListHeader,
  PillTabs,
  PricingLayout,
  ProgressBar,
  RecordLink,
  StatusPill,
  Tag,
  Toggle,
  humanize,
  inputCls,
  type ApiError,
  type Column,
} from "@/components/pricing/kit";
import { DEMAND_INPUTS, ELASTICITY_MODELS, GUARDRAILS, OBJECTIVES, OBJECTIVE_LABELS, OPT_RUNS, RUN_STATUSES, type OptRun } from "@/lib/pricing/data";

export const Route = createFileRoute("/pricing/optimization")({
  head: () => ({
    meta: [
      { title: "Optimization runs · Rebate Ninja" },
      { name: "description", content: "Choose an optimization objective and scope; recommendations always respect guardrails." },
    ],
  }),
  component: OptimizationPage,
});

type TabKey = "runs" | "new" | "models";
type RunStatus = OptRun["status"];

/** "2026-10-28 20:00" -> "28 Oct 2026, 20:00" without Date parsing (deterministic on server and client). */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function fmtStamp(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/.exec(s);
  if (!m) return s;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}${m[4] ? `, ${m[4]}` : ""}`;
}
type Objective = (typeof OBJECTIVES)[number];

const OBJECTIVE_HINT: Record<Objective, string> = {
  MAX_MARGIN: "Protect margin in a cost spike",
  MAX_REVENUE: "Grow top-line revenue",
  MAX_VOLUME: "Grow volume in a slow quarter",
  PROTECT_SHARE: "Defend share against a competitor",
  TARGET_MARGIN: "Hit a specific margin %",
};

const MARGIN_FLOOR = GUARDRAILS.find((g) => g.id === "G-001")?.minMarginPct ?? 20;

function OptimizationPage() {
  const [tab, setTab] = useState<TabKey>("runs");
  const [runs, setRuns] = useState<OptRun[]>(OPT_RUNS);
  const navigate = useNavigate();
  /** Progress (0–100) of runs started in this session; drives the progress bar and completion toast. */
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [announce, setAnnounce] = useState("");
  const [q, setQ] = useState("");
  const [statuses, setStatuses] = useState<RunStatus[]>([]);
  const [preview, setPreview] = useState<OptRun | null>(null);

  const rows = useMemo(() => {
    const t = q.toLowerCase();
    return runs.filter(
      (r) =>
        (!t || [r.id, r.name, r.scope, OBJECTIVE_LABELS[r.objective]].some((v) => v.toLowerCase().includes(t))) &&
        (statuses.length === 0 || statuses.includes(r.status)),
    );
  }, [runs, q, statuses]);

  useEffect(() => {
    const active = Object.entries(progress).filter(([, v]) => v < 100);
    if (active.length === 0) return;
    const t = setTimeout(() => {
      const next = { ...progress };
      const done: string[] = [];
      active.forEach(([id, v]) => {
        next[id] = Math.min(100, v + 20);
        if (next[id] >= 100) done.push(id);
      });
      setProgress(next);
      setRuns((rs) => rs.map((r) => (next[r.id] !== undefined ? { ...r, status: next[r.id] >= 100 ? "COMPLETED" : "RUNNING" } : r)));
      done.forEach((id) => {
        toast.success(`${id} completed`, {
          description: "Recommendations from this run are ready to review.",
          action: { label: "Review", onClick: () => navigate({ to: "/pricing/recommendations" }) },
        });
        setAnnounce(`${id} completed`);
      });
    }, 800);
    return () => clearTimeout(t);
  }, [progress, navigate]);

  const columns: Column<OptRun>[] = [
    { key: "id", header: "Run ID", className: "whitespace-nowrap", cell: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "name", header: "Name", className: "min-w-[180px]", cell: (r) => <span className="font-medium">{r.name}</span> },
    {
      key: "status",
      header: "Status",
      cell: (r) => (
        <div className="flex flex-col gap-1.5 min-w-[120px]">
          <StatusPill status={r.status} />
          {progress[r.id] !== undefined && progress[r.id] < 100 && (
            <>
              <ProgressBar value={progress[r.id]} tone="info" label={`${r.id} progress`} />
              <span className="text-xs text-muted-foreground tabular-nums">{progress[r.id]}% complete</span>
            </>
          )}
        </div>
      ),
    },
    {
      key: "obj",
      header: "Objective",
      className: "min-w-[160px]",
      cell: (r) => (
        <div>
          {OBJECTIVE_LABELS[r.objective]}
          {r.targetMarginPct !== undefined && <span className="text-muted-foreground text-xs"> · {r.targetMarginPct}%</span>}
        </div>
      ),
    },
    { key: "scope", header: "Scope", className: "min-w-[180px]", cell: (r) => r.scope },
    {
      key: "recs",
      header: "Recommendations",
      align: "right",
      cell: (r) =>
        r.recommendations > 0 ? (
          <RecordLink to="/pricing/recommendations">
            <span className="tabular-nums">{r.recommendations.toLocaleString("en-GB")}</span>
            <span className="sr-only"> recommendations from {r.id} — review</span>
          </RecordLink>
        ) : (
          <span className="tabular-nums text-muted-foreground">0</span>
        ),
    },
    { key: "conf", header: "Avg confidence", align: "right", cell: (r) => <span className="tabular-nums">{r.avgConfidence !== undefined ? r.avgConfidence.toFixed(2) : "—"}</span> },
    {
      key: "inputs",
      header: "Demand inputs",
      align: "right",
      cell: (r) => (
        <span className="tabular-nums text-muted-foreground" title={r.inputs.join(", ")}>
          {r.inputs.length}/{DEMAND_INPUTS.length}
        </span>
      ),
    },
    {
      key: "note",
      header: "Notes",
      className: "min-w-[240px]",
      cell: (r) =>
        r.note ? <Flag tone={r.status === "FAILED" ? "danger" : "warning"}>{r.note}</Flag> : <span className="text-muted-foreground">—</span>,
    },
    {
      key: "by",
      header: "Created",
      className: "whitespace-nowrap",
      cell: (r) => (
        <span className="text-xs text-muted-foreground">
          {r.createdBy}
          <br />
          {fmtStamp(r.createdAt)}
        </span>
      ),
    },
  ];

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Price optimization" }, { label: "Optimization runs" }]}>
      <ListHeader
        title="Optimization runs"
        count={tab === "runs" ? rows.length : runs.length}
        noun="run"
        subtitle="Each run applies one objective within guardrails and produces recommendations."
        search={tab === "runs" ? q : undefined}
        onSearch={tab === "runs" ? setQ : undefined}
        actions={
          tab !== "new" ? (
            <Btn icon={Play} onClick={() => setTab("new")}>
              New run
            </Btn>
          ) : undefined
        }
      />
      <p role="status" className="sr-only">
        {announce}
      </p>
      <PillTabs
        tabs={[
          { key: "runs", label: "Runs", count: runs.length },
          { key: "new", label: "New run" },
          { key: "models", label: "Elasticity models", count: ELASTICITY_MODELS.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === "runs" && (
        <>
          <InfoBanner
            title="Results go to recommendations"
            action={
              <LinkBtn to="/pricing/recommendations" variant="outline" size="sm" icon={ArrowRight}>
                Review recommendations
              </LinkBtn>
            }
          >
            Every recommendation is tagged with its run ID and objective.
          </InfoBanner>
          <FilterPills<RunStatus>
            label="Status"
            selected={statuses}
            onChange={setStatuses}
            options={RUN_STATUSES.map((s) => ({ key: s, label: humanize(s), count: runs.filter((r) => r.status === s).length }))}
          />
          <DataTable
            caption="Optimization runs"
            columns={columns}
            rows={rows}
            rowKey={(r) => r.id}
            onRowClick={setPreview}
            selectedKey={preview?.id ?? null}
            empty={
              <EmptyState
                icon={FlaskConical}
                title={q ? `No runs match “${q}”` : "No runs match these filters"}
                action={
                  <Btn
                    variant="subtle"
                    onClick={() => {
                      setQ("");
                      setStatuses([]);
                    }}
                  >
                    Clear filters
                  </Btn>
                }
              >
                Try a different search term or remove a status filter.
              </EmptyState>
            }
          />
          <RunQuickView run={preview} progress={preview ? progress[preview.id] : undefined} onClose={() => setPreview(null)} />
        </>
      )}

      {tab === "new" && (
        <NewRunForm
          onCancel={() => setTab("runs")}
          onSaved={(run, start) => {
            setRuns((r) => [run, ...r]);
            setTab("runs");
            if (start) {
              setProgress((p) => ({ ...p, [run.id]: 0 }));
              setAnnounce(`${run.id} started`);
              toast(`${run.id} started`, { description: "Queued, then running. You'll be notified when it completes." });
            } else {
              toast.success(`${run.id} saved as draft`);
            }
          }}
        />
      )}

      {tab === "models" && (
        <section aria-labelledby="models-h">
          <h2 id="models-h" className="text-lg font-semibold tracking-tight">
            Elasticity models
          </h2>
          <p className="text-sm text-muted-foreground mb-4">Model governance — version, training window and error metrics.</p>
          <DataTable
            caption="Elasticity models"
            numbered={false}
            rows={ELASTICITY_MODELS}
            rowKey={(m) => m.version}
            columns={[
              { key: "v", header: "Version", cell: (m) => <span className="whitespace-nowrap">{m.version}</span> },
              { key: "s", header: "Status", cell: (m) => <StatusPill status={m.status} /> },
              { key: "w", header: "Training window", cell: (m) => m.trainingWindow },
              { key: "mape", header: <abbr title="Mean absolute percentage error">MAPE</abbr>, align: "right", cell: (m) => <span className="tabular-nums">{m.mape}%</span> },
              { key: "rmse", header: <abbr title="Root mean square error">RMSE</abbr>, align: "right", cell: (m) => <span className="tabular-nums">{m.rmse}</span> },
              { key: "r2", header: "R²", align: "right", cell: (m) => <span className="tabular-nums">{m.r2}</span> },
              { key: "t", header: "Trained", cell: (m) => <span className="text-muted-foreground whitespace-nowrap">{m.trainedAt}</span> },
              { key: "rs", header: "Retrain schedule", cell: (m) => m.retrain },
            ]}
          />
        </section>
      )}
    </PricingLayout>
  );
}

function NewRunForm({ onSaved, onCancel }: { onSaved: (run: OptRun, start: boolean) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [objective, setObjective] = useState<Objective | "">("");
  const [target, setTarget] = useState("");
  const [scopeSeg, setScopeSeg] = useState("All segments");
  const [scopeCat, setScopeCat] = useState("All categories");
  const [scopeGeo, setScopeGeo] = useState("UK");
  const [inputs, setInputs] = useState<Record<string, boolean>>(Object.fromEntries(DEMAND_INPUTS.map((d) => [d, d !== "Inventory"])));
  const [err, setErr] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState<"draft" | "run" | null>(null);

  const missing = DEMAND_INPUTS.filter((d) => !inputs[d]);
  const targetNum = Number(target);
  const targetError =
    objective === "TARGET_MARGIN" && target !== "" && !(targetNum > 0 && targetNum < 100) ? "Enter a target margin between 0 and 100%, e.g. 28." : undefined;
  /** Why "Save and run" is unavailable — shown next to the button (error prevention). */
  const blocker = !name.trim()
    ? "Enter a run name to continue."
    : !objective
      ? "Choose an objective to continue."
      : objective === "TARGET_MARGIN" && (!target || targetError)
        ? "Enter a valid target margin % to continue."
        : null;

  const save = (start: boolean) => {
    setErr(null);
    const missingField = !name.trim() ? "name" : !objective ? "objective" : null;
    if (missingField) {
      setErr({
        errorClass: "VALIDATION",
        code: "VALIDATION_REQUIRED",
        message: missingField === "name" ? "Enter a run name, e.g. “Q1 margin capture”." : "Choose an objective for this run.",
        field: missingField,
      });
      return;
    }
    if (objective === "TARGET_MARGIN" && (!target || targetError)) {
      setErr({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Achieve target margin needs a target margin between 0 and 100%.", field: "targetMarginPct" });
      return;
    }
    setSaving(start ? "run" : "draft");
    setTimeout(() => {
      setSaving(null);
      onSaved(
      {
        id: `RUN-${35 + Math.floor(Math.random() * 60)}`,
        name,
        objective: objective as Objective,
        targetMarginPct: objective === "TARGET_MARGIN" ? Number(target) : undefined,
        scope: `${scopeCat} · ${scopeGeo} · ${scopeSeg}`,
        inputs: DEMAND_INPUTS.filter((d) => inputs[d]),
        status: start ? "QUEUED" : "DRAFT",
        recommendations: 0,
        modelVersion: "elast-gbm-3.2",
        createdBy: "Riya Shah",
        createdAt: "2026-10-29 14:30",
        note: missing.length ? `${missing.join(", ")} off — confidence reduced` : undefined,
      },
      start,
      );
    }, 600);
  };

  // Enter in a text/number field submits the primary action (Save and run).
  const onFormKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT" && !saving) {
      e.preventDefault();
      save(true);
    }
  };

  // Arrow-key model for the objective radiogroup (WAI-ARIA radio pattern).
  const onObjectiveKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"];
    if (!keys.includes(e.key)) return;
    e.preventDefault();
    const idx = objective ? OBJECTIVES.indexOf(objective) : -1;
    const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : -1;
    const next = OBJECTIVES[(idx + step + OBJECTIVES.length) % OBJECTIVES.length];
    setObjective(next);
    e.currentTarget.querySelector<HTMLButtonElement>(`[data-objective="${next}"]`)?.focus();
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6" onKeyDown={onFormKeyDown}>
      <div className="xl:col-span-2 space-y-6">
        <ErrorBanner error={err} onClose={() => setErr(null)} />
        <Card title="Objective" subtitle="Choose deliberately — the objective drives every recommendation in this run.">
          <div
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
            role="radiogroup"
            aria-label="Optimization objective"
            aria-required="true"
            aria-invalid={err?.field === "objective" || undefined}
            onKeyDown={onObjectiveKey}
          >
            {OBJECTIVES.map((o, i) => {
              const on = objective === o;
              return (
                <button
                  key={o}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  data-objective={o}
                  tabIndex={on || (!objective && i === 0) ? 0 : -1}
                  onClick={() => setObjective(o)}
                  className={`text-left rounded-xl border p-4 transition ${on ? "border-brand bg-brand-soft ring-2 ring-brand/30" : "border-border bg-card hover:border-brand/50"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className={`size-4 rounded-full border-2 ${on ? "border-brand bg-brand" : "border-muted-foreground"}`} aria-hidden />
                    <span className="font-semibold">{OBJECTIVE_LABELS[o]}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1.5 pl-6">{OBJECTIVE_HINT[o]}</div>
                </button>
              );
            })}
          </div>
          {err?.field === "objective" && (
            <p className="text-xs text-destructive mt-3" role="alert">
              {err.message}
            </p>
          )}
          {objective === "TARGET_MARGIN" && (
            <div className="mt-5 max-w-xs">
              <Field
                label="Target margin %"
                required
                hint="Between 0 and 100%"
                error={targetError ?? (err?.field === "targetMarginPct" ? err.message : undefined)}
              >
                <input
                  type="number"
                  step="0.5"
                  min={0.5}
                  max={99.5}
                  inputMode="decimal"
                  value={target}
                  aria-invalid={err?.field === "targetMarginPct"}
                  onChange={(e) => setTarget(e.target.value)}
                  className={inputCls}
                  placeholder="e.g. 28"
                />
              </Field>
            </div>
          )}
        </Card>

        <Card title="Run and scope">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Run name" required error={err?.field === "name" ? err.message : undefined} className="md:col-span-2">
              <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} aria-invalid={err?.field === "name"} placeholder="e.g. Q1 margin capture" />
            </Field>
            <Field label="Product category">
              <select value={scopeCat} onChange={(e) => setScopeCat(e.target.value)} className={inputCls}>
                {["All categories", "Cable", "Lighting", "Ventilation", "Switchgear", "Heating", "Fasteners"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Geography">
              <select value={scopeGeo} onChange={(e) => setScopeGeo(e.target.value)} className={inputCls}>
                {["All regions", "UK", "EU", "North America", "India"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Customer segment">
              <select value={scopeSeg} onChange={(e) => setScopeSeg(e.target.value)} className={inputCls}>
                {["All segments", "Strategic", "Enterprise", "Mid-Market", "SMB", "Distributor", "Retailer"].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Elasticity model" hint="Calculated — uses the active model">
              <input value="elast-gbm-3.2 (active)" readOnly className={`${inputCls} bg-muted border-transparent`} />
            </Field>
          </div>
        </Card>

        <Card title="Demand inputs" subtitle="Each input can be toggled. Missing inputs reduce confidence rather than failing the run.">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {DEMAND_INPUTS.map((d) => (
              <div key={d} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border px-4 py-3">
                <Toggle checked={!!inputs[d]} onChange={(v) => setInputs((s) => ({ ...s, [d]: v }))} label={d} />
                {!inputs[d] && <Flag tone="warning">Confidence reduced</Flag>}
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <Card title="Hard constraints">
          <InfoBanner tone="danger" title="Guardrails cannot be violated">
            No objective can produce a recommendation outside active guardrails — e.g. the {MARGIN_FLOOR}% margin floor (G-001) holds
            even when maximising volume.
          </InfoBanner>
          <ul className="text-sm space-y-2">
            {GUARDRAILS.filter((g) => g.status === "ACTIVE").map((g) => (
              <li key={g.id}>
                <div>
                  <RecordLink to="/pricing/guardrails">{g.id}</RecordLink> {g.scope}
                </div>
                <div className="text-muted-foreground text-xs mt-0.5">
                  {[
                    g.minMarginPct !== undefined && `Min margin ${g.minMarginPct}%`,
                    g.priceCeiling !== undefined && `Ceiling ${g.priceCeiling}`,
                    g.maxDiscountPct !== undefined && `Max discount ${g.maxDiscountPct}%`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Summary">
          <dl className="text-sm space-y-2">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Objective</dt>
              <dd className="font-medium">{objective ? OBJECTIVE_LABELS[objective] : "—"}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Inputs on</dt>
              <dd className="font-medium">
                {DEMAND_INPUTS.length - missing.length}/{DEMAND_INPUTS.length}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Status after save</dt>
              <dd className="flex flex-wrap justify-end gap-1">
                <StatusPill status="DRAFT" /> <span className="text-xs text-muted-foreground self-center">or</span> <StatusPill status="QUEUED" />
              </dd>
            </div>
          </dl>
          <div className="grid grid-cols-2 gap-2 mt-5">
            <Btn variant="subtle" onClick={onCancel} disabled={!!saving}>
              Cancel
            </Btn>
            <Btn variant="outline" icon={Save} onClick={() => save(false)} loading={saving === "draft"} disabled={saving === "run"}>
              Save draft
            </Btn>
            <Btn className="col-span-2" icon={Play} onClick={() => save(true)} loading={saving === "run"} disabled={!!blocker || saving === "draft"} aria-describedby={blocker ? "run-blocker" : undefined}>
              Save and run
            </Btn>
          </div>
          {blocker && (
            <p id="run-blocker" className="text-xs text-muted-foreground mt-2">
              {blocker}
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

/** Run quick view (Option C drawer): inputs, model and outcome without leaving the list. */
function RunQuickView({ run: r, progress, onClose }: { run: OptRun | null; progress?: number; onClose: () => void }) {
  return (
    <Drawer
      open={!!r}
      onClose={onClose}
      size="md"
      title={r?.name ?? ""}
      subtitle={
        r && (
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{r.id}</span>
            <StatusPill status={r.status} />
          </span>
        )
      }
      footer={
        r && (
          <>
            <Btn variant="subtle" onClick={onClose}>
              Close
            </Btn>
            {r.recommendations > 0 && (
              <LinkBtn to="/pricing/recommendations" icon={ArrowRight}>
                Review recommendations
              </LinkBtn>
            )}
          </>
        )
      }
    >
      {r && (
        <>
          {r.note && (
            <InfoBanner tone={r.status === "FAILED" ? "danger" : "warning"} title={r.status === "FAILED" ? "Run failed" : "Confidence reduced"}>
              {r.note}
            </InfoBanner>
          )}
          {progress !== undefined && progress < 100 && <ProgressBar value={progress} tone="info" label={`${r.id} progress`} />}
          <section className="bg-card border border-border rounded-xl px-5">
            <DetailGrid
              items={[
                { label: "Objective", value: `${OBJECTIVE_LABELS[r.objective]}${r.targetMarginPct !== undefined ? ` · ${r.targetMarginPct}%` : ""}` },
                { label: "Scope", value: r.scope },
                { label: "Recommendations", value: <span className="tabular-nums">{r.recommendations.toLocaleString("en-GB")}</span> },
                { label: "Avg confidence", value: r.avgConfidence !== undefined ? r.avgConfidence.toFixed(2) : "—" },
                { label: "Elasticity model", value: <span className="font-mono text-sm">{r.modelVersion}</span> },
                { label: "Created", value: `${r.createdBy} · ${fmtStamp(r.createdAt)}` },
                {
                  label: `Demand inputs (${r.inputs.length}/${DEMAND_INPUTS.length})`,
                  full: true,
                  value: (
                    <span className="flex flex-wrap gap-2 mt-1">
                      {DEMAND_INPUTS.map((d) =>
                        r.inputs.includes(d) ? (
                          <Tag key={d} tone="info">
                            {d}
                          </Tag>
                        ) : (
                          <Flag key={d} tone="warning">
                            {d} off
                          </Flag>
                        ),
                      )}
                    </span>
                  ),
                },
              ]}
            />
          </section>
        </>
      )}
    </Drawer>
  );
}
