/**
 * Who is signed in, what their role may do (SRS Appendix C, US-AD-02) and which sensitive
 * fields they may see (US-AD-03). The prototype lets you "view as" any seeded user so
 * role-based behaviour (hidden cost, own-records scope, approver authority) can be demonstrated.
 */
import { useSyncExternalStore } from "react";

/* ---------------- Roles & RBAC (Appendix C) ---------------- */

export const ROLES = [
  "PRICING_ADMIN",
  "SALES_REP",
  "SALES_MANAGER",
  "DEAL_DESK",
  "FINANCE_CONTROLLER",
  "CHANNEL_PARTNER",
  "IT_ADMIN",
  "EXECUTIVE",
] as const;
export type Role = (typeof ROLES)[number];

export const ROLE_LABEL: Record<Role, string> = {
  PRICING_ADMIN: "Pricing Administrator",
  SALES_REP: "Sales Representative",
  SALES_MANAGER: "Sales Manager / VP (Approver)",
  DEAL_DESK: "Deal Desk / Finance Approver",
  FINANCE_CONTROLLER: "Finance Controller (Viewer)",
  CHANNEL_PARTNER: "Channel Partner (Portal User)",
  IT_ADMIN: "IT Administrator",
  EXECUTIVE: "Executive / Analytics Viewer",
};

export const MODULES = [
  "MASTER_DATA",
  "STRATEGY",
  "OPTIMIZATION",
  "CPQ",
  "DEAL_DESK",
  "REBATE_NINJA",
  "ANALYTICS",
  "SYSTEM_ADMIN",
  "AUDIT_LOGS",
] as const;
export type Module = (typeof MODULES)[number];

export const MODULE_LABEL: Record<Module, string> = {
  MASTER_DATA: "Master Data & Price Lists",
  STRATEGY: "Strategy & Segmentation",
  OPTIMIZATION: "Price Optimization / AI",
  CPQ: "CPQ & Quoting",
  DEAL_DESK: "Deal Desk",
  REBATE_NINJA: "Rebate Ninja",
  ANALYTICS: "Analytics & Reporting",
  SYSTEM_ADMIN: "System / RBAC Admin",
  AUDIT_LOGS: "Audit Logs",
};

/** N none · V view · E edit · A approve · F full. Order matters: a higher level includes the lower ones (A ⊃ V, F ⊃ all). */
export const ACCESS_LEVELS = ["N", "V", "E", "A", "F"] as const;
export type AccessLevel = (typeof ACCESS_LEVELS)[number];
export const ACCESS_LABEL: Record<AccessLevel, string> = { N: "No access", V: "View", E: "Edit", A: "Approve", F: "Full" };

export type Grant = { level: AccessLevel; /** "*" in Appendix C — scoped to the user's own records. */ own?: boolean };
export type RoleDef = { key: string; label: string; seeded: boolean; grants: Record<Module, Grant> };

const g = (level: AccessLevel, own = false): Grant => ({ level, own });
const row = (...grants: Grant[]) => Object.fromEntries(MODULES.map((m, i) => [m, grants[i]])) as Record<Module, Grant>;

/** Seeded exactly from SRS Appendix C. */
export const RBAC_MATRIX: Record<Role, Record<Module, Grant>> = {
  PRICING_ADMIN: row(g("F"), g("F"), g("E"), g("V"), g("V"), g("F"), g("F"), g("V"), g("V")),
  SALES_REP: row(g("V"), g("V"), g("V"), g("F", true), g("N"), g("N"), g("V", true), g("N"), g("N")),
  SALES_MANAGER: row(g("V"), g("V"), g("V"), g("V"), g("A"), g("N"), g("V", true), g("N"), g("N")),
  DEAL_DESK: row(g("V"), g("E"), g("V"), g("V"), g("A"), g("V"), g("V"), g("N"), g("V")),
  FINANCE_CONTROLLER: row(g("V"), g("V"), g("V"), g("V"), g("V"), g("V"), g("V"), g("N"), g("V")),
  CHANNEL_PARTNER: row(g("N"), g("N"), g("N"), g("E", true), g("N"), g("V", true), g("N"), g("N"), g("N")),
  IT_ADMIN: row(g("V"), g("N"), g("N"), g("N"), g("N"), g("N"), g("V"), g("F"), g("F")),
  EXECUTIVE: row(g("N"), g("N"), g("V"), g("N"), g("N"), g("N"), g("V"), g("N"), g("N")),
};

