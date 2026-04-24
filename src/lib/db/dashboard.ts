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

  const monthlyRevenue = (paidThisMonthRes.data ?? []).reduce((s: number, b: any) => s + (b.amount ?? 0), 0)

  const monthMap: Record<string, number> = {}
  ;(allPaidBillsRes.data ?? []).forEach((b: any) => {
    const key = (b.month as string)?.slice(0, 7)
    if (key) monthMap[key] = (monthMap[key] ?? 0) + (b.amount ?? 0)
  })
  const revenueByMonth = getLast6Months().map(({ key, label }) => ({
    m: label,
    v: Math.round((monthMap[key] ?? 0) / 1000),
  }))

  const allComplaints = allComplaintsRes.data ?? []
  const complaintsByStatus = {
    open:        allComplaints.filter((c: any) => c.status === 'open').length,
    in_progress: allComplaints.filter((c: any) => c.status === 'in_progress').length,
    resolved:    allComplaints.filter((c: any) => c.status === 'resolved').length,
  }

  return {
    totalCustomers:  totalRes.count ?? 0,
    activeCustomers: activeRes.count ?? 0,
    unpaidBills:     unpaidRes.count ?? 0,
    openComplaints:  openComplaintsRes.count ?? 0,
    monthlyRevenue,
    activeStaff:     activeStaffRes.count ?? 0,
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
      amt:  `Rs. ${(b.amount ?? 0).toLocaleString()}`,
      when: formatRelative(b.paid_at),
      ts:   b.paid_at ?? '',
    })
  })

  ;(complaintsRes.data ?? []).forEach((c: any) => {
    items.push({
      icon: 'alertTri',
      color: c.priority === 'high' ? 'red' : 'amber',
      lead: `Complaint ${c.complaint_code} · ${c.issue}`,
      amt:  c.priority === 'high' ? 'High' : c.priority === 'medium' ? 'Medium' : 'Low',
      when: formatRelative(c.opened_at),
      ts:   c.opened_at ?? '',
    })
  })

  ;(customersRes.data ?? []).forEach((c: any) => {
    items.push({
      icon: 'user', color: 'blue',
      lead: `New customer ${c.full_name} · ${c.area?.name ?? '—'}`,
      amt:  c.package?.name ?? '—',
      when: formatRelative(c.created_at),
      ts:   c.created_at ?? '',
    })
  })

  return items
    .sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
    .slice(0, 5)
}
