import { supabase } from '@/lib/supabase'
import {
  buildBillsPageCacheKey,
  getBillRange,
  normalizeBillingSearch,
  type BillStatusFilter,
} from '@/lib/billing/query'
import type { Bill, BillWithRelations, PaymentMethod } from '@/types/database'

export type GenerateBillsResult = {
  month: string
  eligible: number
  created: number
  existing: number
  zeroAmount: number
}

export type RecordPaymentInput = {
  billId: string
  amount: number
  collectedBy?: string | null
  method?: PaymentMethod
  note?: string | null
}

export type RecordPaymentResult = {
  billId: string
  customerId: string
  amountPaid: number
  paidAmount: number
  remainingAmount: number
  status: 'pending' | 'paid' | 'overdue'
  receiptNo: string
}

export type BillingSummary = {
  month: string
  totalBills: number
  paidBills: number
  pendingBills: number
  partialBills: number
  unpaidBills: number
  overdueBills: number
  visitedBills: number
  totalBilled: number
  totalPaid: number
  totalRemaining: number
  overdueTotal: number
  dailyCollections: { d: string; v: number }[]
}

export type BillsPageParams = {
  month: string
  page: number
  pageSize: number
  status?: BillStatusFilter
  search?: string
  areaId?: string
}

export type BillsPageResult = {
  rows: BillWithRelations[]
  total: number
}

let billsPageCache: Record<string, { data: BillsPageResult; expiresAt: number }> = {}
let billingSummaryCache: Record<string, { data: BillingSummary; expiresAt: number }> = {}
const CACHE_MS = 60_000
const CUSTOMER_SEARCH_LIMIT = 250
export const BILL_PAGE_SELECT = `
  id,
  customer_id,
  amount,
  paid_amount,
  month,
  status,
  collected_by,
  paid_at,
  receipt_no,
  payment_method,
  payment_note,
  created_at,
  customer:customers(id, customer_code, full_name, package_id, area_id, address_type, address_value),
  collector:staff(id, full_name)
`

export function clearBillsCache() {
  billsPageCache = {}
  billingSummaryCache = {}
}

export async function getBillByIdWithRelations(id: string): Promise<BillWithRelations | null> {
  const { data, error } = await supabase
    .from('bills')
    .select(BILL_PAGE_SELECT)
    .eq('id', id)
    .maybeSingle()

  if (error) throw error
  return (data ?? null) as unknown as BillWithRelations | null
}

export async function getBillsPage(params: BillsPageParams): Promise<BillsPageResult> {
  const { from, to } = getBillRange(params.page, params.pageSize)
  const key = buildBillsPageCacheKey(params)
  if (billsPageCache[key] && billsPageCache[key].expiresAt > Date.now()) return billsPageCache[key].data

  const search = normalizeBillingSearch(params.search)
  const [searchIds, areaIds] = await Promise.all([
    search ? findBillingCustomerIds(search, CUSTOMER_SEARCH_LIMIT) : undefined,
    params.areaId ? findAreaCustomerIds(params.areaId, 5000) : undefined,
  ])

  const customerIds = mergeCustomerIdFilters(searchIds, areaIds)
  if (customerIds?.length === 0) {
    const emptyResult = { rows: [], total: 0 }
    billsPageCache[key] = { data: emptyResult, expiresAt: Date.now() + CACHE_MS }
    return emptyResult
  }

  let query = supabase
    .from('bills')
    .select(BILL_PAGE_SELECT, { count: 'exact' })
    .eq('month', params.month)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.status === 'unpaid') query = query.neq('status', 'paid')
  else if (params.status === 'partial') query = query.neq('status', 'paid').gt('paid_amount', 0)
  else if (params.status === 'visited') query = query.eq('payment_method', 'visit')
  else if (params.status) query = query.eq('status', params.status)
  if (customerIds) query = query.in('customer_id', customerIds)

  const { data, error, count } = await query
  if (error) throw error

  const result = {
    rows: (data ?? []) as unknown as BillWithRelations[],
    total: count ?? 0,
  }
  billsPageCache[key] = { data: result, expiresAt: Date.now() + CACHE_MS }
  return result
}

export async function searchUnpaidBills(month: string, search?: string, limit = 12): Promise<BillWithRelations[]> {
  const normalized = normalizeBillingSearch(search)
  if (!normalized) return []

  const customerIds = await findBillingCustomerIds(normalized, Math.max(limit * 4, 24))
  if (customerIds.length === 0) return []

  const { data, error } = await supabase
    .from('bills')
    .select(BILL_PAGE_SELECT)
    .eq('month', month)
    .neq('status', 'paid')
    .in('customer_id', customerIds)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as unknown as BillWithRelations[]
}

