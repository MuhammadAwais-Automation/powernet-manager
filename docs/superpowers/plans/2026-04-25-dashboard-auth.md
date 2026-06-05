# Dashboard Auth + Role-Based Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add username/password login to PowerNet Manager dashboard with two role tiers — `admin` (full access) and `complaint_manager` (Complaints + read-only Customers). Built on Supabase Auth.

**Architecture:** Supabase Auth handles dashboard sessions (JWT in localStorage, auto refresh). Email-as-username trick: UI shows `username`, sent to Supabase as `username@powernet.local`. `staff` table extended with `auth_user_id` column linking to `auth.users`. React `AuthContext` resolves session on mount; `App.tsx` gates dashboard render on auth state and filters sidebar by role. Service-role API routes (`/api/admin/*`) handle creation of dashboard users without exposing service key to browser.

**Tech Stack:** Next.js 15 App Router, Supabase Auth (`@supabase/supabase-js` v2), TypeScript, React Context API.

**Spec:** `docs/superpowers/specs/2026-04-25-dashboard-auth-design.md`.

**Note on testing:** Per `CLAUDE.md`, this project has no test framework. Each task ends with **build verification** (`npm run build`) and **manual verification** in the browser.

---

## File Structure

**New files:**
```
src/lib/auth/
├── auth-context.tsx              # AuthProvider, useAuth hook
└── permissions.ts                # NAV_BY_ROLE, DEFAULT_PAGE_BY_ROLE

src/lib/supabase-admin.ts         # Service-role client (server-only)

src/components/auth/
├── LoginScreen.tsx               # Login form
└── AccessDenied.tsx              # Fallback page for disallowed routes

src/app/api/admin/
├── create-dashboard-user/route.ts
└── reset-dashboard-password/route.ts
```

**Modified files:**
```
src/types/database.ts             # Expand StaffRole, add auth_user_id to Staff
src/lib/db/staff.ts               # Select auth_user_id, branching create
src/components/App.tsx            # Wrap in AuthProvider, gate dashboard, filter sidebar, logout
src/components/pages/StaffPage.tsx       # New roles + Dashboard Users section + branching create
src/components/pages/CustomersPage.tsx   # Read-only mode for complaint_manager
```

---

## Task 1: DB migration — add `auth_user_id`, expand role CHECK

**Files:**
- DB only (Supabase migration)

- [ ] **Step 1: Apply migration**

Run via Supabase MCP `apply_migration` tool with name `add_auth_user_id_and_expand_roles`:

```sql
-- 1. Add auth_user_id column linked to auth.users
ALTER TABLE staff ADD COLUMN auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

-- 2. Update role CHECK constraint to include admin and complaint_manager
ALTER TABLE staff DROP CONSTRAINT staff_role_check;
ALTER TABLE staff ADD CONSTRAINT staff_role_check
  CHECK (role IN ('technician', 'recovery_agent', 'helper', 'admin', 'complaint_manager'));
```

- [ ] **Step 2: Verify column exists**

Run via execute_sql:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'staff' AND column_name = 'auth_user_id';
```

Expected: 1 row, `auth_user_id`, `uuid`, `YES`.

- [ ] **Step 3: Verify constraint**

```sql
SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'staff_role_check';
```

Expected: contains `'admin'` and `'complaint_manager'`.

- [ ] **Step 4: No git commit needed** (DB-only change)

---

## Task 2: Update TypeScript types

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Update StaffRole and Staff**

Open `src/types/database.ts`. Replace the `StaffRole` and `Staff` definitions:

```typescript
export type StaffRole =
  | 'technician'
  | 'recovery_agent'
  | 'helper'
  | 'admin'
  | 'complaint_manager'

