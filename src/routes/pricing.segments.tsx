import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { Eye, Plus, RefreshCw, Trash2, UserPlus, X, Zap } from "lucide-react";
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
  Flag,
  InfoBanner,
  ListHeader,
  Modal,
  PillTabs,
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
  CUSTOMERS,
  CUSTOMER_SEGMENTS,
  PRICE_LISTS,
  PRODUCTS,
  PRODUCT_SEGMENTS,
  REASON_CODES,
  SEGMENTS,
  SEGMENT_HISTORY,
  SEGMENT_METHODS,
  VOLUME_METRICS,
  type Customer,
  type Product,
  type Segment,
  type SegmentAssignment,
} from "@/lib/pricing/data";

export const Route = createFileRoute("/pricing/segments")({
  head: () => ({ meta: [{ title: "Segments · Rebate Ninja" }] }),
  component: Page,
});

type Kind = Segment["kind"];
type Cond = { field: string; op: string; value: string };
type Row = Customer | Product;
type Method = Segment["method"];

/** humanize() would render "Ai derived"; keep the acronym. */
const methodLabel = (m: Method) => (m === "AI_DERIVED" ? "AI-derived" : humanize(m));
/** Seeded definitions carry the raw metric enum ("REVENUE"); show it in prose case. */
const definitionText = (s: Segment) => (s.volumeMetric ? s.definition.replace(s.volumeMetric, humanize(s.volumeMetric).toLowerCase()) : s.definition);

/* Attributes available to ATTRIBUTE-method segments, per segment kind. */
const FIELDS: Record<Kind, Record<string, (r: Row) => string | number | boolean>> = {
  CUSTOMER: {
    "Annual revenue": (r) => (r as Customer).annualRevenue,
    Channel: (r) => (r as Customer).channel,
    Geography: (r) => (r as Customer).geography,
    Industry: (r) => (r as Customer).industry,
    Tier: (r) => (r as Customer).tier,
    "Strategic flag": (r) => ((r as Customer).strategic ? "Yes" : "No"),
  },
  PRODUCT: {
    Category: (r) => (r as Product).category,
    Brand: (r) => (r as Product).brand,
    "Lifecycle status": (r) => (r as Product).lifecycleStatus,
    Cost: (r) => (r as Product).cost,
  },
};
const OPS = ["Equal to", "Not equal to", "Greater than", "Greater than or equal to", "Less than", "Less than or equal to", "In", "Not in", "Between"];

function test(v: string | number | boolean, op: string, raw: string): boolean {
  const n = (s: string) => Number(s.replace(/[,_\s]/g, "").replace(/M$/i, "000000"));
  const list = raw.split(",").map((s) => s.trim().toLowerCase());
  const sv = String(v).toLowerCase();
  switch (op) {
    case "Equal to":
      return sv === raw.trim().toLowerCase();
    case "Not equal to":
      return sv !== raw.trim().toLowerCase();
    case "Greater than":
      return Number(v) > n(raw);
    case "Greater than or equal to":
      return Number(v) >= n(raw);
    case "Less than":
      return Number(v) < n(raw);
    case "Less than or equal to":
      return Number(v) <= n(raw);
    case "In":
      return list.includes(sv);
    case "Not in":
      return !list.includes(sv);
    case "Between": {
      const [a, b] = raw.split(/\s*(?:-|…|and)\s*/i).map(n);
      return Number(v) >= a && Number(v) <= b;
    }
  }
  return false;
}

/** Built-in matchers for the seeded customer segments (mirrors their definitions). */
const SEEDED_MATCH: Record<string, (c: Customer) => boolean> = {
  Strategic: (c) => c.segment === "Strategic",
  Enterprise: (c) => c.annualRevenue > 100_000_000,
  "Mid-Market": (c) => c.rolling12mVolume >= 1_000_000,
  SMB: (c) => c.rolling12mVolume < 1_000_000,
  Distributor: (c) => c.channel === "Distributor",
  Retailer: (c) => c.segment === "Retailer",
};

type Draft = {
  id?: string;
  name: string;
  kind: Kind;
  method: Segment["method"];
  priority: string;
  priceStructure: string;
  conds: Cond[];
  volumeMetric: string;
  trailingMonths: string;
  threshold: string;
  manualMembers: string[];
  reasonCode: string;
  reasonText: string;
};

const NOW = "2026-10-29 14:15";
const ME = "Riya Shah";
const withoutKey = <T,>(o: Record<string, T>, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));

const emptyDraft = (kind: Kind): Draft => ({
  name: "",
  kind,
  method: "ATTRIBUTE",
  priority: "",
  priceStructure: "",
  conds: [{ field: kind === "CUSTOMER" ? "Annual revenue" : "Category", op: kind === "CUSTOMER" ? "Between" : "Equal to", value: "" }],
  volumeMetric: "REVENUE",
  trailingMonths: "12",
  threshold: "",
  manualMembers: [],
  reasonCode: "",
  reasonText: "",
});

function fromSegment(s: Segment): Draft {
  const d = emptyDraft(s.kind);
  return {
    ...d,
    id: s.id,
    name: s.name,
    method: s.method,
    priority: String(s.priority),
    priceStructure: s.priceStructure ?? "",
    volumeMetric: s.volumeMetric ?? "REVENUE",
    trailingMonths: String(s.trailingMonths ?? 12),
    threshold: s.threshold !== undefined ? String(s.threshold) : "",
    conds:
      s.name === "Mid-Market" && s.kind === "CUSTOMER"
        ? [{ field: "Annual revenue", op: "Between", value: "10M - 100M" }]
        : s.name === "Enterprise"
          ? [{ field: "Annual revenue", op: "Greater than", value: "100M" }]
          : s.name === "Distributor"
            ? [{ field: "Channel", op: "Equal to", value: "Distributor" }]
            : d.conds,
  };
}

