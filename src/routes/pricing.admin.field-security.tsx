import { createFileRoute } from "@tanstack/react-router";
import { useId, useMemo, useState, type FormEvent } from "react";
import { Eye, Lock, Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  DataTable,
  ErrorBanner,
  Field,
  Flag,
  InfoBanner,
  ListHeader,
  MissingHint,
  Modal,
  PricingLayout,
  Tag,
  Toggle,
  humanize,
  inputCls,
  missingFields,
  money,
  type ApiError,
  type Tone,
} from "@/components/pricing/kit";
import { RequireAccess } from "@/components/pricing/access";
import { CLASSIFICATIONS, FIELD_POLICIES, FLS_CHANNELS, MASK_MODES, ROLES, ROLE_LABEL, type FieldPolicy, type MaskMode, type Role } from "@/lib/pricing/session";

export const Route = createFileRoute("/pricing/admin/field-security")({
  head: () => ({ meta: [{ title: "Field security · Rebate Ninja" }] }),
  component: () => (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Administration" }, { label: "Field security" }]}>
      <RequireAccess roles={["PRICING_ADMIN", "IT_ADMIN"]}>
        <Page />
      </RequireAccess>
    </PricingLayout>
  ),
});

/** Fields that exist in the pricing data model — a policy for anything else is rejected (UNKNOWN_FIELD). */
const KNOWN_FIELDS = ["costPrice", "marginAmount", "marginPct", "priceFloor", "priceCeiling", "competitorPrice", "rebateRate", "dealValue", "listPrice", "netPrice", "discountPct", "accrualAmount"];
const CLASS_TONE: Record<string, Tone> = { PUBLIC: "neutral", INTERNAL: "info", CONFIDENTIAL: "warning", RESTRICTED: "danger" };
const CLASS_RANK: Record<string, number> = { PUBLIC: 0, INTERNAL: 1, CONFIDENTIAL: 2, RESTRICTED: 3 };
const MASK_HINT: Record<MaskMode, string> = { HIDE: "Field omitted entirely", MASK: "Shown as ••••", ROUND: "Shown as a band, e.g. 20–30%" };

type Policy = Omit<FieldPolicy, "field" | "derivedFrom"> & { field: string; derivedFrom?: string; encrypted: boolean };

/** Access after inheritance: a derived field is never looser than its source unless explicitly opened. */
function effective(role: Role, field: string, ps: Policy[]): "SHOW" | MaskMode {
  const p = ps.find((x) => x.field === field);
  if (!p) return "SHOW";
  if (p.openedFor?.includes(role)) return "SHOW";
  const src = p.derivedFrom ? ps.find((x) => x.field === p.derivedFrom) : undefined;
  const allowed = p.allowed.includes(role) && (!src || src.allowed.includes(role) || !!src.openedFor?.includes(role));
  if (allowed) return "SHOW";
  if (p.rounded?.includes(role)) return "ROUND";
  return p.mask;
}
/** Classification after inheritance (strictest of field and source). */
const effectiveClass = (p: Policy, ps: Policy[]) => {
  const src = p.derivedFrom ? ps.find((x) => x.field === p.derivedFrom) : undefined;
  return src && CLASS_RANK[src.classification] > CLASS_RANK[p.classification] ? src.classification : p.classification;
};

