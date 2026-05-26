import { supabase } from '@/lib/supabase'
import type { Staff, StaffWithArea } from '@/types/database'

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

  const staff = (staffData || []).map((s: any) => {
    const sAreaIds = s.area_ids || []
    const sAreas = areasList.filter(a => sAreaIds.includes(a.id))
    return {
      ...s,
      areas: sAreas,
      area: s.area || sAreas[0] || null
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
