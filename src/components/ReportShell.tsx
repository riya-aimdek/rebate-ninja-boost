import { Link } from "@tanstack/react-router";
import { ChevronRight, Download } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Sidebar, TopBar } from "@/components/AppShell";

export function ReportShell({
  title,
  subtitle,
  icon: Icon,
  accent = "bg-brand/10 text-brand",
  kpis,
  children,
  onExport,
}: {
  title: string;
  subtitle?: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: string;
  kpis?: Array<{ label: string; value: string; hint?: string; tone?: "brand" | "success" | "info" | "warning" }>;
  children: ReactNode;
  onExport?: () => void;
}) {
  const [search, setSearch] = useState("");
  const toneMap: Record<string, string> = {
    brand: "from-brand/60 to-brand",
    success: "from-success/60 to-success",
    info: "from-info/60 to-info",
    warning: "from-warning/60 to-warning",
  };
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar activeLabel="Reports" />
      <div className="flex-1 min-w-0 flex flex-col">
        <TopBar search={search} onSearch={setSearch} placeholder={`Search in ${title}…`} />
        <main className="flex-1 px-6 py-6 max-w-[1400px] w-full mx-auto">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-5">
            <Link to="/reports" className="hover:text-brand font-medium">Reports</Link>
            <ChevronRight className="size-3.5" />
            <span className="text-foreground font-semibold">{title}</span>
          </nav>

          {/* Header */}
          <div className="bg-card border border-border rounded-2xl p-6 mb-6 flex flex-wrap items-start justify-between gap-4 shadow-sm">
            <div className="flex items-start gap-4">
              <div className={`size-12 rounded-xl grid place-items-center ${accent}`}>
                <Icon className="size-6" />
              </div>
              <div>
                <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
                {subtitle && <p className="text-sm text-muted-foreground mt-1 max-w-2xl">{subtitle}</p>}
              </div>
            </div>
            {onExport && (
              <button
                onClick={onExport}
                type="button"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-brand text-brand-foreground font-semibold text-sm hover:opacity-90 transition"
              >
                <Download className="size-4" /> Export
              </button>
            )}
          </div>

          {/* KPIs */}
          {kpis && kpis.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
              {kpis.map((k) => (
                <div key={k.label} className="relative overflow-hidden bg-card border border-border rounded-2xl p-5 shadow-sm">
                  <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${toneMap[k.tone ?? "brand"]}`} />
                  <div className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">{k.label}</div>
                  <div className="text-2xl font-bold tracking-tight mt-2">{k.value}</div>
                  {k.hint && <div className="text-xs text-muted-foreground mt-1">{k.hint}</div>}
                </div>
              ))}
            </div>
          )}

          {children}
        </main>
      </div>
    </div>
  );
}

export function FilterBar({ children }: { children: ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5 mb-6 shadow-sm">
      <div className="flex flex-wrap items-end gap-4">{children}</div>
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-[160px]">
      <label className="text-xs uppercase tracking-wide font-semibold text-muted-foreground">
        {label} {hint && <span className="text-muted-foreground/70 normal-case tracking-normal font-normal">— {hint}</span>}
      </label>
      {children}
    </div>
  );
}

export const inputCls =
  "px-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand transition";
