/**
 * Price execution & reconciliation (Epic 7, US-EX-01…04) and audit-log integrity (US-AD-04).
 * Publication gates, destinations, attempts with per-record results, idempotency keys,
 * rollback / compensating changes, plus the hash chain that makes the audit log tamper-evident.
 */
import { AUDIT_LOG, PRICE_LISTS, productBySku, type AuditEntry, type PriceLine, type PriceList } from "@/lib/pricing/data";
import { NOW, TODAY_ISO, shortHash } from "@/lib/pricing/deals";

/* ================================================================== */
/* Destinations (US-EX-01)                                            */
/* ================================================================== */

export const DESTINATION_TYPES = ["ERP", "CRM", "DATA_WAREHOUSE", "WEBHOOK", "SFTP"] as const;
export type DestinationType = (typeof DESTINATION_TYPES)[number];
export const PUBLICATION_MODES = ["BATCH", "EVENT"] as const;
export type PublicationMode = (typeof PUBLICATION_MODES)[number];
/** What a destination can undo natively; anything else gets a compensating change (US-EX-04). */
export const ROLLBACK_CAPABILITIES = ["NATIVE_ROLLBACK", "CANCEL_PENDING", "NONE"] as const;
export type RollbackCapability = (typeof ROLLBACK_CAPABILITIES)[number];
export const ROLLBACK_MODES = ["CANCEL_PENDING", "NATIVE_ROLLBACK", "COMPENSATING_CHANGE"] as const;
export type RollbackMode = (typeof ROLLBACK_MODES)[number];

export type Destination = {
  id: string;
  name: string;
  type: DestinationType;
  endpoint: string;
  auth: "OAUTH_CLIENT" | "API_KEY" | "MTLS_CERT" | "SSH_KEY" | "HMAC_SECRET";
  serviceAccount: string;
  mapping: string;
  batchSize: number;
  schedule: string;
  modes: PublicationMode[];
  rollback: RollbackCapability;
  /** Price list scope this destination may receive. */
  authorizedRegions: string[];
  authorizedListTypes: string[];
  status: "ACTIVE" | "DISABLED";
  /** Secrets are write-only: only the last-rotated date is shown. */
  secretRotatedAt: string;
};

