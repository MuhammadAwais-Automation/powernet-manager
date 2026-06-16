# PowerNet Manager

ISP operations dashboard for customer management, billing, complaints, staff operations, and field-service reporting.

PowerNet Manager was built as a production-grade admin dashboard for an internet service provider workflow. It connects a Next.js dashboard with Supabase, role-based access, real-time operational views, billing flows, and staff/customer management.

## Highlights

- Admin dashboard for ISP operations
- Customer CRM with search, status tracking, packages, areas, and service details
- Billing and payment recovery workflows
- Complaint intake, assignment, priority tracking, and resolution status
- Staff roles for admin, technician, recovery agent, helper, and related field workflows
- Reports for revenue, billing, complaints, customer growth, and area-level operations
- Supabase Auth, PostgreSQL tables, RPC functions, and typed data access

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15, React, TypeScript |
| Backend | Supabase, PostgreSQL, PostgREST, RPC |
| Auth | Supabase Auth with role-based access |
| UI | Custom CSS, responsive dashboard layout |
| Charts | Custom SVG chart components |
| Deployment | Vercel-ready Next.js app |

## Role-Based Access

| Role | Purpose |
|---|---|
| Admin | Full dashboard access and system management |
| Technician | Complaint and assigned field work |
| Recovery Agent | Billing and payment recovery |
| Helper | Limited operational support access |

## Project Structure

```text
src/
  app/                  Next.js shell
  components/
    App.tsx             Main dashboard shell
    charts.tsx          Custom dashboard charts
    ui.tsx              Shared UI primitives
    auth/               Login and access-control UI
    pages/              Dashboard modules
  lib/
    supabase.ts         Supabase anon client
    supabase-admin.ts   Server-side admin client
    auth/               Auth helpers
    db/                 Data access modules
  types/
    database.ts         Shared database types
scripts/
  sql/                  Database migrations and RPC scripts
docs/
  SECURITY.md           Security notes
```

## Environment

Create `.env.local` from `.env.example`:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
```

Never commit `.env.local` or production secrets.

## Run Locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run start
```

## Notes

This repository is a portfolio-safe code showcase. Operational secrets, local environment files, generated analysis artifacts, and private development notes are excluded from the public tree.

## License

MIT
