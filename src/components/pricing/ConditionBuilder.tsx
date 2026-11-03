import { useState } from "react";
import { AlertTriangle, Check, ChevronsUpDown, Plus, Trash2, X } from "lucide-react";
import { Btn, inputCls, notifyUndo } from "@/components/pricing/kit";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CHANNELS, CURRENCIES, CUSTOMERS, CUSTOMER_SEGMENTS, PRODUCTS, REGIONS, RULE_ATTRIBUTES, type Condition } from "@/lib/pricing/data";

/* ------------------------------------------------------------------ */
/* Attribute model: each attribute has a value kind, and the kind      */
/* decides which operators make sense and which input is shown.        */
/* ------------------------------------------------------------------ */

type Kind = "list" | "text" | "number" | "date";
type Option = { value: string; label: string; aliases?: string[] };

const GEOGRAPHIES = [...new Set<string>(["Global", ...REGIONS, ...CUSTOMERS.map((c) => c.geography)])];

const ATTRS: Record<string, { kind: Kind; options?: Option[]; noun: string; min?: number; integer?: boolean; example?: string }> = {
  Product: {
    kind: "list",
    noun: "product",
    // Stored by SKU; older rules that stored the product name still resolve.
    options: PRODUCTS.map((p) => ({
      value: p.sku,
      label: `${p.sku} · ${p.name}${p.lifecycleStatus === "BLOCKED" ? " (blocked)" : p.lifecycleStatus === "END_OF_LIFE" ? " (end of life)" : ""}`,
      aliases: [p.name, p.productId],
    })),
  },
  Customer: { kind: "list", noun: "customer", options: CUSTOMERS.map((c) => ({ value: c.name, label: `${c.name} (${c.id})`, aliases: [c.id] })) },
  "Customer Segment": { kind: "list", noun: "segment", options: CUSTOMER_SEGMENTS.map((s) => ({ value: s, label: s })) },
  Geography: { kind: "list", noun: "geography", options: GEOGRAPHIES.map((g) => ({ value: g, label: g })) },
  Channel: { kind: "list", noun: "channel", options: CHANNELS.map((c) => ({ value: c, label: c })) },
  Currency: { kind: "list", noun: "currency", options: CURRENCIES.map((c) => ({ value: c, label: c })) },
  Quantity: { kind: "number", noun: "quantity", min: 0, integer: true, example: "500" },
  Cost: { kind: "number", noun: "cost", min: 0, example: "70.00" },
  Date: { kind: "date", noun: "date" },
  Market: { kind: "text", noun: "market", example: "UK retail" },
  "Custom Attribute": { kind: "text", noun: "value", example: "Contract tier A" },
};
const meta = (attribute: string) => ATTRS[attribute] ?? ATTRS["Custom Attribute"];

/** Operators allowed per kind, with plain labels. Enum values stay as stored ("Equal To" …). */
const OPS: Record<Kind, Array<[string, string]>> = {
  list: [["Equal To", "is"], ["Not Equal To", "is not"], ["In", "is any of"], ["Not In", "is none of"]],
  text: [["Equal To", "is"], ["Not Equal To", "is not"], ["In", "is any of"], ["Not In", "is none of"]],
  number: [["Equal To", "equals"], ["Not Equal To", "does not equal"], ["Greater Than", "is more than"], ["Greater Than Equal To", "is at least"], ["Less Than", "is less than"], ["Less Than Equal To", "is at most"], ["Between", "is between"]],
  date: [["Equal To", "is on"], ["Greater Than", "is after"], ["Greater Than Equal To", "is on or after"], ["Less Than", "is before"], ["Less Than Equal To", "is on or before"], ["Between", "is between"]],
};
const opLabel = (c: Condition) => OPS[meta(c.attribute).kind].find(([v]) => v === c.operator)?.[1] ?? c.operator.toLowerCase();
const isMulti = (op: string) => op === "In" || op === "Not In";

const SEP = " … ";
const splitList = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);
const splitRange = (v: string): [string, string] => {
  const [a = "", b = ""] = v.split("…").map((s) => s.trim());
  return [a, b];
};

