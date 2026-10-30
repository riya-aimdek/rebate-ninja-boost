/* Mock data for the Pricing Management module.
 * Enumerations mirror "User Stories – Pricing Management" (Oct 26, 2026) exactly.
 * Example values reuse the ones given in the acceptance criteria (A-100, Widget, Acme, EU Base 2026 …). */

/* ---------------- Enumerations ---------------- */

export const PRODUCT_STATUSES = ["NEW", "ACTIVE", "PHASE_OUT", "END_OF_LIFE", "BLOCKED"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const COST_TYPES = ["STANDARD", "AVERAGE", "LAST_PURCHASE", "LANDED", "MANUFACTURING", "FREIGHT", "TARIFF", "LABOR", "OVERHEAD"] as const;
export type CostType = (typeof COST_TYPES)[number];

export const RULE_TYPES = [
  "CUSTOMER_PRICE",
  "CONTRACT_PRICE",
  "SEGMENT_PRICE",
  "CHANNEL_PRICE",
  "REGIONAL_PRICE",
  "DISCOUNT",
  "MARKUP",
  "MARGIN_TARGET",
  "COST_PLUS",
  "VOLUME_TIER",
  "PROMOTION",
  "FORMULA",
  "EXCEPTION",
] as const;
export type RuleType = (typeof RULE_TYPES)[number];

export const STRATEGIES = ["COST_PLUS", "MARKET_BASED", "VALUE_BASED", "ATTRIBUTE_BASED", "COMPETITIVE_BENCHMARK"] as const;
export const RULE_ACTIONS = ["SET_PRICE", "DISCOUNT_PCT", "MARKUP_PCT", "TARGET_MARGIN", "COST_PLUS_PCT", "APPLY_FORMULA", "APPLY_TIERS"] as const;
export const RULE_ATTRIBUTES = [
  "Product",
  "Customer",
  "Customer Segment",
  "Geography",
  "Channel",
  "Quantity",
  "Cost",
  "Date",
  "Currency",
  "Market",
  "Custom Attribute",
] as const;
export const OPERATORS = ["Equal To", "Not Equal To", "Greater Than", "Greater Than Equal To", "Less Than", "Less Than Equal To", "In", "Not In", "Between"] as const;
/** SCHEDULED = activated with a future effective date; becomes ACTIVE on that date. */
export const RULE_STATUSES = ["DRAFT", "SCHEDULED", "ACTIVE", "INACTIVE", "SUPERSEDED"] as const;

export const CUSTOMER_SEGMENTS = ["Strategic", "Enterprise", "Mid-Market", "SMB", "Distributor", "Retailer"] as const;
export const PRODUCT_SEGMENTS = ["Premium", "Standard", "Commodity", "Strategic", "New Product", "End-of-Life"] as const;
export const SEGMENT_METHODS = ["ATTRIBUTE", "VOLUME", "AI_DERIVED", "MANUAL"] as const;
export const VOLUME_METRICS = ["REVENUE", "UNITS", "ORDER_COUNT"] as const;

export const PRECEDENCE_TIERS = ["CONTRACT", "CUSTOMER", "SEGMENT", "CHANNEL", "REGIONAL", "STANDARD_LIST"] as const;
export const TIE_BREAKERS = ["HIGHEST_PRIORITY", "LOWEST_PRICE", "MOST_RECENT"] as const;

export const FORMULA_SOURCE_TYPES = ["COST_TYPE", "INDEX", "CONSTANT", "ATTRIBUTE", "FX_RATE", "PRICE_LIST"] as const;
export const RECALC_TRIGGERS = ["ON_INPUT_CHANGE", "SCHEDULED", "MANUAL"] as const;
export const ROUNDING_MODES = ["NEAREST", "UP", "DOWN"] as const;

export const LIMIT_KINDS = ["Price Floor", "Price Ceiling", "Minimum Margin %", "Maximum Discount %", "Maximum Discount without approval"] as const;
export const ENFORCEMENT_MODES = ["HARD_BLOCK", "REQUIRE_APPROVAL", "WARN"] as const;

export const LIST_TYPES = ["BASE", "SEGMENT", "CUSTOMER", "CHANNEL", "REGIONAL", "PROMOTIONAL", "CONTRACT"] as const;
export type ListType = (typeof LIST_TYPES)[number];
export const LIST_STATUSES = ["DRAFT", "SUBMITTED", "APPROVED", "SCHEDULED", "ACTIVE", "SUPERSEDED", "EXPIRED", "CANCELLED"] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];

export const BULK_METHODS = ["PERCENTAGE", "FIXED_AMOUNT", "FORMULA", "COST_CHANGE", "CURRENCY_ADJUSTMENT"] as const;
export const BULK_SELECTION = ["Product List", "Product Hierarchy node", "Saved filter", "Uploaded file"] as const;
export const GUARDRAIL_HANDLING = ["SKIP", "CLAMP", "FAIL"] as const;
export const JOB_STATUSES = ["QUEUED", "RUNNING", "SUCCEEDED", "PARTIAL_SUCCESS", "FAILED"] as const;

export const ADJUSTMENT_TYPES = ["PERCENT", "ABSOLUTE", "FORMULA", "NONE"] as const;
export const INHERITANCE_MODES = ["LIVE_LINK", "SNAPSHOT"] as const;

export const REASON_CODES = [
  "COST_INCREASE",
  "COST_DECREASE",
  "COMPETITIVE_RESPONSE",
  "CONTRACT_RENEWAL",
  "ANNUAL_PRICE_INCREASE",
  "CORRECTION",
  "PROMOTION",
  "STRATEGIC_ACCOUNT",
  "OTHER",
] as const;

export const REPRICING_TRIGGERS = ["COST_CHANGE", "INDEX_CHANGE", "COMPETITOR_PRICE_CHANGE", "SCHEDULE"] as const;
export const COMPETITOR_STRATEGIES = ["MATCH_LOWEST", "MATCH_AVERAGE", "UNDERCUT_BY_PCT"] as const;

export const REJECTION_REASONS = [
  "CUSTOMER_RELATIONSHIP",
  "COMPETITIVE_PRESSURE",
  "DATA_QUALITY_CONCERN",
  "MODEL_NOT_TRUSTED",
  "STRATEGIC_ACCOUNT",
  "OTHER",
] as const;

export const OBJECTIVES = ["MAX_MARGIN", "MAX_REVENUE", "MAX_VOLUME", "PROTECT_SHARE", "TARGET_MARGIN"] as const;
export const OBJECTIVE_LABELS: Record<(typeof OBJECTIVES)[number], string> = {
  MAX_MARGIN: "Maximise margin",
  MAX_REVENUE: "Maximise revenue",
  MAX_VOLUME: "Maximise volume",
  PROTECT_SHARE: "Protect market share",
  TARGET_MARGIN: "Achieve target margin",
};
export const RUN_STATUSES = ["DRAFT", "QUEUED", "RUNNING", "COMPLETED", "FAILED"] as const;
export const DEMAND_INPUTS = ["Historical demand", "Seasonality", "Inventory", "Customer segment", "Product", "Geography"] as const;

export const DQ_STATUSES = ["OPEN", "ACKNOWLEDGED", "FIXED_AT_SOURCE", "REPROCESSED", "IGNORED"] as const;
export type DqStatus = (typeof DQ_STATUSES)[number];

export const CURRENCIES = ["GBP", "USD", "EUR", "INR"] as const;
export const REGIONS = ["UK", "EU", "North America", "India"] as const;
export const CHANNELS = ["Direct", "Distributor", "Retail", "E-commerce", "Partner"] as const;
export const UOMS = ["EA", "BOX", "KG", "M", "PAL"] as const;

/* ---------------- Master data ---------------- */

export type Product = {
  productId: string;
  sku: string;
  name: string;
  description: string;
  category: string;
  brand: string;
  uom: string;
  cost: number;
  currency: string;
  lifecycleStatus: ProductStatus;
  productSegment: string;
  owner: string;
  effectiveFrom: string;
  effectiveTo?: string;
  sourceSystem: string;
  sourceId: string;
  importedAt: string;
  lastUpdated: string;
  validationErrors: string[];
  hierarchy: string[];
};

