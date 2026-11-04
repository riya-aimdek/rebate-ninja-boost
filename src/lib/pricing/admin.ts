/**
 * Administration data (Epic 10): identity provider config, sessions, permission codes,
 * integrations, events, error catalogue and service accounts. Seeds for the prototype.
 */
import type { Module, Role } from "@/lib/pricing/session";

/* ---------------- Permission codes (US-AD-02) ---------------- */

/** Fine-grained codes sit under a module and need at least `level` on it. */
export const PERMISSION_CODES: Array<{ code: string; module: Module; level: "V" | "E" | "A" | "F"; label: string; endpoint: string }> = [
  { code: "pricelist.read", module: "MASTER_DATA", level: "V", label: "View price lists", endpoint: "GET /api/v1/price-lists/{id}" },
  { code: "pricelist.update", module: "MASTER_DATA", level: "F", label: "Update price list lines", endpoint: "PATCH /api/v1/price-lists/{id}/lines" },
  { code: "pricelist.approve", module: "MASTER_DATA", level: "F", label: "Approve price lists", endpoint: "POST /api/v1/price-lists/{id}/approve" },
  { code: "rule.update", module: "STRATEGY", level: "E", label: "Edit pricing rules", endpoint: "PUT /api/v1/rules/{id}" },
  { code: "recommendation.decide", module: "OPTIMIZATION", level: "E", label: "Accept or reject recommendations", endpoint: "POST /api/v1/recommendations/{id}/decision" },
  { code: "quote.create", module: "CPQ", level: "E", label: "Create quotes", endpoint: "POST /api/v1/quotes" },
  { code: "quote.approve", module: "DEAL_DESK", level: "A", label: "Approve quotes and exceptions", endpoint: "POST /api/v1/approvals/{id}/approve" },
  { code: "analytics.export", module: "ANALYTICS", level: "V", label: "Export datasets", endpoint: "GET /api/v1/datasets/{name}" },
  { code: "rbac.manage", module: "SYSTEM_ADMIN", level: "F", label: "Manage roles and users", endpoint: "PUT /api/v1/roles/{id}" },
  { code: "audit.read", module: "AUDIT_LOGS", level: "V", label: "Search the audit log", endpoint: "GET /api/v1/audit" },
];

/* ---------------- Sessions & deprovisioning (US-AD-05) ---------------- */

export const DEPROVISION_SLA_MINUTES = 15;

export type UserSession = { id: string; userId: string; device: string; ip: string; startedAt: string; lastSeen: string };
export const SESSIONS: UserSession[] = [
  { id: "S-9101", userId: "U-04", device: "Chrome 130 · Windows", ip: "10.20.4.18", startedAt: "2026-10-29 08:02", lastSeen: "2026-10-29 14:21" },
  { id: "S-9102", userId: "U-04", device: "Salesforce mobile · iOS", ip: "82.14.77.201", startedAt: "2026-10-29 10:15", lastSeen: "2026-10-29 13:58" },
  { id: "S-9103", userId: "U-16", device: "Edge 130 · Windows", ip: "10.40.1.9", startedAt: "2026-10-29 07:55", lastSeen: "2026-10-29 14:10" },
  { id: "S-9104", userId: "U-05", device: "Chrome 130 · macOS", ip: "10.20.6.40", startedAt: "2026-10-29 08:30", lastSeen: "2026-10-29 14:25" },
  { id: "S-9105", userId: "U-01", device: "Chrome 130 · Windows", ip: "10.20.4.2", startedAt: "2026-10-29 08:41", lastSeen: "2026-10-29 14:29" },
];
export const API_TOKENS = [
  { id: "TOK-51", userId: "U-04", label: "Excel add-in", issuedAt: "2026-10-01 09:00", expiresAt: "2026-12-31" },
  { id: "TOK-52", userId: "U-16", label: "Excel add-in", issuedAt: "2026-09-12 10:00", expiresAt: "2026-12-12" },
];