export const DESTINATIONS: Destination[] = [
  { id: "DST-ERP", name: "SAP ERP pricing conditions", type: "ERP", endpoint: "https://sap.example.com/api/pricing/conditions", auth: "OAUTH_CLIENT", serviceAccount: "svc-sap-price-pub", mapping: "Condition type PR00 · table A305 (sales org + customer + material)", batchSize: 500, schedule: "Daily 02:00 Europe/London + on demand", modes: ["BATCH", "EVENT"], rollback: "NATIVE_ROLLBACK", authorizedRegions: ["UK", "EU", "North America"], authorizedListTypes: ["BASE", "SEGMENT", "CUSTOMER", "CHANNEL", "REGIONAL", "PROMOTIONAL", "CONTRACT"], status: "ACTIVE", secretRotatedAt: "2026-09-30" },
  { id: "DST-CRM", name: "Salesforce price books", type: "CRM", endpoint: "https://acme.my.salesforce.com/services/data/v61.0/composite", auth: "OAUTH_CLIENT", serviceAccount: "svc-sfdc-price-pub", mapping: "Pricebook2 per list · PricebookEntry per line", batchSize: 200, schedule: "Every 15 min (events) + daily 03:00", modes: ["EVENT", "BATCH"], rollback: "CANCEL_PENDING", authorizedRegions: ["UK", "EU", "North America", "India"], authorizedListTypes: ["BASE", "SEGMENT", "CUSTOMER", "PROMOTIONAL", "CONTRACT"], status: "ACTIVE", secretRotatedAt: "2026-10-01" },
  { id: "DST-DW", name: "Snowflake pricing mart", type: "DATA_WAREHOUSE", endpoint: "snowflake://acme.eu-west-1/PRICING.PUBLISHED", auth: "MTLS_CERT", serviceAccount: "svc-dw-loader", mapping: "PRICE_FACT (SCD type 2)", batchSize: 10_000, schedule: "Daily 04:00", modes: ["BATCH"], rollback: "NONE", authorizedRegions: ["UK", "EU", "North America", "India"], authorizedListTypes: ["BASE", "SEGMENT", "CUSTOMER", "CHANNEL", "REGIONAL", "PROMOTIONAL", "CONTRACT"], status: "ACTIVE", secretRotatedAt: "2026-07-14" },
  { id: "DST-WEB", name: "E-commerce storefront webhook", type: "WEBHOOK", endpoint: "https://shop.example.com/hooks/price-updated", auth: "HMAC_SECRET", serviceAccount: "svc-webhook-shop", mapping: "price.updated v2 (thin notification)", batchSize: 1, schedule: "On event", modes: ["EVENT"], rollback: "NONE", authorizedRegions: ["UK"], authorizedListTypes: ["BASE", "PROMOTIONAL", "CHANNEL"], status: "ACTIVE", secretRotatedAt: "2026-08-02" },
  { id: "DST-SFTP", name: "Distributor price file (SFTP)", type: "SFTP", endpoint: "sftp://files.example.com/outbound/prices", auth: "SSH_KEY", serviceAccount: "svc-sftp-dist", mapping: "CSV · one file per list version", batchSize: 50_000, schedule: "Daily 05:00", modes: ["BATCH"], rollback: "NONE", authorizedRegions: ["UK", "EU"], authorizedListTypes: ["SEGMENT", "CHANNEL", "CUSTOMER"], status: "ACTIVE", secretRotatedAt: "2026-05-20" },
];
export const destinationById = (id?: string) => DESTINATIONS.find((d) => d.id === id);

/** Mode a rollback takes on this destination for a publication in this state. */
export function rollbackModeFor(dest: Destination, pending: boolean): RollbackMode {
  if (pending && dest.rollback !== "NONE") return "CANCEL_PENDING";
  if (dest.rollback === "NATIVE_ROLLBACK") return "NATIVE_ROLLBACK";
  return "COMPENSATING_CHANGE";
}

/* ================================================================== */
/* Publishable price lists & gate checks                              */
/* ================================================================== */

/** An approved list whose lines start on 2026-12-01 — demonstrates the effective-date gate (US-EX-01 AC#4). */
export const EXTRA_LISTS: PriceList[] = [
  {
    id: "BL-001-DEC", name: "UK Base 2026 — December uplift", type: "BASE", status: "APPROVED", version: 5, currency: "GBP", region: "UK", channel: "All", segment: "All", uom: "EA",
    effectiveFrom: "2026-12-01", effectiveTo: "2026-12-31", openEnded: false, timeZone: "Europe/London", owner: "Priya Nair", submittedBy: "Tom Hale", lastUpdated: "2026-10-27 15:00", rounding: "2 decimals · NEAREST",
    lines: [
      { id: "L1", sku: "A-100", price: 112, uom: "EA", minQty: 1, effectiveFrom: "2026-12-01", allowZeroPrice: false },
      { id: "L2", sku: "EW-3100", price: 699, uom: "EA", minQty: 1, effectiveFrom: "2026-12-01", allowZeroPrice: false },
      { id: "L3", sku: "LT-PNL-60", price: 35.2, uom: "EA", minQty: 1, effectiveFrom: "2026-11-15", allowZeroPrice: false },
      { id: "L4", sku: "SW-RCD-63", price: null, uom: "EA", minQty: 1, effectiveFrom: "2026-12-01", allowZeroPrice: false },
    ],
  },
];
export const publishableLists = () => [...EXTRA_LISTS, ...PRICE_LISTS];
export const listById = (id: string) => publishableLists().find((l) => l.id === id);

const PUBLISHABLE = ["APPROVED", "SCHEDULED", "ACTIVE"];

