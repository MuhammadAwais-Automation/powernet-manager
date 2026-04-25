# Dashboard Authentication & Role-Based Access — Design Spec
**Date:** 2026-04-25
**Project:** PowerNet Manager (Next.js admin dashboard)
**Scope:** Add login system to the dashboard with two role tiers — Admin (full access) and Complaint Manager (Complaints + read-only Customers). Built on Supabase Auth.

---

## Problem

Dashboard abhi public hai — koi bhi `/` URL khol kar saari ISP operations data dekh sakta hai. Vercel par deploy karna hai, but pehle login system chahiye. Plus ek operational requirement: ek "Complaint Manager" role chahiye jo sirf complaints + customer details dekh kar complaint log kar sake — admin features (billing, staff, areas, packages) us se hidden hon.

---

## Goal

1. Dashboard pe login screen — username + password
2. Sirf 2 dashboard roles login kar sakte hain: `admin`, `complaint_manager`
3. Admin saara dashboard dekh sake
4. Complaint Manager sirf Complaints (full access) + Customers (read-only) dekh sake
5. Admin Staff Management se aur admins/CMs banaye
6. Stay-logged-in via Supabase Auth session (auto refresh)
7. Vercel par deploy ke baad bhi safe — JWT-based, na ki client-side gate

---

## What Is NOT In Scope

- Replacing `anon_write` RLS policies with auth-based RLS (deferred to Phase 2)
- Forgot password / email reset flow (admin manually resets via dashboard)
- Two-factor auth
- Audit logs (who-did-what)
- Mobile staff app touch — Flutter app stays on `verify_staff_login` RPC unchanged
- Multi-tenancy / multi-ISP support

---

## Architecture

### Auth split

```
Dashboard users (admin/complaint_manager)
    → Supabase Auth (auth.users)
    → JWT in localStorage, auto refresh
    → linked to staff table via auth_user_id

Mobile staff (technician/recovery_agent/helper)
    → verify_staff_login RPC (existing, unchanged)
    → username + password_hash in staff table
```

Dono auth systems independent hain. Mobile app aur dashboard alag-alag flows use karte hain. Same `staff` table donoṅ ko serve karta hai with branching columns.

### Email-as-username trick

Supabase Auth ko email chahiye. UI mein username dikhe ga, behind-the-scenes mapping:

| User input | Sent to Supabase Auth |
|---|---|
| `awais` | `awais@powernet.local` |
| `mohsin_cm` | `mohsin_cm@powernet.local` |

`@powernet.local` suffix is a fake domain — never sends actual mail. `staff.username` column stores the bare username.

---

## Data Model Changes

### `staff` table

Add 1 column:

```sql
ALTER TABLE staff ADD COLUMN auth_user_id UUID UNIQUE REFERENCES auth.users(id);
```

- `auth_user_id` = links dashboard user to their `auth.users` row
- NULL for mobile-only roles (technician, recovery_agent, helper)
- NOT NULL for dashboard roles (admin, complaint_manager)

Existing columns `username` and `password_hash` reh jayenge — mobile staff still uses them. Dashboard staff ka `password_hash` always NULL (Supabase Auth handles password).

### Update CHECK constraint

```sql
ALTER TABLE staff DROP CONSTRAINT staff_role_check;
ALTER TABLE staff ADD CONSTRAINT staff_role_check
  CHECK (role IN ('technician', 'recovery_agent', 'helper', 'admin', 'complaint_manager'));
```

### TypeScript type

```typescript
// src/types/database.ts
export type StaffRole =
  | 'technician'
  | 'recovery_agent'
  | 'helper'
  | 'admin'
  | 'complaint_manager';

export type Staff = {
  id: string;
  full_name: string;
  role: StaffRole;
  phone: string | null;
  area_id: string | null;
  username: string | null;
  auth_user_id: string | null;   // NEW
  is_active: boolean;
  created_at: string;
};
```

---