const rank = (l: AccessLevel) => ACCESS_LEVELS.indexOf(l);

/** True when `role` holds at least `need` on `module`. Approve (A) does not imply Edit (E). */
export function can(role: Role, module: Module, need: AccessLevel = "V"): boolean {
  const have = RBAC_MATRIX[role][module].level;
  if (need === "N") return true;
  if (have === "F") return true;
  if (need === "F") return false;
  if (need === "E") return have === "E";
  if (need === "A") return have === "A";
  return rank(have) >= rank("V");
}
export const isOwnScoped = (role: Role, module: Module) => !!RBAC_MATRIX[role][module].own;

/* ---------------- Field-level security (US-AD-03) ---------------- */

export const CLASSIFICATIONS = ["PUBLIC", "INTERNAL", "CONFIDENTIAL", "RESTRICTED"] as const;
export const MASK_MODES = ["HIDE", "MASK", "ROUND"] as const;
export type MaskMode = (typeof MASK_MODES)[number];
export const FLS_CHANNELS = ["UI", "API", "EXPORT", "NOTIFICATION", "REPORT", "AUDIT_VIEW"] as const;

export type SecureField = "costPrice" | "marginAmount" | "marginPct" | "priceFloor" | "competitorPrice" | "rebateRate" | "dealValue";
export type FieldPolicy = {
  field: SecureField;
  label: string;
  classification: (typeof CLASSIFICATIONS)[number];
  /** Roles that see the real value. Everyone else gets `mask`. */
  allowed: Role[];
  mask: MaskMode;
  /** Roles that get ROUND instead of `mask` (shown as a band). */
  rounded?: Role[];
  derivedFrom?: SecureField;
  /** Derived field explicitly opened wider than its source (US-AD-03: "unless explicitly opened"). */
  openedFor?: Role[];
  channels: Array<(typeof FLS_CHANNELS)[number]>;
};

const PRICING_FINANCE: Role[] = ["PRICING_ADMIN", "DEAL_DESK", "FINANCE_CONTROLLER"];

export const FIELD_POLICIES: FieldPolicy[] = [
  { field: "costPrice", label: "Cost price", classification: "RESTRICTED", allowed: PRICING_FINANCE, mask: "HIDE", channels: [...FLS_CHANNELS] },
  { field: "marginAmount", label: "Margin amount", classification: "RESTRICTED", allowed: PRICING_FINANCE, mask: "HIDE", derivedFrom: "costPrice", channels: [...FLS_CHANNELS] },
  { field: "marginPct", label: "Margin %", classification: "RESTRICTED", allowed: PRICING_FINANCE, mask: "HIDE", derivedFrom: "costPrice", openedFor: ["SALES_MANAGER"], rounded: ["EXECUTIVE"], channels: [...FLS_CHANNELS] },
  { field: "priceFloor", label: "Price floor", classification: "CONFIDENTIAL", allowed: [...PRICING_FINANCE, "SALES_MANAGER"], mask: "MASK", channels: [...FLS_CHANNELS] },
  { field: "competitorPrice", label: "Competitor price", classification: "RESTRICTED", allowed: PRICING_FINANCE, mask: "HIDE", channels: [...FLS_CHANNELS] },
  { field: "rebateRate", label: "Rebate rate", classification: "RESTRICTED", allowed: ["PRICING_ADMIN", "FINANCE_CONTROLLER", "DEAL_DESK"], mask: "HIDE", channels: [...FLS_CHANNELS] },
  { field: "dealValue", label: "Deal value", classification: "INTERNAL", allowed: ["PRICING_ADMIN", "SALES_REP", "SALES_MANAGER", "DEAL_DESK", "FINANCE_CONTROLLER", "EXECUTIVE"], mask: "HIDE", channels: [...FLS_CHANNELS] },
];

