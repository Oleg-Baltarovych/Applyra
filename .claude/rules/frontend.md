---
paths:
  - "apps/web/**/*.{ts,tsx,css}"
---
# Frontend (React + Vite) rules — SPEC §13, §22

- Feature folders: `src/features/<feature>/{api,components,hooks,routes}`. Shared UI in `src/components/ui` (shadcn primitives — change only tokens/variants).
- Server state only via TanStack Query (query keys from a per-feature `keys.ts` factory). Zustand only for UI state (filters, panels, palette).
- Mutations that move cards (Kanban) use optimistic updates with rollback in `onError` and send `Idempotency-Key`.
- Forms: React Hook Form + `zodResolver` with schemas from `@applyra/contracts`. No duplicated validation rules.
- Every screen/async component has loading (skeleton), empty (with CTA) and error (with retry) states.
- Accessibility (WCAG 2.2 AA): keyboard-operable (dnd-kit keyboard sensor), visible focus, status never by color alone (icon + text), respect `prefers-reduced-motion`, labelled controls.
- Styling: Tailwind + shadcn CSS variables (light/dark); no hard-coded hex colors in components. Salaries/stats use `tabular-nums`.
- Never render untrusted HTML via raw `dangerouslySetInnerHTML`; only already-sanitized HTML through a shared `SafeHtml` component.
- No mock data outside tests/MSW handlers. API calls go through the typed client, never ad-hoc `fetch` in components.
