import { supabase } from '@/lib/supabase'
import type { Complaint, ComplaintWithRelations } from '@/types/database'

export async function getComplaints(): Promise<ComplaintWithRelations[]> {
  const { data, error } = await supabase
    .from('complaints')
    .select(`
      *,
      customer:customers(id, full_name, area_id),
      technician:staff(id, full_name)
    `)
    .order('opened_at', { ascending: false })
  if (error) throw error
  return data as ComplaintWithRelations[]
}

export async function createComplaint(
  input: Omit<Complaint, 'id' | 'complaint_code' | 'opened_at' | 'resolved_at'>
): Promise<Complaint> {
  const { data, error } = await supabase
    .from('complaints')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as Complaint
}