export type Staff = {
  id: string
  full_name: string
  role: StaffRole
  phone: string | null
  area_id: string | null
  username: string | null
  auth_user_id: string | null
  is_active: boolean
  created_at: string
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: build succeeds (existing role usages may compile-warn — fixed in later tasks).

- [ ] **Step 3: Commit**

```bash
git add src/types/database.ts
git commit -m "types: add admin + complaint_manager roles, auth_user_id column"
```

---

## Task 3: Update `lib/db/staff.ts` to select `auth_user_id`

**Files:**
- Modify: `src/lib/db/staff.ts`

- [ ] **Step 1: Update column lists**

Open `src/lib/db/staff.ts`. Replace column lists in 3 places (`getStaff`, `createStaff`, `updateStaff`):

```typescript
import { supabase } from '@/lib/supabase'
import type { Staff, StaffWithArea } from '@/types/database'

const COLS = 'id, full_name, role, phone, area_id, username, auth_user_id, is_active, created_at'

export async function getStaff(): Promise<StaffWithArea[]> {
  const { data, error } = await supabase
    .from('staff')
    .select(`${COLS}, area:areas(*)`)
    .order('full_name')
  if (error) throw error
  return data as unknown as StaffWithArea[]
}

export async function createStaff(input: {
  full_name: string
  role: string
  phone: string | null
  area_id: string | null
  is_active: boolean
  username: string | null
  password?: string
}): Promise<Staff> {
  const { password, ...rest } = input
  const { data, error } = await supabase
    .from('staff')
    .insert(rest)
    .select(COLS)
    .single()
  if (error) throw error
  const staff = data as Staff

  if (password && staff.id) {
    await supabase.rpc('set_staff_password', {
      p_staff_id: staff.id,
      p_plain_password: password,
    })
  }

  return staff
}

export async function updateStaff(id: string, input: Partial<{
  full_name: string
  role: string
  phone: string | null
  area_id: string | null
  username: string | null
  is_active: boolean
}>): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .update(input)
    .eq('id', id)
    .select(COLS)
    .single()
  if (error) throw error
  return data as Staff
}

export async function updateStaffPassword(staffId: string, newPassword: string): Promise<void> {
  const { error } = await supabase.rpc('set_staff_password', {
    p_staff_id: staffId,
    p_plain_password: newPassword,
  })
  if (error) throw error
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/staff.ts
git commit -m "feat(db): select auth_user_id in staff queries"
```

---

## Task 4: Create permissions module

**Files:**
- Create: `src/lib/auth/permissions.ts`

- [ ] **Step 1: Create file**

```typescript
import type { StaffRole } from '@/types/database'

export type PageId =
  | 'dashboard'
  | 'customers'
  | 'billing'
  | 'complaints'
  | 'staff'
  | 'areas'
  | 'reports'
  | 'settings'

export const NAV_BY_ROLE: Record<StaffRole, PageId[]> = {
  admin:             ['dashboard', 'customers', 'billing', 'complaints', 'staff', 'areas', 'reports', 'settings'],
  complaint_manager: ['complaints', 'customers'],
  technician:        [],
  recovery_agent:    [],
  helper:            [],
}

export const DEFAULT_PAGE_BY_ROLE: Record<StaffRole, PageId> = {
  admin:             'dashboard',
  complaint_manager: 'complaints',
  technician:        'dashboard',
  recovery_agent:    'dashboard',
  helper:            'dashboard',
}

export function canAccessPage(role: StaffRole, page: PageId): boolean {
  return NAV_BY_ROLE[role].includes(page)
}

export const DASHBOARD_ROLES: StaffRole[] = ['admin', 'complaint_manager']

export function isDashboardRole(role: StaffRole): boolean {
  return DASHBOARD_ROLES.includes(role)
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/permissions.ts
git commit -m "feat(auth): add NAV_BY_ROLE and DEFAULT_PAGE_BY_ROLE permissions"
```

---

## Task 5: Create AuthContext + useAuth hook

**Files:**
- Create: `src/lib/auth/auth-context.tsx`

- [ ] **Step 1: Create file**

```typescript
'use client'
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Staff } from '@/types/database'
import { isDashboardRole } from './permissions'

const USERNAME_DOMAIN = '@powernet.local'

const COLS = 'id, full_name, role, phone, area_id, username, auth_user_id, is_active, created_at'

type AuthContextValue = {
  staff: Staff | null
  loading: boolean
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchStaffByAuthId(authUserId: string): Promise<Staff | null> {
  const { data, error } = await supabase
    .from('staff')
    .select(COLS)
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (error || !data) return null
  return data as Staff
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function bootstrap() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!active) return
      if (!session) {
        setStaff(null)
        setLoading(false)
        return
      }
      const s = await fetchStaffByAuthId(session.user.id)
      if (!active) return
      if (!s || !isDashboardRole(s.role) || !s.is_active) {
        await supabase.auth.signOut()
        setStaff(null)
      } else {
        setStaff(s)
      }
      setLoading(false)
    }
    bootstrap()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        setStaff(null)
        return
      }
      const s = await fetchStaffByAuthId(session.user.id)
      if (!s || !isDashboardRole(s.role) || !s.is_active) {
        await supabase.auth.signOut()
        setStaff(null)
      } else {
        setStaff(s)
      }
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const email = `${username.trim().toLowerCase()}${USERNAME_DOMAIN}`
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.session) {
      return { ok: false, error: 'Invalid credentials' }
    }
    const s = await fetchStaffByAuthId(data.session.user.id)
    if (!s) {
      await supabase.auth.signOut()
      return { ok: false, error: 'Account not found, contact admin' }
    }
    if (!isDashboardRole(s.role)) {
      await supabase.auth.signOut()
      return { ok: false, error: 'This account is not authorized for the dashboard' }
    }
    if (!s.is_active) {
      await supabase.auth.signOut()
      return { ok: false, error: 'Account disabled' }
    }
    setStaff(s)
    return { ok: true }
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
    setStaff(null)
  }, [])

  return (
    <AuthContext.Provider value={{ staff, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth/auth-context.tsx
git commit -m "feat(auth): add AuthProvider with session bootstrap and role check"
```

---

## Task 6: Create LoginScreen component

**Files:**
- Create: `src/components/auth/LoginScreen.tsx`

- [ ] **Step 1: Create file**

```typescript
'use client'
import React, { useState } from 'react'
import Icon from '../Icon'
import { useAuth } from '@/lib/auth/auth-context'

export default function LoginScreen() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = username.trim().length > 0 && password.length > 0 && !loading

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    try {
      const res = await login(username, password)
      if (!res.ok) setError(res.error ?? 'Login failed')
    } catch {
      setError('Connection error, try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 24,
    }}>
      <form onSubmit={onSubmit} className="card" style={{
        width: '100%', maxWidth: 400, padding: 32,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: 'var(--color-primary)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
          }}>
            <Icon name="zap" size={28} stroke={2.25} style={{ color: '#fff' }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>PowerNet Manager</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Admin Dashboard</div>
        </div>

        <div className="field">
          <label>Username</label>
          <input
            className="input"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={e => setUsername(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="field">
          <label>Password</label>
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              style={{ paddingRight: 38 }}
            />
            <button type="button" onClick={() => setShowPw(s => !s)}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 4,
              }}>
              <Icon name={showPw ? 'eyeOff' : 'eye'} size={16} />
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            padding: '10px 12px', borderRadius: 8, background: '#fee', color: '#c33',
            fontSize: 13, fontWeight: 500,
          }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={!canSubmit}
          style={{ width: '100%', height: 44, justifyContent: 'center', fontWeight: 600 }}>
          {loading ? 'Signing in…' : 'LOGIN'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/LoginScreen.tsx
git commit -m "feat(auth): add LoginScreen component"
```

---

## Task 7: Create AccessDenied fallback

**Files:**
- Create: `src/components/auth/AccessDenied.tsx`

- [ ] **Step 1: Create file**

```typescript
'use client'
import React from 'react'
import Icon from '../Icon'

export default function AccessDenied() {
  return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <Icon name="ban" size={36} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Access denied</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          You don&apos;t have permission to view this page.
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/components/auth/AccessDenied.tsx
git commit -m "feat(auth): add AccessDenied fallback component"
```

---

## Task 8: Wire AuthProvider + gate App.tsx

**Files:**
- Modify: `src/components/App.tsx`

- [ ] **Step 1: Replace App.tsx**

Overwrite `src/components/App.tsx`:

```typescript
'use client';
import React, { useState, useEffect, useMemo } from 'react';
import Icon from './Icon';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import BillingPage from './pages/BillingPage';
import ComplaintsPage from './pages/ComplaintsPage';
import StaffPage from './pages/StaffPage';
import AreasPage from './pages/AreasPage';
import ReportsPage from './pages/ReportsPage';
import LoginScreen from './auth/LoginScreen';
import AccessDenied from './auth/AccessDenied';
import { AuthProvider, useAuth } from '@/lib/auth/auth-context';
import { NAV_BY_ROLE, DEFAULT_PAGE_BY_ROLE, canAccessPage, type PageId } from '@/lib/auth/permissions';
import { initials } from '@/lib/utils';

const ALL_NAV: { id: PageId; label: string; icon: string }[] = [
  { id: 'dashboard',  label: 'Dashboard',          icon: 'grid' },
  { id: 'customers',  label: 'Customers',          icon: 'users' },
  { id: 'billing',    label: 'Billing & Payments', icon: 'card' },
  { id: 'complaints', label: 'Complaints',         icon: 'alert' },
  { id: 'staff',      label: 'Staff Management',   icon: 'briefcase' },
  { id: 'areas',      label: 'Areas & Sectors',    icon: 'pin' },
  { id: 'reports',    label: 'Reports',            icon: 'chart' },
];

const PAGE_META: Record<PageId, { title: string; sub: string }> = {
  dashboard:  { title: 'Dashboard',          sub: 'Overview of network operations' },
  customers:  { title: 'Customers',          sub: 'Subscribers across service areas' },
  billing:    { title: 'Billing & Payments', sub: 'Monthly billing & collections' },
  complaints: { title: 'Complaints',         sub: 'Open & in-progress tickets' },
  staff:      { title: 'Staff Management',   sub: 'Field agents & dashboard users' },
  areas:      { title: 'Areas & Sectors',    sub: 'Service zones' },
  reports:    { title: 'Reports',            sub: 'Analytics & exports' },
  settings:   { title: 'Settings',           sub: 'Organization, billing and integrations' },
};

const ROLE_LABEL_SHORT: Record<string, string> = {
  admin: 'Admin',
  complaint_manager: 'Complaint Manager',
};

function Sidebar({ active, setActive, allowedNav, staffName, staffRole, onLogout }: {
  active: PageId;
  setActive: (id: PageId) => void;
  allowedNav: PageId[];
  staffName: string;
  staffRole: string;
  onLogout: () => void;
}) {
  const visibleMain = ALL_NAV.filter(n => allowedNav.includes(n.id));
  const showSettings = allowedNav.includes('settings');
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="bolt"><Icon name="zap" size={16} stroke={2.25} /></span>
        <div>
          PowerNet Manager
          <span className="title-sub">ISP Operations</span>
        </div>
      </div>

      <div className="sidebar-section-label">Main</div>
      <nav className="sidebar-nav">
        {visibleMain.map(n => (
          <a key={n.id} className={`sidebar-link ${active === n.id ? 'active' : ''}`}
            onClick={e => { e.preventDefault(); setActive(n.id); }} href="#">
            <Icon name={n.icon as any} size={17} />
            <span>{n.label}</span>
          </a>
        ))}
        {showSettings && (
          <>
            <div style={{ height: 8 }} />
            <div className="sidebar-section-label" style={{ padding: '8px 12px 6px' }}>System</div>
            <a className={`sidebar-link ${active === 'settings' ? 'active' : ''}`}
              onClick={e => { e.preventDefault(); setActive('settings'); }} href="#">
              <Icon name="settings" size={17} /><span>Settings</span>
            </a>
          </>
        )}
      </nav>

      <div className="sidebar-user">
        <div className="avatar">{initials(staffName)}</div>
        <div className="who">
          <div className="name">{staffName}</div>
          <div className="role">{ROLE_LABEL_SHORT[staffRole] ?? staffRole}</div>
        </div>
        <button className="menu-btn" title="Logout" onClick={onLogout}>
          <Icon name="logout" size={16} />
        </button>
      </div>
    </aside>
  );
}

function Topbar({ meta, isDark, onToggleTheme, staffName, staffRole, onLogout }: {
  meta: { title: string; sub: string };
  isDark: boolean;
  onToggleTheme: () => void;
  staffName: string;
  staffRole: string;
  onLogout: () => void;
}) {
  return (
    <header className="topbar">
      <div>
        <div className="topbar-title">{meta.title}</div>
        <div className="topbar-sub">{meta.sub}</div>
      </div>
      <div className="topbar-search">
        <Icon name="search" size={14} />
        <input placeholder="Search…" />
        <span className="kbd">⌘K</span>
      </div>
      <button className="icon-btn" title="Theme" onClick={onToggleTheme}>
        <Icon name={isDark ? 'sun' : 'moon'} size={16} />
      </button>
      <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
      <div className="row gap-sm">
        <div className="topbar-avatar">{initials(staffName)}</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{staffName}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.2 }}>
            {ROLE_LABEL_SHORT[staffRole] ?? staffRole}
          </span>
        </div>
        <button className="icon-btn" title="Logout" onClick={onLogout}>
          <Icon name="logout" size={16} />
        </button>
      </div>
    </header>
  );
}

function FullScreenSpinner() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid var(--border)', borderTopColor: 'var(--color-primary)',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Shell() {
  const { staff, loading, logout } = useAuth();
  const [active, setActive] = useState<PageId>('dashboard');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    if (staff) setActive(DEFAULT_PAGE_BY_ROLE[staff.role]);
  }, [staff]);

  const allowedNav = useMemo(() => staff ? NAV_BY_ROLE[staff.role] : [], [staff]);

  if (loading) return <FullScreenSpinner />;
  if (!staff) return <LoginScreen />;

  const meta = PAGE_META[active];

  const renderPage = () => {
    if (!canAccessPage(staff.role, active)) return <AccessDenied />;
    switch (active) {
      case 'dashboard':  return <DashboardPage />;
      case 'customers':  return <CustomersPage />;
      case 'billing':    return <BillingPage />;
      case 'complaints': return <ComplaintsPage />;
      case 'staff':      return <StaffPage />;
      case 'areas':      return <AreasPage />;
      case 'reports':    return <ReportsPage />;
      case 'settings':
        return (
          <div className="page">
            <div className="page-header">
              <div><h1>Settings</h1><p>Organization profile, billing integrations and API keys</p></div>
            </div>
            <div className="card card-pad" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <Icon name="settings" size={32} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Settings coming soon</div>
              <div style={{ fontSize: 13 }}>Configure organization details, tax rates, payment gateways and SMS templates here.</div>
            </div>
          </div>
        );
    }
  };

  return (
    <div className="app">
      <Sidebar active={active} setActive={setActive} allowedNav={allowedNav}
        staffName={staff.full_name} staffRole={staff.role} onLogout={logout} />
      <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <Topbar meta={meta} isDark={isDark} onToggleTheme={() => setIsDark(d => !d)}
          staffName={staff.full_name} staffRole={staff.role} onLogout={logout} />
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {renderPage()}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: success.

- [ ] **Step 3: Commit**

```bash
git add src/components/App.tsx
git commit -m "feat(auth): wire AuthProvider, gate dashboard, role-filter sidebar, logout"
```

---

## Task 9: Bootstrap first admin (manual SQL — user runs this)

**This task is performed by the human user, not by automation.**

- [ ] **Step 1: Open Supabase Dashboard**

Go to https://supabase.com/dashboard → your project → Authentication → Users → "Add user" → "Create new user".

- [ ] **Step 2: Enter credentials**

- Email: `awais@powernet.local` (replace `awais` with your chosen username)
- Password: choose a strong password
- ✅ Auto Confirm User

Click "Create user". Copy the new user's UUID from the users list.

- [ ] **Step 3: Insert staff row**

In Supabase SQL editor, run (replace UUID and full name):

```sql
INSERT INTO staff (full_name, role, username, auth_user_id, is_active)
VALUES ('Awais', 'admin', 'awais', '<paste-uuid-here>', true);
```

- [ ] **Step 4: Verify**

```sql
SELECT s.full_name, s.role, s.username, u.email
FROM staff s
JOIN auth.users u ON u.id = s.auth_user_id
WHERE s.role = 'admin';
```

Expected: 1 row with your admin info.

- [ ] **Step 5: Test login**

```bash
npm run dev
```

Open http://localhost:3000 → LoginScreen visible → enter username `awais` + password → expected: Dashboard loads with admin sidebar (all sections visible).

If login fails, check browser console for errors and re-verify the auth.users row has email `<username>@powernet.local`.

---

## Task 10: Service-role Supabase client

**Files:**
- Create: `src/lib/supabase-admin.ts`

- [ ] **Step 1: Create file**

```typescript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceKey = process.env.SUPABASE_SERVICE_KEY!

export const supabaseAdmin = createClient(supabaseUrl, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})
```

This client is server-only. NEVER import this in browser code (any file marked `'use client'` or imported by one).

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase-admin.ts
git commit -m "feat(auth): add service-role supabase client (server-only)"
```

