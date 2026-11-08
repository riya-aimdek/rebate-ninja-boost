import { createFileRoute } from "@tanstack/react-router";
import { useId, useMemo, useState, type FormEvent } from "react";
import { KeyRound, Pencil, Plus, Send, ShieldCheck, UserX, Users as UsersIcon } from "lucide-react";
import { toast } from "sonner";
import {
  Btn,
  Card,
  ConfirmDialog,
  DataTable,
  DetailGrid,
  Drawer,
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
  RecordId,
  RecordLink,
  StatusPill,
  Tag,
  Toggle,
  humanize,
  inputCls,
  missingFields,
  type ApiError,
  type Tone,
  TableSection,
} from "@/components/pricing/kit";
import { RequireAccess } from "@/components/pricing/access";
import {
  ACCESS_LABEL,
  ACCESS_LEVELS,
  MODULES,
  MODULE_LABEL,
  RBAC_MATRIX,
  ROLES,
  ROLE_LABEL,
  USERS,
  useSession,
  type AccessLevel,
  type Grant,
  type Module,
  type User,
} from "@/lib/pricing/session";
import { NOW, QUOTES, saveQuote } from "@/lib/pricing/deals";
import {
  API_TOKENS,
  DEPROVISION_SLA_MINUTES,
  LIFECYCLE_EVENTS,
  LOCAL_ACCOUNTS,
  PERMISSION_CODES,
  SESSIONS,
  SESSION_POLICY,
  ipAllowed,
  isIpOrCidr,
  type LifecycleEvent,
  type SessionPolicy,
} from "@/lib/pricing/admin";

export const Route = createFileRoute("/pricing/admin/users")({
  head: () => ({ meta: [{ title: "Users & roles · Rebate Ninja" }] }),
  component: () => (
    <PricingLayout crumbs={[{ label: "Pricing", to: "/pricing" }, { label: "Administration" }, { label: "Users & roles" }]}>
      <RequireAccess module="SYSTEM_ADMIN">
        <Page />
      </RequireAccess>
    </PricingLayout>
  ),
});

type TabKey = "users" | "roles" | "policy";
type RoleRow = { key: string; label: string; seeded: boolean; grants: Record<Module, Grant> };
type UserStatus = User["status"];

const STATUS_LIST: UserStatus[] = ["ACTIVE", "INACTIVE", "LOCKED", "DEACTIVATED"];
const LEVEL_TONE: Record<AccessLevel, Tone> = { N: "neutral", V: "info", E: "brand", A: "warning", F: "success" };
const OPEN_QUOTE = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "SENT"];

/** Same rule as session.can(), for roles edited on this page. A ⊉ E and E ⊉ A; F includes everything. */
function grantAllows(g: Grant, need: AccessLevel) {
  if (need === "N") return true;
  if (g.level === "F") return true;
  if (need === "E") return g.level === "E";
  if (need === "A") return g.level === "A";
  if (need === "F") return false;
  return g.level !== "N";
}

const seededRoles = (): RoleRow[] => ROLES.map((r) => ({ key: r, label: ROLE_LABEL[r], seeded: true, grants: { ...RBAC_MATRIX[r] } }));

const VIEW_ONLY = "View only — editing needs System Admin full access.";

