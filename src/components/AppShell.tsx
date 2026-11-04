import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  ArrowLeftRight,
  BadgeCheck,
  BarChart3,
  Bell,
  BellOff,
  BrainCircuit,
  Cable,
  Check,
  Compass,
  EyeOff,
  FileSpreadsheet,
  FileText,
  Gavel,
  Handshake,
  KeyRound,
  LogIn,
  Network,
  Send,
  ShieldAlert,
  TrendingDown,
  Waves,
  ChevronDown,
  ChevronLeft,
  Coins,
  Database,
  FileClock,
  FlaskConical,
  FunctionSquare,
  Keyboard,
  Layers,
  LayoutDashboard,
  ListChecks,
  ListOrdered,
  Menu,
  Package,
  PieChart,
  Repeat,
  Route as RouteIcon,
  Search,
  ShieldCheck,
  Sparkles,
  Swords,
  Tags,
  UserCircle,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useMyNotifications } from "@/components/pricing/access";
import { markRead } from "@/lib/pricing/deals";
import { ROLE_LABEL, USERS, can, setPersona, useSession, type Module, type Role } from "@/lib/pricing/session";

/* ------------------------------------------------------------------ */
/* Navigation — single source of truth for every routed page          */
/* ------------------------------------------------------------------ */

export type NavLink = {
  icon: LucideIcon;
  label: string;
  to: string;
  keywords?: string;
  /** Role-aware navigation (SRS 3.1.1): shown when the role has at least View on this module… */
  module?: Module;
  /** …or, instead, only to these roles. */
  roles?: Role[];
  /** Roles that never see the item even if the module allows it. */
  exclude?: Role[];
};
export type NavSection = { title: string; items: NavLink[] };

const PARTNER: Role[] = ["CHANNEL_PARTNER"];