export type LifecycleEvent = { id: string; at: string; userId: string; action: string; by: string; source: string; detail: string };
export const LIFECYCLE_EVENTS: LifecycleEvent[] = [
  { id: "LC-301", at: "2026-09-30 17:02", userId: "U-17", action: "DEACTIVATED", by: "Okta SCIM", source: "SCIM", detail: "2 sessions ended and 1 API token revoked in 4 min. 3 open quotes reassigned to Sam Carter." },
  { id: "LC-298", at: "2026-09-02 08:10", userId: "U-16", action: "PROVISIONED", by: "Azure AD (JIT)", source: "SSO", detail: "First sign-in; group rn-sales → Sales Representative." },
];

export type SessionPolicy = {
  idleTimeoutMinutes: number;
  absoluteTimeoutHours: number;
  ipAllowlist: string[];
  minLength: number;
  requireMixedCase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
  maxAgeDays: number;
  lockoutAttempts: number;
  historyCount: number;
};
export const SESSION_POLICY: SessionPolicy = {
  idleTimeoutMinutes: 30,
  absoluteTimeoutHours: 12,
  ipAllowlist: ["10.20.0.0/16", "10.40.0.0/16", "203.0.113.10"],
  minLength: 14,
  requireMixedCase: true,
  requireNumber: true,
  requireSymbol: true,
  maxAgeDays: 90,
  lockoutAttempts: 5,
  historyCount: 12,
};
/** Approved local (non-SSO) accounts — break-glass only. */
export const LOCAL_ACCOUNTS = [{ id: "LA-1", login: "breakglass.admin", owner: "U-14", approvedBy: "U-09", approvedAt: "2026-02-01", lastLogin: "2026-08-14 22:10" }];

/** Is `ip` covered by an allowlist entry (exact IP or IPv4 CIDR)? */
export function ipAllowed(ip: string, list: string[]) {
  const toNum = (s: string) => s.split(".").reduce((a, o) => (a << 8) + (Number(o) & 255), 0) >>> 0;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false;
  return list.some((entry) => {
    const [base, bits] = entry.split("/");
    if (!bits) return base === ip;
    const mask = Number(bits) === 0 ? 0 : (~0 << (32 - Number(bits))) >>> 0;
    return (toNum(ip) & mask) === (toNum(base) & mask);
  });
}
export const isIpOrCidr = (s: string) => /^\d{1,3}(\.\d{1,3}){3}(\/([0-9]|[12][0-9]|3[0-2]))?$/.test(s.trim()) && s.split("/")[0].split(".").every((o) => Number(o) <= 255);

/* ---------------- SSO (US-AD-01) ---------------- */

