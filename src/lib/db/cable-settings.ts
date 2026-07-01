import { supabase } from '@/lib/supabase'
import type { CableSettings } from '@/types/database'

let settingsCache: { data: CableSettings; expiresAt: number } | null = null
const CACHE_MS = 30_000

export function clearCableSettingsCache() {
  settingsCache = null
}

export async function getCableSettings(): Promise<CableSettings> {
  if (settingsCache && settingsCache.expiresAt > Date.now()) {
    return settingsCache.data
  }

  const { data, error } = await supabase
    .from('cable_settings')
    .select('id, monthly_price, updated_at')
    .eq('id', 1)
    .maybeSingle()

  if (error) throw error

  const settings: CableSettings = data
    ? (data as CableSettings)
    : { id: 1, monthly_price: 0, updated_at: new Date().toISOString() }

  settingsCache = { data: settings, expiresAt: Date.now() + CACHE_MS }
  return settings
}

export async function updateCableMonthlyPrice(monthlyPrice: number): Promise<CableSettings> {
  if (!Number.isFinite(monthlyPrice) || monthlyPrice < 0) {
    throw new Error('Cable monthly price must be zero or greater')
  }

  const { data, error } = await supabase
    .from('cable_settings')
    .upsert({
      id: 1,
      monthly_price: Math.round(monthlyPrice),
      updated_at: new Date().toISOString(),
    })
    .select('id, monthly_price, updated_at')
    .single()

  if (error) throw error
  clearCableSettingsCache()
  return data as CableSettings
}