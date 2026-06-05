# PowerNet Performance And Stability Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PowerNet Manager pages load fast and reliably on localhost and Vercel by removing repeated heavy client-side Supabase loads, adding database indexes, caching page data, and cleaning deployment/security risks.

**Architecture:** Keep the current SPA-style `App.tsx` routing for now, but introduce a focused client data layer with pagination, cache, request cancellation, and lean Supabase selects. Move expensive dashboard aggregation into one Postgres RPC. Add Supabase indexes and RLS cleanup through SQL migrations, then verify on local and Vercel.

**Tech Stack:** Next.js 15 App Router, React 18, Supabase JS, Supabase Postgres, Vercel, GitHub.

---

## Current Evidence

- `CustomersPage` fetches all 4,487 customers with full `area` and `package` relations on every mount.
- Full customer load measured at about 22.6s and about 3.5MB JSON in local Node timing.
- Lean first-page customer query measured at about 228-263ms for 50 rows.
- Postgres SQL execution for 1,000 joined customer rows is around 5ms, so the bottleneck is payload size, repeated client fetches, and PostgREST/browser transfer rather than raw database compute.
- Page navigation in `src/components/App.tsx` unmounts inactive pages, so returning to a page re-runs `useEffect` and reloads data.
- Supabase performance advisors report missing foreign-key indexes and duplicate permissive RLS policies.
- Vercel production deployment is `READY`, but deployment metadata shows `gitDirty=1`, so deployment hygiene needs cleanup.

---

## File Map

**Create:**
- `src/lib/db/query-state.ts` - reusable loading/error/result types.
- `src/lib/db/customer-list.ts` - paginated customer list query for table view.
- `src/lib/db/customer-cache.ts` - small in-memory cache for customer pages and lookup data.
- `src/lib/db/dashboard-summary.ts` - wrapper for the new dashboard RPC.
- `scripts/perf-smoke.js` - repeatable timing script for customer/dashboard queries.
- `scripts/sql/performance_indexes.sql` - indexes and optional RPC SQL for review/apply.

**Modify:**
- `src/lib/db/customers.ts` - keep detail/create/update methods, stop using all-row list for table page.
- `src/components/pages/CustomersPage.tsx` - server-side pagination/search/filter, cached lookup data, no full-table fetch.
- `src/components/pages/DashboardPage.tsx` - use one dashboard summary call and cache result.
- `src/lib/db/dashboard.ts` - reduce or replace multi-query dashboard calls.
- `src/components/pages/AreasPage.tsx` - cache areas/staff/counts and avoid repeated fetch on revisit.
- `src/components/pages/StaffPage.tsx` - cache staff/areas on revisit.
- `src/components/pages/BillingPage.tsx` - add pagination-ready query shape.
- `src/components/pages/ComplaintsPage.tsx` - add cache/request cancellation and narrow selects.
- `src/lib/supabase.ts` - add lazy/env-safe client getter if build/runtime env needs hardening.
- `.mcp.json` - remove/rotate exposed tokens later; do not commit secrets.

**Verify:**
- `npm run build`
- `npm run lint` after planned lint cleanup or document remaining known lint debt.
- `node scripts/perf-smoke.js`
- Browser test on `http://localhost:3000`
- Vercel production/preview deployment test.

---

## Phase 1: Stabilize Customer Page First

### Task 1: Add Customer List Types And Query

**Files:**
- Create: `src/lib/db/query-state.ts`
- Create: `src/lib/db/customer-list.ts`
- Modify: `src/types/database.ts`

- [ ] **Step 1: Add query state helper types**

Create `src/lib/db/query-state.ts`:

```ts
export type QueryResult<T> = {
  data: T
  count?: number
}

export type QueryError = {
  message: string
}
```

- [ ] **Step 2: Add lean customer table row type**

Modify `src/types/database.ts` and add:

```ts
export type CustomerListRow = Pick<
  Customer,
  'id' | 'customer_code' | 'username' | 'full_name' | 'cnic' | 'phone' | 'status' | 'due_amount'
> & {
  area: Pick<Area, 'id' | 'name'> | null
  package: Pick<Package, 'id' | 'name'> | null
}
```

- [ ] **Step 3: Add paginated list query**

Create `src/lib/db/customer-list.ts`:

```ts
import { supabase } from '@/lib/supabase'
import type { CustomerListRow, CustomerStatus } from '@/types/database'

export type CustomerListParams = {
  page: number
  pageSize: number
  search?: string
  areaId?: string
  packageId?: string
  status?: CustomerStatus
}

const CUSTOMER_LIST_SELECT = `
  id,
  customer_code,
  username,
  full_name,
  cnic,
  phone,
  status,
  due_amount,
  area:areas(id, name),
  package:packages(id, name)
`

export async function getCustomerList(params: CustomerListParams): Promise<{
  rows: CustomerListRow[]
  total: number
}> {
  const from = params.page * params.pageSize
  const to = from + params.pageSize - 1

  let query = supabase
    .from('customers')
    .select(CUSTOMER_LIST_SELECT, { count: 'exact' })
    .order('customer_code')
    .range(from, to)

  const search = params.search?.trim()
  if (search) {
    const safeSearch = search.replaceAll(',', ' ')
    query = query.or(
      `full_name.ilike.%${safeSearch}%,customer_code.ilike.%${safeSearch}%,username.ilike.%${safeSearch}%`
    )
  }

  if (params.areaId) query = query.eq('area_id', params.areaId)
  if (params.packageId) query = query.eq('package_id', params.packageId)
  if (params.status) query = query.eq('status', params.status)

  const { data, error, count } = await query
  if (error) throw error

  return {
    rows: (data ?? []) as CustomerListRow[],
    total: count ?? 0,
  }
}
```

- [ ] **Step 4: Run type check**

Run:

```bash
npx tsc --noEmit
```

Expected: no new TypeScript errors from these files.

- [ ] **Step 5: Commit**

```bash
git add src/types/database.ts src/lib/db/query-state.ts src/lib/db/customer-list.ts
git commit -m "feat: add paginated customer list query"
```

### Task 2: Refactor CustomersPage To Paginated Fetch

**Files:**
- Modify: `src/components/pages/CustomersPage.tsx`
- Modify: `src/lib/db/customers.ts`

- [ ] **Step 1: Replace full customer list import**

In `CustomersPage.tsx`, replace:

```ts
import { getCustomers, createCustomer, getCustomerById, updateCustomer } from '@/lib/db/customers';
```

with:

```ts
import { createCustomer, getCustomerById, updateCustomer } from '@/lib/db/customers';
import { getCustomerList } from '@/lib/db/customer-list';
```

- [ ] **Step 2: Change state shape**

Replace full customer state:

```ts
const [customers, setCustomers] = useState<CustomerWithRelations[]>([]);
```

with:

```ts
const [customers, setCustomers] = useState<CustomerListRow[]>([]);
const [totalCustomers, setTotalCustomers] = useState(0);
```

Add `CustomerListRow` to the type import.

- [ ] **Step 3: Store filter IDs instead of display labels**

Change area/package filters to IDs:

```ts
const [areaFilter, setAreaFilter] = useState('');
const [statusFilter, setStatusFilter] = useState('');
const [pkgFilter, setPkgFilter] = useState('');
```

- [ ] **Step 4: Replace initial full-table `Promise.all`**

Replace the customer loading effect with:

```ts
useEffect(() => {
  let cancelled = false
  setLoading(true)

  Promise.all([
    getCustomerList({
      page,
      pageSize: PAGE_SIZE,
      search,
      areaId: areaFilter || undefined,
      packageId: pkgFilter || undefined,
      status: statusFilter ? (statusFilter as CustomerStatus) : undefined,
    }),
    areas.length ? Promise.resolve(areas) : getAreas(),
    packages.length ? Promise.resolve(packages) : getPackages(),
  ])
    .then(([customerResult, loadedAreas, loadedPackages]) => {
      if (cancelled) return
      setCustomers(customerResult.rows)
      setTotalCustomers(customerResult.total)
      setAreas(loadedAreas)
      setPackages(loadedPackages)
    })
    .finally(() => {
      if (!cancelled) setLoading(false)
    })

  return () => {
    cancelled = true
  }
}, [page, search, areaFilter, statusFilter, pkgFilter])
```

