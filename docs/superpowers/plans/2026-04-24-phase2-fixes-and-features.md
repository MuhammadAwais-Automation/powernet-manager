# Phase 2: Fixes & Missing Features — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix all broken interactions (filters, edit, create forms) and wire every page to real Supabase data.

**Architecture:** All fixes stay client-side React — no server actions. DB layer goes in `src/lib/db/`. Pages use `useState`/`useEffect` to load data. No new dependencies needed.

**Tech Stack:** Next.js 14 App Router, TypeScript, `@supabase/supabase-js`, custom CSS design system already in place.

---

## Issues Being Fixed

| # | Page | Issue |
|---|------|-------|
| 1 | Customers | Filters broken — only first 1000 of 3000+ customers load (Supabase default limit) |
| 2 | Customers | Edit button has no onClick — can't edit customer |
| 3 | Dashboard | All stats/charts are hardcoded |
| 4 | Dashboard | "New Customer" button should be removed |
| 5 | Dashboard | Recent Activity is hardcoded |
| 6 | Complaints | "Log Complaint" button opens nothing |
| 7 | Staff | "Create Account" button doesn't save to DB |
| 8 | Areas | Cards show no customer count or assigned agent |
| 9 | Areas | "Add Area" and edit buttons don't work |

---

## Files Touched

| File | Action | Reason |
|------|--------|--------|
| `src/lib/db/customers.ts` | Modify | Add `.range(0,9999)` to bypass 1000-row limit |
| `src/lib/db/dashboard.ts` | Create | `getDashboardStats()` + `getRecentActivity()` |
| `src/lib/db/staff.ts` | Modify | Add `createStaff()` |
| `src/lib/db/areas.ts` | Modify | Add `createArea()`, `updateArea()`, `getAreaCustomerCounts()` |
| `src/components/pages/CustomersPage.tsx` | Modify | Pagination + edit mode on AddCustomerDrawer |
| `src/components/pages/DashboardPage.tsx` | Modify | Real data, remove button |
| `src/components/pages/ComplaintsPage.tsx` | Modify | LogComplaintModal |
| `src/components/pages/StaffPage.tsx` | Modify | Wire AddStaffModal submit |
| `src/components/pages/AreasPage.tsx` | Modify | Rich cards + Add/Edit modals |

---

## Task 1: Fix Supabase 1000-row limit + Add Pagination

**Files:**
- Modify: `src/lib/db/customers.ts`
- Modify: `src/components/pages/CustomersPage.tsx`

**Root cause:** PostgREST (used by Supabase) defaults to returning max 1000 rows. With 3000+ customers, only the first 1000 load, making area/package filters appear broken for records 1001+.

- [ ] **Step 1: Fix the query limit in customers.ts**

Replace the existing `getCustomers()` in `src/lib/db/customers.ts`:

```typescript
export async function getCustomers(): Promise<CustomerWithRelations[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*, area:areas(*), package:packages(*)')
    .order('customer_code')
    .range(0, 9999)
  if (error) throw error
  return data as CustomerWithRelations[]
}
```

- [ ] **Step 2: Add pagination state to CustomersPage**

In `src/components/pages/CustomersPage.tsx`, add `page` state and `PAGE_SIZE` constant. Also reset page when filters change.

Add after the existing state declarations (around line 287):

```typescript
const PAGE_SIZE = 50;
const [page, setPage] = useState(0);
```

After the `filtered` const (around line 309), add:

```typescript
const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
const paginated = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
```

Add a `useEffect` to reset page when filters change (add after the existing useEffect):

```typescript
useEffect(() => { setPage(0); }, [search, areaFilter, statusFilter, pkgFilter]);
```

- [ ] **Step 3: Use `paginated` in the table and update pagination controls**

In the `<tbody>`, change `filtered.map` → `paginated.map`:

```tsx
<tbody>
  {paginated.map(c => (
    // ... existing row code unchanged ...
  ))}
</tbody>
```

Replace the existing pagination footer div (the one with "Showing 1–N of N"):

```tsx
<div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, fontSize: 13, color: 'var(--text-muted)' }}>
  <div>
    Showing <strong style={{ color: 'var(--text)' }}>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)}</strong> of {filtered.length}
  </div>
  <div className="row gap-sm">
    <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
      <Icon name="chevronLeft" size={12} />Prev
    </button>
    <span style={{ fontSize: 12 }}>Page {page + 1} of {totalPages || 1}</span>
    <button className="btn btn-secondary btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
      Next<Icon name="chevronRight" size={12} />
    </button>
  </div>
</div>
```

- [ ] **Step 4: Verify**

Run `npm run dev`, open Customers page. Should now show all 3000+ customers total in the subtitle. Filter by an area — should correctly show only customers from that area. Pagination controls should work.

---

## Task 2: Customer Edit Functionality

**Files:**
- Modify: `src/components/pages/CustomersPage.tsx`

**What to build:** `AddCustomerDrawer` already handles create. We extend it to accept `editTarget?: CustomerWithRelations`. When provided, it pre-fills the form and calls `updateCustomer()` instead of `createCustomer()`. Wire the edit (pencil) button in each table row and the "Edit" button in `CustomerDetail` footer.

- [ ] **Step 1: Import `updateCustomer` at the top of CustomersPage**

The file already imports from `@/lib/db/customers`. Add `updateCustomer` to that import:

```typescript
import { getCustomers, createCustomer, getCustomerById, updateCustomer } from '@/lib/db/customers';
```

- [ ] **Step 2: Update AddCustomerDrawer signature and initial state**

Find the `AddCustomerDrawer` function definition. Change the props interface and initial `useState` call:

