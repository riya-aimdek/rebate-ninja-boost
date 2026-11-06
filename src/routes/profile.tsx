import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  Mail,
  MapPin,
  Pencil,
  Phone,
  Upload,
} from "lucide-react";
import { AppLayout } from "@/components/AppShell";
import {
  Btn,
  Card,
  ConfirmDialog,
  DataTable,
  DetailGrid,
  Field,
  MissingHint,
  PillTabs,
  StatusPill,
  Tag,
  inputCls,
  missingFields,
  notifySuccess,
} from "@/components/pricing/kit";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My profile · Rebate Ninja" },
      {
        name: "description",
        content:
          "Manage your Rebate Ninja profile — personal details, account access, notification preferences and security settings.",
      },
      { property: "og:title", content: "My profile · Rebate Ninja" },
      {
        property: "og:description",
        content:
          "Update your details, review account access, and manage notifications and security for Rebate Ninja.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProfilePage,
});

const TABS = [
  { key: "personal", label: "Personal information" },
  { key: "account", label: "Account & access" },
  { key: "notifications", label: "Notifications" },
  { key: "security", label: "Security" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

type Profile = {
  username: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  jobTitle: string;
  language: string;
  currency: string;
  timeZone: string;
};

const INITIAL_PROFILE: Profile = {
  username: "rshah",
  email: "riya.shah@envirovent.co.uk",
  firstName: "Riya",
  lastName: "Shah",
  phone: "+44 7700 900 812",
  jobTitle: "Pricing Analyst",
  language: "en-GB",
  currency: "GBP",
  timeZone: "London",
};

type ProfileErrors = Partial<Record<keyof Profile, string>>;

function validateProfile(p: Profile): ProfileErrors {
  const e: ProfileErrors = {};
  if (!p.username.trim()) e.username = "Enter a user name";
  else if (!/^[a-z0-9._-]{3,}$/i.test(p.username.trim())) e.username = "Use at least 3 letters, numbers, dots, dashes or underscores";
  if (!p.email.trim()) e.email = "Enter your email address";
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email.trim())) e.email = "Enter an email address like name@company.co.uk";
  if (!p.firstName.trim()) e.firstName = "Enter your first name";
  if (!p.lastName.trim()) e.lastName = "Enter your last name";
  if (p.phone.trim() && !/^\+?[0-9\s()-]{7,}$/.test(p.phone.trim())) e.phone = "Enter a phone number using digits, spaces and an optional + prefix";
  return e;
}

