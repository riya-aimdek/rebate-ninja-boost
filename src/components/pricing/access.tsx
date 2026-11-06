import { useSyncExternalStore, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { ForbiddenPage } from "@/components/ErrorPage";
import { NOTIFICATIONS, subscribeNotifications } from "@/lib/pricing/deals";
import { ACCESS_LABEL, MODULE_LABEL, ROLE_LABEL, useSession, type AccessLevel, type Module, type Role, type SecureField } from "@/lib/pricing/session";

/**
 * Field-level security in the UI (US-AD-03). HIDE renders nothing (callers also drop the column),
 * MASK shows •••• with a screen-reader reason, ROUND shows a band. Never colour alone.
 */
export function Secure({ field, children, band }: { field: SecureField; children: ReactNode; /** Shown for ROUND, e.g. "20–30%". */ band?: ReactNode }) {
  const { access } = useSession();
  const a = access(field);
  if (a === "SHOW") return <>{children}</>;
  if (a === "ROUND" && band !== undefined) return <span className="tabular-nums">{band}</span>;
  if (a === "HIDE") return null;
  return (
    <span className="inline-flex items-center gap-1 text-muted-foreground" title="Restricted field">
      <span aria-hidden>••••</span>
      <Lock className="size-3" aria-hidden />
      <span className="sr-only">Hidden — restricted field</span>
    </span>
  );
}

/** "20–30%" style band for ROUND masking. */
export const pctBand = (v: number, step = 10) => {
  const lo = Math.floor(v / step) * step;
  return `${lo}–${lo + step}%`;
};

/**
 * Page-level authorization. Navigation already hides what a role can't open; this covers a typed URL
 * or a stale link (the server enforces the same rule — UI hiding is never the only control, FR-K-03).
 */
export function RequireAccess({ module, level = "V", roles, children }: { module?: Module; level?: AccessLevel; /** Explicit allow-list instead of a module check. */ roles?: Role[]; children: ReactNode }) {
  const { role, can, user } = useSession();
  const ok = roles ? roles.includes(role) : module ? can(module, level) : true;
  if (ok) return <>{children}</>;
  return (
    <ForbiddenPage>
      {user.name} is signed in as {ROLE_LABEL[role]}
      {module ? `, which has ${ACCESS_LABEL[can(module) ? "V" : "N"].toLowerCase()} on ${MODULE_LABEL[module]}` : ""}. Ask an IT administrator if
      you need access.
    </ForbiddenPage>
  );
}

/** Live notifications for the current user (bell, notifications page). */
export function useMyNotifications() {
  const { user } = useSession();
  // Snapshot is the array length + read flags so mutations re-render subscribers.
  useSyncExternalStore(
    subscribeNotifications,
    () => NOTIFICATIONS.map((n) => (n.read ? 1 : 0)).join("") + NOTIFICATIONS.length,
    () => "",
  );
  const mine = NOTIFICATIONS.filter((n) => n.recipientId === user.id).sort((a, b) => b.at.localeCompare(a.at));
  return { items: mine, unread: mine.filter((n) => !n.read).length };
}