- [ ] **Step 5: Debounce search**

Add state:

```ts
const [rawSearch, setRawSearch] = useState('');
const [search, setSearch] = useState('');
```

Add effect:

```ts
useEffect(() => {
  const timer = window.setTimeout(() => setSearch(rawSearch), 250)
  return () => window.clearTimeout(timer)
}, [rawSearch])
```

Change the search input to use `rawSearch`.

- [ ] **Step 6: Remove client-side full-table filtering**

Delete:

```ts
const filtered = customers.filter(...)
const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
const paginated = filtered.slice(...)
```

Replace with:

```ts
const totalPages = Math.ceil(totalCustomers / PAGE_SIZE)
const paginated = customers
```

- [ ] **Step 7: Fix detail drawer type**

Because table rows are lean, clicking a row should fetch full detail:

```ts
const handleSelectCustomer = async (id: string) => {
  const full = await getCustomerById(id)
  if (full) setSelected(full)
}
```

Change row click:

```tsx
onClick={() => handleSelectCustomer(c.id)}
```

- [ ] **Step 8: Verify local customer query timing**

Run:

```bash
node scripts/perf-smoke.js
```

Expected after smoke script exists: customer first page under 500ms on a warm run.

- [ ] **Step 9: Commit**

```bash
git add src/components/pages/CustomersPage.tsx src/lib/db/customers.ts
git commit -m "fix: paginate customer table data"
```

### Task 3: Add Revisit Cache For Lookup Data

**Files:**
- Create: `src/lib/db/customer-cache.ts`
- Modify: `src/components/pages/CustomersPage.tsx`

- [ ] **Step 1: Create small module cache**

Create `src/lib/db/customer-cache.ts`:

```ts
import type { Area, Package } from '@/types/database'

let areasCache: Area[] | null = null
let packagesCache: Package[] | null = null

export function getCachedAreas() {
  return areasCache
}

export function setCachedAreas(areas: Area[]) {
  areasCache = areas
}

export function getCachedPackages() {
  return packagesCache
}

export function setCachedPackages(packages: Package[]) {
  packagesCache = packages
}
```

- [ ] **Step 2: Use cache in CustomersPage**

Initialize states lazily:

```ts
const [areas, setAreas] = useState<Area[]>(() => getCachedAreas() ?? []);
const [packages, setPackages] = useState<Package[]>(() => getCachedPackages() ?? []);
```

After loading lookups:

```ts
setCachedAreas(loadedAreas)
setCachedPackages(loadedPackages)
```

- [ ] **Step 3: Verify revisit behavior**

Run local app:

```bash
npm run dev
```