export const ENVIRONMENTS = ["dev", "test", "prod"] as const;
export type Env = (typeof ENVIRONMENTS)[number];
export type IdpConfig = {
  env: Env;
  provider: "Azure AD" | "Okta";
  protocol: "SAML 2.0" | "OIDC";
  issuer: string;
  /** OIDC client id or SAML entity id. */
  clientId: string;
  metadataUrl: string;
  /** Vault reference only — the secret itself is never shown after saving. */
  secretRef?: string;
  secretUpdatedAt?: string;
  mfaEnforced: boolean;
  jitProvisioning: boolean;
  enabled: boolean;
  lastTest?: { at: string; ok: boolean; detail: string };
};
export const IDP_CONFIGS: IdpConfig[] = [
  { env: "prod", provider: "Azure AD", protocol: "OIDC", issuer: "https://login.microsoftonline.com/7f1c…/v2.0", clientId: "rn-pricing-prod", metadataUrl: "https://login.microsoftonline.com/7f1c…/v2.0/.well-known/openid-configuration", secretRef: "vault://kv/rn/prod/oidc-client-secret", secretUpdatedAt: "2026-08-01 10:00", mfaEnforced: true, jitProvisioning: true, enabled: true, lastTest: { at: "2026-10-20 09:14", ok: true, detail: "Signed in as test.user@aimdek.com · groups, email, name returned" } },
  { env: "test", provider: "Okta", protocol: "SAML 2.0", issuer: "http://www.okta.com/exk9a…", clientId: "urn:rebate-ninja:pricing:test", metadataUrl: "https://aimdek.okta.com/app/exk9a…/sso/saml/metadata", secretRef: "vault://kv/rn/test/saml-signing-cert", secretUpdatedAt: "2026-05-11 14:20", mfaEnforced: true, jitProvisioning: true, enabled: true, lastTest: { at: "2026-10-27 16:02", ok: false, detail: "Missing attribute: groups (add the groups claim to the SAML assertion)" } },
  { env: "dev", provider: "Azure AD", protocol: "OIDC", issuer: "https://login.microsoftonline.com/0a2d…/v2.0", clientId: "rn-pricing-dev", metadataUrl: "https://login.microsoftonline.com/0a2d…/v2.0/.well-known/openid-configuration", mfaEnforced: true, jitProvisioning: true, enabled: false },
];
export const GROUP_MAPPINGS: Array<{ group: string; role: Role }> = [
  { group: "rn-pricing-admin", role: "PRICING_ADMIN" },
  { group: "rn-sales", role: "SALES_REP" },
  { group: "rn-sales-approver", role: "SALES_MANAGER" },
  { group: "rn-deal-desk", role: "DEAL_DESK" },
  { group: "rn-finance", role: "FINANCE_CONTROLLER" },
  { group: "rn-partner-gold", role: "CHANNEL_PARTNER" },
  { group: "rn-partner-silver", role: "CHANNEL_PARTNER" },
  { group: "rn-it-admin", role: "IT_ADMIN" },
  { group: "rn-exec", role: "EXECUTIVE" },
];
export const TOKEN_CHECKS = ["Issuer matches the configured IdP", "Audience is this application", "Signature verified against IdP keys", "Token not expired (60 s clock skew)", "Nonce matches the sign-in request"];
export const SIGN_IN_LOG = [
  { at: "2026-10-29 10:15", user: "sam.carter@aimdek.com", groups: "rn-sales", result: "ALLOWED", detail: "Role: Sales Representative · MFA by IdP" },
  { at: "2026-10-29 09:58", user: "contractor.temp@aimdek.com", groups: "—", result: "DENIED", detail: "No mapped IdP group — access denied (deny by default)" },
  { at: "2026-10-29 08:41", user: "riya.shah@aimdek.com", groups: "rn-pricing-admin", result: "ALLOWED", detail: "Role: Pricing Administrator · MFA by IdP" },
  { at: "2026-10-28 22:03", user: "kai.morgan@urbanelectricals.co.uk", groups: "rn-partner-silver", result: "ALLOWED", detail: "Federated partner identity · Channel Partner" },
];

/* ---------------- Integrations & events (US-AD-06) ---------------- */

