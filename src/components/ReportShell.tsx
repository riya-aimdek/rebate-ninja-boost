import { Download, X, XCircle } from "lucide-react";
import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { AppLayout } from "@/components/AppShell";
import { BackLink, Btn, DataAsOf, KpiTile, ListHeader, money, type Tone } from "@/components/pricing/kit";

export type ReportKpi = {
  label: string;
  value: string;
  hint?: string;
  tone?: Tone;
  /** Optional drill-down link (KPIs link to the filtered list where one exists). */
  to?: string;
  linkLabel?: string;
};

/**
 * Frame for every report page — same Option C layout as the pricing list pages:
 * breadcrumb → ListHeader (h1 + subtitle, "Data as of", actions, Export right-most) → KPI tiles → content.
 */
export function ReportShell({
  title,
  subtitle,
  kpis,
  children,
  onExport,
  exportCount,
  exportLabel = "Export CSV",
  actions,
  search,
  onSearch,
  asOf,
}: {
  title: string;
  subtitle?: ReactNode;
  /** @deprecated kept so existing call sites compile; the header no longer shows an icon chip. */
  icon?: React.ComponentType<{ className?: string }>;
  /** @deprecated see `icon`. */
  accent?: string;
  kpis?: ReportKpi[];
  children: ReactNode;
  onExport?: () => void;
  /** Rows the export would contain; 0 disables Export (the table below already says why). */
  exportCount?: number;
  exportLabel?: string;
  /** Extra header actions, shown left of Export. */
  actions?: ReactNode;
  /** Optional header search (ListHeader pattern). */
  search?: string;
  onSearch?: (v: string) => void;
  /** Data freshness shown in the header: omit = time the page loaded the data, a Date = when it was run, false = hide (non-data pages). */
  asOf?: Date | false;
}) {
  const headerActions =
    actions || onExport || asOf !== false ? (
      <>
        {asOf !== false && <DataAsOf at={asOf} />}
        {actions}
        {onExport && (
          <Btn variant="outline" icon={Download} onClick={onExport} disabled={exportCount === 0} title={exportCount === 0 ? "Nothing to export: no rows match" : undefined}>
            {exportLabel}
          </Btn>
        )}
      </>
    ) : undefined;
  return (
    <AppLayout>
      <BackLink to="/reports" label="Reports" />
      <ListHeader title={title} subtitle={subtitle} search={search} onSearch={onSearch} actions={headerActions} />

      {kpis && kpis.length > 0 && (
        <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4 mb-6">
          {kpis.map((k) => (
            <KpiTile key={k.label} label={k.label} value={k.value} hint={k.hint} tone={k.tone ?? "brand"} to={k.to} linkLabel={k.linkLabel} />
          ))}
        </section>
      )}

      {children}
    </AppLayout>
  );
}

/** Report filter bar. Pass `onSubmit` on run-style reports so Enter in any field runs the report (Run button is `type="submit"`). */
export function FilterBar({ children, onSubmit }: { children: ReactNode; onSubmit?: () => void }) {
  // Equal-width filter columns that wrap as whole columns; anything that is not a Field (pills, result count, buttons) spans the row.
  const body = <div className="grid gap-4 items-start grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] [&>*:not(.rf-field)]:col-span-full">{children}</div>;
  return (
    <section aria-label="Filters" className="bg-card border border-border rounded-xl p-5 mb-6 shadow-sm">
      {onSubmit ? (
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit();
          }}
        >
          {body}
        </form>
      ) : (
        body
      )}
    </section>
  );
}

/** Report filter field — label, hint and error are bound to its single child control. */
export function Field({
  label,
  hint,
  error,
  required,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  const autoId = useId();
  const only = Children.count(children) === 1 && isValidElement(children) ? (children as ReactElement<Record<string, unknown>>) : null;
  const controlId = (only?.props.id as string | undefined) ?? `rf${autoId}`;
  const msgId = `${controlId}-msg`;
  const control = only
    ? cloneElement(only, {
        id: controlId,
        "aria-invalid": error ? true : only.props["aria-invalid"],
        "aria-required": required || only.props["aria-required"],
        "aria-describedby": hint || error ? msgId : only.props["aria-describedby"],
      })
    : children;
  return (
    <div className="rf-field flex flex-col gap-1.5 min-w-0">
      <label htmlFor={only ? controlId : undefined} className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="text-destructive ml-0.5" aria-hidden>
            *
          </span>
        )}
      </label>
      {control}
      {hint && !error && (
        <p id={msgId} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={msgId} className="text-xs text-destructive flex items-start gap-1">
          <XCircle className="size-3.5 shrink-0 mt-px" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

/** Right-aligned status + actions slot at the end of a FilterBar (keeps it level with the fields). */
export function FilterBarEnd({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto sm:ml-auto sm:self-end">{children}</div>;
}

/** Standard FilterBar end: live "Showing x of y" count + "Clear filters (n)" — identical on every report. */
export function FilterResult({
  shown,
  total,
  noun,
  activeCount,
  onClear,
}: {
  shown: number;
  total: number;
  /** Plural noun, e.g. "accounts". */
  noun: string;
  activeCount: number;
  onClear: () => void;
}) {
  return (
    <FilterBarEnd>
      <span role="status" className="text-sm text-muted-foreground tabular-nums">
        {shown === total
          ? `${total.toLocaleString("en-GB")} ${noun}`
          : `Showing ${shown.toLocaleString("en-GB")} of ${total.toLocaleString("en-GB")} ${noun}`}
      </span>
      <Btn variant="subtle" icon={X} onClick={onClear} disabled={activeCount === 0} title={activeCount === 0 ? "No filters applied" : undefined}>
        Clear filters{activeCount > 0 && ` (${activeCount})`}
      </Btn>
    </FilterBarEnd>
  );
}

export const inputCls =
  "w-full h-10 px-3 rounded-lg border border-input bg-card text-base focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20";

/** Report figures are in the source data's currency (USD). Deterministic en-GB grouping. */
export const usd = (n: number, digits = 2) => money(n, "USD", digits);

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-07-16" → "16 Jul 2026" (en-GB style guide; string-based so server and client match). */
export function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
