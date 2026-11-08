import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useId, useMemo, useState, type FormEvent } from "react";
import { Bell, BellOff, KeyRound, Lock, Mail, MessageSquare, Pencil, Plus, RotateCcw, X } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  DataTable,
  EmptyState,
  ErrorBanner,
  Field,
  FilterPills,
  Flag,
  InfoBanner,
  ListHeader,
  MissingHint,
  Modal,
  PillTabs,
  PricingLayout,
  StatusPill,
  Tag,
  humanize,
  inputCls,
  missingFields,
  type ApiError,
} from "@/components/pricing/kit";
import { useMyNotifications } from "@/components/pricing/access";
import {
  APPROVAL_TASKS,
  CONTRACT_EXPIRY_LEAD_DAYS,
  CRITICAL_EVENTS,
  NOTIFICATIONS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  NOTIFICATION_TEMPLATES,
  NOW,
  markRead, markUnread,
  type AppNotification,
  type Delivery,
  type NotificationChannel,
  type NotificationEvent,
  type NotificationTemplate,
} from "@/lib/pricing/deals";
import { customerById } from "@/lib/pricing/data";
import { USERS, fieldAccess, useSession, userById, userName } from "@/lib/pricing/session";

export const Route = createFileRoute("/pricing/notifications")({
  head: () => ({ meta: [{ title: "Notifications · Rebate Ninja" }] }),
  component: () => (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Administration" }, { label: "Notifications" }]}>
      <Page />
    </PricingLayout>
  ),
});

type Tab = "inbox" | "prefs" | "templates" | "delivery" | "settings";

const CHANNEL_LABEL: Record<NotificationChannel, string> = { EMAIL: "Email", TEAMS_SLACK: "Teams / Slack", IN_APP: "In-app" };
const EVENT_HINT: Record<NotificationEvent, string> = {
  APPROVAL_ASSIGNED: "A request needs your decision",
  APPROVAL_REMINDER: "A request is getting close to its SLA",
  SLA_BREACH: "An approval passed its SLA",
  ESCALATION: "A request was escalated to you",
  DECISION_MADE: "Your request was decided",
  CONTRACT_EXPIRY: "A contract price is about to end",
  THRESHOLD_BREACH: "Margin drifted past a threshold",
  SYNC_FAILURE: "A quote didn't reach the ERP",
  PUBLICATION_FAILURE: "A price publication failed",
};

/* Per-user preferences live for the session (prototype — persisted server-side in the product). */
type Pref = { channels: Record<NotificationChannel, boolean>; digest: "IMMEDIATE" | "DAILY" };
const PREFS: Record<string, Record<NotificationEvent, Pref>> = {};
const defaultPrefs = (): Record<NotificationEvent, Pref> =>
  Object.fromEntries(NOTIFICATION_EVENTS.map((e) => [e, { channels: { EMAIL: true, TEAMS_SLACK: e !== "DECISION_MADE", IN_APP: true }, digest: e === "APPROVAL_REMINDER" ? "DAILY" : "IMMEDIATE" }])) as Record<NotificationEvent, Pref>;

/* Webhook destinations — the URL is a secret and never shown after saving. */
const WEBHOOKS = [
  { id: "WH-1", name: "Teams · #deal-desk", channel: "TEAMS_SLACK" as const, last4: "3f9a", rotatedAt: "2026-08-14 10:00", status: "ACTIVE" },
  { id: "WH-2", name: "Teams · #sales-vp-approvals", channel: "TEAMS_SLACK" as const, last4: "c21e", rotatedAt: "2026-05-02 09:30", status: "FAILED" },
  { id: "WH-3", name: "Slack · #pricing-ops", channel: "TEAMS_SLACK" as const, last4: "77b0", rotatedAt: "2026-09-21 16:12", status: "ACTIVE" },
];

