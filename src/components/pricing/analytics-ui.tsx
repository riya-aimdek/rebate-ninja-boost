import { useState, type ReactNode } from "react";
import { BarChart3, CheckCircle2, Clock, Info, Table2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Segmented, toneCls } from "@/components/pricing/kit";
import { ANALYTICS_REFRESHED_AT, NOW, hoursBetween } from "@/lib/pricing/deals";

/** Metric name with its governed definition in a keyboard-reachable tooltip (US-AN-02 AC#3). */
export function MetricLabel({ label, definition }: { label: string; definition: string }) {
  return (
    <TooltipProvider delayDuration={150}>
      <span className="inline-flex items-center gap-1">
        {label}
        <Tooltip>
          <TooltipTrigger asChild>
            <button type="button" aria-label={`${label}: definition`} className="hit size-5 grid place-items-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
              <Info className="size-3.5" aria-hidden />
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">{definition}</TooltipContent>
        </Tooltip>
      </span>
    </TooltipProvider>
  );
}

/** "Last refreshed" plus whether it is inside the 15-minute dashboard SLA (NFR-20, US-AN-02 AC#2). */
export function Freshness({ at = ANALYTICS_REFRESHED_AT }: { at?: string }) {
  const mins = Math.round(hoursBetween(at, NOW) * 60);
  const fresh = mins <= 15;
  const t = fresh ? toneCls.success : toneCls.warning;
  const Icon = fresh ? CheckCircle2 : Clock;
  return (
    <span className="inline-flex flex-wrap items-center gap-2 text-sm text-muted-foreground" role="status">
      <span>
        Last refreshed <time dateTime={at.replace(" ", "T")}>{at}</time>
      </span>
      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold ${t.soft} ${t.text}`}>
        <Icon className="size-3.5" aria-hidden />
        {fresh ? `${mins} min ago · within 15-minute target` : `${mins} min ago · refresh overdue`}
      </span>
    </span>
  );
}

/** Chart / table switch so every chart has a text alternative. */
export function useChartView() {
  const [view, setView] = useState<"chart" | "table">("chart");
  const toggle = (
    <Segmented
      value={view}
      onChange={setView}
      options={[
        { key: "chart", label: "Chart" },
        { key: "table", label: "Table" },
      ]}
    />
  );
  return { view, toggle };
}

export function ChartLegend({ items }: { items: Array<{ label: string; color: string; pattern?: boolean }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-label="Legend">
      {items.map((i) => (
        <li key={i.label} className="inline-flex items-center gap-1.5">
          <span className="size-3 rounded-sm" style={{ background: i.color }} aria-hidden />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

/** In-page drill trail (Region › Customer › Product). Each crumb is a button that steps back. */
export function DrillTrail({ steps, onJump }: { steps: Array<{ label: string }>; onJump: (index: number) => void }) {
  return (
    <nav aria-label="Drill path" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          return (
            <li key={i} className="inline-flex items-center gap-1">
              {i > 0 && <span className="text-muted-foreground" aria-hidden>›</span>}
              {last ? (
                <span className="font-semibold" aria-current="location">
                  {s.label}
                </span>
              ) : (
                <button type="button" onClick={() => onJump(i)} className="hit text-brand font-medium hover:underline rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand">
                  {s.label}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export const ChartIcons = { BarChart3, Table2 };

export function ChartFrame({ label, children, height = 320 }: { label: string; children: ReactNode; height?: number }) {
  return (
    <figure className="w-full" style={{ height }} aria-label={label} role="img">
      {children}
    </figure>
  );
}