## Auth Flow

### Login

```
LoginScreen (form: username + password)
        ↓
   supabase.auth.signInWithPassword({
     email: `${username}@powernet.local`,
     password,
   })
        ↓
   ┌──────────┬──────────┐
   success    failure
        ↓          ↓
   fetch staff   "Invalid credentials" banner
   row WHERE
   auth_user_id =
   session.user.id
        ↓
   role check:
   admin OR complaint_manager?
   ┌────────────┬───────────┐
   yes          no
        ↓            ↓
   AuthContext   signOut() + banner:
   stores staff  "Not authorized for dashboard"
        ↓
   Render Dashboard
   (default page = role-specific)
```

### App.tsx mount

```
App.tsx mounts
   ↓
   AuthProvider runs supabase.auth.getSession()
   ↓
   ┌──────────┬───────────┐
   has session  no session
        ↓             ↓
   fetch staff   render <LoginScreen />
   row, store
   in context
        ↓
   render Dashboard
```

### Logout

Topbar/sidebar logout button → `supabase.auth.signOut()` → AuthContext clears → LoginScreen.

### Session persistence

`supabase-js` defaults to `localStorage` for session storage with auto-refresh. User browser band kare aur wapas khole — automatically logged in. JWT token expiry 1 hour, refresh token long-lived.

---

## React AuthContext

```typescript
// src/lib/auth/auth-context.tsx
type AuthContextValue = {
  staff: Staff | null;       // null = not logged in
  loading: boolean;          // true during initial getSession()
  login(username: string, password: string): Promise<{ ok: boolean; error?: string }>
  logout(): Promise<void>
}

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element
export function useAuth(): AuthContextValue
```

Wraps app at root in `app/layout.tsx` or inside `App.tsx`.

---

## Sidebar Gating + Routing

### Nav items per role

```typescript
// src/lib/auth/permissions.ts
export const NAV_BY_ROLE: Record<StaffRole, string[]> = {
  admin:             ['dashboard', 'customers', 'billing', 'complaints', 'staff', 'areas', 'packages', 'settings'],
  complaint_manager: ['complaints', 'customers'],
  // mobile-only — never used in dashboard but defensive defaults:
  technician: [],
  recovery_agent: [],
  helper: [],
};

export const DEFAULT_PAGE_BY_ROLE: Record<StaffRole, string> = {
  admin: 'dashboard',
  complaint_manager: 'complaints',
  technician: 'dashboard',
  recovery_agent: 'dashboard',
  helper: 'dashboard',
};
```

### Sidebar render

`App.tsx` sidebar items array filter:
```typescript
const allowedNav = NAV_BY_ROLE[staff.role];
const visibleItems = allItems.filter(i => allowedNav.includes(i.id));
```

### Page-level guard

Defense in depth — page component mount pe role check:
```typescript
const { staff } = useAuth();
if (!NAV_BY_ROLE[staff!.role].includes('customers')) {
  return <AccessDenied />;
}
```

### Customers read-only mode for CM

```typescript
const readOnly = staff?.role === 'complaint_manager';
{!readOnly && <button>Add Customer</button>}
{!readOnly && <button>Edit</button>}
{!readOnly && <button>Delete</button>}
```

Customer detail drawer ka edit button bhi hide.

---

## Creating Dashboard Users (Admin / Complaint Manager)

### StaffPage UI changes

Top par naya **"Dashboard Users"** section add hoga (mobile staff sections se pehle):

```
● DASHBOARD USERS · 2
  [Awais @awais Admin]   [Mohsin @mohsin_cm Complaint Mgr]

● TECHNICIANS · 1
  [...]

● RECOVERY AGENTS · 0

● HELPERS · 0
```

Card UI same rahega — sirf grouping aur role badge color update.

`ROLE_LABELS` and `ROLE_COLORS` mein add:
```typescript
admin:             'Admin',
complaint_manager: 'Complaint Manager',
```
```typescript
admin:             'gray',
complaint_manager: 'purple',
```

