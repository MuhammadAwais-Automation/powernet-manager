import { supabase } from '@/lib/supabase'
import type { Staff, StaffWithArea, Area } from '@/types/database'

const COLS = 'id, full_name, role, phone, area_id, area_ids, username, auth_user_id, is_active, created_at'
let staffCache: { data: StaffWithArea[]; expiresAt: number } | null = null
const CACHE_MS = 60_000

function clearStaffCache() {
  staffCache = null
}

export async function getStaff(): Promise<StaffWithArea[]> {
  if (staffCache && staffCache.expiresAt > Date.now()) return staffCache.data

  const { data: staffData, error: staffError } = await supabase
    .from('staff')
    .select(`${COLS}, area:areas(*)`)
    .order('full_name')
  if (staffError) throw staffError

  const { data: areasData, error: areasError } = await supabase
    .from('areas')
    .select('*')
  if (areasError) throw areasError

  const areasList = areasData || []

  const staff = (staffData || []).map((s: unknown) => {
    const row = s as Staff & { area: Area | null }
    const sAreaIds = row.area_ids || []
    const sAreas = areasList.filter(a => sAreaIds.includes(a.id))
    return {
      ...row,
      areas: sAreas,
      area: row.area || sAreas[0] || null
    }
  }) as unknown as StaffWithArea[]

  staffCache = { data: staff, expiresAt: Date.now() + CACHE_MS }
  return staff
}

export async function createStaff(input: {
  full_name: string
  role: string
  phone: string | null
  area_id: string | null
  area_ids?: string[] | null
  is_active: boolean
  username: string | null
  password?: string
}): Promise<Staff> {
  const { password, ...rest } = input
  
  // Backward compatibility: sync area_id with first element of area_ids if provided
  if (rest.area_ids && rest.area_ids.length > 0) {
    rest.area_id = rest.area_ids[0]
  } else if (rest.area_ids && rest.area_ids.length === 0) {
    rest.area_id = null
  }

  const { data, error } = await supabase
    .from('staff')
    .insert(rest)
    .select(COLS)
    .single()
  if (error) throw error
  clearStaffCache()
  const staff = data as Staff

  if (password && staff.id) {
    await supabase.rpc('set_staff_password', {
      p_staff_id: staff.id,
      p_plain_password: password,
    })
  }

  return staff
}

export async function updateStaff(id: string, input: Partial<{
  full_name: string
  role: string
  phone: string | null
  area_id: string | null
  area_ids: string[] | null
  username: string | null
  is_active: boolean
}>): Promise<Staff> {
  // Backward compatibility: sync area_id with first element of area_ids if provided
  if (input.area_ids !== undefined) {
    if (input.area_ids && input.area_ids.length > 0) {
      input.area_id = input.area_ids[0]
    } else {
      input.area_id = null
    }
  }

  const { data, error } = await supabase
    .from('staff')
    .update(input)
    .eq('id', id)
    .select(COLS)
    .single()
  if (error) throw error
  clearStaffCache()
  return data as Staff
}

export async function updateStaffPassword(staffId: string, newPassword: string): Promise<void> {
  const { error } = await supabase.rpc('set_staff_password', {
    p_staff_id: staffId,
    p_plain_password: newPassword,
  })
  if (error) throw error
  clearStaffCache()
}

export async function deleteStaff(id: string): Promise<void> {
  const { error } = await supabase
    .from('staff')
    .delete()
    .eq('id', id)
  if (error) throw error
  clearStaffCache()
}

