export type Area = {
  id: string;
  code: string;
  name: string;
  type: "garrison" | "civilian";
  is_active: boolean;
};

export type Package = {
  id: string;
  name: string;
  speed_mbps: number;
  default_price: number | null;
  is_active: boolean;
};

export type CustomerStatus =
  | "active"
  | "suspended"
  | "disconnected"
  | "free"
  | "shifted"
  | "tdc";
export type AddressType = "text" | "id_number";

export type CableType = "digital" | "analog";

export type Customer = {
  id: string;
  customer_code: string;
  username: string | null;
  auth_user_id: string | null;
  house_id: string | null;
  full_name: string;
  father_name: string | null;
  cnic: string | null;
  gender: string | null;
  profession: string | null;
  rank_or_position: string | null;
  unit: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  package_id: string | null;
  iptv: boolean;
  has_cable: boolean;
  has_internet: boolean;
  cable_type: CableType | null;
  address_type: AddressType;
  address_value: string | null;
  area_id: string | null;
  connection_date: string | null;
  due_amount: number | null;
  onu_number: string | null;
  status: CustomerStatus;
  is_tdc?: boolean;
  disconnected_date: string | null;
  reconnected_date: string | null;
  remarks: string | null;
  created_at: string;
};

export type CustomerWithRelations = Customer & {
  area: Area | null;
  package: Package | null;
};

export type CustomerListRow = Pick<
  Customer,
  | "id"
  | "customer_code"
  | "username"
  | "full_name"
  | "cnic"
  | "phone"
  | "status"
  | "is_tdc"
  | "due_amount"
  | "connection_date"
  | "has_cable"
  | "has_internet"
  | "iptv"
> & {
  area: Pick<Area, "id" | "name"> | null;
  package: Pick<Package, "id" | "name"> | null;
};

export type CableListRow = Pick<
  Customer,
  | "id"
  | "customer_code"
  | "username"
  | "full_name"
  | "cnic"
  | "phone"
  | "status"
  | "is_tdc"
  | "connection_date"
  | "has_internet"
  | "has_cable"
  | "iptv"
  | "cable_type"
  | "address_type"
  | "address_value"
> & {
  area: Pick<Area, "id" | "name"> | null;
};

export type CableSettings = {
  id: number;
  monthly_price: number;
  updated_at: string;
};

export type CableBillStatus = "pending" | "paid" | "overdue";

export type CableBill = {
  id: string;
  customer_id: string;
  amount: number;
  paid_amount: number;
  month: string;
  status: CableBillStatus;
  collected_by: string | null;
  paid_at: string | null;
  receipt_no: string | null;
  payment_method: PaymentMethod | null;
  payment_source: PaymentSource | null;
  payment_note: string | null;
  created_at: string;
};

export type CableBillWithRelations = CableBill & {
  customer: Pick<
    Customer,
    | "id"
    | "customer_code"
    | "full_name"
    | "phone"
    | "cnic"
    | "house_id"
    | "area_id"
    | "has_internet"
    | "has_cable"
    | "status"
    | "address_type"
    | "address_value"
  > & {
    area: Pick<Area, "id" | "name" | "code" | "type"> | null;
  } | null;
  collector: Pick<Staff, "id" | "full_name"> | null;
};

export type CablePayment = {
  id: string;
  cable_bill_id: string;
  customer_id: string;
  amount: number;
  collected_by: string | null;
  method: PaymentMethod;
  source: PaymentSource | null;
  note: string | null;
  receipt_no: string;
  paid_at: string;
  created_at: string;
};

export type NewCustomer = Omit<
  Customer,
  | "id"
  | "customer_code"
  | "created_at"
  | "auth_user_id"
  | "house_id"
  | "father_name"
  | "gender"
  | "profession"
  | "rank_or_position"
  | "unit"
  | "whatsapp"
  | "email"
  | "cable_type"
> &
  Partial<
    Pick<
      Customer,
      | "auth_user_id"
      | "house_id"
      | "father_name"
      | "gender"
      | "profession"
      | "rank_or_position"
      | "unit"
      | "whatsapp"
      | "email"
      | "cable_type"
    >
  >;

export type CustomerSignupStatus = "pending" | "approved" | "rejected";

export type CustomerSignupRequest = {
  id: string;
  full_name: string;
  father_name: string | null;
  cnic: string;
  gender: string | null;
  profession: string | null;
  rank_or_position: string | null;
  unit: string | null;
  phone: string;
  whatsapp: string | null;
  area_id: string;
  package_id: string;
  house_id: string;
  street_address: string | null;
  email: string | null;
  status: CustomerSignupStatus;
  review_note: string | null;
  approved_customer_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
};

