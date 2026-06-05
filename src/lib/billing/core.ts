type BillableStatus = 'active' | 'suspended' | 'disconnected' | 'free' | 'shifted' | 'tdc'

type BillAmountSource = {
  due_amount: number | null
  package: { default_price: number | null } | null
}

export function normalizeBillingMonth(value: string): string {
  const month = value.trim().slice(0, 7)
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Billing month must be in YYYY-MM format')
  }

  const monthNumber = Number(month.slice(5, 7))
  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error('Billing month must be in YYYY-MM format')
  }

  return month
}

export function getCurrentBillingMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function isBillableCustomerStatus(status: BillableStatus): boolean {
  return status === 'active'
}

export function getCustomerBillAmount(customer: BillAmountSource): number {
  return customer.due_amount ?? customer.package?.default_price ?? 0
}