/** "SHOW" or the mask to apply for this role. */
export function fieldAccess(role: Role, field: SecureField): "SHOW" | MaskMode {
  const p = FIELD_POLICIES.find((x) => x.field === field);
  if (!p) return "SHOW";
  if (p.allowed.includes(role) || p.openedFor?.includes(role)) return "SHOW";
  if (p.rounded?.includes(role)) return "ROUND";
  return p.mask;
}
export const canSee = (role: Role, field: SecureField) => fieldAccess(role, field) === "SHOW";

/* ---------------- Users ---------------- */

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  /** Job title used by the approval matrix (e.g. "Sales VP", "CFO"). */
  title: string;
  managerId?: string;
  region: string;
  /** Highest discount % this approver may grant (US-DD-07 AC#4). */
  approvalAuthorityPct?: number;
  /** Channel partner account this portal user belongs to (customer id). */
  partnerId?: string;
  status: "ACTIVE" | "INACTIVE" | "LOCKED" | "DEACTIVATED";
  sso: boolean;
  idpGroups: string[];
  lastLogin: string;
};

export const USERS: User[] = [
  { id: "U-01", name: "Riya Shah", email: "riya.shah@aimdek.com", role: "PRICING_ADMIN", title: "Pricing Administrator", managerId: "U-02", region: "UK", status: "ACTIVE", sso: true, idpGroups: ["rn-pricing-admin"], lastLogin: "2026-10-29 08:41" },
  { id: "U-02", name: "Priya Nair", email: "priya.nair@aimdek.com", role: "PRICING_ADMIN", title: "Pricing Manager", managerId: "U-09", region: "UK", status: "ACTIVE", sso: true, idpGroups: ["rn-pricing-admin"], lastLogin: "2026-10-29 09:02" },
  { id: "U-03", name: "Tom Hale", email: "tom.hale@aimdek.com", role: "PRICING_ADMIN", title: "Pricing Analyst", managerId: "U-02", region: "UK", status: "ACTIVE", sso: true, idpGroups: ["rn-pricing-admin"], lastLogin: "2026-10-28 17:20" },
  { id: "U-04", name: "Sam Carter", email: "sam.carter@aimdek.com", role: "SALES_REP", title: "Account Executive", managerId: "U-05", region: "UK", status: "ACTIVE", sso: true, idpGroups: ["rn-sales"], lastLogin: "2026-10-29 10:15" },
  { id: "U-16", name: "Jordan Lee", email: "jordan.lee@aimdek.com", role: "SALES_REP", title: "Account Executive", managerId: "U-05", region: "India", status: "ACTIVE", sso: true, idpGroups: ["rn-sales"], lastLogin: "2026-10-29 07:55" },
  { id: "U-05", name: "Maya Iyer", email: "maya.iyer@aimdek.com", role: "SALES_MANAGER", title: "Sales Manager", managerId: "U-06", region: "UK", approvalAuthorityPct: 20, status: "ACTIVE", sso: true, idpGroups: ["rn-sales-approver"], lastLogin: "2026-10-29 08:30" },
  { id: "U-06", name: "Daniel Brooks", email: "daniel.brooks@aimdek.com", role: "SALES_MANAGER", title: "Sales VP", managerId: "U-09", region: "UK", approvalAuthorityPct: 30, status: "ACTIVE", sso: true, idpGroups: ["rn-sales-approver"], lastLogin: "2026-10-28 19:04" },
  { id: "U-07", name: "Neel Kamat", email: "neel.kamat@aimdek.com", role: "SALES_MANAGER", title: "Regional VP", managerId: "U-09", region: "North America", approvalAuthorityPct: 30, status: "ACTIVE", sso: true, idpGroups: ["rn-sales-approver"], lastLogin: "2026-10-29 06:12" },
  { id: "U-08", name: "Fatima Khan", email: "fatima.khan@aimdek.com", role: "DEAL_DESK", title: "Deal Desk Analyst", managerId: "U-10", region: "UK", approvalAuthorityPct: 25, status: "ACTIVE", sso: true, idpGroups: ["rn-deal-desk"], lastLogin: "2026-10-29 09:48" },
  { id: "U-11", name: "Arjun Mehta", email: "arjun.mehta@aimdek.com", role: "DEAL_DESK", title: "CCO delegate", managerId: "U-09", region: "UK", approvalAuthorityPct: 40, status: "ACTIVE", sso: true, idpGroups: ["rn-deal-desk"], lastLogin: "2026-10-27 15:30" },
  { id: "U-09", name: "Oliver Grant", email: "oliver.grant@aimdek.com", role: "DEAL_DESK", title: "CFO", region: "UK", approvalAuthorityPct: 100, status: "ACTIVE", sso: true, idpGroups: ["rn-deal-desk", "rn-exec"], lastLogin: "2026-10-26 11:00" },
  { id: "U-10", name: "Grace Liu", email: "grace.liu@aimdek.com", role: "FINANCE_CONTROLLER", title: "Finance Controller", managerId: "U-09", region: "UK", status: "ACTIVE", sso: true, idpGroups: ["rn-finance"], lastLogin: "2026-10-29 08:05" },
  { id: "U-12", name: "Lena Fischer", email: "lena.fischer@awebb.co.uk", role: "CHANNEL_PARTNER", title: "Partner buyer", region: "UK", partnerId: "878075", status: "ACTIVE", sso: true, idpGroups: ["rn-partner-gold"], lastLogin: "2026-10-28 13:40" },
  { id: "U-13", name: "Kai Morgan", email: "kai.morgan@urbanelectricals.co.uk", role: "CHANNEL_PARTNER", title: "Partner buyer", region: "UK", partnerId: "135991", status: "ACTIVE", sso: true, idpGroups: ["rn-partner-silver"], lastLogin: "2026-10-29 10:02" },
  { id: "U-14", name: "Ben Ortiz", email: "ben.ortiz@aimdek.com", role: "IT_ADMIN", title: "IT Administrator", region: "UK", status: "ACTIVE", sso: true, idpGroups: ["rn-it-admin"], lastLogin: "2026-10-29 07:30" },
  { id: "U-15", name: "Clara Wu", email: "clara.wu@aimdek.com", role: "EXECUTIVE", title: "Chief Commercial Officer", region: "UK", status: "ACTIVE", sso: true, idpGroups: ["rn-exec"], lastLogin: "2026-10-25 18:10" },
  { id: "U-17", name: "Mark Ellis", email: "mark.ellis@aimdek.com", role: "SALES_REP", title: "Account Executive", managerId: "U-05", region: "UK", status: "DEACTIVATED", sso: true, idpGroups: [], lastLogin: "2026-09-30 16:44" },
];

