# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # Run ESLint
npm run start    # Start production server
```

No test framework is configured.

## Architecture

**PowerNet Manager** is an ISP operations dashboard built with Next.js 15 App Router + Supabase. It is effectively a client-side SPA — all routing is React state in `App.tsx`, not Next.js file-based routing.

### Key directories

```
src/
├── app/               # Next.js shell — layout, page.tsx (just renders <App />), globals.css
├── components/
│   ├── App.tsx        # Main shell: sidebar, topbar, page state switching
│   ├── Icon.tsx       # Internal icon library
│   ├── charts.tsx     # Custom SVG charts (Sparkline, Donut, RevenueLineChart)
│   ├── ui.tsx         # Shared UI primitives (Badge, Avatar, Drawer, Modal, Tabs, etc.)
│   └── pages/         # One component per section (Dashboard, Customers, Billing, etc.)
├── lib/
│   ├── supabase.ts    # Supabase client (anon + service role)
│   ├── utils.ts       # Small helpers (initials, avClass)
│   └── db/            # Data access layer — one file per domain
│       ├── customers.ts
│       ├── bills.ts
│       ├── complaints.ts
│       ├── staff.ts
│       ├── areas.ts
│       ├── packages.ts
│       └── dashboard.ts
└── types/
    └── database.ts    # TypeScript types for all DB entities
```

### Navigation / page routing

`App.tsx` holds `currentPage` state and renders the matching `pages/` component. To add a new section, add a value to that state, a sidebar entry, and a new page component — no Next.js routing needed.

### Data access

All Supabase queries live in `src/lib/db/`. Use the chainable PostgREST API (`supabase.from('table').select('*, relation(*)')`) and always type results against `src/types/database.ts`. The service role client (`supabaseAdmin`) is used for writes that bypass RLS.

### Styling

No Tailwind or CSS-in-JS. All styles are in `src/app/globals.css` using CSS custom properties. Theme colors (light/dark) are on `:root` / `[data-theme="dark"]`. Brand primary is `--color-primary` (`#F05A2B`). Toggle sets `data-theme` on `<html>`.

### Environment variables

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_KEY
```

Stored in `.env.local`. The Supabase MCP server is configured in `.mcp.json` for direct DB operations from Claude Code.

### Path alias

`@/*` resolves to `./src/*` (configured in `tsconfig.json`).
