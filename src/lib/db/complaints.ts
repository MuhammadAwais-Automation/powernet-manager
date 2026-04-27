import { supabase } from '@/lib/supabase'
import type { Complaint, ComplaintWithRelations } from '@/types/database'

let complaintsCache: { data: ComplaintWithRelations[]; expiresAt: number } | null = null
const CACHE_MS = 60_000

function clearComplaintsCache() {
  complaintsCache = null
}

export async function getComplaints(): Promise<ComplaintWithRelations[]> {
  if (complaintsCache && complaintsCache.expiresAt > Date.now()) return complaintsCache.data

  const { data, error } = await supabase
    .from('complaints')
    .select(`
      *,
      customer:customers(id, full_name, area_id),
      technician:staff(id, full_name)
    `)
    .order('opened_at', { ascending: false })
  if (error) throw error
  const complaints = data as ComplaintWithRelations[]
  complaintsCache = { data: complaints, expiresAt: Date.now() + CACHE_MS }
  return complaints
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
  clearComplaintsCache()
  return data as Complaint
}
