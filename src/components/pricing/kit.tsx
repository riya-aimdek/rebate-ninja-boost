import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Filter,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  ShieldAlert,
  Upload,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppShell";

/* ------------------------------------------------------------------ */
/* Layout — every pricing page uses the shared app frame               */
/* ------------------------------------------------------------------ */

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
    <Link to={to as any} className="hit mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-brand-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand rounded">
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
  primary: "bg-brand-strong text-brand-foreground hover:opacity-90",
  outline: "border border-brand-strong text-brand-strong bg-card hover:bg-brand-soft",
  ghost: "text-foreground hover:bg-muted",
  dark: "bg-navy text-navy-foreground hover:opacity-90",
  danger: "bg-destructive text-destructive-foreground hover:opacity-90",
  subtle: "border border-border bg-card text-foreground hover:bg-muted",
};
// `sm` grows to 40px below lg so it stays a comfortable touch target on phones and tablets.
// Type scale: compact buttons 14px; default buttons 14px on phones, 16px from sm; large 16px.
const btnSizes = { sm: "h-10 lg:h-8 px-3 text-sm", md: "h-10 px-4 sm:text-base", lg: "h-12 px-6 text-base" };

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
  search,
  variant = "primary",
  size = "md",
  icon: Icon,
  className = "",
  children,
}: {
  to: string;
  params?: Record<string, string>;
  search?: Record<string, string | undefined>;
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
      search={search as any}
      className={`${btnBase} ${btnVariants[variant]} ${btnSizes[size]} ${className}`}
    >
      {Icon && <Icon className="size-4" aria-hidden />}
      {children}
    </Link>
  );
}

// One field width rule app-wide: every text input, dropdown and textarea fills its layout column, so stacked
// fields always line up edge to edge. Control width comes from the form grid (Field columns / col-span), never
// from a per-control cap. The default w-full sits in :where() (zero specificity) so an explicit width
// (w-32, w-64…) on an inline control always wins.
export const inputCls =
  "[:where(&)]:w-full h-10 px-3 rounded-lg border border-input bg-card text-base focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/20";

export function Field({
  label,
  required,
  hint,
  error,
  children,
  className = "",
  labelClassName = "",
}: {
  label: ReactNode;
  required?: boolean;
  hint?: string;
  error?: string;
  children: ReactNode;
  className?: string;
  /** e.g. "sm:sr-only" when a table-style header row already labels the column. */
  labelClassName?: string;
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
        className={`text-sm font-medium text-foreground ${labelClassName}`}
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
        className="w-full h-10 pl-10 pr-10 rounded-lg border border-input bg-card text-base focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="hit absolute right-2 top-1/2 -translate-y-1/2 size-7 grid place-items-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <X className="size-4" aria-hidden />
        </button>
      )}
    </div>
  );
}

export function FilterButton({ count = 0, onClick, expanded }: { count?: number; onClick?: () => void; expanded?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      className="relative size-10 grid place-items-center rounded-lg border border-input bg-card hover:bg-muted"
      title="Filters"
      aria-label={count > 0 ? `Filters, ${count} active` : "Filters"}
    >
      <Filter className="size-4" aria-hidden />
      {count > 0 && (
        <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 rounded-full bg-brand-strong text-brand-foreground text-xs font-bold grid place-items-center">
          {count}
        </span>
      )}
    </button>
  );
}

