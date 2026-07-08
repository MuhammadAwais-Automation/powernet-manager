import { supabase } from '@/lib/supabase'
import { formatBillCollectionStatusLabel, getBillCollectionStatus, normalizeBillingMonth } from '@/lib/billing/core'
import { getBillRange, normalizeBillingSearch, normalizeBillStatusFilter, type BillStatusFilter } from '@/lib/billing/query'
import type { CableBillWithRelations, PaymentMethod, PaymentSource } from '@/types/database'

export type GenerateCableBillsResult = {
  month: string
  eligible: number
  created: number
  existing: number
  zeroAmount: number
  price: number
}

export type RecordCablePaymentInput = {
  billId: string
  amount: number
  collectedBy?: string | null
  method?: PaymentMethod
  source?: PaymentSource
  paidAt?: string | null
  note?: string | null
}

export type RecordCablePaymentResult = {
  billId: string
  customerId: string
  amountPaid: number
  paidAmount: number
  remainingAmount: number
  status: 'pending' | 'paid' | 'overdue'
  receiptNo: string
  paidAt: string
}

export type CableBillingSummary = {
  totalBills: number
  totalBilled: number
  totalPaid: number
  totalRemaining: number
  paidBills: number
  unpaidBills: number
  overdueBills: number
  overdueTotal: number
}

export type CableBillsPageParams = {
  month: string
  page: number
  pageSize: number
  status?: BillStatusFilter
  search?: string
  areaId?: string
}

const CABLE_BILL_SELECT = `
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
  payment_source,
  payment_note,
  created_at,
  customer:customers(
    id, customer_code, full_name, phone, cnic, house_id,
    area_id, has_internet, has_cable, status, address_type, address_value,
    area:areas(id, name, code, type)
  ),
  collector:staff(id, full_name)
`

let cableBillsPageCache: Record<string, { data: { rows: CableBillWithRelations[]; total: number }; expiresAt: number }> = {}
let cableSummaryCache: Record<string, { data: CableBillingSummary; expiresAt: number }> = {}
const CACHE_MS = 60_000

export function clearCableBillsCache() {
  cableBillsPageCache = {}
  cableSummaryCache = {}
}

function buildCablePageCacheKey(params: CableBillsPageParams): string {
  return JSON.stringify({
    month: params.month,
    page: params.page,
    pageSize: params.pageSize,
    status: params.status,
    search: normalizeBillingSearch(params.search),
    areaId: params.areaId,
  })
}

async function findCableCustomerIds(search: string, limit = 250): Promise<string[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('id')
    .eq('has_cable', true)
    .or(
      `full_name.ilike.%${search}%,customer_code.ilike.%${search}%,username.ilike.%${search}%,phone.ilike.%${search}%,house_id.ilike.%${search}%`,
    )
    .limit(limit)
  if (error) throw error
  return (data ?? []).map((row) => row.id as string)
}