export type GateResult = {
  line: PriceLine;
  sent: boolean;
  code?: "LIST_NOT_APPROVED" | "NOT_YET_EFFECTIVE" | "VALIDATION_ERROR" | "LIST_ENDED";
  reason?: string;
  effectiveFrom: string;
};

/** Gate checks per record (US-EX-01): approved or later, effective on the run date, no validation errors. */
export function gateLines(list: PriceList, runDate: string): GateResult[] {
  return list.lines.map((line) => {
    const effectiveFrom = line.effectiveFrom > list.effectiveFrom ? line.effectiveFrom : list.effectiveFrom;
    if (!PUBLISHABLE.includes(list.status))
      return { line, sent: false, effectiveFrom, code: list.status === "SUPERSEDED" || list.status === "EXPIRED" || list.status === "CANCELLED" ? "LIST_ENDED" : "LIST_NOT_APPROVED", reason: `List is ${list.status.toLowerCase().replace("_", " ")} — only approved, scheduled or active prices are published.` };
    if (line.price === null && !line.allowZeroPrice) return { line, sent: false, effectiveFrom, code: "VALIDATION_ERROR", reason: "Line has no price. Fix it in the price list and re-approve." };
    if (effectiveFrom > runDate) return { line, sent: false, effectiveFrom, code: "NOT_YET_EFFECTIVE", reason: `Effective from ${effectiveFrom} — held until a run on or after that date.` };
    return { line, sent: true, effectiveFrom };
  });
}

/** Whether the destination may receive this list's scope (US-EX-01 AC#3). */
export const destinationAuthorized = (d: Destination, l: PriceList) => d.status === "ACTIVE" && d.authorizedRegions.includes(l.region) && d.authorizedListTypes.includes(l.type);

/* ================================================================== */
/* Publication attempts (US-EX-02)                                    */
/* ================================================================== */

export const PUBLICATION_STATUSES = ["QUEUED", "IN_PROGRESS", "SUCCEEDED", "PARTIAL_SUCCESS", "FAILED"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];
export type ChangeType = "CREATE" | "UPDATE" | "DELETE";

export type PubRecord = {
  id: string;
  sku: string;
  scope: string;
  price: number | null;
  currency: string;
  uom: string;
  qtyBand: string;
  validFrom: string;
  validTo?: string;
  listVersion: string;
  changeType: ChangeType;
  status: "SENT" | "ACKNOWLEDGED" | "FAILED" | "REJECTED";
  attempts: number;
  error?: { code: string; errorClass: "TRANSIENT_TECHNICAL" | "VALIDATION" | "DOWNSTREAM_REJECTION" | "BUSINESS_RULE"; message: string; retryable: boolean };
};

export type Publication = {
  id: string;
  kind: "PUBLICATION" | "ROLLBACK" | "COMPENSATING_CHANGE" | "CANCELLATION";
  destinationId: string;
  listId: string;
  listName: string;
  listVersion: string;
  mode: PublicationMode;
  runDate: string;
  startedAt: string;
  finishedAt?: string;
  status: PublicationStatus;
  recordCount: number;
  failedCount: number;
  rejectedCount: number;
  triggeredBy: string;
  idempotencyKey: string;
  ack?: string;
  /** Rollback/compensation links (US-EX-04): the publication this one reverses, and the one that reversed it. */
  reverses?: string;
  reversedBy?: string;
  reasonCode?: string;
  comments?: string;
  awaitingApprovalBy?: string;
  retries: Array<{ at: string; by: string; resent: number; succeeded: number }>;
  /** Failed/rejected records in full plus a sample of sent ones; counts above are the totals. */
  records: PubRecord[];
  correlationId: string;
};

const rec = (id: string, sku: string, price: number, status: PubRecord["status"], error?: PubRecord["error"], attempts = 1): PubRecord => ({
  id, sku, scope: "UK Base 2026 · All channels", price, currency: "GBP", uom: productBySku(sku)?.uom ?? "EA", qtyBand: "1+", validFrom: "2026-01-01", validTo: "2026-12-31", listVersion: "BL-001 v4", changeType: "UPDATE", status, attempts, error,
});
const timeout = (n: number): PubRecord["error"] => ({ code: "DOWNSTREAM_TIMEOUT", errorClass: "TRANSIENT_TECHNICAL", message: `SAP did not acknowledge batch ${n} within 30 s. Eligible for retry.`, retryable: true });

