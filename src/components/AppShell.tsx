import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  BellOff,
  BrainCircuit,
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

/* ------------------------------------------------------------------ */
/* Navigation — single source of truth for every routed page          */
/* ------------------------------------------------------------------ */

export type NavLink = { icon: LucideIcon; label: string; to: string; keywords?: string };
export type NavSection = { title: string; items: NavLink[] };

export const APP_NAV: NavSection[] = [
  {
    title: "",
    items: [{ icon: LayoutDashboard, label: "Pricing dashboard", to: "/pricing", keywords: "home overview" }],
  },
  // Rebate modeling (/rebate-modeling) and rebate reports (/reports) are hidden: the pricing BRD/SRS
  // (FR-F-01, SRS 3.2.13) leave rebate management to the existing Rebate Ninja product.
  {
    title: "Master data",
    items: [
      { icon: Package, label: "Products", to: "/pricing/products", keywords: "sku catalogue" },
      { icon: Users, label: "Customers", to: "/pricing/customers", keywords: "accounts" },
      { icon: Coins, label: "Cost data", to: "/pricing/costs" },
    ],
  },
  {
    title: "Price lists & catalog",
    items: [
      { icon: Tags, label: "Price lists", to: "/pricing/price-lists" },
      { icon: Layers, label: "Bulk update", to: "/pricing/bulk-update" },
      { icon: Repeat, label: "Automated repricing", to: "/pricing/repricing" },
    ],
  },
  {
    title: "Strategy & segmentation",
    items: [
      { icon: Users, label: "Segments", to: "/pricing/segments" },
      { icon: ListChecks, label: "Pricing rules", to: "/pricing/rules" },
      { icon: ListOrdered, label: "Rule precedence", to: "/pricing/precedence" },
      { icon: FunctionSquare, label: "Formula pricing", to: "/pricing/formulas" },
      { icon: ShieldCheck, label: "Guardrails", to: "/pricing/guardrails", keywords: "margin floor" },
      { icon: RouteIcon, label: "Price trace", to: "/pricing/price-trace", keywords: "explain waterfall" },
    ],
  },
  {
    title: "Price optimization",
    items: [
      { icon: Sparkles, label: "Recommendations", to: "/pricing/recommendations" },
      { icon: BrainCircuit, label: "Optimization runs", to: "/pricing/optimization" },
      { icon: FlaskConical, label: "Scenario simulator", to: "/pricing/simulator", keywords: "what if" },
      { icon: Swords, label: "Competitive intel", to: "/pricing/competitive", keywords: "competitor" },
    ],
  },
  {
    title: "Administration",
    items: [
      { icon: Database, label: "Data quality log", to: "/pricing/data-quality" },
      { icon: FileClock, label: "Audit log", to: "/pricing/audit-log", keywords: "history changes" },
      { icon: UserCircle, label: "My profile", to: "/profile", keywords: "settings account preferences" },
    ],
  },
];

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
  return (
    <nav aria-label="Main" className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-3 text-sm">
      {APP_NAV.map((section, i) => (
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
            {APP_NAV.map((section, i) => (
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
              <CommandItem value="create new price list" onSelect={() => go("/pricing/price-lists/new")}>
                <Tags className="mr-2 size-4 text-muted-foreground" aria-hidden />
                Create price list
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

  const initials = (account ?? "AW").slice(0, 2).toUpperCase();

  return (
    <header className="sticky top-0 z-30 bg-background/95 backdrop-blur border-b border-border px-4 sm:px-6 h-[72px] flex items-center gap-3">
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className="lg:hidden size-10 grid place-items-center rounded-lg border border-border bg-card hover:bg-muted"
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
            className="w-full h-10 pl-10 pr-3 rounded-lg border border-input bg-card text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        </div>
      ) : null}

      <button
        type="button"
        onClick={openPalette}
        aria-keyshortcuts="Control+K Meta+K"
        className={`h-10 rounded-lg border border-input bg-card text-sm text-muted-foreground hover:bg-muted flex items-center gap-2 px-3 ${
          onSearch ? "shrink-0" : "flex-1 max-w-xl"
        }`}
      >
        <Search className="size-4 shrink-0" aria-hidden />
        <span className={onSearch ? "hidden md:inline" : "flex-1 text-left truncate"}>
          {onSearch ? "Jump to" : "Jump to a page or action…"}
        </span>
        <kbd className="hidden sm:inline-flex h-6 items-center rounded border border-border bg-muted px-1.5 text-[11px] font-semibold">Ctrl K</kbd>
      </button>

      <div className="flex-1" />

      <button
        type="button"
        onClick={openHelp}
        aria-label="Keyboard shortcuts"
        aria-keyshortcuts="Shift+Slash"
        title="Keyboard shortcuts (?)"
        className="hidden sm:grid size-10 place-items-center rounded-lg border border-border bg-card hover:bg-muted"
      >
        <Keyboard className="size-5" aria-hidden />
      </button>

      <Popover>
        <PopoverTrigger asChild>
          <button type="button" aria-label="Notifications" className="size-10 grid place-items-center rounded-lg border border-border bg-card hover:bg-muted">
            <Bell className="size-5" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 p-0">
          <div className="px-4 py-3 border-b border-border font-semibold text-sm">Notifications</div>
          <div className="px-4 py-8 text-center">
            <BellOff className="mx-auto size-6 text-muted-foreground" aria-hidden />
            <p className="mt-2 text-sm font-medium">You’re all caught up</p>
            <p className="mt-1 text-xs text-muted-foreground">Approvals, completed runs and data issues will appear here.</p>
          </div>
        </PopoverContent>
      </Popover>

      <Link
        to="/profile"
        aria-label={`My profile${account ? ` — ${account}` : ""}`}
        title="My profile"
        className="size-10 rounded-full bg-brand text-brand-foreground grid place-items-center font-semibold text-sm hover:opacity-90"
      >
        {initials}
      </Link>

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
