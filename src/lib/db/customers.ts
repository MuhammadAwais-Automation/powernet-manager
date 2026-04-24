import { supabase } from '@/lib/supabase'
import type { Customer, CustomerWithRelations, NewCustomer } from '@/types/database'

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

export async function searchCustomers(query: string): Promise<CustomerWithRelations[]> {
  const { data, error } = await supabase
    .from('customers')
    .select('*, area:areas(*), package:packages(*)')
    .or(`full_name.ilike.%${query}%,customer_code.ilike.%${query}%,username.ilike.%${query}%`)
    .order('customer_code')
  if (error) throw error
  return data as CustomerWithRelations[]
}
