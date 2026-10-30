import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Filter,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { AppLayout, APP_NAV } from "@/components/AppShell";

/* ------------------------------------------------------------------ */
/* Layout — every pricing page uses the shared app frame               */
/* ------------------------------------------------------------------ */

/** @deprecated use APP_NAV from AppShell — kept so existing imports compile. */
export const PRICING_NAV = APP_NAV;

export type Crumb = { label: string; to?: string };

export function PricingLayout({ crumbs, children }: { crumbs?: Crumb[]; children: ReactNode }) {
  // No breadcrumb trail (product decision). Pages below a list keep a single link back to it.
  const parent = crumbs && crumbs.length >= 3 ? crumbs[crumbs.length - 2] : undefined;
  return (
    <AppLayout>
      {parent?.to && <BackLink to={parent.to} label={parent.label} />}
      {children}
    </AppLayout>
  );
}

/** "← Products" link back to the list a detail page belongs to. */
export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Link to={to as any} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-brand focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded">
      <ChevronLeft className="size-4" aria-hidden />
      {label}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons & inputs                                                    */
/* ------------------------------------------------------------------ */

type BtnVariant = "primary" | "outline" | "ghost" | "dark" | "danger" | "subtle";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40";
const btnVariants: Record<BtnVariant, string> = {
  primary: "bg-brand text-brand-foreground hover:opacity-90",
  outline: "border border-brand text-brand bg-card hover:bg-brand-soft",
  ghost: "text-foreground hover:bg-muted",
  dark: "bg-navy text-navy-foreground hover:opacity-90",
  danger: "bg-destructive text-destructive-foreground hover:opacity-90",
  subtle: "border border-border bg-card text-foreground hover:bg-muted",
};
const btnSizes = { sm: "h-8 px-3 text-xs", md: "h-10 px-4", lg: "h-12 px-6 text-base" };

export function Btn({
  variant = "primary",
  size = "md",
  icon: Icon,
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  /** React 19 forwards `ref` as a prop, so Btn can be a Radix `asChild` trigger. */
  ref?: React.Ref<HTMLButtonElement>;
  variant?: BtnVariant;
  size?: keyof typeof btnSizes;
  icon?: LucideIcon;
  /** Shows a spinner, sets aria-busy and blocks repeat clicks (system status). */
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      className={`${btnBase} ${btnVariants[variant]} ${btnSizes[size]} ${className}`}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <Loader2 className="size-4 animate-spin" aria-hidden />
      ) : (
        Icon && <Icon className="size-4" aria-hidden />
      )}
      {children}
    </button>
  );
}

export function LinkBtn({
  to,
  params,
  variant = "primary",
  size = "md",
  icon: Icon,
  className = "",
  children,
}: {
  to: string;
  params?: Record<string, string>;
  variant?: BtnVariant;
  size?: keyof typeof btnSizes;
  icon?: LucideIcon;
  className?: string;
  children: ReactNode;
}) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Link
      to={to as any}
      params={params as any}
      className={`${btnBase} ${btnVariants[variant]} ${btnSizes[size]} ${className}`}
    >
      {Icon && <Icon className="size-4" aria-hidden />}
      {children}
    </Link>
  );
}

export const inputCls =
  "w-full h-10 px-3 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20";

export function Field({
  label,
  required,
  hint,
  error,
  children,
  className = "",
}: {
  label: ReactNode;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  // Bind label, hint and error to the single child control (WCAG 1.3.1 / 3.3.1).
  const autoId = useId();
  const only =
    Children.count(children) === 1 && isValidElement(children)
      ? (children as ReactElement<Record<string, unknown>>)
      : null;
  const controlId = (only?.props.id as string | undefined) ?? `f${autoId}`;
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
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label
        htmlFor={only ? controlId : undefined}
        className="text-sm font-medium text-foreground"
      >
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
        <p id={msgId} className="text-xs text-destructive flex items-center gap-1">
          <XCircle className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      )}
    </div>
  );
}