export const PRODUCTS: Product[] = [
  { productId: "P-100", sku: "A-100", name: "Widget", description: "Standard industrial widget, zinc-plated", category: "Fasteners", brand: "Acme Pro", uom: "EA", cost: 70, currency: "GBP", lifecycleStatus: "END_OF_LIFE", productSegment: "End-of-Life", owner: "Priya Nair", effectiveFrom: "2024-01-01", sourceSystem: "SAP", sourceId: "MAT-77", importedAt: "2026-10-29 02:14", lastUpdated: "2026-10-29 02:14", validationErrors: [], hierarchy: ["Industrial", "Fasteners", "Widgets"] },
  { productId: "P-200", sku: "A-200", name: "Widget XL", description: "Heavy-duty widget, stainless", category: "Fasteners", brand: "Acme Pro", uom: "EA", cost: 42.5, currency: "GBP", lifecycleStatus: "BLOCKED", productSegment: "Standard", owner: "Priya Nair", effectiveFrom: "2024-06-01", sourceSystem: "SAP", sourceId: "MAT-78", importedAt: "2026-10-29 02:14", lastUpdated: "2026-10-28 09:02", validationErrors: ["Blocked in ERP: quality hold QH-2291"], hierarchy: ["Industrial", "Fasteners", "Widgets"] },
  { productId: "P-310", sku: "EW-3100", name: "MVHR Unit 310", description: "Mechanical ventilation heat-recovery unit", category: "Ventilation", brand: "AirFlow", uom: "EA", cost: 412, currency: "GBP", lifecycleStatus: "ACTIVE", productSegment: "Premium", owner: "Tom Hale", effectiveFrom: "2025-02-01", sourceSystem: "SAP", sourceId: "MAT-310", importedAt: "2026-10-29 02:15", lastUpdated: "2026-10-29 02:15", validationErrors: [], hierarchy: ["Electrical", "Ventilation", "MVHR"] },
  { productId: "P-311", sku: "EW-3110", name: "MVHR Unit 310 Plus", description: "MVHR with humidity control", category: "Ventilation", brand: "AirFlow", uom: "EA", cost: 498, currency: "GBP", lifecycleStatus: "NEW", productSegment: "New Product", owner: "Tom Hale", effectiveFrom: "2026-10-01", sourceSystem: "SAP", sourceId: "MAT-311", importedAt: "2026-10-29 02:15", lastUpdated: "2026-10-29 02:15", validationErrors: [], hierarchy: ["Electrical", "Ventilation", "MVHR"] },
  { productId: "P-420", sku: "CB-2.5", name: "Twin & Earth Cable 2.5mm", description: "100m drum, grey PVC", category: "Cable", brand: "Voltex", uom: "M", cost: 0.62, currency: "GBP", lifecycleStatus: "ACTIVE", productSegment: "Commodity", owner: "Sara Ali", effectiveFrom: "2023-01-01", sourceSystem: "SAP", sourceId: "MAT-420", importedAt: "2026-10-29 02:16", lastUpdated: "2026-10-29 02:16", validationErrors: [], hierarchy: ["Electrical", "Cable", "Twin & Earth"] },
  { productId: "P-421", sku: "CB-6.0", name: "Twin & Earth Cable 6mm", description: "50m drum, grey PVC", category: "Cable", brand: "Voltex", uom: "M", cost: 1.48, currency: "GBP", lifecycleStatus: "ACTIVE", productSegment: "Commodity", owner: "Sara Ali", effectiveFrom: "2023-01-01", sourceSystem: "SAP", sourceId: "MAT-421", importedAt: "2026-10-29 02:16", lastUpdated: "2026-10-29 02:16", validationErrors: [], hierarchy: ["Electrical", "Cable", "Twin & Earth"] },
  { productId: "P-530", sku: "LT-PNL-60", name: "LED Panel 600x600", description: "40W, 4000K, flat panel", category: "Lighting", brand: "Lumio", uom: "EA", cost: 18.2, currency: "GBP", lifecycleStatus: "ACTIVE", productSegment: "Standard", owner: "Sara Ali", effectiveFrom: "2024-03-01", sourceSystem: "SAP", sourceId: "MAT-530", importedAt: "2026-10-29 02:17", lastUpdated: "2026-10-29 02:17", validationErrors: [], hierarchy: ["Electrical", "Lighting", "Panels"] },
  { productId: "P-531", sku: "LT-DWN-10", name: "LED Downlight 10W", description: "Fire-rated, dimmable", category: "Lighting", brand: "Lumio", uom: "BOX", cost: 46, currency: "GBP", lifecycleStatus: "PHASE_OUT", productSegment: "Standard", owner: "Sara Ali", effectiveFrom: "2022-03-01", effectiveTo: "2026-12-31", sourceSystem: "SAP", sourceId: "MAT-531", importedAt: "2026-10-29 02:17", lastUpdated: "2026-10-29 02:17", validationErrors: [], hierarchy: ["Electrical", "Lighting", "Downlights"] },
  { productId: "P-640", sku: "SW-RCD-63", name: "RCD 63A Type A", description: "Residual current device, 2-pole", category: "Switchgear", brand: "Voltex", uom: "EA", cost: 21.75, currency: "GBP", lifecycleStatus: "ACTIVE", productSegment: "Strategic", owner: "Tom Hale", effectiveFrom: "2024-01-01", sourceSystem: "SAP", sourceId: "MAT-640", importedAt: "2026-10-29 02:18", lastUpdated: "2026-10-29 02:18", validationErrors: [], hierarchy: ["Electrical", "Switchgear", "Protection"] },
  { productId: "P-750", sku: "HT-ELE-2K", name: "Electric Panel Heater 2kW", description: "Wi-Fi, Lot 20 compliant", category: "Heating", brand: "Warmly", uom: "EA", cost: 88, currency: "GBP", lifecycleStatus: "ACTIVE", productSegment: "Premium", owner: "Tom Hale", effectiveFrom: "2025-09-01", sourceSystem: "SAP", sourceId: "MAT-750", importedAt: "2026-10-29 02:18", lastUpdated: "2026-10-29 02:18", validationErrors: [], hierarchy: ["Electrical", "Heating", "Panel Heaters"] },
];

export type Customer = {
  id: string;
  name: string;
  parentId?: string;
  level: number;
  segment: string;
  industry: string;
  geography: string;
  channel: string;
  tier: "Tier 1" | "Tier 2" | "Tier 3";
  strategic: boolean;
  status: "ACTIVE" | "BLOCKED" | "INACTIVE";
  annualRevenue: number;
  rolling12mVolume: number;
  sourceSystem: string;
  sourceId: string;
  importedAt: string;
  lastUpdated: string;
  owner: string;
  segmentOverride?: { reason: string; by: string; at: string };
};

export const CUSTOMERS: Customer[] = [
  { id: "C-001", name: "Acme Global", level: 1, segment: "Strategic", industry: "Electrical Wholesale", geography: "Global", channel: "Direct", tier: "Tier 1", strategic: true, status: "ACTIVE", annualRevenue: 420_000_000, rolling12mVolume: 18_400_000, sourceSystem: "Salesforce", sourceId: "001Ax00000Acme", importedAt: "2026-10-29 01:02", lastUpdated: "2026-10-29 01:02", owner: "Neel Kamat" },
  { id: "C-002", name: "Acme US", parentId: "C-001", level: 2, segment: "Enterprise", industry: "Electrical Wholesale", geography: "North America", channel: "Direct", tier: "Tier 1", strategic: true, status: "ACTIVE", annualRevenue: 180_000_000, rolling12mVolume: 7_900_000, sourceSystem: "Salesforce", sourceId: "001Ax00000AcUS", importedAt: "2026-10-29 01:02", lastUpdated: "2026-10-29 01:02", owner: "Neel Kamat" },
  { id: "C-003", name: "Acme UK", parentId: "C-001", level: 2, segment: "Enterprise", industry: "Electrical Wholesale", geography: "UK", channel: "Direct", tier: "Tier 1", strategic: true, status: "ACTIVE", annualRevenue: 95_000_000, rolling12mVolume: 4_100_000, sourceSystem: "Salesforce", sourceId: "001Ax00000AcUK", importedAt: "2026-10-29 01:02", lastUpdated: "2026-10-29 01:02", owner: "Neel Kamat" },
  { id: "C-004", name: "Acme UK North", parentId: "C-003", level: 3, segment: "Mid-Market", industry: "Electrical Wholesale", geography: "UK", channel: "Direct", tier: "Tier 2", strategic: false, status: "ACTIVE", annualRevenue: 32_000_000, rolling12mVolume: 1_250_000, sourceSystem: "Salesforce", sourceId: "001Ax00000AcN", importedAt: "2026-10-29 01:02", lastUpdated: "2026-10-29 01:02", owner: "Riya Shah" },
  { id: "878075", name: "A. Webb Electrical Wholesalers Group Ltd", level: 1, segment: "Distributor", industry: "Electrical Wholesale", geography: "UK", channel: "Distributor", tier: "Tier 1", strategic: true, status: "ACTIVE", annualRevenue: 64_000_000, rolling12mVolume: 5_650_000, sourceSystem: "SAP", sourceId: "KUN-878075", importedAt: "2026-10-29 01:03", lastUpdated: "2026-10-29 01:03", owner: "Riya Shah" },
  { id: "878070", name: "Edmundson Electrical Group Ltd", level: 1, segment: "Distributor", industry: "Electrical Wholesale", geography: "UK", channel: "Distributor", tier: "Tier 1", strategic: true, status: "ACTIVE", annualRevenue: 210_000_000, rolling12mVolume: 9_800_000, sourceSystem: "SAP", sourceId: "KUN-878070", importedAt: "2026-10-29 01:03", lastUpdated: "2026-10-29 01:03", owner: "Riya Shah" },
  { id: "C-1", name: "Rashi Electronics Group", level: 1, segment: "Distributor", industry: "Electronics", geography: "India", channel: "Distributor", tier: "Tier 2", strategic: false, status: "ACTIVE", annualRevenue: 48_000_000, rolling12mVolume: 2_100_000, sourceSystem: "SAP", sourceId: "KUN-155000", importedAt: "2026-10-29 01:03", lastUpdated: "2026-10-29 01:03", owner: "Riya Shah" },
  { id: "155040", name: "Arrow Electronics India Group", level: 1, segment: "Enterprise", industry: "Electronics", geography: "India", channel: "Direct", tier: "Tier 1", strategic: false, status: "ACTIVE", annualRevenue: 150_000_000, rolling12mVolume: 6_400_000, sourceSystem: "SAP", sourceId: "KUN-155040", importedAt: "2026-10-29 01:04", lastUpdated: "2026-10-29 01:04", owner: "Neel Kamat" },
  { id: "155010", name: "Redington India Group", level: 1, segment: "SMB", industry: "Electronics", geography: "India", channel: "Retail", tier: "Tier 3", strategic: false, status: "ACTIVE", annualRevenue: 8_000_000, rolling12mVolume: 900_000, sourceSystem: "SAP", sourceId: "KUN-155010", importedAt: "2026-10-29 01:04", lastUpdated: "2026-10-29 01:04", owner: "Riya Shah" },
  { id: "135991", name: "Urban Electricals", level: 1, segment: "Retailer", industry: "Electronics", geography: "UK", channel: "Retail", tier: "Tier 3", strategic: false, status: "ACTIVE", annualRevenue: 4_500_000, rolling12mVolume: 380_000, sourceSystem: "SAP", sourceId: "KUN-135991", importedAt: "2026-10-29 01:04", lastUpdated: "2026-10-29 01:04", owner: "Riya Shah" },
  { id: "C-900", name: "TechNova Electronics Group", level: 1, segment: "SMB", industry: "Electronics", geography: "North America", channel: "E-commerce", tier: "Tier 3", strategic: false, status: "BLOCKED", annualRevenue: 6_200_000, rolling12mVolume: 410_000, sourceSystem: "Salesforce", sourceId: "001Ax00000TNova", importedAt: "2026-10-29 01:05", lastUpdated: "2026-10-27 16:40", owner: "Neel Kamat" },
];

export const MAX_HIERARCHY_DEPTH = 4;

export type SegmentAssignment = { customerId: string; segment: string; from: string; to?: string; method: string; reason?: string; override?: boolean };
export const SEGMENT_HISTORY: SegmentAssignment[] = [
  { customerId: "155010", segment: "SMB", from: "2025-01-01", method: "VOLUME" },
  { customerId: "C-004", segment: "SMB", from: "2024-01-01", to: "2026-06-14", method: "VOLUME" },
  { customerId: "C-004", segment: "Mid-Market", from: "2026-06-15", method: "VOLUME", reason: "Rolling 12-month volume reached 1,050,000 (threshold 1,000,000)" },
  { customerId: "C-1", segment: "Mid-Market", from: "2025-01-01", to: "2026-03-31", method: "ATTRIBUTE" },
  { customerId: "C-1", segment: "Distributor", from: "2026-04-01", method: "ATTRIBUTE", reason: "Matched Mid-Market (priority 20) and Distributor (priority 10) — lower number wins" },
];

