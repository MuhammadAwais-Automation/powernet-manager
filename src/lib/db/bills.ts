import { supabase } from '@/lib/supabase'
import type { Bill, BillWithRelations } from '@/types/database'

export async function getBills(): Promise<BillWithRelations[]> {
  const { data, error } = await supabase
    .from('bills')
    .select(`
      *,
      customer:customers(id, customer_code, full_name, package_id),
      collector:staff(id, full_name)
    `)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as BillWithRelations[]
}

export async function getBillsByCustomer(customerId: string): Promise<Bill[]> {
  const { data, error } = await supabase
    .from('bills')
    .select('*')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data as Bill[]
}
