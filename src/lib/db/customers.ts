import { supabase } from '@/lib/supabase'
import type { Area, Customer, CustomerWithRelations, NewCustomer } from '@/types/database'

export async function getCustomers(): Promise<CustomerWithRelations[]> {
  const BATCH = 1000
  let all: CustomerWithRelations[] = []
  let from = 0

  while (true) {
    const { data, error } = await supabase
      .from('customers')
      .select('*, area:areas(*), package:packages(*)')
      .order('customer_code')
      .range(from, from + BATCH - 1)
    if (error) throw error
    if (!data || data.length === 0) break
    all = all.concat(data as CustomerWithRelations[])
    if (data.length < BATCH) break
    from += BATCH
  }

  return all
}

export async function getCustomerById(id: string): Promise<CustomerWithRelations | null> {
  const { data, error } = await supabase
    .from('customers')
    .select('*, area:areas(*), package:packages(*)')
    .eq('id', id)
    .single()
  if (error) return null
  return data as CustomerWithRelations
}

export async function createCustomer(input: NewCustomer): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .insert(input)
    .select()
    .single()
  if (error) throw error
  return data as Customer
}

export async function updateCustomer(
  id: string,
  input: Partial<NewCustomer>
): Promise<Customer> {
  const { data, error } = await supabase
    .from('customers')
    .update(input)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  return data as Customer
}

export type CustomerSearchResult = Pick<
  Customer,
  'id' | 'customer_code' | 'full_name' | 'area_id'
> & {
  area: Pick<Area, 'id' | 'name'> | null
}

export async function searchCustomers(query: string, limit = 8): Promise<CustomerSearchResult[]> {
  const safeQuery = query.trim().replaceAll(',', ' ')
  if (safeQuery.length < 2) return []

  const { data, error } = await supabase
    .from('customers')
    .select('id, customer_code, full_name, area_id, area:areas(id, name)')
    .or(`full_name.ilike.%${safeQuery}%,customer_code.ilike.%${safeQuery}%,username.ilike.%${safeQuery}%`)
    .order('customer_code')
    .limit(limit)
  if (error) throw error
  return (data ?? []) as unknown as CustomerSearchResult[]
}