Manual check: login, open Customers, switch to Dashboard, return to Customers. Expected: no 20s full reload; table returns quickly and lookup dropdowns are immediately available.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db/customer-cache.ts src/components/pages/CustomersPage.tsx
git commit -m "fix: cache customer lookup data across page switches"
```

---

## Phase 2: Fix Dashboard And Shared Page Re-Fetching

### Task 4: Replace Dashboard Multi-Query With One RPC

**Files:**
- Create: `scripts/sql/dashboard_summary_rpc.sql`
- Modify: `src/lib/db/dashboard.ts`
- Modify: `src/components/pages/DashboardPage.tsx`

- [ ] **Step 1: Create SQL RPC file**

Create `scripts/sql/dashboard_summary_rpc.sql`:

```sql
create or replace function public.get_dashboard_summary()
returns jsonb
language sql
security definer
set search_path = public
as $$
  with stats as (
    select
      (select count(*) from public.customers) as total_customers,
      (select count(*) from public.customers where status = 'active') as active_customers,
      (select count(*) from public.bills where status <> 'paid') as unpaid_bills,
      (select count(*) from public.complaints where status = 'open') as open_complaints,
      (select count(*) from public.staff where is_active = true) as active_staff,
      coalesce((
        select sum(amount)
        from public.bills
        where status = 'paid'
          and month like to_char(now(), 'YYYY-MM') || '%'
      ), 0) as monthly_revenue
  ),
  complaint_stats as (
    select
      count(*) filter (where status = 'open') as open,
      count(*) filter (where status = 'in_progress') as in_progress,
      count(*) filter (where status = 'resolved') as resolved
    from public.complaints
  )
  select jsonb_build_object(
    'totalCustomers', stats.total_customers,
    'activeCustomers', stats.active_customers,
    'unpaidBills', stats.unpaid_bills,
    'openComplaints', stats.open_complaints,
    'monthlyRevenue', stats.monthly_revenue,
    'activeStaff', stats.active_staff,
    'complaintsByStatus', jsonb_build_object(
      'open', complaint_stats.open,
      'in_progress', complaint_stats.in_progress,
      'resolved', complaint_stats.resolved
    )
  )
  from stats, complaint_stats;
$$;

revoke execute on function public.get_dashboard_summary() from anon;
grant execute on function public.get_dashboard_summary() to authenticated;
```

- [ ] **Step 2: Apply through Supabase MCP after review**

Use Supabase MCP `execute_sql` with project `jzhxckqomhjgokkyxkmk` and the SQL above.

- [ ] **Step 3: Update dashboard DB wrapper**

In `src/lib/db/dashboard.ts`, add:

```ts
export async function getDashboardSummaryRpc(): Promise<Omit<DashboardStats, 'revenueByMonth'>> {
  const { data, error } = await supabase.rpc('get_dashboard_summary')
  if (error) throw error
  return data as Omit<DashboardStats, 'revenueByMonth'>
}
```

- [ ] **Step 4: Keep revenue chart separate but cached**

Keep last-6-month revenue as a separate query for now because bills table is empty. Add a module-level short cache:

```ts
let dashboardCache: { value: DashboardStats; expiresAt: number } | null = null
const DASHBOARD_CACHE_MS = 60_000
```

Return cache if valid before querying.

- [ ] **Step 5: Verify dashboard timing**

Run:

```bash
node scripts/perf-smoke.js
```

Expected: dashboard summary under 500ms warm.

- [ ] **Step 6: Commit**

```bash
git add scripts/sql/dashboard_summary_rpc.sql src/lib/db/dashboard.ts src/components/pages/DashboardPage.tsx
git commit -m "fix: reduce dashboard data waterfall"
```

### Task 5: Preserve Page State Or Centralize Data Cache

**Files:**
- Modify: `src/components/App.tsx`
- Modify: page components as needed.

- [ ] **Step 1: Choose low-risk approach**

Keep current `switch(active)` rendering, but avoid data loss via module-level caches in DB modules first. Do not render all pages hidden yet, because keeping all page components mounted can increase memory and background effects.

- [ ] **Step 2: Add cache to small pages**

Add short module caches in:

```text
src/lib/db/areas.ts
src/lib/db/packages.ts
src/lib/db/staff.ts
src/lib/db/bills.ts
src/lib/db/complaints.ts
```

Pattern:

```ts
let cache: { data: Area[]; expiresAt: number } | null = null
const CACHE_MS = 60_000
```

- [ ] **Step 3: Invalidate cache after writes**

After `createArea`, `updateArea`, `createComplaint`, `createStaff`, `updateStaff`, and customer create/update, clear related cache variables.

- [ ] **Step 4: Verify navigation**

Manual test: open Dashboard, Customers, Areas, Staff, Complaints, and back. Expected: previously loaded pages return without long spinner.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db src/components/pages
git commit -m "fix: cache page data across SPA navigation"
```