export const APP_NAV: NavSection[] = [
  {
    title: "",
    items: [{ icon: LayoutDashboard, label: "Pricing dashboard", to: "/pricing", keywords: "home overview", exclude: PARTNER }],
  },
  // Rebate modeling (/rebate-modeling) and rebate reports (/reports) are hidden: the pricing BRD/SRS
  // (FR-F-01, SRS 3.2.13) leave rebate management to the existing Rebate Ninja product.
  {
    title: "Master data",
    items: [
      { icon: Package, label: "Products", to: "/pricing/products", keywords: "sku catalogue", module: "MASTER_DATA" },
      { icon: Users, label: "Customers", to: "/pricing/customers", keywords: "accounts", module: "MASTER_DATA" },
      { icon: Coins, label: "Cost data", to: "/pricing/costs", module: "MASTER_DATA", exclude: ["SALES_REP", "SALES_MANAGER"] },
    ],
  },
  {
    title: "Price lists & catalog",
    items: [
      { icon: Tags, label: "Price lists", to: "/pricing/price-lists", module: "MASTER_DATA" },
      { icon: Layers, label: "Bulk update", to: "/pricing/bulk-update", module: "MASTER_DATA", exclude: ["SALES_REP", "SALES_MANAGER", "IT_ADMIN"] },
      { icon: Repeat, label: "Automated repricing", to: "/pricing/repricing", module: "MASTER_DATA", exclude: ["SALES_REP", "IT_ADMIN"] },
    ],
  },
  {
    title: "Strategy & segmentation",
    items: [
      { icon: PieChart, label: "Segments", to: "/pricing/segments", module: "STRATEGY" },
      { icon: ListChecks, label: "Pricing rules", to: "/pricing/rules", module: "STRATEGY" },
      { icon: ListOrdered, label: "Rule precedence", to: "/pricing/precedence", module: "STRATEGY" },
      { icon: FunctionSquare, label: "Formula pricing", to: "/pricing/formulas", module: "STRATEGY" },
      { icon: ShieldCheck, label: "Guardrails", to: "/pricing/guardrails", keywords: "margin floor", module: "STRATEGY" },
      { icon: RouteIcon, label: "Price trace", to: "/pricing/price-trace", keywords: "explain why price", module: "STRATEGY" },
    ],
  },
  {
    title: "Price optimization",
    items: [
      { icon: Sparkles, label: "Recommendations", to: "/pricing/recommendations", module: "OPTIMIZATION", exclude: ["EXECUTIVE", "SALES_REP"] },
      { icon: BrainCircuit, label: "Optimization runs", to: "/pricing/optimization", module: "OPTIMIZATION" },
      { icon: FlaskConical, label: "Scenario simulator", to: "/pricing/simulator", keywords: "what if", module: "OPTIMIZATION" },
      { icon: Swords, label: "Competitive intel", to: "/pricing/competitive", keywords: "competitor", module: "OPTIMIZATION", exclude: ["SALES_REP", "SALES_MANAGER", "EXECUTIVE"] },
    ],
  },
  {
    title: "CPQ & quoting",
    items: [
      { icon: FileText, label: "Quotes", to: "/pricing/quotes", keywords: "cpq quote proposal renewal", module: "CPQ", exclude: PARTNER },
      { icon: Compass, label: "Guided selling", to: "/pricing/guided-selling", keywords: "decision tree questions wizard", roles: ["PRICING_ADMIN", "DEAL_DESK", "SALES_MANAGER"] },
      { icon: Handshake, label: "Partner portal", to: "/pricing/partner-portal", keywords: "channel partner", roles: ["CHANNEL_PARTNER", "PRICING_ADMIN", "SALES_MANAGER", "DEAL_DESK"] },
    ],
  },
  {
    title: "Deal desk",
    items: [
      { icon: Gavel, label: "Approval queue", to: "/pricing/approvals", keywords: "approve reject deal desk sla", module: "DEAL_DESK" },
      { icon: ShieldAlert, label: "Pricing exceptions", to: "/pricing/exceptions", keywords: "exception request justification", roles: ["SALES_REP", "SALES_MANAGER", "DEAL_DESK", "PRICING_ADMIN", "FINANCE_CONTROLLER"] },
      { icon: BadgeCheck, label: "Approval matrix", to: "/pricing/approval-matrix", keywords: "delegation of authority segregation of duties sod", roles: ["PRICING_ADMIN", "DEAL_DESK", "FINANCE_CONTROLLER"] },
    ],
  },
  {
    title: "Price execution",
    items: [{ icon: Send, label: "Publications", to: "/pricing/publications", keywords: "publish erp retry rollback idempotency", roles: ["PRICING_ADMIN", "IT_ADMIN", "FINANCE_CONTROLLER"] }],
  },
  {
    title: "Analytics & reporting",
    items: [
      { icon: BarChart3, label: "Margin dashboard", to: "/pricing/analytics/margin", keywords: "profitability drill", module: "ANALYTICS" },
      { icon: Waves, label: "Price waterfall", to: "/pricing/analytics/waterfall", keywords: "bridge pocket leakage", module: "ANALYTICS" },
      { icon: ArrowLeftRight, label: "Compliance & variance", to: "/pricing/analytics/compliance", keywords: "outside band policy", module: "ANALYTICS" },
      { icon: TrendingDown, label: "Deal profitability", to: "/pricing/analytics/deal-profitability", keywords: "expected actual margin renewal", module: "ANALYTICS" },
      { icon: FileSpreadsheet, label: "BI export", to: "/pricing/analytics/bi-export", keywords: "power bi tableau dataset", module: "ANALYTICS", exclude: ["SALES_REP", "SALES_MANAGER"] },
    ],
  },
  {
    title: "Administration",
    items: [
      { icon: KeyRound, label: "Users & roles", to: "/pricing/admin/users", keywords: "rbac permissions sessions", module: "SYSTEM_ADMIN" },
      { icon: EyeOff, label: "Field security", to: "/pricing/admin/field-security", keywords: "mask hide cost margin", roles: ["PRICING_ADMIN", "IT_ADMIN"] },
      { icon: LogIn, label: "SSO & identity", to: "/pricing/admin/sso", keywords: "saml oidc okta azure mfa", module: "SYSTEM_ADMIN", exclude: ["PRICING_ADMIN"] },
      { icon: Network, label: "Integration monitor", to: "/pricing/admin/integrations", keywords: "erp crm kafka webhook dead letter", roles: ["IT_ADMIN", "PRICING_ADMIN"] },
      { icon: Cable, label: "Service accounts", to: "/pricing/admin/service-accounts", keywords: "api key credential rotation", module: "SYSTEM_ADMIN", exclude: ["PRICING_ADMIN"] },
      { icon: Database, label: "Data quality log", to: "/pricing/data-quality", roles: ["PRICING_ADMIN", "IT_ADMIN"] },
      { icon: FileClock, label: "Audit log", to: "/pricing/audit-log", keywords: "history changes", module: "AUDIT_LOGS" },
      { icon: Bell, label: "Notifications", to: "/pricing/notifications", keywords: "alerts preferences templates" },
      { icon: UserCircle, label: "My profile", to: "/profile", keywords: "settings account preferences" },
    ],
  },
];