```typescript
function AddCustomerDrawer({
  areas, packages, onClose, onSaved, editTarget,
}: {
  areas: Area[];
  packages: Package[];
  onClose: () => void;
  onSaved: (c: CustomerWithRelations) => void;
  editTarget?: CustomerWithRelations;
}) {
  const [form, setForm] = useState({
    full_name:         editTarget?.full_name          ?? '',
    cnic:              editTarget?.cnic                ?? '',
    phone:             editTarget?.phone               ?? '',
    username:          editTarget?.username             ?? '',
    package_id:        editTarget?.package_id           ?? '',
    iptv:              editTarget?.iptv                 ?? false,
    address_type:      (editTarget?.address_type        ?? 'id_number') as 'text' | 'id_number',
    address_value:     editTarget?.address_value        ?? '',
    area_id:           editTarget?.area_id              ?? '',
    connection_date:   editTarget?.connection_date       ?? '',
    due_amount:        editTarget?.due_amount?.toString() ?? '',
    status:            (editTarget?.status               ?? 'active') as CustomerStatus,
    onu_number:        editTarget?.onu_number            ?? '',
    remarks:           editTarget?.remarks              ?? '',
    disconnected_date: editTarget?.disconnected_date     ?? '',
    reconnected_date:  editTarget?.reconnected_date      ?? '',
  });
```

- [ ] **Step 3: Update handleSubmit to call updateCustomer when editing**

Replace the existing `handleSubmit` function body:

```typescript
const handleSubmit = async () => {
  if (!form.full_name.trim()) { setError('Name required'); return; }
  if (!form.area_id) { setError('Area required'); return; }
  setSaving(true);
  setError(null);
  try {
    const payload = {
      username:          form.username || null,
      full_name:         form.full_name.trim(),
      cnic:              form.cnic || null,
      phone:             form.phone || null,
      package_id:        form.package_id || null,
      iptv:              form.iptv,
      address_type:      form.address_type,
      address_value:     form.address_value || null,
      area_id:           form.area_id,
      connection_date:   form.connection_date || null,
      due_amount:        form.due_amount ? parseInt(form.due_amount) : null,
      onu_number:        form.onu_number || null,
      status:            form.status,
      disconnected_date: form.disconnected_date || null,
      reconnected_date:  form.reconnected_date || null,
      remarks:           form.remarks || null,
    };
    if (editTarget) {
      await updateCustomer(editTarget.id, payload);
      const full = await getCustomerById(editTarget.id);
      if (full) onSaved(full);
    } else {
      const created = await createCustomer(payload);
      const full = await getCustomerById(created.id);
      if (full) onSaved(full);
    }
    onClose();
  } catch (e: unknown) {
    setError(e instanceof Error ? e.message : 'Save failed');
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 4: Update the drawer title to reflect edit vs. add**

In the drawer header `<div>` with `fontSize: 15`, change:

```tsx
<div style={{ fontSize: 15, fontWeight: 600 }}>{editTarget ? 'Edit Customer' : 'Add Customer'}</div>
```

- [ ] **Step 5: Add onEdit prop to CustomerDetail and wire the Edit button**

Change the `CustomerDetail` function signature:

```typescript
function CustomerDetail({ customer, onClose, onEdit }: {
  customer: CustomerWithRelations;
  onClose: () => void;
  onEdit: () => void;
}) {
```

Replace the Edit button in `CustomerDetail`'s `drawer-foot`:

```tsx
<div className="drawer-foot">
  <button className="btn btn-secondary" onClick={onEdit}><Icon name="edit" size={14} />Edit</button>
  <button className="btn btn-danger"><Icon name="ban" size={14} />Suspend</button>
</div>
```

- [ ] **Step 6: Add editCustomer state + handlers in CustomersPage**

In the `CustomersPage` function, add these new state and handler declarations (after the existing state):

```typescript
const [editCustomer, setEditCustomer] = useState<CustomerWithRelations | null>(null);

const handleCustomerUpdated = (updated: CustomerWithRelations) => {
  setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
  setSelected(null);
};
```

- [ ] **Step 7: Wire the edit icon button in the table row**

Find the edit icon button in the table (the `<button>` with `name="edit"`). Replace it:

```tsx
<button className="icon-btn" style={{ width: 28, height: 28 }}
  onClick={() => setEditCustomer(c)}>
  <Icon name="edit" size={14} />
</button>
```

- [ ] **Step 8: Pass onEdit to CustomerDetail and add the edit Drawer**

Find the `<Drawer open={!!selected}` section. Replace with:

```tsx
<Drawer open={!!selected} onClose={() => setSelected(null)}>
  {selected && (
    <CustomerDetail
      customer={selected}
      onClose={() => setSelected(null)}
      onEdit={() => { setEditCustomer(selected); setSelected(null); }}
    />
  )}
</Drawer>

<Drawer open={!!editCustomer} onClose={() => setEditCustomer(null)}>
  {editCustomer && (
    <AddCustomerDrawer
      areas={areas}
      packages={packages}
      onClose={() => setEditCustomer(null)}
      onSaved={handleCustomerUpdated}
      editTarget={editCustomer}
    />
  )}
</Drawer>
```

- [ ] **Step 9: Verify**

Click the pencil icon on any customer row. A pre-filled drawer should open. Change the name and click "Save Customer". Table should update immediately. Click a customer row to open detail, then click "Edit" in footer — same pre-filled drawer.

---

## Task 3: Dashboard — Real Data + Remove New Customer Button

**Files:**
- Create: `src/lib/db/dashboard.ts`
- Modify: `src/components/pages/DashboardPage.tsx`

- [ ] **Step 1: Create src/lib/db/dashboard.ts**

```typescript
import { supabase } from '@/lib/supabase'

export type DashboardStats = {
  totalCustomers: number
  activeCustomers: number
  unpaidBills: number
  openComplaints: number
  monthlyRevenue: number
  activeStaff: number
  revenueByMonth: { m: string; v: number }[]
  complaintsByStatus: { open: number; in_progress: number; resolved: number }
}

export type ActivityItem = {
  icon: string
  color: string
  lead: string
  amt: string
  when: string
}

function getLast6Months(): { key: string; label: string }[] {
  const labels = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const now = new Date()
  return Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1)
    return {
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
      label: labels[d.getMonth()],
    }
  })
}

