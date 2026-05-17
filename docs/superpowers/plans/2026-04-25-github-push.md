# GitHub Push + README Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** README ko improve karo, GitHub par naya public repo banao, aur saara code push karo.

**Architecture:** Existing git repo mein remote already configured hai (`origin → MuhammadAwais-Automation/powernet-manager`). Repo abhi GitHub par exist nahi karta. Plan mein pehle README improve hogi, phir GitHub API se repo create, phir push.

**Tech Stack:** Next.js 15, React 18, TypeScript, Supabase (PostgreSQL), Custom CSS — no Tailwind

---

## Current State

- Git repo: `D:/PowerNet Manager` — 10 commits, branch `main`
- Remote: `origin → https://github.com/MuhammadAwais-Automation/powernet-manager.git` (configured lekin repo exist nahi karta)
- README.md: exist karta hai — basic content, improve karna hai
- `.gitignore`: `.env*.local`, `.claude/`, `.mcp.json` already excluded — secrets safe hain

---

## Files

| Action | File |
|--------|------|
| Modify | `README.md` |
| Create | `D:/PowerNet Manager` → GitHub repo `powernet-manager` |

---

## Task 1: README ko improve karo

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Existing README parhو**

```bash
cat "D:/PowerNet Manager/README.md"
```

- [ ] **Step 2: README replace karo — improved version likho**

`README.md` ko is content se replace karo:

```markdown
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
npm run start    # Start production server
```

---

## Navigation

This project uses **React state routing** (not Next.js file-based routing).  
`App.tsx` holds `currentPage` state — to add a new section, add a value to that state, a sidebar entry, and a new `pages/` component.

---

## License

MIT — free to use and modify.
```

- [ ] **Step 3: .env.example file banao** (taake clone karne wale ko pata chale kya chahiye)

`D:/PowerNet Manager/.env.example` file banao:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_KEY=your_supabase_service_role_key
```

- [ ] **Step 4: Commit karo**

```bash
cd "D:/PowerNet Manager"
git add README.md .env.example
git commit -m "docs: improve README with features, roles, structure + add .env.example"
```

Expected: `1 file changed` commit success

---

## Task 2: GitHub par repo create karo

**Files:**
- No file changes — GitHub API call

- [ ] **Step 1: GitHub API se repo create karo**

```bash
curl -s -X POST \
  -H "Authorization: token REDACTED_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "powernet-manager",
    "description": "ISP Operations Dashboard — Next.js 15 + Supabase",
    "private": false,
    "has_issues": true,
    "has_wiki": false
  }' \
  https://api.github.com/user/repos
```

Expected response: JSON with `"full_name": "MuhammadAwais-Automation/powernet-manager"`

- [ ] **Step 2: Repo creation verify karo**

```bash
curl -s -H "Authorization: token REDACTED_TOKEN" \
  "https://api.github.com/repos/MuhammadAwais-Automation/powernet-manager" \
  | python -c "import sys,json; d=json.load(sys.stdin); print('OK:', d['full_name'], '| Private:', d['private'])"
```

Expected: `OK: MuhammadAwais-Automation/powernet-manager | Private: False`

---

## Task 3: Remote update karo aur push karo

**Files:**
- No file changes — git remote + push

- [ ] **Step 1: Remote URL clean karo (token ke baghair)**

```bash
cd "D:/PowerNet Manager"
git remote set-url origin https://github.com/MuhammadAwais-Automation/powernet-manager.git
git remote -v
```

Expected:
```
origin  https://github.com/MuhammadAwais-Automation/powernet-manager.git (fetch)
origin  https://github.com/MuhammadAwais-Automation/powernet-manager.git (push)
```

- [ ] **Step 2: Saare commits push karo**

```bash
cd "D:/PowerNet Manager"
git push -u origin main
```

Expected: `Branch 'main' set up to track remote branch 'main' from 'origin'`

> Agar authentication error aaye to remote mein token add karo temporarily:
> ```bash
> git remote set-url origin https://REDACTED_TOKEN@github.com/MuhammadAwais-Automation/powernet-manager.git
> git push -u origin main
> git remote set-url origin https://github.com/MuhammadAwais-Automation/powernet-manager.git
> ```

- [ ] **Step 3: Push verify karo**

```bash
curl -s -H "Authorization: token REDACTED_TOKEN" \
  "https://api.github.com/repos/MuhammadAwais-Automation/powernet-manager/commits?per_page=3" \
  | python -c "import sys,json; [print(c['commit']['message'][:60]) for c in json.load(sys.stdin)]"
```

Expected: Last 3 commit messages nazar aayein

---

## Self-Review Checklist

- [x] README mein saare features covered hain
- [x] Roles table add ki gayi
- [x] `.env.example` banaya — clone karne wale ko guide milegi
- [x] `.env.local` gitignore mein already hai — secrets safe
- [x] `.claude/`, `.mcp.json`, `.playwright-mcp/` gitignore mein hain — local tools expose nahi honge
- [x] Remote URL mein token nahi rahega final push ke baad
- [x] Repo public banaya — visible to everyone
