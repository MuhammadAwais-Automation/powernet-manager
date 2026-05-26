export type CustomerSignupNotification = {
  id: string
  dedupeKey: string
  kind: 'customer_signup'
  type: 'customer_signup_pending'
  requestId: string
  customerName: string
  houseId: string
  areaName?: string | null
  packageName?: string | null
  createdAt: string
  read: boolean
  title: string
  message: string
}

export type CustomerSignupRealtimeRow = {
  id?: string | null
  full_name?: string | null
  house_id?: string | null
  status?: string | null
  created_at?: string | null
}

export function buildCustomerSignupNotification(source: {
  requestId: string
  customerName: string
  houseId: string
  areaName?: string | null
  packageName?: string | null
  createdAt?: string | null
}): CustomerSignupNotification {
  const area = source.areaName ? ` in ${source.areaName}` : ''
  const plan = source.packageName ? ` for ${source.packageName}` : ''
  const dedupeKey = `customer-signup:${source.requestId}`

  return {
    id: `${dedupeKey}:${source.createdAt ?? Date.now()}`,
    dedupeKey,
    kind: 'customer_signup',
    type: 'customer_signup_pending',
    requestId: source.requestId,
    customerName: source.customerName,
    houseId: source.houseId,
    areaName: source.areaName,
    packageName: source.packageName,
    createdAt: source.createdAt ?? new Date().toISOString(),
    read: false,
    title: 'New customer signup',
    message: `${source.customerName} submitted house ID ${source.houseId}${area}${plan}`,
  }
}
