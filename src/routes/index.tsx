import { createFileRoute, redirect } from "@tanstack/react-router";

// The Pricing Management app is the default landing page.
// Rebate modeling (/rebate-modeling) and reports (/reports) are hidden from navigation; see APP_NAV.
export const Route = createFileRoute("/")({
  beforeLoad: () => {
    throw redirect({ to: "/pricing" });
  },
});