---

## Task 11: API route — create dashboard user

**Files:**
- Create: `src/app/api/admin/create-dashboard-user/route.ts`

- [ ] **Step 1: Create file**

```typescript
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const USERNAME_DOMAIN = '@powernet.local'

async function getCallerStaffRole(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
  if (userErr || !userData.user) return null
  const { data: staff, error: staffErr } = await supabaseAdmin
    .from('staff')
    .select('role')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()
  if (staffErr || !staff) return null
  return (staff as { role: string }).role
}

export async function POST(req: Request) {
  const role = await getCallerStaffRole(req.headers.get('authorization'))
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const { username, password, full_name, phone, area_id, role: newRole } = body as {
    username?: string; password?: string; full_name?: string;
    phone?: string | null; area_id?: string | null; role?: string;
  }

  if (!username || !password || !full_name || !newRole) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (newRole !== 'admin' && newRole !== 'complaint_manager') {
    return NextResponse.json({ error: 'Invalid dashboard role' }, { status: 400 })
  }

  const email = `${username.trim().toLowerCase()}${USERNAME_DOMAIN}`

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr || !created.user) {
    const msg = createErr?.message ?? 'Could not create auth user'
    if (msg.toLowerCase().includes('already')) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const { data: staffRow, error: staffErr } = await supabaseAdmin
    .from('staff')
    .insert({
      full_name,
      role: newRole,
      phone: phone ?? null,
      area_id: area_id ?? null,
      username: username.trim().toLowerCase(),
      auth_user_id: created.user.id,
      is_active: true,
    })
    .select('id, full_name, role, phone, area_id, username, auth_user_id, is_active, created_at')
    .single()

  if (staffErr || !staffRow) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id)
    return NextResponse.json({ error: staffErr?.message ?? 'Could not create staff row' }, { status: 500 })
  }

  return NextResponse.json({ staff: staffRow })
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/create-dashboard-user/route.ts
git commit -m "feat(api): create-dashboard-user route (admin-only)"
```

