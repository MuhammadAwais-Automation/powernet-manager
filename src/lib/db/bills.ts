import { supabase } from '@/lib/supabase'
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

let billsCache: Record<string, { data: BillWithRelations[]; expiresAt: number }> = {}
const CACHE_MS = 60_000

function clearBillsCache() {
  billsCache = {}
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
