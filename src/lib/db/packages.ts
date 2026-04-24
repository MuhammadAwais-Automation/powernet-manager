import { supabase } from '@/lib/supabase'
import type { Package } from '@/types/database'

export async function getPackages(): Promise<Package[]> {
  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .eq('is_active', true)
    .order('speed_mbps')
  if (error) throw error
  return data as Package[]
}

export async function getPackageById(id: string): Promise<Package | null> {
  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .eq('id', id)
    .single()
  if (error) return null
  return data as Package
}
