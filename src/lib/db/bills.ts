import { supabase } from '@/lib/supabase'
import { getBillRange, type BillStatusFilter } from '@/lib/billing/query'
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
  unpaidBills: number
  overdueBills: number
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
}

export type BillsPageResult = {
  rows: BillWithRelations[]
  total: number
}

let billsCache: Record<string, { data: BillWithRelations[]; expiresAt: number }> = {}
let billsPageCache: Record<string, { data: BillsPageResult; expiresAt: number }> = {}
let billingSummaryCache: Record<string, { data: BillingSummary; expiresAt: number }> = {}
const CACHE_MS = 60_000

function clearBillsCache() {
  billsCache = {}
  billsPageCache = {}
  billingSummaryCache = {}
}

function cacheKey(month?: string) {
  return month ?? 'all'
}

export async function getBills(month?: string): Promise<BillWithRelations[]> {
  const key = cacheKey(month)
  if (billsCache[key] && billsCache[key].expiresAt > Date.now()) return billsCache[key].data

  let query = supabase
    .from('bills')
    .select(`
      *,
      customer:customers(id, customer_code, full_name, package_id),
      collector:staff(id, full_name)
    `)
    .order('created_at', { ascending: false })

  if (month) query = query.eq('month', month)

  const { data, error } = await query
  if (error) throw error
  const bills = data as BillWithRelations[]
  billsCache[key] = { data: bills, expiresAt: Date.now() + CACHE_MS }
  return bills
}

export async function getBillsPage(params: BillsPageParams): Promise<BillsPageResult> {
  const { from, to } = getBillRange(params.page, params.pageSize)
  const key = JSON.stringify({ ...params, from, to })
  if (billsPageCache[key] && billsPageCache[key].expiresAt > Date.now()) return billsPageCache[key].data

  let query = supabase
    .from('bills')
    .select(`
      *,
      customer:customers(id, customer_code, full_name, package_id),
      collector:staff(id, full_name)
    `, { count: 'exact' })
    .eq('month', params.month)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.status === 'unpaid') query = query.neq('status', 'paid')
  else if (params.status) query = query.eq('status', params.status)

  const { data, error, count } = await query
  if (error) throw error

  const result = {
    rows: (data ?? []) as BillWithRelations[],
    total: count ?? 0,
  }
  billsPageCache[key] = { data: result, expiresAt: Date.now() + CACHE_MS }
  return result
}

export async function getBillingSummary(month: string): Promise<BillingSummary> {
  const cached = billingSummaryCache[month]
  if (cached && cached.expiresAt > Date.now()) return cached.data

  const [reportsRes, totalRes, paidRes, unpaidRes, overdueRes, overdueRowsRes] = await Promise.all([
    supabase.rpc('get_reports_summary', { p_month: month }),
    supabase.from('bills').select('id', { count: 'exact', head: true }).eq('month', month),
    supabase.from('bills').select('id', { count: 'exact', head: true }).eq('month', month).eq('status', 'paid'),
    supabase.from('bills').select('id', { count: 'exact', head: true }).eq('month', month).neq('status', 'paid'),
    supabase.from('bills').select('id', { count: 'exact', head: true }).eq('month', month).eq('status', 'overdue'),
    supabase.from('bills').select('amount, paid_amount').eq('month', month).eq('status', 'overdue'),
  ])

  if (reportsRes.error) throw reportsRes.error
  if (totalRes.error) throw totalRes.error
  if (paidRes.error) throw paidRes.error
  if (unpaidRes.error) throw unpaidRes.error
  if (overdueRes.error) throw overdueRes.error
  if (overdueRowsRes.error) throw overdueRowsRes.error

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
    unpaidBills: unpaidRes.count ?? 0,
    overdueBills: overdueRes.count ?? 0,
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
  return data as GenerateBillsResult
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
  return data as RecordPaymentResult
}

export async function markBillPaid(
  bill: Pick<Bill, 'id' | 'amount' | 'paid_amount'>,
  collectedBy?: string | null
): Promise<RecordPaymentResult> {
  const remaining = Math.max(bill.amount - (bill.paid_amount ?? 0), 0)
  if (remaining <= 0) throw new Error('Bill is already fully paid')
  return recordBillPayment({
    billId: bill.id,
    amount: remaining,
    collectedBy,
    method: 'cash',
    note: 'Marked paid from billing page',
  })
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
