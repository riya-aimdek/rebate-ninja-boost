import type { Condition, PricingRule } from "./data";

export function actionSummary(a: PricingRule["action"]): string {
  const v = a.value ?? "—";
  switch (a.type) {
    case "SET_PRICE":
      return `Set price to ${v}`;
    case "DISCOUNT_PCT":
      return `Discount ${v}%`;
    case "MARKUP_PCT":
      return `Markup ${v}%`;
    case "TARGET_MARGIN":
      return `Target margin ${v}%`;
    case "COST_PLUS_PCT":
      return `Cost + ${v}%`;
    case "APPLY_FORMULA":
      return `Apply formula ${v}`;
    case "APPLY_TIERS":
      return `Apply tiers (${v})`;
  }
}

/** Plain-English rendering: AND rows, plus OR-groups (same group number = OR). */
export function conditionSummary(conds: Condition[]): string {
  if (conds.length === 0) return "(no conditions)";
  const plain = conds.filter((c) => !c.group);
  const groups = new Map<number, Condition[]>();
  conds.filter((c) => c.group).forEach((c) => groups.set(c.group!, [...(groups.get(c.group!) ?? []), c]));
  const one = (c: Condition) => `${c.attribute} ${c.operator.toLowerCase()} ${c.value || "…"}`;
  const parts = [...plain.map(one), ...[...groups.values()].map((g) => `(${g.map(one).join(" OR ")})`)];
  return parts.join(" AND ");
}
