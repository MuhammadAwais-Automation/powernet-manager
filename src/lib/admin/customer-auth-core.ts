export const CUSTOMER_AUTH_DOMAIN = '@powernet.local'

export type CustomerLoginSource = {
  house_id?: string | null
  username?: string | null
  address_value?: string | null
  customer_code?: string | null
  phone?: string | null
}

export function normalizeCustomerAuthIdentifier(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function makeCustomerAuthEmail(identifier: string): string {
  const normalized = normalizeCustomerAuthIdentifier(identifier)
  if (!normalized) throw new Error('Invalid customer login ID')
  return `customer_${normalized}${CUSTOMER_AUTH_DOMAIN}`
}

export function pickCustomerLoginIdentifier(customer: CustomerLoginSource): string | null {
  if (customer.phone && customer.phone.trim().length > 0) {
    const phoneDigits = customer.phone.replace(/[^0-9]/g, '').trim()
    if (phoneDigits.length > 0) {
      return phoneDigits
    }
  }

  const candidates = [
    customer.house_id,
    customer.username,
    customer.address_value,
    customer.customer_code,
  ]
  const found = candidates.find(value => typeof value === 'string' && value.trim().length > 0)
  return found?.trim() ?? null
}

export function validateCustomerTemporaryPassword(password: unknown): string | null {
  if (typeof password !== 'string' || password.length < 8) return 'Temporary password must be at least 8 characters'
  if (password.length > 72) return 'Temporary password is too long'
  return null
}
