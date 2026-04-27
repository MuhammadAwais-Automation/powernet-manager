import { supabase } from '@/lib/supabase'
import type { Package } from '@/types/database'

let packagesCache: { data: Package[]; expiresAt: number } | null = null
const CACHE_MS = 60_000

export async function getPackages(): Promise<Package[]> {
  if (packagesCache && packagesCache.expiresAt > Date.now()) return packagesCache.data

  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .eq('is_active', true)
    .order('speed_mbps')
  if (error) throw error
  const packages = data as Package[]
  packagesCache = { data: packages, expiresAt: Date.now() + CACHE_MS }
  return packages
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