function Page() {
  const [policies, setPolicies] = useState<Policy[]>(() => FIELD_POLICIES.map((p) => ({ ...p, encrypted: p.classification === "RESTRICTED" })));
  const [editing, setEditing] = useState<Policy | "new" | null>(null);
  const [draft, setDraft] = useState<Policy | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewRole, setPreviewRole] = useState<Role>("SALES_REP");
  const hintId = useId();
  const missing = draft ? missingFields([["Field name", draft.field], ["Channels", draft.channels]]) : [];

  const open = (p?: Policy) => {
    setEditing(p ?? "new");
    setDraft(
      p
        ? { ...p, allowed: [...p.allowed], channels: [...p.channels], openedFor: [...(p.openedFor ?? [])] }
        : ({ field: "", label: "", classification: "RESTRICTED", allowed: ["PRICING_ADMIN"], mask: "HIDE", channels: [...FLS_CHANNELS], encrypted: true } as Policy),
    );
    setError(null);
  };

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    if (!draft) return;
    const name = draft.field.trim();
    if (!name) {
      setError({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Enter the field name the policy protects.", field: "field" });
      document.getElementById("fls-field")?.focus();
      return;
    }
    if (!KNOWN_FIELDS.includes(name)) {
      setError({ errorClass: "VALIDATION", code: "UNKNOWN_FIELD", message: `“${name}” is not a field in the pricing data model. Pick one of: ${KNOWN_FIELDS.join(", ")}.`, field: "field" });
      document.getElementById("fls-field")?.focus();
      return;
    }
    if (editing === "new" && policies.some((p) => p.field === name)) {
      setError({ errorClass: "BUSINESS_RULE", code: "POLICY_EXISTS", message: `A policy for ${name} already exists. Edit it instead.`, field: "field" });
      return;
    }
    if (draft.channels.length === 0) {
      setError({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Select at least one channel the policy applies to.", field: "channels" });
      return;
    }
    setSaving(true);
    window.setTimeout(() => {
      const next: Policy = { ...draft, field: name, label: draft.label || humanize(name.replace(/([A-Z])/g, "_$1")), encrypted: draft.classification === "RESTRICTED" || draft.encrypted };
      setPolicies((ps) => (editing === "new" ? [...ps, next] : ps.map((p) => (p.field === next.field ? next : p))));
      setSaving(false);
      setEditing(null);
      toast.success(`Policy for ${next.label} saved`, { description: "Applies to UI, API, exports, notifications and reports from the next request." });
    }, 400);
  };

  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  return (
    <>
      <ListHeader
        title="Field security"
        eyebrow="Administration"
        count={policies.length}
        noun="policy"
        nounPlural="policies"
        subtitle="Hide, mask or round sensitive fields for roles that shouldn't see them — everywhere the data goes."
        actions={
          <Btn icon={Plus} onClick={() => open()}>
            Create policy
          </Btn>
        }
      />
      <InfoBanner title="Applied everywhere the data goes">
        Restricted values are removed before they reach a screen, export, report, notification or API response. Fields worked out from them
        (like margin from cost) follow the same rule unless opened up.
      </InfoBanner>

      <DataTable<Policy>
        caption="Field security policies"
        rows={policies}
        rowKey={(p) => p.field}
        onRowClick={(p) => open(p)}
        columns={[
          {
            key: "field",
            header: "Field",
            className: "min-w-40",
            cell: (p) => (
              <div>
                <div className="font-medium text-brand-strong">{p.label}</div>
                <div className="font-mono text-xs text-muted-foreground">{p.field}</div>
              </div>
            ),
          },
          {
            key: "class",
            header: "Classification",
            cell: (p) => {
              const eff = effectiveClass(p, policies);
              return (
                <div className="flex flex-col items-start gap-1">
                  <Tag tone={CLASS_TONE[eff]}>{humanize(eff)}</Tag>
                  {eff !== p.classification && <span className="text-xs text-muted-foreground">inherited from {p.derivedFrom}</span>}
                </div>
              );
            },
          },
          { key: "allowed", header: "Sees the value", className: "min-w-56", cell: (p) => <span className="text-sm">{[...p.allowed, ...(p.openedFor ?? [])].map((r) => ROLE_LABEL[r].split(" (")[0].split(" /")[0]).join(", ")}</span> },
          { key: "mask", header: "Everyone else", cell: (p) => <span className="whitespace-nowrap">{humanize(p.mask)}{p.rounded?.length ? ` · round for ${p.rounded.map((r) => humanize(r)).join(", ")}` : ""}</span> },
          { key: "derived", header: "Derived from", cell: (p) => (p.derivedFrom ? <span className="text-xs"><span className="font-mono">{p.derivedFrom}</span>{p.openedFor?.length ? <span className="block text-muted-foreground">opened for {p.openedFor.map((r) => humanize(r)).join(", ")}</span> : null}</span> : <span className="text-muted-foreground">—</span>) },
          { key: "ch", header: "Channels", align: "right", cell: (p) => <span className="tabular-nums">{p.channels.length === FLS_CHANNELS.length ? "All 6" : `${p.channels.length} of 6`}</span> },
          { key: "enc", header: "At rest", cell: (p) => (p.encrypted ? <Flag tone="success">Encrypted</Flag> : <span className="text-muted-foreground">Standard</span>) },
          { key: "edit", header: <span className="sr-only">Actions</span>, cell: (p) => <Btn variant="ghost" size="sm" icon={Pencil} aria-label={`Edit policy for ${p.label}`} onClick={(e) => (e.stopPropagation(), open(p))}>Edit</Btn> },
        ]}
      />

      <Preview role={previewRole} setRole={setPreviewRole} policies={policies} />

      <Modal
        open={editing !== null && !!draft}
        onClose={() => setEditing(null)}
        dismissible={!saving}
        size="lg"
        title={editing === "new" ? "Create field policy" : `Edit policy · ${draft?.label}`}
        subtitle="Changes take effect on every channel from the next request."
        footer={
          <>
            <MissingHint id={hintId} missing={missing} />
            <Btn variant="subtle" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Btn>
            <Btn type="submit" form="fls-form" loading={saving} disabled={missing.length > 0} aria-describedby={missing.length ? hintId : undefined}>
              Save policy
            </Btn>
          </>
        }
      >
        {draft && (
          <form id="fls-form" onSubmit={save} noValidate>
            <ErrorBanner error={error} onClose={() => setError(null)} />
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="Field name" required hint="The data-model field, e.g. costPrice.">
                <input id="fls-field" list="fls-known" className={`${inputCls} font-mono`} value={draft.field} disabled={editing !== "new"} onChange={(e) => setDraft({ ...draft, field: e.target.value })} placeholder="e.g. priceCeiling" />
              </Field>
              <datalist id="fls-known">
                {KNOWN_FIELDS.filter((k) => !policies.some((p) => p.field === k)).map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
              <Field label="Classification" required>
                <select className={inputCls} value={draft.classification} onChange={(e) => setDraft({ ...draft, classification: e.target.value as Policy["classification"] })}>
                  {CLASSIFICATIONS.map((c) => (
                    <option key={c} value={c}>
                      {humanize(c)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="For everyone else" required hint={MASK_HINT[draft.mask]}>
                <select className={inputCls} value={draft.mask} onChange={(e) => setDraft({ ...draft, mask: e.target.value as MaskMode })}>
                  {MASK_MODES.map((m) => (
                    <option key={m} value={m}>
                      {humanize(m)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Derived from" hint="A derived field inherits the stricter rule of its source.">
                <select className={inputCls} value={draft.derivedFrom ?? ""} onChange={(e) => setDraft({ ...draft, derivedFrom: (e.target.value || undefined) as Policy["derivedFrom"] })}>
                  <option value="">Not derived</option>
                  {policies.filter((p) => p.field !== draft.field).map((p) => (
                    <option key={p.field} value={p.field}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <fieldset className="mt-6 border-t border-border pt-4">
              <legend className="text-sm font-semibold">Roles that see the real value</legend>
              <div className="grid gap-2 sm:grid-cols-2 mt-2">
                {ROLES.map((r) => (
                  <label key={r} className="flex items-center gap-2 text-sm min-h-10">
                    <input type="checkbox" className="size-4 accent-brand" checked={draft.allowed.includes(r)} onChange={() => setDraft({ ...draft, allowed: toggleIn(draft.allowed, r) })} />
                    {ROLE_LABEL[r]}
                  </label>
                ))}
              </div>
            </fieldset>
            {draft.derivedFrom && (
              <fieldset className="mt-6 border-t border-border pt-4">
                <legend className="text-sm font-semibold">Explicitly opened for</legend>
                <p className="text-xs text-muted-foreground mb-2">These roles see this derived field even though the source ({draft.derivedFrom}) stays hidden from them.</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {ROLES.map((r) => (
                    <label key={r} className="flex items-center gap-2 text-sm min-h-10">
                      <input type="checkbox" className="size-4 accent-brand" checked={!!draft.openedFor?.includes(r)} onChange={() => setDraft({ ...draft, openedFor: toggleIn(draft.openedFor ?? [], r) })} />
                      {ROLE_LABEL[r]}
                    </label>
                  ))}
                </div>
              </fieldset>
            )}
            <fieldset className="mt-6 border-t border-border pt-4">
              <legend className="text-sm font-semibold">Channels</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2 mt-2">
                {FLS_CHANNELS.map((c) => (
                  <label key={c} className="flex items-center gap-2 text-sm min-h-10">
                    <input type="checkbox" className="size-4 accent-brand" checked={draft.channels.includes(c)} onChange={() => setDraft({ ...draft, channels: toggleIn(draft.channels, c) })} />
                    {humanize(c)}
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="mt-6 border-t border-border pt-4">
              <Toggle label={draft.classification === "RESTRICTED" ? "Encrypt at rest (always on for restricted fields)" : "Encrypt at rest"} checked={draft.classification === "RESTRICTED" || draft.encrypted} onChange={(v) => draft.classification !== "RESTRICTED" && setDraft({ ...draft, encrypted: v })} />
            </div>
          </form>
        )}
      </Modal>
    </>
  );
}

/** What a role actually receives: the quote-line API response and the approval email (US-AD-03 AC#1, #3, #4). */
function Preview({ role, setRole, policies }: { role: Role; setRole: (r: Role) => void; policies: Policy[] }) {
  const line = { quoteId: "Q-10231", lineId: "L1", sku: "LT-PNL-60", qty: 600, listPrice: 34.5, netPrice: 28.29, discountPct: 18, costPrice: 18.2, marginAmount: 6053.4, marginPct: 35.67, priceFloor: 24, currency: "GBP" };
  const shown = useMemo(() => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(line)) {
      const a = effective(role, k, policies);
      if (a === "SHOW") out[k] = v;
      else if (a === "MASK") out[k] = "••••";
      else if (a === "ROUND" && typeof v === "number") out[k] = `${Math.floor(v / 10) * 10}–${Math.floor(v / 10) * 10 + 10}%`;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, policies]);
  const omitted = Object.keys(line).filter((k) => !(k in shown));
  const marginLine = effective(role, "marginPct", policies) === "SHOW" ? " · margin 35.7%" : "";
  const costLine = effective(role, "costPrice", policies) === "SHOW" ? `\nCost ${money(18.2)} / EA` : "";
  return (
    <Card
      title="Preview as role"
      subtitle="Exactly what this role receives."
      className="mt-6"
      actions={
        <Field label={<span className="sr-only">Role to preview</span>} className="w-72">
          <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>
      }
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="pv-api">
          <h3 id="pv-api" className="text-lg lg:text-xl leading-[1.2] font-semibold mb-2 flex items-center gap-2">
            <Eye className="size-4 shrink-0 text-muted-foreground" aria-hidden /> <span className="min-w-0 wrap-anywhere">API · GET /api/v1/quotes/Q-10231/lines/L1</span>
          </h3>
          <pre className="bg-muted rounded-lg p-4 text-xs overflow-x-auto overflow-y-hidden">{JSON.stringify(shown, null, 2)}</pre>
          {omitted.length > 0 && (
            <p className="mt-2 text-sm" role="status">
              <Flag tone="info">
                Omitted for {ROLE_LABEL[role]}: {omitted.join(", ")}
              </Flag>
            </p>
          )}
        </section>
        <section aria-labelledby="pv-mail">
          <h3 id="pv-mail" className="text-lg lg:text-xl leading-[1.2] font-semibold mb-2">Approval email · Export row</h3>
          <div className="border border-border rounded-lg p-4 text-base whitespace-pre-line bg-card">
            <p className="font-semibold">Approve Q-10231 · Edmundson Electrical</p>
            <p className="mt-2">{`Sam Carter needs your approval.\nDiscount 18%${marginLine} · deal value £24,346${costLine}\nDue 31 Oct 2026, 14:30.`}</p>
          </div>
          <p className="text-xs text-muted-foreground mt-2">CSV exports and reports drop the same columns for this role.</p>
        </section>
      </div>
    </Card>
  );
}
