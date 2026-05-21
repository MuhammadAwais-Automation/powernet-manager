export type BillingNotificationType = 'payment_full' | 'payment_partial'

export type BillingRealtimeBillRow = {
  id?: string | null
  customer_id?: string | null
  amount?: number | null
  paid_amount?: number | null
  status?: string | null
  paid_at?: string | null
  receipt_no?: string | null
  payment_method?: string | null
  collected_by?: string | null
}

export type BillingNotification = {
  id: string
  dedupeKey: string
  type: BillingNotificationType
  billId: string
  customerName: string
  customerCode?: string | null
  collectorName?: string | null
  amountPaid: number
  paidAmount: number
  remainingAmount: number
  status: string
  receiptNo?: string | null
  createdAt: string
  read: boolean
  title: string
  message: string
}

export type BillingNotificationSource = {
  billId: string
  customerName: string
  customerCode?: string | null
  collectorName?: string | null
  amount: number
  paidAmount: number
  remainingAmount: number
  status: string
  receiptNo?: string | null
  paidAt?: string | null
}

export function didPaymentChange(
  oldRow?: BillingRealtimeBillRow | null,
  newRow?: BillingRealtimeBillRow | null
): boolean {
  if (!newRow?.id) return false
  const oldPaid = toNumber(oldRow?.paid_amount)
  const newPaid = toNumber(newRow.paid_amount)
  if (newPaid > oldPaid) return true
  if (oldRow?.status !== newRow.status && newRow.status === 'paid') return true
  if (!oldRow?.receipt_no && Boolean(newRow.receipt_no)) return true
  if (oldRow?.paid_at !== newRow.paid_at && Boolean(newRow.paid_at)) return true
  return false
}

export function buildBillingNotificationDedupeKey(input: {
  billId: string
  paidAmount: number
  status: string
  receiptNo?: string | null
}): string {
  return [
    input.billId,
    input.status,
    input.paidAmount.toFixed(0),
    input.receiptNo ?? 'no-receipt',
  ].join(':')
}

export function buildBillingNotification(source: BillingNotificationSource): BillingNotification {
  const isFull = source.remainingAmount <= 0 || source.status === 'paid'
  const amountText = formatRs(source.amount)
  const collector = source.collectorName ? ` via ${source.collectorName}` : ''
  const title = isFull ? 'Full payment received' : 'Partial payment received'
  const message = `${source.customerName} paid ${amountText}${collector}`
  const dedupeKey = buildBillingNotificationDedupeKey({
    billId: source.billId,
    paidAmount: source.paidAmount,
    status: source.status,
    receiptNo: source.receiptNo,
  })

  return {
    id: `${dedupeKey}:${source.paidAt ?? Date.now()}`,
    dedupeKey,
    type: isFull ? 'payment_full' : 'payment_partial',
    billId: source.billId,
    customerName: source.customerName,
    customerCode: source.customerCode,
    collectorName: source.collectorName,
    amountPaid: source.amount,
    paidAmount: source.paidAmount,
    remainingAmount: Math.max(source.remainingAmount, 0),
    status: source.status,
    receiptNo: source.receiptNo,
    createdAt: source.paidAt ?? new Date().toISOString(),
    read: false,
    title,
    message,
  }
}

export function formatRs(value: number): string {
  return `Rs. ${Math.max(value, 0).toLocaleString()}`
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