export function SearchInput({
  value,
  onChange,
  placeholder = "Search",
  className = "",
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  /** Accessible name; defaults to the placeholder. */
  label?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <Search
        className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground"
        aria-hidden
      />
      <input
        type="search"
        data-page-search
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && value && onChange("")}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        aria-keyshortcuts="/"
        className="w-full h-10 pl-10 pr-10 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 size-7 grid place-items-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function FilterButton({ count = 0, onClick }: { count?: number; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative size-10 grid place-items-center rounded-lg border border-input bg-card hover:bg-muted"
      title="Filters"
      aria-label={count > 0 ? `Filters, ${count} active` : "Filters"}
    >
      <Filter className="size-4" aria-hidden />
      {count > 0 && (
        <span className="absolute -top-2 -right-2 size-5 rounded-full bg-brand text-brand-foreground text-[10px] font-bold grid place-items-center">
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * Quick-filter pill group with counts (e.g. lifecycle status). One pattern for every list page.
 * `multiple` lets several pills be on at once; otherwise selecting one replaces the others.
 */
export function FilterPills<T extends string>({
  label,
  options,
  selected,
  onChange,
  multiple = true,
  clearable = true,
  showLabel = true,
  className = "mb-4",
}: {
  /** Visible group label, also the group's accessible name. */
  label: string;
  options: Array<{ key: T; label: string; count?: number }>;
  selected: T[];
  onChange: (next: T[]) => void;
  multiple?: boolean;
  /** false = a selection is required (no Clear button, the active pill can't be toggled off). */
  clearable?: boolean;
  /** false hides the visible label (it stays the group's accessible name), e.g. when the pills sit beside a heading. */
  showLabel?: boolean;
  className?: string;
}) {
  const toggle = (k: T) => {
    const on = selected.includes(k);
    if (multiple) onChange(on ? selected.filter((x) => x !== k) : [...selected, k]);
    else onChange(on && clearable ? [] : [k]);
  };
  return (
    <div
      className={`flex flex-wrap items-center gap-2 ${className}`}
      role="group"
      aria-label={label}
    >
      {showLabel && (
        <span className="text-sm text-muted-foreground mr-1" aria-hidden>
          {label}
        </span>
      )}
      {options.map((o) => {
        const on = selected.includes(o.key);
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => toggle(o.key)}
            aria-pressed={on}
            className={`h-10 px-4 rounded-full border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
              on
                ? "bg-navy text-navy-foreground border-navy"
                : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={`ml-1.5 tabular-nums ${on ? "opacity-80" : ""}`}>({o.count})</span>
            )}
          </button>
        );
      })}
      {clearable && selected.length > 0 && (
        <Btn variant="ghost" size="sm" onClick={() => onChange([])}>
          Clear
        </Btn>
      )}
    </div>
  );
}

export function FilterChip({ label, onRemove }: { label: string; onRemove?: () => void }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft text-brand text-sm px-3 py-1.5">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="size-5 rounded-full bg-brand/15 grid place-items-center hover:bg-brand/25"
          aria-label={`Remove filter: ${label}`}
        >
          <X className="size-3" aria-hidden />
        </button>
      )}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Page header (list page: title + count + search + filter + actions)  */
/* ------------------------------------------------------------------ */

export function ListHeader({
  title,
  count,
  search,
  onSearch,
  filterCount,
  onFilter,
  actions,
  noun = "item",
  nounPlural,
  subtitle,
}: {
  title: string;
  count?: number;
  /** Singular noun for the count line, e.g. "product" -> "248 products". */
  noun?: string;
  /** Irregular plural; defaults to noun + "s" (or "ies" for consonant + y). */
  nounPlural?: string;
  subtitle?: ReactNode;
  search?: string;
  onSearch?: (v: string) => void;
  filterCount?: number;
  onFilter?: () => void;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 mb-6">
      <div className="min-w-0 flex-1 basis-72">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {(count !== undefined || subtitle) && (
          <p className="text-sm text-muted-foreground mt-1">
            {count !== undefined && (
              <span role="status" className="font-medium text-foreground tabular-nums">
                {count.toLocaleString("en-GB")}{" "}
                {count === 1
                  ? noun
                  : (nounPlural ??
                    (/[^aeiou]y$/.test(noun) ? `${noun.slice(0, -1)}ies` : `${noun}s`))}
              </span>
            )}
            {count !== undefined && subtitle && <span aria-hidden> · </span>}
            {subtitle}
          </p>
        )}
      </div>
      {(onSearch || actions) && (
        <div className="flex flex-wrap items-center justify-end gap-3 w-full sm:w-auto">
          {onSearch && (
            <div className="flex items-center gap-3 flex-1 sm:flex-none sm:w-80">
              <SearchInput
                value={search ?? ""}
                onChange={onSearch}
                className="flex-1"
                placeholder={`Search ${title.toLowerCase()}`}
              />
              {onFilter !== undefined && <FilterButton count={filterCount} onClick={onFilter} />}
            </div>
          )}
          {actions}
        </div>
      )}
    </div>
  );
}

export function RefreshBtn({ onClick }: { onClick?: () => void }) {
  return (
    <Btn variant="outline" icon={RefreshCw} onClick={onClick}>
      Refresh
    </Btn>
  );
}

export function DetailTitle({
  title,
  subtitle,
  status,
  chips,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  status?: string;
  chips?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
      <div>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {status && <StatusPill status={status} />}
        </div>
        {subtitle && <div className="text-sm text-muted-foreground mt-1">{subtitle}</div>}
        {chips && <div className="flex flex-wrap gap-2 mt-3">{chips}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs — pill buttons, active navy with caret (as in Rebate Program)  */
/* ------------------------------------------------------------------ */

export function PillTabs<T extends string>({
  tabs,
  active,
  onChange,
  className = "mb-6",
  idPrefix,
}: {
  tabs: Array<{ key: T; label: string; count?: number }>;
  active: T;
  onChange: (k: T) => void;
  /** Spacing override; defaults to mb-6. */
  className?: string;
  /** Prefix for tab/panel ids: tabs get `${idPrefix}-tab-${key}`, controlling `${idPrefix}-panel-${key}`. */
  idPrefix?: string;
}) {
  // Arrow/Home/End keyboard model for tabs (WAI-ARIA APG).
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const idx = tabs.findIndex((t) => t.key === active);
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    e.preventDefault();
    onChange(tabs[next].key);
    e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
  };
  return (
    <div
      className={`flex gap-2.5 overflow-x-auto pb-2 sm:flex-wrap sm:overflow-visible sm:pb-0 ${className}`}
      role="tablist"
      onKeyDown={onKeyDown}
    >
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <button
            key={t.key}
            role="tab"
            id={idPrefix ? `${idPrefix}-tab-${t.key}` : undefined}
            aria-controls={idPrefix ? `${idPrefix}-panel-${t.key}` : undefined}
            aria-selected={on}
            tabIndex={on ? 0 : -1}
            type="button"
            onClick={() => onChange(t.key)}
            className={`relative shrink-0 whitespace-nowrap sm:flex-1 sm:min-w-[140px] h-11 px-4 rounded-lg text-sm font-medium border transition ${
              on
                ? "bg-navy text-navy-foreground border-navy font-semibold"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count !== undefined && (
              <span
                className={`ml-2 text-xs rounded-full px-1.5 py-0.5 ${on ? "bg-white/15" : "bg-muted"}`}
              >
                {t.count}
              </span>
            )}
            {on && (
              <span
                className="absolute left-1/2 -bottom-[7px] -translate-x-1/2 size-3 rotate-45 bg-navy"
                aria-hidden
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Small segmented control for in-card filters (e.g. Total / Critical / At Risk). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ key: T; label: string; count?: number; tone?: Tone }>;
  value: T;
  onChange: (k: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.key === value;
        const tone = toneCls[o.tone ?? "neutral"];
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            className={`inline-flex items-center gap-2 h-10 px-4 rounded-full border text-sm font-semibold transition ${
              on ? `${tone.border} ${tone.text} ${tone.soft}` : `border-border bg-card ${tone.text}`
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span
                className={`size-5 rounded-full grid place-items-center text-[11px] text-white ${tone.dot}`}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cards & detail grids                                                */
/* ------------------------------------------------------------------ */

export function Card({
  title,
  subtitle,
  actions,
  children,
  className = "",
  padded = true,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return (
    <section className={`bg-card border border-border rounded-xl shadow-sm ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 pt-5 pb-4 border-b border-border">
          <div>
            {title && <h2 className="text-lg font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
      )}
      {/* flex-1 lets the body fill a stretched card (className="h-full flex flex-col"). */}
      <div className={`flex-1 ${padded ? "p-6" : ""}`}>{children}</div>
    </section>
  );
}

export type DetailItem = { label: string; value: ReactNode; full?: boolean };

/** Two-column label/value grid with dividers — the "Rebate Details" pattern. */
export function DetailGrid({ items }: { items: DetailItem[] }) {
  return (
    <dl className="grid md:grid-cols-2 gap-x-10">
      {items.map((it, i) => (
        <div key={i} className={`py-3.5 border-b border-border ${it.full ? "md:col-span-2" : ""}`}>
          <dt className="text-sm text-muted-foreground">
            {it.label}
          </dt>
          <dd className="mt-1.5 text-[15px] font-medium text-foreground">{it.value ?? "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Value owned by a source system (ERP/CRM): shown read-only with a lock and an accessible reason. */
export function Locked({ children, owner = "ERP" }: { children: ReactNode; owner?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <Lock
        className="size-3.5 shrink-0 text-muted-foreground"
        role="img"
        aria-label={`Read-only, owned by ${owner}`}
      />
    </span>
  );
}

export type SyncJob = {
  id: string;
  source: string;
  finished: string;
  created: number;
  updated: number;
  failed: number;
  status: string;
};

/**
 * Result of the last integration sync for a master-data list (US-MD-01/02, FR-J-04).
 * Partial success is always stated with the failed count and a route to the Data Quality Log.
 */
export function SyncStatus({
  job,
  syncedAt,
  onRefresh,
  refreshing = false,
  noun = "records",
}: {
  job: SyncJob;
  /** Time shown as "as of"; defaults to the job's finish time. */
  syncedAt?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
  noun?: string;
}) {
  const total = job.created + job.updated + job.failed;
  const partial = job.failed > 0;
  const tone = partial ? toneCls.warning : toneCls.success;
  const Icon = partial ? AlertTriangle : CheckCircle2;
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border ${tone.border} ${tone.soft} px-4 py-3 mb-4 text-sm`}
    >
      <Icon className={`size-5 shrink-0 ${tone.text}`} aria-hidden />
      <div className="flex-1 min-w-[240px]">
        <span className="font-semibold text-foreground">
          {partial ? "Last sync partly succeeded." : "Last sync succeeded."}
        </span>{" "}
        <span className="text-foreground">
          {job.created.toLocaleString("en-GB")} created, {job.updated.toLocaleString("en-GB")}{" "}
          updated
          {partial && (
            <>
              ,{" "}
              <strong className={tone.text}>
                {job.failed.toLocaleString("en-GB")} of {total.toLocaleString("en-GB")} {noun}{" "}
                rejected
              </strong>
            </>
          )}
          .
        </span>
        <div className="text-xs text-muted-foreground mt-0.5">
          {job.source} · job <span className="font-mono">{job.id}</span> · finished{" "}
          {syncedAt ?? job.finished}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {partial && (
          <LinkBtn to="/pricing/data-quality" variant="subtle" size="sm">
            Open data quality log
          </LinkBtn>
        )}
        {onRefresh && (
          <Btn
            variant="outline"
            size="sm"
            icon={RefreshCw}
            loading={refreshing}
            onClick={onRefresh}
          >
            Refresh
          </Btn>
        )}
      </div>
    </div>
  );
}

export function KpiTile({
  label,
  value,
  to,
  linkLabel = "View list",
  tone = "brand",
  hint,
}: {
  label: string;
  value: ReactNode;
  to?: string;
  linkLabel?: string;
  tone?: Tone;
  hint?: ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm p-5 flex flex-col gap-2 h-full">
      <div className="text-[15px] font-medium">{label}</div>
      <div className={`text-3xl font-bold tabular-nums ${toneCls[tone].text}`}>{value}</div>
      {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      {to && (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        <Link
          to={to as any}
          aria-label={`${linkLabel}: ${label}`}
          className="mt-auto inline-flex items-center gap-0.5 self-start text-brand font-semibold text-sm hover:underline whitespace-nowrap"
        >
          {linkLabel}
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      )}
    </div>
  );
}

/** "Data as of" timestamp — tells users how fresh the numbers are. */
export function DataAsOf({ onExport, at }: { onExport?: () => void; at?: Date }) {
  const [now, setNow] = useState<Date | null>(at ?? null);
  useEffect(() => {
    if (!at) setNow(new Date());
  }, [at]);
  const label = now
    ? now.toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
  return (
    <div className="flex items-center gap-3 text-sm text-muted-foreground">
      <span>
        Data as of <time dateTime={now?.toISOString()}>{label}</time>
      </span>
      {onExport && (
        <button
          type="button"
          onClick={onExport}
          title="Export CSV"
          aria-label="Export CSV"
          className="size-10 rounded-lg border border-border grid place-items-center text-brand hover:bg-brand-soft"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path
              d="M12 3v12m0 0l-4-4m4 4l4-4M4 17v3h16v-3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Status pills                                                        */
/* ------------------------------------------------------------------ */

export type Tone = "brand" | "success" | "warning" | "danger" | "info" | "neutral" | "navy" | "default";

export const toneCls: Record<Tone, { text: string; soft: string; border: string; dot: string }> = {
  brand: { text: "text-brand", soft: "bg-brand-soft", border: "border-brand/40", dot: "bg-brand" },
  success: {
    text: "text-success",
    soft: "bg-success-soft",
    border: "border-success/40",
    dot: "bg-success",
  },
  warning: {
    text: "text-warning-foreground",
    soft: "bg-warning-soft",
    border: "border-warning/50",
    dot: "bg-warning",
  },
  danger: {
    text: "text-destructive",
    soft: "bg-danger-soft",
    border: "border-destructive/40",
    dot: "bg-destructive",
  },
  info: { text: "text-info", soft: "bg-info-soft", border: "border-info/40", dot: "bg-info" },
  neutral: {
    text: "text-muted-foreground",
    soft: "bg-muted",
    border: "border-border",
    dot: "bg-muted-foreground",
  },
  navy: { text: "text-navy-foreground", soft: "bg-navy", border: "border-navy", dot: "bg-navy" },
  default: { text: "text-foreground", soft: "bg-muted", border: "border-border", dot: "bg-foreground" },
};

const STATUS_TONE: Record<string, Tone> = {
  ACTIVE: "success",
  APPROVED: "success",
  SUCCEEDED: "success",
  COMPLETED: "success",
  REPROCESSED: "success",
  ACCEPTED: "success",
  PASSED: "success",
  DRAFT: "neutral",
  NEW: "info",
  QUEUED: "info",
  RUNNING: "info",
  SUBMITTED: "warning",
  SCHEDULED: "info",
  PENDING: "warning",
  PENDING_APPROVAL: "warning",
  ACKNOWLEDGED: "warning",
  FIXED_AT_SOURCE: "info",
  PARTIAL_SUCCESS: "warning",
  PHASE_OUT: "warning",
  END_OF_LIFE: "warning",
  OVERRIDE: "brand",
  SUPERSEDED: "neutral",
  INACTIVE: "neutral",
  EXPIRED: "neutral",
  CANCELLED: "neutral",
  WITHDRAWN: "neutral",
  IGNORED: "neutral",
  BLOCKED: "danger",
  FAILED: "danger",
  REJECTED: "danger",
  OPEN: "danger",
  LOW: "danger",
  HIGH: "success",
  MEDIUM: "warning",
};

/** Acronyms kept upper-case when humanising enum values. */
const ACRONYMS = new Set([
  "erp",
  "crm",
  "sap",
  "sku",
  "uom",
  "id",
  "csv",
  "api",
  "uk",
  "eu",
  "us",
  "vat",
  "kpi",
  "dq",
  "ai",
]);

/** "END_OF_LIFE" -> "End of life" (sentence case, en-GB style guide). */
export function humanize(s: string) {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w, i) =>
      ACRONYMS.has(w) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w,
    )
    .join(" ");
}

export function StatusPill({
  status,
  tone,
  label,
}: {
  status: string;
  tone?: Tone;
  label?: string;
}) {
  const t = toneCls[tone ?? STATUS_TONE[status.toUpperCase().replace(/[\s-]/g, "_")] ?? "neutral"];
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${t.soft} ${t.text} ${t.border} whitespace-nowrap`}
    >
      <span className={`size-1.5 rounded-full ${t.dot}`} aria-hidden />
      {label ?? humanize(status)}
    </span>
  );
}

export function Tag({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  const t = toneCls[tone];
  return (
    <span
      className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${t.soft} ${t.text} ${t.border}`}
    >
      {children}
    </span>
  );
}

/** Text + icon flag (never colour alone — WCAG 2.1 AA, US-OP-02). */
export function Flag({ tone = "warning", children }: { tone?: Tone; children: ReactNode }) {
  const t = toneCls[tone];
  const Icon =
    tone === "danger"
      ? ShieldAlert
      : tone === "warning"
        ? AlertTriangle
        : tone === "success"
          ? CheckCircle2
          : Info;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${t.soft} ${t.text}`}
    >
      <Icon className="size-3.5" aria-hidden />
      {children}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Data table — navy header row, numbered rows, orange name links      */
/* ------------------------------------------------------------------ */

export type Column<T> = {
  key: string;
  header: ReactNode;
  cell: (row: T, index: number) => ReactNode;
  align?: "left" | "right" | "center";
  className?: string;
  width?: string;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  numbered = true,
  onRowClick,
  empty = "No records found.",
  rowClassName,
  footer,
  caption,
  loading = false,
  selectedKey,
  pageSize,
}: {
  /** Screen-reader caption, e.g. "Price lists". */
  caption?: string;
  /** Show skeleton rows instead of data. */
  loading?: boolean;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  numbered?: boolean;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  rowClassName?: (row: T) => string;
  footer?: ReactNode;
  /** Highlights the row whose detail is open in a drawer. */
  selectedKey?: string | null;
  /** Paginate client-side with a "Showing x–y of n" footer. */
  pageSize?: number;
}) {
  const alignCls = (a?: string) =>
    a === "right" ? "text-right" : a === "center" ? "text-center" : "text-left";
  const [page, setPage] = useState(0);
  const pages = pageSize ? Math.max(1, Math.ceil(rows.length / pageSize)) : 1;
  // Filters can shrink the list under the current page; snap back into range.
  useEffect(() => {
    if (page > pages - 1) setPage(0);
  }, [page, pages]);
  const start = pageSize ? page * pageSize : 0;
  const shown = pageSize ? rows.slice(start, start + pageSize) : rows;
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div
        className="relative overflow-x-auto"
        tabIndex={0}
        role="region"
        aria-label={caption ?? "Data table"}
      >
        <table className="w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="bg-navy text-navy-foreground">
              {numbered && (
                <th scope="col" className="px-4 py-3.5 text-left font-semibold w-12">
                  <span aria-hidden>#</span>
                  <span className="sr-only">Row number</span>
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`px-4 py-3.5 font-semibold whitespace-nowrap ${alignCls(c.align)}`}
                  style={c.width ? { width: c.width } : undefined}
                >
                  {c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {loading &&
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={`sk${i}`} aria-hidden>
                  <td colSpan={columns.length + (numbered ? 1 : 0)} className="px-4 py-3.5">
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))}
            {!loading && rows.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (numbered ? 1 : 0)}
                  className="px-4 py-12 text-center text-muted-foreground"
                >
                  {empty}
                </td>
              </tr>
            )}
            {!loading &&
              shown.map((r, i) => {
                const sel = selectedKey != null && rowKey(r) === selectedKey;
                return (
                  <tr
                    key={rowKey(r)}
                    onClick={onRowClick ? () => onRowClick(r) : undefined}
                    // Clickable rows are keyboard-reachable: Tab to focus, Enter/Space to open.
                    tabIndex={onRowClick ? 0 : undefined}
                    onKeyDown={
                      onRowClick
                        ? (e) => {
                            if (e.target !== e.currentTarget) return;
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              onRowClick(r);
                            }
                          }
                        : undefined
                    }
                    aria-selected={selectedKey !== undefined ? sel : undefined}
                    className={`${sel ? "bg-brand-soft" : i % 2 === 1 ? "bg-muted/30" : ""} ${onRowClick ? "cursor-pointer hover:bg-brand-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand" : "hover:bg-muted/40"} ${rowClassName?.(r) ?? ""}`}
                  >
                    {numbered && (
                      <td className="px-4 py-3.5 text-muted-foreground tabular-nums">
                        {start + i + 1}
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-4 py-3.5 ${alignCls(c.align)} ${c.align === "right" || c.align === "center" ? "whitespace-nowrap" : ""} ${c.className ?? ""}`}
                      >
                        {c.cell(r, start + i)}
                      </td>
                    ))}
                  </tr>
                );
              })}
          </tbody>
          {footer && <tfoot className="bg-muted/50 font-semibold">{footer}</tfoot>}
        </table>
      </div>
      {pageSize && pages > 1 && (
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-t border-border text-sm">
          <span className="text-muted-foreground tabular-nums" role="status">
            Showing {start + 1}–{Math.min(start + pageSize, rows.length)} of{" "}
            {rows.length.toLocaleString("en-GB")}
          </span>
          <div className="flex items-center gap-2">
            <Btn
              variant="subtle"
              size="sm"
              icon={ChevronLeft}
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Previous
            </Btn>
            <span className="text-muted-foreground tabular-nums">
              Page {page + 1} of {pages}
            </span>
            <Btn
              variant="subtle"
              size="sm"
              disabled={page >= pages - 1}
              onClick={() => setPage(page + 1)}
            >
              Next
              <ChevronRight className="size-4" aria-hidden />
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}

/** Orange link used for record names inside tables. */
export function RecordLink({
  to,
  params,
  children,
}: {
  to: string;
  params?: Record<string, string>;
  children: ReactNode;
}) {
  return (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    <Link
      to={to as any}
      params={params as any}
      className="text-brand font-medium hover:underline"
      onClick={(e) => e.stopPropagation()}
    >
      {children}
    </Link>
  );
}

/* ------------------------------------------------------------------ */
/* Modal / drawer                                                      */
/* ------------------------------------------------------------------ */

/** Focus management shared by Modal/Drawer: move focus in, trap Tab, Esc closes, restore focus on close. */
function useDialogFocus(open: boolean, onClose: () => void, dismissible = true) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Read via ref so a form turning dirty (dismissible -> false) doesn't re-run the effect
  // and bounce focus out of the field the user is typing in.
  const dismissibleRef = useRef(dismissible);
  dismissibleRef.current = dismissible;
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    const focusables = () =>
      Array.from(
        node?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    // Prefer the first form control, else the dialog itself.
    const first =
      node?.querySelector<HTMLElement>("[data-autofocus]") ??
      focusables().find((el) => el.tagName !== "BUTTON") ??
      node;
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && dismissibleRef.current) {
        e.stopPropagation();
        closeRef.current();
      } else if (e.key === "Tab") {
        const els = focusables();
        if (els.length === 0) return;
        const a = els[0];
        const z = els[els.length - 1];
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault();
          z.focus();
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault();
          a.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, [open]);
  return ref;
}

export function Modal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = "md",
  dismissible = true,
}: {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
  /** Set false while a form is dirty or a request is in flight so Esc/backdrop don't lose work. */
  dismissible?: boolean;
}) {
  const ref = useDialogFocus(open, onClose, dismissible);
  const titleId = useId();
  const descId = useId();
  if (!open) return null;
  const w = { sm: "max-w-md", md: "max-w-xl", lg: "max-w-3xl", xl: "max-w-5xl" }[size];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-navy/50"
        onClick={dismissible ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subtitle ? descId : undefined}
        tabIndex={-1}
        className={`relative w-full ${w} max-h-[90vh] flex flex-col bg-card rounded-xl shadow-2xl border border-border focus:outline-none animate-in fade-in-0 zoom-in-95 duration-150`}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-4 border-b border-border">
          <div>
            <h2 id={titleId} className="text-lg font-semibold">
              {title}
            </h2>
            {subtitle && (
              <p id={descId} className="text-sm text-muted-foreground mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-10 -mr-2 grid place-items-center rounded-md hover:bg-muted"
            aria-label="Close dialog"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-border flex flex-wrap justify-end gap-2 bg-muted/30 rounded-b-xl">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function Drawer({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  dismissible = true,
  size = "lg",
}: {
  open: boolean;
  title: ReactNode;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  dismissible?: boolean;
  /** md: record quick view (512px); lg: longer side tasks (672px). */
  size?: "md" | "lg";
}) {
  const ref = useDialogFocus(open, onClose, dismissible);
  const titleId = useId();
  if (!open) return null;
  const w = size === "md" ? "max-w-lg" : "max-w-2xl";
  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-navy/40"
        onClick={dismissible ? onClose : undefined}
        aria-hidden
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`absolute right-0 top-0 h-full w-full ${w} bg-background shadow-2xl flex flex-col focus:outline-none animate-in slide-in-from-right duration-200`}
      >
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-border bg-card">
          <div>
            <h2 id={titleId} className="text-xl font-semibold">
              {title}
            </h2>
            {subtitle && <div className="text-sm text-muted-foreground mt-0.5">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-10 -mr-2 grid place-items-center rounded-md hover:bg-muted"
            aria-label="Close panel"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">{children}</div>
        {footer && (
          <div className="px-6 py-4 border-t border-border flex flex-wrap justify-end gap-2 bg-card">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Confirmation for irreversible, bulk or financial actions. Title is the question naming the object,
 * body states the consequence, confirm label is a specific verb ("Delete 3 rules"). Never use window.confirm.
 */
export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  tone = "primary",
  loading = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      title={
        <span className="flex items-center gap-2">
          {tone === "danger" && <AlertTriangle className="size-5 text-destructive" aria-hidden />}
          {title}
        </span>
      }
      onClose={onCancel}
      size="sm"
      dismissible={!loading}
      footer={
        <>
          {/* Destructive dialogs focus Cancel first so Enter never deletes by accident. */}
          <Btn
            variant="subtle"
            onClick={onCancel}
            disabled={loading}
            data-autofocus={tone === "danger" ? true : undefined}
          >
            {cancelLabel}
          </Btn>
          <Btn
            variant={tone === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={loading}
            data-autofocus={tone === "danger" ? undefined : true}
          >
            {confirmLabel}
          </Btn>
        </>
      }
    >
      {description && <p className="text-sm text-foreground">{description}</p>}
      {children}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback helpers — one toaster lives in the root layout            */
/* ------------------------------------------------------------------ */

/** Success feedback: "<Object> <past-tense verb>", e.g. "Price list saved". */
export function notifySuccess(message: string, description?: string) {
  toast.success(message, { description });
}

/** Reversible action feedback with an Undo button (preferred over confirm dialogs for single items). */
export function notifyUndo(message: string, onUndo: () => void, description?: string) {
  toast(message, {
    description,
    duration: 6000,
    action: { label: "Undo", onClick: onUndo },
  });
}

/* ------------------------------------------------------------------ */
/* Validation error banner — error class + code + field (FR-J-01/02)   */
/* ------------------------------------------------------------------ */

export type ApiError = {
  errorClass: "VALIDATION" | "BUSINESS_RULE" | "AUTHORIZATION" | "CONFLICT";
  code: string;
  message: string;
  field?: string;
  /** Server correlation ID for support; omitted when unknown. */
  correlationId?: string;
};

export function ErrorBanner({ error, onClose }: { error: ApiError | null; onClose?: () => void }) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-danger-soft px-4 py-3 mb-4"
    >
      <XCircle className="size-5 text-destructive shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 text-sm">
        <div className="font-semibold text-destructive">
          {error.code}
          <span className="ml-2 text-xs font-medium text-destructive/70">
            class: {error.errorClass}
          </span>
        </div>
        <div className="text-foreground mt-0.5">
          {error.message}
          {error.field && (
            <>
              {" "}
              Field: <code className="px-1 rounded bg-card text-xs">{error.field}</code>
            </>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          No record was created or changed.
          {error.correlationId && ` Correlation ID: ${error.correlationId}`}
        </div>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss error"
          className="size-8 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-card"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function InfoBanner({
  tone = "info",
  title,
  children,
  action,
  className = "mb-4",
}: {
  tone?: Tone;
  title?: ReactNode;
  children: ReactNode;
  /** Optional follow-up (link or button) shown on the right, e.g. "Open data quality log". */
  action?: ReactNode;
  /** Outer spacing; pass "" inside space-y stacks. */
  className?: string;
}) {
  const t = toneCls[tone];
  const Icon =
    tone === "danger"
      ? ShieldAlert
      : tone === "warning"
        ? AlertTriangle
        : tone === "success"
          ? CheckCircle2
          : Info;
  return (
    <div
      role="note"
      className={`flex flex-wrap items-start gap-3 rounded-lg border ${t.border} ${t.soft} px-4 py-3 ${className} text-sm`}
    >
      <Icon className={`size-5 shrink-0 mt-0.5 ${t.text}`} aria-hidden />
      <div className="flex-1 min-w-[200px]">
        {title && <div className={`font-semibold ${t.text}`}>{title}</div>}
        <div className="text-foreground">{children}</div>
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Misc                                                                */
/* ------------------------------------------------------------------ */

/** Empty state: what is missing, why it matters, and the first action to take. */
export function EmptyState({
  icon: Icon = ClipboardCheck,
  title,
  children,
  action,
}: {
  icon?: LucideIcon;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="text-center py-12 px-4">
      <div className="mx-auto size-12 rounded-full bg-brand-soft text-brand grid place-items-center">
        <Icon className="size-6" aria-hidden />
      </div>
      <p className="mt-3 font-semibold text-foreground">{title}</p>
      {children && (
        <div className="mt-1 text-sm text-muted-foreground max-w-md mx-auto">{children}</div>
      )}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Loading placeholder shaped like the content it replaces. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} aria-hidden />;
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <>
      {/* Compact form on phones; the full sequence wraps awkwardly at 360px. */}
      <p className="sm:hidden mb-6 text-sm">
        <span className="text-muted-foreground">
          Step {current + 1} of {steps.length}:
        </span>{" "}
        <span className="font-semibold">{steps[current]}</span>
      </p>
      <ol className="hidden sm:flex flex-wrap items-center gap-2 mb-6" aria-label="Progress">
        {steps.map((s, i) => {
          const done = i < current;
          const on = i === current;
          return (
            <li key={s} className="flex items-center gap-2" aria-current={on ? "step" : undefined}>
              <span
                className={`size-8 rounded-full grid place-items-center text-sm font-bold ${
                  done
                    ? "bg-success text-white"
                    : on
                      ? "bg-brand text-white"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                <span aria-hidden>{done ? "✓" : i + 1}</span>
              </span>
              <span className={`text-sm ${on ? "font-semibold" : "text-muted-foreground"}`}>
                {s}
                <span className="sr-only">
                  {done ? " (completed)" : on ? " (current step)" : ""}
                </span>
              </span>
              {i < steps.length - 1 && <span className="w-8 h-px bg-border mx-1" aria-hidden />}
            </li>
          );
        })}
      </ol>
    </>
  );
}

export function ProgressBar({
  value,
  tone = "brand",
  label,
}: {
  value: number;
  tone?: Tone;
  label?: string;
}) {
  return (
    <div
      className="h-1.5 rounded-full bg-muted overflow-hidden"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(Math.max(0, Math.min(100, value)))}
      aria-label={label}
    >
      <div
        className={`h-full ${toneCls[tone].dot}`}
        style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
      />
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label ? undefined : "Toggle"}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${checked ? "bg-brand" : "bg-muted-foreground/40"}`}
      >
        <span
          aria-hidden
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition ${checked ? "left-[18px]" : "left-0.5"}`}
        />
      </button>
      {label}
    </label>
  );
}

/** Currency + UoM always shown alongside a price (SRS 3.1.1). */
export function money(n: number | null | undefined, currency = "GBP", digits = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const sym: Record<string, string> = { GBP: "£", USD: "$", EUR: "€", INR: "₹" };
  return `${sym[currency] ?? currency + " "}${n.toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

export function Price({
  value,
  currency = "GBP",
  uom,
}: {
  value: number | null | undefined;
  currency?: string;
  uom?: string;
}) {
  return (
    <span className="tabular-nums whitespace-nowrap">
      {money(value, currency)}
      <span className="text-xs text-muted-foreground ml-1">
        {currency}
        {uom ? ` / ${uom}` : ""}
      </span>
    </span>
  );
}

export function pct(n: number, digits = 1) {
  // True minus sign (U+2212) per the style guide, not a hyphen.
  return `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n).toFixed(digits)}%`;
}
