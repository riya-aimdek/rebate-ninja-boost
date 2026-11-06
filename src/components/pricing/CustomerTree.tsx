import { useMemo, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Building2, ChevronDown, ChevronRight, ChevronsDownUp, ChevronsUpDown, Star } from "lucide-react";
import { Btn, StatusPill, Tag } from "@/components/pricing/kit";
import { MAX_HIERARCHY_DEPTH, type Customer } from "@/lib/pricing/data";

type Row = { c: Customer; depth: number; guides: boolean[]; last: boolean; kids: Customer[]; pos: number; size: number };

/**
 * Customer hierarchy as an expandable tree (WAI-ARIA tree pattern).
 * Arrow keys move and expand/collapse, Enter selects, Home/End jump.
 */
export function CustomerTree({
  nodes,
  currentId,
  selectedId,
  contextIds,
  highlight,
  onSelect,
  label,
}: {
  /** Customers to show; roots are the ones whose parent is not in this set. */
  nodes: Customer[];
  /** The customer whose page this is; marked "This customer". */
  currentId?: string;
  /** Row shown as selected (e.g. open in a drawer). */
  selectedId?: string | null;
  /** Ancestors included only to keep the path visible; shown dimmed. */
  contextIds?: Set<string>;
  /** Search text to highlight in names. */
  highlight?: string;
  onSelect: (c: Customer) => void;
  label: string;
}) {
  const ids = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const kidsOf = useMemo(() => {
    const m = new Map<string, Customer[]>();
    for (const n of nodes) if (n.parentId && ids.has(n.parentId)) m.set(n.parentId, [...(m.get(n.parentId) ?? []), n]);
    for (const v of m.values()) v.sort((a, b) => a.name.localeCompare(b.name));
    return m;
  }, [nodes, ids]);
  const parents = [...kidsOf.keys()];
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);

  const rows: Row[] = [];
  const walk = (list: Customer[], depth: number, guides: boolean[]) =>
    list.forEach((c, i) => {
      const last = i === list.length - 1;
      const kids = kidsOf.get(c.id) ?? [];
      rows.push({ c, depth, guides, last, kids, pos: i + 1, size: list.length });
      // Roots draw no connector column; deeper levels carry a guide line while their ancestor has later siblings.
      if (kids.length && !collapsed.has(c.id)) walk(kids, depth + 1, depth === 0 ? [] : [...guides, !last]);
    });
  walk(nodes.filter((n) => !n.parentId || !ids.has(n.parentId)).sort((a, b) => a.name.localeCompare(b.name)), 0, []);

  const activeId = focusId && rows.some((r) => r.c.id === focusId) ? focusId : (currentId ?? rows[0]?.c.id);
  const toggle = (id: string) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const focusRow = (id: string) => {
    setFocusId(id);
    requestAnimationFrame(() => document.getElementById(`ctree-${id}`)?.focus());
  };

  const onKeyDown = (e: ReactKeyboardEvent, r: Row, i: number) => {
    const open = r.kids.length > 0 && !collapsed.has(r.c.id);
    if (e.key === "ArrowDown" && i < rows.length - 1) focusRow(rows[i + 1].c.id);
    else if (e.key === "ArrowUp" && i > 0) focusRow(rows[i - 1].c.id);
    else if (e.key === "Home") focusRow(rows[0].c.id);
    else if (e.key === "End") focusRow(rows[rows.length - 1].c.id);
    else if (e.key === "ArrowRight" && r.kids.length) open ? focusRow(r.kids[0].id) : toggle(r.c.id);
    else if (e.key === "ArrowLeft") {
      if (open) toggle(r.c.id);
      else if (r.c.parentId && ids.has(r.c.parentId)) focusRow(r.c.parentId);
    } else if (e.key === "Enter") onSelect(r.c);
    else if (e.key === " " && r.kids.length) toggle(r.c.id);
    else return;
    e.preventDefault();
  };

  const deepest = rows.reduce((m, r) => Math.max(m, r.c.level), 0);
  const t = highlight?.trim().toLowerCase();
  const name = (s: string) => {
    const at = t ? s.toLowerCase().indexOf(t) : -1;
    if (!t || at < 0) return s;
    return (
      <>
        {s.slice(0, at)}
        <mark className="bg-brand-soft text-inherit rounded-sm">{s.slice(at, at + t.length)}</mark>
        {s.slice(at + t.length)}
      </>
    );
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-8 [&>p]:min-w-0 [&>p]:flex-1 [&>:not(p)]:shrink-0 mb-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">{ids.size - (contextIds?.size ?? 0)}</span> {ids.size - (contextIds?.size ?? 0) === 1 ? "account" : "accounts"}
          <span aria-hidden> · </span>
          {deepest} of {MAX_HIERARCHY_DEPTH} levels used
        </p>
        {parents.length > 0 && (
          <div className="flex gap-2">
            <Btn size="sm" variant="subtle" icon={ChevronsUpDown} onClick={() => setCollapsed(new Set())} disabled={collapsed.size === 0}>
              Expand all
            </Btn>
            <Btn size="sm" variant="subtle" icon={ChevronsDownUp} onClick={() => setCollapsed(new Set(parents))} disabled={collapsed.size === parents.length}>
              Collapse all
            </Btn>
          </div>
        )}
      </div>

      <div role="tree" aria-label={label} className="overflow-x-auto overflow-y-hidden">
        <div>
          {rows.map((r, i) => {
            const open = !collapsed.has(r.c.id);
            const isCurrent = r.c.id === currentId;
            const isSelected = r.c.id === selectedId;
            const dim = contextIds?.has(r.c.id);
            return (
              <div
                key={r.c.id}
                id={`ctree-${r.c.id}`}
                role="treeitem"
                aria-level={r.depth + 1}
                aria-setsize={r.size}
                aria-posinset={r.pos}
                aria-expanded={r.kids.length ? open : undefined}
                aria-selected={isSelected || isCurrent}
                aria-current={isCurrent ? "page" : undefined}
                tabIndex={r.c.id === activeId ? 0 : -1}
                onKeyDown={(e) => onKeyDown(e, r, i)}
                onFocus={() => setFocusId(r.c.id)}
                onClick={() => onSelect(r.c)}
                className={`group flex items-stretch outline-none cursor-pointer ${r.depth === 0 && i > 0 ? "mt-3" : ""}`}
              >
                {r.guides.map((g, gi) => (
                  <span key={gi} className="relative w-5 sm:w-7 shrink-0" aria-hidden>
                    {g && <span className="absolute left-[9px] sm:left-[13px] inset-y-0 w-px bg-border" />}
                  </span>
                ))}
                {r.depth > 0 && (
                  <span className="relative w-5 sm:w-7 shrink-0" aria-hidden>
                    <span className={`absolute left-[9px] sm:left-[13px] top-0 w-px bg-border ${r.last ? "h-1/2" : "bottom-0"}`} />
                    <span className="absolute left-[9px] sm:left-[13px] top-1/2 w-[11px] sm:w-[15px] h-px bg-border" />
                  </span>
                )}
                <div className="flex-1 min-w-0 py-1">
                  <div
                    className={`flex items-center gap-2 sm:gap-3 rounded-xl border px-2 sm:px-3 py-2.5 transition group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 ${
                      isCurrent ? "border-brand bg-brand-soft" : isSelected ? "border-brand/60 bg-card shadow-sm" : "border-border bg-card hover:border-brand/50"
                    } ${dim ? "border-dashed bg-muted/40" : ""}`}
                  >
                    {r.kids.length ? (
                      <button
                        type="button"
                        tabIndex={-1}
                        className="hit grid place-items-center size-6 shrink-0 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label={`${open ? "Collapse" : "Expand"} ${r.c.name}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggle(r.c.id);
                        }}
                      >
                        {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                      </button>
                    ) : (
                      <span className="size-6 shrink-0" aria-hidden />
                    )}
                    <span className={`hidden sm:grid place-items-center size-9 shrink-0 rounded-lg ${isCurrent ? "bg-brand-strong text-white" : "bg-muted text-muted-foreground"}`} aria-hidden>
                      <Building2 className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <Link
                          to="/pricing/customers/$id"
                          params={{ id: r.c.id }}
                          tabIndex={-1}
                          onClick={(e) => e.stopPropagation()}
                          className="hit font-semibold text-foreground hover:text-brand-strong hover:underline truncate"
                        >
                          {name(r.c.name)}
                        </Link>
                        {r.c.strategic && <Star className="size-3.5 shrink-0 text-brand-strong fill-brand-strong" role="img" aria-label="Strategic customer" />}
                        {isCurrent && <Tag tone="brand">This customer</Tag>}
                        {/* Ancestors shown only to keep the path visible: said in text, not by fading (contrast). */}
                        {dim && <span className="text-xs text-muted-foreground">Parent of a match</span>}
                      </div>
                      <div className="text-sm text-muted-foreground mt-0.5 truncate">
                        <span className="font-mono">{r.c.id}</span> · L{r.c.level} · {r.c.segment} · {r.c.geography} · {r.c.tier}
                      </div>
                    </div>
                    {r.c.status !== "ACTIVE" && <StatusPill status={r.c.status} />}
                    {r.kids.length > 0 && (
                      <span className="hidden sm:inline text-sm text-muted-foreground whitespace-nowrap tabular-nums">
                        {r.kids.length} {r.kids.length === 1 ? "child" : "children"}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="hidden md:block text-xs text-muted-foreground mt-3">
        Tip: use <kbd className="font-mono">↑</kbd> <kbd className="font-mono">↓</kbd> to move, <kbd className="font-mono">←</kbd> <kbd className="font-mono">→</kbd> to collapse or expand, Enter to open.
      </p>
    </div>
  );
}
