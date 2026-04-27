export type Area = {
  id: string
  code: string
  name: string
  type: 'garrison' | 'civilian'
  is_active: boolean
}

export type Package = {
  id: string
  name: string
  speed_mbps: number
  default_price: number | null
  is_active: boolean
}

export type CustomerStatus = 'active' | 'suspended' | 'disconnected' | 'free' | 'shifted' | 'tdc'
export type AddressType = 'text' | 'id_number'

export type Customer = {
  id: string
  customer_code: string
  username: string | null
  full_name: string
  cnic: string | null
  phone: string | null
  package_id: string | null
  iptv: boolean
  address_type: AddressType
  address_value: string | null
  area_id: string | null
  connection_date: string | null
  due_amount: number | null
  onu_number: string | null
  status: CustomerStatus
  disconnected_date: string | null
  reconnected_date: string | null
  remarks: string | null
  created_at: string
}

export type CustomerWithRelations = Customer & {
  area: Area | null
  package: Package | null
}

export type CustomerListRow = Pick<
  Customer,
  'id' | 'customer_code' | 'username' | 'full_name' | 'cnic' | 'phone' | 'status' | 'due_amount'
> & {
  area: Pick<Area, 'id' | 'name'> | null
  package: Pick<Package, 'id' | 'name'> | null
}

export type NewCustomer = Omit<Customer, 'id' | 'customer_code' | 'created_at'>

export type StaffRole =
  | 'technician'
  | 'recovery_agent'
  | 'helper'
  | 'admin'
  | 'complaint_manager'

export type Staff = {
  id: string
  full_name: string
  role: StaffRole
  phone: string | null
  area_id: string | null
  username: string | null
  auth_user_id: string | null
  is_active: boolean
  created_at: string
}

export type StaffWithArea = Staff & { area: Area | null }

export type BillStatus = 'pending' | 'paid' | 'overdue'

export type Bill = {
  id: string
  customer_id: string
  amount: number
  paid_amount: number
  month: string
  status: BillStatus
  collected_by: string | null
  paid_at: string | null
  receipt_no: string | null
  payment_method: 'cash' | 'bank' | 'easypaisa' | 'jazzcash' | 'other' | null
  payment_note: string | null
  created_at: string
}

export type BillWithRelations = Bill & {
  customer: Pick<Customer, 'id' | 'customer_code' | 'full_name' | 'package_id'> | null
  collector: Pick<Staff, 'id' | 'full_name'> | null
}

export type PaymentMethod = 'cash' | 'bank' | 'easypaisa' | 'jazzcash' | 'other'

export type Payment = {
  id: string
  bill_id: string
  customer_id: string
  amount: number
  collected_by: string | null
  method: PaymentMethod
  note: string | null
  receipt_no: string
  paid_at: string
  created_at: string
}

export type ComplaintType = 'connectivity' | 'speed' | 'hardware' | 'billing' | 'upgrade' | 'other'
export type ComplaintPriority = 'low' | 'medium' | 'high'
export type ComplaintStatus = 'open' | 'in_progress' | 'resolved'

export type Complaint = {
  id: string
  complaint_code: string
  customer_id: string
  issue: string
  type: ComplaintType
  priority: ComplaintPriority
  status: ComplaintStatus
  assigned_to: string | null
  opened_at: string
  resolved_at: string | null
}

export type ComplaintWithRelations = Complaint & {
  customer: Pick<Customer, 'id' | 'full_name' | 'area_id'> | null
  technician: Pick<Staff, 'id' | 'full_name'> | null
}
