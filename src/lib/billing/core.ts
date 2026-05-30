type BillableStatus =
  | "active"
  | "suspended"
  | "disconnected"
  | "free"
  | "shifted"
  | "tdc";

type BillAmountSource = {
  due_amount: number | null;
  package: { default_price: number | null } | null;
};

type CustomerIdentitySource = {
  username?: string | null;
  customer_code?: string | null;
  house_id?: string | null;
};

type BillCollectionSource = {
  amount: number;
  paid_amount: number | null;
  status: "pending" | "paid" | "overdue";
};

export type PaymentSource =
  | "office"
  | "agent"
  | "customer"
  | "manual"
  | null
  | undefined;
export type DerivedBillCollectionStatus =
  | "pending"
  | "partial"
  | "paid"
  | "overdue";

export function normalizeBillingMonth(value: string): string {
  const month = value.trim().slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error("Billing month must be in YYYY-MM format");
  }

  const monthNumber = Number(month.slice(5, 7));
  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error("Billing month must be in YYYY-MM format");
  }

  return month;
}

export function getCurrentBillingMonth(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function isBillableCustomerStatus(status: BillableStatus): boolean {
  return status === "active";
}

export function getCustomerBillAmount(customer: BillAmountSource): number {
  return customer.due_amount ?? customer.package?.default_price ?? 0;
}

export function getCustomerSecondaryId(
  customer: CustomerIdentitySource,
): string | undefined {
  const username = normalizeIdentifier(customer.username);
  if (username) return username;

  const houseId = normalizeIdentifier(customer.house_id);
  if (houseId) return houseId;

  return undefined;
}

export function getBillCollectionStatus(
  bill: BillCollectionSource,
): DerivedBillCollectionStatus {
  const paid = bill.paid_amount ?? 0;
  if (bill.status === "paid" || paid >= bill.amount) return "paid";
  if (paid > 0) return "partial";
  if (bill.status === "overdue") return "overdue";
  return "pending";
}

export function getPaymentSourceLabel(source: PaymentSource): string {
  if (source === "office") return "Paid in Office";
  if (source === "agent") return "Collected by Agent";
  if (source === "customer") return "Paid by Customer";
  return "Manual Payment";
}

function normalizeIdentifier(value?: string | null): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}
