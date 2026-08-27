import { createFileRoute } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  Bell,
  Building2,
  Check,
  KeyRound,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Shield,
  ShieldCheck,
  Upload,
  User,
} from "lucide-react";
import { Sidebar, TopBar } from "@/components/AppShell";
import { Field, inputCls } from "@/components/ReportShell";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "My Profile · Rebate Ninja" },
      {
        name: "description",
        content:
          "Manage your Rebate Ninja profile — personal details, account access, notification preferences and security settings.",
      },
      { property: "og:title", content: "My Profile · Rebate Ninja" },
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
  { key: "personal", label: "Personal Information", icon: User },
  { key: "account", label: "Account & Access", icon: Building2 },
  { key: "notifications", label: "Notifications", icon: Bell },
  { key: "security", label: "Security", icon: Shield },
] as const;

type TabKey = (typeof TABS)[number]["key"];

function ProfilePage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("personal");
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);

  const save = () => {
    setEditing(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 2000);
  };


  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar activeLabel="Settings" />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar search={search} onSearch={setSearch} placeholder="Search…" />

        <main className="flex-1 px-6 py-6 max-w-[1400px] w-full mx-auto">
          {/* Profile header */}
          <div className="bg-card border border-border rounded-2xl p-6 mb-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-6">
              <div className="flex items-start gap-4">
                <div className="relative">
                  <div className="size-20 rounded-2xl bg-gradient-to-br from-brand to-amber-500 grid place-items-center text-brand-foreground text-2xl font-bold">
                    AW
                  </div>
                  <button
                    type="button"
                    className="absolute -bottom-2 -right-2 size-8 rounded-full bg-card border border-border grid place-items-center hover:bg-muted transition"
                    title="Upload photo"
                  >
                    <Upload className="size-3.5" />
                  </button>
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">Alex Webb</h1>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    Rebate Manager · EnviroVent Ltd
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-3">
                    <Badge tone="brand">Admin</Badge>
                    <Badge tone="muted">Member since Jan 2024</Badge>
                  </div>
                </div>
              </div>
              {tab === "personal" && (
                <div className="flex items-center gap-2">
                  {editing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setEditing(false)}
                        className="px-4 py-2 rounded-lg border border-border bg-background text-sm font-medium hover:bg-muted transition"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={save}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-brand-foreground font-semibold text-sm hover:opacity-90 transition"
                      >
                        Save changes
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-brand-foreground font-semibold text-sm hover:opacity-90 transition"
                    >
                      {saved ? <Check className="size-4" /> : <Pencil className="size-4" />}
                      {saved ? "Saved" : "Edit profile"}
                    </button>
                  )}
                </div>
              )}

            </div>

            {/* Quick facts */}
            <div className="grid gap-4 sm:grid-cols-3 mt-6 pt-6 border-t border-border">
              <Fact icon={Mail} label="Email" value="alex.webb@envirovent.co.uk" />
              <Fact icon={Phone} label="Phone" value="+44 7700 900 812" />
              <Fact icon={MapPin} label="Region" value="North — Harrogate" />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex flex-wrap gap-1 border-b border-border mb-6">
            {TABS.map((t) => {
              const Icon = t.icon;
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                    active
                      ? "border-brand text-brand"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Icon className="size-4" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {tab === "personal" && <PersonalTab />}
          {tab === "account" && <AccountTab />}
          {tab === "notifications" && <NotificationsTab />}
          {tab === "security" && <SecurityTab />}
        </main>
      </div>
    </div>
  );
}

/* ---------- Tabs ---------- */

function PersonalTab() {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        <Card title="Basic Information" desc="How your name and contact details appear across Rebate Ninja.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="User name">
              <input className={inputCls} defaultValue="awebb" />
            </Field>
            <Field label="Email address">
              <input className={inputCls} type="email" defaultValue="alex.webb@envirovent.co.uk" />
            </Field>
            <Field label="First name">
              <input className={inputCls} defaultValue="Alex" />
            </Field>
            <Field label="Last name">
              <input className={inputCls} defaultValue="Webb" />
            </Field>
            <Field label="Phone">
              <input className={inputCls} defaultValue="+44 7700 900 812" />
            </Field>
            <Field label="Job title">
              <input className={inputCls} defaultValue="Rebate Manager" />
            </Field>
          </div>
        </Card>

        <Card title="Preferences" desc="Regional formatting used in calculators and reports.">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Language">
              <select className={inputCls} defaultValue="en-GB">
                <option value="en-GB">English (UK)</option>
                <option value="en-US">English (US)</option>
              </select>
            </Field>
            <Field label="Currency">
              <select className={inputCls} defaultValue="GBP">
                <option value="GBP">GBP (£)</option>
                <option value="EUR">EUR (€)</option>
                <option value="USD">USD ($)</option>
              </select>
            </Field>
            <Field label="Time zone">
              <select className={inputCls} defaultValue="London">
                <option value="London">Europe/London</option>
                <option value="Dublin">Europe/Dublin</option>
              </select>
            </Field>
          </div>
        </Card>
      </div>

      <div className="space-y-6">


        <Card title="Recent activity" desc="Your last actions in the platform.">
          <ul className="space-y-3 text-sm">
            {[
              ["Saved scenario “20% Growth”", "2 hours ago"],
              ["Exported Accrual Summary", "Yesterday"],
              ["Updated EW rebate rates", "3 days ago"],
            ].map(([what, when]) => (
              <li key={what} className="flex items-start justify-between gap-3">
                <span>{what}</span>
                <span className="text-xs text-muted-foreground whitespace-nowrap">{when}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function AccountTab() {
  return (
    <div className="space-y-6">
      <Card title="Organisation" desc="The account this profile belongs to.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Company">
            <input className={inputCls} defaultValue="EnviroVent Ltd" readOnly />
          </Field>
          <Field label="Primary account">
            <input className={inputCls} defaultValue="AWEBB — A. Webb & Sons" readOnly />
          </Field>
          <Field label="Account level">
            <input className={inputCls} defaultValue="National" readOnly />
          </Field>
        </div>
      </Card>

      <Card title="Roles & permissions" desc="What you can access in Rebate Ninja.">
        <div className="overflow-x-auto -mx-5">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                <th className="px-5 py-2 font-semibold">Area</th>
                <th className="px-5 py-2 font-semibold">Role</th>
                <th className="px-5 py-2 font-semibold">Access</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["Rebate Modeling", "Admin", "Full"],
                ["Reports", "Admin", "Full"],
                ["Rebate Programs", "Editor", "Create & edit"],
                ["Payout Periods", "Viewer", "Read only"],
              ].map(([area, role, access]) => (
                <tr key={area} className="border-b border-border/60 last:border-0">
                  <td className="px-5 py-3 font-medium">{area}</td>
                  <td className="px-5 py-3">{role}</td>
                  <td className="px-5 py-3 text-muted-foreground">{access}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Linked accounts" desc="Sub-accounts you can model and report on.">
        <div className="flex flex-wrap gap-2">
          {["AWEBB", "YESSS", "CEF", "EDMUNDSON", "RS-COMPONENTS"].map((a) => (
            <span
              key={a}
              className="px-3 py-1.5 rounded-lg border border-border bg-muted/50 text-sm font-medium"
            >
              {a}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

function NotificationsTab() {
  const groups: Array<{ title: string; items: Array<[string, string, boolean]> }> = [
    {
      title: "Rebate activity",
      items: [
        ["Accrual posted", "When a new accrual is calculated for your programs.", true],
        ["Claim approved", "When a rebate claim you submitted is approved.", true],
        ["Threshold reached", "When an account crosses a qualifying threshold.", false],
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
  return (
    <div className="space-y-6">
      {groups.map((g) => (
        <Card key={g.title} title={g.title}>
          <ul className="divide-y divide-border">
            {g.items.map(([label, desc, on]) => (
              <li key={label} className="flex items-start justify-between gap-6 py-3 first:pt-0 last:pb-0">
                <div>
                  <div className="text-sm font-semibold">{label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                </div>
                <Toggle defaultOn={on} />
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

function SecurityTab() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card title="Change password" desc="Use at least 12 characters with a number and symbol.">
        <div className="grid gap-4">
          <Field label="Current password">
            <input className={inputCls} type="password" placeholder="••••••••" />
          </Field>
          <Field label="New password">
            <input className={inputCls} type="password" placeholder="••••••••" />
          </Field>
          <Field label="Confirm new password">
            <input className={inputCls} type="password" placeholder="••••••••" />
          </Field>
        </div>
        <button
          type="button"
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-brand-foreground font-semibold text-sm hover:opacity-90 transition"
        >
          <KeyRound className="size-4" /> Update password
        </button>
      </Card>

      <div className="space-y-6">
        <Card title="Two-factor authentication" desc="Extra protection for your account.">
          <div className="flex items-center justify-between gap-4">
            <Badge tone="success" icon={ShieldCheck}>
              Enabled — Authenticator app
            </Badge>
            <Toggle defaultOn />
          </div>
        </Card>

        <Card title="Active sessions" desc="Devices currently signed in.">
          <ul className="divide-y divide-border">
            {[
              ["Chrome · macOS", "Harrogate, UK · Current session"],
              ["Safari · iPhone", "Leeds, UK · 2 days ago"],
            ].map(([device, meta], i) => (
              <li key={device} className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
                <div>
                  <div className="text-sm font-semibold">{device}</div>
                  <div className="text-xs text-muted-foreground">{meta}</div>
                </div>
                {i > 0 && (
                  <button
                    type="button"
                    className="text-xs font-semibold text-destructive hover:underline"
                  >
                    Sign out
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

/* ---------- Primitives ---------- */

function Card({
  title,
  desc,
  children,
}: {
  title: string;
  desc?: string;
  children: ReactNode;
}) {
  return (
    <section className="bg-card border border-border rounded-2xl p-5 shadow-sm">
      <div className="mb-4">
        <h2 className="text-base font-bold tracking-tight">{title}</h2>
        {desc && <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>}
      </div>
      {children}
    </section>
  );
}

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
    <div className="flex items-center gap-3">
      <div className="size-9 rounded-lg bg-muted grid place-items-center text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
          {label}
        </div>
        <div className="text-sm font-medium truncate">{value}</div>
      </div>
    </div>
  );
}

function Badge({
  children,
  tone = "muted",
  icon: Icon,
}: {
  children: ReactNode;
  tone?: "brand" | "success" | "muted";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  const tones: Record<string, string> = {
    brand: "bg-brand/10 text-brand",
    success: "bg-success-soft text-success",
    muted: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${tones[tone]}`}
    >
      {Icon && <Icon className="size-3.5" />}
      {children}
    </span>
  );
}

function Toggle({ defaultOn = false }: { defaultOn?: boolean }) {
  const [on, setOn] = useState(defaultOn);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => setOn((v) => !v)}
      className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
        on ? "bg-brand" : "bg-muted"
      }`}
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-card shadow transition-all ${
          on ? "left-[22px]" : "left-0.5"
        }`}
      />
    </button>
  );
}