/**
 * Quick-filter pill group with counts (e.g. lifecycle status). One pattern for every list page.
 * `multiple` lets several pills be on at once; otherwise selecting one replaces the others.
 * Rule: list filters are always multi-select (OR within a group). Use `multiple={false}` only for a
 * required single choice (period, example preset) and pair it with `clearable={false}`.
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
  // A pill that matches nothing can't narrow anything, and a multi-select filter needs two choices to be useful
  // (a single-choice toggle like "Unread only" needs one). Hide them until the data gives them meaning; an
  // active pick always stays so it can be cleared.
  options = options.filter((o) => o.count !== 0 || selected.includes(o.key));
  if (options.length < (multiple ? 2 : 1) && selected.length === 0) return null;
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
    <span className="inline-flex items-center gap-2 rounded-full bg-brand-soft text-brand-strong text-sm px-3 py-1.5">
      {label}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="hit size-5 rounded-full bg-brand/15 grid place-items-center hover:bg-brand/25"
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
  filtersOpen,
  actions,
  noun = "item",
  nounPlural,
  subtitle,
  eyebrow,
}: {
  title: string;
  /** Small section label above the title, e.g. the nav path for admin pages. */
  eyebrow?: ReactNode;
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
  /** Whether the filter panel `onFilter` toggles is open — exposed as aria-expanded. */
  filtersOpen?: boolean;
  actions?: ReactNode;
}) {
  // Nothing to search: an empty list with no search or filter applied gets no search box or filter button.
  const searchable = onSearch && !(count === 0 && !search && !filterCount);
  return (
    // Header rule: text on the left, buttons on the right of the same row with a gap between; long text wraps
    // inside its own column and never runs under the buttons. On phones the buttons drop below the text.
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] items-end gap-x-8 gap-y-3 mb-6">
      <div className="min-w-0">
        {eyebrow && <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">{eyebrow}</p>}
        <h1 className="text-2xl sm:text-3xl lg:text-4xl leading-[1.2] font-bold tracking-tight">{title}</h1>
        {(count !== undefined || subtitle) && (
          <p className="mt-1 text-base lg:text-lg text-muted-foreground">
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
      {(searchable || actions) && (
        <div className="flex flex-wrap items-center justify-end gap-3">
          {searchable && (
            <div className="flex items-center gap-3 basis-full sm:basis-auto sm:flex-none sm:w-80">
              <SearchInput
                value={search ?? ""}
                onChange={onSearch}
                className="flex-1"
                placeholder={`Search ${title.toLowerCase()}`}
              />
              {onFilter !== undefined && <FilterButton count={filterCount} onClick={onFilter} expanded={filtersOpen} />}
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

/** One "Label: value" attribute in a record header. `tone` only for meaning (e.g. Strategic), never decoration. */
export type HeaderAttribute = { label?: string; value: ReactNode; tone?: Tone; icon?: LucideIcon };

/** A version a record header can switch to. `to`/`params` route to that version; omit for the current one. */
export type VersionLink = { key: string; version: number; status: string; to?: string; params?: Record<string, string>; current?: boolean };

/**
 * Record header used by every detail page, in one fixed order:
 * title + status · meta line (ID, owner, updated) · attribute chips · version switcher.
 */
export function DetailTitle({
  title,
  subtitle,
  status,
  unsaved,
  meta,
  attributes,
  chips,
  versions,
  actions,
}: {
  title: string;
  /** Free-text description under the title (create pages). Record pages use `meta`. */
  subtitle?: ReactNode;
  status?: string;
  /** Shows a consistent "Unsaved changes" pill next to the status. */
  unsaved?: boolean;
  /** Short facts joined by "·", e.g. [<RecordId>R-110</RecordId>, "Owner Priya Nair", "Updated 2026-04-11 13:20"]. */
  meta?: ReactNode[];
  attributes?: HeaderAttribute[];
  /** @deprecated prefer `attributes` so chips look the same on every page. */
  chips?: ReactNode;
  /** Two or more versions render the switcher. */
  versions?: VersionLink[];
  actions?: ReactNode;
}) {
  const facts = (meta ?? []).filter((m) => m !== null && m !== undefined && m !== false && m !== "");
  const hasAttrs = !!(attributes?.length || chips);
  // Two rows only: identity (title, status, versions) and details (meta facts + attribute chips).
  return (
    // Text on the left, buttons on the right of the same row with a gap; long text wraps inside its own column.
    <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] items-start gap-x-8 gap-y-3 mb-5">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl leading-[1.2] font-bold tracking-tight">{title}</h1>
          {status && <StatusPill status={status} />}
          {unsaved && <StatusPill status="PENDING" label="Unsaved changes" />}
          {versions && versions.length > 1 && <VersionSwitcher versions={versions} />}
        </div>
        {subtitle && <div className="text-base lg:text-lg text-muted-foreground mt-1">{subtitle}</div>}
        {(facts.length > 0 || hasAttrs) && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 mt-2 text-sm text-muted-foreground">
            {facts.length > 0 && (
              <ul className="flex flex-wrap items-center gap-x-2 gap-y-1" aria-label="Record details">
                {facts.map((m, i) => (
                  <li key={i} className="inline-flex items-center gap-2">
                    {i > 0 && <span aria-hidden>·</span>}
                    {m}
                  </li>
                ))}
              </ul>
            )}
            {facts.length > 0 && hasAttrs && <span className="hidden sm:block h-4 w-px bg-border" aria-hidden />}
            {hasAttrs && (
              <div className="flex flex-wrap items-center gap-1.5">
                {attributes?.map((a, i) => <AttributeChip key={i} {...a} />)}
                {chips}
              </div>
            )}
          </div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
    </div>
  );
}

/** Record identifier shown in meta lines and tables — always monospace, never wrapped. */
export function RecordId({ children }: { children: ReactNode }) {
  return <span className="font-mono text-xs text-foreground/80 whitespace-nowrap">{children}</span>;
}

function AttributeChip({ label, value, tone, icon: Icon }: HeaderAttribute) {
  const t = toneCls[tone ?? "default"];
  return (
    <span className={`inline-flex items-center gap-1 h-6 px-2 rounded-md border text-xs ${t.soft} ${t.border}`}>
      {Icon && <Icon className={`size-3.5 ${t.text}`} aria-hidden />}
      {label && <span className="text-muted-foreground">{label}</span>}
      <span className={`font-medium ${tone ? t.text : "text-foreground"}`}>{value}</span>
    </span>
  );
}

/**
 * Segmented version switcher. Status is a dot + word (never colour alone); the open version is
 * filled navy and marked aria-current. Links keep Back/forward working between versions.
 */
export function VersionSwitcher({ versions, className = "" }: { versions: VersionLink[]; className?: string }) {
  const sorted = [...versions].sort((a, b) => b.version - a.version);
  return (
    <nav aria-label="Versions" className={`inline-flex ${className}`}>
      <div className="inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-border bg-card p-0.5">
        {sorted.map((v) => {
          const dot = toneCls[STATUS_TONE[v.status.toUpperCase()] ?? "neutral"].dot;
          // 40px tall on touch layouts, compact beside the title on desktop.
          const cls = `inline-flex items-center gap-1.5 h-10 lg:h-7 px-2.5 rounded-md text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
            v.current ? "bg-navy text-navy-foreground" : "text-foreground hover:bg-muted"
          }`;
          const body = (
            <>
              <span className="font-semibold tabular-nums">v{v.version}</span>
              <span className={`size-1.5 rounded-full ${v.current ? "bg-navy-foreground" : dot}`} aria-hidden />
              <span className={`text-xs ${v.current ? "opacity-90" : "text-muted-foreground"}`}>{humanize(v.status)}</span>
            </>
          );
          return v.current || !v.to ? (
            <span key={v.key} className={cls} aria-current={v.current ? "page" : undefined}>
              {body}
            </span>
          ) : (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            <Link key={v.key} to={v.to as any} params={v.params as any} className={cls}>
              {body}
            </Link>
          );
        })}
      </div>
    </nav>
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
    // Same look as FilterPills so every pill row in the app reads alike; `tone` is accepted but no longer coloured.
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            onClick={() => onChange(o.key)}
            aria-pressed={on}
            className={`h-10 px-4 rounded-full border text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/40 ${
              on ? "bg-navy text-navy-foreground border-navy" : "bg-card border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
            {o.count !== undefined && (
              <span className={`ml-1.5 tabular-nums ${on ? "opacity-80" : ""}`}>
                ({o.count >= 10_000 ? `${Math.round(o.count / 1000)}k` : o.count.toLocaleString("en-GB")})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Standard file upload: a dashed drop area with a Browse button and the accepted types, then the chosen
 * file as a row with Replace / Remove. The native input stays hidden; the button opens it. Wrong type or
 * oversize files are rejected inline before they reach the caller.
 */
export function FileDrop({
  id,
  label,
  required,
  accept,
  maxMb = 10,
  file,
  onChange,
  error,
  onTemplate,
}: {
  /** Put on the Browse / Replace button so callers can focus it on a validation error. */
  id: string;
  label: string;
  required?: boolean;
  /** Comma list of extensions, e.g. ".csv,.xlsx". */
  accept: string;
  maxMb?: number;
  file: File | null;
  onChange: (f: File | null) => void;
  error?: string;
  /** Shows a "Download template" link. */
  onTemplate?: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [rejected, setRejected] = useState<string | null>(null);
  const exts = accept.split(",").map((s) => s.trim().toLowerCase());
  const types = exts.map((e) => e.replace(".", "").toUpperCase()).join(" or ");
  const take = (f?: File | null) => {
    if (!f) return;
    const ext = `.${f.name.split(".").pop() ?? ""}`.toLowerCase();
    if (!exts.includes(ext)) return setRejected(`${f.name} isn't a ${types} file. Choose a ${types} file.`);
    if (f.size > maxMb * 1024 * 1024) return setRejected(`${f.name} is over ${maxMb} MB. Split it into smaller files.`);
    setRejected(null);
    onChange(f);
  };
  const browse = () => inputRef.current?.click();
  const msg = rejected ?? error;
  const size = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
  const describedBy = `${id}-label${msg ? ` ${id}-msg` : ""}`;
  return (
    <div className="flex flex-col gap-1.5">
      <span id={`${id}-label`} className="text-sm font-medium text-foreground">
        {label}
        {required && (
          <span className="text-destructive ml-0.5" aria-hidden>
            *
          </span>
        )}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          take(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {file ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card px-4 py-3">
          <FileText className="size-5 text-brand shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium break-all">{file.name}</div>
            <div className="text-xs text-muted-foreground tabular-nums">{size(file.size)}</div>
          </div>
          <Btn id={id} variant="subtle" size="sm" onClick={browse} aria-describedby={describedBy}>
            Replace
          </Btn>
          <Btn variant="ghost" size="sm" icon={X} onClick={() => onChange(null)} aria-label={`Remove ${file.name}`}>
            Remove
          </Btn>
        </div>
      ) : (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            take(e.dataTransfer.files?.[0]);
          }}
          className={`flex flex-wrap items-center gap-3 rounded-xl border-2 border-dashed px-4 py-3 transition ${
            msg ? "border-destructive" : over ? "border-brand bg-brand-soft" : "border-border"
          }`}
        >
          <Upload className="size-5 text-brand shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="text-base">Drag a file here or browse</div>
            <div className="text-xs text-muted-foreground whitespace-nowrap">
              {types} · up to {maxMb} MB
            </div>
          </div>
          <Btn id={id} variant="outline" size="sm" onClick={browse} aria-describedby={describedBy}>
            Browse files
          </Btn>
        </div>
      )}
      {(msg || onTemplate) && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          {msg ? (
            <p id={`${id}-msg`} className="text-xs text-destructive flex items-center gap-1" role="alert">
              <XCircle className="size-3.5 shrink-0" aria-hidden />
              {msg}
            </p>
          ) : (
            <span />
          )}
          {onTemplate && (
            <button type="button" className="hit text-sm text-brand-strong font-semibold hover:underline" onClick={onTemplate}>
              Download template
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** Classic radio mark: ring plus inner dot when selected, so the choice reads without relying on fill colour. */
function RadioDot({ on }: { on: boolean }) {
  return (
    <span
      className={`grid place-items-center size-4 shrink-0 rounded-full border-2 bg-card ${on ? "border-brand" : "border-muted-foreground"}`}
      aria-hidden
    >
      {on && <span className="size-2 rounded-full bg-brand" />}
    </span>
  );
}

const radioKeyStep = (key: string) =>
  key === "ArrowRight" || key === "ArrowDown" ? 1 : key === "ArrowLeft" || key === "ArrowUp" ? -1 : 0;

/**
 * Compact single choice: a row of pills, each with a radio mark and an optional count (WAI-ARIA
 * radiogroup). Use for short options in one line; use ChoiceCards when each option needs explaining.
 */
export function RadioPills<T extends string>({
  label,
  options,
  value,
  onChange,
  required,
  invalid,
  describedBy,
}: {
  /** Accessible name of the group (the visible legend usually says the same). */
  label: string;
  options: Array<{ key: T; label: string; /** Right-hand extra, e.g. "4,210 SKUs". */ meta?: ReactNode }>;
  /** null = nothing chosen yet (a deliberate choice); the first pill then takes the tab stop. */
  value: T | null;
  onChange: (k: T) => void;
  required?: boolean;
  invalid?: boolean;
  /** Id of the hint or error text under the group. */
  describedBy?: string;
}) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = radioKeyStep(e.key);
    if (!step) return;
    e.preventDefault();
    const idx = options.findIndex((o) => o.key === value);
    const next = idx < 0 ? (step > 0 ? 0 : options.length - 1) : (idx + step + options.length) % options.length;
    onChange(options[next].key);
    e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-required={required || undefined}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className="flex flex-wrap gap-2"
      onKeyDown={onKeyDown}
    >
      {options.map((o, i) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (value === null && i === 0) ? 0 : -1}
            onClick={() => onChange(o.key)}
            className={`inline-flex items-center gap-2 h-10 pl-3 pr-4 rounded-full border text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
              on ? "border-brand bg-brand-soft font-semibold text-foreground" : "border-border bg-card text-foreground hover:border-brand/50"
            }`}
          >
            <RadioDot on={on} />
            {o.label}
            {o.meta !== undefined && <span className="text-xs font-normal text-muted-foreground tabular-nums">{o.meta}</span>}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Single-choice option cards (WAI-ARIA radiogroup, arrow keys move the choice). Use when each option
 * needs a one-line explanation; use Segmented for short, self-explanatory choices.
 */
export function ChoiceCards<T extends string>({
  label,
  options,
  value,
  onChange,
  layout = "grid",
  className = layout === "compact"
    ? "grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-2"
    : "grid grid-cols-1 sm:grid-cols-2 gap-3",
}: {
  /** Accessible name of the group (the visible legend usually says the same). */
  label: string;
  options: Array<{
    key: T;
    label: string;
    hint?: ReactNode;
    /** Right-aligned extra, e.g. "14 SKUs". */
    meta?: ReactNode;
    icon?: LucideIcon;
    /** Worked example, e.g. "£10.00 + 5% = £10.50". */
    example?: ReactNode;
  }>;
  value: T;
  onChange: (k: T) => void;
  /** "compact" shows small icon tiles; only the selected option's hint and example appear below. */
  layout?: "grid" | "compact";
  className?: string;
}) {
  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const step = radioKeyStep(e.key);
    if (!step) return;
    e.preventDefault();
    const idx = options.findIndex((o) => o.key === value);
    const next = (idx + step + options.length) % options.length;
    onChange(options[next].key);
    e.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
  };
  const descId = useId();
  if (layout === "compact") {
    const sel = options.find((o) => o.key === value);
    return (
      <div>
        <div
          role="radiogroup"
          aria-label={label}
          aria-describedby={descId}
          className={className}
          onKeyDown={onKeyDown}
        >
          {options.map((o) => {
            const on = o.key === value;
            const Icon = o.icon;
            return (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={on}
                tabIndex={on ? 0 : -1}
                onClick={() => onChange(o.key)}
                className={`flex items-center gap-2 min-w-0 text-left rounded-lg border px-3 py-2 text-sm leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
                  on
                    ? "border-brand bg-brand-soft/70 font-semibold text-foreground"
                    : "border-border bg-card font-medium text-muted-foreground hover:border-brand/50 hover:text-foreground"
                }`}
              >
                {Icon ? (
                  <Icon className={`size-4 shrink-0 ${on ? "text-brand" : ""}`} aria-hidden />
                ) : (
                  <RadioDot on={on} />
                )}
                <span className="min-w-0">{o.label}</span>
              </button>
            );
          })}
        </div>
        {sel && (sel.hint || sel.example) && (
          <p id={descId} aria-live="polite" className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {sel.hint && <span>{sel.hint}</span>}
            {sel.example && (
              <span className="rounded border border-border bg-muted/40 px-1.5 py-0.5 font-mono tabular-nums text-foreground">
                {sel.example}
              </span>
            )}
          </p>
        )}
      </div>
    );
  }
  return (
    <div role="radiogroup" aria-label={label} className={className} onKeyDown={onKeyDown}>
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button
            key={o.key}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.key)}
            className={`flex flex-col justify-start text-left rounded-xl border p-4 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${
              on ? "border-brand bg-brand-soft/70" : "border-border bg-card hover:border-brand/50"
            }`}
          >
            <span className="flex items-center gap-2">
              <RadioDot on={on} />
              <span className="font-semibold">{o.label}</span>
              {o.meta !== undefined && (
                <span className="ml-auto text-xs text-muted-foreground tabular-nums">{o.meta}</span>
              )}
            </span>
            {o.hint && <span className="block text-xs text-muted-foreground mt-1.5 pl-6">{o.hint}</span>}
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
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-2 px-5 pt-4 pb-3 border-b border-border">
          <div className="min-w-0">
            {title && <h2 className="text-xl lg:text-2xl leading-[1.2] font-semibold tracking-tight">{title}</h2>}
            {subtitle && <p className="text-base text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
        </div>
      )}
      {/* flex-1 lets the body fill a stretched card (className="h-full flex flex-col"). */}
      <div className={`flex-1 ${padded ? "p-5" : ""}`}>{children}</div>
    </section>
  );
}

/**
 * Titled table: heading, optional one-line subtitle and actions, then the table. A DataTable is already its
 * own card, so use this instead of wrapping it in a Card (which gives a card inside a card).
 */
export function TableSection({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className={className}>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-6 gap-y-2 mb-3">
        <div className="min-w-0">
          <h2 id={id} className="text-xl lg:text-2xl leading-[1.2] font-semibold tracking-tight">
            {title}
          </h2>
          {subtitle && <p className="text-base text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

export type DetailItem = { label: string; value: ReactNode; full?: boolean };

/**
 * Max columns a DetailGrid may use where it is rendered. Drawers and modals cap it at 2 and
 * confirm dialogs at 1, so a grid is never squeezed into 3 narrow columns on a wide screen.
 */
const DetailColumns = createContext<1 | 2 | 3>(3);

const DETAIL_COLS: Record<1 | 2 | 3, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 sm:grid-cols-2",
  3: "grid-cols-1 md:grid-cols-2 xl:grid-cols-3",
};

/**
 * Label/value grid — the "Rebate Type Details" pattern (uppercase label above a semibold value).
 * Responsive to screen size: 1 column on mobile, 2 from md (768px), 3 from xl (1280px).
 * Pass `columns` for a card in a narrow column (e.g. a 1/3-width side card -> 1).
 */
export function DetailGrid({ items, columns }: { items: DetailItem[]; columns?: 1 | 2 | 3 }) {
  const max = useContext(DetailColumns);
  const cols = Math.min(columns ?? 3, max) as 1 | 2 | 3;
  // Full-width items go last so they never split a row and leave short fields stranded.
  const ordered = [...items.filter((it) => !it.full), ...items.filter((it) => it.full)];
  return (
    <div>
      <dl className={`grid ${DETAIL_COLS[cols]} gap-x-10`}>
        {ordered.map((it, i) => {
          const empty = it.value === null || it.value === undefined || it.value === "";
          return (
            <div
              key={i}
              className={`min-w-0 py-4 border-b border-border/70 ${it.full ? "col-span-full" : ""}`}
            >
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {it.label}
              </dt>
              <dd
                className={`mt-1.5 text-base break-words ${empty ? "text-muted-foreground" : "font-semibold text-foreground"}`}
              >
                {empty ? "—" : it.value}
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}

/** Value owned by a source system (ERP/CRM): shown read-only with a lock and an accessible reason. */
export function Locked({ children, owner = "ERP" }: { children: ReactNode; owner?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <Lock
        className="size-3 shrink-0 text-muted-foreground"
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
      className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border ${tone.border} ${tone.soft} px-4 py-3 mb-4 text-base`}
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
  search,
  linkLabel = "View list",
  tone = "brand",
  hint,
  name,
}: {
  /** Usually text; can be a node, e.g. a label with a definition tooltip (then pass `name`). */
  label: ReactNode;
  value: ReactNode;
  /** Plain-text name for the link's accessible label when `label` is not a string. */
  name?: string;
  to?: string;
  /** Search params for `to`, so a tile can open the list filtered to what it counts. */
  search?: Record<string, unknown>;
  linkLabel?: string;
  tone?: Tone;
  hint?: ReactNode;
}) {
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm px-4 py-3 flex flex-col gap-1.5 h-full min-w-0">
      {/* Label and "View list" share one row, so the tile stays short. */}
      <div className="flex items-center justify-between gap-3 min-w-0">
        <div className="text-sm font-medium text-muted-foreground truncate">{label}</div>
        {to && (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          <Link
            to={to as any}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            search={search as any}
            aria-label={`${linkLabel}: ${name ?? (typeof label === "string" ? label : "")}`}
            className="hit shrink-0 inline-flex items-center gap-0.5 text-brand-strong font-semibold text-sm hover:underline whitespace-nowrap"
          >
            {linkLabel}
            <ChevronRight className="size-3.5" aria-hidden />
          </Link>
        )}
      </div>
      {/* The navy tone's text colour is for navy fills; on the white tile the value uses navy itself. */}
      <div className={`text-2xl font-bold leading-none tabular-nums truncate ${tone === "navy" ? "text-navy" : toneCls[tone].text}`}>{value}</div>
      {hint && (
        <div className="text-xs text-muted-foreground truncate" title={typeof hint === "string" ? hint : undefined}>
          {hint}
        </div>
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
          className="size-10 rounded-lg border border-border grid place-items-center text-brand-strong hover:bg-brand-soft"
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

/**
 * Tone classes. `dot` is a non-text mark (3:1 is enough); `solid` is a filled badge WITH text and
 * always passes 4.5:1 (vivid brand/warning fills can't carry white text, so they use darker shades).
 */
export const toneCls: Record<Tone, { text: string; soft: string; border: string; dot: string; solid: string }> = {
  brand: {
    text: "text-brand-strong",
    soft: "bg-brand-soft",
    border: "border-brand/40",
    dot: "bg-brand",
    solid: "bg-brand-strong text-white",
  },
  success: {
    text: "text-success",
    soft: "bg-success-soft",
    border: "border-success/40",
    dot: "bg-success",
    solid: "bg-success text-white",
  },
  warning: {
    text: "text-warning-foreground",
    soft: "bg-warning-soft",
    border: "border-warning/50",
    dot: "bg-warning",
    solid: "bg-warning-foreground text-white",
  },
  danger: {
    text: "text-destructive",
    soft: "bg-danger-soft",
    border: "border-destructive/40",
    dot: "bg-destructive",
    solid: "bg-destructive text-white",
  },
  info: { text: "text-info", soft: "bg-info-soft", border: "border-info/40", dot: "bg-info", solid: "bg-info text-white" },
  neutral: {
    text: "text-muted-foreground",
    soft: "bg-muted",
    border: "border-border",
    dot: "bg-muted-foreground",
    solid: "bg-muted-foreground text-white",
  },
  navy: { text: "text-navy-foreground", soft: "bg-navy", border: "border-navy", dot: "bg-navy", solid: "bg-navy text-white" },
  default: { text: "text-foreground", soft: "bg-muted", border: "border-border", dot: "bg-foreground", solid: "bg-foreground text-white" },
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
  "sftp",
  "hmac",
  "sla",
  "jwt",
  "sso",
  "mfa",
  "oidc",
  "saml",
  "scim",
  "jit",
  "bi",
  "pdf",
  "url",
  "ip",
]);
/** Acronyms with their own mixed casing. */
const MIXED_CASE: Record<string, string> = { oauth: "OAuth", mtls: "mTLS", idp: "IdP" };

/** "END_OF_LIFE" -> "End of life" (sentence case, en-GB style guide). */
export function humanize(s: string) {
  return s
    .toLowerCase()
    .split(/[_\s]+/)
    .map((w, i) =>
      MIXED_CASE[w] ?? (ACRONYMS.has(w) ? w.toUpperCase() : i === 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w),
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
  dense = false,
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
  /** Shorter rows for previews and other secondary tables. */
  dense?: boolean;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  rowClassName?: (row: T) => string;
  footer?: ReactNode;
  /** Highlights the row whose detail is open in a drawer. */
  selectedKey?: string | null;
  /** Paginate client-side with a "Showing x–y of n" footer. */
  pageSize?: number;
}) {
  const cellPad = dense ? "py-2" : "py-3.5";
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
  // One empty pattern app-wide: no column headers over a blank body, just the EmptyState in the table's frame.
  if (!loading && rows.length === 0)
    return (
      <div role="region" aria-label={caption ?? "Data table"} className="bg-card border border-border rounded-xl shadow-sm">
        {typeof empty === "string" ? <EmptyState title={empty} /> : empty}
      </div>
    );
  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden">
      <div
        className="relative overflow-x-auto overflow-y-hidden"
        tabIndex={0}
        role="region"
        aria-label={caption ?? "Data table"}
      >
        {/* Min width per column so narrow screens scroll the table instead of crushing cells into tall stacks. */}
        <table className="w-full text-sm" style={{ minWidth: columns.length * 88 + (numbered ? 48 : 0) }}>
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="bg-navy text-navy-foreground">
              {numbered && (
                <th scope="col" className={`px-2.5 first:pl-4 last:pr-4 ${cellPad} text-left font-semibold w-12`}>
                  <span aria-hidden>#</span>
                  <span className="sr-only">Row number</span>
                </th>
              )}
              {columns.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`px-2.5 first:pl-4 last:pr-4 ${cellPad} font-semibold whitespace-nowrap ${alignCls(c.align)}`}
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
                  <td colSpan={columns.length + (numbered ? 1 : 0)} className={`px-2.5 first:pl-4 last:pr-4 ${cellPad}`}>
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))}
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
                    className={`${sel ? "bg-brand-soft" : i % 2 === 1 ? "bg-muted/30" : ""} ${onRowClick ? "cursor-pointer hover:bg-brand-soft/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand" : ""} ${rowClassName?.(r) ?? ""}`}
                  >
                    {numbered && (
                      <td className={`px-2.5 first:pl-4 last:pr-4 ${cellPad} text-muted-foreground tabular-nums`}>
                        {start + i + 1}
                      </td>
                    )}
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`px-2.5 first:pl-4 last:pr-4 ${cellPad} ${alignCls(c.align)} ${c.align === "right" || c.align === "center" ? "whitespace-nowrap" : ""} ${c.className ?? ""}`}
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
      className="hit text-brand-strong font-medium hover:underline"
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
    lockBodyScroll();
    return () => {
      document.removeEventListener("keydown", onKey);
      unlockBodyScroll();
      previous?.focus?.();
    };
  }, [open]);
  return ref;
}

/*
 * Ref-counted body scroll lock. Overlays can stack (drawer + confirm dialog) and close in the
 * same render; restoring a saved "previous" value per overlay then runs in the wrong order and
 * leaves the page stuck at overflow:hidden. Counting means only the last overlay to close unlocks.
 */
let scrollLocks = 0;
function lockBodyScroll() {
  if (scrollLocks++ === 0) document.body.style.overflow = "hidden";
}
function unlockBodyScroll() {
  scrollLocks = Math.max(0, scrollLocks - 1);
  // Remove rather than restore a saved value — a saved value can itself be a stale "hidden".
  if (scrollLocks === 0) document.body.style.removeProperty("overflow");
}
// No overlay is open when this module (re)loads, so clear any lock left behind (e.g. across hot reloads).
if (typeof document !== "undefined") document.body.style.removeProperty("overflow");

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
            <h2 id={titleId} className="text-xl lg:text-2xl leading-[1.2] font-semibold">
              {title}
            </h2>
            {subtitle && (
              <p id={descId} className="text-base text-muted-foreground mt-0.5">
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
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <DetailColumns.Provider value={2}>{children}</DetailColumns.Provider>
        </div>
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
            <h2 id={titleId} className="text-xl lg:text-2xl leading-[1.2] font-semibold">
              {title}
            </h2>
            {subtitle && <div className="text-base text-muted-foreground mt-0.5">{subtitle}</div>}
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
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <DetailColumns.Provider value={2}>{children}</DetailColumns.Provider>
        </div>
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
  missing = [],
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
  /** Labels of required fields still empty; the confirm button stays disabled until it is []. */
  missing?: string[];
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  const hintId = useId();
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
          <MissingHint id={hintId} missing={missing} />
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
            disabled={missing.length > 0}
            aria-describedby={missing.length > 0 ? hintId : undefined}
            data-autofocus={tone === "danger" ? undefined : true}
          >
            {confirmLabel}
          </Btn>
        </>
      }
    >
      {description && <p className="text-base text-foreground">{description}</p>}
      <DetailColumns.Provider value={1}>{children}</DetailColumns.Provider>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Required fields — the submit button stays disabled until they are   */
/* filled, and a hint beside it says which ones are missing.           */
/* ------------------------------------------------------------------ */

/** Labels whose value is still empty (undefined, null, blank string, empty array or NaN). */
export function missingFields(fields: Array<[label: string, value: unknown, required?: boolean]>) {
  return fields
    .filter(([, v, req = true]) => {
      if (!req) return false;
      if (v === undefined || v === null) return true;
      if (typeof v === "string") return v.trim() === "";
      if (typeof v === "number") return Number.isNaN(v);
      if (Array.isArray(v)) return v.length === 0;
      return false;
    })
    .map(([label]) => label);
}

/**
 * Says why the submit button is disabled. Put it first in a footer/action row (it pushes the
 * buttons right) and point the button's aria-describedby at its id.
 */
/**
 * Why a submit button is disabled. Screen-reader only: sighted users already see the asterisks on the
 * empty required fields, so a visible "Required: …" line under the form just repeats them.
 */
export function MissingHint({ id, missing }: { id?: string; missing: string[]; className?: string }) {
  if (missing.length === 0) return null;
  return (
    <span id={id} className="sr-only" role="status">
      Required: {missing.join(", ")}
    </span>
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
  /** FR-J-01 classes (+ CONFLICT for stale versions). */
  errorClass: "VALIDATION" | "BUSINESS_RULE" | "AUTHORIZATION" | "CONFLICT" | "TRANSIENT_TECHNICAL" | "PERMANENT_TECHNICAL" | "DOWNSTREAM_REJECTION";
  code: string;
  message: string;
  field?: string;
  /** Server correlation ID for support; omitted when unknown. */
  correlationId?: string;
};

const ERROR_TITLE: Record<ApiError["errorClass"], string> = {
  VALIDATION: "Check the highlighted fields",
  BUSINESS_RULE: "This can't be done",
  AUTHORIZATION: "You don't have permission",
  CONFLICT: "Someone else changed this",
  TRANSIENT_TECHNICAL: "Temporary problem — try again",
  PERMANENT_TECHNICAL: "Something went wrong",
  DOWNSTREAM_REJECTION: "The connected system rejected this",
};

export function ErrorBanner({
  error,
  onClose,
  note = "No record was created or changed.",
}: {
  error: ApiError | null;
  onClose?: () => void;
  /** Consequence line; override for client-side checks that never reached the server, or `false` to hide. */
  note?: ReactNode | false;
}) {
  if (!error) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border border-destructive/40 bg-danger-soft px-4 py-3 mb-4"
    >
      <XCircle className="size-5 text-destructive shrink-0 mt-0.5" aria-hidden />
      <div className="flex-1 text-base">
        {/* Plain-language title; the machine code is only shown next to a support reference, where IT needs it. */}
        <div className="font-semibold text-destructive">{ERROR_TITLE[error.errorClass]}</div>
        <div className="text-foreground mt-0.5">{error.message}</div>
        {(note !== false || error.correlationId) && (
          <div className="text-xs text-muted-foreground mt-1">
            {note !== false && note}
            {error.correlationId && ` Support reference: ${error.correlationId} (${error.code})`}
          </div>
        )}
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss error"
          className="size-10 grid place-items-center rounded-md text-muted-foreground hover:text-foreground hover:bg-card"
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
      className={`flex flex-wrap items-start gap-3 rounded-lg border ${t.border} ${t.soft} px-4 py-3 ${className} text-base`}
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
      <div className="mx-auto size-12 rounded-full bg-brand-soft text-brand-strong grid place-items-center">
        <Icon className="size-6" aria-hidden />
      </div>
      <p className="mt-3 text-base font-semibold text-foreground">{title}</p>
      {children && (
        <div className="mt-1 text-base text-muted-foreground max-w-md mx-auto">{children}</div>
      )}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

/** Loading placeholder shaped like the content it replaces. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} aria-hidden />;
}

/**
 * Wizard progress: full-width bar, connectors fill in as steps complete. Pass onStepClick to let people jump
 * back to a completed step; later steps stay locked.
 */
export function Stepper({
  steps,
  current,
  onStepClick,
}: {
  steps: string[];
  current: number;
  onStepClick?: (i: number) => void;
}) {
  return (
    <div className="mb-6 rounded-xl border border-border bg-card px-4 py-3 sm:px-5">
      {/* Compact form on phones; the full sequence is too cramped at 360px. */}
      <div className="sm:hidden">
        <p className="text-sm">
          <span className="text-muted-foreground">
            Step {current + 1} of {steps.length}:
          </span>{" "}
          <span className="font-semibold">{steps[current]}</span>
        </p>
        <div className="mt-2 flex gap-1" aria-hidden>
          {steps.map((s, i) => (
            <span key={s} className={`h-1 flex-1 rounded-full ${i <= current ? "bg-brand" : "bg-muted"}`} />
          ))}
        </div>
      </div>
      <ol className="hidden sm:flex items-center" aria-label="Progress">
        {steps.map((s, i) => {
          const done = i < current;
          const on = i === current;
          const last = i === steps.length - 1;
          const body = (
            <>
              <span
                className={`size-8 shrink-0 rounded-full grid place-items-center text-sm font-semibold transition-colors ${
                  done
                    ? "bg-success text-white"
                    : on
                      ? "bg-brand-strong text-white ring-4 ring-brand/15"
                      : "border border-border bg-card text-muted-foreground"
                }`}
              >
                {done ? <Check className="size-4" strokeWidth={3} aria-hidden /> : <span aria-hidden>{i + 1}</span>}
              </span>
              <span className="min-w-0 text-left leading-tight">
                <span className="block text-xs text-muted-foreground">Step {i + 1}</span>
                <span className={`block text-sm truncate ${on ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground"}`}>
                  {s}
                </span>
                <span className="sr-only">{done ? " (completed)" : on ? " (current step)" : ""}</span>
              </span>
            </>
          );
          return (
            <li
              key={s}
              className={`flex items-center gap-3 min-w-0 ${last ? "shrink-0" : "flex-1"}`}
              aria-current={on ? "step" : undefined}
            >
              {done && onStepClick ? (
                <button
                  type="button"
                  onClick={() => onStepClick(i)}
                  className="flex items-center gap-3 min-w-0 rounded-lg -m-1 p-1 hover:bg-muted transition-colors"
                  title={`Back to ${s}`}
                >
                  {body}
                </button>
              ) : (
                <span className="flex items-center gap-3 min-w-0">{body}</span>
              )}
              {!last && (
                <span
                  className={`h-0.5 flex-1 min-w-6 rounded-full mr-3 transition-colors ${done ? "bg-success" : "bg-border"}`}
                  aria-hidden
                />
              )}
            </li>
          );
        })}
      </ol>
    </div>
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
      aria-label={label ?? "Progress"}
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
        className={`hit relative w-10 h-6 rounded-full transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 ${checked ? "bg-brand" : "bg-muted-foreground/40"}`}
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
  // Sign before the symbol (−£5,208, not £-5,208), with a true minus sign.
  return `${n < 0 ? "−" : ""}${sym[currency] ?? currency + " "}${Math.abs(n).toLocaleString("en-GB", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
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
