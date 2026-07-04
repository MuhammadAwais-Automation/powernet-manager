import { supabase } from '@/lib/supabase'
import type { CableListRow, CableType } from '@/types/database'

export type CableListParams = {
  page: number
  pageSize: number
  search?: string
  areaId?: string
  cableType?: CableType
  hasInternet?: boolean
  connectedBefore?: string
}

const CABLE_LIST_SELECT = `
  id,
  customer_code,
  username,
  full_name,
  cnic,
  phone,
  status,
  is_tdc,
  connection_date,
  has_internet,
  has_cable,
  iptv,
  cable_type,
  address_type,
  address_value,
  area:areas(id, name)
`

export async function getCableSubscriberList(params: CableListParams): Promise<{
  rows: CableListRow[]
  total: number
}> {
  const from = params.page * params.pageSize
  const to = from + params.pageSize - 1

  let query = supabase
    .from('customers')
    .select(CABLE_LIST_SELECT, { count: 'exact' })
    .eq('has_cable', true)
    .order('customer_code')
    .range(from, to)

  const search = params.search?.trim()
  if (search) {
    const safeSearch = search.replaceAll(',', ' ')
    query = query.or(
      `full_name.ilike.%${safeSearch}%,customer_code.ilike.%${safeSearch}%,username.ilike.%${safeSearch}%,phone.ilike.%${safeSearch}%,house_id.ilike.%${safeSearch}%`,
    )
  }

  if (params.areaId) query = query.eq('area_id', params.areaId)
  if (params.cableType) query = query.eq('cable_type', params.cableType)
  if (params.hasInternet === true) query = query.eq('has_internet', true)
  if (params.hasInternet === false) query = query.eq('has_internet', false)
  if (params.connectedBefore) query = query.lte('connection_date', params.connectedBefore)

  const { data, error, count } = await query
  if (error) throw error

  return {
    rows: (data ?? []) as unknown as CableListRow[],
    total: count ?? 0,
  }
}