export async function getBillingSummary(month: string): Promise<BillingSummary> {
  const cached = billingSummaryCache[month]
  if (cached && cached.expiresAt > Date.now()) return cached.data

  const [reportsRes, totalRes, paidRes, unpaidRes, pendingRes, overdueRes, overdueRowsRes, partialRes, visitedRes] = await Promise.all([
    supabase.rpc('get_reports_summary', { p_month: month }),
    supabase.from('bills').select('id', { count: 'exact', head: true }).eq('month', month),
    supabase.from('bills').select('id', { count: 'exact', head: true }).eq('month', month).eq('status', 'paid'),
    supabase.from('bills').select('id', { count: 'exact', head: true }).eq('month', month).neq('status', 'paid'),
    supabase.from('bills').select('id', { count: 'exact', head: true }).eq('month', month).eq('status', 'pending'),
    supabase.from('bills').select('id', { count: 'exact', head: true }).eq('month', month).eq('status', 'overdue'),
    supabase.from('bills').select('amount, paid_amount').eq('month', month).eq('status', 'overdue'),
    supabase.from('bills').select('id', { count: 'exact', head: true }).eq('month', month).neq('status', 'paid').gt('paid_amount', 0),
    supabase.from('bills').select('id', { count: 'exact', head: true }).eq('month', month).eq('payment_method', 'visit'),
  ])

  if (reportsRes.error) throw reportsRes.error
  if (totalRes.error) throw totalRes.error
  if (paidRes.error) throw paidRes.error
  if (unpaidRes.error) throw unpaidRes.error
  if (pendingRes.error) throw pendingRes.error
  if (overdueRes.error) throw overdueRes.error
  if (overdueRowsRes.error) throw overdueRowsRes.error
  if (partialRes.error) throw partialRes.error
  if (visitedRes.error) throw visitedRes.error

  const raw = (reportsRes.data ?? {}) as {
    month?: unknown
    cards?: {
      revenue?: unknown
      collections?: unknown
      pending?: unknown
    }
    dailyCollections?: unknown
  }
  const summary: BillingSummary = {
    month: typeof raw.month === 'string' ? raw.month : month,
    totalBills: totalRes.count ?? 0,
    paidBills: paidRes.count ?? 0,
    pendingBills: pendingRes.count ?? 0,
    partialBills: partialRes.count ?? 0,
    unpaidBills: unpaidRes.count ?? 0,
    overdueBills: overdueRes.count ?? 0,
    visitedBills: visitedRes.count ?? 0,
    totalBilled: toNumber(raw.cards?.revenue),
    totalPaid: toNumber(raw.cards?.collections),
    totalRemaining: toNumber(raw.cards?.pending),
    overdueTotal: (overdueRowsRes.data ?? []).reduce((sum, bill) => (
      sum + Math.max(toNumber(bill.amount) - toNumber(bill.paid_amount), 0)
    ), 0),
    dailyCollections: Array.isArray(raw.dailyCollections)
      ? raw.dailyCollections.map(row => {
          const point = row as { d?: unknown; v?: unknown }
          return { d: typeof point.d === 'string' ? point.d : '', v: toNumber(point.v) }
        })
      : [],
  }
  billingSummaryCache[month] = { data: summary, expiresAt: Date.now() + CACHE_MS }
  return summary
}

export async function getBillsByCustomer(customerId: string): Promise<Bill[]> {
  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Bill[]
}

export async function generateMonthlyBills(month: string): Promise<GenerateBillsResult> {
  const { data, error } = await supabase.rpc('generate_monthly_bills', { p_month: month })
  if (error) throw error
  clearBillsCache()
  const d = data as Record<string, unknown> | null
  if (!d || typeof d.created !== 'number') throw new Error('generate_monthly_bills returned unexpected data')
  return {
    month: typeof d.month === 'string' ? d.month : month,
    eligible: typeof d.eligible === 'number' ? d.eligible : 0,
    created: d.created,
    existing: typeof d.existing === 'number' ? d.existing : 0,
    zeroAmount: typeof d.zeroAmount === 'number' ? d.zeroAmount : 0,
  }
}

export async function recordBillPayment(input: RecordPaymentInput): Promise<RecordPaymentResult> {
  const { data, error } = await supabase.rpc('record_bill_payment', {
    p_bill_id: input.billId,
    p_amount: input.amount,
    p_collected_by: input.collectedBy ?? null,
    p_method: input.method ?? 'cash',
    p_note: input.note ?? null,
  })
  if (error) throw error
  clearBillsCache()
  const d = data as Record<string, unknown> | null
  if (!d || typeof d.receiptNo !== 'string') throw new Error('record_bill_payment returned unexpected data')
  return {
    billId: typeof d.billId === 'string' ? d.billId : input.billId,
    customerId: typeof d.customerId === 'string' ? d.customerId : '',
    amountPaid: toNumber(d.amountPaid),
    paidAmount: toNumber(d.paidAmount),
    remainingAmount: toNumber(d.remainingAmount),
    status: (d.status === 'paid' || d.status === 'overdue') ? d.status : 'pending',
    receiptNo: d.receiptNo,
  }
}

export async function markBillPaid(
  bill: Pick<Bill, 'id' | 'amount' | 'paid_amount'>,
  collectedBy?: string | null,
  method: PaymentMethod = 'cash'
): Promise<RecordPaymentResult> {
  const remaining = Math.max(bill.amount - (bill.paid_amount ?? 0), 0)
  if (remaining <= 0) throw new Error('Bill is already fully paid')
  return recordBillPayment({
    billId: bill.id,
    amount: remaining,
    collectedBy,
    method,
    note: null,
  })
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

async function findAreaCustomerIds(areaId: string, limit: number): Promise<string[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('area_id', areaId)
    .limit(limit)
  if (error) throw error
  return (data ?? []).map(row => row.id).filter(Boolean)
}

function mergeCustomerIdFilters(a: string[] | undefined, b: string[] | undefined): string[] | undefined {
  if (a === undefined && b === undefined) return undefined
  if (a === undefined) return b
  if (b === undefined) return a
  const setB = new Set(b)
  return a.filter(id => setB.has(id))
}

async function findBillingCustomerIds(search: string, limit: number): Promise<string[]> {
  const safeSearch = search.replaceAll(',', ' ')
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .or(`full_name.ilike.%${safeSearch}%,customer_code.ilike.%${safeSearch}%,username.ilike.%${safeSearch}%`)
    .order('customer_code')
    .limit(limit)

  if (error) throw error
  return Array.from(new Set((data ?? []).map(row => row.id).filter(Boolean)))
}
