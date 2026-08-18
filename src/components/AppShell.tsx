import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  Calculator as CalcIcon,
  ClipboardList,
  FileText,
  LayoutDashboard,
  PanelLeft,
  Search,
  Settings,
  ShieldCheck,
  Users,
  BarChart3,
} from "lucide-react";

type NavItem = {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  to?: string;
};

export const NAV: NavItem[] = [
  { icon: Settings, label: "Settings" },
  { icon: CalcIcon, label: "Rebate Modeling", to: "/" },
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: BarChart3, label: "Reports", to: "/reports" },
  { icon: Users, label: "Accounts" },
  { icon: FileText, label: "Rebate Program" },
  { icon: Users, label: "Rebate Program Members" },
  { icon: ClipboardList, label: "Rebate Types" },
  { icon: ShieldCheck, label: "Accruals" },
  { icon: FileText, label: "Payout Periods" },
  { icon: LayoutDashboard, label: "Account Analytics" },
  { icon: ClipboardList, label: "Claim Requests" },
  { icon: ClipboardList, label: "Rebate Claims" },
  { icon: Users, label: "All Qualifiers" },
  { icon: FileText, label: "Payout Details" },
  { icon: Building2, label: "My Rebate Program" },
  { icon: ClipboardList, label: "My Claims" },
  { icon: Building2, label: "Rebate Storefront" },
  { icon: ClipboardList, label: "Placed Orders" },
  { icon: Users, label: "Account Management" },
  { icon: FileText, label: "Supplier Rebate Programs" },
  { icon: ShieldCheck, label: "Program Approval Requests" },
  { icon: Building2, label: "Suppliers" },
  { icon: ClipboardList, label: "Supplier Rebate Types" },
  { icon: Users, label: "Supplier Qualifiers" },
  { icon: ClipboardList, label: "Supplier Rebate Claims" },
];

export function Sidebar({ activeLabel }: { activeLabel?: string }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <aside className="w-64 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border hidden lg:flex flex-col">
      <div className="px-5 py-5 border-b border-sidebar-border flex items-center gap-3">
        <div className="size-10 rounded-lg bg-brand grid place-items-center font-black text-brand-foreground text-lg">R</div>
        <div className="leading-tight">
          <div className="font-black tracking-tight text-base">REBATE</div>
          <div className="text-[11px] uppercase tracking-[0.2em] text-brand">ninja</div>
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5 text-sm">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = item.to
            ? pathname === item.to
            : activeLabel === item.label;
          const cls = `w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
            isActive
              ? "bg-brand text-brand-foreground font-semibold"
              : "hover:bg-sidebar-accent text-sidebar-foreground/80"
          }`;
          if (item.to) {
            return (
              <Link key={item.label} to={item.to} className={cls}>
                <Icon className="size-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          }
          return (
            <button key={item.label} className={cls} type="button">
              <Icon className="size-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export function TopBar({
  search,
  onSearch,
  account = "AWEBB",
  placeholder = "Search…",
}: {
  search: string;
  onSearch: (v: string) => void;
  account?: string;
  placeholder?: string;
}) {
  const initials = account.slice(0, 2).toUpperCase();
  return (
    <header className="sticky top-0 z-10 bg-card border-b border-border px-6 py-3 flex items-center gap-4">
      <button className="lg:hidden p-2 rounded-md hover:bg-muted" type="button">
        <PanelLeft className="size-5" />
      </button>
      <div className="flex-1 max-w-2xl relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring/30"
          placeholder={placeholder}
        />
      </div>
      <button className="relative p-2 rounded-md hover:bg-muted" title="Notifications" type="button">
        <Bell className="size-5" />
        <span className="absolute -top-0.5 -right-0.5 bg-brand text-brand-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5">
          99+
        </span>
      </button>
      <Link
        to="/profile"
        className="size-9 rounded-full bg-gradient-to-br from-brand to-amber-500 grid place-items-center text-brand-foreground font-semibold text-sm hover:opacity-90 transition"
        title={`${account} — My profile`}
      >
        {initials}
      </Link>
    </header>
  );
}