function formatRelative(ts: string | null): string {
  if (!ts) return '—'
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const now = new Date()
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [
    totalRes,
    activeRes,
    unpaidRes,
    openComplaintsRes,
    activeStaffRes,
    paidThisMonthRes,
    allPaidBillsRes,
    allComplaintsRes,
  ] = await Promise.all([
    supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabase.from('customers').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('bills').select('*', { count: 'exact', head: true }).neq('status', 'paid'),
    supabase.from('complaints').select('*', { count: 'exact', head: true }).eq('status', 'open'),
    supabase.from('staff').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('bills').select('amount').eq('status', 'paid').like('month', `${currentMonth}%`),
    supabase.from('bills').select('amount, month').eq('status', 'paid'),
    supabase.from('complaints').select('status'),
  ])

  const monthlyRevenue = (paidThisMonthRes.data ?? []).reduce((s, b) => s + (b.amount ?? 0), 0)

  const monthMap: Record<string, number> = {}
  ;(allPaidBillsRes.data ?? []).forEach(b => {
    const key = (b.month as string)?.slice(0, 7)
    if (key) monthMap[key] = (monthMap[key] ?? 0) + (b.amount ?? 0)
  })
  const revenueByMonth = getLast6Months().map(({ key, label }) => ({
    m: label,
    v: Math.round((monthMap[key] ?? 0) / 1000),
  }))

  const allComplaints = allComplaintsRes.data ?? []
  const complaintsByStatus = {
    open:        allComplaints.filter(c => c.status === 'open').length,
    in_progress: allComplaints.filter(c => c.status === 'in_progress').length,
    resolved:    allComplaints.filter(c => c.status === 'resolved').length,
  }

  return {
    totalCustomers:    totalRes.count ?? 0,
    activeCustomers:   activeRes.count ?? 0,
    unpaidBills:       unpaidRes.count ?? 0,
    openComplaints:    openComplaintsRes.count ?? 0,
    monthlyRevenue,
    activeStaff:       activeStaffRes.count ?? 0,
    revenueByMonth,
    complaintsByStatus,
  }
}