---

## Task 12: API route — reset dashboard password

**Files:**
- Create: `src/app/api/admin/reset-dashboard-password/route.ts`

- [ ] **Step 1: Create file**

```typescript
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getCallerStaffRole(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
  if (userErr || !userData.user) return null
  const { data: staff, error: staffErr } = await supabaseAdmin
    .from('staff')
    .select('role')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()
  if (staffErr || !staff) return null
  return (staff as { role: string }).role
}

export async function POST(req: Request) {
  const role = await getCallerStaffRole(req.headers.get('authorization'))
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const { auth_user_id, password } = body as { auth_user_id?: string; password?: string }
  if (!auth_user_id || !password) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(auth_user_id, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/admin/reset-dashboard-password/route.ts
git commit -m "feat(api): reset-dashboard-password route (admin-only)"
```

---

## Task 13: Update StaffPage — new roles + Dashboard Users section + branching create

**Files:**
- Modify: `src/components/pages/StaffPage.tsx`

- [ ] **Step 1: Update role labels and colors**

Open `src/components/pages/StaffPage.tsx`. Replace the `ROLE_LABELS` and `ROLE_COLORS` constants:

```typescript
const ROLE_LABELS: Record<string, string> = {
  technician:        'Technician',
  recovery_agent:    'Recovery Agent',
  helper:            'Helper',
  admin:             'Admin',
  complaint_manager: 'Complaint Manager',
};

const ROLE_COLORS: Record<string, 'blue' | 'amber' | 'green' | 'purple' | 'gray'> = {
  technician:        'blue',
  recovery_agent:    'amber',
  helper:            'green',
  admin:             'gray',
  complaint_manager: 'purple',
};

const DASHBOARD_ROLES = new Set(['admin', 'complaint_manager']);
```

