import { supabase } from '@/lib/supabase'
import type { Staff, StaffWithArea } from '@/types/database'

export async function getStaff(): Promise<StaffWithArea[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('*, area:areas(*)')
    .order('full_name')
  if (error) throw error
  return data as StaffWithArea[]
}

export async function createStaff(input: {
  full_name: string
  role: 'technician' | 'recovery_agent'
  phone: string | null
  area_id: string | null
  is_active: boolean
}): Promise<Staff> {
  const { data, error } = await supabase
    .from('staff')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as Staff
}
