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
  id?: string;
  month?: string;
  amount: number;
  paid_amount: number | null;
  status: "pending" | "paid" | "overdue";
};

type PaymentCollectionSource = {
  amount: number | null;
  paid_at: string | null;
  collected_by?: string | null;
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
export type CustomerBalanceSummary = {
  currentDue: number;
  previousDue: number;
  totalOutstanding: number;
  totalPaid: number;
  openBillCount: number;
  currentBillId: string | null;
};

export type PaymentCollectionSummary = {
  totalCollected: number;
  dailyCollections: { d: string; v: number }[];
  agentCollections: {
    staffId: string | null;
    collected: number;
    payments: number;
  }[];
};

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

export function getBillRemaining(
  bill: Pick<BillCollectionSource, "amount" | "paid_amount">,
): number {
  return Math.max(toNumber(bill.amount) - toNumber(bill.paid_amount), 0);
}

export function buildCustomerBalanceSummary(
  bills: BillCollectionSource[],
  currentMonth: string,
): CustomerBalanceSummary {
  const month = normalizeBillingMonth(currentMonth);
  const summary: CustomerBalanceSummary = {
    currentDue: 0,
    previousDue: 0,
    totalOutstanding: 0,
    totalPaid: 0,
    openBillCount: 0,
    currentBillId: null,
  };

  const sorted = [...bills].sort((a, b) =>
    normalizeSortableMonth(b.month).localeCompare(normalizeSortableMonth(a.month)),
  );

  sorted.forEach((bill) => {
    const remaining = getBillRemaining(bill);
    const paid = toNumber(bill.paid_amount);
    const billMonth = normalizeSortableMonth(bill.month);
    const isOpen = bill.status !== "paid" && remaining > 0;

    summary.totalPaid += paid;
    if (!isOpen) return;

    summary.totalOutstanding += remaining;
    summary.openBillCount += 1;
    if (billMonth === month) {
      summary.currentDue += remaining;
      if (!summary.currentBillId) summary.currentBillId = bill.id ?? null;
    } else if (billMonth < month) {
      summary.previousDue += remaining;
    }
  });

  return summary;
}

export function buildPaymentCollectionSummary(
  payments: PaymentCollectionSource[],
  month: string,
): PaymentCollectionSummary {
  const targetMonth = normalizeBillingMonth(month);
  const byDay = new Map<string, number>();
  const byAgent = new Map<
    string,
    { staffId: string | null; collected: number; payments: number }
  >();
  let totalCollected = 0;

  payments.forEach((payment) => {
    if (!payment.paid_at) return;
    const paidAt = new Date(payment.paid_at);
    if (Number.isNaN(paidAt.getTime())) return;
    if (paidAt.toISOString().slice(0, 7) !== targetMonth) return;

    const amount = toNumber(payment.amount);
    if (amount <= 0) return;

    totalCollected += amount;
    const day = String(paidAt.getUTCDate()).padStart(2, "0");
    byDay.set(day, (byDay.get(day) ?? 0) + amount);

    const staffId = payment.collected_by ?? null;
    const key = staffId ?? "__unassigned__";
    const existing = byAgent.get(key) ?? {
      staffId,
      collected: 0,
      payments: 0,
    };
    existing.collected += amount;
    existing.payments += 1;
    byAgent.set(key, existing);
  });

  return {
    totalCollected,
    dailyCollections: Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, v]) => ({ d, v })),
    agentCollections: Array.from(byAgent.values()).sort(
      (a, b) => b.collected - a.collected || String(a.staffId).localeCompare(String(b.staffId)),
    ),
  };
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

function normalizeSortableMonth(value?: string | null): string {
  if (!value) return "";
  try {
    return normalizeBillingMonth(value);
  } catch {
    return "";
  }
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
