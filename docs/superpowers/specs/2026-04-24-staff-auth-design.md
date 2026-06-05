# Staff Authentication & Management — Design Spec
**Date:** 2026-04-24  
**Project:** PowerNet Manager (ISP Admin Dashboard)  
**Scope:** Admin dashboard side only. Flutter staff app is a separate future project.

---

## Problem

The Staff Management section exists but has no working authentication. Staff members cannot log in anywhere. Admin cannot set or view credentials. Only 2 roles exist (technician, recovery_agent).

---

## Goal

1. Admin can create staff with a username + password
2. Admin can view/copy/reset credentials from the dashboard
3. 4 roles supported: Technician, Recovery Agent, Helper Technician, Cable Operator
4. A Supabase function `verify_staff_login` is available for the future Flutter app to use

---

## What Is NOT in scope

- The Flutter mobile app itself (future project)
- Role-specific staff UI/pages
- Attendance, salary, task assignment

---

## Database Changes

### 1. New columns on `staff` table

| Column | Type | Notes |
|---|---|---|
| `username` | TEXT UNIQUE | Set by admin. e.g. `mohsin_tech` |
| `password_hash` | TEXT | bcrypt hash via pgcrypto. Never exposed in UI. |

### 2. Updated role constraint

```sql
CHECK (role IN ('technician', 'recovery_agent', 'helper_technician', 'cable_operator', 'admin'))
```

### 3. New Supabase function: `verify_staff_login`

```sql
verify_staff_login(p_username TEXT, p_password TEXT) RETURNS JSON
```

- Finds active staff by username
- Verifies password with `crypt()` (pgcrypto blowfish)
- Returns `{ success: true, staff: { id, full_name, role, phone, area_id, area_name } }` on success
- Returns `{ success: false, error: "Invalid credentials" }` on failure
- SECURITY DEFINER — safe for anon key callers (Flutter app)

Password hashing uses Postgres `pgcrypto` extension (`crypt()` + `gen_salt('bf')`). All hashing happens inside the database — no plain text passwords ever leave the server.

---

## Admin Dashboard Changes

### StaffRole type

```typescript
type StaffRole = 'technician' | 'recovery_agent' | 'helper_technician' | 'cable_operator' | 'admin'
```

Role display labels:
- `technician` → "Technician"
- `recovery_agent` → "Recovery Agent"  
- `helper_technician` → "Helper Technician"
- `cable_operator` → "Cable Operator"
- `admin` → "Admin"

### Staff table type

Add `username: string | null` and `password_hash: string | null` to `Staff` type. `password_hash` is fetched from DB but never rendered in any UI component.

### Add Staff Form

New fields added to existing modal:
- **Username** — text input, lowercase, no spaces (validated client-side). Admin chooses it.
- **Password** — password input with show/hide toggle. Admin chooses it.
- On save: call `set_staff_password(staff_id, plain_password)` RPC which hashes and stores.

Flow: insert staff row first (without hash) → call RPC to set hashed password → done.

### Staff Card

- Show `username` below the name (mono style, muted) if set
- "View Credentials" button → opens a small modal showing username + masked password with copy buttons and a "Reset Password" option
- Reset Password → admin enters new password → RPC call updates hash

### `set_staff_password` Supabase function

```sql
set_staff_password(p_staff_id UUID, p_plain_password TEXT) RETURNS VOID
```

- Updates `password_hash = crypt(p_plain_password, gen_salt('bf'))` for given staff_id
- SECURITY DEFINER

---

## lib/db/staff.ts Changes

- `createStaff()` — after insert, call `set_staff_password` RPC
- `updateStaffPassword(staffId, newPassword)` — calls `set_staff_password` RPC
- `getStaff()` — select excludes `password_hash` column

---

## File Changes Summary

| File | Change |
|---|---|
| Supabase migration | Add username/password_hash columns, roles, pgcrypto functions |
| `src/types/database.ts` | Add new roles, username field to Staff type |
| `src/lib/db/staff.ts` | Update createStaff, add updateStaffPassword |
| `src/components/pages/StaffPage.tsx` | Update form, cards, credentials modal |

---

## Flutter App (Future)

The Flutter app will call `verify_staff_login(username, password)` via Supabase RPC using the anon key. On success it receives the staff object with role — Flutter then routes to the role-specific screen.

No changes to this spec are needed when building the Flutter app.