export const INTEGRATION_TYPES = ["ERP", "CRM", "BI", "EVENT_BUS", "REBATE_NINJA", "NOTIFICATION"] as const;
export const INTEGRATION_STATUSES = ["HEALTHY", "DEGRADED", "FAILED", "DISABLED"] as const;
export type IntegrationStatus = (typeof INTEGRATION_STATUSES)[number];
export type Integration = {
  id: string;
  name: string;
  type: (typeof INTEGRATION_TYPES)[number];
  mode: "REALTIME" | "BATCH" | "EVENT";
  direction: "INBOUND" | "OUTBOUND" | "BIDIRECTIONAL";
  status: IntegrationStatus;
  lastRun: string;
  processed: number;
  failed: number;
  lastError?: string;
  serviceAccount: string;
  version: string;
  lastSyncAt: string;
  isLatest: boolean;
};
export const INTEGRATIONS: Integration[] = [
  { id: "INT-01", name: "SAP ERP · master data (nightly)", type: "ERP", mode: "BATCH", direction: "INBOUND", status: "DEGRADED", lastRun: "2026-10-29 03:12", processed: 710, failed: 10, lastError: "10 products rejected — MISSING_UOM (see data quality log)", serviceAccount: "svc-sap-master", version: "2026.10.29-0312", lastSyncAt: "2026-10-29 03:12", isLatest: true },
  { id: "INT-02", name: "SAP ERP · orders & pricing conditions", type: "ERP", mode: "REALTIME", direction: "BIDIRECTIONAL", status: "DEGRADED", lastRun: "2026-10-29 13:58", processed: 1_204, failed: 2, lastError: "ERP_TIMEOUT on Q-10238 (retrying) · CUSTOMER_NOT_IN_ERP on Q-10237", serviceAccount: "svc-sap-orders", version: "v412", lastSyncAt: "2026-10-29 13:58", isLatest: false },
  { id: "INT-03", name: "Salesforce CRM · accounts & opportunities", type: "CRM", mode: "REALTIME", direction: "BIDIRECTIONAL", status: "HEALTHY", lastRun: "2026-10-29 14:25", processed: 3_880, failed: 0, serviceAccount: "svc-salesforce", version: "v2291", lastSyncAt: "2026-10-29 14:25", isLatest: true },
  { id: "INT-04", name: "Kafka · cost & price events", type: "EVENT_BUS", mode: "EVENT", direction: "BIDIRECTIONAL", status: "HEALTHY", lastRun: "2026-10-29 14:29", processed: 18_420, failed: 3, lastError: "1 event in dead-letter queue", serviceAccount: "svc-kafka", version: "offset 99812", lastSyncAt: "2026-10-29 14:29", isLatest: true },
  { id: "INT-05", name: "Snowflake · BI datasets", type: "BI", mode: "BATCH", direction: "OUTBOUND", status: "HEALTHY", lastRun: "2026-10-29 14:20", processed: 96_000, failed: 0, serviceAccount: "svc-bi-export", version: "2026.10.29-1420", lastSyncAt: "2026-10-29 14:20", isLatest: true },
  { id: "INT-06", name: "Rebate Ninja · accruals & claims", type: "REBATE_NINJA", mode: "REALTIME", direction: "BIDIRECTIONAL", status: "FAILED", lastRun: "2026-10-29 11:00", processed: 0, failed: 1, lastError: "DOWNSTREAM_REJECTION 401 — credential K-RN-1 revoked; rotate to the new credential", serviceAccount: "svc-rebate-ninja", version: "v88", lastSyncAt: "2026-10-28 23:00", isLatest: false },
  { id: "INT-07", name: "Teams / email notifications", type: "NOTIFICATION", mode: "EVENT", direction: "OUTBOUND", status: "DEGRADED", lastRun: "2026-10-29 13:30", processed: 212, failed: 1, lastError: "Teams webhook returned 410 Gone (channel archived)", serviceAccount: "svc-notify", version: "—", lastSyncAt: "2026-10-29 13:30", isLatest: true },
  { id: "INT-08", name: "Oracle ERP (EU) · master data", type: "ERP", mode: "BATCH", direction: "INBOUND", status: "DISABLED", lastRun: "2026-06-30 02:00", processed: 0, failed: 0, serviceAccount: "svc-oracle-eu", version: "—", lastSyncAt: "2026-06-30 02:00", isLatest: false },
];