const SKUS = ["A-100", "EW-3100", "CB-2.5", "LT-PNL-60", "SW-RCD-63", "HT-ELE-2K", "LT-DWN-10", "CB-6.0", "EW-3110"];

export const PUBLICATIONS: Publication[] = [
  {
    id: "PUB-2207", kind: "PUBLICATION", destinationId: "DST-ERP", listId: "BL-001", listName: "UK Base 2026", listVersion: "v4", mode: "BATCH", runDate: "2026-10-29", startedAt: "2026-10-29 02:00", finishedAt: "2026-10-29 03:18", status: "PARTIAL_SUCCESS", recordCount: 2_000, failedCount: 15, rejectedCount: 0, triggeredBy: "U-02", idempotencyKey: "pub-bl001-v4-20261029", ack: "SAP IDoc batch 0000918822 · 1,985 condition records posted", retries: [], correlationId: "c-pub2207",
    records: [
      ...Array.from({ length: 15 }, (_, i) => ({ ...rec(`R-${1840 + i}`, SKUS[i % SKUS.length], 30 + i * 7.5, "FAILED"), qtyBand: i % 3 === 0 ? "100–999" : "1+", error: timeout(37 + Math.floor(i / 5)), attempts: 3 })),
      rec("R-0001", "A-100", 110, "ACKNOWLEDGED"),
      rec("R-0002", "EW-3100", 689, "ACKNOWLEDGED"),
      rec("R-0003", "LT-PNL-60", 34.5, "ACKNOWLEDGED"),
    ],
  },
  {
    id: "PUB-2205", kind: "PUBLICATION", destinationId: "DST-CRM", listId: "SL-001", listName: "UK Distributor 2026", listVersion: "v2", mode: "EVENT", runDate: "2026-10-28", startedAt: "2026-10-28 16:00", finishedAt: "2026-10-28 16:02", status: "PARTIAL_SUCCESS", recordCount: 3, failedCount: 2, rejectedCount: 0, triggeredBy: "U-01", idempotencyKey: "pub-sl001-v2-evt-88", ack: "Composite response 207 · 1 of 3 entries upserted", retries: [], correlationId: "c-pub2205",
    records: [
      { ...rec("R-9001", "A-100", 106.7, "FAILED"), scope: "UK Distributor 2026 · Distributor", listVersion: "SL-001 v2", error: { code: "FIELD_INTEGRITY_EXCEPTION", errorClass: "DOWNSTREAM_REJECTION", message: "Salesforce rejected the entry: Product2 A-100 is inactive in the CRM. Activate it in Salesforce, then republish.", retryable: false } },
      { ...rec("R-9002", "EW-3100", 668.33, "FAILED"), scope: "UK Distributor 2026 · Distributor", listVersion: "SL-001 v2", error: { code: "UNSUPPORTED_UOM", errorClass: "VALIDATION", message: "UoM “EA” has no mapping for this price book. Add the UoM mapping on the destination.", retryable: false } },
      { ...rec("R-9003", "LT-PNL-60", 33.47, "ACKNOWLEDGED"), scope: "UK Distributor 2026 · Distributor", listVersion: "SL-001 v2" },
    ],
  },
  {
    id: "PUB-2201", kind: "PUBLICATION", destinationId: "DST-DW", listId: "BL-001", listName: "UK Base 2026", listVersion: "v4", mode: "BATCH", runDate: "2026-10-12", startedAt: "2026-10-12 04:00", finishedAt: "2026-10-12 04:06", status: "SUCCEEDED", recordCount: 2_000, failedCount: 0, rejectedCount: 0, triggeredBy: "U-02", idempotencyKey: "pub-bl001-v4-dw-1012", ack: "Snowflake COPY INTO · 2,000 rows loaded", retries: [], correlationId: "c-pub2201",
    records: [rec("R-5001", "A-100", 110, "SENT"), rec("R-5002", "EW-3100", 689, "SENT")],
  },
  {
    id: "PUB-2199", kind: "PUBLICATION", destinationId: "DST-ERP", listId: "CL-001", listName: "Edmundson Customer List", listVersion: "v3", mode: "BATCH", runDate: "2026-10-27", startedAt: "2026-10-27 09:20", finishedAt: "2026-10-27 09:21", status: "SUCCEEDED", recordCount: 3, failedCount: 0, rejectedCount: 0, triggeredBy: "U-01", idempotencyKey: "pub-cl001-v3-1027", ack: "SAP IDoc batch 0000917310 · 3 condition records posted", retries: [], correlationId: "c-pub2199", reversedBy: "PUB-2200",
    records: [
      { ...rec("R-7001", "A-100", 92, "ACKNOWLEDGED"), scope: "Edmundson Customer List · Distributor", listVersion: "CL-001 v3" },
      { ...rec("R-7002", "EW-3100", 634.91, "ACKNOWLEDGED"), scope: "Edmundson Customer List · Distributor", listVersion: "CL-001 v3" },
      { ...rec("R-7003", "LT-PNL-60", 29.5, "ACKNOWLEDGED"), scope: "Edmundson Customer List · Distributor", listVersion: "CL-001 v3" },
    ],
  },
  {
    id: "PUB-2200", kind: "ROLLBACK", destinationId: "DST-ERP", listId: "CL-001", listName: "Edmundson Customer List", listVersion: "v3", mode: "BATCH", runDate: "2026-10-27", startedAt: "2026-10-27 11:05", finishedAt: "2026-10-27 11:05", status: "SUCCEEDED", recordCount: 1, failedCount: 0, rejectedCount: 0, triggeredBy: "U-01", idempotencyKey: "rb-pub2199-1105", ack: "SAP condition A-100 restored to 100.00 (native reversal)", retries: [], correlationId: "c-pub2200", reverses: "PUB-2199", reasonCode: "CORRECTION", comments: "Widget was keyed as 92.00; the approved override is 100.00. Restoring the previous price.",
    records: [{ ...rec("R-7101", "A-100", 100, "ACKNOWLEDGED"), scope: "Edmundson Customer List · Distributor", listVersion: "CL-001 v3", changeType: "UPDATE" }],
  },
  {
    id: "PUB-2196", kind: "PUBLICATION", destinationId: "DST-WEB", listId: "PR-011", listName: "Winter Lighting Promo", listVersion: "v1", mode: "EVENT", runDate: "2026-10-24", startedAt: "2026-10-24 09:00", finishedAt: "2026-10-24 09:00", status: "FAILED", recordCount: 2, failedCount: 0, rejectedCount: 2, triggeredBy: "U-01", idempotencyKey: "pub-pr011-v1-1024", retries: [], correlationId: "c-pub2196",
    records: [
      { ...rec("R-6001", "LT-PNL-60", 29.99, "REJECTED"), scope: "Winter Lighting Promo · Retail", listVersion: "PR-011 v1", changeType: "CREATE", validFrom: "2026-12-01", error: { code: "LIST_NOT_APPROVED", errorClass: "BUSINESS_RULE", message: "List is submitted, not approved. Rejected at the publication gate and logged.", retryable: false } },
      { ...rec("R-6002", "LT-DWN-10", 79, "REJECTED"), scope: "Winter Lighting Promo · Retail", listVersion: "PR-011 v1", changeType: "CREATE", validFrom: "2026-12-01", error: { code: "LIST_NOT_APPROVED", errorClass: "BUSINESS_RULE", message: "List is submitted, not approved. Rejected at the publication gate and logged.", retryable: false } },
    ],
  },
];

