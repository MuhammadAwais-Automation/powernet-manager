# PowerNet Manager

ISP Operations Dashboard — built with Next.js 15, React, TypeScript, and Supabase.

## Features

- **Dashboard** — Live stats: customers, revenue, complaints, active staff
- **Customers** — Full customer management with search, add, edit, status tracking
- **Billing & Payments** — Bill generation, payment recording, overdue tracking
- **Complaints** — Support ticket system with priority and assignment
- **Staff Management** — Technician and recovery agent tracking
- **Areas & Sectors** — Service zone management (garrison/civilian)
- **Reports** — Revenue, billing, and operational insights

## Tech Stack

- **Frontend:** Next.js 15 App Router, React 18, TypeScript
- **Database:** Supabase (PostgreSQL)
- **Styling:** Custom CSS with CSS variables — light/dark theme
- **Charts:** Custom SVG components (Sparkline, Donut, Revenue Line)

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Add your Supabase credentials to .env.local

# Run development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_KEY=your_service_role_key
```

## Project Structure

```
src/
├── app/                  # Next.js shell
├── components/
│   ├── App.tsx           # Main shell with sidebar & routing
│   ├── pages/            # One component per section
│   ├── charts.tsx        # SVG chart components
│   └── ui.tsx            # Shared UI primitives
├── lib/
│   ├── supabase.ts       # Supabase client
│   └── db/               # Data access layer
└── types/
    └── database.ts       # TypeScript DB types
```

## Scripts

```bash
npm run dev      # Development server
npm run build    # Production build
npm run lint     # ESLint
npm run start    # Production server
```