- [ ] **Step 2: Update role dropdown options in form**

Find the `<select>` for role inside `StaffFormModal`. Replace its options block:

```typescript
<option value="technician">Technician</option>
<option value="recovery_agent">Recovery Agent</option>
<option value="helper">Helper</option>
<option value="admin">Admin</option>
<option value="complaint_manager">Complaint Manager</option>
```

- [ ] **Step 3: Update create flow with branching**

Inside `StaffFormModal`'s `handleSubmit`, replace the create branch (the `else` after `if (editTarget)`). Find the existing block that calls `createStaff(...)` for new staff and replace with:

```typescript
} else {
  if (DASHBOARD_ROLES.has(form.role)) {
    const { supabase } = await import('@/lib/supabase');
    const { data: { session } } = await supabase.auth.getSession();
    const token = session?.access_token;
    const res = await fetch('/api/admin/create-dashboard-user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        username: form.username.trim().toLowerCase(),
        password: form.password.trim(),
        full_name: form.full_name.trim(),
        phone:     form.phone || null,
        area_id:   form.area_id || null,
        role:      form.role,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? 'Could not create dashboard user');
    }
    const { staff: created } = await res.json();
    saved = created;
  } else {
    saved = await createStaff({
      full_name: form.full_name.trim(),
      role:      form.role,
      phone:     form.phone || null,
      area_id:   form.area_id || null,
      username:  form.username.trim().toLowerCase(),
      is_active: true,
      password:  form.password.trim(),
    });
  }
}
```