export interface StaffActivity {
  payments: {
    id: string
    amount: number
    method: string
    note: string | null
    receipt_no: string
    paid_at: string
    bill: {
      amount: number
      paid_amount: number
      status: string
    } | null
    customer: {
      id: string
      customer_code: string
      full_name: string
      address_type: string
      address_value: string | null
      area: { name: string } | null
    } | null
  }[]
  visits: {
    id: string
    amount: number
    paid_amount: number
    paid_at: string | null
    payment_note: string | null
    customer: {
      id: string
      customer_code: string
      full_name: string
      address_type: string
      address_value: string | null
      area: { name: string } | null
    } | null
  }[]
  resolvedComplaints: {
    id: string
    complaint_code: string
    issue: string
    type: string
    priority: string
    opened_at: string
    resolved_at: string | null
    customer: {
      id: string
      customer_code: string
      full_name: string
      address_type: string
      address_value: string | null
      area: { name: string } | null
    } | null
  }[]
  activeComplaints: {
    id: string
    complaint_code: string
    issue: string
    type: string
    priority: string
    status: string
    opened_at: string
    customer: {
      id: string
      customer_code: string
      full_name: string
      address_type: string
      address_value: string | null
      area: { name: string } | null
    } | null
  }[]
}

export async function getStaffActivity(staffId: string, dateStr: string): Promise<StaffActivity> {
  const [yr, mo, dy] = dateStr.split('-').map(Number)
  const start = new Date(yr, mo - 1, dy, 0, 0, 0, 0)
  const end = new Date(yr, mo - 1, dy, 23, 59, 59, 999)
  
  const startISO = start.toISOString()
  const endISO = end.toISOString()

  // 1. Fetch payments
  const paymentsPromise = supabase
    .from('payments')
    .select(`
      id,
      amount,
      method,
      note,
      receipt_no,
      paid_at,
      bill:bills(amount, paid_amount, status),
      customer:customers(
        id,
        customer_code,
        full_name,
        address_type,
        address_value,
        area:areas(name)
      )
    `)
    .eq('collected_by', staffId)
    .gte('paid_at', startISO)
    .lte('paid_at', endISO)
    .order('paid_at', { ascending: false })

  // 2. Fetch visits
  const visitsPromise = supabase
    .from('bills')
    .select(`
      id,
      amount,
      paid_amount,
      paid_at,
      payment_note,
      customer:customers(
        id,
        customer_code,
        full_name,
        address_type,
        address_value,
        area:areas(name)
      )
    `)
    .eq('collected_by', staffId)
    .eq('payment_method', 'visit')
    .eq('paid_at', dateStr)
    .order('paid_at', { ascending: false })

  // 3. Fetch resolved complaints
  const resolvedComplaintsPromise = supabase
    .from('complaints')
    .select(`
      id,
      complaint_code,
      issue,
      type,
      priority,
      opened_at,
      resolved_at,
      customer:customers(
        id,
        customer_code,
        full_name,
        address_type,
        address_value,
        area:areas(name)
      )
    `)
    .eq('assigned_to', staffId)
    .eq('status', 'resolved')
    .gte('resolved_at', startISO)
    .lte('resolved_at', endISO)
    .order('resolved_at', { ascending: false })

  // 4. Fetch active complaints
  const activeComplaintsPromise = supabase
    .from('complaints')
    .select(`
      id,
      complaint_code,
      issue,
      type,
      priority,
      status,
      opened_at,
      customer:customers(
        id,
        customer_code,
        full_name,
        address_type,
        address_value,
        area:areas(name)
      )
    `)
    .eq('assigned_to', staffId)
    .neq('status', 'resolved')
    .order('opened_at', { ascending: false })

  const [paymentsRes, visitsRes, resolvedRes, activeRes] = await Promise.all([
    paymentsPromise,
    visitsPromise,
    resolvedComplaintsPromise,
    activeComplaintsPromise
  ])

  if (paymentsRes.error) throw paymentsRes.error
  if (visitsRes.error) throw visitsRes.error
  if (resolvedRes.error) throw resolvedRes.error
  if (activeRes.error) throw activeRes.error

  return {
    payments: (paymentsRes.data ?? []) as unknown as StaffActivity['payments'],
    visits: (visitsRes.data ?? []) as unknown as StaffActivity['visits'],
    resolvedComplaints: (resolvedRes.data ?? []) as unknown as StaffActivity['resolvedComplaints'],
    activeComplaints: (activeRes.data ?? []) as unknown as StaffActivity['activeComplaints'],
  }
}