export const nextPublicationId = (all: Publication[]) => `PUB-${Math.max(...all.map((p) => Number(p.id.slice(4)))) + 1}`;

/* ================================================================== */
/* Price read API (US-EX-01 AC#5)                                     */
/* ================================================================== */

/** The approved price effective on `asOf` for a SKU in a list family (same region + type). */
export function priceAsOf(sku: string, region: string, listType: string, asOf: string) {
  const live = ["APPROVED", "SCHEDULED", "ACTIVE", "SUPERSEDED", "EXPIRED"];
  const hits = publishableLists()
    .filter((l) => l.region === region && l.type === listType && live.includes(l.status) && l.effectiveFrom <= asOf && (!l.effectiveTo || asOf <= l.effectiveTo))
    .flatMap((l) =>
      l.lines
        .filter((ln) => ln.sku === sku && ln.price !== null && ln.effectiveFrom <= asOf && (!ln.effectiveTo || asOf <= ln.effectiveTo))
        .map((ln) => ({ list: l, line: ln, from: ln.effectiveFrom > l.effectiveFrom ? ln.effectiveFrom : l.effectiveFrom })),
    )
    .sort((a, b) => b.from.localeCompare(a.from) || b.list.version - a.list.version);
  return hits[0];
}

/* ================================================================== */
/* Idempotency (US-EX-03)                                             */
/* ================================================================== */

