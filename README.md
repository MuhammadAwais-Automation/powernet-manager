# PowerNet Manager

> ISP Operations Dashboard — real-time customer, billing, and complaint management for Internet Service Providers.

![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green?logo=supabase)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## Features

| Module | Description |
|--------|-------------|
| **Dashboard** | Live stats — total customers, monthly revenue, open complaints, active staff |
| **Customers** | Full CRUD, search, status tracking (active/inactive/suspended) |
| **Billing & Payments** | Bill generation, payment recording, overdue tracking |
| **Complaints** | Support ticket system with priority levels and staff assignment |
| **Staff Management** | Technician, recovery agent, and helper tracking |
| **Areas & Sectors** | Service zone management (garrison/civilian classifications) |
| **Reports** | Revenue, billing cycle, and operational insights |

---

## Role-Based Access

| Role | Access |
|------|--------|
| `admin` | Full access to all modules |
| `technician` | Complaints + assigned work only |
| `recovery_agent` | Billing & payment recovery |
| `helper` | Read-only support access |

---

## Tech Stack

- **Framework:** Next.js 15 App Router (SPA pattern via React state routing)
- **Language:** TypeScript 5
- **Database:** Supabase (PostgreSQL) — direct PostgREST queries
- **Styling:** Custom CSS with CSS variables — light/dark theme, no Tailwind
- **Charts:** Custom SVG components (Sparkline, Donut, Revenue Line Chart)
- **Auth:** Supabase Auth + role-based access control

---

## Getting Started

### Prerequisites

- Node.js 18+
- A [Supabase](https://supabase.com) project

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/MuhammadAwais-Automation/powernet-manager.git
cd powernet-manager

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env.local
# Edit .env.local and add your Supabase credentials

# 4. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Environment Variables

Create a `.env.local` file in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
```

> Never commit `.env.local` — it is already in `.gitignore`

---

## Project Structure

```
src/
├── app/                    # Next.js shell (layout, page.tsx)
├── components/
│   ├── App.tsx             # Main shell — sidebar, topbar, page state
│   ├── Icon.tsx            # Internal icon library
│   ├── charts.tsx          # Custom SVG charts
│   ├── ui.tsx              # Shared UI primitives (Badge, Modal, Drawer, Tabs…)
│   ├── auth/               # LoginScreen, AccessDenied
│   └── pages/              # One component per section
│       ├── DashboardPage.tsx
│       ├── CustomersPage.tsx
│       ├── BillingPage.tsx
│       ├── ComplaintsPage.tsx
│       ├── StaffPage.tsx
│       ├── AreasPage.tsx
│       └── ReportsPage.tsx
├── lib/
│   ├── supabase.ts         # Supabase anon client
│   ├── supabase-admin.ts   # Supabase service role client
│   ├── utils.ts            # Helpers (initials, class merging)
│   ├── auth/               # Auth helpers
│   └── db/                 # Data access layer
│       ├── customers.ts
│       ├── bills.ts
│       ├── complaints.ts
│       ├── staff.ts
│       ├── areas.ts
│       ├── packages.ts
│       └── dashboard.ts
└── types/
    └── database.ts         # TypeScript types for all DB entities
```

---

## Available Scripts

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint
npm run start    # Production server
```

---

## Navigation

This project uses **React state routing** (not Next.js file-based routing).
`App.tsx` holds `currentPage` state — to add a new section, add a value to that state, a sidebar entry, and a new `pages/` component.

---

## License

MIT — free to use and modify.
