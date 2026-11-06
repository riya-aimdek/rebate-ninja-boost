import { createFileRoute } from "@tanstack/react-router";
import { useId, useState, type FormEvent } from "react";
import { CheckCircle2, LogIn, Plug, Plus, Trash2 } from "lucide-react";
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
  PillTabs,
  PricingLayout,
  StatusPill,
  Tag,
  Toggle,
  inputCls,
  missingFields,
  notifyUndo,
  type ApiError,
  TableSection,
} from "@/components/pricing/kit";
import { RequireAccess } from "@/components/pricing/access";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/pricing/session";
import { NOW } from "@/lib/pricing/deals";
import { ENVIRONMENTS, GROUP_MAPPINGS, IDP_CONFIGS, SIGN_IN_LOG, TOKEN_CHECKS, type Env, type IdpConfig } from "@/lib/pricing/admin";

export const Route = createFileRoute("/pricing/admin/sso")({
  head: () => ({ meta: [{ title: "SSO & identity · Rebate Ninja" }] }),
  component: () => (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Administration" }, { label: "SSO & identity" }]}>
      <RequireAccess module="SYSTEM_ADMIN" level="F">
        <Page />
      </RequireAccess>
    </PricingLayout>
  ),
});

const ENV_LABEL: Record<Env, string> = { prod: "Production", test: "Test", dev: "Development" };
type Form = IdpConfig & { newSecret: string };

function Page() {
  const [configs, setConfigs] = useState<IdpConfig[]>(IDP_CONFIGS);
  const [env, setEnv] = useState<Env>("prod");
  const [mappings, setMappings] = useState(GROUP_MAPPINGS);
  const [log, setLog] = useState(SIGN_IN_LOG);
  const current = configs.find((c) => c.env === env)!;

  return (
    <>
      <ListHeader
        title="SSO & identity"
        eyebrow="Administration"
        subtitle="Connect the corporate identity provider per environment. Users sign in once and roles come from group mapping."
      />
      <PillTabs<Env>
        idPrefix="sso"
        active={env}
        onChange={setEnv}
        tabs={ENVIRONMENTS.slice()
          .reverse()
          .map((e) => ({ key: e, label: `${ENV_LABEL[e]}${configs.find((c) => c.env === e)?.enabled ? "" : " (off)"}` }))}
      />
      <div role="tabpanel" id={`sso-panel-${env}`} aria-labelledby={`sso-tab-${env}`} className="grid gap-6 xl:grid-cols-[3fr_2fr] items-start">
        <IdpForm key={env} config={current} onSave={(c) => setConfigs((cs) => cs.map((x) => (x.env === c.env ? c : x)))} />
        <div className="grid gap-6">
          <Card title="Token validation" subtitle="Checked on every sign-in; any failure denies access.">
            <ul className="space-y-2 text-base">
              {TOKEN_CHECKS.map((t) => (
                <li key={t} className="flex items-start gap-2">
                  <CheckCircle2 className="size-4 text-success mt-1 shrink-0" aria-hidden />
                  {t}
                </li>
              ))}
            </ul>
          </Card>
          <InfoBanner title="MFA is enforced at the identity provider" className="">
            Every user must complete MFA at {current.provider} before a token is issued. The platform rejects tokens without an MFA claim (amr / authnContext).
          </InfoBanner>
        </div>
      </div>

      <GroupMapping mappings={mappings} setMappings={setMappings} onSimulate={(entry) => setLog((l) => [entry, ...l])} />

      <TableSection title="Recent sign-ins" subtitle="Just-in-time provisioning creates the user on first sign-in." className="mt-6">
        <DataTable
          caption="Recent sign-ins"
          rows={log}
          rowKey={(r) => `${r.at}-${r.user}`}
          numbered={false}
          columns={[
            { key: "at", header: "When", cell: (r) => <span className="tabular-nums whitespace-nowrap">{r.at}</span> },
            { key: "user", header: "User", cell: (r) => r.user },
            { key: "g", header: "IdP groups", cell: (r) => <span className="font-mono text-xs">{r.groups}</span> },
            { key: "r", header: "Result", cell: (r) => <StatusPill status={r.result} tone={r.result === "ALLOWED" ? "success" : "danger"} /> },
            { key: "d", header: "Detail", className: "min-w-64", cell: (r) => r.detail },
          ]}
        />
      </TableSection>
    </>
  );
}

