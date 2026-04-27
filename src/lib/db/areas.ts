import { supabase } from '@/lib/supabase'
import type { Area } from '@/types/database'

let areasCache: { data: Area[]; expiresAt: number } | null = null
let areaCountsCache: { data: Record<string, number>; expiresAt: number } | null = null
const CACHE_MS = 60_000

function clearAreaCaches() {
  areasCache = null
  areaCountsCache = null
}

export async function getAreas(): Promise<Area[]> {
  if (areasCache && areasCache.expiresAt > Date.now()) return areasCache.data

  const { data, error } = await supabase
    .from('areas')
    .select('*')
    .eq('is_active', true)
    .order('type')
    .order('name')
  if (error) throw error
  const areas = data as Area[]
  areasCache = { data: areas, expiresAt: Date.now() + CACHE_MS }
  return areas
}

export async function getAreaById(id: string): Promise<Area | null> {
  const { data, error } = await supabase
    .from('areas')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data as Area
}

export async function createArea(input: {
  name: string
  code: string
  type: 'garrison' | 'civilian'
  is_active: boolean
}): Promise<Area> {
  const { data, error } = await supabase
    .from('areas')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  clearAreaCaches()
  return data as Area
}

export async function updateArea(id: string, input: Partial<{
  name: string
  code: string
  type: 'garrison' | 'civilian'
  is_active: boolean
}>): Promise<Area> {
  const { data, error } = await supabase
    .from('areas')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  clearAreaCaches()
  return data as Area
}

export async function getAreaCustomerCounts(): Promise<Record<string, number>> {
  if (areaCountsCache && areaCountsCache.expiresAt > Date.now()) return areaCountsCache.data

  const { data, error } = await supabase
    .rpc('get_area_customer_counts')
  if (error) {
    // fallback: batch fetch
    const BATCH = 1000
    let all: { area_id: string }[] = []
    let from = 0
    while (true) {
      const { data: batch, error: bErr } = await supabase
        .from('customers')
        .select('area_id')
        .range(from, from + BATCH - 1)
      if (bErr || !batch || batch.length === 0) break
      all = all.concat(batch as { area_id: string }[])
      if (batch.length < BATCH) break
      from += BATCH
    }
    const counts = all.reduce((acc, c) => {
      if (c.area_id) acc[c.area_id] = (acc[c.area_id] ?? 0) + 1
      return acc
    }, {} as Record<string, number>)
    areaCountsCache = { data: counts, expiresAt: Date.now() + CACHE_MS }
    return counts
  }
  const counts = (data ?? []).reduce((acc: Record<string, number>, row: { area_id: string; count: number }) => {
    acc[row.area_id] = row.count
    return acc
  }, {})
  areaCountsCache = { data: counts, expiresAt: Date.now() + CACHE_MS }
  return counts
}
