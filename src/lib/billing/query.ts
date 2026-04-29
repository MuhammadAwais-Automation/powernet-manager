export type BillingTab = 'All' | 'Unpaid' | 'Paid' | 'Overdue'
export type BillStatus = 'pending' | 'paid' | 'overdue'
export type BillStatusFilter = BillStatus | 'unpaid' | undefined

export function getBillRange(page: number, pageSize: number): { from: number; to: number } {
  if (!Number.isInteger(page) || page < 0) throw new Error('page must be zero or greater')
  if (!Number.isInteger(pageSize) || pageSize <= 0) throw new Error('page size must be greater than zero')

  const from = page * pageSize
  return { from, to: from + pageSize - 1 }
}

export function normalizeBillStatusFilter(tab: BillingTab): BillStatusFilter {
  if (tab === 'Paid') return 'paid'
  if (tab === 'Overdue') return 'overdue'
  if (tab === 'Unpaid') return 'unpaid'
  return undefined
}