export async function getCableBillById(id: string): Promise<CableBillWithRelations | null> {
  const { data, error } = await supabase
    .from('cable_bills')
    .select(CABLE_BILL_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as unknown as CableBillWithRelations | null
}

export async function getCableBillsPage(params: CableBillsPageParams): Promise<{
  rows: CableBillWithRelations[]
  total: number
}> {
  try {
    await supabase.rpc('transition_pending_cable_bills_to_overdue')
  } catch (e) {
    console.error('Failed to transition pending cable bills to overdue:', e)
  }

  const key = buildCablePageCacheKey(params)
  if (cableBillsPageCache[key] && cableBillsPageCache[key].expiresAt > Date.now()) {
    return cableBillsPageCache[key].data
  }

  const { from, to } = getBillRange(params.page, params.pageSize)
  const search = normalizeBillingSearch(params.search)
  const searchIds = search ? await findCableCustomerIds(search) : undefined

  if (searchIds?.length === 0) {
    const empty = { rows: [], total: 0 }
    cableBillsPageCache[key] = { data: empty, expiresAt: Date.now() + CACHE_MS }
    return empty
  }

  let select = CABLE_BILL_SELECT
  if (params.areaId) {
    select = select.replace('customer:customers(', 'customer:customers!inner(')
  }

  let query = supabase
    .from('cable_bills')
    .select(select, { count: 'exact' })
    .eq('month', params.month)
    .order('paid_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .range(from, to)

  if (params.status === 'unpaid') query = query.neq('status', 'paid')
  else if (params.status === 'partial') query = query.neq('status', 'paid').gt('paid_amount', 0)
  else if (params.status) query = query.eq('status', params.status)

  if (params.areaId) query = query.eq('customer.area_id', params.areaId)
  if (searchIds) query = query.in('customer_id', searchIds)

  const { data, error, count } = await query
  if (error) throw error

  const result = {
    rows: (data ?? []) as unknown as CableBillWithRelations[],
    total: count ?? 0,
  }
  cableBillsPageCache[key] = { data: result, expiresAt: Date.now() + CACHE_MS }
  return result
}

export async function getCableBillingSummary(month: string, areaId?: string): Promise<CableBillingSummary> {
  const key = JSON.stringify({ month, areaId })
  const cached = cableSummaryCache[key]
  if (cached && cached.expiresAt > Date.now()) return cached.data

  const { data, error } = await supabase.rpc('get_cable_billing_summary', {
    p_month: month,
    p_area_id: areaId || null,
  })
  if (error) throw error

  const raw = (data ?? {}) as Partial<CableBillingSummary>
  const summary: CableBillingSummary = {
    totalBills: raw.totalBills ?? 0,
    totalBilled: raw.totalBilled ?? 0,
    totalPaid: raw.totalPaid ?? 0,
    totalRemaining: raw.totalRemaining ?? 0,
    paidBills: raw.paidBills ?? 0,
    unpaidBills: raw.unpaidBills ?? 0,
    overdueBills: raw.overdueBills ?? 0,
    overdueTotal: raw.overdueTotal ?? 0,
  }
  cableSummaryCache[key] = { data: summary, expiresAt: Date.now() + CACHE_MS }
  return summary
}

export async function getCableBillsByCustomer(customerId: string) {
  const { data, error } = await supabase
    .from('cable_bills')
    .select(CABLE_BILL_SELECT)
    .eq('customer_id', customerId)
    .order('month', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as CableBillWithRelations[]
}

export async function getCableBillPayments(billId: string) {
  const { data, error } = await supabase
    .from('cable_payments')
    .select(`
      id, cable_bill_id, customer_id, amount, collected_by, method, source,
      note, receipt_no, paid_at, created_at,
      collector:staff(id, full_name)
    `)
    .eq('cable_bill_id', billId)
    .order('paid_at', { ascending: false })
  if (error) throw error
  return data ?? []
}

export async function generateMonthlyCableBills(month: string): Promise<GenerateCableBillsResult> {
  const { data, error } = await supabase.rpc('generate_monthly_cable_bills', {
    p_month: month,
  })
  if (error) throw error
  clearCableBillsCache()
  const d = data as Record<string, unknown> | null
  if (!d || typeof d.created !== 'number') {
    throw new Error('generate_monthly_cable_bills returned unexpected data')
  }
  return {
    month: typeof d.month === 'string' ? d.month : month,
    eligible: typeof d.eligible === 'number' ? d.eligible : 0,
    created: d.created,
    existing: typeof d.existing === 'number' ? d.existing : 0,
    zeroAmount: typeof d.zeroAmount === 'number' ? d.zeroAmount : 0,
    price: typeof d.price === 'number' ? d.price : 0,
  }
}

export async function recordCableBillPayment(input: RecordCablePaymentInput): Promise<RecordCablePaymentResult> {
  const { data, error } = await supabase.rpc('record_cable_bill_payment', {
    p_bill_id: input.billId,
    p_amount: input.amount,
    p_collected_by: input.collectedBy ?? null,
    p_method: input.method ?? 'cash',
    p_source: input.source ?? 'office',
    p_paid_at: input.paidAt ?? null,
    p_note: input.note ?? null,
  })
  if (error) throw error
  clearCableBillsCache()
  const d = data as Record<string, unknown> | null
  if (!d || typeof d.receiptNo !== 'string') {
    throw new Error('record_cable_bill_payment returned unexpected data')
  }
  return {
    billId: typeof d.billId === 'string' ? d.billId : input.billId,
    customerId: typeof d.customerId === 'string' ? d.customerId : '',
    amountPaid: Number(d.amountPaid) || 0,
    paidAmount: Number(d.paidAmount) || 0,
    remainingAmount: Number(d.remainingAmount) || 0,
    status: d.status === 'paid' || d.status === 'overdue' ? d.status : 'pending',
    receiptNo: d.receiptNo,
    paidAt: typeof d.paidAt === 'string' ? d.paidAt : new Date().toISOString(),
  }
}

export function getCableBillStatusLabel(
  bill: Pick<CableBillWithRelations, 'amount' | 'paid_amount' | 'status'>,
): string {
  const status = getBillCollectionStatus(bill)
  return formatBillCollectionStatusLabel(status === 'partial' ? 'partial' : bill.status)
}

export { normalizeBillingMonth, normalizeBillStatusFilter }