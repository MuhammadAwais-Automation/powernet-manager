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
  icon: 'dollar' | 'alertTri' | 'user'
  color: string
  lead: string
  amt: string
  when: string
}

type RecentBillRow = { amount: number | null; paid_at: string | null; customer: { full_name: string | null } | null }
type RecentComplaintRow = {
  complaint_code: string
  issue: string
  priority: 'low' | 'medium' | 'high'
  opened_at: string | null
  customer: { full_name: string | null } | null
}
type RecentCustomerRow = {
  full_name: string
  created_at: string | null
  area: { name: string | null } | null
  package: { name: string | null } | null
}

let dashboardCache: { value: DashboardStats; expiresAt: number } | null = null
let activityCache: { value: ActivityItem[]; expiresAt: number } | null = null
const DASHBOARD_CACHE_MS = 60_000
const ACTIVITY_CACHE_MS = 30_000

function formatRelative(ts: string | null): string {
  if (!ts) return '-'
  const diff = Date.now() - new Date(ts).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export async function getDashboardStats(): Promise<DashboardStats> {
  if (dashboardCache && dashboardCache.expiresAt > Date.now()) return dashboardCache.value

  const summaryRes = await supabase.rpc('get_dashboard_summary')
  if (summaryRes.error) throw summaryRes.error

  const summary = summaryRes.data as DashboardStats
  const value: DashboardStats = { ...summary, revenueByMonth: summary.revenueByMonth ?? [] }

  dashboardCache = { value, expiresAt: Date.now() + DASHBOARD_CACHE_MS }
  return value
}

export async function getRecentActivity(): Promise<ActivityItem[]> {
  if (activityCache && activityCache.expiresAt > Date.now()) return activityCache.value

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

  if (billsRes.error) throw billsRes.error
  if (complaintsRes.error) throw complaintsRes.error
  if (customersRes.error) throw customersRes.error

  type TimedItem = ActivityItem & { ts: string }
  const items: TimedItem[] = []

  ;((billsRes.data ?? []) as unknown as RecentBillRow[]).forEach(b => {
    items.push({
      icon: 'dollar',
      color: 'green',
      lead: `Payment received from ${b.customer?.full_name ?? '-'}`,
      amt:  `Rs. ${(b.amount ?? 0).toLocaleString()}`,
      when: formatRelative(b.paid_at),
      ts:   b.paid_at ?? '',
    })
  })

  ;((complaintsRes.data ?? []) as unknown as RecentComplaintRow[]).forEach(c => {
    items.push({
      icon: 'alertTri',
      color: c.priority === 'high' ? 'red' : 'amber',
      lead: `Complaint ${c.complaint_code} - ${c.issue}`,
      amt:  c.priority === 'high' ? 'High' : c.priority === 'medium' ? 'Medium' : 'Low',
      when: formatRelative(c.opened_at),
      ts:   c.opened_at ?? '',
    })
  })

  ;((customersRes.data ?? []) as unknown as RecentCustomerRow[]).forEach(c => {
    items.push({
      icon: 'user',
      color: 'blue',
      lead: `New customer ${c.full_name} - ${c.area?.name ?? '-'}`,
      amt:  c.package?.name ?? '-',
      when: formatRelative(c.created_at),
      ts:   c.created_at ?? '',
    })
  })

  const value = items
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 5)

  activityCache = { value, expiresAt: Date.now() + ACTIVITY_CACHE_MS }
  return value
}
