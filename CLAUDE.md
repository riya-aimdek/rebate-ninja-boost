# Rebate Ninja — project notes for Claude

- Stack: TanStack Start + React 19 + Tailwind v4 + shadcn/Radix, sonner toasts. Routes in `src/routes/` (file-based).
- **Any UI work must follow the `ui-ux-standards` skill** (`.claude/skills/ui-ux-standards/SKILL.md`): reuse the shared kit, keep one pattern per job, WCAG 2.1 AA, feedback for every action, undo/confirm for destructive actions, 8-pt spacing, responsive to 360 px.
- Shared UI: `src/components/AppShell.tsx` (AppLayout, unified `APP_NAV`, command palette, shortcuts), `src/components/pricing/kit.tsx` (buttons, fields, tables, dialogs, feedback helpers), `src/components/ReportShell.tsx` (report pages). New pages must be added to `APP_NAV`.
- One `<Toaster>` lives in `src/routes/__root.tsx` — don't mount another.
- Type-check: `node node_modules/typescript/bin/tsc --noEmit -p .`
