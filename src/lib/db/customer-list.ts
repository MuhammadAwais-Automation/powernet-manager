import { supabase } from '@/lib/supabase'
import type { CustomerListRow, CustomerStatus } from '@/types/database'

export type CustomerListParams = {
  page: number
  pageSize: number
  search?: string
  areaId?: string
  packageId?: string
  status?: CustomerStatus
}

const CUSTOMER_LIST_SELECT = `
  id,
  customer_code,
  username,
  full_name,
  cnic,
  phone,
  status,
  due_amount,
  area:areas(id, name),
  package:packages(id, name)
`

export async function getCustomerList(params: CustomerListParams): Promise<{
  rows: CustomerListRow[]
  total: number
}> {
  const from = params.page * params.pageSize
  const to = from + params.pageSize - 1

  let query = supabase
    .from('customers')
    .select(CUSTOMER_LIST_SELECT, { count: 'exact' })
    .order('customer_code')
    .range(from, to)

  const search = params.search?.trim()
  if (search) {
    const safeSearch = search.replaceAll(',', ' ')
    query = query.or(
      `full_name.ilike.%${safeSearch}%,customer_code.ilike.%${safeSearch}%,username.ilike.%${safeSearch}%`
    )
  }

  if (params.areaId) query = query.eq('area_id', params.areaId)
  if (params.packageId) query = query.eq('package_id', params.packageId)
  if (params.status) query = query.eq('status', params.status)

  const { data, error, count } = await query
  if (error) throw error

  return {
    rows: (data ?? []) as unknown as CustomerListRow[],
    total: count ?? 0,
  }
}
