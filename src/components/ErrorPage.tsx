import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { Check, Copy, Home, RefreshCw, SearchX, ServerCrash, ShieldOff, Sparkles, WifiOff, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { APP_NAV, navVisible, type NavLink } from "@/components/AppShell";
import { Btn, LinkBtn } from "@/components/pricing/kit";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { useSession } from "@/lib/pricing/session";

/* ------------------------------------------------------------------ */
/* Shared frame                                                        */
/* ------------------------------------------------------------------ */

/** One layout for every error state: logo, h1, explanation and actions on the left; the big decorative code
 *  (last digit in brand orange) or the state's icon on the right. Stacks on phones with the code on top. */
export function ErrorPage({
  code,
  icon: Icon,
  title,
  children,
  actions,
  footer,
  tone = "brand",
}: {
  code?: string;
  icon: LucideIcon;
  title: string;
  children: ReactNode;
  actions: ReactNode;
  footer?: ReactNode;
  tone?: "brand" | "danger";
}) {
  return (
    <div
      className="mx-auto w-full max-w-5xl py-12 sm:py-16 grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_auto] md:items-center gap-x-16 gap-y-8"
      role={tone === "danger" ? "alert" : undefined}
    >
      <a href="/pricing" className="order-1 justify-self-start self-end inline-flex items-center gap-3 rounded-md md:col-start-1 md:row-start-1" aria-label="Rebate Ninja — go to dashboard">
        <span className="size-10 rounded-md bg-navy grid place-items-center shrink-0" aria-hidden>
          <svg viewBox="0 0 24 24" className="size-6 text-brand" fill="none" stroke="currentColor" strokeWidth={2.4}>
            <path d="M3 17l6-6 4 4 7-8" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M15 7h5v5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <span className="leading-none" aria-hidden>
          <span className="block font-black tracking-tight text-xl text-navy">REBATE</span>
          <span className="block text-sm font-bold text-brand -mt-0.5">ninja</span>
        </span>
      </a>
      <div className="order-3 md:order-none min-w-0 md:col-start-1">
        <h1 className="text-3xl lg:text-4xl leading-[1.2] font-bold tracking-tight text-foreground text-balance">{title}</h1>
        <div className="mt-3 max-w-prose text-base text-muted-foreground">{children}</div>
        <div className="mt-6 flex flex-wrap gap-2">{actions}</div>
        {footer && <div className="mt-8 max-w-md">{footer}</div>}
      </div>
      {/* The h1 names the page; the code / icon is decorative. */}
      <div className="order-2 md:order-none md:col-start-2 md:row-start-1 md:row-span-2" aria-hidden>
        {code ? (
          <p className="font-black tracking-tighter leading-none text-[6rem] sm:text-[9rem] lg:text-[12rem] select-none">
            <span className="text-navy">{code.slice(0, -1)}</span>
            <span className={tone === "danger" ? "text-destructive" : "text-brand"}>{code.slice(-1)}</span>
          </p>
        ) : (
          <div className="size-28 lg:size-40 rounded-full grid place-items-center bg-brand-soft text-brand-strong">
            <Icon className="size-14 lg:size-20" strokeWidth={1.5} />
          </div>
        )}
      </div>
    </div>
  );
}

/** Error pages take over the whole screen: no sidebar or top bar, nothing else to compete with the message. */
function FullScreen({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-background px-6 sm:px-10 flex items-center justify-center">{children}</div>
  );
}

function useDocumentTitle(title: string) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${title} · Rebate Ninja`;
    return () => {
      document.title = prev;
    };
  }, [title]);
}

/* ------------------------------------------------------------------ */
/* 404 — unknown URL                                                   */
/* ------------------------------------------------------------------ */

/** Pages the signed-in role can open whose path or name shares a word with the URL that failed. */
function useSuggestions(pathname: string): NavLink[] {
  const { role } = useSession();
  return useMemo(() => {
    // Trim word endings so typos and plurals still match ("quotez" → "quot", "customers" → "custome").
    const stems = pathname
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && w !== "pricing")
      .map((w) => (w.length > 4 ? w.slice(0, -2) : w));
    if (stems.length === 0) return [];
    const items = APP_NAV.flatMap((s) => s.items).filter((i) => navVisible(i, role));
    return items
      .map((item) => {
        const hay = `${item.to} ${item.label} ${item.keywords ?? ""}`.toLowerCase();
        const score = stems.reduce((n, w) => n + (hay.includes(w) ? 1 : 0), 0);
        return { item, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3)
      .map((x) => x.item);
  }, [pathname, role]);
}

export function NotFoundPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const suggestions = useSuggestions(pathname);
  useDocumentTitle("Page not found");
  return (
    <FullScreen>
      <ErrorPage
        code="404"
        icon={SearchX}
        title="Page not found"
        actions={<LinkBtn to="/pricing" icon={Home}>Go to dashboard</LinkBtn>}
        footer={
          suggestions.length > 0 && (
            <nav aria-label="Suggested pages" className="bg-card border border-border rounded-xl">
              <p className="px-4 pt-3 pb-1 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Did you mean</p>
              <ul className="pb-2">
                {suggestions.map((s) => {
                  const Icon = s.icon;
                  return (
                    <li key={s.to}>
                      <Link
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        to={s.to as any}
                        className="flex items-center gap-3 h-10 px-4 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
                      >
                        <Icon className="size-4 text-muted-foreground" aria-hidden />
                        <span className="font-medium">{s.label}</span>
                        <span className="ml-auto text-xs text-muted-foreground truncate">{s.to}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
          )
        }
      >
        <p>
          Nothing lives at <code className="rounded bg-muted px-1.5 py-0.5 text-sm text-foreground break-all">{pathname}</code>. The link may be
          old or mistyped.
        </p>
        <p className="mt-1">
          Press <kbd className="rounded border border-border bg-card px-1 text-xs">Ctrl K</kbd> to jump to any page.
        </p>
      </ErrorPage>
    </FullScreen>
  );
}

/* ------------------------------------------------------------------ */
/* 403 — signed in, but the role can't open this page                  */
/* ------------------------------------------------------------------ */

/** Rendered by `RequireAccess`; covers the page's own layout so only the message shows. */
export function ForbiddenPage({ children }: { children: ReactNode }) {
  useDocumentTitle("Access denied");
  return (
    <FullScreen>
      <ErrorPage
        code="403"
        icon={ShieldOff}
        title="You don't have access to this page"
        actions={<LinkBtn to="/pricing" icon={Home}>Go to dashboard</LinkBtn>}
      >
        {children}
      </ErrorPage>
    </FullScreen>
  );
}

/* ------------------------------------------------------------------ */
/* Crash — root error boundary                                         */
/* ------------------------------------------------------------------ */

/** Thrown when a lazily loaded chunk is gone, usually because a new version was deployed. */
const CHUNK_ERROR = /Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed|ChunkLoadError/i;

function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}

/** Root `errorComponent`. Full screen; the Toaster isn't mounted here, so copy feedback is inline. */
export function AppErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  const online = useOnline();
  const [ref] = useState(() => `ERR-${Date.now().toString(36).toUpperCase().slice(-6)}`);
  const [copied, setCopied] = useState(false);
  const chunk = CHUNK_ERROR.test(error?.message ?? "");
  useDocumentTitle(chunk ? "Update available" : online ? "Something went wrong" : "You're offline");

  useEffect(() => {
    console.error(error);
    reportLovableError(error, { boundary: "tanstack_root_error_component", ref });
  }, [error, ref]);

  const retry = () => {
    router.invalidate();
    reset();
  };

  const copyDetails = async () => {
    const details = [`Reference: ${ref}`, `Page: ${window.location.href}`, `Time: ${new Date().toISOString()}`, `Error: ${error?.message ?? "Unknown"}`].join("\n");
    try {
      await navigator.clipboard.writeText(details);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      /* clipboard blocked: the reference stays visible on screen to copy by hand */
    }
  };

  // Dashboard link is a full reload to clear broken state.
  const dashboardLink = (
    <a
      href="/pricing"
      className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-card px-4 text-sm sm:text-base font-semibold text-foreground transition hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
    >
      Go to dashboard
    </a>
  );

  let body: ReactNode;
  if (chunk) {
    body = (
      <ErrorPage
        icon={Sparkles}
        title="A new version of Rebate Ninja is available"
        actions={
          <Btn icon={RefreshCw} onClick={() => window.location.reload()}>
            Reload page
          </Btn>
        }
      >
        This page was updated while you had it open. Reload to get the latest version; unsaved changes on this page will be lost.
      </ErrorPage>
    );
  } else if (!online) {
    body = (
      <ErrorPage
        icon={WifiOff}
        title="You're offline"
        actions={
          <Btn icon={RefreshCw} onClick={retry}>
            Try again
          </Btn>
        }
      >
        Rebate Ninja can't reach the server. Check your connection; this page will be ready to retry as soon as you're back online.
      </ErrorPage>
    );
  } else {
    body = (
      <ErrorPage
        code="500"
        icon={ServerCrash}
        tone="danger"
        title="This page didn't load"
        actions={
          <>
            {dashboardLink}
            <Btn icon={RefreshCw} onClick={retry}>
              Try again
            </Btn>
          </>
        }
        footer={
          <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
            <div className="flex flex-wrap items-center gap-2">
              <span>
                Reference <span className="font-mono font-semibold text-foreground select-all">{ref}</span>
              </span>
              <button
                type="button"
                onClick={copyDetails}
                className="inline-flex items-center gap-1 h-8 px-2 rounded-md hover:bg-muted text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
              >
                {copied ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
                {copied ? "Copied" : "Copy details"}
              </button>
              <span className="sr-only" role="status">
                {copied ? "Error details copied" : ""}
              </span>
            </div>
            {import.meta.env.DEV && (
              <details className="max-w-lg text-left">
                <summary className="cursor-pointer">Technical details (development only)</summary>
                <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap break-all">
                  {error?.stack ?? error?.message}
                </pre>
              </details>
            )}
          </div>
        }
      >
        Something went wrong on our end and your data was not changed. Try again, or go back to the dashboard. If it keeps happening, send the
        reference below to your IT administrator.
      </ErrorPage>
    );
  }

  return <FullScreen>{body}</FullScreen>;
}