const findOption = (attribute: string, v: string) => meta(attribute).options?.find((o) => o.value === v || o.aliases?.includes(v));

/** Re-shapes a value when the operator changes, so nothing invalid is carried over. */
function convertValue(c: Condition, nextOp: string): string {
  const wasMulti = isMulti(c.operator);
  const wasRange = c.operator === "Between";
  if (nextOp === "Between") return wasRange ? c.value : "";
  if (wasRange) return "";
  if (isMulti(nextOp)) return c.value;
  return wasMulti ? (splitList(c.value)[0] ?? "") : c.value;
}

/* ------------------------------------------------------------------ */
/* Validation and summary — used by the rule page as well.             */
/* ------------------------------------------------------------------ */

/** Blocking problem with a condition, phrased as what to do next. */
export function conditionError(c: Condition): string | undefined {
  const m = meta(c.attribute);
  if (c.operator === "Between") {
    const [a, b] = splitRange(c.value);
    if (!a || !b) return `Enter both ends of the range.`;
    if (m.kind === "number" && Number(b) < Number(a)) return "The second value must be at least the first.";
    if (m.kind === "date" && b < a) return "The end date must be on or after the start date.";
    return undefined;
  }
  if (isMulti(c.operator)) return splitList(c.value).length ? undefined : `Choose at least one ${m.noun}.`;
  if (!c.value.trim()) return m.kind === "list" ? `Choose a ${m.noun}.` : `Enter a ${m.noun}${m.example ? `, e.g. ${m.example}` : ""}.`;
  if (m.kind === "number") {
    const n = Number(c.value);
    if (!Number.isFinite(n) || n < (m.min ?? 0)) return `Enter a ${m.noun} of ${m.min ?? 0} or more.`;
    if (m.integer && !Number.isInteger(n)) return `Enter a whole number.`;
  }
  return undefined;
}

/** Blocked products in a Product condition: the rule can be saved, but those prices are rejected. */
function blockedValues(c: Condition): string[] {
  if (c.attribute !== "Product" || c.operator === "Not Equal To" || c.operator === "Not In") return [];
  const vals = isMulti(c.operator) ? splitList(c.value) : c.value.trim() ? [c.value.trim()] : [];
  return vals.filter((v) => PRODUCTS.find((p) => p.sku === v || p.name === v || p.productId === v)?.lifecycleStatus === "BLOCKED");
}

/** Values not found in master data: allowed, but the rule will not match them. */
function unknownValues(c: Condition): string[] {
  const m = meta(c.attribute);
  if (m.kind !== "list") return [];
  const vals = isMulti(c.operator) ? splitList(c.value) : c.value.trim() ? [c.value.trim()] : [];
  return vals.filter((v) => !findOption(c.attribute, v));
}

const show = (c: Condition, v: string) => findOption(c.attribute, v)?.label ?? v;
function valueText(c: Condition) {
  if (c.operator === "Between") {
    const [a, b] = splitRange(c.value);
    return `${a || "…"} and ${b || "…"}`;
  }
  if (isMulti(c.operator)) {
    const l = splitList(c.value).map((v) => show(c, v));
    return l.length ? l.join(", ") : "…";
  }
  return c.value ? show(c, c.value) : "…";
}
const one = (c: Condition) => `${c.attribute} ${opLabel(c)} ${valueText(c)}`;

