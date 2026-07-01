import { supabase } from '@/lib/supabase'
import { RECENT_COMPLAINT_STATUSES } from './complaint-statuses'
import type { Complaint, ComplaintWithRelations } from '@/types/database'

const COMPLAINT_SELECT = `
  *,
  customer:customers(
    id,
    full_name,
    area_id,
    phone,
    house_id,
    address_value,
    address_type,
    whatsapp,
    email,
    area:areas(id, name, code)
  ),
  technician:staff(id, full_name),
  team:teams(id, name)
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
  const results = await Promise.all(RECENT_COMPLAINT_STATUSES.map(status => {
    let query = supabase
      .from('complaints')
      .select(COMPLAINT_SELECT)
      .eq('status', status)

    query = status === 'resolved'
      ? query.not('resolved_at', 'is', null).order('resolved_at', { ascending: false })
      : query.order('opened_at', { ascending: false })

    return query.limit(limit)
  }))

  const firstError = results.find(result => result.error)?.error
  if (firstError) throw firstError

  const byStatusKey = new Map<string, ComplaintWithRelations>()
  results.flatMap(result => (result.data ?? []) as ComplaintWithRelations[]).forEach(complaint => {
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
  input: Partial<Pick<Complaint, 'status' | 'assigned_to' | 'assigned_at' | 'in_progress_at' | 'resolved_at' | 'priority' | 'team_id'>>,
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

export type GlobalComplaintHit = {
  id: string;
  complaint_code: string;
  issue: string;
  status: string;
  priority: string;
  customerName: string;
};

export async function searchComplaints(q: string, limit = 5): Promise<GlobalComplaintHit[]> {
  const safe = (q || '').trim().replace(/[%,'"()]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!safe || safe.length < 2) return [];

  const hits: GlobalComplaintHit[] = [];

  // by code
  try {
    const { data: codeRows } = await supabase
      .from('complaints')
      .select('id, complaint_code, issue, status, priority, customer:customers(full_name)')
      .ilike('complaint_code', `%${safe}%`)
      .order('opened_at', { ascending: false })
      .limit(limit);
    (codeRows ?? []).forEach((r: Record<string, unknown>) => {
      const c = (r.customer as Record<string, unknown>) || {};
      hits.push({
        id: r.id as string,
        complaint_code: r.complaint_code as string,
        issue: (r.issue as string) || '',
        status: r.status as string,
        priority: r.priority as string,
        customerName: (c.full_name as string) || '',
      });
    });
  } catch {}

  if (hits.length >= limit) return hits.slice(0, limit);

  // by issue text
  try {
    const { data: issueRows } = await supabase
      .from('complaints')
      .select('id, complaint_code, issue, status, priority, customer:customers(full_name)')
      .or(`issue.ilike.%${safe}%`)
      .order('opened_at', { ascending: false })
      .limit(limit - hits.length);
    (issueRows ?? []).forEach((r: Record<string, unknown>) => {
      if (hits.some(h => h.id === r.id)) return;
      const c = (r.customer as Record<string, unknown>) || {};
      hits.push({
        id: r.id as string,
        complaint_code: r.complaint_code as string,
        issue: (r.issue as string) || '',
        status: r.status as string,
        priority: r.priority as string,
        customerName: (c.full_name as string) || '',
      });
    });
  } catch {}

  // customer name match -> their complaints
  try {
    const custs = await import('./customers').then(m => m.searchCustomers(safe, 8));
    if (custs.length) {
      const cids = (custs as { id: string }[]).map((c) => c.id);
      const { data: cRows } = await supabase
        .from('complaints')
        .select('id, complaint_code, issue, status, priority, customer:customers(full_name)')
        .in('customer_id', cids)
        .order('opened_at', { ascending: false })
        .limit(3);
      (cRows ?? []).forEach((r: Record<string, unknown>) => {
        if (hits.some(h => h.id === r.id)) return;
        const c = (r.customer as Record<string, unknown>) || {};
        hits.push({
          id: r.id as string,
          complaint_code: r.complaint_code as string,
          issue: (r.issue as string) || '',
          status: r.status as string,
          priority: r.priority as string,
          customerName: (c.full_name as string) || '',
        });
      });
    }
  } catch {}

  return hits.slice(0, limit);
}
