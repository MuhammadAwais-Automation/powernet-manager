export type BillingNotificationType =
  | "payment_full"
  | "payment_partial"
  | "visit";

export type BillingRealtimeBillRow = {
  id?: string | null;
  customer_id?: string | null;
  amount?: number | null;
  paid_amount?: number | null;
  status?: string | null;
  paid_at?: string | null;
  receipt_no?: string | null;
  payment_method?: string | null;
  payment_source?: string | null;
  collected_by?: string | null;
  promised_date?: string | null;
};

export type BillingNotification = {
  id: string;
  dedupeKey: string;
  kind: "billing";
  type: BillingNotificationType;
  billId: string;
  customerName: string;
  customerCode?: string | null;
  collectorName?: string | null;
  amountPaid: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  receiptNo?: string | null;
  createdAt: string;
  read: boolean;
  title: string;
  message: string;
};

export type BillingNotificationSource = {
  billId: string;
  customerName: string;
  customerCode?: string | null;
  collectorName?: string | null;
  amount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  receiptNo?: string | null;
  paidAt?: string | null;
  paymentMethod?: string | null;
  paymentNote?: string | null;
  paymentSource?: string | null;
  promisedDate?: string | null;
};

export function didPaymentChange(
  oldRow?: BillingRealtimeBillRow | null,
  newRow?: BillingRealtimeBillRow | null,
): boolean {
  if (!newRow?.id) return false;
  if (newRow.payment_method === "visit") return false;
  const oldPaid = toNumber(oldRow?.paid_amount);
  const newPaid = toNumber(newRow.paid_amount);
  if (newPaid > oldPaid) return true;
  if (oldRow?.status !== newRow.status && newRow.status === "paid") return true;
  if (!oldRow?.receipt_no && Boolean(newRow.receipt_no)) return true;
  if (
    newPaid > 0 &&
    oldRow?.paid_at !== newRow.paid_at &&
    Boolean(newRow.paid_at)
  )
    return true;
  return false;
}

export function didNotifyChange(
  oldRow?: BillingRealtimeBillRow | null,
  newRow?: BillingRealtimeBillRow | null,
): boolean {
  if (!newRow?.id) return false;

  // Check if it is a visit log
  if (newRow.payment_method === "visit") {
    // Notify if method changed to 'visit' or if a new visit was recorded (different paid_at timestamp)
    if (oldRow?.payment_method !== "visit") return true;
    if (oldRow?.paid_at !== newRow.paid_at && Boolean(newRow.paid_at))
      return true;
    return false;
  }

  // Otherwise, use standard payment change detection
  return didPaymentChange(oldRow, newRow);
}

export function didBillRefreshChange(
  oldRow?: BillingRealtimeBillRow | null,
  newRow?: BillingRealtimeBillRow | null,
): boolean {
  if (!newRow?.id) return false;
  if (didPaymentChange(oldRow, newRow)) return true;
  if (
    oldRow?.payment_method !== newRow.payment_method &&
    Boolean(newRow.payment_method)
  )
    return true;
  if (
    oldRow?.payment_source !== newRow.payment_source &&
    Boolean(newRow.payment_source)
  )
    return true;
  if (
    oldRow?.payment_method === "visit" &&
    oldRow?.paid_at !== newRow.paid_at &&
    Boolean(newRow.paid_at)
  )
    return true;
  if (
    oldRow?.payment_method === "visit" &&
    oldRow?.collected_by !== newRow.collected_by &&
    Boolean(newRow.collected_by)
  )
    return true;
  return false;
}

export function buildBillingNotificationDedupeKey(input: {
  billId: string;
  paidAmount: number;
  status: string;
  receiptNo?: string | null;
  paymentMethod?: string | null;
  paymentNote?: string | null;
}): string {
  if (input.paymentMethod === "visit") {
    return [input.billId, "visit", input.paymentNote ?? "no-note"].join(":");
  }
  return [
    input.billId,
    input.status,
    input.paidAmount.toFixed(0),
    input.receiptNo ?? "no-receipt",
  ].join(":");
}

export function formatPromisedDate(value?: string | null): string | null {
  if (!value) return null;
  const dateOnly = value.trim().slice(0, 10);
  const parts = dateOnly.split("-");
  if (parts.length !== 3) return value;
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) return value;
  const parsed = new Date(year, month - 1, day);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-PK", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatVisitNote(note?: string | null): string {
  if (!note) return "Visited";
  switch (note.toLowerCase()) {
    case "house_locked":
      return "House Locked";
    case "promise_to_pay":
      return "Promise to Pay";
    case "refused_to_pay":
      return "Refused to Pay";
    case "payment_collected":
      return "Payment Collected";
    default:
      return note
        .split("_")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
  }
}

function formatPaymentSource(source?: string | null): string {
  switch (source) {
    case "office":
      return " in office";
    case "agent":
      return " by recovery agent";
    case "customer":
      return " by customer app";
    case "manual":
      return " by manual entry";
    default:
      return "";
  }
}

export function buildBillingNotification(
  source: BillingNotificationSource,
): BillingNotification {
  const isVisit = source.paymentMethod === "visit";
  const isFull =
    !isVisit && (source.remainingAmount <= 0 || source.status === "paid");
  const amountText = formatRs(source.amount);
  const collector = source.collectorName ? ` via ${source.collectorName}` : "";
  const paymentSource = formatPaymentSource(source.paymentSource);

  let title = "";
  let message = "";
  let type: BillingNotificationType = "payment_full";

  if (isVisit) {
    type = "visit";
    const visitReason = formatVisitNote(source.paymentNote);
    const promisedDateText = formatPromisedDate(source.promisedDate);
    title = `Customer Visited (${visitReason})`;
    message = promisedDateText
      ? `${source.customerName} was visited${collector} — ${visitReason}, promised by ${promisedDateText}`
      : `${source.customerName} was visited${collector} — Status: ${visitReason}`;
  } else if (isFull) {
    type = "payment_full";
    title = "Full payment received";
    message = `${source.customerName} paid ${amountText}${paymentSource}${collector}`;
  } else {
    type = "payment_partial";
    title = "Partial payment received";
    message = `${source.customerName} paid ${amountText}${paymentSource}${collector}`;
  }

  const dedupeKey = buildBillingNotificationDedupeKey({
    billId: source.billId,
    paidAmount: source.paidAmount,
    status: source.status,
    receiptNo: source.receiptNo,
    paymentMethod: source.paymentMethod,
    paymentNote: source.paymentNote,
  });

  return {
    id: `${dedupeKey}:${source.paidAt ?? Date.now()}`,
    dedupeKey,
    kind: "billing" as const,
    type,
    billId: source.billId,
    customerName: source.customerName,
    customerCode: source.customerCode,
    collectorName: source.collectorName,
    amountPaid: isVisit ? 0 : source.amount,
    paidAmount: source.paidAmount,
    remainingAmount: Math.max(source.remainingAmount, 0),
    status: source.status,
    receiptNo: source.receiptNo,
    createdAt: source.paidAt ?? new Date().toISOString(),
    read: false,
    title,
    message,
  };
}

export function formatRs(value: number): string {
  return `Rs. ${Math.max(value, 0).toLocaleString()}`;
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
