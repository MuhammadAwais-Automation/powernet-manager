import { supabase } from '@/lib/supabase'
import type { Staff, StaffWithArea } from '@/types/database'

export async function getStaff(): Promise<StaffWithArea[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('id, full_name, role, phone, area_id, username, is_active, created_at, area:areas(*)')
    .order('full_name')
  if (error) throw error
  return data as unknown as StaffWithArea[]
}

export async function createStaff(input: {
  full_name: string
  role: string
  phone: string | null
  area_id: string | null
  is_active: boolean
  username: string | null
  password?: string
}): Promise<Staff> {
  const { password, ...rest } = input
  const { data, error } = await supabase
    .from('staff')
    .insert(rest)
    .select('id, full_name, role, phone, area_id, username, is_active, created_at')
    .single()
  if (error) throw error
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
  username: string | null
  is_active: boolean
}>): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .update(input)
    .eq('id', id)
    .select('id, full_name, role, phone, area_id, username, is_active, created_at')
    .single()
  if (error) throw error
  return data as Staff
}

export async function updateStaffPassword(staffId: string, newPassword: string): Promise<void> {
  const { error } = await supabase.rpc('set_staff_password', {
    p_staff_id: staffId,
    p_plain_password: newPassword,
  })
  if (error) throw error
}