export const IDEMPOTENCY_RETENTION_DAYS = 7;
export type IdemKey = {
  key: string;
  scope: "PUBLICATION" | "ERP_SYNC" | "EVENT" | "BULK_JOB";
  endpoint: string;
  bodyHash: string;
  messageId?: string;
  state: "IN_PROGRESS" | "COMPLETED" | "FAILED";
  firstSeen: string;
  lastSeen: string;
  replays: number;
  result: string;
  expiresAt: string;
};

export const IDEMPOTENCY_KEYS: IdemKey[] = [
  { key: "pub-bl001-v4-20261029", scope: "PUBLICATION", endpoint: "POST /v1/publications", bodyHash: "3f9a1c02", state: "COMPLETED", firstSeen: "2026-10-29 02:00", lastSeen: "2026-10-29 02:00", replays: 0, result: "201 · PUB-2207", expiresAt: "2026-11-05 02:00" },
  { key: "evt-cost-MSG-1001", scope: "EVENT", endpoint: "POST /v1/events/price-updated", bodyHash: "a1b2c3d4", messageId: "MSG-1001", state: "COMPLETED", firstSeen: "2026-10-29 09:14", lastSeen: "2026-10-29 09:16", replays: 2, result: "200 · price A-100 UK Base v4 updated (1 active price)", expiresAt: "2026-11-05 09:14" },
  { key: "q-10236-r1-7c1e", scope: "ERP_SYNC", endpoint: "POST /v1/erp/orders", bodyHash: "77de0912", state: "COMPLETED", firstSeen: "2026-10-20 15:10", lastSeen: "2026-10-20 15:12", replays: 1, result: "201 · SO-4500231", expiresAt: "2026-10-27 15:10" },
  { key: "q-10238-r1-5f22", scope: "ERP_SYNC", endpoint: "POST /v1/erp/orders", bodyHash: "5f22aa01", state: "IN_PROGRESS", firstSeen: "2026-10-29 13:50", lastSeen: "2026-10-29 13:58", replays: 0, result: "Waiting for SAP (retry 2 of 5)", expiresAt: "2026-11-05 13:50" },
  { key: "job-2291-bulk", scope: "BULK_JOB", endpoint: "POST /v1/bulk-jobs", bodyHash: "c0ffee11", state: "COMPLETED", firstSeen: "2026-10-28 18:30", lastSeen: "2026-10-28 18:30", replays: 0, result: "202 · JOB-2291", expiresAt: "2026-11-04 18:30" },
  { key: "pub-pr011-v1-1024", scope: "PUBLICATION", endpoint: "POST /v1/publications", bodyHash: "9b0e4471", state: "FAILED", firstSeen: "2026-10-24 09:00", lastSeen: "2026-10-24 09:00", replays: 0, result: "422 · LIST_NOT_APPROVED", expiresAt: "2026-10-31 09:00" },
];