---

## Phase 3: Database Indexes And Query Shape

### Task 6: Add Performance Indexes

**Files:**
- Create: `scripts/sql/performance_indexes.sql`

- [ ] **Step 1: Create index SQL**

Create `scripts/sql/performance_indexes.sql`:

```sql
create index if not exists customers_area_id_idx on public.customers (area_id);
create index if not exists customers_package_id_idx on public.customers (package_id);
create index if not exists customers_status_idx on public.customers (status);
create index if not exists customers_created_at_idx on public.customers (created_at desc);
create index if not exists customers_customer_code_id_idx on public.customers (customer_code, id);

create index if not exists staff_area_id_idx on public.staff (area_id);
create index if not exists staff_role_idx on public.staff (role);
create index if not exists staff_is_active_idx on public.staff (is_active);

create index if not exists bills_customer_id_idx on public.bills (customer_id);
create index if not exists bills_collected_by_idx on public.bills (collected_by);
create index if not exists bills_status_idx on public.bills (status);
create index if not exists bills_month_idx on public.bills (month);

create index if not exists complaints_customer_id_idx on public.complaints (customer_id);
create index if not exists complaints_assigned_to_idx on public.complaints (assigned_to);
create index if not exists complaints_status_idx on public.complaints (status);
create index if not exists complaints_opened_at_idx on public.complaints (opened_at desc);
```

- [ ] **Step 2: Apply via Supabase MCP**

Use `execute_sql` on project `jzhxckqomhjgokkyxkmk`.

- [ ] **Step 3: Verify advisors**

Run Supabase MCP `get_advisors` with `type: performance`.

Expected: unindexed foreign-key warnings for these columns are gone.

- [ ] **Step 4: Commit**

```bash
git add scripts/sql/performance_indexes.sql
git commit -m "perf: add database indexes for dashboard pages"
```

### Task 7: Clean RLS Policies Safely

**Files:**
- Create: `scripts/sql/rls_cleanup.sql`

- [ ] **Step 1: Create RLS cleanup SQL for review**

Create `scripts/sql/rls_cleanup.sql`:

```sql
drop policy if exists anon_write on public.areas;
drop policy if exists anon_write on public.packages;
drop policy if exists anon_write on public.customers;
drop policy if exists anon_write on public.staff;
drop policy if exists anon_write on public.bills;
drop policy if exists anon_write on public.complaints;

drop policy if exists auth_all on public.areas;
drop policy if exists auth_all on public.packages;
drop policy if exists auth_all on public.customers;
drop policy if exists auth_all on public.staff;
drop policy if exists auth_all on public.bills;
drop policy if exists auth_all on public.complaints;

create policy authenticated_read_areas on public.areas
  for select to authenticated using (true);
create policy authenticated_read_packages on public.packages
  for select to authenticated using (true);
create policy authenticated_read_customers on public.customers
  for select to authenticated using (true);
create policy authenticated_read_staff on public.staff
  for select to authenticated using (true);
create policy authenticated_read_bills on public.bills
  for select to authenticated using (true);
create policy authenticated_read_complaints on public.complaints
  for select to authenticated using (true);

create policy authenticated_write_areas on public.areas
  for all to authenticated using (true) with check (true);
create policy authenticated_write_customers on public.customers
  for all to authenticated using (true) with check (true);
create policy authenticated_write_staff on public.staff
  for all to authenticated using (true) with check (true);
create policy authenticated_write_bills on public.bills
  for all to authenticated using (true) with check (true);
create policy authenticated_write_complaints on public.complaints
  for all to authenticated using (true) with check (true);
```

- [ ] **Step 2: Pause before applying**

Confirm whether anonymous users should have any read access. For this management app, recommended answer is no public anonymous access except login/auth endpoints.

- [ ] **Step 3: Apply after auth smoke test is ready**

Apply only after login credentials are confirmed and rollback SQL is prepared.

- [ ] **Step 4: Verify security advisors**