function Page() {
  const { role } = useSession();
  const admin = role === "PRICING_ADMIN" || role === "IT_ADMIN";
  const [tab, setTab] = useState<Tab>("inbox");
  const { unread, items } = useMyNotifications();
  return (
    <>
      <ListHeader eyebrow="Administration" title="Notifications" subtitle="Approvals, SLA breaches, expiries and failures — by email, Teams/Slack and in the app." />
      <PillTabs<Tab>
        idPrefix="nt"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "inbox", label: "Inbox", count: unread || undefined },
          { key: "prefs", label: "My preferences" },
          ...(admin
            ? [
                { key: "templates" as Tab, label: "Templates", count: NOTIFICATION_TEMPLATES.length },
                { key: "delivery" as Tab, label: "Delivery log" },
                { key: "settings" as Tab, label: "Channels & timing" },
              ]
            : []),
        ]}
      />
      <div role="tabpanel" id={`nt-panel-${tab}`} aria-labelledby={`nt-tab-${tab}`}>
        {tab === "inbox" && <Inbox items={items} />}
        {tab === "prefs" && <Preferences />}
        {tab === "templates" && admin && <Templates />}
        {tab === "delivery" && admin && <DeliveryLog />}
        {tab === "settings" && admin && <Settings />}
      </div>
    </>
  );
}

/* ---------------- Inbox ---------------- */