/** Body fingerprint used to detect a key reused with a different payload. */
export const bodyHash = (body: string) => shortHash(body.replace(/\s+/g, ""));

/* ================================================================== */
/* Audit log (US-AD-04)                                               */
/* ================================================================== */

export const AUDIT_EVENT_TYPES = ["PRICE_CHANGE", "QUOTE_CALCULATION", "APPROVAL_DECISION", "OVERRIDE", "DATA_EXPORT", "CONFIG_CHANGE", "PERMISSION_CHANGE", "LOGIN", "PUBLICATION"] as const;
export type AuditEventType = (typeof AUDIT_EVENT_TYPES)[number];
export const ACTOR_TYPES = ["USER", "SERVICE_ACCOUNT", "SYSTEM"] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/** Map an entry's action to the US-AD-04 event type. */
export function eventTypeOf(a: AuditEntry): AuditEventType {
  const map: Record<string, AuditEventType> = {
    PRICE_CHANGE: "PRICE_CHANGE",
    RECALCULATED: "PRICE_CHANGE",
    BULK_UPDATE: "PRICE_CHANGE",
    ROLLBACK: "PRICE_CHANGE",
    OVERRIDE_SET: "OVERRIDE",
    OVERRIDE: "OVERRIDE",
    NEW_VERSION: "CONFIG_CHANGE",
    UPDATE: "CONFIG_CHANGE",
    RETENTION_CHANGE: "CONFIG_CHANGE",
    ACCEPT: "APPROVAL_DECISION",
    APPROVE: "APPROVAL_DECISION",
    REJECT: "APPROVAL_DECISION",
    QUOTE_CALCULATION: "QUOTE_CALCULATION",
    EXPORT: "DATA_EXPORT",
    ROLE_GRANTED: "PERMISSION_CHANGE",
    ROLE_REVOKED: "PERMISSION_CHANGE",
    LOGIN: "LOGIN",
    LOGIN_DENIED: "LOGIN",
    PUBLISHED: "PUBLICATION",
    PUBLICATION_FAILED: "PUBLICATION",
    COMPENSATING_CHANGE: "PUBLICATION",
  };
  return map[a.action] ?? "CONFIG_CHANGE";
}

export function actorTypeOf(a: AuditEntry): ActorType {
  if (a.actor.startsWith("svc-")) return "SERVICE_ACCOUNT";
  if (a.actor.startsWith("System")) return "SYSTEM";
  return "USER";
}