export type BusEvent = {
  id: string;
  at: string;
  topic: string;
  style: "CHANGE_NOTIFICATION" | "DATA_MESSAGE";
  entityType: string;
  changeType: "CREATE" | "UPDATE" | "DELETE";
  key: string;
  status: "PROCESSED" | "RETRYING" | "DEAD_LETTER" | "DUPLICATE_IGNORED";
  attempts: number;
  latencyMs?: number;
  signature: "HMAC verified" | "Kafka (mTLS)";
  correlationId: string;
  error?: string;
};
export const MAX_EVENT_ATTEMPTS = 5;
export const EVENTS: BusEvent[] = [
  { id: "EVT-90121", at: "2026-10-29 14:29", topic: "cost.changed", style: "CHANGE_NOTIFICATION", entityType: "Cost", changeType: "UPDATE", key: "A-100/UK01/STANDARD", status: "PROCESSED", attempts: 1, latencyMs: 640, signature: "Kafka (mTLS)", correlationId: "c-91f0aa" },
  { id: "EVT-90120", at: "2026-10-29 14:12", topic: "price.updated", style: "DATA_MESSAGE", entityType: "PriceLine", changeType: "UPDATE", key: "BL-001/L1", status: "PROCESSED", attempts: 1, latencyMs: 410, signature: "Kafka (mTLS)", correlationId: "c-91ab01" },
  { id: "EVT-90117", at: "2026-10-29 13:40", topic: "crm.opportunity", style: "CHANGE_NOTIFICATION", entityType: "Opportunity", changeType: "UPDATE", key: "OPP-7", status: "PROCESSED", attempts: 1, latencyMs: 820, signature: "HMAC verified", correlationId: "c-7a1e09" },
  { id: "EVT-90116", at: "2026-10-29 13:40", topic: "crm.opportunity", style: "CHANGE_NOTIFICATION", entityType: "Opportunity", changeType: "UPDATE", key: "OPP-7", status: "DUPLICATE_IGNORED", attempts: 1, signature: "HMAC verified", correlationId: "c-7a1e09" },
  { id: "EVT-90102", at: "2026-10-29 11:02", topic: "rebate.accrual", style: "DATA_MESSAGE", entityType: "Accrual", changeType: "CREATE", key: "ACR-2026-10-878070", status: "DEAD_LETTER", attempts: 5, signature: "HMAC verified", correlationId: "c-55e1d2", error: "DOWNSTREAM_REJECTION 401 Unauthorized after 5 attempts" },
  { id: "EVT-90099", at: "2026-10-29 10:48", topic: "cost.changed", style: "CHANGE_NOTIFICATION", entityType: "Cost", changeType: "UPDATE", key: "CB-2.5/UK02/LAST_PURCHASE", status: "RETRYING", attempts: 2, signature: "Kafka (mTLS)", correlationId: "c-30d9b4", error: "TRANSIENT_TECHNICAL — cost service busy (429), retry in 2 min" },
];

/* ---------------- Error handling (US-AD-07) ---------------- */

export const ERROR_CLASSES: Array<{ cls: string; retry: string; retryable: boolean | "depends"; example: string }> = [
  { cls: "VALIDATION", retry: "No — fix the input", retryable: false, example: "VALIDATION_REQUIRED · field effectiveFrom" },
  { cls: "AUTHORIZATION", retry: "No", retryable: false, example: "PERMISSION_DENIED · pricelist.update" },
  { cls: "BUSINESS_RULE", retry: "No, unless state changes", retryable: false, example: "CUSTOMER_NOT_IN_ERP" },
  { cls: "TRANSIENT_TECHNICAL", retry: "Yes, with back-off", retryable: true, example: "ERP_TIMEOUT" },
  { cls: "PERMANENT_TECHNICAL", retry: "No", retryable: false, example: "SCHEMA_MISMATCH" },
  { cls: "DOWNSTREAM_REJECTION", retry: "Depends on downstream code", retryable: "depends", example: "SAP 409 duplicate order · Rebate Ninja 401" },
];