function Page() {
  const [tab, setTab] = useState<Kind>("CUSTOMER");
  const [segments, setSegments] = useState<Segment[]>(SEGMENTS);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [previewed, setPreviewed] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assign, setAssign] = useState({ customerId: "", segment: "", reason: "" });
  const [assignError, setAssignError] = useState<ApiError | null>(null);
  const [history, setHistory] = useState<SegmentAssignment[]>(SEGMENT_HISTORY);
  const [lists, setLists] = useState<Record<Kind, string[]>>({ CUSTOMER: [...CUSTOMER_SEGMENTS], PRODUCT: [...PRODUCT_SEGMENTS] });
  const [newName, setNewName] = useState("");
  const [draftOrigin, setDraftOrigin] = useState<string>("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState<Segment["status"] | null>(null);
  const [confirmActivate, setConfirmActivate] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [assignSubmitted, setAssignSubmitted] = useState(false);
  const [assignSaving, setAssignSaving] = useState(false);
  const [reevaluating, setReevaluating] = useState(false);
  const [methods, setMethods] = useState<Method[]>([]);
  /** Draft next-versions of ACTIVE segments: the live version keeps assigning members until the draft is activated. */
  const [pendingDrafts, setPendingDrafts] = useState<Record<string, { form: Draft; seg: Segment }>>({});
  /** Superseded versions per segment id, newest first. */
  const [segHistory, setSegHistory] = useState<Record<string, Array<{ seg: Segment; supersededAt: string }>>>({});

  const inTab = segments.filter((s) => s.kind === tab);
  const rows = inTab.filter(
    (s) => (methods.length === 0 || methods.includes(s.method)) && (!search || `${s.name} ${s.definition}`.toLowerCase().includes(search.toLowerCase())),
  );
  const tabMethods = SEGMENT_METHODS.filter((m) => tab === "CUSTOMER" || m !== "VOLUME");
  const clearFilters = () => {
    setSearch("");
    setMethods([]);
  };

  /* ---------- Preview before activation ---------- */
  const preview = useMemo(() => {
    if (!draft) return null;
    const pool: Row[] = draft.kind === "CUSTOMER" ? CUSTOMERS : PRODUCTS;
    const nameOf = (r: Row) => ("id" in r ? r.name : `${r.sku} · ${r.name}`);
    const keyOf = (r: Row) => ("id" in r ? r.id : r.productId);
    const current = (r: Row) => ("id" in r ? r.segment : r.productSegment);
    let matches: Row[];
    if (draft.method === "VOLUME") {
      const th = Number(draft.threshold || 0);
      matches = draft.kind === "CUSTOMER" ? CUSTOMERS.filter((c) => c.rolling12mVolume >= th) : [];
    } else if (draft.method === "MANUAL") {
      matches = pool.filter((r) => draft.manualMembers.includes(keyOf(r)));
    } else if (draft.method === "AI_DERIVED") {
      matches = pool.filter((r) => current(r) === draft.name);
    } else {
      const f = FIELDS[draft.kind];
      matches = pool.filter((r) => draft.conds.every((c) => c.value.trim() && f[c.field] && test(f[c.field](r), c.op, c.value)));
    }
    const added = matches.filter((r) => current(r) !== draft.name);
    const removed = pool.filter((r) => current(r) === draft.name && !matches.includes(r));
    const myPriority = Number(draft.priority || 999);
    const multi =
      draft.kind === "CUSTOMER"
        ? (matches as Customer[])
            .map((c) => {
              const others = segments.filter((s) => s.kind === "CUSTOMER" && s.name !== draft.name && SEEDED_MATCH[s.name]?.(c));
              if (!others.length) return null;
              const all = [{ name: draft.name || "(this segment)", priority: myPriority }, ...others.map((o) => ({ name: o.name, priority: o.priority }))].sort((a, b) => a.priority - b.priority);
              return { c, all, winner: all[0].name };
            })
            .filter(Boolean)
        : [];
    return { matches, added, removed, multi: multi as Array<{ c: Customer; all: { name: string; priority: number }[]; winner: string }>, nameOf, keyOf };
  }, [draft, segments]);

  const openEditor = (s?: Segment) => {
    // Reopening a segment with a pending draft version continues that draft.
    const d = s ? (pendingDrafts[s.id]?.form ?? fromSegment(s)) : emptyDraft(tab);
    setDraft(d);
    setDraftOrigin(JSON.stringify(d));
    setError(null);
    setPreviewed(false);
    setSubmitted(false);
  };
  const dirty = !!draft && JSON.stringify(draft) !== draftOrigin;
  /** The live segment being edited; when ACTIVE, saving creates the next version instead of overwriting. */
  const live = draft?.id ? segments.find((s) => s.id === draft.id) : undefined;
  const versioning = live?.status === "ACTIVE";
  const liveVersion = live?.version ?? 1;
  const pendingDraft = draft?.id ? pendingDrafts[draft.id] : undefined;

  /** Field-level errors, keyed by the input id so we can focus the first one. */
  const fieldErrors = (d: Draft): Record<string, string> => {
    const e: Record<string, string> = {};
    if (!d.name.trim()) e["seg-name"] = "Enter a segment name, e.g. Mid-Market.";
    const pr = Number(d.priority);
    if (!d.priority) e["seg-priority"] = "Enter a priority — 1 is the highest.";
    else if (!Number.isInteger(pr) || pr < 1 || pr > 999) e["seg-priority"] = "Enter a whole number between 1 and 999.";
    if (d.method === "ATTRIBUTE")
      d.conds.forEach((c, i) => {
        if (!c.value.trim()) e[`seg-cond-${i}`] = c.op === "Between" ? "Enter a range, e.g. 10M - 100M." : "Enter a value to compare against.";
      });
    if (d.method === "VOLUME") {
      const tm = Number(d.trailingMonths);
      if (!d.trailingMonths || !Number.isInteger(tm) || tm < 1 || tm > 36) e["seg-trailing"] = "Enter whole months between 1 and 36.";
      if (!d.threshold) e["seg-threshold"] = "Enter the minimum volume, e.g. 1000000.";
      else if (Number(d.threshold) < 0) e["seg-threshold"] = "The threshold can't be negative.";
    }
    if (versioning) {
      if (!d.reasonCode) e["seg-reason"] = "Select why this segment is changing — it is kept in the version history.";
      else if (d.reasonCode === "OTHER" && !d.reasonText.trim()) e["seg-reason-text"] = "Describe the reason for this change.";
    }
    return e;
  };
  const errs = draft ? fieldErrors(draft) : {};
  const fe = (id: string) => (submitted ? errs[id] : undefined);

  /** Validate, focus the first invalid field, and (for activation) require a preview. */
  const requestPersist = (status: Segment["status"]) => {
    if (!draft) return;
    setSubmitted(true);
    setError(null);
    const first = Object.keys(errs)[0];
    if (first) {
      const field = (k: string) =>
        ({ "seg-name": "name", "seg-priority": "priority", "seg-trailing": "trailingMonths", "seg-threshold": "threshold", "seg-reason": "reasonCode", "seg-reason-text": "reasonText" })[k] ??
        k.replace(/^seg-cond-(\d+)$/, "conditions[$1].value");
      setError({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Fix the highlighted fields to save this segment.", field: Object.keys(errs).map(field).join(", ") });
      document.getElementById(first)?.focus();
      return;
    }
    if (status === "ACTIVE" && !previewed) {
      setError({ errorClass: "BUSINESS_RULE", code: "PREVIEW_REQUIRED", message: "Preview the members before activating this segment — use Preview below." });
      document.getElementById("seg-preview-btn")?.focus();
      return;
    }
    if (status === "ACTIVE") setConfirmActivate(true);
    else persist("DRAFT");
  };

  const persist = (status: Segment["status"]) => {
    if (!draft) return;
    setSaving(status);
    window.setTimeout(() => {
      setSaving(null);
      setConfirmActivate(false);
      commit(status);
    }, 400);
  };

  const commit = (status: Segment["status"]) => {
    if (!draft) return;
    const definition =
      draft.method === "VOLUME"
        ? `Rolling ${draft.trailingMonths}-month ${humanize(draft.volumeMetric).toLowerCase()} ≥ ${Number(draft.threshold).toLocaleString("en-GB")}`
        : draft.method === "ATTRIBUTE"
          ? draft.conds.map((c) => `${c.field} ${c.op.toLowerCase()} ${c.value}`).join(" AND ")
          : draft.method === "MANUAL"
            ? "Manually curated"
            : "AI-derived cluster";
    const seg: Segment = {
      id: draft.id ?? `SG-${30 + segments.length}`,
      name: draft.name,
      kind: draft.kind,
      method: draft.method,
      definition,
      priority: Number(draft.priority),
      members: preview?.matches.length ?? 0,
      status,
      priceStructure: draft.priceStructure || undefined,
      volumeMetric: draft.method === "VOLUME" ? (draft.volumeMetric as Segment["volumeMetric"]) : undefined,
      trailingMonths: draft.method === "VOLUME" ? Number(draft.trailingMonths) : undefined,
      threshold: draft.method === "VOLUME" ? Number(draft.threshold) : undefined,
      lastEvaluated: NOW,
      version: versioning ? liveVersion + 1 : liveVersion,
      reasonCode: versioning ? (draft.reasonCode === "OTHER" ? `OTHER: ${draft.reasonText.trim()}` : draft.reasonCode) : live?.reasonCode,
      changedBy: ME,
      changedAt: NOW,
    };
    if (versioning && live) {
      if (status === "DRAFT") {
        // The live version keeps assigning members; the change waits as the next version.
        setPendingDrafts((p) => ({ ...p, [seg.id]: { form: draft, seg: { ...seg, status: "DRAFT" } } }));
        toast.success(`${seg.name} v${seg.version} saved as draft`, { description: `v${liveVersion} keeps assigning members until v${seg.version} is activated.` });
      } else {
        setSegHistory((h) => ({ ...h, [seg.id]: [{ seg: live, supersededAt: NOW }, ...(h[seg.id] ?? [])] }));
        setSegments((ss) => ss.map((s) => (s.id === seg.id ? { ...s, ...seg } : s)));
        setPendingDrafts((p) => withoutKey(p, seg.id));
        toast.success(`${seg.name} v${seg.version} activated`, { description: `${seg.members} members assigned. v${liveVersion} is superseded; historical quotes keep their segment.` });
      }
      setDraft(null);
      return;
    }
    setSegments((ss) => (ss.some((s) => s.id === seg.id) ? ss.map((s) => (s.id === seg.id ? { ...s, ...seg } : s)) : [...ss, seg]));
    toast.success(status === "ACTIVE" ? `${seg.name} activated` : `${seg.name} saved as draft`, {
      description: status === "ACTIVE" ? `${seg.members} members assigned.` : undefined,
    });
    setDraft(null);
  };

  // Discarding a pending draft version is reversible → undo toast.
  const discardPendingDraft = () => {
    if (!draft?.id || !pendingDraft) return;
    const id = draft.id;
    const kept = pendingDraft;
    setPendingDrafts((p) => withoutKey(p, id));
    setDraft(null);
    notifyUndo(`Draft v${kept.seg.version} of ${kept.seg.name} discarded`, () => setPendingDrafts((p) => ({ ...p, [id]: kept })));
  };

  const assignErrs: Record<string, string> = {};
  if (!assign.customerId) assignErrs["assign-customer"] = "Select the customer to reassign.";
  if (!assign.segment) assignErrs["assign-segment"] = "Select the segment to assign.";
  if (!assign.reason.trim()) assignErrs["assign-reason"] = "Enter a reason — manual overrides are audited.";
  const ae = (id: string) => (assignSubmitted ? assignErrs[id] : undefined);
  const assignDirty = !!(assign.customerId || assign.segment || assign.reason);

  const saveAssign = (e?: FormEvent) => {
    e?.preventDefault();
    setAssignSubmitted(true);
    const first = Object.keys(assignErrs)[0];
    if (first) {
      // US-ST-02 AC#7: a manual assignment without an override reason is rejected.
      setAssignError(
        assignErrs["assign-reason"] ? { errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Manual assignments need an override reason.", field: "overrideReason" } : null,
      );
      document.getElementById(first)?.focus();
      return;
    }
    setAssignSaving(true);
    window.setTimeout(() => {
      // Close the customer's current assignment so the history keeps the prior segment and its period.
      setHistory((h) => [
        { customerId: assign.customerId, segment: assign.segment, from: "2026-10-29", method: "MANUAL", reason: assign.reason, override: true },
        ...h.map((x) => (x.customerId === assign.customerId && !x.to ? { ...x, to: "2026-10-28" } : x)),
      ]);
      setAssignSaving(false);
      setAssignOpen(false);
      setAssign({ customerId: "", segment: "", reason: "" });
      setAssignError(null);
      setAssignSubmitted(false);
      toast.success("Segment assignment saved", { description: "Flagged as an override in the assignment history." });
    }, 400);
  };

  const removeListValue = (n: string) => {
    const kind = tab;
    const before = lists[kind];
    setLists({ ...lists, [kind]: before.filter((x) => x !== n) });
    notifyUndo(`${n} removed from segment list`, () => setLists((l) => ({ ...l, [kind]: before })));
  };

  const addListValue = (e: FormEvent) => {
    e.preventDefault();
    const v = newName.trim();
    if (!v || lists[tab].includes(v)) return;
    setLists({ ...lists, [tab]: [...lists[tab], v] });
    setNewName("");
    toast.success(`${v} added to segment list`);
  };

  const reevaluate = () => {
    setReevaluating(true);
    toast("Segment re-evaluation started", { description: "Assignments refresh in the background — history updates when it completes." });
    window.setTimeout(() => {
      setReevaluating(false);
      toast.success("Segment re-evaluation completed");
    }, 1500);
  };

  const listNameDup = !!newName.trim() && lists[tab].includes(newName.trim());

  return (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Strategy & segmentation" }, { label: "Segments" }]}>
      <ListHeader
        title="Segments"
        count={rows.length}
        noun={`${tab === "CUSTOMER" ? "customer" : "product"} segment`}
        subtitle="Group customers and products so the right price structure applies to each."
        search={search}
        onSearch={setSearch}
        actions={
          <>
            <Btn variant="outline" icon={UserPlus} onClick={() => { setAssignOpen(true); setAssignError(null); setAssignSubmitted(false); }}>
              Assign manually
            </Btn>
            <Btn icon={Plus} onClick={() => openEditor()}>
              Create segment
            </Btn>
          </>
        }
      />

      <PillTabs
        tabs={[
          { key: "CUSTOMER" as Kind, label: "Customers", count: segments.filter((s) => s.kind === "CUSTOMER").length },
          { key: "PRODUCT" as Kind, label: "Products", count: segments.filter((s) => s.kind === "PRODUCT").length },
        ]}
        active={tab}
        onChange={(k) => {
          setTab(k);
          setMethods([]);
        }}
      />

      <InfoBanner
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            Re-evaluation
            {reevaluating && <StatusPill status="RUNNING" label="Re-evaluating" />}
          </span>
        }
        action={
          <Btn variant="outline" size="sm" icon={RefreshCw} loading={reevaluating} onClick={reevaluate}>
            Re-evaluate now
          </Btn>
        }
      >
        Assignments are re-evaluated nightly and whenever a customer or product attribute changes. When a record matches more than one segment, the <b>lowest priority number wins</b>. Historical quotes keep the segment they were priced with.
      </InfoBanner>

      <FilterPills<Method>
        label="Method"
        selected={methods}
        onChange={setMethods}
        options={tabMethods.map((m) => ({ key: m, label: methodLabel(m), count: inTab.filter((s) => s.method === m).length }))}
      />

      <DataTable<Segment>
        caption={`${tab === "CUSTOMER" ? "Customer" : "Product"} segments`}
        rows={rows}
        rowKey={(s) => s.id}
        selectedKey={draft?.id ?? null}
        onRowClick={(s) => openEditor(s)}
        pageSize={25}
        empty={
          search || methods.length ? (
            <EmptyState title={search ? `No segments match “${search}”` : "No segments match these filters"} action={<Btn variant="subtle" onClick={clearFilters}>Clear filters</Btn>}>
              Try a different search term or remove a filter.
            </EmptyState>
          ) : (
            <EmptyState title="No segments yet" action={<Btn icon={Plus} onClick={() => openEditor()}>Create segment</Btn>}>
              Segments decide which price structure applies to each customer or product.
            </EmptyState>
          )
        }
        columns={[
          {
            key: "name",
            header: "Name",
            className: "whitespace-nowrap",
            cell: (s) => (
              <button
                type="button"
                className="text-brand font-semibold hover:underline text-left"
                onClick={(e) => {
                  e.stopPropagation();
                  openEditor(s);
                }}
                aria-label={`Edit segment ${s.name}`}
              >
                {s.name}
              </button>
            ),
          },
          { key: "method", header: "Method", className: "whitespace-nowrap", cell: (s) => <Tag tone={s.method === "AI_DERIVED" ? "brand" : s.method === "MANUAL" ? "neutral" : "info"}>{methodLabel(s.method)}</Tag> },
          {
            key: "def",
            header: "Definition",
            cell: (s) => (
              <div className="min-w-56 max-w-sm">
                {definitionText(s)}
                {s.method === "AI_DERIVED" && <div className="text-xs text-muted-foreground mt-0.5">Model {s.modelVersion} · confidence {s.confidence}</div>}
              </div>
            ),
          },
          { key: "prio", header: "Priority", align: "right", cell: (s) => <span className="tabular-nums">{s.priority}</span> },
          { key: "members", header: "Members", align: "right", cell: (s) => <span className="tabular-nums">{s.members.toLocaleString("en-GB")}</span> },
          {
            key: "ps",
            header: "Price structure",
            className: "min-w-44",
            cell: (s) => {
              const pl = s.priceStructure ? PRICE_LISTS.find((l) => l.name === s.priceStructure) : undefined;
              return pl ? (
                <span onClick={(e) => e.stopPropagation()}>
                  <RecordLink to="/pricing/price-lists/$id" params={{ id: pl.id }}>
                    {pl.name}
                  </RecordLink>
                </span>
              ) : (
                (s.priceStructure ?? <span className="text-muted-foreground">—</span>)
              );
            },
          },
          { key: "ver", header: "Version", align: "right", cell: (s) => <span className="tabular-nums">v{s.version ?? 1}</span> },
          {
            key: "status",
            header: "Status",
            cell: (s) => (
              <span className="flex flex-wrap items-center gap-1.5">
                <StatusPill status={s.status} />
                {pendingDrafts[s.id] && <StatusPill status="DRAFT" label={`Draft v${pendingDrafts[s.id].seg.version}`} />}
              </span>
            ),
          },
          { key: "eval", header: "Last evaluated", cell: (s) => <span className="text-muted-foreground tabular-nums whitespace-nowrap">{s.lastEvaluated}</span> },
        ]}
      />

      <section className="mt-8" aria-labelledby="seg-history-h">
        <div className="mb-3">
          <h2 id="seg-history-h" className="text-lg font-semibold tracking-tight">
            Assignment history
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">Retained for audit. Manual overrides are flagged.</p>
        </div>
        <DataTable
          caption="Segment assignment history"
          rows={history}
          rowKey={(h) => `${h.customerId}-${h.segment}-${h.from}`}
          pageSize={10}
          columns={[
            {
              key: "c",
              header: "Customer",
              className: "whitespace-nowrap",
              cell: (h) => <RecordLink to="/pricing/customers/$id" params={{ id: h.customerId }}>{CUSTOMERS.find((c) => c.id === h.customerId)?.name ?? h.customerId}</RecordLink>,
            },
            { key: "s", header: "Segment", className: "whitespace-nowrap", cell: (h) => <span className="font-medium">{h.segment}</span> },
            { key: "p", header: "Period", cell: (h) => <span className="tabular-nums whitespace-nowrap">{h.from} → {h.to ?? "current"}</span> },
            { key: "m", header: "Method", className: "whitespace-nowrap", cell: (h) => (h.override ? <Flag tone="warning">Override</Flag> : <Tag>{methodLabel(h.method as Method)}</Tag>) },
            { key: "r", header: "Reason", cell: (h) => <span className="block min-w-64 text-muted-foreground">{h.reason ?? "—"}</span> },
          ]}
        />
      </section>

      <Card className="mt-6" title="Segment lists" subtitle={`Names offered when creating ${tab === "CUSTOMER" ? "customer" : "product"} segments.`}>
        <ul className="flex flex-wrap gap-2" aria-label={`${tab === "CUSTOMER" ? "Customer" : "Product"} segment list`}>
          {lists[tab].map((n) => (
            <li key={n} className="inline-flex items-center gap-1 rounded-full bg-muted pl-3 pr-1 py-1 text-sm">
              {n}
              <button type="button" aria-label={`Remove ${n}`} onClick={() => removeListValue(n)} className="size-8 grid place-items-center rounded-full text-muted-foreground hover:text-destructive hover:bg-card">
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <form className="flex flex-wrap items-start gap-3 mt-4 max-w-xl" onSubmit={addListValue}>
          <Field label="New list value" className="flex-1 min-w-48" error={listNameDup ? `${newName.trim()} is already in the list.` : undefined}>
            <input className={inputCls} placeholder={`e.g. ${tab === "CUSTOMER" ? "Key account" : "Premium range"}`} value={newName} onChange={(e) => setNewName(e.target.value)} />
          </Field>
          <Btn type="submit" variant="outline" icon={Plus} className="mt-6" disabled={!newName.trim() || listNameDup}>
            Add
          </Btn>
        </form>
      </Card>

      {/* ---------- Segment editor ---------- */}
      <Drawer
        open={!!draft}
        onClose={() => setDraft(null)}
        dismissible={!dirty && !saving && !confirmActivate}
        title={draft?.id ? `Edit segment · ${draft.name}` : "Create segment"}
        subtitle={
          draft ? (
            <span className="inline-flex flex-wrap items-center gap-2">
              {humanize(draft.kind)} segment
              {live && <span className="tabular-nums">· live v{liveVersion}</span>}
              {versioning && <StatusPill status="DRAFT" label={`Editing v${liveVersion + 1}`} />}
              {dirty && <StatusPill status="PENDING" label="Unsaved changes" />}
            </span>
          ) : undefined
        }
        footer={
          <>
            {pendingDraft && (
              <Btn variant="ghost" onClick={discardPendingDraft} disabled={!!saving} className="mr-auto">
                Discard draft v{pendingDraft.seg.version}
              </Btn>
            )}
            <Btn variant="subtle" onClick={() => setDraft(null)} disabled={!!saving}>
              Cancel
            </Btn>
            <Btn variant="outline" loading={saving === "DRAFT"} disabled={!!saving} onClick={() => requestPersist("DRAFT")}>
              Save draft
            </Btn>
            <Btn icon={Zap} disabled={!!saving} onClick={() => requestPersist("ACTIVE")}>
              Activate
            </Btn>
          </>
        }
      >
        {draft && (
          <>
            <ErrorBanner error={error} onClose={() => setError(null)} />
            {versioning && (
              <InfoBanner title={pendingDraft ? `Continuing draft v${liveVersion + 1}` : "Editing an active segment"}>
                Saving creates version {liveVersion + 1} as a draft with a reason code. Version {liveVersion} keeps assigning members until version {liveVersion + 1} is activated.
              </InfoBanner>
            )}
            <p className="text-xs text-muted-foreground">
              <span className="text-destructive" aria-hidden>*</span> Required
            </p>
            <div className="bg-card border border-border rounded-xl p-5 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              <Field label="Segment name" required error={fe("seg-name")}>
                <input id="seg-name" list="seg-names" className={inputCls} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
              </Field>
              <datalist id="seg-names">
                {lists[draft.kind].map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <Field label="Kind" required>
                <select className={inputCls} value={draft.kind} onChange={(e) => setDraft({ ...emptyDraft(e.target.value as Kind), name: draft.name, id: draft.id })}>
                  <option value="CUSTOMER">Customer</option>
                  <option value="PRODUCT">Product</option>
                </select>
              </Field>
              <Field label="Method" required>
                <select className={inputCls} value={draft.method} onChange={(e) => { setDraft({ ...draft, method: e.target.value as Segment["method"] }); setPreviewed(false); }}>
                  {SEGMENT_METHODS.filter((m) => draft.kind === "CUSTOMER" || m !== "VOLUME").map((m) => (
                    <option key={m} value={m}>
                      {methodLabel(m)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Priority" required hint="Lower number wins when a record matches several segments." error={fe("seg-priority")}>
                <input id="seg-priority" type="number" inputMode="numeric" min={1} max={999} step={1} className={inputCls} value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })} placeholder="e.g. 10" />
              </Field>
              <Field label="Price structure" className="sm:col-span-2" hint="Price list applied to members of this segment.">
                <select className={inputCls} value={draft.priceStructure} onChange={(e) => setDraft({ ...draft, priceStructure: e.target.value })}>
                  <option value="">None</option>
                  {PRICE_LISTS.filter((l) => ["BASE", "SEGMENT", "CHANNEL"].includes(l.type)).map((l) => (
                    <option key={l.id} value={l.name}>
                      {l.name} ({humanize(l.type)})
                    </option>
                  ))}
                </select>
              </Field>
              {versioning && (
                <>
                  <Field label="Reason for change" required error={fe("seg-reason")} className={draft.reasonCode === "OTHER" ? undefined : "sm:col-span-2"}>
                    <select id="seg-reason" className={inputCls} value={draft.reasonCode} onChange={(e) => setDraft({ ...draft, reasonCode: e.target.value })}>
                      <option value="">Select reason…</option>
                      {REASON_CODES.map((r) => (
                        <option key={r} value={r}>
                          {humanize(r)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {draft.reasonCode === "OTHER" && (
                    <Field label="Reason text" required error={fe("seg-reason-text")}>
                      <input id="seg-reason-text" className={inputCls} value={draft.reasonText} onChange={(e) => setDraft({ ...draft, reasonText: e.target.value })} />
                    </Field>
                  )}
                </>
              )}
            </div>

            {draft.method === "ATTRIBUTE" && (
              <Card title="Attribute rule" subtitle="Members must match every condition." actions={<Btn variant="outline" size="sm" icon={Plus} onClick={() => setDraft({ ...draft, conds: [...draft.conds, { field: Object.keys(FIELDS[draft.kind])[0], op: "Equal to", value: "" }] })}>Add condition</Btn>}>
                <div className="space-y-4">
                  {draft.conds.map((c, i) => (
                    <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1.2fr_auto] gap-2 items-start">
                      <select aria-label={`Condition ${i + 1} attribute`} className={inputCls} value={c.field} onChange={(e) => setDraft({ ...draft, conds: draft.conds.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)) })}>
                        {Object.keys(FIELDS[draft.kind]).map((f) => (
                          <option key={f}>{f}</option>
                        ))}
                      </select>
                      <select aria-label={`Condition ${i + 1} operator`} className={inputCls} value={c.op} onChange={(e) => setDraft({ ...draft, conds: draft.conds.map((x, j) => (j === i ? { ...x, op: e.target.value } : x)) })}>
                        {OPS.map((o) => (
                          <option key={o}>{o}</option>
                        ))}
                      </select>
                      <div>
                        <input
                          id={`seg-cond-${i}`}
                          aria-label={`Condition ${i + 1} value`}
                          aria-invalid={!!fe(`seg-cond-${i}`) || undefined}
                          aria-describedby={fe(`seg-cond-${i}`) ? `seg-cond-${i}-msg` : undefined}
                          className={inputCls}
                          placeholder={c.op === "Between" ? "e.g. 10M - 100M" : c.op === "In" || c.op === "Not in" ? "e.g. Retail, Trade" : "e.g. Distributor"}
                          value={c.value}
                          onChange={(e) => { setDraft({ ...draft, conds: draft.conds.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) }); setPreviewed(false); }}
                        />
                        {fe(`seg-cond-${i}`) && (
                          <p id={`seg-cond-${i}-msg`} className="text-xs text-destructive mt-1.5">
                            {fe(`seg-cond-${i}`)}
                          </p>
                        )}
                      </div>
                      <button
                        type="button"
                        aria-label={`Remove condition ${i + 1}`}
                        disabled={draft.conds.length === 1}
                        title={draft.conds.length === 1 ? "A rule needs at least one condition" : undefined}
                        onClick={() => setDraft({ ...draft, conds: draft.conds.filter((_, j) => j !== i) })}
                        className="size-10 grid place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    </div>
                  ))}
                </div>
              </Card>
            )}
            {draft.method === "VOLUME" && (
              <Card title="Volume rule">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <Field label="Volume metric" required>
                    <select className={inputCls} value={draft.volumeMetric} onChange={(e) => setDraft({ ...draft, volumeMetric: e.target.value })}>
                      {VOLUME_METRICS.map((m) => (
                        <option key={m} value={m}>
                          {humanize(m)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Trailing months" required error={fe("seg-trailing")}>
                    <input id="seg-trailing" type="number" inputMode="numeric" min={1} max={36} step={1} className={inputCls} value={draft.trailingMonths} onChange={(e) => setDraft({ ...draft, trailingMonths: e.target.value })} />
                  </Field>
                  <Field label="Threshold (≥)" required error={fe("seg-threshold")}>
                    <input id="seg-threshold" type="number" inputMode="decimal" min={0} step="any" className={inputCls} value={draft.threshold} onChange={(e) => { setDraft({ ...draft, threshold: e.target.value }); setPreviewed(false); }} placeholder="e.g. 1000000" />
                  </Field>
                </div>
              </Card>
            )}
            {draft.method === "AI_DERIVED" && (
              <Card title="AI-derived cluster">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <dt className="text-muted-foreground">Model version</dt>
                  <dd className="font-medium">{segments.find((s) => s.id === draft.id)?.modelVersion ?? "seg-km-2026.09"}</dd>
                  <dt className="text-muted-foreground">Confidence</dt>
                  <dd className="font-medium">{segments.find((s) => s.id === draft.id)?.confidence ?? 0.82}</dd>
                </dl>
                <p className="text-xs text-muted-foreground mt-3">Read-only — produced by a model run. Model version and confidence are stored with each assignment.</p>
              </Card>
            )}
            {draft.method === "MANUAL" && (
              <Card title="Members">
                <fieldset className="max-h-56 overflow-y-auto space-y-1">
                  <legend className="sr-only">Choose members</legend>
                  {(draft.kind === "CUSTOMER" ? CUSTOMERS.map((c) => ({ k: c.id, n: c.name })) : PRODUCTS.map((p) => ({ k: p.productId, n: `${p.sku} · ${p.name}` }))).map((o) => (
                    <label key={o.k} className="flex items-center gap-2 text-sm min-h-8">
                      <input type="checkbox" className="size-4" checked={draft.manualMembers.includes(o.k)} onChange={(e) => { setDraft({ ...draft, manualMembers: e.target.checked ? [...draft.manualMembers, o.k] : draft.manualMembers.filter((x) => x !== o.k) }); setPreviewed(false); }} />
                      {o.n}
                    </label>
                  ))}
                </fieldset>
              </Card>
            )}

            <Card
              title="Preview before activation"
              actions={
                <Btn
                  id="seg-preview-btn"
                  variant="outline"
                  size="sm"
                  icon={Eye}
                  loading={previewing}
                  onClick={() => {
                    setPreviewing(true);
                    window.setTimeout(() => {
                      setPreviewing(false);
                      setPreviewed(true);
                      if (error?.code === "PREVIEW_REQUIRED") setError(null);
                    }, 300);
                  }}
                >
                  {previewed ? "Refresh preview" : "Preview"}
                </Btn>
              }
            >
              {!previewed || !preview ? (
                <p className="text-sm text-muted-foreground">Preview to see members, changes and overlaps. Activation requires a preview.</p>
              ) : (
                <div className="space-y-4" role="status">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {[
                      { l: "Members", v: preview.matches.length, t: "text-foreground" },
                      { l: "Newly added", v: preview.added.length, t: "text-success" },
                      { l: "Removed", v: preview.removed.length, t: "text-destructive" },
                    ].map((k) => (
                      <div key={k.l} className="rounded-lg border border-border p-3">
                        <div className="text-xs text-muted-foreground">{k.l}</div>
                        <div className={`text-2xl font-bold tabular-nums ${k.t}`}>{k.v}</div>
                      </div>
                    ))}
                  </div>
                  <div className="text-sm">
                    <h3 className="font-semibold mb-1">Members</h3>
                    <ul className="space-y-1">
                      {preview.matches.map((r) => (
                        <li key={preview.keyOf(r)} className="flex items-center gap-2">
                          {preview.nameOf(r)} {preview.added.includes(r) && <Tag tone="success">+ new</Tag>}
                        </li>
                      ))}
                      {preview.removed.map((r) => (
                        <li key={preview.keyOf(r)} className="flex items-center gap-2 line-through text-muted-foreground">
                          {preview.nameOf(r)} <Tag tone="danger">removed</Tag>
                        </li>
                      ))}
                      {preview.matches.length === 0 && preview.removed.length === 0 && <li className="text-muted-foreground">No matches — loosen the conditions and preview again.</li>}
                    </ul>
                  </div>
                  {preview.multi.length > 0 && (
                    <div className="rounded-lg border border-warning/50 bg-warning-soft p-3 text-sm">
                      <h3 className="font-semibold text-warning-foreground mb-1">Matching more than one segment ({preview.multi.length})</h3>
                      <ul className="space-y-1">
                        {preview.multi.map((m) => (
                          <li key={m.c.id}>
                            <RecordLink to="/pricing/customers/$id" params={{ id: m.c.id }}>
                              {m.c.id}
                            </RecordLink>{" "}
                            {m.c.name}: {m.all.map((a) => `${a.name} (priority ${a.priority})`).join(", ")} → assigned <b>{m.winner}</b>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </Card>

            {live && (
              <Card title="Version history" padded={false}>
                <ul className="divide-y divide-border text-sm" aria-label={`${live.name} version history`}>
                  {[
                    ...(pendingDraft ? [{ seg: pendingDraft.seg, status: "DRAFT", note: "Not yet active" }] : []),
                    { seg: live, status: live.status, note: live.status === "ACTIVE" ? "Assigning members now" : "Never activated" },
                    ...(segHistory[live.id] ?? []).map((h) => ({ seg: h.seg, status: "SUPERSEDED", note: `Superseded ${h.supersededAt}` })),
                  ].map(({ seg, status, note }) => (
                    <li key={`${seg.version ?? 1}-${status}`} className="px-6 py-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold tabular-nums">v{seg.version ?? 1}</span>
                        <StatusPill status={status} />
                        <span className="text-muted-foreground">{note}</span>
                      </div>
                      <div className="mt-1 text-muted-foreground">{definitionText(seg)} · priority {seg.priority}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {seg.reasonCode ? (seg.reasonCode.startsWith("OTHER: ") ? `Other: ${seg.reasonCode.slice(7)}` : humanize(seg.reasonCode)) : "Initial version"}
                        {seg.changedBy && ` · ${seg.changedBy} · ${seg.changedAt}`}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </>
        )}
      </Drawer>

      <ConfirmDialog
        open={confirmActivate}
        title={versioning ? `Activate ${draft?.name} v${liveVersion + 1}?` : `Activate ${draft?.name || "this segment"}?`}
        description={`${versioning ? `v${liveVersion + 1} supersedes v${liveVersion}. ` : ""}${preview?.matches.length ?? 0} ${draft?.kind === "PRODUCT" ? "products" : "customers"} will be assigned (${preview?.added.length ?? 0} added, ${preview?.removed.length ?? 0} removed) and priced with ${draft?.priceStructure || "their current price structure"} from now on. Historical quotes keep their segment.`}
        confirmLabel="Activate segment"
        loading={saving === "ACTIVE"}
        onConfirm={() => persist("ACTIVE")}
        onCancel={() => setConfirmActivate(false)}
      />

      {/* ---------- Manual assignment ---------- */}
      <Modal
        open={assignOpen}
        onClose={() => setAssignOpen(false)}
        dismissible={!assignDirty && !assignSaving}
        title="Assign segment manually"
        subtitle="Manual assignments override rule-based segments and require a reason."
        footer={
          <>
            <Btn variant="subtle" onClick={() => setAssignOpen(false)} disabled={assignSaving}>
              Cancel
            </Btn>
            <Btn type="submit" form="assign-form" loading={assignSaving}>
              Save override
            </Btn>
          </>
        }
      >
        <ErrorBanner error={assignError} onClose={() => setAssignError(null)} />
        <form id="assign-form" className="space-y-4" onSubmit={saveAssign} noValidate>
          <Field label="Customer" required error={ae("assign-customer")}>
            <select id="assign-customer" className={inputCls} value={assign.customerId} onChange={(e) => setAssign({ ...assign, customerId: e.target.value })}>
              <option value="">Select customer…</option>
              {CUSTOMERS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id} · {c.name} (current: {c.segment})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Segment" required error={ae("assign-segment")}>
            <select id="assign-segment" className={inputCls} value={assign.segment} onChange={(e) => setAssign({ ...assign, segment: e.target.value })}>
              <option value="">Select segment…</option>
              {lists.CUSTOMER.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          <Field label="Override reason" required error={ae("assign-reason")} hint="Shown in the assignment history for audit.">
            <textarea id="assign-reason" rows={3} className={`${inputCls} h-auto py-2`} value={assign.reason} onChange={(e) => setAssign({ ...assign, reason: e.target.value })} placeholder="e.g. Negotiated strategic terms for 2027" />
          </Field>
        </form>
      </Modal>
    </PricingLayout>
  );
}