(Note: the `import` at top should bring `supabase`. The dynamic import in the create branch can be replaced with a top-level import:
```typescript
import { supabase } from '@/lib/supabase';
```
and then use `supabase.auth.getSession()` directly without the await import.)

- [ ] **Step 4: Update reset password flow**

Find the `CredentialsModal` component (or wherever `updateStaffPassword` is called for reset). Wrap the call with branching:

```typescript
if (target.auth_user_id) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  const res = await fetch('/api/admin/reset-dashboard-password', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ auth_user_id: target.auth_user_id, password: newPassword }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error ?? 'Could not reset password');
  }
} else {
  await updateStaffPassword(target.id, newPassword);
}
```

- [ ] **Step 5: Add Dashboard Users section + filter mobile sections**

Find the section where `byRole` is called and the page returns. Update to:

```typescript
const dashUsers = staff.filter(s => DASHBOARD_ROLES.has(s.role));
const technicians = byRole('technician');
const agents      = byRole('recovery_agent');
const helpers     = byRole('helper');
```

Update the page header counts text:

```typescript
{staff.length} total · {dashUsers.length} dashboard · {technicians.length} technicians · {agents.length} recovery agents
{helpers.length > 0 ? ` · ${helpers.length} helpers` : ''}
```

Add a Dashboard Users section BEFORE the Technicians section in the JSX:

```typescript
<SectionHeader label="Dashboard Users" count={dashUsers.length} color="var(--purple)" />
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 4 }}>
  {dashUsers.map(s => (
    <StaffCard key={s.id} s={s}
      onEdit={() => setEditTarget(s)}
      onViewCreds={() => setCredsTarget(s)}
      onToggleActive={v => handleToggleActive(s, v)} />
  ))}
</div>
```

- [ ] **Step 6: Verify build**

```bash
npm run build
```

- [ ] **Step 7: Commit**

```bash
git add src/components/pages/StaffPage.tsx
git commit -m "feat(staff): add admin + complaint_manager roles, Dashboard Users section, branching create/reset"
```

---

## Task 14: Customers page read-only mode for complaint_manager

**Files:**
- Modify: `src/components/pages/CustomersPage.tsx`

- [ ] **Step 1: Read existing file structure**

Open `src/components/pages/CustomersPage.tsx`. Identify the buttons / actions that perform writes:
- "Add Customer" button at top
- Edit button on rows
- Delete button on rows
- Save button in detail drawer / edit modal

- [ ] **Step 2: Add useAuth + readOnly flag**

At the top of the main exported component, add:

```typescript
import { useAuth } from '@/lib/auth/auth-context';

// inside the component:
const { staff } = useAuth();
const readOnly = staff?.role === 'complaint_manager';
```

- [ ] **Step 3: Hide write actions when readOnly**

For each write button/action found in step 1, wrap with `{!readOnly && (...)}`. Example for "Add Customer":

```typescript
{!readOnly && (
  <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
    <Icon name="plus" size={14} />Add Customer
  </button>
)}
```

For edit/delete buttons in row Actions cell — same pattern, wrap them.

For the detail drawer's Edit button — wrap.

For modals that auto-open via state (Add modal, Edit modal): those won't open if buttons are hidden, but as belt-and-suspenders, also early-return inside their `handleSubmit`:

```typescript
if (readOnly) return;
```

- [ ] **Step 4: Verify build**

```bash
npm run build
```

- [ ] **Step 5: Manual test**

Run dev server, log in as admin, verify Add/Edit/Delete buttons visible. Then create a complaint_manager user (Task 15), log in as them, verify Customers page shows but write buttons hidden.

- [ ] **Step 6: Commit**

```bash
git add src/components/pages/CustomersPage.tsx
git commit -m "feat(customers): read-only mode for complaint_manager"
```

---

## Task 15: End-to-end manual testing

Run dev server: `npm run dev` and open http://localhost:3000.

**Prep:** Admin row already created in Task 9.

- [ ] **Test 1: Login screen on first load**

Open in fresh incognito window. Expected: full-screen spinner briefly, then LoginScreen with logo + 2 fields + LOGIN button.

- [ ] **Test 2: Wrong credentials**

Enter username `nobody` / password `wrong`. Expected: red banner "Invalid credentials". Stays on LoginScreen.

- [ ] **Test 3: Empty fields**

Clear both fields. Expected: LOGIN button disabled.

- [ ] **Test 4: Successful admin login**