/** Entries for the event types the base log doesn't seed. */
export const EXTRA_AUDIT: AuditEntry[] = [
  { id: "AU-77009", at: "2026-10-29 10:15", actor: "Sam Carter", entity: "Quote", record: "Q-10231", action: "QUOTE_CALCULATION", before: "inputs #4a17c0", after: "net £24,346.00 · 2 lines", reasonText: "Rule versions R-140 v2, CL-001 v3 · trace ptr tr/9f2c", correlationId: "c-q10231-calc" },
  { id: "AU-77010", at: "2026-10-28 15:30", actor: "Maya Iyer", entity: "Approval", record: "APR-3002 · Q-10240", action: "APPROVE", before: "PENDING", after: "APPROVED (level 1)", reasonText: "Volumes confirmed with procurement.", correlationId: "c-apr3002" },
  { id: "AU-77011", at: "2026-10-27 09:12", actor: "Daniel Brooks", entity: "Approval", record: "APR-3008 · Q-10239", action: "REJECT", before: "PENDING", after: "REJECTED", reasonText: "Above our distributor band. Re-quote at 15% with volume tiers.", correlationId: "c-apr3008" },
  { id: "AU-77012", at: "2026-10-29 08:41", actor: "Riya Shah", entity: "Session", record: "riya.shah@aimdek.com", action: "LOGIN", after: "SSO · Azure AD · MFA passed", correlationId: "c-login-u01" },
  { id: "AU-77013", at: "2026-10-29 07:02", actor: "Mark Ellis", entity: "Session", record: "mark.ellis@aimdek.com", action: "LOGIN_DENIED", after: "Denied — user deactivated in IdP", correlationId: "c-login-u17" },
  { id: "AU-77014", at: "2026-10-28 17:40", actor: "Ben Ortiz", entity: "Role", record: "Fatima Khan", action: "ROLE_GRANTED", before: "—", after: "Deal Desk / Finance Approver", reasonText: "Joined deal desk team", correlationId: "c-perm-u08" },
  { id: "AU-77015", at: "2026-10-29 03:18", actor: "svc-sap-price-pub", entity: "Publication", record: "PUB-2207 · UK Base 2026", action: "PUBLICATION_FAILED", before: "2,000 records", after: "1,985 sent · 15 failed (transient)", correlationId: "c-pub2207" },
  { id: "AU-77016", at: "2026-10-27 11:05", actor: "Riya Shah", entity: "Publication", record: "PUB-2200 · Edmundson Customer List", action: "ROLLBACK", field: "price A-100", before: "92.00", after: "100.00", reasonCode: "CORRECTION", reasonText: "Widget was keyed as 92.00; restoring the approved override.", version: "v3", correlationId: "c-pub2200" },
  { id: "AU-77017", at: "2026-10-28 09:30", actor: "Grace Liu", entity: "Export", record: "Margin fact · Q3 2026", action: "EXPORT", after: "4,812 rows · CSV", reasonText: "Filters: period=2026-Q3", correlationId: "c-exp-u10" },
  { id: "AU-77018", at: "2026-10-26 14:00", actor: "Ben Ortiz", entity: "System Settings", record: "Session & password policy", action: "UPDATE", field: "idleTimeoutMinutes", before: "45", after: "30", reasonText: "Aligned with FR-I-06 (30-minute idle timeout)", correlationId: "c-cfg-sess" },
  { id: "AU-77019", at: "2026-10-29 02:00", actor: "System · Scheduler", entity: "Publication", record: "PUB-2207 · UK Base 2026", action: "PUBLISHED", after: "Batch started · SAP ERP", correlationId: "c-pub2207" },
];

/** Base log + extra seeds, oldest first (the order the hash chain is built in). */
export function auditChainSource(): AuditEntry[] {
  return [...AUDIT_LOG, ...EXTRA_AUDIT].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

export type ChainedEntry = AuditEntry & { prevHash: string; hash: string };

const canon = (a: AuditEntry) => JSON.stringify([a.id, a.at, a.actor, a.entity, a.record, a.action, a.field, a.before, a.after, a.reasonCode, a.reasonText, a.version, a.correlationId]);

/** Append-only hash chain: each entry's hash covers its content and the previous hash. */
export function buildChain(entries: AuditEntry[]): ChainedEntry[] {
  let prev = "00000000";
  return entries.map((a) => {
    const hash = shortHash(prev + canon(a));
    const out = { ...a, prevHash: prev, hash };
    prev = hash;
    return out;
  });
}

/** Recompute every hash from stored content. Returns the first entry whose stored hash no longer matches. */
export function verifyChain(stored: ChainedEntry[]) {
  let prev = "00000000";
  for (const e of stored) {
    const expect = shortHash(prev + canon(e));
    if (e.prevHash !== prev || e.hash !== expect) return { ok: false as const, brokenAt: e, checked: stored.indexOf(e) + 1 };
    prev = e.hash;
  }
  return { ok: true as const, checked: stored.length };
}

/** Retention can only be raised (US-AD-04 AC#5). */
export const MIN_RETENTION_YEARS = 3;
export const AUDIT_SETTINGS = { retentionYears: 3, lastVerifiedAt: "2026-10-29 06:00", lastVerifiedOk: true };

export { NOW, TODAY_ISO };