function Inbox({ items }: { items: AppNotification[] }) {
  const navigate = useNavigate();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [events, setEvents] = useState<NotificationEvent[]>([]);
  const list = items.filter((n) => (!unreadOnly || !n.read) && (events.length === 0 || events.includes(n.event)));
  const unread = items.filter((n) => !n.read);
  const toggleRead = (n: AppNotification) => (n.read ? markUnread([n.id]) : markRead([n.id]));
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <FilterPills<"UNREAD"> label="Show" multiple={false} selected={unreadOnly ? ["UNREAD"] : []} onChange={(v) => setUnreadOnly(v.length > 0)} options={[{ key: "UNREAD", label: "Unread only", count: unread.length }]} className="" />
        {unread.length > 0 && (
          <Btn variant="subtle" size="sm" onClick={() => { markRead(unread.map((n) => n.id)); toast.success(`${unread.length} notifications marked as read`); }}>
            Mark all as read
          </Btn>
        )}
      </div>
      <FilterPills<NotificationEvent> label="Event" selected={events} onChange={setEvents} options={NOTIFICATION_EVENTS.filter((e) => items.some((n) => n.event === e)).map((e) => ({ key: e, label: humanize(e), count: items.filter((n) => n.event === e).length }))} />
      <div className="bg-card border border-border rounded-xl shadow-sm">
        {list.length === 0 ? (
          items.length === 0 ? (
            <EmptyState icon={BellOff} title="You're all caught up">Approvals, expiries and failures that need you will appear here.</EmptyState>
          ) : (
            <EmptyState icon={Bell} title="No notifications match these filters" action={<Btn variant="subtle" onClick={() => { setUnreadOnly(false); setEvents([]); }}>Clear filters</Btn>} />
          )
        ) : (
          <ul className="divide-y divide-border">
            {list.map((n) => (
              <li key={n.id} className="flex flex-wrap sm:flex-nowrap items-start gap-3 px-5 py-4">
                <span className={`mt-2 size-2 rounded-full shrink-0 ${n.read ? "bg-transparent" : "bg-brand"}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={n.read ? "" : "font-semibold"}>{n.title}</span>
                    {!n.read && <span className="sr-only">(unread)</span>}
                    <Tag>{humanize(n.event)}</Tag>
                    {CRITICAL_EVENTS.includes(n.event) && <Flag tone="danger">Critical</Flag>}
                  </div>
                  <p className="text-base text-muted-foreground mt-1">{n.body}</p>
                  <p className="text-xs text-muted-foreground mt-1 tabular-nums">
                    {n.at}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Btn variant="ghost" size="sm" onClick={() => toggleRead(n)}>
                    {n.read ? "Mark as unread" : "Mark as read"}
                  </Btn>
                  {n.link && (
                    <Btn
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        markRead([n.id]);
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        navigate({ to: n.link!.to as any, params: n.link!.params as any });
                      }}
                    >
                      Open
                    </Btn>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/* ---------------- Preferences ---------------- */

function Preferences() {
  const { user } = useSession();
  const saved = PREFS[user.id] ?? defaultPrefs();
  const [p, setP] = useState(() => structuredClone(saved));
  const [forUser, setForUser] = useState(user.id);
  const [saving, setSaving] = useState(false);
  if (forUser !== user.id) {
    setForUser(user.id);
    setP(structuredClone(PREFS[user.id] ?? defaultPrefs()));
  }
  const dirty = JSON.stringify(p) !== JSON.stringify(saved);
  const set = (e: NotificationEvent, ch: NotificationChannel, v: boolean) => setP({ ...p, [e]: { ...p[e], channels: { ...p[e].channels, [ch]: v } } });
  const save = () => {
    setSaving(true);
    window.setTimeout(() => {
      PREFS[user.id] = structuredClone(p);
      setSaving(false);
      toast.success("Notification preferences saved");
    }, 350);
  };
  return (
    <Card
      title={`Preferences for ${user.name}`}
      subtitle="Mute non-critical events or get them as a daily digest. Critical events can't be turned off."
      padded={false}
      actions={
        <>
          {dirty && <Tag tone="warning">Unsaved changes</Tag>}
          {dirty && (
            <Btn variant="subtle" disabled={saving} onClick={() => setP(structuredClone(saved))}>
              Cancel
            </Btn>
          )}
          <Btn loading={saving} disabled={!dirty} onClick={save}>
            Save preferences
          </Btn>
        </>
      }
    >
      <div className="overflow-x-auto overflow-y-hidden" role="region" aria-label="Notification preferences" tabIndex={0}>
        <table className="w-full text-sm min-w-[640px]">
          <caption className="sr-only">Channels per event</caption>
          <thead>
            <tr className="bg-navy text-navy-foreground">
              <th scope="col" className="px-5 py-3 text-left font-semibold">Event</th>
              {NOTIFICATION_CHANNELS.map((c) => (
                <th key={c} scope="col" className="px-4 py-3 text-center font-semibold">{CHANNEL_LABEL[c]}</th>
              ))}
              <th scope="col" className="px-5 py-3 text-left font-semibold">Delivery</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {NOTIFICATION_EVENTS.map((e) => {
              const crit = CRITICAL_EVENTS.includes(e);
              return (
                <tr key={e}>
                  <th scope="row" className="px-5 py-3 text-left font-normal">
                    <span className="font-medium">{humanize(e)}</span>
                    {crit && <span className="ml-2"><Flag tone="danger">Critical</Flag></span>}
                    <span className="block text-sm text-muted-foreground">{EVENT_HINT[e]}</span>
                  </th>
                  {NOTIFICATION_CHANNELS.map((c) => (
                    <td key={c} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        className="size-4"
                        aria-label={`${humanize(e)} by ${CHANNEL_LABEL[c]}${crit ? " (critical, always on)" : ""}`}
                        checked={crit || p[e].channels[c]}
                        disabled={crit}
                        onChange={(ev) => set(e, c, ev.target.checked)}
                      />
                    </td>
                  ))}
                  <td className="px-5 py-3">
                    {crit ? (
                      <span className="inline-flex items-center gap-1 text-sm text-muted-foreground"><Lock className="size-3.5" aria-hidden /> Always immediate</span>
                    ) : (
                      <select aria-label={`Delivery for ${humanize(e)}`} className={`${inputCls} h-9`} value={p[e].digest} onChange={(ev) => setP({ ...p, [e]: { ...p[e], digest: ev.target.value as Pref["digest"] } })}>
                        <option value="IMMEDIATE">Immediately</option>
                        <option value="DAILY">Daily digest</option>
                      </select>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ---------------- Templates ---------------- */

/** Render a template for one recipient. Margin appears only when field security allows (US-DD-06 AC#5). */
function render(text: string, recipientId: string) {
  const u = userById(recipientId)!;
  const t = APPROVAL_TASKS.find((x) => x.id === "APR-3001")!;
  const canSeeMargin = fieldAccess(u.role, "marginPct") === "SHOW";
  const vals: Record<string, string> = {
    "request.id": t.refId,
    "customer.name": customerById(t.customerId)?.name ?? t.customerId,
    "requester.name": userName(t.requesterId),
    discount: `${t.discountPct}%`,
    margin: `${t.marginPct}%`,
    dealValue: `£${t.dealValue.toLocaleString("en-GB")}`,
    "sla.due": "31 Oct 2026, 14:30",
    "sla.hours": "24",
    "escalation.name": "Daniel Brooks",
    actionLink: "https://pricing.example.com/approvals/APR-3001",
    "contract.name": "Edmundson Customer List",
    "contract.end": "28 Nov 2026",
    days: "30",
    "product.sku": "LT-PNL-60",
    "quote.id": "Q-10236",
    expected: "30.0%",
    actual: "26.0%",
    variance: "−4.0",
  };
  return {
    text: text
      .replace(/\{\{#if canSeeMargin\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, inner) => (canSeeMargin ? inner : ""))
      .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => vals[k] ?? m),
    canSeeMargin,
  };
}

function Templates() {
  const [rows, setRows] = useState<NotificationTemplate[]>(() => [...NOTIFICATION_TEMPLATES]);
  const [editing, setEditing] = useState<NotificationTemplate | "new" | null>(null);
  const [f, setF] = useState<NotificationTemplate>(NOTIFICATION_TEMPLATES[0]);
  const [origin, setOrigin] = useState("");
  const [recipient, setRecipient] = useState("U-05");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  const open = (t?: NotificationTemplate) => {
    const v: NotificationTemplate = t ? { ...t } : { id: `NT-${String(rows.length + 1).padStart(2, "0")}`, event: "APPROVAL_ASSIGNED", channel: "EMAIL", subject: "", body: "", version: 0, updatedBy: "U-01", updatedAt: NOW };
    setF(v);
    setOrigin(JSON.stringify(v));
    setEditing(t ?? "new");
    setSubmitted(false);
    setError(null);
  };
  const dirty = editing !== null && JSON.stringify(f) !== origin;
  const errs: Record<string, string> = {};
  if (f.channel === "EMAIL" && !f.subject.trim()) errs["nt-subject"] = "Email templates need a subject line.";
  if (!f.body.trim()) errs["nt-body"] = "Write the message body.";
  const fe = (k: string) => (submitted ? errs[k] : undefined);
  const tplHintId = useId();
  const tplMissing = missingFields([["Subject", f.subject, f.channel === "EMAIL"], ["Body", f.body]]);
  const preview = render(`${f.subject}\n\n${f.body}`, recipient);

  const save = (ev?: FormEvent) => {
    ev?.preventDefault();
    setSubmitted(true);
    const keys = Object.keys(errs);
    if (keys.length) {
      setError({ errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: errs[keys[0]], field: keys[0] === "nt-subject" ? "subject" : "body" });
      document.getElementById(keys[0])?.focus();
      return;
    }
    setError(null);
    setSaving(true);
    window.setTimeout(() => {
      const next = { ...f, version: f.version + 1, updatedAt: NOW, updatedBy: "U-01" };
      const i = NOTIFICATION_TEMPLATES.findIndex((x) => x.id === next.id);
      if (i >= 0) NOTIFICATION_TEMPLATES[i] = next;
      else NOTIFICATION_TEMPLATES.push(next);
      setRows([...NOTIFICATION_TEMPLATES]);
      setSaving(false);
      setEditing(null);
      toast.success(`Template ${next.id} saved`, { description: `Version ${next.version} is used for new messages.` });
    }, 350);
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <Btn icon={Plus} onClick={() => open()}>
          Create template
        </Btn>
      </div>
      <DataTable<NotificationTemplate>
        caption="Notification templates"
        rows={rows}
        rowKey={(t) => t.id}
        onRowClick={(t) => open(t)}
        empty={<EmptyState icon={Mail} title="No templates yet" />}
        columns={[
          { key: "id", header: "ID", cell: (t) => <span className="font-mono text-sm">{t.id}</span> },
          { key: "ev", header: "Event", cell: (t) => humanize(t.event) },
          { key: "ch", header: "Channel", className: "whitespace-nowrap", cell: (t) => CHANNEL_LABEL[t.channel] },
          { key: "sub", header: "Subject", className: "min-w-64", cell: (t) => t.subject || <span className="text-muted-foreground">—</span> },
          { key: "v", header: "Version", align: "right", cell: (t) => <span className="tabular-nums">v{t.version}</span> },
          { key: "up", header: "Updated", cell: (t) => <span className="tabular-nums whitespace-nowrap">{t.updatedAt} · {userName(t.updatedBy)}</span> },
          { key: "act", header: <span className="sr-only">Actions</span>, align: "right", cell: (t) => <Btn variant="ghost" size="sm" icon={Pencil} onClick={(e) => { e.stopPropagation(); open(t); }} aria-label={`Edit template ${t.id}`}>Edit</Btn> },
        ]}
      />
      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        dismissible={!dirty && !saving}
        size="xl"
        title={editing === "new" ? "Create template" : `Edit ${f.id}`}
        subtitle={dirty ? "Unsaved changes" : "Use {{placeholders}}. Wrap margin in {{#if canSeeMargin}}…{{/if}} so it's left out for people who can't see it."}
        footer={
          <>
            <MissingHint id={tplHintId} missing={tplMissing} />
            <Btn variant="subtle" onClick={() => setEditing(null)} disabled={saving}>Cancel</Btn>
            <Btn type="submit" form="tpl-form" loading={saving} disabled={tplMissing.length > 0} aria-describedby={tplMissing.length ? tplHintId : undefined}>
              Save template
            </Btn>
          </>
        }
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form id="tpl-form" onSubmit={save} noValidate className="space-y-4">
            <ErrorBanner error={error} onClose={() => setError(null)} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Event" required>
                <select className={inputCls} value={f.event} onChange={(e) => setF({ ...f, event: e.target.value as NotificationEvent })}>
                  {NOTIFICATION_EVENTS.map((e) => <option key={e} value={e}>{humanize(e)}</option>)}
                </select>
              </Field>
              <Field label="Channel" required>
                <select className={inputCls} value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value as NotificationChannel })}>
                  {NOTIFICATION_CHANNELS.map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Subject" required={f.channel === "EMAIL"} error={fe("nt-subject")}>
              <input id="nt-subject" className={inputCls} value={f.subject} onChange={(e) => setF({ ...f, subject: e.target.value })} placeholder="e.g. Approve {{request.id}} · {{customer.name}}" />
            </Field>
            <Field label="Body" required error={fe("nt-body")}>
              <textarea id="nt-body" rows={8} className={`${inputCls} h-auto py-2 font-mono text-base`} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
            </Field>
          </form>
          <section aria-labelledby="pv-h">
            <h3 id="pv-h" className="text-lg lg:text-xl leading-[1.2] font-semibold mb-2">Preview</h3>
            <Field label="Recipient">
              <select className={inputCls} value={recipient} onChange={(e) => setRecipient(e.target.value)}>
                {USERS.filter((u) => u.status === "ACTIVE" && u.role !== "CHANNEL_PARTNER").map((u) => (
                  <option key={u.id} value={u.id}>{u.name} · {u.title}</option>
                ))}
              </select>
            </Field>
            <div className="mt-3">
              {preview.canSeeMargin ? <Flag tone="success">Margin included — recipient may see it</Flag> : <Flag tone="neutral">Margin left out — {userName(recipient)} can't see margin</Flag>}
            </div>
            <div className="mt-3 whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-4 text-base">{preview.text}</div>
            <p className="text-xs text-muted-foreground mt-2">Sample data: APR-3001 · Edmundson Electrical.</p>
          </section>
        </div>
      </Modal>
    </>
  );
}

/* ---------------- Delivery log ---------------- */

type Row = { key: string; n: AppNotification; d: Delivery };

function DeliveryLog() {
  const [tick, setTick] = useState(0);
  const [statuses, setStatuses] = useState<Delivery["status"][]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const rows: Row[] = useMemo(
    () => NOTIFICATIONS.flatMap((n) => n.deliveries.map((d) => ({ key: `${n.id}-${d.channel}`, n, d }))).sort((a, b) => b.n.at.localeCompare(a.n.at)),
    [tick], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const list = rows.filter((r) => statuses.length === 0 || statuses.includes(r.d.status));
  const retry = (r: Row) => {
    setBusy(r.key);
    window.setTimeout(() => {
      r.d.attempts += 1;
      // The archived Teams channel keeps failing until its webhook is replaced.
      if (r.d.detail?.includes("410")) {
        toast.error("Delivery failed again", { description: "Webhook returned 410 Gone. Replace the webhook secret under Channels & timing, then retry." });
      } else {
        r.d.status = "DELIVERED";
        r.d.detail = undefined;
        toast.success("Notification delivered");
      }
      setBusy(null);
      setTick((n) => n + 1);
    }, 600);
  };
  const tone = (s: Delivery["status"]) => (s === "DELIVERED" ? "SUCCEEDED" : s === "FAILED" ? "FAILED" : s === "RETRYING" ? "RUNNING" : "INACTIVE");
  return (
    <>
      <FilterPills<Delivery["status"]> label="Status" selected={statuses} onChange={setStatuses} options={(["DELIVERED", "FAILED", "RETRYING", "SUPPRESSED"] as const).map((s) => ({ key: s, label: humanize(s), count: rows.filter((r) => r.d.status === s).length }))} />
      <DataTable<Row>
        caption="Notification delivery attempts"
        rows={list}
        rowKey={(r) => r.key}
        pageSize={25}
        empty={<EmptyState title="No deliveries match" action={<Btn variant="subtle" onClick={() => setStatuses([])}>Clear filters</Btn>} />}
        columns={[
          { key: "at", header: "Sent", cell: (r) => <span className="tabular-nums whitespace-nowrap">{r.n.at}</span> },
          { key: "id", header: "Notification", className: "min-w-48", cell: (r) => <span><span className="font-mono text-sm">{r.n.id}</span> · {r.n.title}</span> },
          { key: "ev", header: "Event", className: "whitespace-nowrap", cell: (r) => humanize(r.n.event) },
          { key: "to", header: "Recipient", className: "whitespace-nowrap", cell: (r) => userName(r.n.recipientId) },
          { key: "ch", header: "Channel", className: "whitespace-nowrap", cell: (r) => <span className="inline-flex items-center gap-1.5">{r.d.channel === "EMAIL" ? <Mail className="size-4" aria-hidden /> : r.d.channel === "TEAMS_SLACK" ? <MessageSquare className="size-4" aria-hidden /> : <Bell className="size-4" aria-hidden />}{CHANNEL_LABEL[r.d.channel]}</span> },
          { key: "st", header: "Status", className: "whitespace-nowrap", cell: (r) => <StatusPill status={tone(r.d.status)} label={humanize(r.d.status)} /> },
          { key: "att", header: "Attempts", align: "right", cell: (r) => <span className="tabular-nums">{r.d.attempts}</span> },
          {
            key: "det",
            header: "Detail",
            className: "min-w-48",
            // Retry sits with the failure it fixes, so the table needs no extra actions column.
            cell: (r) => (
              <div className="space-y-2">
                <div>{r.d.detail ?? <span className="text-muted-foreground">—</span>}</div>
                {r.d.status === "FAILED" && (
                  <Btn size="sm" variant="outline" icon={RotateCcw} loading={busy === r.key} onClick={() => retry(r)}>
                    Retry
                  </Btn>
                )}
              </div>
            ),
          },
        ]}
      />
    </>
  );
}

/* ---------------- Channels & timing ---------------- */

function Settings() {
  const [lead, setLead] = useState<number[]>(() => [...CONTRACT_EXPIRY_LEAD_DAYS]);
  const [draft, setDraft] = useState("");
  const [leadErr, setLeadErr] = useState<string | undefined>();
  const [saving, setSaving] = useState(false);
  const [hooks, setHooks] = useState(WEBHOOKS);
  const [replacing, setReplacing] = useState<(typeof WEBHOOKS)[number] | null>(null);
  const [secret, setSecret] = useState("");
  const [secretErr, setSecretErr] = useState<string | undefined>();
  const leadHintId = useId();
  const whHintId = useId();
  const leadMissing = missingFields([["Lead times", lead]]);
  const whMissing = missingFields([["Webhook URL", secret]]);
  const dirty = JSON.stringify([...lead].sort((a, b) => b - a)) !== JSON.stringify([...CONTRACT_EXPIRY_LEAD_DAYS].sort((a, b) => b - a));

  const add = () => {
    const n = Number(draft);
    if (!Number.isInteger(n) || n < 1 || n > 365) return setLeadErr("Enter whole days between 1 and 365.");
    if (lead.includes(n)) return setLeadErr(`${n} days is already in the list.`);
    setLead([...lead, n].sort((a, b) => b - a));
    setDraft("");
    setLeadErr(undefined);
  };
  const saveLead = () => {
    if (!lead.length) return setLeadErr("Keep at least one lead time so account owners are warned before expiry.");
    setSaving(true);
    window.setTimeout(() => {
      CONTRACT_EXPIRY_LEAD_DAYS.splice(0, CONTRACT_EXPIRY_LEAD_DAYS.length, ...lead);
      setSaving(false);
      toast.success("Contract expiry alerts saved", { description: `Account owners are alerted ${lead.join(", ")} days before a contract price ends.` });
    }, 350);
  };
  const saveSecret = (ev?: FormEvent) => {
    ev?.preventDefault();
    if (!/^https:\/\/\S+$/.test(secret.trim())) return setSecretErr("Paste the full https:// webhook URL from Teams or Slack.");
    const last4 = secret.trim().slice(-4);
    setHooks(hooks.map((h) => (h.id === replacing!.id ? { ...h, last4, rotatedAt: NOW, status: "ACTIVE" } : h)));
    toast.success(`Webhook for ${replacing!.name} replaced`, { description: "Stored in the secrets vault. It won't be shown again." });
    setReplacing(null);
    setSecret("");
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
      <Card
        title="Contract expiry alerts"
        subtitle="Sent to the account owner before a contract or exception price ends."
        actions={
          <>
            {dirty && <Tag tone="warning">Unsaved changes</Tag>}
            {dirty && <Btn variant="subtle" disabled={saving} onClick={() => { setLead([...CONTRACT_EXPIRY_LEAD_DAYS]); setLeadErr(undefined); }}>Cancel</Btn>}
            <MissingHint id={leadHintId} missing={leadMissing} />
            <Btn loading={saving} disabled={!dirty || leadMissing.length > 0} onClick={saveLead} aria-describedby={leadMissing.length ? leadHintId : undefined}>
              Save
            </Btn>
          </>
        }
      >
        <ul className="flex flex-wrap gap-2 mb-4" aria-label="Lead times">
          {lead.map((d) => (
            <li key={d} className="inline-flex items-center gap-2 rounded-full bg-brand-soft text-brand-strong text-sm px-3 py-1.5 tabular-nums">
              {d} days before
              <button type="button" className="hit size-5 rounded-full bg-brand/15 grid place-items-center hover:bg-brand/25" aria-label={`Remove ${d} days`} onClick={() => setLead(lead.filter((x) => x !== d))}>
                <X className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Add lead time (days)" error={leadErr} className="w-48">
            <input type="number" inputMode="numeric" min={1} max={365} className={inputCls} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), add())} placeholder="e.g. 14" />
          </Field>
          <Btn variant="subtle" icon={Plus} onClick={add} disabled={!draft.trim()} title={!draft.trim() ? "Enter a number of days first" : undefined}>
            Add
          </Btn>
        </div>
      </Card>

      <Card title="Teams / Slack webhooks" subtitle="URLs are secrets: stored in the vault, never shown after saving." padded={false}>
        <ul className="divide-y divide-border">
          {hooks.map((h) => (
            <li key={h.id} className="flex flex-wrap items-center gap-3 px-5 py-4">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{h.name}</div>
                <div className="text-sm text-muted-foreground font-mono break-all">https://••••••••••••{h.last4}</div>
                <div className="text-xs text-muted-foreground mt-0.5">Rotated {h.rotatedAt}</div>
              </div>
              <StatusPill status={h.status} />
              <Btn variant="outline" size="sm" icon={KeyRound} onClick={() => { setReplacing(h); setSecret(""); setSecretErr(undefined); }}>
                Replace URL
              </Btn>
            </li>
          ))}
        </ul>
        <div className="px-5 py-4 border-t border-border">
          <InfoBanner className="" tone="info">Email goes out through the corporate SMTP relay. Failed webhook deliveries are retried 3 times and logged in the delivery log.</InfoBanner>
        </div>
      </Card>

      <Modal
        open={!!replacing}
        onClose={() => setReplacing(null)}
        title={`Replace webhook — ${replacing?.name ?? ""}`}
        subtitle="The current URL can't be displayed. Paste the new one; it is stored as a secret."
        size="sm"
        footer={
          <>
            <MissingHint id={whHintId} missing={whMissing} />
            <Btn variant="subtle" onClick={() => setReplacing(null)}>Cancel</Btn>
            <Btn type="submit" form="wh-form" disabled={whMissing.length > 0} aria-describedby={whMissing.length ? whHintId : undefined}>
              Save URL
            </Btn>
          </>
        }
      >
        <form id="wh-form" onSubmit={saveSecret} noValidate>
          <Field label="Webhook URL" required error={secretErr}>
            <input type="password" autoComplete="off" className={inputCls} value={secret} onChange={(e) => setSecret(e.target.value)} placeholder="https://…" />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