function IdpForm({ config, onSave }: { config: IdpConfig; onSave: (c: IdpConfig) => void }) {
  const [f, setF] = useState<Form>({ ...config, newSecret: "" });
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const dirty = JSON.stringify({ ...config, newSecret: "" }) !== JSON.stringify(f);
  const isOidc = f.protocol === "OIDC";

  const errs: Record<string, string> = {};
  if (!/^https?:\/\/\S+$/.test(f.issuer.trim())) errs["idp-issuer"] = "Enter the issuer URL from the IdP, starting https://.";
  if (!f.clientId.trim()) errs["idp-client"] = isOidc ? "Enter the client ID registered in the IdP." : "Enter the SAML entity ID.";
  if (!/^https:\/\/\S+$/.test(f.metadataUrl.trim())) errs["idp-meta"] = "Enter the metadata URL, starting https://.";
  if (f.enabled && !f.secretRef && !f.newSecret) errs["idp-secret"] = isOidc ? "Add the client secret before enabling sign-in." : "Upload the signing certificate before enabling sign-in.";
  const fe = (k: string) => (submitted ? errs[k] : undefined);
  const hintId = useId();
  const secretLabel = isOidc ? "Client secret" : "Signing certificate";
  const missing = missingFields([
    ["Issuer", f.issuer],
    [isOidc ? "Client ID" : "Entity ID", f.clientId],
    [isOidc ? "Discovery URL" : "Metadata URL", f.metadataUrl],
    [secretLabel, f.newSecret, f.enabled && !f.secretRef],
  ]);

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    const first = Object.keys(errs)[0];
    if (first) {
      setError({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Fix the highlighted fields.", field: Object.keys(errs).map((k) => k.replace("idp-", "")).join(", ") });
      document.getElementById(first)?.focus();
      return;
    }
    setError(null);
    setSaving(true);
    window.setTimeout(() => {
      const { newSecret, ...rest } = f;
      // The secret goes to the vault; only a reference is kept and it is never shown again.
      const next: IdpConfig = newSecret ? { ...rest, secretRef: `vault://kv/rn/${f.env}/${isOidc ? "oidc-client-secret" : "saml-signing-cert"}`, secretUpdatedAt: NOW } : rest;
      onSave(next);
      setF({ ...next, newSecret: "" });
      setSaving(false);
      setSubmitted(false);
      toast.success(`${ENV_LABEL[f.env]} identity provider saved`, { description: newSecret ? "Secret stored in the vault. It won't be shown again." : undefined });
    }, 500);
  };

  const test = () => {
    setTesting(true);
    window.setTimeout(() => {
      // Prototype: Okta SAML in test is missing the groups claim; everything else passes.
      const ok = !(f.provider === "Okta" && f.protocol === "SAML 2.0");
      const lastTest = ok
        ? { at: NOW, ok, detail: "Dry-run sign-in succeeded · issuer, audience, signature, expiry and nonce valid · email, name, groups returned · MFA claim present" }
        : { at: NOW, ok, detail: "Missing attribute: groups. Add a groups attribute statement to the SAML assertion, then test again." };
      setF((x) => ({ ...x, lastTest }));
      onSave({ ...config, lastTest });
      setTesting(false);
      if (ok) toast.success("Connection test passed");
      else toast.error("Connection test found a problem", { description: lastTest.detail });
    }, 900);
  };

  return (
    <Card
      title={`${ENV_LABEL[f.env]} identity provider`}
      subtitle={dirty ? "Unsaved changes" : undefined}
      actions={
        <Btn variant="outline" icon={Plug} loading={testing} onClick={test} disabled={dirty}>
          Test connection
        </Btn>
      }
    >
      <form onSubmit={save} noValidate>
        <ErrorBanner error={error} onClose={() => setError(null)} />
        {f.lastTest && (
          <div role="status" className="mb-4">
            <InfoBanner tone={f.lastTest.ok ? "success" : "danger"} title={f.lastTest.ok ? "Last test passed" : "Last test failed"} className="">
              {f.lastTest.detail} <span className="text-muted-foreground">· {f.lastTest.at}</span>
            </InfoBanner>
          </div>
        )}
        {dirty && <p className="text-base text-muted-foreground mb-4">Save your changes before testing the connection.</p>}
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Identity provider" required>
            <select className={inputCls} value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value as IdpConfig["provider"] })}>
              <option>Azure AD</option>
              <option>Okta</option>
            </select>
          </Field>
          <Field label="Protocol" required>
            <select className={inputCls} value={f.protocol} onChange={(e) => setF({ ...f, protocol: e.target.value as IdpConfig["protocol"] })}>
              <option>OIDC</option>
              <option>SAML 2.0</option>
            </select>
          </Field>
          <Field label="Issuer" required error={fe("idp-issuer")} className="md:col-span-2">
            <input id="idp-issuer" className={`${inputCls} font-mono`} value={f.issuer} onChange={(e) => setF({ ...f, issuer: e.target.value })} />
          </Field>
          <Field label={isOidc ? "Client ID" : "Entity ID"} required error={fe("idp-client")}>
            <input id="idp-client" className={`${inputCls} font-mono`} value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })} />
          </Field>
          <Field label={isOidc ? "Discovery URL" : "Metadata URL"} required error={fe("idp-meta")}>
            <input id="idp-meta" className={`${inputCls} font-mono`} value={f.metadataUrl} onChange={(e) => setF({ ...f, metadataUrl: e.target.value })} />
          </Field>
          <Field
            label={isOidc ? "Client secret" : "Signing certificate (PEM)"}
            required={f.enabled && !f.secretRef}
            error={fe("idp-secret")}
            className="md:col-span-2"
            hint={f.secretRef ? `Stored in ${f.secretRef} · updated ${f.secretUpdatedAt}. Enter a new value only to replace it — saved values are never shown.` : "Stored in the secrets vault on save and never shown again."}
          >
            <input id="idp-secret" type="password" autoComplete="new-password" className={inputCls} value={f.newSecret} onChange={(e) => setF({ ...f, newSecret: e.target.value })} placeholder={f.secretRef ? "•••••••• (stored)" : ""} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-x-8 gap-y-3 mt-5 border-t border-border pt-4">
          <Toggle label="Enable sign-in for this environment" checked={f.enabled} onChange={(v) => setF({ ...f, enabled: v })} />
          <Toggle label="Just-in-time provisioning" checked={f.jitProvisioning} onChange={(v) => setF({ ...f, jitProvisioning: v })} />
          <span className="inline-flex items-center gap-2 text-sm">
            <Flag tone="success">MFA required</Flag>
            <span className="text-muted-foreground">Can't be turned off</span>
          </span>
        </div>
        <div className="flex flex-wrap justify-end gap-2 mt-6">
          <MissingHint id={hintId} missing={missing} />
          <Btn variant="subtle" disabled={!dirty || saving} onClick={() => (setF({ ...config, newSecret: "" }), setSubmitted(false), setError(null))}>
            Cancel
          </Btn>
          <Btn type="submit" loading={saving} disabled={!dirty || missing.length > 0} aria-describedby={missing.length ? hintId : undefined}>
            Save identity provider
          </Btn>
        </div>
      </form>
    </Card>
  );
}

