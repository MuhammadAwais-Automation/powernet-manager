import { supabase } from '@/lib/supabase'
import type { Complaint, ComplaintWithRelations } from '@/types/database'

const COMPLAINT_SELECT = `
  *,
  customer:customers(id, full_name, area_id),
  technician:staff(id, full_name)
`

let complaintsCache: { data: ComplaintWithRelations[]; expiresAt: number } | null = null
const CACHE_MS = 60_000

export function clearComplaintsCache() {
  complaintsCache = null
}

export async function getComplaints(): Promise<ComplaintWithRelations[]> {
  if (complaintsCache && complaintsCache.expiresAt > Date.now()) return complaintsCache.data

  const { data, error } = await supabase
    .from('complaints')
    .select(COMPLAINT_SELECT)
    .order('opened_at', { ascending: false })
  if (error) throw error
  const complaints = data as ComplaintWithRelations[]
  complaintsCache = { data: complaints, expiresAt: Date.now() + CACHE_MS }
  return complaints
}

export async function getComplaintById(id: string): Promise<ComplaintWithRelations | null> {
  const { data, error } = await supabase
    .from('complaints')
    .select(COMPLAINT_SELECT)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data ?? null) as ComplaintWithRelations | null
}

export async function getRecentComplaintStatusEvents(limit = 25): Promise<ComplaintWithRelations[]> {
  const [resolvedRes, inProgressRes] = await Promise.all([
    supabase
      .from('complaints')
      .select(COMPLAINT_SELECT)
      .eq('status', 'resolved')
      .not('resolved_at', 'is', null)
      .order('resolved_at', { ascending: false })
      .limit(limit),
    supabase
      .from('complaints')
      .select(COMPLAINT_SELECT)
      .eq('status', 'in_progress')
      .order('opened_at', { ascending: false })
      .limit(limit),
  ])

  if (resolvedRes.error) throw resolvedRes.error
  if (inProgressRes.error) throw inProgressRes.error

  const byStatusKey = new Map<string, ComplaintWithRelations>()
  ;[
    ...((resolvedRes.data ?? []) as ComplaintWithRelations[]),
    ...((inProgressRes.data ?? []) as ComplaintWithRelations[]),
  ].forEach(complaint => {
    byStatusKey.set(`${complaint.id}:${complaint.status}`, complaint)
  })

  return Array.from(byStatusKey.values()).sort((a, b) => {
    const aTime = Date.parse(a.resolved_at ?? a.opened_at)
    const bTime = Date.parse(b.resolved_at ?? b.opened_at)
    return bTime - aTime
  })
}

export async function updateComplaint(
  id: string,
  input: Partial<Pick<Complaint, 'status' | 'assigned_to' | 'resolved_at'>>,
): Promise<Complaint> {
  const { data, error } = await supabase
    .from('complaints')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  clearComplaintsCache()
  return data as Complaint
}

export async function createComplaint(
  input: Omit<Complaint, 'id' | 'complaint_code' | 'opened_at' | 'resolved_at'>,
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