function Page() {
  const { user: me, can } = useSession();
  const editable = can("SYSTEM_ADMIN", "F");
  const [tab, setTab] = useState<TabKey>("users");
  const [users, setUsers] = useState<User[]>(() => USERS.map((u) => ({ ...u })));
  const [roles, setRoles] = useState<RoleRow[]>(seededRoles);
  const [sessions, setSessions] = useState(SESSIONS);
  const [tokens, setTokens] = useState(API_TOKENS.map((t) => ({ ...t, revoked: false })));
  const [history, setHistory] = useState<LifecycleEvent[]>(LIFECYCLE_EVENTS);
  const [search, setSearch] = useState("");
  const [statuses, setStatuses] = useState<UserStatus[]>([]);
  const [open, setOpen] = useState<User | null>(null);

  const list = useMemo(
    () =>
      users.filter(
        (u) =>
          (!search || `${u.name} ${u.email} ${u.title} ${ROLE_LABEL[u.role]} ${u.idpGroups.join(" ")}`.toLowerCase().includes(search.toLowerCase())) &&
          (statuses.length === 0 || statuses.includes(u.status)),
      ),
    [users, search, statuses],
  );

  const roleOf = (key: string) => roles.find((r) => r.key === key);
  /** Users holding Full on System / RBAC admin — at least one must always remain (LAST_ADMIN). */
  const adminHolders = (us: User[], rs: RoleRow[]) => us.filter((u) => u.status === "ACTIVE" && rs.find((r) => r.key === u.role)?.grants.SYSTEM_ADMIN.level === "F");

  return (
    <>
      <ListHeader
        title="Users & roles"
        eyebrow="Administration"
        subtitle="Who can sign in, what each role may do, and how sessions are controlled."
        count={tab === "users" ? list.length : undefined}
        noun="user"
        search={tab === "users" ? search : undefined}
        onSearch={tab === "users" ? setSearch : undefined}
      />
      {!editable && (
        <InfoBanner tone="neutral" title="View only">
          You can review users, roles and policies. Changing them needs System Admin full access (IT Administrator).
        </InfoBanner>
      )}
      <PillTabs<TabKey>
        idPrefix="users"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "users", label: "Users", count: users.length },
          { key: "roles", label: "Roles & permissions", count: roles.length },
          { key: "policy", label: "Session & password policy" },
        ]}
      />
      <div role="tabpanel" id={`users-panel-${tab}`} aria-labelledby={`users-tab-${tab}`}>
        {tab === "users" && (
          <UsersTab
            list={list}
            all={users}
            statuses={statuses}
            setStatuses={setStatuses}
            filtered={!!search || statuses.length > 0}
            clear={() => {
              setSearch("");
              setStatuses([]);
            }}
            onOpen={setOpen}
            selected={open?.id ?? null}
            history={history}
          />
        )}
        {tab === "roles" && <RolesTab roles={roles} setRoles={setRoles} users={users} adminHolders={adminHolders} editable={editable} />}
        {tab === "policy" && <PolicyTab editable={editable} />}
      </div>

      {open && (
        <UserDrawer
          user={open}
          me={me}
          editable={editable}
          users={users}
          roles={roles}
          sessions={sessions.filter((s) => s.userId === open.id)}
          tokens={tokens.filter((t) => t.userId === open.id)}
          onClose={() => setOpen(null)}
          onRoleChange={(roleKey) => {
            const next = users.map((u) => (u.id === open.id ? { ...u, role: roleKey as User["role"] } : u));
            if (adminHolders(users, roles).length > 0 && adminHolders(next, roles).length === 0) return false;
            setUsers(next);
            setOpen({ ...open, role: roleKey as User["role"] });
            toast.success(`${open.name} is now ${roleOf(roleKey)?.label}`, { description: "Change recorded in the audit log." });
            return true;
          }}
          onDeactivate={(reassignTo) => {
            const ended = sessions.filter((s) => s.userId === open.id).length;
            const revoked = tokens.filter((t) => t.userId === open.id && !t.revoked).length;
            const quotes = QUOTES.filter((q) => q.ownerId === open.id && OPEN_QUOTE.includes(q.status));
            if (reassignTo) for (const q of quotes) saveQuote({ ...q, ownerId: reassignTo });
            setSessions((ss) => ss.filter((s) => s.userId !== open.id));
            setTokens((ts) => ts.map((t) => (t.userId === open.id ? { ...t, revoked: true } : t)));
            setUsers((us) => us.map((u) => (u.id === open.id ? { ...u, status: "DEACTIVATED" } : u)));
            const ev: LifecycleEvent = {
              id: `LC-${300 + history.length + 2}`,
              at: NOW,
              userId: open.id,
              action: "DEACTIVATED",
              by: `${me.name} (simulated IdP SCIM)`,
              source: "SCIM",
              detail: `${ended} ${ended === 1 ? "session" : "sessions"} ended and ${revoked} API ${revoked === 1 ? "token" : "tokens"} revoked in under 1 min (SLA ${DEPROVISION_SLA_MINUTES} min).${quotes.length ? ` ${quotes.length} open ${quotes.length === 1 ? "quote" : "quotes"} reassigned to ${users.find((u) => u.id === reassignTo)?.name}.` : ""}`,
            };
            setHistory((h) => [ev, ...h]);
            setOpen({ ...open, status: "DEACTIVATED" });
            toast.success(`${open.name} deactivated`, { description: ev.detail });
          }}
        />
      )}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Users                                                               */
/* ------------------------------------------------------------------ */