/** Whether a nav item is shown to a role. */
export function navVisible(item: NavLink, role: Role) {
  if (item.exclude?.includes(role)) return false;
  if (item.roles) return item.roles.includes(role);
  if (item.module) return can(role, item.module);
  return true;
}

/** APP_NAV filtered to what the signed-in role may open; empty sections drop out. */
function useVisibleNav() {
  const { role } = useSession();
  return APP_NAV.map((s) => ({ ...s, items: s.items.filter((i) => navVisible(i, role)) })).filter((s) => s.items.length > 0);
}

/** Modules on the product roadmap that have no screen yet — shown disabled so nothing is a dead click.
 *  Empty: the former entries were Rebate Ninja modules, outside the pricing scope. */
export const COMING_SOON: string[] = [];

export const SHORTCUTS: Array<{ keys: string[]; label: string }> = [
  { keys: ["Ctrl", "K"], label: "Open “Jump to” command palette" },
  { keys: ["/"], label: "Focus the search on this page" },
  { keys: ["?"], label: "Show keyboard shortcuts" },
  { keys: ["Esc"], label: "Close dialog, drawer or menu" },
  { keys: ["Enter"], label: "Submit the focused form" },
];

function isActive(pathname: string, to: string) {
  if (to === "/pricing" || to === "/") return pathname === to;
  return pathname === to || pathname.startsWith(to + "/");
}

function isTypingTarget(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

/* ------------------------------------------------------------------ */
/* Sidebar                                                             */
/* ------------------------------------------------------------------ */

function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link to="/pricing" className="flex items-center gap-3 rounded-md" aria-label="Rebate Ninja — go to dashboard">
      <span className="size-10 rounded-md bg-white grid place-items-center shrink-0" aria-hidden>
        <svg viewBox="0 0 24 24" className="size-7 text-brand" fill="none" stroke="currentColor" strokeWidth={2.4}>
          <path d="M3 17l6-6 4 4 7-8" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M15 7h5v5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      {!compact && (
        <span className="leading-none">
          <span className="block font-black tracking-tight text-2xl text-white">REBATE</span>
          <span className="block text-base font-bold text-brand -mt-0.5">ninja</span>
        </span>
      )}
    </Link>
  );
}

