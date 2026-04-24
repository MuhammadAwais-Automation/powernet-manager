import { supabase } from '@/lib/supabase'
import type { Area } from '@/types/database'

export async function getAreas(): Promise<Area[]> {
  const { data, error } = await supabase
    .from('areas')
    .select('*')
    .eq('is_active', true)
    .order('type')
    .order('name')
  if (error) throw error
  return data as Area[]
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
  return data as Area
}

export async function getAreaCustomerCounts(): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from('customers')
    .select('area_id')
  if (error) return {}
  return (data ?? []).reduce((acc, c) => {
    if (c.area_id) acc[c.area_id] = (acc[c.area_id] ?? 0) + 1
    return acc
  }, {} as Record<string, number>)
}