/** One request's correlation ID followed through the platform and the ERP integration (AC#2). */
export const CORRELATION_TRACE = [
  { at: "2026-10-29 13:57:41.102", system: "Pricing API", level: "INFO", message: "POST /api/v1/quotes/Q-10238/sync accepted (idempotencyKey q-10238-r1-5f22)" },
  { at: "2026-10-29 13:57:41.140", system: "Integration hub", level: "INFO", message: "Dispatched order payload to SAP ERP · orders (svc-sap-orders)" },
  { at: "2026-10-29 13:58:11.141", system: "SAP ERP gateway", level: "WARN", message: "No response within 30 000 ms" },
  { at: "2026-10-29 13:58:11.150", system: "Integration hub", level: "WARN", message: "ERP_TIMEOUT classified TRANSIENT_TECHNICAL · retryable · next attempt 15:00" },
  { at: "2026-10-29 13:58:11.152", system: "Pricing API", level: "INFO", message: "Quote Q-10238 sync status → RETRYING (attempt 2)" },
];

/* ---------------- Service accounts (US-AD-08) ---------------- */

export const CREDENTIAL_TYPES = ["API_KEY", "OAUTH_CLIENT", "MTLS_CERT", "JWT_KEY"] as const;
export const SA_STATUSES = ["ACTIVE", "ROTATION_DUE", "REVOKED", "EXPIRED"] as const;
export type SaStatus = (typeof SA_STATUSES)[number];
export type Credential = { id: string; prefix: string; createdAt: string; createdBy: string; expiresAt: string; lastUsed?: string; status: "ACTIVE" | "REVOKED" | "EXPIRED" };
export type ServiceAccount = {
  id: string;
  name: string;
  purpose: string;
  ownerId: string;
  type: (typeof CREDENTIAL_TYPES)[number];
  scopes: string[];
  allowlist: string[];
  ipAllowlist: string[];
  interactiveLogin: boolean;
  interactiveApprovedBy?: string;
  expiresAt: string;
  rotationDays: number;
  status: SaStatus;
  nodeSync?: boolean;
  credentials: Credential[];
};
export const SERVICE_ACCOUNTS: ServiceAccount[] = [
  { id: "SA-01", name: "svc-sap-master", purpose: "Nightly product, customer and cost master import from SAP", ownerId: "U-14", type: "OAUTH_CLIENT", scopes: ["masterdata.write", "dq.write"], allowlist: ["POST /api/v1/products:batch", "POST /api/v1/customers:batch", "POST /api/v1/costs:batch"], ipAllowlist: ["10.60.0.0/16"], interactiveLogin: false, expiresAt: "2027-06-30", rotationDays: 90, status: "ACTIVE",
    credentials: [{ id: "K-SAP-3", prefix: "rn_oc_4Fq9", createdAt: "2026-09-01 10:00", createdBy: "U-14", expiresAt: "2026-11-30", lastUsed: "2026-10-29 03:12", status: "ACTIVE" }] },
  { id: "SA-02", name: "svc-sap-orders", purpose: "Send approved quotes to SAP as sales orders; read order status", ownerId: "U-14", type: "OAUTH_CLIENT", scopes: ["quote.sync", "order.read"], allowlist: ["POST /api/v1/quotes/*/sync", "GET /api/v1/orders/*"], ipAllowlist: ["10.60.0.0/16"], interactiveLogin: false, expiresAt: "2027-06-30", rotationDays: 90, status: "ROTATION_DUE",
    credentials: [{ id: "K-ORD-1", prefix: "rn_oc_9Ka2", createdAt: "2026-08-01 10:00", createdBy: "U-14", expiresAt: "2026-10-30", lastUsed: "2026-10-29 13:58", status: "ACTIVE" }] },
  { id: "SA-03", name: "svc-salesforce", purpose: "CRM account/opportunity sync and embedded CPQ price lookups", ownerId: "U-14", type: "JWT_KEY", scopes: ["crm.sync", "price.read"], allowlist: ["POST /api/v1/crm/events", "POST /api/v1/price:calculate"], ipAllowlist: [], interactiveLogin: false, expiresAt: "2027-03-31", rotationDays: 180, status: "ACTIVE",
    credentials: [{ id: "K-SF-2", prefix: "rn_jwt_c71D", createdAt: "2026-05-01 09:00", createdBy: "U-14", expiresAt: "2026-11-01", lastUsed: "2026-10-29 14:25", status: "ACTIVE" }, { id: "K-SF-3", prefix: "rn_jwt_P0q8", createdAt: "2026-10-28 09:00", createdBy: "U-14", expiresAt: "2027-04-28", status: "ACTIVE" }] },
  { id: "SA-04", name: "svc-rebate-ninja", purpose: "Exchange rebate agreements, accruals and claims with Rebate Ninja", ownerId: "U-01", type: "API_KEY", scopes: ["rebate.sync"], allowlist: ["POST /api/v1/rebates/accruals", "GET /api/v1/rebates/*"], ipAllowlist: [], interactiveLogin: false, expiresAt: "2027-01-31", rotationDays: 90, status: "ACTIVE",
    credentials: [{ id: "K-RN-1", prefix: "rn_ak_7Tz3", createdAt: "2026-07-01 09:00", createdBy: "U-01", expiresAt: "2026-12-31", lastUsed: "2026-10-28 23:00", status: "REVOKED" }] },
  { id: "SA-05", name: "svc-bi-export", purpose: "Power BI / Snowflake pulls of governed pricing datasets", ownerId: "U-10", type: "OAUTH_CLIENT", scopes: ["dataset.read"], allowlist: ["GET /api/v1/datasets/*"], ipAllowlist: ["52.170.0.0/16"], interactiveLogin: false, expiresAt: "2027-04-30", rotationDays: 90, status: "ACTIVE",
    credentials: [{ id: "K-BI-4", prefix: "rn_oc_Lm2v", createdAt: "2026-10-01 08:00", createdBy: "U-14", expiresAt: "2026-12-30", lastUsed: "2026-10-29 14:20", status: "ACTIVE" }] },
  { id: "SA-06", name: "svc-engine-node-sync", purpose: "Node-to-node state sync between price engine instances", ownerId: "U-14", type: "MTLS_CERT", scopes: ["engine.sync"], allowlist: ["POST /internal/engine/state"], ipAllowlist: ["10.80.0.0/24"], interactiveLogin: false, expiresAt: "2027-10-01", rotationDays: 365, status: "ACTIVE", nodeSync: true,
    credentials: [{ id: "K-NODE-1", prefix: "CN=rn-engine-node", createdAt: "2026-10-01 00:00", createdBy: "U-14", expiresAt: "2027-10-01", lastUsed: "2026-10-29 14:29", status: "ACTIVE" }] },
  { id: "SA-07", name: "svc-legacy-ftp", purpose: "Retired legacy cost upload", ownerId: "U-03", type: "API_KEY", scopes: ["costs.write"], allowlist: ["POST /api/v1/costs:batch"], ipAllowlist: [], interactiveLogin: false, expiresAt: "2026-09-30", rotationDays: 90, status: "EXPIRED",
    credentials: [{ id: "K-FTP-2", prefix: "rn_ak_aa01", createdAt: "2026-04-01 09:00", createdBy: "U-03", expiresAt: "2026-09-30", status: "EXPIRED" }] },
];

/** Method + path match against "GET /api/v1/orders/*" style patterns. */
export function endpointAllowed(call: string, patterns: string[]) {
  const [m, p] = call.trim().split(/\s+/);
  return patterns.some((pat) => {
    const [pm, pp] = pat.split(/\s+/);
    if (pm !== m?.toUpperCase()) return false;
    const re = new RegExp(`^${pp.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]+")}$`);
    return re.test(p ?? "");
  });
}

/** Server-generated secret (prototype — not cryptographically secure). */
export function generateSecret(prefix: string) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 40; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `${prefix}${s}`;
}