function UsersTab({
  list,
  all,
  statuses,
  setStatuses,
  filtered,
  clear,
  onOpen,
  selected,
  history,
}: {
  list: User[];
  all: User[];
  statuses: UserStatus[];
  setStatuses: (s: UserStatus[]) => void;
  filtered: boolean;
  clear: () => void;
  onOpen: (u: User) => void;
  selected: string | null;
  history: LifecycleEvent[];
}) {
  const nameOf = (id?: string) => all.find((u) => u.id === id)?.name ?? "—";
  return (
    <>
      <InfoBanner title="Identity follows the corporate IdP">
        Users are created on first SSO sign-in and their role comes from IdP group mapping. When the IdP deactivates someone (SCIM or webhook), their sessions and API tokens are revoked within {DEPROVISION_SLA_MINUTES} minutes.
      </InfoBanner>
      <FilterPills<UserStatus>
        label="Status"
        selected={statuses}
        onChange={setStatuses}
        options={STATUS_LIST.map((s) => ({ key: s, label: humanize(s), count: all.filter((u) => u.status === s).length }))}
      />
      <DataTable<User>
        caption="Users"
        rows={list}
        rowKey={(u) => u.id}
        onRowClick={onOpen}
        selectedKey={selected}
        pageSize={25}
        empty={
          filtered ? (
            <EmptyState icon={UsersIcon} title="No users match these filters" action={<Btn variant="subtle" onClick={clear}>Clear filters</Btn>}>
              Try a different search term or remove a filter.
            </EmptyState>
          ) : (
            <EmptyState icon={UsersIcon} title="No users yet" />
          )
        }
        columns={[
          {
            key: "name",
            header: "User",
            className: "min-w-52",
            cell: (u) => (
              <div>
                <div className="font-medium text-brand-strong">{u.name}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </div>
            ),
          },
          { key: "role", header: "Role", className: "min-w-44", cell: (u) => ROLE_LABEL[u.role as keyof typeof ROLE_LABEL] ?? humanize(u.role) },
          { key: "title", header: "Job title", className: "whitespace-nowrap", cell: (u) => u.title },
          { key: "mgr", header: "Manager", className: "whitespace-nowrap", cell: (u) => nameOf(u.managerId) },
          { key: "groups", header: "IdP groups", cell: (u) => (u.idpGroups.length ? <span className="font-mono text-xs">{u.idpGroups.join(", ")}</span> : <span className="text-muted-foreground">None</span>) },
          { key: "login", header: "Last sign-in", cell: (u) => <span className="tabular-nums whitespace-nowrap">{u.lastLogin}</span> },
          { key: "st", header: "Status", cell: (u) => <StatusPill status={u.status} /> },
        ]}
      />
      <Card title="Deactivation and provisioning history" subtitle="Who changed an account's status, when, and what was revoked." className="mt-6" padded={false}>
        {history.length === 0 ? (
          <EmptyState title="No lifecycle events yet" />
        ) : (
          <ul className="divide-y divide-border">
            {history.map((h) => (
              <li key={h.id} className="px-5 py-4 text-sm flex flex-wrap gap-x-4 gap-y-1">
                <span className="tabular-nums text-muted-foreground whitespace-nowrap">{h.at}</span>
                <StatusPill status={h.action} tone={h.action === "DEACTIVATED" ? "danger" : "info"} />
                <span className="font-medium">{nameOf(h.userId)}</span>
                <span className="text-muted-foreground">by {h.by}</span>
                <p className="basis-full text-foreground">{h.detail}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

function UserDrawer({
  user,
  me,
  editable,
  users,
  roles,
  sessions,
  tokens,
  onClose,
  onRoleChange,
  onDeactivate,
}: {
  user: User;
  me: User;
  editable: boolean;
  users: User[];
  roles: RoleRow[];
  sessions: typeof SESSIONS;
  tokens: Array<(typeof API_TOKENS)[number] & { revoked: boolean }>;
  onClose: () => void;
  onRoleChange: (role: string) => boolean;
  onDeactivate: (reassignTo?: string) => void;
}) {
  const [roleDraft, setRoleDraft] = useState<string>(user.role);
  const [roleError, setRoleError] = useState<ApiError | null>(null);
  const [deactivating, setDeactivating] = useState(false);
  const [reassign, setReassign] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const openQuotes = QUOTES.filter((q) => q.ownerId === user.id && OPEN_QUOTE.includes(q.status));
  const targets = users.filter((u) => u.id !== user.id && u.status === "ACTIVE" && (u.role === "SALES_REP" || u.role === "SALES_MANAGER"));
  const deactHintId = useId();
  const deactMissing = missingFields([["Reassign open quotes to", reassign, openQuotes.length > 0]]);
  const reassignError = submitted && openQuotes.length > 0 && !reassign ? "Choose who takes over the open quotes before deactivating." : undefined;

  const saveRole = () => {
    if (roleDraft === user.role) return;
    const ok = onRoleChange(roleDraft);
    setRoleError(
      ok
        ? null
        : {
            errorClass: "BUSINESS_RULE",
            code: "LAST_ADMIN",
            message: `${user.id === me.id ? "You are" : `${user.name} is`} the only active user with full System / RBAC admin access. Give another user that access first, then change this role.`,
            field: "role",
          },
    );
    if (!ok) setRoleDraft(user.role);
  };

  const confirm = () => {
    setSubmitted(true);
    if (openQuotes.length > 0 && !reassign) {
      document.getElementById("reassign-to")?.focus();
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      onDeactivate(reassign || undefined);
      setBusy(false);
      setDeactivating(false);
    }, 600);
  };

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        size="md"
        title={user.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <RecordId>{user.id}</RecordId>
            <StatusPill status={user.status} />
            {user.sso ? <Tag tone="info">SSO</Tag> : <Tag tone="warning">Local account</Tag>}
          </span>
        }
        footer={
          <>
            <Btn variant="subtle" onClick={onClose}>
              Close
            </Btn>
            {user.status === "ACTIVE" && editable && (
              <Btn variant="danger" icon={UserX} onClick={() => setDeactivating(true)}>
                Deactivate user
              </Btn>
            )}
          </>
        }
      >
        <section className="bg-card border border-border rounded-xl px-5">
          <DetailGrid
            items={[
              { label: "Email", value: user.email },
              { label: "Job title", value: user.title },
              { label: "Region", value: user.region },
              { label: "Manager", value: users.find((u) => u.id === user.managerId)?.name ?? "—" },
              { label: "Approval authority", value: user.approvalAuthorityPct !== undefined ? `Up to ${user.approvalAuthorityPct}% discount` : "—" },
              { label: "IdP groups", value: user.idpGroups.length ? user.idpGroups.join(", ") : "None — no access", full: true },
              { label: "Last sign-in", value: user.lastLogin },
            ]}
          />
        </section>

        <section className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-lg lg:text-xl leading-[1.2] font-semibold mb-3">Role</h3>
          <ErrorBanner error={roleError} onClose={() => setRoleError(null)} />
          <div className="flex flex-wrap items-end gap-3">
            <Field label="Assigned role" className="flex-1 min-w-48" hint={editable ? "Normally set by IdP group mapping. A manual change is audited." : VIEW_ONLY}>
              <select className={inputCls} value={roleDraft} disabled={user.status !== "ACTIVE" || !editable} onChange={(e) => setRoleDraft(e.target.value)}>
                {roles.map((r) => (
                  <option key={r.key} value={r.key}>
                    {r.label}
                  </option>
                ))}
              </select>
            </Field>
            {editable && (
              <Btn variant="outline" disabled={roleDraft === user.role} onClick={saveRole}>
                Save role
              </Btn>
            )}
          </div>
        </section>

        <section className="bg-card border border-border rounded-xl p-5">
          <h3 className="text-lg lg:text-xl leading-[1.2] font-semibold mb-3">Active sessions and API tokens</h3>
          {sessions.length === 0 && tokens.filter((t) => !t.revoked).length === 0 ? (
            <p className="text-base text-muted-foreground">No active sessions or tokens.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {sessions.map((s) => (
                <li key={s.id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    {s.device} · <span className="font-mono text-xs">{s.ip}</span>
                  </span>
                  <span className="text-muted-foreground tabular-nums">last seen {s.lastSeen}</span>
                </li>
              ))}
              {tokens.map((t) => (
                <li key={t.id} className="flex flex-wrap justify-between gap-2">
                  <span>
                    API token · {t.label} <RecordId>{t.id}</RecordId>
                  </span>
                  {t.revoked ? <Flag tone="danger">Revoked</Flag> : <span className="text-muted-foreground tabular-nums">expires {t.expiresAt}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>

        {openQuotes.length > 0 && (
          <section className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-lg lg:text-xl leading-[1.2] font-semibold mb-2">Open quotes owned ({openQuotes.length})</h3>
            <ul className="space-y-1 text-sm">
              {openQuotes.map((q) => (
                <li key={q.id}>
                  <RecordLink to="/pricing/quotes/$id" params={{ id: q.id }}>
                    {q.id}
                  </RecordLink>{" "}
                  · {q.name} · <StatusPill status={q.status} />
                </li>
              ))}
            </ul>
          </section>
        )}
      </Drawer>

      <Modal
        open={deactivating}
        onClose={() => setDeactivating(false)}
        dismissible={!busy}
        size="sm"
        title={`Deactivate ${user.name}?`}
        subtitle="Simulates the IdP deactivation event (SCIM)."
        footer={
          <>
            <MissingHint id={deactHintId} missing={deactMissing} />
            <Btn variant="subtle" onClick={() => setDeactivating(false)} disabled={busy} data-autofocus>
              Cancel
            </Btn>
            <Btn variant="danger" loading={busy} onClick={confirm} disabled={deactMissing.length > 0} aria-describedby={deactMissing.length ? deactHintId : undefined}>
              Deactivate user
            </Btn>
          </>
        }
      >
        <p className="text-base">
          Their {sessions.length} active {sessions.length === 1 ? "session" : "sessions"} end and {tokens.filter((t) => !t.revoked).length} API {tokens.length === 1 ? "token stops" : "tokens stop"} working within {DEPROVISION_SLA_MINUTES} minutes. They can't sign in again until the IdP reactivates them.
        </p>
        {openQuotes.length > 0 && (
          <Field label={`Reassign ${openQuotes.length} open ${openQuotes.length === 1 ? "quote" : "quotes"} to`} required error={reassignError} className="mt-4">
            <select id="reassign-to" className={inputCls} value={reassign} onChange={(e) => setReassign(e.target.value)}>
              <option value="">Select a user…</option>
              {targets.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.title}
                </option>
              ))}
            </select>
          </Field>
        )}
      </Modal>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Roles & permissions                                                 */
/* ------------------------------------------------------------------ */

function LevelCell({ g }: { g: Grant }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${ACCESS_LABEL[g.level]}${g.own ? " — own records only" : ""}`}>
      <Tag tone={LEVEL_TONE[g.level]}>
        <span className="font-bold">{g.level}</span>
        {g.own && <span aria-hidden>*</span>}
      </Tag>
      <span className="sr-only">
        {ACCESS_LABEL[g.level]}
        {g.own ? ", own records only" : ""}
      </span>
    </span>
  );
}

function RolesTab({
  roles,
  setRoles,
  users,
  adminHolders,
  editable,
}: {
  roles: RoleRow[];
  setRoles: (r: RoleRow[]) => void;
  users: User[];
  adminHolders: (us: User[], rs: RoleRow[]) => User[];
  editable: boolean;
}) {
  const [editing, setEditing] = useState<RoleRow | "new" | null>(null);
  const [draft, setDraft] = useState<RoleRow | null>(null);
  const [name, setName] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [saving, setSaving] = useState(false);

  const startNew = () => {
    setEditing("new");
    setName("");
    setSubmitted(false);
    setError(null);
  };
  const startEdit = (r: RoleRow) => {
    setEditing(r);
    setDraft({ ...r, grants: { ...r.grants } });
    setError(null);
  };
  const roleHintId = useId();
  const roleMissing = missingFields([["Role name", name]]);
  const nameError = submitted ? (!name.trim() ? "Enter a role name." : roles.some((r) => r.label.toLowerCase() === name.trim().toLowerCase()) ? "A role with this name already exists." : undefined) : undefined;

  const createRole = (e?: FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    if (!name.trim() || roles.some((r) => r.label.toLowerCase() === name.trim().toLowerCase())) {
      setError(!name.trim() ? { errorClass: "VALIDATION", code: "VALIDATION_REQUIRED", message: "Enter a name for the role.", field: "name" } : null);
      document.getElementById("role-name")?.focus();
      return;
    }
    const grants = Object.fromEntries(MODULES.map((m) => [m, { level: "N" as AccessLevel }])) as Record<Module, Grant>;
    setRoles([...roles, { key: `CUSTOM_${roles.length + 1}`, label: name.trim(), seeded: false, grants }]);
    setEditing(null);
    toast.success(`Role “${name.trim()}” created with no access`, { description: "New roles deny everything until you grant module access." });
  };

  const saveGrants = () => {
    if (!draft) return;
    const next = roles.map((r) => (r.key === draft.key ? draft : r));
    if (adminHolders(users, roles).length > 0 && adminHolders(users, next).length === 0) {
      setError({ errorClass: "BUSINESS_RULE", code: "LAST_ADMIN", message: "This change would leave no active user with full System / RBAC admin access. Give another user that access first.", field: "SYSTEM_ADMIN" });
      return;
    }
    setSaving(true);
    window.setTimeout(() => {
      setRoles(next);
      setSaving(false);
      setEditing(null);
      toast.success(`${draft.label} permissions saved`, { description: "Change recorded in the audit log." });
    }, 400);
  };

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-8 [&>p]:min-w-0 [&>p]:flex-1 [&>:not(p)]:shrink-0 mb-4">
        <p className="text-base text-muted-foreground">
          Levels: N none · V view · E edit · A approve · F full. <span aria-hidden>*</span> means own records only.
        </p>
        {editable ? (
          <Btn icon={Plus} onClick={startNew}>
            Create role
          </Btn>
        ) : null}
      </div>
      <DataTable<RoleRow>
        caption="Role-based access matrix"
        rows={roles}
        rowKey={(r) => r.key}
        numbered={false}
        columns={[
          {
            key: "role",
            header: "Role",
            className: "min-w-56",
            cell: (r) => (
              <div>
                <div className="font-medium">{r.label}</div>
                <div className="text-xs text-muted-foreground">
                  {r.seeded ? "Seeded" : "Custom"} · {users.filter((u) => u.role === r.key && u.status === "ACTIVE").length} active users
                </div>
              </div>
            ),
          },
          ...MODULES.map((m) => ({ key: m, header: <span title={MODULE_LABEL[m]}>{MODULE_LABEL[m].split(/[ /&]/)[0]}</span>, align: "center" as const, cell: (r: RoleRow) => <LevelCell g={r.grants[m]} /> })),
          ...(editable
            ? [
                {
                  key: "edit",
                  header: <span className="sr-only">Actions</span>,
                  cell: (r: RoleRow) => (
                    <Btn variant="ghost" size="sm" icon={Pencil} aria-label={`Edit ${r.label} permissions`} onClick={() => startEdit(r)}>
                      Edit
                    </Btn>
                  ),
                },
              ]
            : []),
        ]}
      />
      <p className="text-xs text-muted-foreground mt-2">Column headers abbreviate modules; hover or use a screen reader for the full name.</p>

      <PermissionCodes roles={roles} />
      <AuthTester roles={roles} users={users} />

      <Modal
        open={editing === "new"}
        onClose={() => setEditing(null)}
        size="sm"
        title="Create role"
        subtitle="New roles start with no access to any module (deny by default)."
        footer={
          <>
            <MissingHint id={roleHintId} missing={roleMissing} />
            <Btn variant="subtle" onClick={() => setEditing(null)}>
              Cancel
            </Btn>
            <Btn type="submit" form="role-form" disabled={roleMissing.length > 0} aria-describedby={roleMissing.length ? roleHintId : undefined}>
              Create role
            </Btn>
          </>
        }
      >
        <form id="role-form" onSubmit={createRole} noValidate>
          <ErrorBanner error={error} onClose={() => setError(null)} />
          <Field label="Role name" required error={nameError}>
            <input id="role-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Regional pricing reviewer" />
          </Field>
        </form>
      </Modal>

      <Modal
        open={editing !== null && editing !== "new" && !!draft}
        onClose={() => setEditing(null)}
        dismissible={!saving}
        size="lg"
        title={`Edit ${draft?.label ?? ""} permissions`}
        subtitle="Grant the minimum access the job needs (least privilege)."
        footer={
          <>
            <Btn variant="subtle" onClick={() => setEditing(null)} disabled={saving}>
              Cancel
            </Btn>
            <Btn loading={saving} onClick={saveGrants}>
              Save permissions
            </Btn>
          </>
        }
      >
        <ErrorBanner error={error} onClose={() => setError(null)} />
        {draft && (
          <div className="grid gap-3">
            {MODULES.map((m) => (
              <div key={m} className="grid grid-cols-1 sm:grid-cols-[1fr_160px_auto] items-center gap-3 border-b border-border pb-3">
                <span className="text-sm font-medium" id={`lvl-${m}`}>
                  {MODULE_LABEL[m]}
                </span>
                <select
                  aria-labelledby={`lvl-${m}`}
                  className={inputCls}
                  value={draft.grants[m].level}
                  onChange={(e) => setDraft({ ...draft, grants: { ...draft.grants, [m]: { ...draft.grants[m], level: e.target.value as AccessLevel } } })}
                >
                  {ACCESS_LEVELS.map((l) => (
                    <option key={l} value={l}>
                      {l} · {ACCESS_LABEL[l]}
                    </option>
                  ))}
                </select>
                <Toggle
                  label="Own records only"
                  checked={!!draft.grants[m].own}
                  onChange={(v) => setDraft({ ...draft, grants: { ...draft.grants, [m]: { ...draft.grants[m], own: v } } })}
                />
              </div>
            ))}
          </div>
        )}
      </Modal>
    </>
  );
}

function PermissionCodes({ roles }: { roles: RoleRow[] }) {
  return (
    <TableSection title="Permission codes" subtitle="Fine-grained codes sit under module levels. Each API endpoint checks its code on the server." className="mt-6">
      <DataTable
        caption="Permission codes"
        rows={PERMISSION_CODES}
        rowKey={(p) => p.code}
        numbered={false}
        columns={[
          { key: "code", header: "Code", cell: (p) => <span className="font-mono text-xs">{p.code}</span> },
          { key: "label", header: "Allows", className: "min-w-44", cell: (p) => p.label },
          { key: "needs", header: "Needs", className: "whitespace-nowrap", cell: (p) => `${ACCESS_LABEL[p.level]} on ${MODULE_LABEL[p.module]}` },
          { key: "ep", header: "Endpoint", cell: (p) => <span className="font-mono text-xs whitespace-nowrap">{p.endpoint}</span> },
          {
            key: "roles",
            header: "Granted to",
            className: "min-w-56",
            cell: (p) => {
              const hits = roles.filter((r) => grantAllows(r.grants[p.module], p.level));
              return hits.length ? <span className="text-sm">{hits.map((r) => r.label.split(" (")[0]).join(", ")}</span> : <span className="text-muted-foreground">No role</span>;
            },
          },
        ]}
      />
    </TableSection>
  );
}

/** Calls an endpoint as a chosen user to show server-side enforcement (US-AD-02 AC#3, AC#5). */
function AuthTester({ roles, users }: { roles: RoleRow[]; users: User[] }) {
  const [userId, setUserId] = useState("U-04");
  const [code, setCode] = useState("pricelist.update");
  const [result, setResult] = useState<{ status: number; body: object } | null>(null);
  const [busy, setBusy] = useState(false);
  const send = () => {
    const u = users.find((x) => x.id === userId)!;
    const p = PERMISSION_CODES.find((x) => x.code === code)!;
    const r = roles.find((x) => x.key === u.role);
    const ok = u.status === "ACTIVE" && !!r && grantAllows(r.grants[p.module], p.level);
    setBusy(true);
    window.setTimeout(() => {
      setBusy(false);
      setResult(
        ok
          ? { status: 200, body: { ok: true, permission: p.code, scope: r!.grants[p.module].own ? "OWN_RECORDS" : "ALL" } }
          : {
              status: u.status === "ACTIVE" ? 403 : 401,
              body: {
                errorCode: u.status === "ACTIVE" ? "PERMISSION_DENIED" : "SESSION_REVOKED",
                errorClass: "AUTHORIZATION",
                message: u.status === "ACTIVE" ? `${p.code} is required for ${p.endpoint.split(" ")[0]} ${p.endpoint.split(" ")[1]}.` : "The user is deactivated; tokens are no longer valid.",
                retryable: false,
                correlationId: `c-${(Date.now() % 0xffffff).toString(16)}`,
                timestamp: `${NOW.replace(" ", "T")}:00Z`,
              },
            },
      );
    }, 350);
  };
  const p = PERMISSION_CODES.find((x) => x.code === code)!;
  return (
    <Card title="API authorisation tester" subtitle="Call an endpoint as another user to check the server refuses what their role can't do." className="mt-6">
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto] items-start">
        <Field label="Call as">
          <select className={inputCls} value={userId} onChange={(e) => setUserId(e.target.value)}>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name} · {roles.find((r) => r.key === u.role)?.label ?? u.role}
                {u.status !== "ACTIVE" ? ` (${humanize(u.status).toLowerCase()})` : ""}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Permission" hint={p.endpoint}>
          <select className={inputCls} value={code} onChange={(e) => setCode(e.target.value)}>
            {PERMISSION_CODES.map((x) => (
              <option key={x.code} value={x.code}>
                {x.code}
              </option>
            ))}
          </select>
        </Field>
        <Btn icon={Send} variant="outline" loading={busy} onClick={send} className="md:mt-[26px]">
          Send request
        </Btn>
      </div>
      {result && (
        <div className="mt-4" role="status">
          <Flag tone={result.status === 200 ? "success" : "danger"}>
            HTTP {result.status} {result.status === 200 ? "OK" : result.status === 403 ? "Forbidden" : "Unauthorized"}
          </Flag>
          <pre className="mt-2 bg-muted rounded-lg p-4 text-xs overflow-x-auto overflow-y-hidden">{JSON.stringify(result.body, null, 2)}</pre>
        </div>
      )}
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Session & password policy (US-AD-05, FR-I-06)                       */
/* ------------------------------------------------------------------ */

function PolicyTab({ editable }: { editable: boolean }) {
  const [saved, setSaved] = useState<SessionPolicy>(SESSION_POLICY);
  const [f, setF] = useState({ ...SESSION_POLICY, ipText: SESSION_POLICY.ipAllowlist.join("\n") });
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [testIp, setTestIp] = useState("82.14.77.201");
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

  const ips = f.ipText.split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  const badIp = ips.find((x) => !isIpOrCidr(x));
  const errs: Record<string, string> = {};
  if (!(f.idleTimeoutMinutes >= 5 && f.idleTimeoutMinutes <= 30)) errs["pol-idle"] = "Enter 5 to 30 minutes — corporate policy caps idle sessions at 30.";
  if (!(f.minLength >= 12 && f.minLength <= 64)) errs["pol-len"] = "Enter a length from 12 to 64 characters.";
  if (!(f.maxAgeDays >= 30 && f.maxAgeDays <= 365)) errs["pol-age"] = "Enter 30 to 365 days.";
  if (!(f.lockoutAttempts >= 3 && f.lockoutAttempts <= 10)) errs["pol-lock"] = "Enter 3 to 10 attempts.";
  if (badIp) errs["pol-ips"] = `“${badIp}” isn't a valid IPv4 address or CIDR range (e.g. 10.20.0.0/16).`;
  const fe = (k: string) => (submitted ? errs[k] : k === "pol-ips" ? errs[k] : undefined);
  const polHintId = useId();
  const ipHintId = useId();
  const polMissing = missingFields([
    ["Idle timeout", f.idleTimeoutMinutes],
    ["Minimum password length", f.minLength],
    ["Password maximum age", f.maxAgeDays],
    ["Lock after failed attempts", f.lockoutAttempts],
  ]);
  const ipMissing = missingFields([["Source IP", testIp]]);
  const dirty = JSON.stringify({ ...saved, ipText: saved.ipAllowlist.join("\n") }) !== JSON.stringify({ ...f, ipText: ips.join("\n") });

  const save = (e?: FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    const first = Object.keys(errs)[0];
    if (first) {
      document.getElementById(first)?.focus();
      return;
    }
    setConfirmOpen(true);
  };
  const commit = () => {
    setSaving(true);
    window.setTimeout(() => {
      const next = { ...f, ipAllowlist: ips };
      setSaved(next);
      setF({ ...next, ipText: ips.join("\n") });
      setSaving(false);
      setConfirmOpen(false);
      toast.success("Session and password policy saved", { description: "Applies to local (non-SSO) accounts in this tenant from their next request." });
    }, 450);
  };
  const tryLogin = () => {
    const ok = ipAllowed(testIp.trim(), saved.ipAllowlist);
    setTestResult(
      ok
        ? { ok, text: `Sign-in from ${testIp} allowed. Session ends after ${saved.idleTimeoutMinutes} minutes idle.` }
        : { ok, text: `Access denied — ${testIp} is not on the IP allowlist (AUTHORIZATION · IP_NOT_ALLOWED). The attempt is logged.` },
    );
  };
  const num = (k: keyof SessionPolicy) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value === "" ? NaN : Number(e.target.value) });

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr_1fr] items-start">
      <Card title="Policy for local accounts" subtitle={dirty ? "Unsaved changes" : "SSO users follow the identity provider's session and MFA rules."}>
        <form onSubmit={save} noValidate>
        <fieldset disabled={!editable} className="grid gap-4 md:grid-cols-2 disabled:opacity-80">
          <Field label="Idle timeout (minutes)" required error={fe("pol-idle")}>
            <input id="pol-idle" type="number" min={5} max={30} className={inputCls} value={Number.isNaN(f.idleTimeoutMinutes) ? "" : f.idleTimeoutMinutes} onChange={num("idleTimeoutMinutes")} />
          </Field>
          <Field label="Absolute session length (hours)">
            <input type="number" min={1} max={24} className={inputCls} value={Number.isNaN(f.absoluteTimeoutHours) ? "" : f.absoluteTimeoutHours} onChange={num("absoluteTimeoutHours")} />
          </Field>
          <Field label="Minimum password length" required error={fe("pol-len")}>
            <input id="pol-len" type="number" min={12} max={64} className={inputCls} value={Number.isNaN(f.minLength) ? "" : f.minLength} onChange={num("minLength")} />
          </Field>
          <Field label="Password maximum age (days)" required error={fe("pol-age")}>
            <input id="pol-age" type="number" min={30} max={365} className={inputCls} value={Number.isNaN(f.maxAgeDays) ? "" : f.maxAgeDays} onChange={num("maxAgeDays")} />
          </Field>
          <Field label="Lock after failed attempts" required error={fe("pol-lock")}>
            <input id="pol-lock" type="number" min={3} max={10} className={inputCls} value={Number.isNaN(f.lockoutAttempts) ? "" : f.lockoutAttempts} onChange={num("lockoutAttempts")} />
          </Field>
          <Field label="Password history (last n reused)">
            <input type="number" min={0} max={24} className={inputCls} value={Number.isNaN(f.historyCount) ? "" : f.historyCount} onChange={num("historyCount")} />
          </Field>
          <fieldset className="md:col-span-2 flex flex-wrap gap-6">
            <legend className="text-sm font-medium mb-2">Character rules</legend>
            <Toggle label="Upper and lower case" checked={f.requireMixedCase} onChange={(v) => setF({ ...f, requireMixedCase: v })} />
            <Toggle label="At least one number" checked={f.requireNumber} onChange={(v) => setF({ ...f, requireNumber: v })} />
            <Toggle label="At least one symbol" checked={f.requireSymbol} onChange={(v) => setF({ ...f, requireSymbol: v })} />
          </fieldset>
          <Field label="IP allowlist" className="md:col-span-2" error={fe("pol-ips")} hint="One IPv4 address or CIDR range per line. Local accounts can only sign in from these.">
            <textarea id="pol-ips" rows={4} className={`${inputCls} h-auto py-2 font-mono`} value={f.ipText} onChange={(e) => setF({ ...f, ipText: e.target.value })} />
          </Field>
          {editable && (
            <div className="md:col-span-2 flex flex-wrap justify-end gap-2">
              <MissingHint id={polHintId} missing={polMissing} />
              <Btn variant="subtle" disabled={!dirty} onClick={() => setF({ ...saved, ipText: saved.ipAllowlist.join("\n") })}>
                Cancel
              </Btn>
              <Btn type="submit" disabled={!dirty || polMissing.length > 0} aria-describedby={polMissing.length ? polHintId : undefined}>
                Save policy
              </Btn>
            </div>
          )}
        </fieldset>
        </form>
      </Card>

      <div className="grid gap-6">
        <Card title="Sign-in simulator" subtitle="Try a local-account sign-in from an IP address.">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              tryLogin();
            }}
            className="grid gap-3"
          >
            <Field label="Source IP" required>
              <input className={`${inputCls} font-mono`} value={testIp} onChange={(e) => setTestIp(e.target.value)} />
            </Field>
            <div className="flex flex-wrap items-center gap-3">
              <MissingHint id={ipHintId} missing={ipMissing} />
              <Btn type="submit" variant="outline" icon={KeyRound} disabled={ipMissing.length > 0} aria-describedby={ipMissing.length ? ipHintId : undefined}>
                Try sign-in
              </Btn>
            </div>
          </form>
          {testResult && (
            <div className="mt-3" role="status">
              <InfoBanner tone={testResult.ok ? "success" : "danger"} className="">
                {testResult.text}
              </InfoBanner>
            </div>
          )}
        </Card>
        <Card title="Approved local accounts" subtitle="Break-glass only; every one has an approver." padded={false}>
          <ul className="divide-y divide-border">
            {LOCAL_ACCOUNTS.map((a) => (
              <li key={a.id} className="px-5 py-4 text-sm">
                <div className="font-mono">{a.login}</div>
                <div className="text-muted-foreground text-xs mt-1">
                  Owner {USERS.find((u) => u.id === a.owner)?.name} · approved by {USERS.find((u) => u.id === a.approvedBy)?.name} on {a.approvedAt} · last sign-in {a.lastLogin}
                </div>
              </li>
            ))}
          </ul>
        </Card>
        <InfoBanner tone="neutral" title="Why this matters" className="">
          Idle sessions and leavers' accounts are common ways in. These limits apply per tenant and every change is audited.
        </InfoBanner>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Save the session and password policy?"
        description={`Local accounts will time out after ${f.idleTimeoutMinutes} idle minutes and can only sign in from ${ips.length} allowlisted ${ips.length === 1 ? "address" : "addresses"}. Signed-in local users outside the allowlist are signed out.`}
        confirmLabel="Save policy"
        loading={saving}
        onConfirm={commit}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