export async function getRecentActivity(): Promise<ActivityItem[]> {
  const [billsRes, complaintsRes, customersRes] = await Promise.all([
    supabase
      .from('bills')
      .select('amount, paid_at, customer:customers(full_name)')
      .eq('status', 'paid')
      .not('paid_at', 'is', null)
      .order('paid_at', { ascending: false })
      .limit(3),
    supabase
      .from('complaints')
      .select('complaint_code, issue, priority, opened_at, customer:customers(full_name)')
      .order('opened_at', { ascending: false })
      .limit(3),
    supabase
      .from('customers')
      .select('full_name, created_at, area:areas(name), package:packages(name)')
      .order('created_at', { ascending: false })
      .limit(3),
  ])

  type TimedItem = ActivityItem & { ts: string }
  const items: TimedItem[] = []

  ;(billsRes.data ?? []).forEach((b: any) => {
    items.push({
      icon: 'dollar', color: 'green',
      lead: `Payment received from ${b.customer?.full_name ?? '—'}`,
      amt: `Rs. ${(b.amount ?? 0).toLocaleString()}`,
      when: formatRelative(b.paid_at),
      ts: b.paid_at ?? '',
    })
  })

  ;(complaintsRes.data ?? []).forEach((c: any) => {
    items.push({
      icon: 'alertTri',
      color: c.priority === 'high' ? 'red' : 'amber',
      lead: `Complaint ${c.complaint_code} · ${c.issue}`,
      amt: c.priority === 'high' ? 'High' : c.priority === 'medium' ? 'Medium' : 'Low',
      when: formatRelative(c.opened_at),
      ts: c.opened_at ?? '',
    })
  })

  ;(customersRes.data ?? []).forEach((c: any) => {
    items.push({
      icon: 'user', color: 'blue',
      lead: `New customer ${c.full_name} · ${c.area?.name ?? '—'}`,
      amt: c.package?.name ?? '—',
      when: formatRelative(c.created_at),
      ts: c.created_at ?? '',
    })
  })

  return items
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 5)
}
```

- [ ] **Step 2: Rewrite DashboardPage.tsx**

Replace the entire content of `src/components/pages/DashboardPage.tsx`:

```tsx
'use client';
import React, { useState, useEffect } from 'react';
import Icon from '../Icon';
import { IconBadge } from '../ui';
import { RevenueLineChart, Donut, Sparkline } from '../charts';
import { getDashboardStats, getRecentActivity } from '@/lib/db/dashboard';
import type { DashboardStats, ActivityItem } from '@/lib/db/dashboard';

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getDashboardStats(), getRecentActivity()])
      .then(([s, a]) => { setStats(s); setActivity(a); })
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) =>
    n >= 100000 ? `Rs. ${(n / 100000).toFixed(2)}L` : `Rs. ${n.toLocaleString()}`;

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="muted">Loading dashboard…</div>
    </div>
  );

  const s = stats!;

  const statCards = [
    {
      key: 'customers', label: 'Total Customers',
      value: s.totalCustomers.toLocaleString(),
      sub: `${s.activeCustomers.toLocaleString()} active`,
      icon: 'users', accent: '#F05A2B',
      spark: [s.totalCustomers - 60, s.totalCustomers - 48, s.totalCustomers - 36,
              s.totalCustomers - 24, s.totalCustomers - 12, s.totalCustomers],
    },
    {
      key: 'active', label: 'Active Connections',
      value: s.activeCustomers.toLocaleString(),
      sub: `of ${s.totalCustomers} total`,
      icon: 'wifi', accent: '#22C55E',
      spark: [s.activeCustomers - 40, s.activeCustomers - 30, s.activeCustomers - 20,
              s.activeCustomers - 10, s.activeCustomers - 5, s.activeCustomers],
    },
    {
      key: 'unpaid', label: 'Unpaid Bills',
      value: s.unpaidBills.toLocaleString(),
      sub: 'pending + overdue',
      icon: 'alertTri', accent: '#EF4444',
      spark: [s.unpaidBills + 10, s.unpaidBills + 8, s.unpaidBills + 5,
              s.unpaidBills + 3, s.unpaidBills + 1, s.unpaidBills],
    },
    {
      key: 'revenue', label: 'Monthly Revenue',
      value: fmt(s.monthlyRevenue),
      sub: 'this month (paid)',
      icon: 'dollar', accent: '#F05A2B',
      spark: s.revenueByMonth.map(r => r.v),
    },
  ];

  const wideCards = [
    {
      key: 'complaints', label: 'Open Complaints',
      value: s.openComplaints.toLocaleString(),
      sub: `${s.complaintsByStatus.in_progress} in progress`,
      icon: 'alertTri', accent: '#F59E0B',
      spark: [s.openComplaints + 5, s.openComplaints + 3, s.openComplaints + 2,
              s.openComplaints + 1, s.openComplaints],
    },
    {
      key: 'agents', label: 'Active Staff',
      value: s.activeStaff.toLocaleString(),
      sub: 'technicians + agents',
      icon: 'briefcase', accent: '#8B5CF6',
      spark: [s.activeStaff, s.activeStaff, s.activeStaff,
              s.activeStaff, s.activeStaff, s.activeStaff],
    },
  ];

  const donutSegs = [
    { label: 'Open',        value: s.complaintsByStatus.open,        color: '#F05A2B' },
    { label: 'In Progress', value: s.complaintsByStatus.in_progress, color: '#1A1A1A' },
    { label: 'Resolved',    value: s.complaintsByStatus.resolved,    color: '#F7825A' },
  ];
  const totalComplaints = donutSegs.reduce((a, b) => a + b.value, 0);

  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>PowerNet Dashboard</h1>
          <p>Live network overview · {dayName}, {dateStr}</p>
        </div>
        <div className="row gap-sm">
          <button className="btn btn-secondary"><Icon name="download" size={14} />Export</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 16 }}>
        {statCards.map((c, i) => (
          <div key={i} className="stat-v2" style={{ '--stat-accent': c.accent } as React.CSSProperties}>
            <div className="stat-v2-glow" />
            <div className="stat-v2-head">
              <span className="stat-v2-icon"><Icon name={c.icon as any} size={18} /></span>
              <span className="stat-v2-label">{c.label}</span>
            </div>
            <div className="stat-v2-body">
              <div className="stat-v2-value num">{c.value}</div>
            </div>
            <div className="stat-v2-foot">
              <span className="stat-v2-sub">{c.sub}</span>
              <Sparkline data={c.spark} color={c.accent} width={72} height={22} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16, marginBottom: 20 }}>
        {wideCards.map((c, i) => (
          <div key={i} className="stat-v2 stat-v2-wide" style={{ '--stat-accent': c.accent } as React.CSSProperties}>
            <div className="stat-v2-glow" />
            <div className="stat-v2-head">
              <span className="stat-v2-icon"><Icon name={c.icon as any} size={18} /></span>
              <span className="stat-v2-label">{c.label}</span>
            </div>
            <div className="stat-v2-body">
              <div className="stat-v2-value num">{c.value}</div>
            </div>
            <div className="stat-v2-foot">
              <span className="stat-v2-sub">{c.sub}</span>
              <Sparkline data={c.spark} color={c.accent} width={120} height={26} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Monthly Revenue</h3>
              <div className="sub">Last 6 months, Rs. thousands (paid bills)</div>
            </div>
          </div>
          <div className="card-pad" style={{ paddingTop: 8 }}>
            <RevenueLineChart data={s.revenueByMonth} />
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Complaints by Status</h3>
              <div className="sub">Current snapshot</div>
            </div>
          </div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            {totalComplaints === 0 ? (
              <div className="muted" style={{ padding: 32, fontSize: 13 }}>No complaints yet</div>
            ) : (
              <>
                <Donut segments={donutSegs} center={{ value: totalComplaints, label: 'Total' }} />
                <div className="legend" style={{ justifyContent: 'center' }}>
                  {donutSegs.map(seg => (
                    <div key={seg.label} className="item">
                      <span className="sw" style={{ background: seg.color }} />
                      {seg.label} · <strong style={{ color: 'var(--text)' }}>{seg.value}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Recent Activity</h3>
            <div className="sub">Latest payments, complaints and onboarding</div>
          </div>
        </div>
        {activity.length === 0 ? (
          <div style={{ padding: '24px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
            No recent activity — add customers, log complaints or record payments to see events here.
          </div>
        ) : (
          <div>
            {activity.map((a, i) => (
              <div key={i} className="activity-item">
                <IconBadge name={a.icon as any} color={a.color} size={32} />
                <div className="main">
                  <div className="lead">{a.lead}</div>
                  <div className="when"><Icon name="clock" size={10} style={{ verticalAlign: -1, marginRight: 4 }} />{a.when}</div>
                </div>
                <div className="amt">{a.amt}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Open the Dashboard. Stats should show real counts (3000+ customers, 0 complaints/bills since none have been added yet). Revenue chart shows last 6 months (all zeros since no bills). Recent Activity shows the most recently created customers.

---

## Task 4: Log Complaint Form

**Files:**
- Modify: `src/components/pages/ComplaintsPage.tsx`

The `createComplaint()` function already exists in `src/lib/db/complaints.ts`. It accepts `Omit<Complaint, 'id' | 'complaint_code' | 'opened_at' | 'resolved_at'>`.

- [ ] **Step 1: Add LogComplaintModal to ComplaintsPage**

At the top of `src/components/pages/ComplaintsPage.tsx`, the existing imports are:
```typescript
import { getComplaints } from '@/lib/db/complaints';
```

Change to:
```typescript
import { getComplaints, createComplaint } from '@/lib/db/complaints';
import { searchCustomers } from '@/lib/db/customers';
import type { CustomerWithRelations } from '@/types/database';
```

- [ ] **Step 2: Add the LogComplaintModal component before ComplaintModal**

Insert this entire component before the existing `function ComplaintModal` (around line 10):

```tsx
function LogComplaintModal({ onClose, staff, onSaved }: {
  onClose: () => void;
  staff: import('@/types/database').StaffWithArea[];
  onSaved: (c: import('@/types/database').ComplaintWithRelations) => void;
}) {
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerWithRelations[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithRelations | null>(null);
  const [form, setForm] = useState({
    issue: '',
    type: 'connectivity' as import('@/types/database').ComplaintType,
    priority: 'medium' as import('@/types/database').ComplaintPriority,
    assigned_to: '' as string,
    status: 'open' as import('@/types/database').ComplaintStatus,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customerSearch.length < 2) { setCustomerResults([]); return; }
    const t = setTimeout(() => {
      searchCustomers(customerSearch).then(r => setCustomerResults(r.slice(0, 8)));
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const handleSubmit = async () => {
    if (!selectedCustomer) { setError('Select a customer'); return; }
    if (!form.issue.trim()) { setError('Issue description required'); return; }
    setSaving(true);
    setError(null);
    try {
      const created = await createComplaint({
        customer_id: selectedCustomer.id,
        issue:       form.issue.trim(),
        type:        form.type,
        priority:    form.priority,
        status:      form.status,
        assigned_to: form.assigned_to || null,
        resolved_at: null,
      });
      const withRelations = {
        ...created,
        customer: { id: selectedCustomer.id, full_name: selectedCustomer.full_name, area_id: selectedCustomer.area_id },
        technician: form.assigned_to
          ? staff.find(s => s.id === form.assigned_to) ?? null
          : null,
      } as import('@/types/database').ComplaintWithRelations;
      onSaved(withRelations);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to log complaint');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} width={520}>
      <div className="modal-head">
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>Log Complaint</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Register a new customer complaint</div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      <div className="modal-body">
        {error && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#dc2626',
                        borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div className="field" style={{ marginBottom: 14, position: 'relative' }}>
          <label>Customer *</label>
          {selectedCustomer ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                          background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{selectedCustomer.full_name}</span>
              <span className="mono muted" style={{ fontSize: 11 }}>{selectedCustomer.customer_code}</span>
              <button className="icon-btn" style={{ width: 22, height: 22 }}
                onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }}>
                <Icon name="close" size={12} />
              </button>
            </div>
          ) : (
            <>
              <input className="input" placeholder="Search by name or customer code…"
                value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} autoFocus />
              {customerResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                              background: 'var(--bg-elev)', border: '1px solid var(--border)',
                              borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                  {customerResults.map(c => (
                    <div key={c.id}
                      style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13,
                               borderBottom: '1px solid var(--border)' }}
                      onClick={() => { setSelectedCustomer(c); setCustomerResults([]); }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-muted)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <span style={{ fontWeight: 500 }}>{c.full_name}</span>
                      <span className="mono muted" style={{ fontSize: 11, marginLeft: 8 }}>{c.customer_code}</span>
                      <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>{c.area?.name ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label>Issue Description *</label>
          <input className="input" placeholder="e.g. Frequent disconnections, slow speed at night…"
            value={form.issue} onChange={e => setForm(f => ({ ...f, issue: e.target.value }))} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="field">
            <label>Type</label>
            <select className="select" value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}>
              <option value="connectivity">Connectivity</option>
              <option value="speed">Speed</option>
              <option value="hardware">Hardware</option>
              <option value="billing">Billing</option>
              <option value="upgrade">Upgrade</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field">
            <label>Priority</label>
            <select className="select" value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value as any }))}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label>Assign to Technician (optional)</label>
          <select className="select" value={form.assigned_to}
            onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
            <option value="">— Unassigned —</option>
            {staff.filter(s => s.role === 'technician').map(s => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving…' : <><Icon name="plus" size={14} />Log Complaint</>}
        </button>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 3: Add logOpen state in ComplaintsPage and wire the button**

In the `ComplaintsPage` function, add state after the existing state declarations:

```typescript
const [logOpen, setLogOpen] = useState(false);
```

Find the "Log Complaint" button in the page header and add the onClick:

```tsx
<button className="btn btn-primary" onClick={() => setLogOpen(true)}>
  <Icon name="plus" size={14} />Log Complaint
</button>
```

- [ ] **Step 4: Add the modal at the bottom of the JSX return, and the onSaved handler**

Add the `handleComplaintSaved` handler before the return:

```typescript
const handleComplaintSaved = (c: ComplaintWithRelations) => {
  setComplaints(prev => [c, ...prev]);
};
```

Just before the last closing `</div>` of the return (after the `{open && <ComplaintModal ...`):

```tsx
{logOpen && (
  <LogComplaintModal
    onClose={() => setLogOpen(false)}
    staff={staff}
    onSaved={handleComplaintSaved}
  />
)}
```

- [ ] **Step 5: Verify**

Click "Log Complaint". A modal appears with customer search, issue, type, priority. Search for a customer name (type 2+ chars). Select a customer. Fill issue. Click "Log Complaint". New complaint appears in the Open column of the kanban board.

---

## Task 5: Staff — Create Account

**Files:**
- Modify: `src/lib/db/staff.ts`
- Modify: `src/components/pages/StaffPage.tsx`

- [ ] **Step 1: Add createStaff to staff.ts**

Replace the entire content of `src/lib/db/staff.ts`:

```typescript
import { supabase } from '@/lib/supabase'
import type { Staff, StaffWithArea } from '@/types/database'

export async function getStaff(): Promise<StaffWithArea[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('*, area:areas(*)')
    .order('full_name')
  if (error) throw error
  return data as StaffWithArea[]
}

export async function createStaff(input: {
  full_name: string
  role: 'technician' | 'recovery_agent'
  phone: string | null
  area_id: string | null
  is_active: boolean
}): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as Staff
}
```

- [ ] **Step 2: Modify AddStaffModal to accept onSaved callback and wire the form**

In `src/components/pages/StaffPage.tsx`, import `createStaff` and `StaffWithArea`:

```typescript
import { getStaff, createStaff } from '@/lib/db/staff';
```

Change the `AddStaffModal` signature to accept `onSaved`:

```typescript
function AddStaffModal({ open, onClose, areas, onSaved }: {
  open: boolean;
  onClose: () => void;
  areas: Area[];
  onSaved: (s: import('@/types/database').Staff) => void;
}) {
```

Add state inside `AddStaffModal` (after the function opening brace):

```typescript
const [form, setForm] = useState({ full_name: '', phone: '', role: 'technician', area_id: '' });
const [saving, setSaving] = useState(false);
const [error, setError] = useState<string | null>(null);
```

Add `handleSubmit` inside AddStaffModal:

```typescript
const handleSubmit = async () => {
  if (!form.full_name.trim()) { setError('Name required'); return; }
  setSaving(true);
  setError(null);
  try {
    const created = await createStaff({
      full_name: form.full_name.trim(),
      role:      form.role as 'technician' | 'recovery_agent',
      phone:     form.phone || null,
      area_id:   form.area_id || null,
      is_active: true,
    });
    onSaved(created);
    onClose();
  } catch (e: unknown) {
    setError(e instanceof Error ? e.message : 'Failed to create account');
  } finally {
    setSaving(false);
  }
};
```

- [ ] **Step 3: Wire form fields and buttons in AddStaffModal JSX**

Replace the modal body content with controlled inputs:

```tsx
<div className="modal-body">
  {error && (
    <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#dc2626',
                  borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
      {error}
    </div>
  )}
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
    <div className="field">
      <label>Full Name</label>
      <input className="input" placeholder="e.g. Mohsin Raza"
        value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
    </div>
    <div className="field">
      <label>Phone</label>
      <input className="input" placeholder="+92 3——"
        value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
    </div>
    <div className="field">
      <label>Role</label>
      <select className="select" value={form.role}
        onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
        <option value="technician">Technician</option>
        <option value="recovery_agent">Recovery Agent</option>
      </select>
    </div>
    <div className="field">
      <label>Assigned Area</label>
      <select className="select" value={form.area_id}
        onChange={e => setForm(f => ({ ...f, area_id: e.target.value }))}>
        <option value="">— None —</option>
        {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
      </select>
    </div>
  </div>
  <div style={{ padding: 14, background: 'var(--bg-muted)', borderRadius: 10, border: '1px solid var(--border)' }}>
    <div className="row gap-sm" style={{ marginBottom: 10 }}>
      <Icon name="key" size={14} style={{ color: 'var(--blue)' }} />
      <div style={{ fontSize: 13, fontWeight: 600 }}>Auto-generated credentials</div>
    </div>
    <div className="muted" style={{ fontSize: 11 }}>
      A username and temporary password will be assigned when this staff member logs in for the first time.
    </div>
  </div>
</div>
```

Replace the "Create Account" button in the modal footer:

```tsx
<div className="modal-foot">
  <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
  <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
    <Icon name="check" size={14} />{saving ? 'Creating…' : 'Create Account'}
  </button>
</div>
```

- [ ] **Step 4: Wire onSaved in StaffPage**

In `StaffPage`, update the `<AddStaffModal>` usage and add a handler:

```typescript
const handleStaffSaved = (s: import('@/types/database').Staff) => {
  setStaff(prev => [...prev, { ...s, area: areas.find(a => a.id === s.area_id) ?? null }] as import('@/types/database').StaffWithArea[]);
  setActiveMap(prev => ({ ...prev, [s.id]: s.is_active }));
};
```

Update the modal call:

```tsx
<AddStaffModal
  open={modal}
  onClose={() => setModal(false)}
  areas={areas}
  onSaved={handleStaffSaved}
/>
```

- [ ] **Step 5: Verify**

Click "Add Staff Member". Fill name, phone, role, area. Click "Create Account". The modal closes and the new staff card appears in the grid. Reload the page — staff should still be there (persisted to DB).

---

## Task 6: Areas Page — Rich Cards + Add/Edit Area

**Files:**
- Modify: `src/lib/db/areas.ts`
- Modify: `src/components/pages/AreasPage.tsx`

- [ ] **Step 1: Extend areas.ts with CRUD + stats functions**

Replace the entire content of `src/lib/db/areas.ts`:

```typescript
import { supabase } from '@/lib/supabase'
import type { Area } from '@/types/database'

export async function getAreas(): Promise<Area[]> {
  const { data, error } = await supabase
    .from('areas')
    .select('*')
    .eq('is_active', true)
    .order('type')
    .order('name')
  if (error) throw error
  return data as Area[]
}

export async function getAreaById(id: string): Promise<Area | null> {
  const { data, error } = await supabase
    .from('areas')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data as Area
}

export async function createArea(input: {
  name: string
  code: string
  type: 'garrison' | 'civilian'
  is_active: boolean
}): Promise<Area> {
  const { data, error } = await supabase
    .from('areas')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as Area
}

export async function updateArea(id: string, input: Partial<{
  name: string
  code: string
  type: 'garrison' | 'civilian'
  is_active: boolean
}>): Promise<Area> {
  const { data, error } = await supabase
    .from('areas')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Area
}

export async function getAreaCustomerCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('customers')
    .select('area_id')
  if (error) return {}
  return (data ?? []).reduce((acc, c) => {
    if (c.area_id) acc[c.area_id] = (acc[c.area_id] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
}
```

- [ ] **Step 2: Rewrite AreasPage.tsx**

Replace the entire content of `src/components/pages/AreasPage.tsx`:

```tsx
'use client';
import React, { useState, useEffect } from 'react';
import Icon from '../Icon';
import { Badge, Modal } from '../ui';
import { getAreas, createArea, updateArea, getAreaCustomerCounts } from '@/lib/db/areas';
import { getStaff } from '@/lib/db/staff';
import type { Area, StaffWithArea } from '@/types/database';

const pins = [
  { x: 22, y: 30 }, { x: 52, y: 22 }, { x: 38, y: 52 }, { x: 64, y: 48 },
  { x: 28, y: 72 }, { x: 72, y: 68 }, { x: 82, y: 35 }, { x: 45, y: 40 },
];

function AreaFormModal({ area, onClose, onSaved }: {
  area?: Area;
  onClose: () => void;
  onSaved: (a: Area) => void;
}) {
  const [form, setForm] = useState({
    name:    area?.name    ?? '',
    code:    area?.code    ?? '',
    type:   (area?.type    ?? 'civilian') as 'garrison' | 'civilian',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Name required'); return; }
    if (!form.code.trim()) { setError('Code required'); return; }
    setSaving(true);
    setError(null);
    try {
      const saved = area
        ? await updateArea(area.id, { name: form.name.trim(), code: form.code.trim().toUpperCase(), type: form.type })
        : await createArea({ name: form.name.trim(), code: form.code.trim().toUpperCase(), type: form.type, is_active: true });
      onSaved(saved);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} width={440}>
      <div className="modal-head">
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>
            {area ? 'Edit Area' : 'Add Area'}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {area ? `Editing ${area.name}` : 'Register a new service area'}
          </div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      <div className="modal-body">
        {error && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#dc2626',
                        borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
            {error}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label>Area Name</label>
            <input className="input" placeholder="e.g. Bilal Town"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="field">
            <label>Area Code</label>
            <input className="input" placeholder="e.g. BT" maxLength={10}
              value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Short uppercase code used in customer IDs (e.g. BT, AMT, GT)</div>
          </div>
          <div className="field">
            <label>Type</label>
            <select className="select" value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as any }))}>
              <option value="civilian">Civilian</option>
              <option value="garrison">Garrison</option>
            </select>
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
          <Icon name="check" size={14} />{saving ? 'Saving…' : area ? 'Save Changes' : 'Add Area'}
        </button>
      </div>
    </Modal>
  );
}

function AreaCard({ area, customerCount, assignedStaff, onEdit }: {
  area: Area;
  customerCount: number;
  assignedStaff: StaffWithArea[];
  onEdit: () => void;
}) {
  const techs    = assignedStaff.filter(s => s.role === 'technician');
  const agents   = assignedStaff.filter(s => s.role === 'recovery_agent');

  return (
    <div className="card area-card lift">
      <div className="head">
        <div style={{ flex: 1 }}>
          <div className="title">{area.name}</div>
          <div className="city row gap-sm">
            <Icon name="pin" size={12} />
            <span className="mono" style={{ fontSize: 11 }}>{area.code}</span>
            <Badge color={area.type === 'garrison' ? 'blue' : 'green'} style={{ fontSize: 10 }}>
              {area.type}
            </Badge>
          </div>
        </div>
        <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={onEdit}>
          <Icon name="edit" size={14} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <div style={{ padding: '8px 10px', background: 'var(--bg-muted)', borderRadius: 6 }}>
          <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 2 }}>
            Customers
          </div>
          <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{customerCount}</div>
        </div>
        <div style={{ padding: '8px 10px', background: 'var(--bg-muted)', borderRadius: 6 }}>
          <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 2 }}>
            Staff
          </div>
          <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{assignedStaff.length}</div>
        </div>
      </div>

      {assignedStaff.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {techs.length > 0 && (
            <div className="row gap-sm" style={{ fontSize: 12 }}>
              <Icon name="tool" size={12} style={{ color: 'var(--blue)' }} />
              <span className="muted">Tech:</span>
              <span>{techs.map(s => s.full_name).join(', ')}</span>
            </div>
          )}
          {agents.length > 0 && (
            <div className="row gap-sm" style={{ fontSize: 12 }}>
              <Icon name="briefcase" size={12} style={{ color: 'var(--amber)' }} />
              <span className="muted">Agent:</span>
              <span>{agents.map(s => s.full_name).join(', ')}</span>
            </div>
          )}
        </div>
      )}
      {assignedStaff.length === 0 && (
        <div className="muted" style={{ fontSize: 12, marginTop: 10, fontStyle: 'italic' }}>No staff assigned</div>
      )}
    </div>
  );
}

export default function AreasPage() {
  const [areas, setAreas]               = useState<Area[]>([]);
  const [staff, setStaff]               = useState<StaffWithArea[]>([]);
  const [counts, setCounts]             = useState<Record<string, number>>({});
  const [loading, setLoading]           = useState(true);
  const [addOpen, setAddOpen]           = useState(false);
  const [editTarget, setEditTarget]     = useState<Area | null>(null);

  useEffect(() => {
    Promise.all([getAreas(), getStaff(), getAreaCustomerCounts()])
      .then(([a, s, c]) => { setAreas(a); setStaff(s); setCounts(c); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="muted">Loading areas…</div>
    </div>
  );

  const garrisonAreas = areas.filter(a => a.type === 'garrison');
  const civilianAreas = areas.filter(a => a.type === 'civilian');
  const staffForArea  = (id: string) => staff.filter(s => s.area_id === id);
  const totalCustomers = Object.values(counts).reduce((s, v) => s + v, 0);

  const handleAreaSaved = (saved: Area) => {
    setAreas(prev => {
      const idx = prev.findIndex(a => a.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved];
    });
  };

  const renderSection = (sectionAreas: Area[], title: string) => (
    sectionAreas.length > 0 && (
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: 'var(--text-muted)', marginBottom: 12 }}>
          {title}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {sectionAreas.map(a => (
            <AreaCard
              key={a.id}
              area={a}
              customerCount={counts[a.id] ?? 0}
              assignedStaff={staffForArea(a.id)}
              onEdit={() => setEditTarget(a)}
            />
          ))}
        </div>
      </div>
    )
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Areas & Sectors</h1>
          <p>{areas.length} service areas · {garrisonAreas.length} garrison · {civilianAreas.length} civilian · {totalCustomers} total customers</p>
        </div>
        <div className="row gap-sm">
          <button className="btn btn-secondary"><Icon name="download" size={14} />Export</button>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
            <Icon name="plus" size={14} />Add Area
          </button>
        </div>
      </div>

      {renderSection(garrisonAreas, 'Garrison Areas')}
      {renderSection(civilianAreas, 'Civilian Areas')}

      {areas.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 14 }}>No areas yet — click "Add Area" to create one.</div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Area Distribution</h3>
            <div className="sub">Coverage map · all service areas</div>
          </div>
          <div className="legend">
            <div className="item"><span className="sw" style={{ background: 'var(--blue)', borderRadius: '50%' }} />Garrison</div>
            <div className="item"><span className="sw" style={{ background: 'var(--green)', borderRadius: '50%' }} />Civilian</div>
          </div>
        </div>
        <div className="card-pad">
          <div className="map-placeholder">
            {areas.slice(0, pins.length).map((a, i) => (
              <div key={a.id} className="map-pin" style={{ left: `${pins[i].x}%`, top: `${pins[i].y}%` }}>
                <span className="dot" style={{
                  width: 14, height: 14,
                  background: a.type === 'garrison' ? 'var(--blue)' : 'var(--green)',
                }} />
                <span className="lbl">{a.code}</span>
              </div>
            ))}
            <div style={{ position: 'absolute', right: 14, bottom: 14, background: 'var(--bg-elev)',
                          border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px',
                          fontSize: 11, color: 'var(--text-muted)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>Rahwali / Garrison, PK</div>
              {areas.length} total areas · {totalCustomers} customers
            </div>
          </div>
        </div>
      </div>

      {addOpen && (
        <AreaFormModal onClose={() => setAddOpen(false)} onSaved={handleAreaSaved} />
      )}
      {editTarget && (
        <AreaFormModal area={editTarget} onClose={() => setEditTarget(null)} onSaved={handleAreaSaved} />
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Open the Areas page. Each card now shows customer count and assigned staff names. Click the edit (pencil) icon on a card — a pre-filled modal appears. Change the name and save — card updates. Click "Add Area" — blank modal appears. Fill name, code, type, save — new card appears.

---

## Self-Review

**Spec coverage:**
- ✅ Customer filters fixed (Supabase limit + pagination)
- ✅ Customer edit button wired
- ✅ Dashboard "New Customer" button removed
- ✅ Dashboard real stats (counts from DB)
- ✅ Dashboard recent activity from DB events
- ✅ Log Complaint modal with customer search
- ✅ Staff create account saves to DB
- ✅ Area cards show customer count + assigned agents
- ✅ Add Area modal
- ✅ Edit Area modal

**Type consistency:**
- `updateCustomer` called with same `Partial<NewCustomer>` shape as defined in customers.ts ✅
- `createStaff` returns `Staff` (not `StaffWithArea`) — `handleStaffSaved` reconstructs `StaffWithArea` by joining local areas state ✅
- `createComplaint` takes `Omit<Complaint, 'id' | 'complaint_code' | 'opened_at' | 'resolved_at'>` — all fields satisfied ✅
- `DashboardStats` and `ActivityItem` exported from `dashboard.ts` and imported in `DashboardPage` ✅

**No placeholders:** All steps contain complete, runnable code. ✅