export const userById = (id?: string) => USERS.find((u) => u.id === id);
export const userName = (id?: string) => userById(id)?.name ?? id ?? "—";
/** First active user holding a job title — how the approval matrix resolves "Sales VP" etc. */
export const userByTitle = (title: string) => USERS.find((u) => u.title === title && u.status === "ACTIVE");

/** Partner tiers and their discount limit without approval (US-CQ-05). */
export const PARTNER_TIERS: Record<string, { tier: "Gold" | "Silver" | "Bronze"; discountLimitPct: number }> = {
  "878075": { tier: "Gold", discountLimitPct: 15 },
  "135991": { tier: "Silver", discountLimitPct: 10 },
};

/* ---------------- Current session ("view as") ---------------- */

const KEY = "rn.persona";
const DEFAULT_USER = "U-01";
const listeners = new Set<() => void>();
let current = DEFAULT_USER;
let loaded = false;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const v = localStorage.getItem(KEY);
    if (v && userById(v)) current = v;
  } catch {
    /* storage unavailable */
  }
}

export function setPersona(id: string) {
  if (!userById(id)) return;
  current = id;
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable */
  }
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  load();
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The signed-in (or "viewed as") user. Server render always uses the default user, then hydrates to the stored choice. */
export function useSession() {
  const id = useSyncExternalStore(
    subscribe,
    () => {
      load();
      return current;
    },
    () => DEFAULT_USER,
  );
  const user = userById(id)!;
  return {
    user,
    role: user.role,
    can: (module: Module, need: AccessLevel = "V") => can(user.role, module, need),
    own: (module: Module) => isOwnScoped(user.role, module),
    sees: (field: SecureField) => canSee(user.role, field),
    access: (field: SecureField) => fieldAccess(user.role, field),
  };
}