Enter your admin credentials. Expected: dashboard loads with all sidebar items visible (Dashboard, Customers, Billing, Complaints, Staff, Areas, Reports, Settings). Default landing page = Dashboard. Topbar shows your name + "Admin" + logout icon.

- [ ] **Test 5: Session persistence**

Reload the page. Expected: spinner → directly to dashboard (no LoginScreen). Close tab and reopen http://localhost:3000. Expected: still logged in.

- [ ] **Test 6: Create complaint_manager via Staff Management**

Navigate to Staff Management → click "+ Add Staff". Fill:
- Name: Test CM
- Role: Complaint Manager
- Username: test_cm
- Password: test123

Submit. Expected: success, new card appears in "Dashboard Users" section.

- [ ] **Test 7: Login as complaint_manager**

Logout. Login with `test_cm` / `test123`. Expected:
- Sidebar shows ONLY Complaints + Customers
- Default page = Complaints
- Topbar shows "Test CM" + "Complaint Manager"

- [ ] **Test 8: Customers read-only**

Click Customers in sidebar. Expected: customer list loads. NO "Add Customer" button visible. Open a customer's detail drawer → NO Edit button. Try to find any edit/delete control on rows → none visible.

- [ ] **Test 9: Complaints full access**

Click Complaints. Expected: full complaints page works. Create new complaint, assign technician, change status — all should work.

- [ ] **Test 10: Cannot access disallowed pages**

(For this test, manually call `setActive('billing')` is not exposed to user, so this is a defensive check.) Expected: AccessDenied component would render if state ever gets there. Skip if not testable via UI — code-level guard is sufficient.

- [ ] **Test 11: Logout clears session**

Click logout icon (sidebar or topbar). Expected: returned to LoginScreen. Reload — still LoginScreen (session cleared).

- [ ] **Test 12: Reset password for dashboard user**

Login as admin. Staff Management → click View Credentials on test_cm card → Reset Password → enter `newpass456` → submit. Expected: success.

Logout. Try login as `test_cm` / `test123` — expected: "Invalid credentials". Try `test_cm` / `newpass456` — expected: success.

- [ ] **Test 13: Disable account**

Login as admin. Toggle test_cm to inactive. Logout. Try login as `test_cm` — expected: "Account disabled" or "Invalid credentials" (either is acceptable).

- [ ] **Test 14: Mobile staff cannot login to dashboard**

Login as admin. Create a new technician via Staff Management with username `test_tech`, password `test123`. Logout.

Try login at dashboard with `test_tech` / `test123`. Expected: red banner "This account is not authorized for the dashboard".

If all pass, this task is complete.

---

## Task 16: Vercel environment variables

**This task is performed by the human user when ready to deploy.**

- [ ] **Step 1: Add env vars in Vercel project settings**

Vercel → Project → Settings → Environment Variables. Add:

| Name | Value | Environments |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | (from `.env.local`) | Production, Preview, Development |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (from `.env.local`) | Production, Preview, Development |
| `SUPABASE_SERVICE_KEY` | (from `.env.local`) | Production, Preview, Development |

⚠ `SUPABASE_SERVICE_KEY` must NOT have `NEXT_PUBLIC_` prefix (it's server-only).

- [ ] **Step 2: Deploy**

```bash
git push
```

Or via Vercel CLI: `vercel --prod`.

- [ ] **Step 3: Verify production login**

Open the Vercel deployment URL, login as admin. Expected: works identically to local.

---

## Self-Review Checklist

- ✅ **Spec coverage:**
  - Data model changes → Task 1, 2
  - Auth flow → Task 5 (AuthProvider)
  - AuthContext → Task 5
  - Sidebar gating + routing → Task 4 (permissions), Task 8 (App.tsx)
  - Customers read-only → Task 14
  - Creating dashboard users → Task 11 (API), Task 13 (UI)
  - Reset password → Task 12 (API), Task 13 (UI)
  - Login screen UI → Task 6
  - Bootstrap admin → Task 9
  - Error handling → covered in Task 5 (login function), Task 11 (API responses), Task 6 (LoginScreen banners)
  - RLS posture → no code change needed (deferred)
  - Vercel env → Task 16
- ✅ **Placeholder scan:** every code block complete, no TBDs
- ✅ **Type consistency:** `Staff.auth_user_id` used identically across types, db, context, API. `StaffRole` 5 values consistent across all files. `PageId` defined once in permissions.ts and imported by App.tsx.
- ✅ Frequent commits — one per task
