<div align="center">

# PowerNet Manager

### ISP operations dashboard for customers, billing, staff, complaints, and reports.

![Next.js](https://img.shields.io/badge/Next.js-15-111111?style=flat-square&logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-React-111111?style=flat-square&logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-111111?style=flat-square&logo=supabase)
![Status](https://img.shields.io/badge/Portfolio--safe-Public%20Showcase-111111?style=flat-square)

</div>

PowerNet Manager is a production-grade admin dashboard built for an internet service provider workflow. It connects customer CRM, billing, complaints, staff roles, reports, and Supabase-backed data operations in one dashboard.

## At a Glance

| Area | Details |
|---|---|
| Product type | ISP management and operations dashboard |
| Users | Admins, technicians, recovery agents, helpers |
| Backend | Supabase Auth, PostgreSQL, RPC functions, typed data access |
| Frontend | Next.js 15, React, TypeScript, responsive dashboard UI |
| Showcase value | Real business workflow design, role access, reporting, and operational CRUD |

## What It Proves

| Capability | Example in this project |
|---|---|
| Business dashboard engineering | Customer, billing, complaint, staff, and reporting modules |
| Role-based access | Admin, technician, recovery agent, helper workflows |
| Database-backed operations | Supabase tables, RPC calls, auth, and server-side admin client |
| Field-service thinking | Complaint assignment, payment recovery, area/package/customer tracking |
| Production hygiene | Environment-based secrets, portfolio-safe public tree, generated artifacts excluded |

## Product Surface

- Customer CRM with search, service details, packages, areas, and status tracking.
- Billing and payment recovery workflows for operational teams.
- Complaint intake, assignment, priority handling, and resolution status.
- Staff management for admin and field-service roles.
- Reports for revenue, billing, complaints, customer growth, and area-level operations.

## Stack

| Layer | Technology |
|---|---|
| App | Next.js 15, React, TypeScript |
| Data | Supabase, PostgreSQL, PostgREST, RPC |
| Auth | Supabase Auth with role-aware access |
| UI | Custom responsive dashboard components |
| Deployment | Vercel-ready Next.js build |

## Project Map

```text
src/
  app/                  Next.js app shell and API routes
  components/           Dashboard shell, charts, UI, auth, pages
  lib/                  Supabase clients, auth helpers, data modules
  types/                Shared database types
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

## Portfolio Note

This public repository is prepared as a portfolio-safe code showcase. Operational secrets, local environment files, generated analysis artifacts, and private development notes are excluded.

## License

MIT
