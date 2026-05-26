import { supabase } from '@/lib/supabase'
import type { CustomerSignupRequestWithRelations, CustomerSignupStatus } from '@/types/database'

const CUSTOMER_REQUEST_SELECT = `
  *,
  area:areas(id, name, code),
  package:packages(id, name, default_price),
  approved_customer:customers(id, customer_code, full_name)
`

export async function getCustomerSignupRequests(status?: CustomerSignupStatus): Promise<CustomerSignupRequestWithRelations[]> {
  let query = supabase
    .from('customer_signup_requests')
    .select(CUSTOMER_REQUEST_SELECT)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as unknown as CustomerSignupRequestWithRelations[]
}

export async function getCustomerSignupRequestById(id: string): Promise<CustomerSignupRequestWithRelations | null> {
  const { data, error } = await supabase
    .from('customer_signup_requests')
    .select(CUSTOMER_REQUEST_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as unknown as CustomerSignupRequestWithRelations | null
}

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new Error('Session expired. Please login again.')
  return token
}

export async function approveCustomerSignupRequest(input: {
  requestId: string
  temporaryPassword: string
  reviewNote?: string
}): Promise<{ request: CustomerSignupRequestWithRelations; temporaryPassword: string }> {
  const token = await getAccessToken()
  const res = await fetch('/api/admin/customer-requests/approve', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      request_id: input.requestId,
      temporary_password: input.temporaryPassword,
      review_note: input.reviewNote ?? null,
    }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? 'Could not approve request')
  return body as { request: CustomerSignupRequestWithRelations; temporaryPassword: string }
}

export async function rejectCustomerSignupRequest(input: {
  requestId: string
  reviewNote: string
}): Promise<{ request: CustomerSignupRequestWithRelations }> {
  const token = await getAccessToken()
  const res = await fetch('/api/admin/customer-requests/reject', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      request_id: input.requestId,
      review_note: input.reviewNote,
    }),
  })
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new Error(body?.error ?? 'Could not reject request')
  return body as { request: CustomerSignupRequestWithRelations }
}