/* ---------------- Cost data ---------------- */

export type CostRecord = {
  id: string;
  sku: string;
  plant: string;
  costType: CostType;
  amount: number;
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string;
  source: string;
  status: "ACTIVE" | "SUPERSEDED" | "SCHEDULED";
  receivedAt: string;
};

export const COSTS: CostRecord[] = [
  { id: "CR-1", sku: "A-100", plant: "UK01", costType: "STANDARD", amount: 70, currency: "GBP", effectiveFrom: "2026-01-01", effectiveTo: "2026-10-31", source: "SAP ERP", status: "SUPERSEDED", receivedAt: "2025-12-20 02:00" },
  { id: "CR-2", sku: "A-100", plant: "UK01", costType: "STANDARD", amount: 74, currency: "GBP", effectiveFrom: "2026-11-01", source: "SAP ERP", status: "SCHEDULED", receivedAt: "2026-10-28 02:00" },
  { id: "CR-3", sku: "A-100", plant: "UK01", costType: "LANDED", amount: 78.4, currency: "GBP", effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", source: "Landed Cost Engine", status: "ACTIVE", receivedAt: "2025-12-21 03:10" },
  { id: "CR-4", sku: "A-100", plant: "UK01", costType: "FREIGHT", amount: 5, currency: "GBP", effectiveFrom: "2026-01-01", source: "TMS Freight", status: "ACTIVE", receivedAt: "2025-12-21 03:12" },
  { id: "CR-5", sku: "A-100", plant: "UK01", costType: "TARIFF", amount: 2.1, currency: "GBP", effectiveFrom: "2026-04-01", source: "Customs Feed", status: "ACTIVE", receivedAt: "2026-03-30 04:00" },
  { id: "CR-6", sku: "EW-3100", plant: "UK01", costType: "STANDARD", amount: 412, currency: "GBP", effectiveFrom: "2026-01-01", source: "SAP ERP", status: "ACTIVE", receivedAt: "2025-12-20 02:00" },
  { id: "CR-7", sku: "EW-3100", plant: "UK01", costType: "LANDED", amount: 436, currency: "GBP", effectiveFrom: "2026-01-01", source: "Landed Cost Engine", status: "ACTIVE", receivedAt: "2025-12-21 03:10" },
  { id: "CR-8", sku: "CB-2.5", plant: "UK02", costType: "STANDARD", amount: 0.62, currency: "GBP", effectiveFrom: "2026-07-01", source: "SAP ERP", status: "ACTIVE", receivedAt: "2026-06-29 02:00" },
  { id: "CR-9", sku: "CB-2.5", plant: "UK02", costType: "LAST_PURCHASE", amount: 0.66, currency: "GBP", effectiveFrom: "2026-10-12", source: "SAP ERP", status: "ACTIVE", receivedAt: "2026-10-12 02:00" },
  { id: "CR-10", sku: "LT-PNL-60", plant: "IN01", costType: "MANUFACTURING", amount: 1520, currency: "INR", effectiveFrom: "2026-04-01", source: "SAP ERP", status: "ACTIVE", receivedAt: "2026-03-31 02:00" },
];

export const APPROVED_COST_SOURCES = [
  { source: "SAP ERP", serviceAccount: "svc-sap-cost", costTypes: ["STANDARD", "AVERAGE", "LAST_PURCHASE", "MANUFACTURING"] },
  { source: "Landed Cost Engine", serviceAccount: "svc-landed", costTypes: ["LANDED"] },
  { source: "TMS Freight", serviceAccount: "svc-tms", costTypes: ["FREIGHT"] },
  { source: "Customs Feed", serviceAccount: "svc-customs", costTypes: ["TARIFF"] },
];

export const REJECTED_COST_PAYLOADS = [
  { at: "2026-10-27 22:41", source: "ftp-legacy-costs", reason: "Source not registered as approved (no service account mapping)", records: 1240 },
  { at: "2026-10-26 03:05", source: "LANDED via Landed Cost Engine", reason: "COST_PERIOD_OVERLAP — A-100 LANDED 2026-06-01…2027-06-01 overlaps 2026-01-01…2026-12-31", records: 1 },
];

export const MARGIN_COST_DEFINITION: CostType[] = ["LANDED", "FREIGHT"];

/* ---------------- Price lists ---------------- */

export type PriceLine = {
  id: string;
  sku: string;
  price: number | null;
  uom: string;
  minQty: number;
  maxQty?: number;
  effectiveFrom: string;
  effectiveTo?: string;
  allowZeroPrice: boolean;
  calculatedPrice?: number;
  overridePrice?: number;
  overrideReason?: string;
  overrideExpires?: string;
  derivationChain?: string;
};

export type PriceList = {
  id: string;
  name: string;
  type: ListType;
  status: ListStatus;
  version: number;
  currency: string;
  region: string;
  channel: string;
  segment: string;
  uom: string;
  effectiveFrom: string;
  effectiveTo?: string;
  openEnded: boolean;
  timeZone: string;
  owner: string;
  submittedBy?: string;
  lastUpdated: string;
  parentId?: string;
  adjustmentType?: (typeof ADJUSTMENT_TYPES)[number];
  adjustmentValue?: number;
  inheritanceMode?: (typeof INHERITANCE_MODES)[number];
  rounding: string;
  lines: PriceLine[];
};

export const PRICE_LISTS: PriceList[] = [
  {
    id: "BL-001", name: "UK Base 2026", type: "BASE", status: "ACTIVE", version: 4, currency: "GBP", region: "UK", channel: "All", segment: "All", uom: "EA",
    effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", openEnded: false, timeZone: "Europe/London", owner: "Priya Nair", lastUpdated: "2026-10-12 11:04", rounding: "2 decimals · NEAREST",
    lines: [
      { id: "L1", sku: "A-100", price: 110, uom: "EA", minQty: 1, effectiveFrom: "2026-01-01", allowZeroPrice: false },
      { id: "L2", sku: "EW-3100", price: 689, uom: "EA", minQty: 1, effectiveFrom: "2026-01-01", allowZeroPrice: false },
      { id: "L3", sku: "CB-2.5", price: 1.05, uom: "M", minQty: 100, effectiveFrom: "2026-01-01", allowZeroPrice: false },
      { id: "L4", sku: "CB-2.5", price: 0.98, uom: "M", minQty: 1000, effectiveFrom: "2026-01-01", allowZeroPrice: false },
      { id: "L5", sku: "LT-PNL-60", price: 34.5, uom: "EA", minQty: 1, effectiveFrom: "2026-01-01", allowZeroPrice: false },
      { id: "L6", sku: "SW-RCD-63", price: 38, uom: "EA", minQty: 1, effectiveFrom: "2026-01-01", allowZeroPrice: false },
    ],
  },
  {
    id: "SL-001", name: "UK Distributor 2026", type: "SEGMENT", status: "ACTIVE", version: 2, currency: "GBP", region: "UK", channel: "Distributor", segment: "Distributor", uom: "EA",
    effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", openEnded: false, timeZone: "Europe/London", owner: "Priya Nair", lastUpdated: "2026-10-12 11:05",
    parentId: "BL-001", adjustmentType: "PERCENT", adjustmentValue: -3, inheritanceMode: "LIVE_LINK", rounding: "2 decimals · NEAREST",
    lines: [
      { id: "L1", sku: "A-100", price: 106.7, calculatedPrice: 106.7, uom: "EA", minQty: 1, effectiveFrom: "2026-01-01", allowZeroPrice: false, derivationChain: "BL-001 110.00 × 0.97" },
      { id: "L2", sku: "EW-3100", price: 668.33, calculatedPrice: 668.33, uom: "EA", minQty: 1, effectiveFrom: "2026-01-01", allowZeroPrice: false, derivationChain: "BL-001 689.00 × 0.97" },
      { id: "L3", sku: "LT-PNL-60", price: 33.47, calculatedPrice: 33.47, uom: "EA", minQty: 1, effectiveFrom: "2026-01-01", allowZeroPrice: false, derivationChain: "BL-001 34.50 × 0.97" },
    ],
  },
  {
    id: "CL-001", name: "Edmundson Customer List", type: "CUSTOMER", status: "ACTIVE", version: 3, currency: "GBP", region: "UK", channel: "Distributor", segment: "Distributor", uom: "EA",
    effectiveFrom: "2026-01-01", openEnded: true, timeZone: "Europe/London", owner: "Riya Shah", lastUpdated: "2026-10-12 11:06",
    parentId: "SL-001", adjustmentType: "PERCENT", adjustmentValue: -5, inheritanceMode: "LIVE_LINK", rounding: "2 decimals · NEAREST",
    lines: [
      { id: "L1", sku: "A-100", price: 100, calculatedPrice: 101.37, overridePrice: 100, overrideReason: "STRATEGIC_ACCOUNT", overrideExpires: "2026-12-31", uom: "EA", minQty: 1, effectiveFrom: "2026-01-01", allowZeroPrice: false, derivationChain: "BL-001 110.00 × 0.97 × 0.95" },
      { id: "L2", sku: "EW-3100", price: 634.91, calculatedPrice: 634.91, uom: "EA", minQty: 1, effectiveFrom: "2026-01-01", allowZeroPrice: false, derivationChain: "BL-001 689.00 × 0.97 × 0.95" },
      { id: "L3", sku: "LT-PNL-60", price: 29.5, calculatedPrice: 31.8, overridePrice: 29.5, overrideReason: "COMPETITIVE_RESPONSE", overrideExpires: "2026-09-30", uom: "EA", minQty: 1, effectiveFrom: "2026-01-01", allowZeroPrice: false, derivationChain: "BL-001 34.50 × 0.97 × 0.95" },
    ],
  },
  {
    id: "EU-026", name: "EU Base 2026", type: "BASE", status: "ACTIVE", version: 5, currency: "EUR", region: "EU", channel: "All", segment: "All", uom: "EA",
    effectiveFrom: "2026-01-01", effectiveTo: "2026-12-31", openEnded: false, timeZone: "Europe/Berlin", owner: "Priya Nair", lastUpdated: "2026-09-02 16:20", rounding: "2 decimals · NEAREST",
    lines: [
      { id: "L1", sku: "A-100", price: 128, uom: "EA", minQty: 1, effectiveFrom: "2026-01-01", allowZeroPrice: false },
      { id: "L2", sku: "LT-PNL-60", price: 39.9, uom: "EA", minQty: 1, effectiveFrom: "2026-01-01", allowZeroPrice: false },
    ],
  },
  {
    id: "BL-002", name: "UK Base 2027", type: "BASE", status: "SCHEDULED", version: 1, currency: "GBP", region: "UK", channel: "All", segment: "All", uom: "EA",
    effectiveFrom: "2027-01-01", openEnded: true, timeZone: "Europe/London", owner: "Priya Nair", submittedBy: "Priya Nair", lastUpdated: "2026-10-20 10:00", rounding: "2 decimals · NEAREST",
    lines: [
      { id: "L1", sku: "A-100", price: 115.5, uom: "EA", minQty: 1, effectiveFrom: "2027-01-01", allowZeroPrice: false },
      { id: "L2", sku: "EW-3100", price: 709, uom: "EA", minQty: 1, effectiveFrom: "2027-01-01", allowZeroPrice: false },
    ],
  },
  {
    id: "PR-011", name: "Winter Lighting Promo", type: "PROMOTIONAL", status: "SUBMITTED", version: 1, currency: "GBP", region: "UK", channel: "Retail", segment: "Retailer", uom: "EA",
    effectiveFrom: "2026-12-01", effectiveTo: "2027-01-31", openEnded: false, timeZone: "Europe/London", owner: "Riya Shah", submittedBy: "Riya Shah", lastUpdated: "2026-10-28 15:30", rounding: "2 decimals · UP",
    lines: [
      { id: "L1", sku: "LT-PNL-60", price: 29.99, uom: "EA", minQty: 1, effectiveFrom: "2026-12-01", allowZeroPrice: false },
      { id: "L2", sku: "LT-DWN-10", price: 79, uom: "BOX", minQty: 1, effectiveFrom: "2026-12-01", allowZeroPrice: false },
    ],
  },
  {
    id: "IN-004", name: "India Channel Q1 2027", type: "CHANNEL", status: "DRAFT", version: 1, currency: "INR", region: "India", channel: "Distributor", segment: "Distributor", uom: "EA",
    effectiveFrom: "2027-01-01", effectiveTo: "2027-03-31", openEnded: false, timeZone: "Asia/Kolkata", owner: "Riya Shah", lastUpdated: "2026-10-29 09:12", rounding: "0 decimals · NEAREST",
    lines: [
      { id: "L1", sku: "LT-PNL-60", price: 2650, uom: "EA", minQty: 1, effectiveFrom: "2027-01-01", allowZeroPrice: false },
      { id: "L2", sku: "SW-RCD-63", price: null, uom: "EA", minQty: 1, effectiveFrom: "2027-01-01", allowZeroPrice: false },
    ],
  },
  {
    id: "BL-000", name: "UK Base 2025", type: "BASE", status: "SUPERSEDED", version: 6, currency: "GBP", region: "UK", channel: "All", segment: "All", uom: "EA",
    effectiveFrom: "2025-01-01", effectiveTo: "2025-12-31", openEnded: false, timeZone: "Europe/London", owner: "Priya Nair", lastUpdated: "2026-01-01 00:00", rounding: "2 decimals · NEAREST",
    lines: [{ id: "L1", sku: "A-100", price: 100, uom: "EA", minQty: 1, effectiveFrom: "2025-01-01", allowZeroPrice: false }],
  },
  {
    id: "CT-210", name: "Acme Global Contract 2024–26", type: "CONTRACT", status: "EXPIRED", version: 2, currency: "USD", region: "North America", channel: "Direct", segment: "Strategic", uom: "EA",
    effectiveFrom: "2024-07-01", effectiveTo: "2026-06-30", openEnded: false, timeZone: "America/New_York", owner: "Neel Kamat", lastUpdated: "2026-07-01 00:00", rounding: "2 decimals · NEAREST",
    lines: [{ id: "L1", sku: "A-100", price: 95, uom: "EA", minQty: 1, effectiveFrom: "2024-07-01", allowZeroPrice: false }],
  },
  {
    id: "RG-007", name: "North America Regional", type: "REGIONAL", status: "CANCELLED", version: 1, currency: "USD", region: "North America", channel: "All", segment: "All", uom: "EA",
    effectiveFrom: "2026-09-01", effectiveTo: "2026-12-31", openEnded: false, timeZone: "America/Chicago", owner: "Neel Kamat", lastUpdated: "2026-08-20 13:00", rounding: "2 decimals · NEAREST",
    lines: [],
  },
];

export type ListVersion = { version: number; status: ListStatus; createdBy: string; createdAt: string; reason: string; lines: number };
export const LIST_VERSIONS: Record<string, ListVersion[]> = {
  "BL-001": [
    { version: 4, status: "ACTIVE", createdBy: "Priya Nair", createdAt: "2026-10-12 11:04", reason: "COST_INCREASE", lines: 6 },
    { version: 3, status: "SUPERSEDED", createdBy: "Priya Nair", createdAt: "2026-06-01 09:00", reason: "ANNUAL_PRICE_INCREASE", lines: 6 },
    { version: 2, status: "SUPERSEDED", createdBy: "Tom Hale", createdAt: "2026-03-15 14:22", reason: "CORRECTION", lines: 5 },
    { version: 1, status: "SUPERSEDED", createdBy: "Priya Nair", createdAt: "2025-12-01 10:00", reason: "ANNUAL_PRICE_INCREASE", lines: 5 },
  ],
};

export type ApprovalEvent = { at: string; actor: string; action: string; from: ListStatus | "—"; to: ListStatus; comment?: string };
export const LIST_APPROVAL_TRAIL: Record<string, ApprovalEvent[]> = {
  "BL-001": [
    { at: "2025-12-01 10:00", actor: "Priya Nair", action: "CREATE", from: "—", to: "DRAFT" },
    { at: "2025-12-02 09:14", actor: "Priya Nair", action: "SUBMIT", from: "DRAFT", to: "SUBMITTED" },
    { at: "2025-12-03 16:40", actor: "Neel Kamat (Pricing Manager)", action: "APPROVE", from: "SUBMITTED", to: "APPROVED", comment: "Aligned with FY26 plan" },
    { at: "2025-12-03 16:41", actor: "Neel Kamat (Pricing Manager)", action: "SCHEDULE", from: "APPROVED", to: "SCHEDULED" },
    { at: "2026-01-01 00:00", actor: "System · Activation job", action: "ACTIVATE", from: "SCHEDULED", to: "ACTIVE" },
  ],
};

/* ---------------- Bulk jobs ---------------- */

export type BulkJob = {
  id: string;
  targetList: string;
  method: (typeof BULK_METHODS)[number];
  value: string;
  selection: string;
  handling: (typeof GUARDRAIL_HANDLING)[number];
  status: (typeof JOB_STATUSES)[number];
  total: number;
  succeeded: number;
  failed: number;
  clamped: number;
  startedBy: string;
  startedAt: string;
  finishedAt?: string;
  published: boolean;
  rolledBack: boolean;
};
export const BULK_JOBS: BulkJob[] = [
  { id: "JOB-2291", targetList: "UK Base 2027", method: "PERCENTAGE", value: "+5%", selection: "Product Hierarchy: Electrical", handling: "CLAMP", status: "PARTIAL_SUCCESS", total: 100_000, succeeded: 99_880, failed: 120, clamped: 342, startedBy: "Priya Nair", startedAt: "2026-10-28 18:02", finishedAt: "2026-10-28 18:47", published: false, rolledBack: false },
  { id: "JOB-2288", targetList: "UK Distributor 2026", method: "COST_CHANGE", value: "Target margin 25%", selection: "Saved filter: Cable SKUs", handling: "SKIP", status: "SUCCEEDED", total: 4_210, succeeded: 4_210, failed: 0, clamped: 0, startedBy: "Tom Hale", startedAt: "2026-10-20 09:30", finishedAt: "2026-10-20 09:33", published: true, rolledBack: false },
  { id: "JOB-2290", targetList: "EU Base 2026", method: "CURRENCY_ADJUSTMENT", value: "GBP→EUR @ 1.17", selection: "Uploaded file: eu_skus.csv", handling: "FAIL", status: "RUNNING", total: 12_500, succeeded: 7_400, failed: 3, clamped: 0, startedBy: "Priya Nair", startedAt: "2026-10-29 14:01", published: false, rolledBack: false },
  { id: "JOB-2275", targetList: "UK Base 2026", method: "FIXED_AMOUNT", value: "+£0.50", selection: "Product List (14)", handling: "SKIP", status: "FAILED", total: 14, succeeded: 0, failed: 14, clamped: 0, startedBy: "Riya Shah", startedAt: "2026-10-02 12:00", finishedAt: "2026-10-02 12:00", published: false, rolledBack: false },
];

/* ---------------- Strategy ---------------- */

export type Condition = { attribute: string; operator: string; value: string; group?: number };
export type PricingRule = {
  id: string;
  name: string;
  type: RuleType;
  strategy: (typeof STRATEGIES)[number];
  status: (typeof RULE_STATUSES)[number];
  version: number;
  priority: number;
  conditions: Condition[];
  action: { type: (typeof RULE_ACTIONS)[number]; value?: string };
  effectiveFrom: string;
  effectiveTo?: string;
  owner: string;
  lastUpdated: string;
  reasonCode?: string;
};

export const RULES: PricingRule[] = [
  { id: "R-101", name: "Customer A — Widget", type: "CUSTOMER_PRICE", strategy: "VALUE_BASED", status: "ACTIVE", version: 1, priority: 10, conditions: [{ attribute: "Customer", operator: "Equal To", value: "Customer A" }, { attribute: "Product", operator: "Equal To", value: "Widget" }], action: { type: "SET_PRICE", value: "95.00" }, effectiveFrom: "2026-01-01", owner: "Neel Kamat", lastUpdated: "2026-01-02 10:00" },
  { id: "R-102", name: "Customer B — Widget", type: "CUSTOMER_PRICE", strategy: "VALUE_BASED", status: "ACTIVE", version: 1, priority: 10, conditions: [{ attribute: "Customer", operator: "Equal To", value: "Customer B" }, { attribute: "Product", operator: "Equal To", value: "Widget" }], action: { type: "SET_PRICE", value: "92.00" }, effectiveFrom: "2026-01-01", owner: "Neel Kamat", lastUpdated: "2026-01-02 10:00" },
  { id: "R-103", name: "Customer C — Widget", type: "CUSTOMER_PRICE", strategy: "VALUE_BASED", status: "ACTIVE", version: 1, priority: 10, conditions: [{ attribute: "Customer", operator: "Equal To", value: "Customer C" }, { attribute: "Product", operator: "Equal To", value: "Widget" }], action: { type: "SET_PRICE", value: "88.00" }, effectiveFrom: "2026-01-01", owner: "Neel Kamat", lastUpdated: "2026-01-02 10:00" },
  { id: "R-110", name: "SMB Discount", type: "DISCOUNT", strategy: "ATTRIBUTE_BASED", status: "ACTIVE", version: 3, priority: 30, conditions: [{ attribute: "Customer Segment", operator: "Equal To", value: "SMB" }], action: { type: "DISCOUNT_PCT", value: "4" }, effectiveFrom: "2026-01-01", owner: "Priya Nair", lastUpdated: "2026-04-11 13:20" },
  { id: "R-110v4", name: "SMB Discount", type: "DISCOUNT", strategy: "ATTRIBUTE_BASED", status: "DRAFT", version: 4, priority: 30, conditions: [{ attribute: "Customer Segment", operator: "Equal To", value: "SMB" }], action: { type: "DISCOUNT_PCT", value: "3" }, effectiveFrom: "2027-01-01", owner: "Priya Nair", lastUpdated: "2026-10-28 16:00", reasonCode: "ANNUAL_PRICE_INCREASE" },
  { id: "R-120", name: "Acme Combination Q4", type: "CONTRACT_PRICE", strategy: "VALUE_BASED", status: "ACTIVE", version: 2, priority: 5, conditions: [{ attribute: "Customer", operator: "Equal To", value: "Acme Global" }, { attribute: "Product", operator: "Equal To", value: "Widget" }, { attribute: "Quantity", operator: "Greater Than Equal To", value: "500" }, { attribute: "Date", operator: "Between", value: "2026-10-01 … 2026-12-31" }], action: { type: "SET_PRICE", value: "89.00" }, effectiveFrom: "2026-10-01", effectiveTo: "2026-12-31", owner: "Neel Kamat", lastUpdated: "2026-09-25 09:00" },
  { id: "R-130", name: "Cable Cost-Plus", type: "COST_PLUS", strategy: "COST_PLUS", status: "ACTIVE", version: 1, priority: 40, conditions: [{ attribute: "Product", operator: "In", value: "CB-2.5, CB-6.0" }], action: { type: "COST_PLUS_PCT", value: "35" }, effectiveFrom: "2026-07-01", owner: "Tom Hale", lastUpdated: "2026-06-28 11:00" },
  { id: "R-140", name: "Distributor Volume Tiers", type: "VOLUME_TIER", strategy: "MARKET_BASED", status: "ACTIVE", version: 2, priority: 20, conditions: [{ attribute: "Channel", operator: "Equal To", value: "Distributor" }], action: { type: "APPLY_TIERS", value: "1–99: 0% · 100–499: 3% · 500+: 6%" }, effectiveFrom: "2026-01-01", owner: "Priya Nair", lastUpdated: "2026-02-10 15:00" },
  { id: "R-150", name: "Copper-linked Cable Formula", type: "FORMULA", strategy: "COST_PLUS", status: "ACTIVE", version: 1, priority: 15, conditions: [{ attribute: "Product", operator: "In", value: "CB-2.5, CB-6.0" }, { attribute: "Geography", operator: "Equal To", value: "UK", group: 1 }, { attribute: "Geography", operator: "Equal To", value: "EU", group: 1 }], action: { type: "APPLY_FORMULA", value: "F-01 Commodity Pricing" }, effectiveFrom: "2026-07-01", owner: "Tom Hale", lastUpdated: "2026-06-30 11:00" },
  { id: "R-160", name: "Winter Lighting Promotion", type: "PROMOTION", strategy: "MARKET_BASED", status: "INACTIVE", version: 1, priority: 25, conditions: [{ attribute: "Product", operator: "In", value: "LT-PNL-60, LT-DWN-10" }, { attribute: "Channel", operator: "Equal To", value: "Retail" }], action: { type: "DISCOUNT_PCT", value: "12" }, effectiveFrom: "2025-12-01", effectiveTo: "2026-01-31", owner: "Riya Shah", lastUpdated: "2026-02-01 00:00" },
  { id: "R-090", name: "UK Regional Uplift", type: "REGIONAL_PRICE", strategy: "COMPETITIVE_BENCHMARK", status: "SUPERSEDED", version: 1, priority: 35, conditions: [{ attribute: "Geography", operator: "Equal To", value: "UK" }], action: { type: "MARKUP_PCT", value: "2" }, effectiveFrom: "2025-01-01", effectiveTo: "2025-12-31", owner: "Priya Nair", lastUpdated: "2026-01-01 00:00" },
];

export type Segment = {
  id: string;
  name: string;
  kind: "CUSTOMER" | "PRODUCT";
  method: (typeof SEGMENT_METHODS)[number];
  definition: string;
  priority: number;
  members: number;
  status: "ACTIVE" | "DRAFT";
  priceStructure?: string;
  volumeMetric?: (typeof VOLUME_METRICS)[number];
  trailingMonths?: number;
  threshold?: number;
  modelVersion?: string;
  confidence?: number;
  lastEvaluated: string;
  /** Definition version; changing an active segment creates the next version. Defaults to 1. */
  version?: number;
  reasonCode?: string;
  changedBy?: string;
  changedAt?: string;
};

export const SEGMENTS: Segment[] = [
  { id: "SG-01", name: "Strategic", kind: "CUSTOMER", method: "MANUAL", definition: "Manually curated strategic accounts", priority: 1, members: 6, status: "ACTIVE", priceStructure: "Contract lists", lastEvaluated: "2026-10-29 01:30" },
  { id: "SG-02", name: "Enterprise", kind: "CUSTOMER", method: "ATTRIBUTE", definition: "Annual revenue > 100M", priority: 15, members: 42, status: "ACTIVE", priceStructure: "UK Base 2026 −2%", lastEvaluated: "2026-10-29 01:30" },
  { id: "SG-03", name: "Mid-Market", kind: "CUSTOMER", method: "VOLUME", definition: "Rolling 12-month REVENUE ≥ 1,000,000", priority: 20, members: 188, status: "ACTIVE", priceStructure: "UK Base 2026", volumeMetric: "REVENUE", trailingMonths: 12, threshold: 1_000_000, lastEvaluated: "2026-10-29 01:30" },
  { id: "SG-04", name: "SMB", kind: "CUSTOMER", method: "VOLUME", definition: "Rolling 12-month REVENUE < 1,000,000", priority: 30, members: 1_204, status: "ACTIVE", priceStructure: "UK Base 2026 + SMB Discount", volumeMetric: "REVENUE", trailingMonths: 12, threshold: 0, lastEvaluated: "2026-10-29 01:30" },
  { id: "SG-05", name: "Distributor", kind: "CUSTOMER", method: "ATTRIBUTE", definition: "Channel = Distributor", priority: 10, members: 37, status: "ACTIVE", priceStructure: "UK Distributor 2026", lastEvaluated: "2026-10-29 01:30" },
  { id: "SG-06", name: "Retailer", kind: "CUSTOMER", method: "AI_DERIVED", definition: "Cluster #4 — high frequency, low basket", priority: 40, members: 311, status: "ACTIVE", modelVersion: "seg-km-2026.09", confidence: 0.82, lastEvaluated: "2026-10-29 01:30" },
  { id: "SG-11", name: "Premium", kind: "PRODUCT", method: "ATTRIBUTE", definition: "Margin ≥ 40% AND Brand In (AirFlow, Warmly)", priority: 10, members: 86, status: "ACTIVE", lastEvaluated: "2026-10-29 01:35" },
  { id: "SG-12", name: "Standard", kind: "PRODUCT", method: "ATTRIBUTE", definition: "Default product segment", priority: 50, members: 2_410, status: "ACTIVE", lastEvaluated: "2026-10-29 01:35" },
  { id: "SG-13", name: "Commodity", kind: "PRODUCT", method: "ATTRIBUTE", definition: "Category In (Cable, Fasteners) AND price elasticity > 1.5", priority: 20, members: 640, status: "ACTIVE", lastEvaluated: "2026-10-29 01:35" },
  { id: "SG-14", name: "Strategic", kind: "PRODUCT", method: "MANUAL", definition: "Manually curated", priority: 5, members: 24, status: "ACTIVE", lastEvaluated: "2026-10-29 01:35" },
  { id: "SG-15", name: "New Product", kind: "PRODUCT", method: "ATTRIBUTE", definition: "Lifecycle status = NEW", priority: 15, members: 31, status: "ACTIVE", lastEvaluated: "2026-10-29 01:35" },
  { id: "SG-16", name: "End-of-Life", kind: "PRODUCT", method: "ATTRIBUTE", definition: "Lifecycle status In (PHASE_OUT, END_OF_LIFE)", priority: 15, members: 58, status: "ACTIVE", lastEvaluated: "2026-10-29 01:35" },
];

export type PrecedenceVersion = {
  version: number;
  order: string[];
  tieBreaker: string;
  effectiveFrom: string;
  reasonCode: string;
  by: string;
  at: string;
  status: "PENDING_APPROVAL" | "SCHEDULED" | "ACTIVE" | "SUPERSEDED" | "REJECTED" | "WITHDRAWN";
  /** Approval decision (approve / reject) — approver must differ from `by`. */
  decidedBy?: string;
  decidedAt?: string;
  comment?: string;
};
export const PRECEDENCE_VERSIONS: PrecedenceVersion[] = [
  { version: 2, order: ["CONTRACT", "CUSTOMER", "SEGMENT", "CHANNEL", "REGIONAL", "STANDARD_LIST"], tieBreaker: "HIGHEST_PRIORITY", effectiveFrom: "2026-01-01", reasonCode: "CORRECTION", by: "Priya Nair", at: "2025-12-15 10:00", status: "ACTIVE" },
  { version: 1, order: ["CONTRACT", "SEGMENT", "CUSTOMER", "CHANNEL", "REGIONAL", "STANDARD_LIST"], tieBreaker: "LOWEST_PRICE", effectiveFrom: "2025-01-01", reasonCode: "OTHER", by: "Priya Nair", at: "2024-12-10 10:00", status: "SUPERSEDED" },
];

export type FormulaVar = { name: string; sourceType: (typeof FORMULA_SOURCE_TYPES)[number]; source: string; sample: number; unit: string };
export type Formula = {
  id: string;
  name: string;
  expression: string;
  variables: FormulaVar[];
  rounding: { decimals: number; mode: (typeof ROUNDING_MODES)[number] };
  maxResult?: number;
  minResult?: number;
  trigger: (typeof RECALC_TRIGGERS)[number];
  status: "DRAFT" | "ACTIVE" | "INACTIVE";
  testsPassed: number;
  currency: string;
  affectedLines: number;
  lastUpdated: string;
};
export const FORMULAS: Formula[] = [
  {
    id: "F-01", name: "Commodity Pricing", expression: "CommodityIndex + Freight + ProcessingCost + Margin",
    variables: [
      { name: "CommodityIndex", sourceType: "INDEX", source: "LME Copper (GBP/kg)", sample: 60, unit: "GBP" },
      { name: "Freight", sourceType: "COST_TYPE", source: "FREIGHT", sample: 5, unit: "GBP" },
      { name: "ProcessingCost", sourceType: "COST_TYPE", source: "MANUFACTURING", sample: 10, unit: "GBP" },
      { name: "Margin", sourceType: "CONSTANT", source: "15.00", sample: 15, unit: "GBP" },
    ],
    rounding: { decimals: 2, mode: "NEAREST" }, maxResult: 100, trigger: "ON_INPUT_CHANGE", status: "ACTIVE", testsPassed: 3, currency: "GBP", affectedLines: 214, lastUpdated: "2026-10-28 08:00",
  },
  {
    id: "F-02", name: "Landed Cost-Plus (EUR)", expression: "ROUND((LandedCost + Tariff) * FX_GBP_EUR * 1.32, 2)",
    variables: [
      { name: "LandedCost", sourceType: "COST_TYPE", source: "LANDED", sample: 78.4, unit: "GBP" },
      { name: "Tariff", sourceType: "COST_TYPE", source: "TARIFF", sample: 2.1, unit: "GBP" },
      { name: "FX_GBP_EUR", sourceType: "FX_RATE", source: "ECB daily", sample: 1.17, unit: "rate" },
    ],
    rounding: { decimals: 2, mode: "UP" }, trigger: "SCHEDULED", status: "DRAFT", testsPassed: 0, currency: "EUR", affectedLines: 0, lastUpdated: "2026-10-29 10:20",
  },
];

export const FORMULA_RECALC_LOG = [
  { at: "2026-10-28 08:00", formula: "F-01", trigger: "INDEX_CHANGE · CommodityIndex 60 → 66", linesAffected: 214, sample: "CB-2.5 90.00 → 96.00", status: "SUCCEEDED" },
  { at: "2026-10-14 08:00", formula: "F-01", trigger: "INDEX_CHANGE · CommodityIndex 63 → 60", linesAffected: 214, sample: "CB-2.5 93.00 → 90.00", status: "SUCCEEDED" },
];

export type Guardrail = {
  id: string;
  scopeLevel: "GLOBAL" | "SEGMENT" | "CUSTOMER";
  scope: string;
  product: string;
  priceFloor?: number;
  priceCeiling?: number;
  minMarginPct?: number;
  maxDiscountPct?: number;
  maxDiscountNoApprovalPct?: number;
  enforcement: (typeof ENFORCEMENT_MODES)[number];
  currency: string;
  effectiveFrom: string;
  effectiveTo?: string;
  version: number;
  status: "ACTIVE" | "SCHEDULED" | "SUPERSEDED";
  reasonCode: string;
  lastChangedBy: string;
  lastChangedAt: string;
};
export const GUARDRAILS: Guardrail[] = [
  { id: "G-001", scopeLevel: "GLOBAL", scope: "All customers", product: "All products", minMarginPct: 20, maxDiscountPct: 30, maxDiscountNoApprovalPct: 10, enforcement: "REQUIRE_APPROVAL", currency: "GBP", effectiveFrom: "2026-01-01", version: 3, status: "ACTIVE", reasonCode: "ANNUAL_PRICE_INCREASE", lastChangedBy: "Neel Kamat", lastChangedAt: "2025-12-12 10:00" },
  { id: "G-010", scopeLevel: "SEGMENT", scope: "SMB", product: "Widget", priceFloor: 40, priceCeiling: 60, enforcement: "HARD_BLOCK", currency: "GBP", effectiveFrom: "2026-11-01", version: 1, status: "SCHEDULED", reasonCode: "OTHER", lastChangedBy: "Priya Nair", lastChangedAt: "2026-10-29 11:00" },
  { id: "G-011", scopeLevel: "SEGMENT", scope: "Distributor", product: "All products", minMarginPct: 22, maxDiscountPct: 15, enforcement: "REQUIRE_APPROVAL", currency: "GBP", effectiveFrom: "2026-01-01", version: 2, status: "ACTIVE", reasonCode: "COMPETITIVE_RESPONSE", lastChangedBy: "Neel Kamat", lastChangedAt: "2026-03-02 09:00" },
  { id: "G-020", scopeLevel: "CUSTOMER", scope: "Edmundson Electrical Group Ltd", product: "A-100", priceCeiling: 60, enforcement: "WARN", currency: "GBP", effectiveFrom: "2026-01-01", version: 1, status: "ACTIVE", reasonCode: "STRATEGIC_ACCOUNT", lastChangedBy: "Riya Shah", lastChangedAt: "2026-01-05 12:00" },
];

/* ---------------- Repricing ---------------- */

export type RepricingRule = {
  id: string;
  name: string;
  trigger: (typeof REPRICING_TRIGGERS)[number];
  scope: string;
  targetMarginPct?: number;
  minChangePct: number;
  maxIncreasePct: number;
  maxDecreasePct: number;
  cooldownHours: number;
  autoApprove: boolean;
  competitorStrategy?: (typeof COMPETITOR_STRATEGIES)[number];
  undercutPct?: number;
  marginFloorPct?: number;
  status: "ACTIVE" | "INACTIVE" | "DRAFT";
};
export const REPRICING_RULES: RepricingRule[] = [
  { id: "RP-01", name: "Widget margin keeper", trigger: "COST_CHANGE", scope: "Widget · UK Base 2026", targetMarginPct: 25, minChangePct: 1, maxIncreasePct: 8, maxDecreasePct: 5, cooldownHours: 24, autoApprove: false, status: "ACTIVE" },
  { id: "RP-02", name: "Cable copper follow", trigger: "INDEX_CHANGE", scope: "Cable · all lists", minChangePct: 0.5, maxIncreasePct: 10, maxDecreasePct: 10, cooldownHours: 12, autoApprove: true, status: "ACTIVE" },
  { id: "RP-03", name: "E-com match lowest", trigger: "COMPETITOR_PRICE_CHANGE", scope: "Lighting · E-commerce", minChangePct: 1, maxIncreasePct: 5, maxDecreasePct: 8, cooldownHours: 6, autoApprove: true, competitorStrategy: "MATCH_LOWEST", marginFloorPct: 22, status: "ACTIVE" },
];

export type Proposal = {
  id: string;
  sku: string;
  ruleId: string;
  trigger: string;
  eventId: string;
  currentPrice: number;
  proposedPrice: number;
  uncappedPrice: number;
  flags: string[];
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED" | "SUPPRESSED";
  createdAt: string;
  note?: string;
};
export const PROPOSALS: Proposal[] = [
  { id: "PCP-501", sku: "A-100", ruleId: "RP-01", trigger: "COST_CHANGE · STANDARD 70 → 78.40 (+12%)", eventId: "EVT-77", currentPrice: 110, proposedPrice: 118.8, uncappedPrice: 123.2, flags: ["Capped at maxIncreasePct 8%"], status: "PENDING_APPROVAL", createdAt: "2026-10-29 12:10" },
  { id: "PCP-502", sku: "A-100", ruleId: "RP-01", trigger: "COST_CHANGE · FREIGHT 5 → 5.40", eventId: "EVT-79", currentPrice: 110, proposedPrice: 110, uncappedPrice: 110.6, flags: [], status: "SUPPRESSED", createdAt: "2026-10-29 14:10", note: "Suppressed by cooldown (24h; last proposal 2h ago)" },
  { id: "PCP-503", sku: "LT-PNL-60", ruleId: "RP-03", trigger: "COMPETITOR_PRICE_CHANGE · VoltDirect 31.99 → 22.49", eventId: "EVT-81", currentPrice: 34.5, proposedPrice: 23.33, uncappedPrice: 22.49, flags: ["Capped by guardrail — 22% margin floor"], status: "PENDING_APPROVAL", createdAt: "2026-10-29 09:42" },
  { id: "PCP-504", sku: "CB-2.5", ruleId: "RP-02", trigger: "INDEX_CHANGE · Copper 60 → 66", eventId: "EVT-74", currentPrice: 90, proposedPrice: 96, uncappedPrice: 96, flags: [], status: "APPROVED", createdAt: "2026-10-28 08:00", note: "Auto-approved (inside policy)" },
  { id: "PCP-505", sku: "LT-DWN-10", ruleId: "RP-03", trigger: "COMPETITOR_PRICE_CHANGE · BrightCo 82.00", eventId: "EVT-83", currentPrice: 79, proposedPrice: 79, uncappedPrice: 79, flags: ["Competitor data stale — ignored"], status: "SUPPRESSED", createdAt: "2026-10-29 10:05", note: "competitor data stale" },
];

/* ---------------- Optimization ---------------- */

export type Factor = { name: string; direction: "up" | "down"; contribution: number };
export type Recommendation = {
  id: string;
  sku: string;
  product: string;
  customer: string;
  currentPrice: number;
  suggestedPrice: number;
  currency: string;
  uom: string;
  marginImpact: number;
  confidence: number;
  method: "ML" | "RULE_BASED";
  coldStartReason?: string;
  runId: string;
  objective: (typeof OBJECTIVES)[number];
  expiresAt: string;
  expired: boolean;
  guardrailBreach?: boolean;
  status: "OPEN" | "ACCEPTED" | "MODIFIED" | "REJECTED" | "EXPIRED";
  factors: Factor[];
  missingInputs?: string[];
};
export const LOW_CONFIDENCE_THRESHOLD = 0.6;
export const RECOMMENDATIONS: Recommendation[] = [
  { id: "REC-9001", sku: "A-100", product: "Widget", customer: "Edmundson Electrical Group Ltd", currentPrice: 100, suggestedPrice: 104.5, currency: "GBP", uom: "EA", marginImpact: 18_400, confidence: 0.86, method: "ML", runId: "RUN-31", objective: "MAX_MARGIN", expiresAt: "2026-11-12", expired: false, status: "OPEN",
    factors: [{ name: "Elasticity (−0.42, inelastic)", direction: "up", contribution: 34 }, { name: "Win rate at price point (71%)", direction: "up", contribution: 22 }, { name: "Cost change (+5.7%)", direction: "up", contribution: 19 }, { name: "Competitor index (1.04)", direction: "up", contribution: 15 }, { name: "Segment target margin (Distributor 24%)", direction: "down", contribution: 10 }] },
  { id: "REC-9002", sku: "EW-3100", product: "MVHR Unit 310", customer: "A. Webb Electrical Wholesalers Group Ltd", currentPrice: 668.33, suggestedPrice: 689, currency: "GBP", uom: "EA", marginImpact: 9_920, confidence: 0.74, method: "ML", runId: "RUN-31", objective: "MAX_MARGIN", expiresAt: "2026-11-12", expired: false, status: "OPEN",
    factors: [{ name: "Win rate at price point (82%)", direction: "up", contribution: 30 }, { name: "Elasticity (−0.6)", direction: "up", contribution: 26 }, { name: "Segment target margin", direction: "up", contribution: 18 }, { name: "Seasonality (Q4 demand)", direction: "up", contribution: 14 }, { name: "Competitor index (0.97)", direction: "down", contribution: 12 }] },
  { id: "REC-9003", sku: "LT-PNL-60", product: "LED Panel 600x600", customer: "Urban Electricals", currentPrice: 34.5, suggestedPrice: 31.2, currency: "GBP", uom: "EA", marginImpact: -1_150, confidence: 0.65, method: "ML", runId: "RUN-32", objective: "PROTECT_SHARE", expiresAt: "2026-11-05", expired: false, status: "OPEN",
    factors: [{ name: "Competitor index (0.88)", direction: "down", contribution: 41 }, { name: "Win rate at price point (38%)", direction: "down", contribution: 24 }, { name: "Elasticity (−1.9, elastic)", direction: "down", contribution: 17 }, { name: "Inventory (overstock 14 wks)", direction: "down", contribution: 11 }, { name: "Cost change (0%)", direction: "up", contribution: 7 }] },
  { id: "REC-9004", sku: "SW-RCD-63", product: "RCD 63A Type A", customer: "Rashi Electronics Group", currentPrice: 38, suggestedPrice: 40.1, currency: "GBP", uom: "EA", marginImpact: 2_310, confidence: 0.52, method: "ML", runId: "RUN-32", objective: "PROTECT_SHARE", expiresAt: "2026-11-05", expired: false, status: "OPEN", missingInputs: ["Inventory"],
    factors: [{ name: "Cost change (+3.1%)", direction: "up", contribution: 33 }, { name: "Segment target margin", direction: "up", contribution: 25 }, { name: "Elasticity (−0.8)", direction: "up", contribution: 18 }, { name: "Win rate at price point (55%)", direction: "down", contribution: 14 }, { name: "Competitor index (1.00)", direction: "up", contribution: 10 }] },
  { id: "REC-9005", sku: "EW-3110", product: "MVHR Unit 310 Plus", customer: "Acme UK", currentPrice: 780, suggestedPrice: 747, currency: "GBP", uom: "EA", marginImpact: 0, confidence: 0.4, method: "RULE_BASED", coldStartReason: "Only 7 observations (minimum 50) — new product launched 2026-10-01", runId: "RUN-31", objective: "MAX_MARGIN", expiresAt: "2026-11-12", expired: false, status: "OPEN",
    factors: [{ name: "Cost-plus default (LANDED + 50%)", direction: "up", contribution: 100 }] },
  { id: "REC-8890", sku: "HT-ELE-2K", product: "Electric Panel Heater 2kW", customer: "Arrow Electronics India Group", currentPrice: 149, suggestedPrice: 156, currency: "GBP", uom: "EA", marginImpact: 3_480, confidence: 0.79, method: "ML", runId: "RUN-29", objective: "MAX_REVENUE", expiresAt: "2026-10-20", expired: true, status: "EXPIRED",
    factors: [{ name: "Seasonality (winter)", direction: "up", contribution: 38 }, { name: "Elasticity (−0.5)", direction: "up", contribution: 22 }, { name: "Win rate", direction: "up", contribution: 16 }, { name: "Competitor index", direction: "up", contribution: 14 }, { name: "Cost change", direction: "up", contribution: 10 }] },
  { id: "REC-8870", sku: "CB-6.0", product: "Twin & Earth Cable 6mm", customer: "Acme US", currentPrice: 2.4, suggestedPrice: 2.52, currency: "GBP", uom: "M", marginImpact: 6_100, confidence: 0.91, method: "ML", runId: "RUN-29", objective: "MAX_MARGIN", expiresAt: "2026-11-01", expired: false, status: "ACCEPTED",
    factors: [{ name: "Cost change (+6%)", direction: "up", contribution: 40 }, { name: "Elasticity", direction: "up", contribution: 20 }, { name: "Win rate", direction: "up", contribution: 15 }, { name: "Competitor index", direction: "up", contribution: 15 }, { name: "Segment target", direction: "up", contribution: 10 }] },
];

export type OptRun = {
  id: string;
  name: string;
  objective: (typeof OBJECTIVES)[number];
  targetMarginPct?: number;
  scope: string;
  inputs: string[];
  status: (typeof RUN_STATUSES)[number];
  recommendations: number;
  avgConfidence?: number;
  modelVersion: string;
  createdBy: string;
  createdAt: string;
  note?: string;
};
export const OPT_RUNS: OptRun[] = [
  { id: "RUN-32", name: "Lighting share defence", objective: "PROTECT_SHARE", scope: "Lighting · UK · Retail", inputs: ["Historical demand", "Seasonality", "Customer segment", "Product", "Geography"], status: "COMPLETED", recommendations: 412, avgConfidence: 0.63, modelVersion: "elast-gbm-3.2", createdBy: "Riya Shah", createdAt: "2026-10-28 20:00", note: "Inventory data unavailable — confidence reduced" },
  { id: "RUN-31", name: "Q4 margin capture", objective: "MAX_MARGIN", scope: "All · UK · Distributor", inputs: [...DEMAND_INPUTS], status: "COMPLETED", recommendations: 1_288, avgConfidence: 0.77, modelVersion: "elast-gbm-3.2", createdBy: "Priya Nair", createdAt: "2026-10-27 20:00" },
  { id: "RUN-33", name: "Volume push Q1", objective: "MAX_VOLUME", scope: "Cable · UK", inputs: [...DEMAND_INPUTS], status: "RUNNING", recommendations: 0, modelVersion: "elast-gbm-3.2", createdBy: "Tom Hale", createdAt: "2026-10-29 13:40" },
  { id: "RUN-34", name: "Enterprise target margin", objective: "TARGET_MARGIN", targetMarginPct: 28, scope: "Enterprise · All regions", inputs: ["Historical demand", "Customer segment", "Product"], status: "DRAFT", recommendations: 0, modelVersion: "elast-gbm-3.2", createdBy: "Priya Nair", createdAt: "2026-10-29 10:00" },
  { id: "RUN-30", name: "India revenue test", objective: "MAX_REVENUE", scope: "All · India", inputs: [...DEMAND_INPUTS], status: "FAILED", recommendations: 0, modelVersion: "elast-gbm-3.1", createdBy: "Riya Shah", createdAt: "2026-10-20 20:00", note: "Training data below 24 months for India (14 months)" },
];

export const ELASTICITY_MODELS = [
  { version: "elast-gbm-3.2", status: "ACTIVE", trainingWindow: "2024-10-01 → 2026-09-30 (24 mo)", mape: 7.8, rmse: 0.112, r2: 0.84, trainedAt: "2026-10-26 02:00", retrain: "Weekly · Sun 02:00" },
  { version: "elast-gbm-3.1", status: "SUPERSEDED", trainingWindow: "2024-09-01 → 2026-08-31 (24 mo)", mape: 8.4, rmse: 0.121, r2: 0.81, trainedAt: "2026-10-19 02:00", retrain: "Weekly · Sun 02:00" },
  { version: "elast-loglin-1.0", status: "INACTIVE", trainingWindow: "2024-01-01 → 2025-12-31 (24 mo)", mape: 12.9, rmse: 0.18, r2: 0.66, trainedAt: "2026-01-05 02:00", retrain: "Manual" },
];

export type Simulation = {
  id: string;
  name: string;
  baseline: string;
  horizonMonths: number;
  elasticitySource: "MODEL" | "MANUAL" | "DEFAULT";
  modelVersion: string;
  createdBy: string;
  createdAt: string;
  scenarios: Array<{ name: string; change: string; revenue: number; volumePct: number; margin: number }>;
};
export const SIMULATION_BASELINE = { revenue: 84_000_000, volume: 1_920_000, margin: 21_400_000 };
export const SIMULATIONS: Simulation[] = [
  { id: "SIM-14", name: "FY27 list increase options", baseline: "Historical: Oct 2025 – Sep 2026", horizonMonths: 12, elasticitySource: "MODEL", modelVersion: "elast-gbm-3.2", createdBy: "Priya Nair", createdAt: "2026-10-27 16:00",
    scenarios: [{ name: "A +3%", change: "PERCENT +3", revenue: 2_500_000, volumePct: -1, margin: 1_100_000 }, { name: "B +5%", change: "PERCENT +5", revenue: 3_200_000, volumePct: -3, margin: 1_400_000 }] },
];

export type CompetitorObs = { id: string; sku: string; competitor: string; competitorSku: string; price: number; currency: string; observedAt: string; ageDays: number; source: "FEED" | "FILE" | "MANUAL" };
export const STALE_DAYS = 7;
export const COMPETITOR_OBS: CompetitorObs[] = [
  { id: "CO-1", sku: "A-100", competitor: "VoltDirect", competitorSku: "VD-W100", price: 104.99, currency: "GBP", observedAt: "2026-10-29 06:00", ageDays: 0, source: "FEED" },
  { id: "CO-2", sku: "A-100", competitor: "BrightCo", competitorSku: "BC-55120", price: 112.5, currency: "GBP", observedAt: "2026-10-27 06:00", ageDays: 2, source: "FEED" },
  { id: "CO-3", sku: "LT-PNL-60", competitor: "VoltDirect", competitorSku: "VD-PNL600", price: 22.49, currency: "GBP", observedAt: "2026-10-29 06:00", ageDays: 0, source: "FEED" },
  { id: "CO-4", sku: "LT-PNL-60", competitor: "LightHub", competitorSku: "LH-6060-40", price: 27.95, currency: "GBP", observedAt: "2026-10-28 11:20", ageDays: 1, source: "MANUAL" },
  { id: "CO-5", sku: "LT-DWN-10", competitor: "BrightCo", competitorSku: "BC-DL10", price: 82, currency: "GBP", observedAt: "2026-10-12 06:00", ageDays: 17, source: "FILE" },
  { id: "CO-6", sku: "SW-RCD-63", competitor: "VoltDirect", competitorSku: "VD-RCD63A", price: 36.4, currency: "GBP", observedAt: "2026-10-29 06:00", ageDays: 0, source: "FEED" },
];
export const COMPETITOR_MAPPINGS = [
  { competitor: "VoltDirect", competitorSku: "VD-W100", sku: "A-100", mappedBy: "Riya Shah", mappedAt: "2026-02-01" },
  { competitor: "BrightCo", competitorSku: "BC-55120", sku: "A-100", mappedBy: "Riya Shah", mappedAt: "2026-02-01" },
  { competitor: "VoltDirect", competitorSku: "VD-PNL600", sku: "LT-PNL-60", mappedBy: "Riya Shah", mappedAt: "2026-02-03" },
  { competitor: "LightHub", competitorSku: "LH-6060-40", sku: "LT-PNL-60", mappedBy: "Tom Hale", mappedAt: "2026-05-14" },
  { competitor: "BrightCo", competitorSku: "BC-DL10", sku: "LT-DWN-10", mappedBy: "Tom Hale", mappedAt: "2026-05-14" },
  { competitor: "VoltDirect", competitorSku: "VD-RCD63A", sku: "SW-RCD-63", mappedBy: "Riya Shah", mappedAt: "2026-06-20" },
];

/* ---------------- Data quality & audit ---------------- */

export type DqEntry = {
  id: string;
  entity: "Product" | "Customer" | "Cost" | "Competitor Price";
  sourceSystem: string;
  sourceId: string;
  code: string;
  message: string;
  firstSeen: string;
  lastSeen: string;
  occurrenceCount: number;
  status: DqStatus;
  owner: string;
  resolutionNote?: string;
  job: string;
};
export const DQ_LOG: DqEntry[] = [
  { id: "DQ-1001", entity: "Product", sourceSystem: "SAP", sourceId: "MAT-1", code: "MISSING_UOM", message: "Unit of Measure is required. Add a base UoM to the material in SAP (MM02 › Basic Data 1).", firstSeen: "2026-10-27 02:10", lastSeen: "2026-10-29 02:10", occurrenceCount: 3, status: "OPEN", owner: "Priya Nair", job: "SYNC-PROD-1029" },
  { id: "DQ-1002", entity: "Product", sourceSystem: "SAP", sourceId: "MAT-912", code: "DUPLICATE_SKU", message: "SKU A-100 already exists for source SAP (sourceId MAT-77). Existing product unchanged.", firstSeen: "2026-10-29 02:11", lastSeen: "2026-10-29 02:11", occurrenceCount: 1, status: "ACKNOWLEDGED", owner: "Priya Nair", job: "SYNC-PROD-1029" },
  { id: "DQ-1003", entity: "Customer", sourceSystem: "Salesforce", sourceId: "001Ax00000AcGl", code: "HIERARCHY_CYCLE", message: "Setting Acme Global as child of Acme US would create a cycle.", firstSeen: "2026-10-28 01:05", lastSeen: "2026-10-29 01:05", occurrenceCount: 2, status: "OPEN", owner: "Neel Kamat", job: "SYNC-CUST-1029" },
  { id: "DQ-1004", entity: "Customer", sourceSystem: "Salesforce", sourceId: "001Ax00000AcN5", code: "HIERARCHY_TOO_DEEP", message: "Customer would sit at level 5; configured maximum depth is 4.", firstSeen: "2026-10-29 01:05", lastSeen: "2026-10-29 01:05", occurrenceCount: 1, status: "FIXED_AT_SOURCE", owner: "Neel Kamat", job: "SYNC-CUST-1029" },
  { id: "DQ-1005", entity: "Customer", sourceSystem: "SAP", sourceId: "KUN-155777", code: "VALIDATION_REQUIRED", message: "Mandatory field missing: geography.", firstSeen: "2026-10-22 01:04", lastSeen: "2026-10-22 01:04", occurrenceCount: 1, status: "REPROCESSED", owner: "Riya Shah", job: "SYNC-CUST-1022", resolutionNote: "Country added in SAP; reprocessed OK" },
  { id: "DQ-1006", entity: "Cost", sourceSystem: "Landed Cost Engine", sourceId: "LC-A-100-2026H2", code: "COST_PERIOD_OVERLAP", message: "LANDED cost for A-100 2026-06-01…2027-06-01 overlaps existing 2026-01-01…2026-12-31.", firstSeen: "2026-10-26 03:05", lastSeen: "2026-10-26 03:05", occurrenceCount: 1, status: "OPEN", owner: "Tom Hale", job: "COST-ING-1026" },
  { id: "DQ-1007", entity: "Competitor Price", sourceSystem: "PriceSpider feed", sourceId: "row 418", code: "UNMAPPED_COMPETITOR_SKU", message: "Competitor SKU LH-DL10-W is not mapped to any product.", firstSeen: "2026-10-29 06:00", lastSeen: "2026-10-29 06:00", occurrenceCount: 1, status: "OPEN", owner: "Riya Shah", job: "COMP-FEED-1029" },
  { id: "DQ-1008", entity: "Product", sourceSystem: "SAP", sourceId: "MAT-430", code: "MISSING_UOM", message: "Unit of Measure is required.", firstSeen: "2026-09-02 02:10", lastSeen: "2026-09-02 02:10", occurrenceCount: 1, status: "IGNORED", owner: "Priya Nair", job: "SYNC-PROD-0902", resolutionNote: "Discontinued service material — not priced" },
];

export const SYNC_JOBS = [
  { id: "SYNC-PROD-1029", entity: "Product", source: "SAP (nightly batch)", started: "2026-10-29 02:00", finished: "2026-10-29 03:12", created: 500, updated: 200, failed: 10, status: "PARTIAL_SUCCESS" },
  { id: "SYNC-CUST-1029", entity: "Customer", source: "Salesforce (nightly batch)", started: "2026-10-29 01:00", finished: "2026-10-29 01:22", created: 14, updated: 61, failed: 2, status: "PARTIAL_SUCCESS" },
  { id: "SYNC-PROD-1028R", entity: "Product", source: "SAP (re-import of 1028 file)", started: "2026-10-28 15:00", finished: "2026-10-28 15:20", created: 0, updated: 0, failed: 0, status: "SUCCEEDED" },
];

export type AuditEntry = {
  id: string;
  at: string;
  actor: string;
  entity: string;
  record: string;
  action: string;
  field?: string;
  before?: string;
  after?: string;
  reasonCode?: string;
  reasonText?: string;
  version?: string;
  correlationId: string;
};
export const AUDIT_LOG: AuditEntry[] = [
  { id: "AU-77001", at: "2026-10-29 11:02", actor: "Priya Nair", entity: "Price List", record: "UK Base 2026 · P-100", action: "PRICE_CHANGE", field: "price", before: "100.00", after: "110.00", reasonCode: "ANNUAL_PRICE_INCREASE", version: "v4", correlationId: "c-91ab01" },
  { id: "AU-77002", at: "2026-10-29 11:03", actor: "System · Derivation", entity: "Price List", record: "Edmundson Customer List · P-100", action: "RECALCULATED", field: "calculatedPrice", before: "92.15", after: "101.37", reasonCode: "ANNUAL_PRICE_INCREASE", version: "v3", correlationId: "c-91ab01" },
  { id: "AU-77003", at: "2026-10-28 16:00", actor: "Priya Nair", entity: "Pricing Rule", record: "SMB Discount", action: "NEW_VERSION", before: "v3 ACTIVE", after: "v4 DRAFT", reasonCode: "ANNUAL_PRICE_INCREASE", correlationId: "c-77de12" },
  { id: "AU-77004", at: "2026-10-28 18:47", actor: "Priya Nair", entity: "Bulk Job", record: "JOB-2291", action: "BULK_UPDATE", before: "—", after: "99,880 lines (+5%)", reasonCode: "ANNUAL_PRICE_INCREASE", version: "v1 draft", correlationId: "c-a0c331" },
  { id: "AU-77005", at: "2026-10-27 09:15", actor: "Riya Shah", entity: "Price List", record: "Edmundson Customer List · P-100", action: "OVERRIDE_SET", field: "overridePrice", before: "—", after: "100.00", reasonCode: "STRATEGIC_ACCOUNT", version: "v3", correlationId: "c-55f201" },
  { id: "AU-77006", at: "2026-10-26 10:00", actor: "Neel Kamat", entity: "Guardrail", record: "G-011 Distributor", action: "UPDATE", field: "minMarginPct", before: "20", after: "22", reasonCode: "COMPETITIVE_RESPONSE", version: "v2", correlationId: "c-1209ff" },
  { id: "AU-77007", at: "2026-10-25 14:30", actor: "Tom Hale", entity: "Price List", record: "UK Base 2026 · LT-PNL-60", action: "PRICE_CHANGE", field: "price", before: "33.00", after: "34.50", reasonCode: "OTHER", reasonText: "Supplier surcharge pass-through", version: "v4", correlationId: "c-88aa10" },
  { id: "AU-77008", at: "2026-10-24 09:00", actor: "Riya Shah", entity: "Recommendation", record: "REC-8870", action: "ACCEPT", before: "2.40", after: "2.52", correlationId: "c-0dd8e1" },
];

/* ---------------- Helpers ---------------- */

export const productBySku = (sku: string) => PRODUCTS.find((p) => p.sku === sku || p.productId === sku);
export const customerById = (id: string) => CUSTOMERS.find((c) => c.id === id);
export const priceListById = (id: string) => PRICE_LISTS.find((l) => l.id === id);
export const childrenOf = (id: string) => CUSTOMERS.filter((c) => c.parentId === id);