export type CustomerSignupRequestWithRelations = CustomerSignupRequest & {
  area: Pick<Area, "id" | "name" | "code"> | null;
  package: Pick<Package, "id" | "name" | "default_price"> | null;
  approved_customer: Pick<
    Customer,
    "id" | "customer_code" | "full_name"
  > | null;
};

export type StaffRole =
  | "technician"
  | "cable_technician"
  | "recovery_agent"
  | "helper"
  | "admin"
  | "complaint_manager";

export type Staff = {
  id: string;
  full_name: string;
  role: StaffRole;
  phone: string | null;
  area_id: string | null;
  area_ids: string[] | null;
  username: string | null;
  auth_user_id: string | null;
  is_active: boolean;
  created_at: string;
};

export type StaffWithArea = Staff & { area: Area | null; areas: Area[] };

export type BillStatus = "pending" | "paid" | "overdue";

export type Bill = {
  id: string;
  customer_id: string;
  amount: number;
  paid_amount: number | null;
  month: string;
  status: BillStatus;
  collected_by: string | null;
  paid_at: string | null;
  receipt_no: string | null;
  payment_method: PaymentMethod | null;
  payment_source: PaymentSource | null;
  payment_note: string | null;
  promised_date: string | null;
  created_at: string;
};

export type BillWithRelations = Bill & {
  customer: Pick<
    Customer,
    | "id"
    | "customer_code"
    | "username"
    | "house_id"
    | "full_name"
    | "father_name"
    | "cnic"
    | "phone"
    | "whatsapp"
    | "email"
    | "package_id"
    | "area_id"
    | "address_type"
    | "address_value"
    | "onu_number"
    | "status"
    | "iptv"
    | "connection_date"
    | "profession"
    | "rank_or_position"
    | "unit"
    | "remarks"
  > & {
    area: Pick<Area, "id" | "name" | "code" | "type"> | null;
    package: Pick<Package, "id" | "name" | "speed_mbps" | "default_price"> | null;
  } | null;
  collector: Pick<Staff, "id" | "full_name"> | null;
};

export type PaymentMethod =
  | "cash"
  | "bank"
  | "easypaisa"
  | "jazzcash"
  | "other"
  | "visit";
export type PaymentSource = "office" | "agent" | "customer" | "manual";

export type Payment = {
  id: string;
  bill_id: string;
  customer_id: string;
  amount: number;
  collected_by: string | null;
  method: PaymentMethod;
  source: PaymentSource | null;
  note: string | null;
  receipt_no: string;
  receipt_url: string | null;
  paid_at: string;
  created_at: string;
};

export type Team = {
  id: string;
  name: string;
  created_at: string;
};

export type TeamMember = {
  id: string;
  team_id: string;
  staff_id: string;
  created_at: string;
};

export type TeamWithMembers = Team & {
  members: (TeamMember & { staff: Pick<Staff, 'id' | 'full_name' | 'role' | 'phone'> })[];
};

export type ComplaintServiceLine = "internet" | "cable";

export type ComplaintType =
  | "fiber_issue"
  | "no_internet"
  | "device_issue"
  | "payment_issue"
  | "other"
  | "cable_issue"
  | "cable_down"
  | "signal_issue"
  | "onu_fault"
  | "no_signal"
  | "connectivity"
  | "speed"
  | "hardware"
  | "billing"
  | "upgrade";
export type ComplaintPriority = "low" | "medium" | "high";
export type ComplaintStatus = "open" | "in_progress" | "resolved";

export type Complaint = {
  id: string;
  complaint_code: string;
  customer_id: string;
  issue: string;
  type: ComplaintType;
  service_line?: ComplaintServiceLine;
  priority: ComplaintPriority;
  status: ComplaintStatus;
  assigned_to: string | null;
  assigned_at: string | null;
  in_progress_at: string | null;
  opened_at: string;
  resolved_at: string | null;
  team_id: string | null;
};

export type ComplaintWithRelations = Complaint & {
  customer:
    | (Pick<
        Customer,
        | "id"
        | "full_name"
        | "area_id"
        | "phone"
        | "house_id"
        | "address_value"
        | "address_type"
        | "whatsapp"
        | "email"
      > & {
        area: Pick<Area, "id" | "name" | "code"> | null;
      })
    | null;
  technician: Pick<Staff, "id" | "full_name"> | null;
  team: Pick<Team, "id" | "name"> | null;
};