function NavList({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [soonOpen, setSoonOpen] = useState(false);
  const nav = useVisibleNav();
  return (
    <nav aria-label="Main" className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-3 text-sm">
      {nav.map((section, i) => (
        <div key={i} className={i > 0 ? "mt-4" : ""}>
          {section.title && !collapsed && (
            <div className="px-6 pb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60">{section.title}</div>
          )}
          {section.title && collapsed && <div className="mx-4 mb-2 border-t border-white/10" aria-hidden />}
          <ul>
            {section.items.map((item) => {
              const active = isActive(pathname, item.to);
              const Icon = item.icon;
              return (
                <li key={item.to}>
                  <Link
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    to={item.to as any}
                    title={collapsed ? item.label : undefined}
                    aria-label={collapsed ? item.label : undefined}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    className={`relative flex items-center gap-3 h-10 px-6 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand ${
                      active
                        ? "bg-brand/15 text-brand font-semibold before:absolute before:left-0 before:inset-y-1 before:w-1 before:rounded-r before:bg-brand"
                        : "text-white/80 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="size-[18px] shrink-0" aria-hidden />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {!collapsed && COMING_SOON.length > 0 && (
        <div className="mt-6 border-t border-white/10 pt-3">
          <button
            type="button"
            onClick={() => setSoonOpen((o) => !o)}
            aria-expanded={soonOpen}
            aria-controls="nav-coming-soon"
            className="w-full flex items-center justify-between h-10 px-6 text-[11px] font-semibold uppercase tracking-[0.12em] text-white/60 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
          >
            Coming soon
            <ChevronDown className={`size-4 transition-transform ${soonOpen ? "rotate-180" : ""}`} aria-hidden />
          </button>
          {soonOpen && (
            <ul id="nav-coming-soon" className="pb-2">
              {COMING_SOON.map((label) => (
                <li key={label} aria-disabled="true" className="flex items-center justify-between h-9 px-6 text-white/45 cursor-not-allowed">
                  <span className="truncate">{label}</span>
                  <span className="text-[10px] rounded-full border border-white/20 px-1.5 py-0.5">Soon</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </nav>
  );
}

const COLLAPSE_KEY = "rn.sidebar.collapsed";

/** Desktop sidebar (≥ lg). `activeLabel` is accepted for backwards compatibility; the active item comes from the URL. */
export function Sidebar(_props: { activeLabel?: string } = {}) {
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {
      /* storage unavailable */
    }
  }, []);
  const toggle = () =>
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {
        /* storage unavailable */
      }
      return !c;
    });
  return (
    <aside
      aria-label="Sidebar"
      className={`h-screen sticky top-0 z-40 shrink-0 bg-navy text-sidebar-foreground hidden lg:flex flex-col transition-[width] ${
        collapsed ? "w-[72px]" : "w-64"
      }`}
    >
      <div className="h-[72px] px-4 flex items-center border-b border-white/10">
        <Logo compact={collapsed} />
      </div>
      {/* Edge handle: centred on the sidebar edge and the 72px logo/header row; 24px visual, 40px hit area. */}
      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-expanded={!collapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className="absolute -right-3 top-6 size-6 rounded-full bg-card text-foreground border border-border shadow-sm grid place-items-center hover:bg-muted hover:text-brand transition-colors before:absolute before:-inset-2 before:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-navy"
      >
        <ChevronLeft className={`size-3.5 motion-safe:transition-transform ${collapsed ? "rotate-180" : ""}`} aria-hidden />
      </button>
      <NavList collapsed={collapsed} />
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/* Command palette (Ctrl/⌘+K) & shortcuts help (?)                     */
/* ------------------------------------------------------------------ */

function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const nav = useVisibleNav();
  const { can: allowed } = useSession();
  const go = (to: string) => {
    onOpenChange(false);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to: to as any });
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden p-0 max-w-xl">
        <DialogTitle className="sr-only">Jump to</DialogTitle>
        <DialogDescription className="sr-only">Type to find a page, then press Enter to open it.</DialogDescription>
        <Command className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5 [&_[cmdk-input]]:h-12">
          <CommandInput placeholder="Jump to a page… (e.g. price lists, guardrails)" />
          <CommandList className="max-h-[60vh]">
            <CommandEmpty>No pages match. Try another word.</CommandEmpty>
            {nav.map((section, i) => (
              <CommandGroup key={i} heading={section.title || "Home"}>
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem key={item.to} value={`${item.label} ${item.keywords ?? ""} ${section.title}`} onSelect={() => go(item.to)}>
                      <Icon className="mr-2 size-4 text-muted-foreground" aria-hidden />
                      {item.label}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
            <CommandGroup heading="Actions">
              {allowed("MASTER_DATA", "E") && (
                <CommandItem value="create new price list" onSelect={() => go("/pricing/price-lists/new")}>
                  <Tags className="mr-2 size-4 text-muted-foreground" aria-hidden />
                  Create price list
                </CommandItem>
              )}
              {allowed("CPQ", "E") && (
                <CommandItem value="create new quote cpq" onSelect={() => go("/pricing/quotes/new")}>
                  <FileText className="mr-2 size-4 text-muted-foreground" aria-hidden />
                  Create quote
                </CommandItem>
              )}
              <CommandItem value="request pricing exception" onSelect={() => go("/pricing/exceptions")}>
                <ShieldAlert className="mr-2 size-4 text-muted-foreground" aria-hidden />
                Request pricing exception
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}

function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
          <Keyboard className="size-5 text-brand" aria-hidden /> Keyboard shortcuts
        </DialogTitle>
        <DialogDescription>Work faster without the mouse. On macOS use ⌘ instead of Ctrl.</DialogDescription>
        <dl className="mt-2 divide-y divide-border">
          {SHORTCUTS.map((s) => (
            <div key={s.label} className="flex items-center justify-between gap-4 py-2.5 text-sm">
              <dt>{s.label}</dt>
              <dd className="flex gap-1">
                {s.keys.map((k) => (
                  <kbd key={k} className="min-w-7 h-7 px-2 grid place-items-center rounded-md border border-border bg-muted text-xs font-semibold">
                    {k}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}

/** Global keyboard accelerators. Single-key shortcuts never fire while typing. */
function useGlobalShortcuts(openPalette: () => void, openHelp: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || isTypingTarget(e.target)) return;
      if (e.key === "?") {
        e.preventDefault();
        openHelp();
      } else if (e.key === "/") {
        const pageSearch = document.querySelector<HTMLInputElement>("[data-page-search]");
        e.preventDefault();
        if (pageSearch) pageSearch.focus();
        else openPalette();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openPalette, openHelp]);
}

/* ------------------------------------------------------------------ */
/* Top bar                                                             */
/* ------------------------------------------------------------------ */

export function TopBar({
  search,
  onSearch,
  account,
  placeholder = "Search this page…",
}: {
  /** Optional page-level filter. Prefer putting page search in the page header (`ListHeader`). */
  search?: string;
  onSearch?: (v: string) => void;
  account?: string;
  placeholder?: string;
} = {}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const openHelp = useCallback(() => setHelpOpen(true), []);
  useGlobalShortcuts(openPalette, openHelp);
  useEffect(() => setMobileOpen(false), [pathname]);

  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 sm:px-6 h-[72px] flex items-center gap-3">
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden size-10 shrink-0 grid place-items-center rounded-lg border border-border bg-card hover:bg-muted"
        aria-label="Open navigation menu"
        aria-expanded={mobileOpen}
      >
        <Menu className="size-5" aria-hidden />
      </button>

      {onSearch ? (
        <div className="flex-1 max-w-xl relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" aria-hidden />
          <input
            type="search"
            data-page-search
            value={search ?? ""}
            onChange={(e) => onSearch(e.target.value)}
            aria-label={placeholder.replace(/…$/, "")}
            placeholder={placeholder}
            className="w-full h-10 pl-10 pr-3 rounded-lg border border-input bg-card text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        </div>
      ) : null}

      <button
        type="button"
        onClick={openPalette}
        aria-keyshortcuts="Control+K Meta+K"
        className={`h-10 rounded-lg border border-input bg-card text-sm text-muted-foreground hover:bg-muted flex items-center gap-2 px-3 ${
          onSearch ? "shrink-0" : "flex-[3] min-w-0 max-w-xl"
        }`}
      >
        <Search className="size-4 shrink-0" aria-hidden />
        {onSearch ? (
          <span className="hidden md:inline">Jump to</span>
        ) : (
          <span className="flex-1 text-left truncate">
            <span className="sm:hidden">Search</span>
            <span className="hidden sm:inline">Jump to a page or action…</span>
          </span>
        )}
        <kbd className="hidden sm:inline-flex h-6 items-center rounded border border-border bg-muted px-1.5 text-[11px] font-semibold">Ctrl K</kbd>
      </button>

      {/* Spacer; on phones the "Jump to" button takes the free width instead. */}
      <div className={onSearch ? "flex-1" : "hidden sm:block flex-1"} />

      <button
        type="button"
        onClick={openHelp}
        aria-label="Keyboard shortcuts"
        aria-keyshortcuts="Shift+Slash"
        title="Keyboard shortcuts (?)"
        className="hidden sm:grid size-10 shrink-0 place-items-center rounded-lg border border-border bg-card hover:bg-muted"
      >
        <Keyboard className="size-5" aria-hidden />
      </button>

      <NotificationBell />
      <AccountMenu />

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-72 p-0 bg-navy text-sidebar-foreground border-white/10 flex flex-col [&>button]:text-white">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <SheetDescription className="sr-only">All sections of Rebate Ninja</SheetDescription>
          <div className="h-[72px] px-4 flex items-center border-b border-white/10">
            <Logo />
          </div>
          <NavList onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
    </header>
  );
}

/* ------------------------------------------------------------------ */
/* Notifications & account                                             */
/* ------------------------------------------------------------------ */

/** Bell with the signed-in user's unread count and latest five (US-DD-06, IN_APP channel). */
function NotificationBell() {
  const { items, unread } = useMyNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const latest = items.slice(0, 5);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
          className="relative size-10 shrink-0 grid place-items-center rounded-lg border border-border bg-card hover:bg-muted"
        >
          <Bell className="size-5" aria-hidden />
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-5 h-5 px-1 rounded-full bg-brand text-brand-foreground text-[11px] font-bold grid place-items-center tabular-nums" aria-hidden>
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[22rem] max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border">
          <span className="font-semibold text-sm">Notifications</span>
          {unread > 0 && (
            <button type="button" className="hit text-xs font-semibold text-brand hover:underline" onClick={() => markRead(items.map((n) => n.id))}>
              Mark all as read
            </button>
          )}
        </div>
        {latest.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <BellOff className="mx-auto size-6 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm font-medium">You’re all caught up</p>
            <p className="mt-1 text-xs text-muted-foreground">Approvals, expiries and failures will appear here.</p>
          </div>
        ) : (
          <ul className="max-h-96 overflow-y-auto divide-y divide-border">
            {latest.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    markRead([n.id]);
                    setOpen(false);
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    if (n.link) navigate({ to: n.link.to as any, params: n.link.params as any });
                  }}
                  className="w-full text-left px-4 py-3 hover:bg-muted focus-visible:outline-none focus-visible:bg-muted flex gap-3"
                >
                  <span className={`mt-1.5 size-2 rounded-full shrink-0 ${n.read ? "bg-transparent" : "bg-brand"}`} aria-hidden />
                  <span className="min-w-0">
                    <span className={`block text-sm ${n.read ? "" : "font-semibold"}`}>
                      {n.title}
                      {!n.read && <span className="sr-only"> (unread)</span>}
                    </span>
                    <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</span>
                    <span className="block text-[11px] text-muted-foreground mt-1 tabular-nums">{n.at}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="border-t border-border px-4 py-2.5">
          <Link to="/pricing/notifications" onClick={() => setOpen(false)} className="text-sm font-semibold text-brand hover:underline">
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Avatar menu: who is signed in, "view as" another seeded user (prototype role demo), profile link. */
function AccountMenu() {
  const { user } = useSession();
  const [open, setOpen] = useState(false);
  const initials = user.name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  const people = USERS.filter((u) => u.status === "ACTIVE");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Account — ${user.name}, ${ROLE_LABEL[user.role]}`}
          className="size-10 shrink-0 rounded-full bg-brand text-brand-foreground grid place-items-center font-semibold text-sm hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
        >
          {initials}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-0">
        <div className="px-4 py-3 border-b border-border">
          <p className="font-semibold text-sm">{user.name}</p>
          <p className="text-xs text-muted-foreground">
            {user.title} · {ROLE_LABEL[user.role]}
          </p>
          <Link to="/profile" onClick={() => setOpen(false)} className="mt-2 inline-block text-sm font-semibold text-brand hover:underline">
            My profile
          </Link>
        </div>
        <p className="px-4 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground" id="view-as-label">
          View as (prototype)
        </p>
        <ul className="max-h-72 overflow-y-auto pb-2" aria-labelledby="view-as-label">
          {people.map((u) => {
            const on = u.id === user.id;
            return (
              <li key={u.id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => {
                    setPersona(u.id);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-4 py-2 flex items-center gap-3 hover:bg-muted focus-visible:outline-none focus-visible:bg-muted ${on ? "bg-brand-soft" : ""}`}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">{u.name}</span>
                    <span className="block text-xs text-muted-foreground truncate">
                      {u.title} · {ROLE_LABEL[u.role]}
                    </span>
                  </span>
                  {on && <Check className="size-4 text-brand shrink-0" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Page layout                                                         */
/* ------------------------------------------------------------------ */

/** Standard app frame: sidebar + top bar + `main#main-content`. Use for every page. */
export function AppLayout({
  children,
  topBar,
  maxWidth = "max-w-[1600px]",
  mainClassName = "",
}: {
  children: ReactNode;
  topBar?: ReactNode;
  maxWidth?: string;
  mainClassName?: string;
}) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex-1 min-w-0 flex flex-col">
        {topBar ?? <TopBar />}
        <main id="main-content" tabIndex={-1} className={`flex-1 px-4 sm:px-6 lg:px-8 py-6 w-full mx-auto focus:outline-none ${maxWidth} ${mainClassName}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