/** Plain-English "applies when" sentence: AND conditions, then each OR group in brackets. */
export function friendlySummary(conds: Condition[]): string {
  if (conds.length === 0) return "No conditions yet — the rule will not apply to anything.";
  const plain = conds.filter((c) => !c.group).map(one);
  const groups = new Map<number, Condition[]>();
  conds.forEach((c) => c.group && groups.set(c.group, [...(groups.get(c.group) ?? []), c]));
  const ors = [...groups.values()].map((g) => (g.length > 1 ? `(${g.map(one).join(" OR ")})` : one(g[0])));
  return [...plain, ...ors].join(" AND ");
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

/** Searchable picker over master data; single or multiple selection. */
function OptionPicker({
  id,
  attribute,
  multiple,
  value,
  onChange,
  disabled,
  invalid,
  describedBy,
  label,
}: {
  id: string;
  attribute: string;
  multiple: boolean;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const m = meta(attribute);
  const opts = m.options ?? [];
  const selected = multiple ? splitList(value) : value ? [value] : [];
  const isOn = (o: Option) => selected.some((v) => v === o.value || o.aliases?.includes(v));
  const pick = (o: Option) => {
    if (!multiple) {
      onChange(o.value);
      setOpen(false);
      return;
    }
    const rest = selected.filter((v) => v !== o.value && !o.aliases?.includes(v));
    onChange((isOn(o) ? rest : [...rest, o.value]).join(", "));
  };
  const remove = (v: string) => onChange(selected.filter((x) => x !== v).join(", "));

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label={label}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`${inputCls} h-auto min-h-10 flex items-center gap-2 text-left py-1.5 ${invalid ? "border-destructive" : ""} disabled:cursor-not-allowed`}
        >
          <span className="flex-1 min-w-0 flex flex-wrap gap-1">
            {selected.length === 0 && <span className="text-muted-foreground py-0.5">{multiple ? `Choose ${m.noun}s…` : `Choose a ${m.noun}…`}</span>}
            {!multiple && selected[0] && <span className="truncate py-0.5">{show({ attribute, operator: "Equal To", value: "" }, selected[0])}</span>}
            {multiple &&
              selected.map((v) => (
                <span
                  key={v}
                  title={show({ attribute, operator: "In", value: "" }, v)}
                  className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-medium max-w-full"
                >
                  {/* Products show the SKU in the chip; the full name is in the tooltip and the summary. */}
                  <span className="truncate">{attribute === "Product" ? (findOption(attribute, v)?.value ?? v) : show({ attribute, operator: "In", value: "" }, v)}</span>
                  {!disabled && (
                    <span
                      role="button"
                      tabIndex={-1}
                      aria-label={`Remove ${v}`}
                      className="hit rounded hover:text-destructive"
                      onPointerDown={(e) => {
                        // Remove the chip without opening the list.
                        e.preventDefault();
                        e.stopPropagation();
                        remove(v);
                      }}
                    >
                      <X className="size-3" aria-hidden />
                    </span>
                  )}
                </span>
              ))}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[min(22rem,calc(100vw-2rem))]" align="start">
        <Command>
          <CommandInput placeholder={`Search ${m.noun}s…`} />
          <CommandList>
            <CommandEmpty>No {m.noun} matches.</CommandEmpty>
            <CommandGroup>
              {opts.map((o) => (
                <CommandItem key={o.value} value={`${o.label} ${(o.aliases ?? []).join(" ")}`} onSelect={() => pick(o)}>
                  <Check className={`size-4 ${isOn(o) ? "opacity-100 text-brand" : "opacity-0"}`} aria-hidden />
                  {o.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function ValueInput({ c, i, name, onChange, disabled, err }: { c: Condition; i: number; name: string; onChange: (v: string) => void; disabled?: boolean; err?: string }) {
  const m = meta(c.attribute);
  const id = `rule-cond-${i}`;
  const describedBy = err ? `${id}-msg` : undefined;
  const typeAttr = m.kind === "number" ? "number" : m.kind === "date" ? "date" : "text";
  const numProps = m.kind === "number" ? { inputMode: (m.integer ? "numeric" : "decimal") as "numeric" | "decimal", min: m.min, step: m.integer ? 1 : "0.01" } : {};

  if (c.operator === "Between") {
    const [a, b] = splitRange(c.value);
    return (
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <input id={id} type={typeAttr} {...numProps} className={inputCls} value={a} placeholder={m.kind === "number" ? "From" : undefined} aria-label={`${name} from`} aria-invalid={!!err || undefined} aria-describedby={describedBy} disabled={disabled} onChange={(e) => onChange(`${e.target.value}${SEP}${b}`)} />
        <span className="text-xs text-muted-foreground">and</span>
        <input type={typeAttr} {...numProps} min={m.kind === "date" ? a || undefined : numProps.min} className={inputCls} value={b} placeholder={m.kind === "number" ? "To" : undefined} aria-label={`${name} to`} aria-invalid={!!err || undefined} disabled={disabled} onChange={(e) => onChange(`${a}${SEP}${e.target.value}`)} />
      </div>
    );
  }
  if (m.kind === "list") {
    return <OptionPicker id={id} attribute={c.attribute} multiple={isMulti(c.operator)} value={c.value} onChange={onChange} disabled={disabled} invalid={!!err} describedBy={describedBy} label={`${name} value`} />;
  }
  return (
    <input
      id={id}
      type={typeAttr}
      {...numProps}
      className={inputCls}
      value={c.value}
      placeholder={m.kind === "text" ? (isMulti(c.operator) ? `e.g. ${m.example}, other` : `e.g. ${m.example}`) : m.kind === "number" ? `e.g. ${m.example}` : undefined}
      aria-label={`${name} value`}
      aria-invalid={!!err || undefined}
      aria-describedby={describedBy}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Builder                                                             */
/* ------------------------------------------------------------------ */

export function ConditionBuilder({
  conditions,
  onChange,
  readOnly,
  showErrors,
  emptyError,
}: {
  conditions: Condition[];
  onChange: (next: Condition[] | ((cur: Condition[]) => Condition[])) => void;
  readOnly?: boolean;
  /** Show blocking errors (after the first save attempt). */
  showErrors: boolean;
  /** Shown on the empty state when saving without any condition. */
  emptyError?: string;
}) {
  const plainIdx = conditions.flatMap((c, i) => (c.group ? [] : [i]));
  const groupIds = [...new Set(conditions.flatMap((c) => (c.group ? [c.group] : [])))];
  const nextGroup = () => Math.max(0, ...conditions.map((c) => c.group ?? 0)) + 1;
  const focusLater = (id: string) => window.setTimeout(() => document.getElementById(id)?.focus(), 0);

  const set = (i: number, patch: Partial<Condition>) => onChange((cur) => cur.map((c, j) => (j === i ? { ...c, ...patch } : c)));
  const setAttribute = (i: number, attribute: string) => {
    const c = conditions[i];
    const allowed = OPS[meta(attribute).kind].map(([v]) => v);
    const operator = allowed.includes(c.operator) ? c.operator : allowed[0];
    // A new attribute has different values, so start the value fresh.
    set(i, { attribute, operator, value: "" });
  };
  const setOperator = (i: number, operator: string) => set(i, { operator, value: convertValue(conditions[i], operator) });

  const add = (group?: number) => {
    const at = conditions.length;
    onChange((cur) => [...cur, { attribute: group ? "Geography" : "Product", operator: "Equal To", value: "", group }]);
    focusLater(`rule-cond-${at}-attr`);
  };
  /** One click = one group, started with two options (an OR needs at least two). */
  const addGroup = () => {
    const g = nextGroup();
    const at = conditions.length;
    const blank: Condition = { attribute: "Geography", operator: "Equal To", value: "", group: g };
    onChange((cur) => [...cur, blank, { ...blank }]);
    focusLater(`rule-cond-${at}-attr`);
  };
  const remove = (i: number, name: string) => {
    const before = conditions;
    onChange((cur) => cur.filter((_, j) => j !== i));
    notifyUndo(`${name} removed`, () => onChange(before));
  };
  const removeGroup = (g: number, n: number) => {
    const before = conditions;
    onChange((cur) => cur.filter((c) => c.group !== g));
    notifyUndo(`OR group ${n} removed`, () => onChange(before));
  };

  const row = (i: number, label: string, name: string) => {
    const c = conditions[i];
    const err = showErrors ? conditionError(c) : undefined;
    const unknown = unknownValues(c);
    const blocked = blockedValues(c);
    return (
      <div key={i}>
        <div className="grid grid-cols-1 sm:grid-cols-[64px_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_40px] gap-2 items-start">
          <span className="text-sm font-medium text-foreground sm:pt-2.5">{label}</span>
          <select id={`rule-cond-${i}-attr`} className={inputCls} value={c.attribute} onChange={(e) => setAttribute(i, e.target.value)} disabled={readOnly} aria-label={`${name} attribute`}>
            {RULE_ATTRIBUTES.map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
          <select className={inputCls} value={c.operator} onChange={(e) => setOperator(i, e.target.value)} disabled={readOnly} aria-label={`${name} operator`}>
            {OPS[meta(c.attribute).kind].map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <div className="min-w-0">
            <ValueInput c={c} i={i} name={name} onChange={(value) => set(i, { value })} disabled={readOnly} err={err} />
            {err && (
              <p id={`rule-cond-${i}-msg`} className="text-xs text-destructive mt-1.5">
                {err}
              </p>
            )}
            {!err && unknown.length > 0 && (
              <p className="text-xs text-warning-foreground mt-1.5 flex items-start gap-1">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" aria-hidden />
                <span>
                  {unknown.join(", ")} {unknown.length === 1 ? "is" : "are"} not in the {meta(c.attribute).noun} master, so this condition won’t match until {unknown.length === 1 ? "it is" : "they are"} synced or replaced.
                </span>
              </p>
            )}
            {!err && blocked.length > 0 && (
              <p className="text-xs text-warning-foreground mt-1.5 flex items-start gap-1">
                <AlertTriangle className="size-3.5 mt-0.5 shrink-0" aria-hidden />
                <span>
                  {blocked.join(", ")} {blocked.length === 1 ? "is" : "are"} blocked in the ERP — price list lines for {blocked.length === 1 ? "it" : "them"} are rejected (PRODUCT_BLOCKED).
                </span>
              </p>
            )}
          </div>
          {!readOnly && (
            <button type="button" aria-label={`Remove ${name}`} className="size-10 grid place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-muted" onClick={() => remove(i, name)}>
              <Trash2 className="size-4" aria-hidden />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {conditions.length === 0 && (
        <div role={emptyError ? "alert" : undefined} className={`rounded-lg border border-dashed p-6 text-center text-sm ${emptyError ? "border-destructive text-destructive" : "border-border text-muted-foreground"}`}>
          {emptyError ?? "No conditions yet. Add one so the rule knows when to apply."}
        </div>
      )}

      {plainIdx.map((i, n) => row(i, n === 0 ? "Where" : "And", `Condition ${n + 1}`))}

      {groupIds.map((g, gi) => {
        const members = conditions.map((c, i) => ({ c, i })).filter((x) => x.c.group === g);
        const n = gi + 1;
        return (
          <div key={g} role="group" aria-labelledby={`rule-group-${g}-h`} className="rounded-xl border border-info/40 bg-info-soft/30 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <span id={`rule-group-${g}-h`} className="text-sm font-semibold">
                {plainIdx.length || gi > 0 ? "And any of" : "Any of"} <span className="font-normal text-muted-foreground">· OR group {n}</span>
              </span>
              {!readOnly && (
                <Btn variant="ghost" size="sm" icon={Trash2} onClick={() => removeGroup(g, n)} aria-label={`Remove OR group ${n}`}>
                  Remove group
                </Btn>
              )}
            </div>
            <div className="space-y-3">{members.map((m, k) => row(m.i, k === 0 ? "Either" : "Or", `OR group ${n} option ${k + 1}`))}</div>
            {members.length < 2 && <p className="text-xs text-muted-foreground mt-2">Add another option — with one option this group works like an AND condition.</p>}
            {!readOnly && (
              <Btn variant="ghost" size="sm" icon={Plus} className="mt-3 -ml-3" onClick={() => add(g)}>
                Add option
              </Btn>
            )}
          </div>
        );
      })}

      {!readOnly && (
        <div className="flex flex-wrap gap-2">
          <Btn id="rule-add-condition" variant="outline" size="sm" icon={Plus} onClick={() => add()}>
            Add condition
          </Btn>
          <Btn variant="outline" size="sm" icon={Plus} onClick={addGroup}>
            Add OR group
          </Btn>
        </div>
      )}

      <div className="rounded-lg bg-muted/50 px-4 py-3 text-sm" aria-live="polite">
        <span className="font-semibold">Applies when </span>
        {friendlySummary(conditions)}
      </div>
    </div>
  );
}
