import { createFileRoute, Outlet } from "@tanstack/react-router";

/** Layout for /reports/*: the landing page is reports.index.tsx, each report is a child route. */
export const Route = createFileRoute("/reports")({
  component: Outlet,
});