### "Add Staff" form

Role dropdown mein 5 options:
- Technician
- Recovery Agent
- Helper
- Admin
- Complaint Manager

**Branching behavior on submit:**

If role is mobile (technician/recovery_agent/helper):
- Existing flow: `createStaff()` → `set_staff_password` RPC
- `auth_user_id = NULL`

If role is dashboard (admin/complaint_manager):
- POST to new Next.js API route `/api/admin/create-dashboard-user`
- API uses `SUPABASE_SERVICE_KEY` to call `supabase.auth.admin.createUser({ email: 'username@powernet.local', password, email_confirm: true })`
- API inserts `staff` row with `auth_user_id = newUser.id`, role, name, etc.
- Returns staff row

### Reset Password

Existing card "Reset Password" button:
- Mobile staff → `set_staff_password` RPC (existing)
- Dashboard staff → POST to `/api/admin/reset-dashboard-password` → `supabase.auth.admin.updateUserById(authUserId, { password: newPassword })`

### Server-side API routes

```
src/app/api/admin/
├── create-dashboard-user/route.ts
└── reset-dashboard-password/route.ts
```

Both routes:
- Validate session via `supabase.auth.getUser()` from request cookies/header
- Check caller's `staff.role === 'admin'` (only admins can create dashboard users)
- Return 401 if not authenticated, 403 if not admin
- Use `SUPABASE_SERVICE_KEY` (env var) for admin operations

---

## Login Screen UI

```
┌──────────────────────────────────────────┐
│                                          │
│              [PowerNet logo]             │
│              PowerNet Manager            │
│              Admin Dashboard             │
│                                          │
│   ┌──────────────────────────────────┐   │
│   │ 👤  Username                     │   │
│   └──────────────────────────────────┘   │
│                                          │
│   ┌──────────────────────────────────┐   │
│   │ 🔒  Password                 👁  │   │
│   └──────────────────────────────────┘   │
│                                          │
│   [error banner if login failed]         │
│                                          │
│   ┌──────────────────────────────────┐   │
│   │          LOGIN  (orange)         │   │
│   └──────────────────────────────────┘   │
└──────────────────────────────────────────┘
```

- Centered card on white background, soft shadow, max-width 400px
- Big PowerNet orange logo + "Admin Dashboard" subtitle
- Username — autocomplete off, lowercase, no spaces validation
- Password — show/hide eye toggle
- LOGIN button — full width, orange, disabled while loading, spinner on submit
- Error → red banner above LOGIN button
- During initial `getSession()` resolution → full-screen orange spinner

### File location

- New file: `src/components/auth/LoginScreen.tsx`
- Wired into `App.tsx`: `loading` true → spinner; `staff` null → `<LoginScreen />`; `staff` set → dashboard

---

## Bootstrap (First Admin Creation)

User runs this SQL in Supabase SQL editor (one-time, with their own credentials):

```sql
-- 1. Create auth.users row
SELECT auth.admin_create_user(
  email := 'awais@powernet.local',
  password := 'CHOOSE_A_STRONG_PASSWORD',
  email_confirm := true
);

-- 2. Get the auth_user_id
-- (Run this and note the id)
SELECT id FROM auth.users WHERE email = 'awais@powernet.local';

-- 3. Insert staff row
INSERT INTO staff (full_name, role, username, auth_user_id, is_active)
VALUES ('Awais', 'admin', 'awais', '<uuid-from-step-2>', true);
```

OR use Supabase Dashboard → Authentication → Users → Add user (email + password) → then run only step 3.

After this, admin can login at `/` and create other admins/CMs from Staff Management.

---

## Error Handling