function GroupMapping({
  mappings,
  setMappings,
  onSimulate,
}: {
  mappings: Array<{ group: string; role: Role }>;
  setMappings: (m: Array<{ group: string; role: Role }>) => void;
  onSimulate: (e: (typeof SIGN_IN_LOG)[number]) => void;
}) {
  const [group, setGroup] = useState("");
  const [role, setRole] = useState<Role>("SALES_REP");
  const [groupErr, setGroupErr] = useState<string>();
  const [simEmail, setSimEmail] = useState("contractor.temp@aimdek.com");
  const [simGroups, setSimGroups] = useState("rn-contractors");
  const [sim, setSim] = useState<{ ok: boolean; text: string } | null>(null);
  const addHintId = useId();
  const simHintId = useId();
  const addMissing = missingFields([["IdP group", group]]);
  const simMissing = missingFields([["User email", simEmail]]);

  const add = (e: FormEvent) => {
    e.preventDefault();
    const g = group.trim();
    if (!g) return setGroupErr("Enter the IdP group name exactly as the IdP sends it.");
    if (mappings.some((m) => m.group === g)) return setGroupErr(`${g} is already mapped.`);
    setGroupErr(undefined);
    setMappings([...mappings, { group: g, role }]);
    setGroup("");
    toast.success(`${g} mapped to ${ROLE_LABEL[role]}`);
  };
  const remove = (g: string) => {
    const snap = mappings;
    setMappings(mappings.filter((m) => m.group !== g));
    notifyUndo(`Mapping for ${g} removed`, () => setMappings(snap), "Members of this group lose access at their next sign-in.");
  };
  const simulate = (e: FormEvent) => {
    e.preventDefault();
    const groups = simGroups.split(",").map((s) => s.trim()).filter(Boolean);
    const hit = mappings.find((m) => groups.includes(m.group));
    const result = hit
      ? { ok: true, text: `Allowed — ${simEmail} is provisioned just in time as ${ROLE_LABEL[hit.role]} (group ${hit.group}).` }
      : { ok: false, text: `Access denied — none of ${simEmail}'s groups (${groups.join(", ") || "none"}) is mapped to a role. Deny by default.` };
    setSim(result);
    onSimulate({ at: NOW, user: simEmail, groups: groups.join(", ") || "—", result: hit ? "ALLOWED" : "DENIED", detail: hit ? `Role: ${ROLE_LABEL[hit.role]} · simulated sign-in` : "No mapped IdP group — access denied (simulated)" });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[3fr_2fr] items-start mt-6">
      <Card title="Group to role mapping" subtitle="A user's role comes from their IdP groups. A user in no mapped group can't sign in." padded={false}>
        <form onSubmit={add} className="flex flex-wrap items-end gap-3 px-5 py-4 border-b border-border">
          <Field label="IdP group" required error={groupErr} className="flex-1 min-w-44">
            <input className={`${inputCls} font-mono`} value={group} onChange={(e) => setGroup(e.target.value)} placeholder="e.g. rn-pricing-analyst" />
          </Field>
          <Field label="Role" className="flex-1 min-w-52">
            <select className={inputCls} value={role} onChange={(e) => setRole(e.target.value as Role)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABEL[r]}
                </option>
              ))}
            </select>
          </Field>
          <Btn
            type="submit"
            variant="outline"
            icon={Plus}
            className={groupErr ? "mb-[22px]" : ""}
            disabled={addMissing.length > 0}
            aria-describedby={addMissing.length ? addHintId : undefined}
          >
            Add mapping
          </Btn>
          <MissingHint id={addHintId} missing={addMissing} className="basis-full" />
        </form>
        <ul className="divide-y divide-border">
          {mappings.map((m) => (
            <li key={m.group} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
              <span className="font-mono">{m.group}</span>
              <span className="flex items-center gap-2">
                <Tag tone="info">{ROLE_LABEL[m.role]}</Tag>
                <button type="button" onClick={() => remove(m.group)} aria-label={`Remove mapping for ${m.group}`} className="size-10 grid place-items-center rounded-md text-muted-foreground hover:text-destructive hover:bg-muted">
                  <Trash2 className="size-4" aria-hidden />
                </button>
              </span>
            </li>
          ))}
        </ul>
      </Card>
      <Card title="Sign-in simulator" subtitle="Check what happens when a user with these groups signs in.">
        <form onSubmit={simulate} className="grid gap-3">
          <Field label="User email" required>
            <input type="email" className={inputCls} value={simEmail} onChange={(e) => setSimEmail(e.target.value)} />
          </Field>
          <Field label="IdP groups" hint="Comma-separated, as sent in the token.">
            <input className={`${inputCls} font-mono`} value={simGroups} onChange={(e) => setSimGroups(e.target.value)} />
          </Field>
          <div className="flex flex-wrap items-center gap-3">
            <MissingHint id={simHintId} missing={simMissing} />
            <Btn type="submit" variant="outline" icon={LogIn} disabled={simMissing.length > 0} aria-describedby={simMissing.length ? simHintId : undefined}>
              Simulate sign-in
            </Btn>
          </div>
        </form>
        {sim && (
          <div className="mt-3" role="status">
            <InfoBanner tone={sim.ok ? "success" : "danger"} className="">
              {sim.text}
            </InfoBanner>
          </div>
        )}
      </Card>
    </div>
  );
}