function ProfilePage() {
  const [tab, setTab] = useState<TabKey>("personal");
  const [saved, setSaved] = useState<Profile>(INITIAL_PROFILE);
  const [draft, setDraft] = useState<Profile>(INITIAL_PROFILE);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [touched, setTouched] = useState<Partial<Record<keyof Profile, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  // Notification switches live here so "saved automatically" survives switching tabs.
  const [notifPrefs, setNotifPrefs] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(NOTIFICATION_GROUPS.flatMap((g) => g.items.map(([label, , on]) => [label, on]))),
  );
  const setNotifPref = (label: string, on: boolean) => setNotifPrefs((p) => ({ ...p, [label]: on }));

  const errors = validateProfile(draft);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const hintId = useId();
  const missing = missingFields([
    ["User name", draft.username],
    ["Email address", draft.email],
    ["First name", draft.firstName],
    ["Last name", draft.lastName],
  ]);
  const showError = (k: keyof Profile) => ((submitted || touched[k]) && errors[k]) || undefined;

  const startEdit = () => {
    setTab("personal");
    setEditing(true);
  };

  // Move focus to the first field when entering edit mode (keyboard users land in the form).
  useEffect(() => {
    if (editing) formRef.current?.querySelector<HTMLInputElement>("input:not([readonly])")?.focus();
  }, [editing]);

  const cancel = () => {
    setDraft(saved);
    setTouched({});
    setSubmitted(false);
    setEditing(false);
  };

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      const first = Object.keys(errors)[0];
      // Save can be pressed from another tab; bring the form into view before focusing the first error.
      setTab("personal");
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus());
      return;
    }
    setSaving(true);
    window.setTimeout(() => {
      setSaved(draft);
      setSaving(false);
      setEditing(false);
      setSubmitted(false);
      setTouched({});
      notifySuccess("Profile saved");
    }, 500);
  };

  const fieldProps = (k: keyof Profile) => ({
    name: k,
    value: draft[k],
    readOnly: !editing,
    onChange: (e: { target: { value: string } }) => setDraft((d) => ({ ...d, [k]: e.target.value })),
    onBlur: () => setTouched((t) => ({ ...t, [k]: true })),
    className: `${inputCls} read-only:bg-muted/50 read-only:border-transparent`,
  });

  const initials = `${saved.firstName.charAt(0)}${saved.lastName.charAt(0)}`.toUpperCase();

  return (
    <AppLayout maxWidth="max-w-[1400px]">
      {/* Profile header */}
      <section aria-label="Profile summary" className="bg-card border border-border rounded-xl p-5 mb-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div className="flex items-start gap-4 min-w-0">
            <div className="relative shrink-0">
              <div
                className="size-20 rounded-xl bg-gradient-to-br from-brand-strong to-brand grid place-items-center text-brand-foreground text-2xl font-bold"
                aria-hidden
              >
                {initials}
              </div>
              <button
                type="button"
                disabled
                className="absolute -bottom-2 -right-2 size-10 rounded-full bg-card border border-border grid place-items-center text-muted-foreground disabled:cursor-not-allowed"
                aria-label="Upload photo (coming soon)"
                title="Photo upload is coming soon"
              >
                <Upload className="size-4" aria-hidden />
              </button>
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight leading-[1.2]">
                {saved.firstName} {saved.lastName}
              </h1>
              <p className="text-base lg:text-lg text-muted-foreground mt-1">{saved.jobTitle} · EnviroVent Ltd</p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <Tag tone="brand">{ROLE}</Tag>
                <Tag>Member since Jan 2024</Tag>
              </div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {editing ? (
              <>
                {dirty && (
                  <span
                    role="status"
                    className="inline-flex items-center gap-2 h-8 px-3 rounded-full bg-warning-soft text-warning-foreground text-xs font-semibold"
                  >
                    <span className="size-1.5 rounded-full bg-warning" aria-hidden />
                    Unsaved changes
                  </span>
                )}
                <MissingHint id={hintId} missing={missing} />
                <Btn variant="subtle" onClick={cancel} disabled={saving}>
                  Cancel
                </Btn>
                <Btn type="submit" form="profile-form" loading={saving} disabled={missing.length > 0} aria-describedby={missing.length ? hintId : undefined}>
                  Save changes
                </Btn>
              </>
            ) : (
              <Btn icon={Pencil} onClick={startEdit}>
                Edit profile
              </Btn>
            )}
          </div>
        </div>

        {/* Quick facts */}
        <div className="grid gap-4 sm:grid-cols-3 mt-6 pt-6 border-t border-border">
          <Fact icon={Mail} label="Email" value={saved.email} />
          <Fact icon={Phone} label="Phone" value={saved.phone || "—"} />
          <Fact icon={MapPin} label="Region" value="North — Harrogate" />
        </div>
      </section>

      {/* Tabs */}
      <PillTabs<TabKey>
        tabs={TABS.map((t) => ({ key: t.key, label: t.label }))}
        active={tab}
        onChange={setTab}
        idPrefix="profile"
      />

      {/* The personal form stays mounted (hidden) so the header Save keeps working and the draft survives tab switches. */}
      <div role="tabpanel" id="profile-panel-personal" aria-labelledby="profile-tab-personal" hidden={tab !== "personal"}>
          <form id="profile-form" ref={formRef} onSubmit={save} noValidate className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-6">
              <Card
                title="Basic information"
                subtitle={editing ? "* Required" : "How your name and contact details appear across Rebate Ninja."}
              >
                <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Field label="User name" required={editing} error={showError("username")}>
                    <input {...fieldProps("username")} autoComplete="username" />
                  </Field>
                  <Field label="Email address" required={editing} error={showError("email")}>
                    <input {...fieldProps("email")} type="email" autoComplete="email" />
                  </Field>
                  <Field label="First name" required={editing} error={showError("firstName")}>
                    <input {...fieldProps("firstName")} autoComplete="given-name" />
                  </Field>
                  <Field label="Last name" required={editing} error={showError("lastName")}>
                    <input {...fieldProps("lastName")} autoComplete="family-name" />
                  </Field>
                  <Field label="Phone" error={showError("phone")} hint={editing ? "e.g. +44 7700 900 812" : undefined}>
                    <input {...fieldProps("phone")} type="tel" inputMode="tel" autoComplete="tel" />
                  </Field>
                  <Field label="Job title">
                    <input {...fieldProps("jobTitle")} autoComplete="organization-title" />
                  </Field>
                </div>
              </Card>

              <Card title="Preferences" subtitle="Regional formatting used in calculators and reports.">
                <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
                  <Field label="Language">
                    <select
                      name="language"
                      value={draft.language}
                      disabled={!editing}
                      onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value }))}
                      className={`${inputCls} disabled:bg-muted/50 disabled:border-transparent disabled:opacity-100`}
                    >
                      <option value="en-GB">English (UK)</option>
                      <option value="en-US">English (US)</option>
                    </select>
                  </Field>
                  <Field label="Currency">
                    <select
                      name="currency"
                      value={draft.currency}
                      disabled={!editing}
                      onChange={(e) => setDraft((d) => ({ ...d, currency: e.target.value }))}
                      className={`${inputCls} disabled:bg-muted/50 disabled:border-transparent disabled:opacity-100`}
                    >
                      <option value="GBP">GBP (£)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="USD">USD ($)</option>
                    </select>
                  </Field>
                  <Field label="Time zone">
                    <select
                      name="timeZone"
                      value={draft.timeZone}
                      disabled={!editing}
                      onChange={(e) => setDraft((d) => ({ ...d, timeZone: e.target.value }))}
                      className={`${inputCls} disabled:bg-muted/50 disabled:border-transparent disabled:opacity-100`}
                    >
                      <option value="London">Europe/London</option>
                      <option value="Dublin">Europe/Dublin</option>
                    </select>
                  </Field>
                </div>
              </Card>
            </div>

            <div className="space-y-6">
              <Card title="Recent activity" subtitle="Your last actions in the platform.">
                <ul className="space-y-3 text-sm">
                  {[
                    { what: "Submitted a price list for approval", when: "2 hours ago", to: "/pricing/price-lists" },
                    { what: "Ran a scenario simulation", when: "Yesterday", to: "/pricing/simulator" },
                    { what: "Updated a pricing rule", when: "3 days ago", to: "/pricing/rules" },
                  ].map((a) => (
                    <li key={a.what} className="flex items-start justify-between gap-3">
                      <Link to={a.to} className="hit text-brand-strong font-medium hover:underline">
                        {a.what}
                      </Link>
                      <span className="text-xs text-muted-foreground whitespace-nowrap">{a.when}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </form>
      </div>
      {tab !== "personal" && (
        <div role="tabpanel" id={`profile-panel-${tab}`} aria-labelledby={`profile-tab-${tab}`}>
          {tab === "account" && <AccountTab />}
          {tab === "notifications" && <NotificationsTab prefs={notifPrefs} setPref={setNotifPref} />}
          {tab === "security" && <SecurityTab />}
        </div>
      )}
    </AppLayout>
  );
}

/* ---------- Tabs ---------- */

const ROLE = "Pricing Administrator";
type Level = "F" | "E" | "A" | "V" | "N";
/** Pricing Administrator row of the RBAC matrix (SRS Appendix C). */
const ROLE_ACCESS: Array<{ module: string; level: Level }> = [
  { module: "Master data & price lists", level: "F" },
  { module: "Strategy & segmentation", level: "F" },
  { module: "Price optimization / AI", level: "E" },
  { module: "CPQ & quoting", level: "V" },
  { module: "Deal desk", level: "V" },
  { module: "Rebate Ninja", level: "F" },
  { module: "Analytics & reporting", level: "F" },
  { module: "System / RBAC admin", level: "V" },
  { module: "Audit logs", level: "V" },
];
const ACCESS_LABEL: Record<Level, string> = { F: "Full", E: "Edit", A: "Approve", V: "View only", N: "No access" };
const ACCESS_HINT: Record<Level, string> = {
  F: "Create, edit, approve and delete",
  E: "Create and edit; no delete",
  A: "View, plus approve or reject",
  V: "Read only",
  N: "Hidden",
};
const ACCESS_TONE: Record<Level, "success" | "info" | "warning" | "neutral" | "danger"> = { F: "success", E: "info", A: "warning", V: "neutral", N: "danger" };

function AccountTab() {
  return (
    <div className="space-y-6">
      <Card title="Organisation" subtitle="The account this profile belongs to. Contact your administrator to change it.">
        <DetailGrid
          items={[
            { label: "Company", value: "EnviroVent Ltd" },
            { label: "Primary account", value: "AWEBB — A. Webb & Sons" },
            { label: "Account level", value: "National" },
          ]}
        />
      </Card>

      <Card
        title="Roles & permissions"
        subtitle="Access per module comes from your role and is managed by your administrator."
      >
        <DataTable
          caption={`Access by module for ${ROLE}`}
          numbered={false}
          rowKey={(r) => r.module}
          rows={ROLE_ACCESS}
          columns={[
            { key: "module", header: "Module", cell: (r) => <span className="font-medium">{r.module}</span> },
            {
              key: "level",
              header: "Access",
              cell: (r) => <StatusPill status={r.level} tone={ACCESS_TONE[r.level]} label={ACCESS_LABEL[r.level]} />,
            },
            { key: "what", header: "What you can do", cell: (r) => <span className="text-muted-foreground">{ACCESS_HINT[r.level]}</span> },
          ]}
        />
      </Card>

      <Card title="Linked accounts" subtitle="Customer accounts you can view and price.">
        <ul className="flex flex-wrap gap-2">
          {["AWEBB", "YESSS", "CEF", "EDMUNDSON", "RS-COMPONENTS"].map((a) => (
            <li key={a}>
              <Tag>{a}</Tag>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}

const NOTIFICATION_GROUPS: Array<{ title: string; items: Array<[string, string, boolean]> }> = [
  {
    title: "Pricing activity",
    items: [
      ["Approval requested", "When a price list is submitted for your approval.", true],
      ["Price list expiring", "When a price list you own is close to its end date.", true],
      ["Guardrail breached", "When a price falls below a margin floor.", false],
    ],
  },
  {
    title: "Reporting",
    items: [
      ["Scheduled reports", "Email me the reports I have scheduled.", true],
      ["Export ready", "Notify me when a large export finishes.", false],
    ],
  },
];

function NotificationsTab({ prefs, setPref }: { prefs: Record<string, boolean>; setPref: (label: string, on: boolean) => void }) {
  return (
    <div className="space-y-6">
      {/* Said once for the whole tab instead of under every group card. */}
      <p className="text-base text-muted-foreground">Changes are saved automatically.</p>
      {NOTIFICATION_GROUPS.map((g) => (
        <Card key={g.title} title={g.title}>
          <ul className="divide-y divide-border">
            {g.items.map(([label, desc]) => (
              <li key={label} className="flex items-center justify-between gap-6 py-3 first:pt-0 last:pb-0">
                <SwitchRow label={label} description={desc} on={!!prefs[label]} onChange={(v) => setPref(label, v)} />
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function SecurityTab() {
  const [sessions, setSessions] = useState([
    { device: "Chrome · Windows", meta: "Ahmedabad, IN · Current session", current: true },
    { device: "Safari · iPhone", meta: "Ahmedabad, IN · 2 days ago", current: false },
  ]);
  const [signOutTarget, setSignOutTarget] = useState<string | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Sign-in" subtitle="You sign in with your company account through single sign-on.">
        <DetailGrid
          columns={2}
          items={[
            { label: "Method", value: "Corporate SSO · Azure AD (OIDC)" },
            { label: "Multi-factor authentication", value: <StatusPill status="ACTIVE" tone="success" label="Required — enforced by your identity provider" />, full: true },
            { label: "Password", value: "Managed by your identity provider — change it in your company account, not here.", full: true },
          ]}
        />
      </Card>

      <Card title="Active sessions" subtitle="Devices currently signed in. Sessions end when your company account is deactivated.">
        <ul className="divide-y divide-border">
          {sessions.map((s) => (
            <li key={s.device} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
              <div>
                <div className="text-sm font-semibold">{s.device}</div>
                <div className="text-xs text-muted-foreground">{s.meta}</div>
              </div>
              {!s.current && (
                <Btn variant="subtle" onClick={() => setSignOutTarget(s.device)} aria-label={`Sign out ${s.device}`}>
                  Sign out
                </Btn>
              )}
            </li>
          ))}
        </ul>
      </Card>

      <ConfirmDialog
        open={signOutTarget !== null}
        tone="danger"
        title={`Sign out ${signOutTarget ?? ""}?`}
        description="That device will need to sign in again through your company account."
        confirmLabel="Sign out"
        onCancel={() => setSignOutTarget(null)}
        onConfirm={() => {
          const device = signOutTarget;
          setSessions((cur) => cur.filter((x) => x.device !== device));
          setSignOutTarget(null);
          notifySuccess("Session signed out", device ?? undefined);
        }}
      />
    </div>
  );
}

/* ---------- Primitives ---------- */

function Fact({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="size-10 shrink-0 rounded-lg bg-muted grid place-items-center text-muted-foreground" aria-hidden>
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-muted-foreground">{label}</div>

        <div className="text-sm font-medium truncate" title={value}>{value}</div>
      </div>
    </div>
  );
}

/** Switch with a ≥ 40px hit area; name/description come from visible text. */
function Switch({
  checked,
  onChange,
  label,
  labelledBy,
  describedBy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
  labelledBy?: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className="shrink-0 h-10 w-14 grid place-items-center rounded-full"
    >
      <span className={`relative w-11 h-6 rounded-full transition-colors ${checked ? "bg-brand" : "bg-muted-foreground/40"}`} aria-hidden>
        <span className={`absolute top-0.5 size-5 rounded-full bg-card shadow transition-all ${checked ? "left-5" : "left-0.5"}`} />
      </span>
    </button>
  );
}

function SwitchRow({ label, description, on, onChange }: { label: string; description: string; on: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <>
      <div>
        <div id={`${id}-l`} className="text-sm font-semibold">
          {label}
        </div>
        <div id={`${id}-d`} className="text-xs text-muted-foreground mt-0.5">
          {description}
        </div>
      </div>
      <Switch
        checked={on}
        labelledBy={`${id}-l`}
        describedBy={`${id}-d`}
        onChange={(v) => {
          onChange(v);
          notifySuccess(`${label} ${v ? "turned on" : "turned off"}`);
        }}
      />
    </>
  );
}