| Scenario | Behavior |
|---|---|
| Wrong username/password | Red banner: "Invalid credentials" |
| Empty fields | Inline "Required" + LOGIN disabled |
| Mobile staff role logs in to dashboard | After successful auth, role check → `signOut()` + banner: "This account is not authorized for the dashboard" |
| Network error | Red banner: "Connection error, try again" |
| `auth_user_id` set but staff row missing | `signOut()` + banner: "Account not found, contact admin" |
| Duplicate username on Add | API returns 409 → modal error: "Username already exists" |
| Service key API down | Modal error: "Could not create user, try again" |
| Session expired mid-session | Supabase JS auto-refresh; if refresh fails → redirect to LoginScreen |
| User tries to access disallowed page directly | `<AccessDenied />` component renders |

---

## RLS / Security Posture

**Phase 1 (this spec):** `anon_write` policy stays as-is. Dashboard auth is a **client-side gate** — same as existing customer/billing/etc. data flows via anon key.

**Why this is acceptable for now:**
- Internal ISP tool — not public-facing SaaS
- Vercel deploy can be private (auth-protected at Vercel level if needed)
- Anon key can be considered "internal credential"
- Refactoring all RLS policies is a separate, large effort

**Phase 2 (future, separate spec):** Replace `anon_write` with proper RLS using `auth.uid()`:
- complaint_manager → SELECT/INSERT/UPDATE on complaints, SELECT on customers
- admin → ALL on everything
- Mobile staff stuck on RPC pattern (no direct table access)

---

## Migration from Current State

### DB migration

```sql
-- 1. Add auth_user_id column
ALTER TABLE staff ADD COLUMN auth_user_id UUID UNIQUE REFERENCES auth.users(id);

-- 2. Update role CHECK constraint
ALTER TABLE staff DROP CONSTRAINT staff_role_check;
ALTER TABLE staff ADD CONSTRAINT staff_role_check
  CHECK (role IN ('technician', 'recovery_agent', 'helper', 'admin', 'complaint_manager'));
```

### Existing data

- Current `awais` (technician) staff row: keeps `auth_user_id = NULL`, still uses mobile RPC
- After bootstrap SQL runs, a NEW row for admin Awais (separate, with `auth_user_id`) exists for dashboard

### .env additions

`.env.local` already has `SUPABASE_SERVICE_KEY`. No new env vars needed.

For Vercel deploy: ensure `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_KEY` are set in Vercel project env vars.

---

## File Changes Summary

| File | Change |
|---|---|
| Supabase migration | Add `auth_user_id` column, update role CHECK constraint |
| `src/types/database.ts` | Add `admin`/`complaint_manager` to `StaffRole`, add `auth_user_id` to `Staff` |
| `src/lib/auth/auth-context.tsx` | NEW — AuthProvider + useAuth hook |
| `src/lib/auth/permissions.ts` | NEW — `NAV_BY_ROLE`, `DEFAULT_PAGE_BY_ROLE` |
| `src/components/auth/LoginScreen.tsx` | NEW — login form |
| `src/components/auth/AccessDenied.tsx` | NEW — fallback for disallowed pages |
| `src/components/App.tsx` | Wrap in AuthProvider, gate dashboard render on auth state, role-filtered sidebar, default page by role |
| `src/components/pages/StaffPage.tsx` | Add `admin` + `complaint_manager` to ROLE_LABELS/ROLE_COLORS, new "Dashboard Users" section, branching create flow in form |
| `src/components/pages/CustomersPage.tsx` | Read-only mode for `complaint_manager` |
| `src/lib/db/staff.ts` | `getStaff()` selects `auth_user_id`; `createStaff` branches based on role |
| `src/app/api/admin/create-dashboard-user/route.ts` | NEW — service-role API to create auth.users + staff row |
| `src/app/api/admin/reset-dashboard-password/route.ts` | NEW — service-role API to reset password |

---

## Future Work (Out of Scope)

- Phase 2 RLS hardening (per-role row policies)
- Forgot password email flow
- Audit log (who-changed-what)
- Session activity dashboard
- Two-factor auth
- IP allowlisting for admin