Run Supabase MCP `get_advisors` with `type: security`.

Expected: anon write and multiple permissive policy warnings reduced.

- [ ] **Step 5: Commit**

```bash
git add scripts/sql/rls_cleanup.sql
git commit -m "security: tighten Supabase RLS policies"
```

---

## Phase 4: Reliability And UX

### Task 8: Add Error States And Retry Buttons

**Files:**
- Modify: `src/components/pages/CustomersPage.tsx`
- Modify: `src/components/pages/DashboardPage.tsx`
- Modify: `src/components/pages/AreasPage.tsx`
- Modify: `src/components/pages/StaffPage.tsx`
- Modify: `src/components/pages/BillingPage.tsx`
- Modify: `src/components/pages/ComplaintsPage.tsx`

- [ ] **Step 1: Add `error` state to each page**

Pattern:

```ts
const [error, setError] = useState<string | null>(null)
```

- [ ] **Step 2: Catch load errors**

Pattern:

```ts
.catch((e: unknown) => {
  setError(e instanceof Error ? e.message : 'Could not load data')
})
```

- [ ] **Step 3: Render retry state**

Pattern:

```tsx
if (error) return (
  <div className="page">
    <div className="card" style={{ padding: 24 }}>
      <div style={{ fontWeight: 600, marginBottom: 6 }}>Data load failed</div>
      <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>{error}</div>
      <button className="btn btn-primary" onClick={() => window.location.reload()}>
        <Icon name="refresh" size={14} />Retry
      </button>
    </div>
  </div>
)
```

- [ ] **Step 4: Commit**

```bash
git add src/components/pages
git commit -m "fix: add page load error states"
```

### Task 9: Add Lightweight Loading Skeletons

**Files:**
- Modify: `src/components/pages/CustomersPage.tsx`
- Modify: `src/components/pages/DashboardPage.tsx`

- [ ] **Step 1: Replace full-page spinner for Customers after first load**

Use table skeleton rows while keeping header/filter visible.

- [ ] **Step 2: Replace dashboard full-page spinner**

Show stat-card skeletons and chart placeholders.

- [ ] **Step 3: Verify no layout jump**

Manual browser check desktop and mobile.

- [ ] **Step 4: Commit**

```bash
git add src/components/pages/CustomersPage.tsx src/components/pages/DashboardPage.tsx
git commit -m "ux: improve loading states for management pages"
```

---

## Phase 5: Vercel And GitHub Hygiene

### Task 10: Clean Deployment Flow

**Files:**
- Modify only if needed: `.gitignore`, README deployment notes.

- [ ] **Step 1: Ensure no secrets are committed**

Run:

```bash
git status --short
git ls-files .env.local .mcp.json
```

Expected: `.env.local` not tracked. `.mcp.json` should be reviewed because it currently contains sensitive connector tokens.

- [ ] **Step 2: Rotate exposed tokens**

Rotate Vercel and GitHub tokens found in `.mcp.json`. Keep new secrets out of Git.

- [ ] **Step 3: Deploy from clean Git state**

Run:

```bash
git status --short
npm run build
```

Expected: build passes and git status has only intentional untracked local files.

- [ ] **Step 4: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 5: Let Vercel Git integration deploy**

Avoid CLI deploy from dirty local state unless intentionally creating a preview.

- [ ] **Step 6: Verify Vercel deployment metadata**

Expected: `gitDirty` absent or false, deployment `READY`, latest commit matches GitHub.

---

## Phase 6: Performance Smoke Script

### Task 11: Add Repeatable Performance Checks

**Files:**
- Create: `scripts/perf-smoke.js`

- [ ] **Step 1: Create timing script**

Create `scripts/perf-smoke.js`:

```js
const fs = require('fs')
const { createClient } = require('@supabase/supabase-js')

for (const line of fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(Boolean)) {
  const index = line.indexOf('=')
  if (index > 0) process.env[line.slice(0, index)] = line.slice(index + 1)
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

async function timed(label, fn, budgetMs) {
  const start = performance.now()
  const result = await fn()
  const ms = Math.round(performance.now() - start)
  const rows = Array.isArray(result.data) ? result.data.length : result.count
  const bytes = result.data ? Buffer.byteLength(JSON.stringify(result.data)) : 0
  const ok = !result.error && ms <= budgetMs
  console.log(JSON.stringify({ label, ms, budgetMs, rows, bytes, ok, error: result.error?.message }))
  if (!ok) process.exitCode = 1
}

async function main() {
  await timed(
    'customers first page lean',
    () => supabase
      .from('customers')
      .select('id,customer_code,username,full_name,cnic,phone,status,due_amount,area:areas(id,name),package:packages(id,name)', { count: 'exact' })
      .order('customer_code')
      .range(0, 49),
    700
  )

  await timed(
    'dashboard customer count',
    () => supabase.from('customers').select('*', { count: 'exact', head: true }),
    700
  )

  await timed(
    'areas active',
    () => supabase.from('areas').select('id,code,name,type,is_active').eq('is_active', true).order('type').order('name'),
    700
  )
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

- [ ] **Step 2: Run smoke script**

```bash
node scripts/perf-smoke.js
```

Expected: all JSON lines have `"ok":true`.

- [ ] **Step 3: Add package script**

Modify `package.json`:

```json
"perf:smoke": "node scripts/perf-smoke.js"
```

- [ ] **Step 4: Commit**

```bash
git add scripts/perf-smoke.js package.json package-lock.json
git commit -m "test: add Supabase performance smoke checks"
```

---

## Phase 7: Final Verification

### Task 12: Full Local Verification

**Files:** None.

- [ ] **Step 1: Install dependencies if needed**

```bash
npm install
```

- [ ] **Step 2: Run TypeScript build**

```bash
npm run build
```

Expected: exit code 0.

- [ ] **Step 3: Run performance smoke**

```bash
npm run perf:smoke
```

Expected: all checks pass within budget.

- [ ] **Step 4: Run lint**

```bash
npm run lint
```

Expected: either 0 errors after lint cleanup, or known pre-existing lint issues documented before merge.

- [ ] **Step 5: Browser verification**

```bash
npm run dev
```

Open `http://localhost:3000` and verify:

- Login resolves without infinite spinner.
- Dashboard first load completes quickly.
- Customers first load renders 50 rows quickly.
- Customers search does not freeze typing.
- Switching Dashboard -> Customers -> Dashboard -> Customers does not trigger long loading.
- Areas, Staff, Billing, Complaints pages show retry UI if Supabase fails.

### Task 13: Vercel Verification

**Files:** None.

- [ ] **Step 1: Push clean branch**

```bash
git status --short
git push origin main
```

- [ ] **Step 2: Check Vercel deployment**

Use Vercel MCP:

```text
get_project powernet-manager
list_deployments powernet-manager
```

Expected: newest deployment `READY`, GitHub commit matches local HEAD, no dirty deploy metadata.

- [ ] **Step 3: Test production URL**

Open:

```text
https://powernet-manager.vercel.app
```

Verify same navigation flow as local.

---

## Success Criteria

- Customers page no longer fetches all 4,487 rows for table render.
- Customers first page request stays below 700ms warm.
- Returning to Customers does not reload 3.5MB of JSON.
- Dashboard avoids 8+ independent client requests where possible.
- FK index warnings are resolved.
- Duplicate/permissive RLS policies are reduced.
- Vercel deploy is clean and traceable to GitHub.
- App has visible error/retry states instead of endless loading.

---

## Recommended Execution Order

1. Phase 1 first, because it fixes the biggest user-facing pain.
2. Phase 6 smoke script immediately after Phase 1, so every later change has measurable proof.
3. Phase 3 indexes, because they are low-risk and help future growth.
4. Phase 2 dashboard/cache improvements.
5. Phase 4 UX reliability.
6. Phase 5 Vercel/GitHub hygiene.
7. Final verification and deploy.

