import { supabase } from "@/lib/supabase";
import { withTimeout } from "@/lib/async/with-timeout";
import {
  buildBillsPageCacheKey,
  buildBillingSummaryCacheKey,
  getBillRange,
  normalizeBillingSearch,
  type BillStatusFilter,
} from "@/lib/billing/query";
import type {
  Bill,
  BillWithRelations,
  Payment,
  PaymentMethod,
  PaymentSource,
} from "@/types/database";

export type GenerateBillsResult = {
  month: string;
  eligible: number;
  created: number;
  existing: number;
  zeroAmount: number;
};

export type RecordPaymentInput = {
  billId: string;
  amount: number;
  collectedBy?: string | null;
  method?: PaymentMethod;
  source?: PaymentSource;
  paidAt?: string | null;
  note?: string | null;
};

export type RecordPaymentResult = {
  billId: string;
  customerId: string;
  amountPaid: number;
  paidAmount: number;
  remainingAmount: number;
  status: "pending" | "paid" | "overdue";
  receiptNo: string;
  paidAt: string;
};

export type BillingSummary = {
  month: string;
  totalBills: number;
  paidBills: number;
  pendingBills: number;
  partialBills: number;
  unpaidBills: number;
  overdueBills: number;
  visitedBills: number;
  totalBilled: number;
  totalPaid: number;
  totalRemaining: number;
  overdueTotal: number;
  dailyCollections: { d: string; v: number }[];
};

export type BillsPageParams = {
  month: string;
  page: number;
  pageSize: number;
  status?: BillStatusFilter;
  search?: string;
  areaId?: string;
  source?: string;
};

export type BillsPageResult = {
  rows: BillWithRelations[];
  total: number;
};

export type PaymentEventWithRelations = Payment & {
  bill: Pick<
    Bill,
    | "id"
    | "amount"
    | "paid_amount"
    | "status"
    | "payment_method"
    | "payment_note"
  > | null;
  customer: {
    id: string;
    customer_code: string;
    full_name: string;
  } | null;
  collector: {
    id: string;
    full_name: string;
  } | null;
};

let billsPageCache: Record<
  string,
  { data: BillsPageResult; expiresAt: number }
> = {};
let billingSummaryCache: Record<
  string,
  { data: BillingSummary; expiresAt: number }
> = {};
const CACHE_MS = 60_000;
const CUSTOMER_SEARCH_LIMIT = 250;
export const BILL_PAGE_SELECT = `
  id,
  customer_id,
  amount,
  paid_amount,
  month,
  status,
  collected_by,
  paid_at,
  receipt_no,
  payment_method,
  payment_source,
  payment_note,
  created_at,
  customer:customers(id, customer_code, username, house_id, full_name, package_id, area_id, address_type, address_value),
  collector:staff(id, full_name)
`;

const BILL_PAGE_SELECT_LEGACY = `
  id,
  customer_id,
  amount,
  paid_amount,
  month,
  status,
  collected_by,
  paid_at,
  receipt_no,
  payment_method,
  payment_note,
  created_at,
  customer:customers(id, customer_code, username, house_id, full_name, package_id, area_id, address_type, address_value),
  collector:staff(id, full_name)
`;

export function clearBillsCache() {
  billsPageCache = {};
  billingSummaryCache = {};
}

export async function getBillByIdWithRelations(
  id: string,
): Promise<BillWithRelations | null> {
  const { data } = await runBillSelectWithLegacyFallback((select) =>
    supabase.from("bills").select(select).eq("id", id).maybeSingle(),
  );
  return (data ?? null) as unknown as BillWithRelations | null;
}

export async function getRecentPaymentEvents(
  limit = 25,
): Promise<PaymentEventWithRelations[]> {
  const { data, error } = await supabase
    .from("payments")
    .select(
      `
      id,
      bill_id,
      customer_id,
      amount,
      collected_by,
      method,
      source,
      note,
      receipt_no,
      paid_at,
      created_at,
      bill:bills(id, amount, paid_amount, status, payment_method, payment_note),
      customer:customers(id, customer_code, full_name),
      collector:staff(id, full_name)
    `,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as unknown as PaymentEventWithRelations[];
}

export async function getRecentVisitedBills(
  limit = 25,
): Promise<BillWithRelations[]> {
  const { data } = await runBillSelectWithLegacyFallback((select) =>
    supabase
      .from("bills")
      .select(select)
      .eq("payment_method", "visit")
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: false })
      .limit(limit),
  );
  return (data ?? []) as unknown as BillWithRelations[];
}

export async function getBillsPage(
  params: BillsPageParams,
): Promise<BillsPageResult> {
  const { from, to } = getBillRange(params.page, params.pageSize);
  const key = buildBillsPageCacheKey(params);
  if (billsPageCache[key] && billsPageCache[key].expiresAt > Date.now())
    return billsPageCache[key].data;

  const search = normalizeBillingSearch(params.search);
  const [searchIds, areaIds] = await Promise.all([
    search
      ? withTimeout(
          findBillingCustomerIds(search, CUSTOMER_SEARCH_LIMIT),
          15_000,
          "Customer search timed out",
        )
      : undefined,
    params.areaId
      ? withTimeout(
          findAreaCustomerIds(params.areaId, 5000),
          15_000,
          "Area filter timed out",
        )
      : undefined,
  ]);

  const customerIds = mergeCustomerIdFilters(searchIds, areaIds);
  if (customerIds?.length === 0) {
    const emptyResult = { rows: [], total: 0 };
    billsPageCache[key] = {
      data: emptyResult,
      expiresAt: Date.now() + CACHE_MS,
    };
    return emptyResult;
  }

  const { data, count } = await runBillSelectWithLegacyFallback((select) => {
    let query = supabase
      .from("bills")
      .select(select, { count: "exact" })
      .eq("month", params.month)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (params.status === "unpaid") query = query.neq("status", "paid");
    else if (params.status === "partial")
      query = query.neq("status", "paid").gt("paid_amount", 0);
    else if (params.status === "visited")
      query = query.eq("payment_method", "visit");
    else if (params.status) query = query.eq("status", params.status);
    if (params.source) query = query.eq("payment_source", params.source);
    if (customerIds) query = query.in("customer_id", customerIds);
    return query;
  });

  const result = {
    rows: (data ?? []) as unknown as BillWithRelations[],
    total: count ?? 0,
  };
  billsPageCache[key] = { data: result, expiresAt: Date.now() + CACHE_MS };
  return result;
}

export async function searchUnpaidBills(
  month: string,
  search?: string,
  limit = 12,
): Promise<BillWithRelations[]> {
  const normalized = normalizeBillingSearch(search);
  if (!normalized) return [];

  const customerIds = await findBillingCustomerIds(
    normalized,
    Math.max(limit * 4, 24),
  );
  if (customerIds.length === 0) return [];

  const { data } = await runBillSelectWithLegacyFallback((select) =>
    supabase
      .from("bills")
      .select(select)
      .eq("month", month)
      .neq("status", "paid")
      .in("customer_id", customerIds)
      .order("created_at", { ascending: false })
      .limit(limit),
  );
  return (data ?? []) as unknown as BillWithRelations[];
}

export async function getBillingSummary(
  month: string,
  areaId?: string,
): Promise<BillingSummary> {
  const key = buildBillingSummaryCacheKey({ month, areaId });
  const cached = billingSummaryCache[key];
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const areaCustomerIds = areaId
    ? await findAreaCustomerIds(areaId, 5000)
    : undefined;
  if (areaCustomerIds?.length === 0) {
    const empty = emptyBillingSummary(month);
    billingSummaryCache[key] = {
      data: empty,
      expiresAt: Date.now() + CACHE_MS,
    };
    return empty;
  }

  const [
    reportsRes,
    totalRes,
    paidRes,
    unpaidRes,
    pendingRes,
    overdueRes,
    overdueRowsRes,
    partialRes,
    visitedRes,
    summaryRowsRes,
  ] = await Promise.all([
    areaCustomerIds
      ? Promise.resolve({ data: null, error: null })
      : supabase.rpc("get_reports_summary", { p_month: month }),
    withCustomerFilter(
      supabase
        .from("bills")
        .select("id", { count: "exact", head: true })
        .eq("month", month),
      areaCustomerIds,
    ),
    withCustomerFilter(
      supabase
        .from("bills")
        .select("id", { count: "exact", head: true })
        .eq("month", month)
        .eq("status", "paid"),
      areaCustomerIds,
    ),
    withCustomerFilter(
      supabase
        .from("bills")
        .select("id", { count: "exact", head: true })
        .eq("month", month)
        .neq("status", "paid"),
      areaCustomerIds,
    ),
    withCustomerFilter(
      supabase
        .from("bills")
        .select("id", { count: "exact", head: true })
        .eq("month", month)
        .eq("status", "pending"),
      areaCustomerIds,
    ),
    withCustomerFilter(
      supabase
        .from("bills")
        .select("id", { count: "exact", head: true })
        .eq("month", month)
        .eq("status", "overdue"),
      areaCustomerIds,
    ),
    withCustomerFilter(
      supabase
        .from("bills")
        .select("amount, paid_amount")
        .eq("month", month)
        .eq("status", "overdue"),
      areaCustomerIds,
    ),
    withCustomerFilter(
      supabase
        .from("bills")
        .select("id", { count: "exact", head: true })
        .eq("month", month)
        .neq("status", "paid")
        .gt("paid_amount", 0),
      areaCustomerIds,
    ),
    withCustomerFilter(
      supabase
        .from("bills")
        .select("id", { count: "exact", head: true })
        .eq("month", month)
        .eq("payment_method", "visit"),
      areaCustomerIds,
    ),
    withCustomerFilter(
      supabase
        .from("bills")
        .select("amount, paid_amount, status, paid_at")
        .eq("month", month),
      areaCustomerIds,
    ),
  ]);

  if (totalRes.error) throw totalRes.error;
  if (paidRes.error) throw paidRes.error;
  if (unpaidRes.error) throw unpaidRes.error;
  if (pendingRes.error) throw pendingRes.error;
  if (overdueRes.error) throw overdueRes.error;
  if (overdueRowsRes.error) throw overdueRowsRes.error;
  if (partialRes.error) throw partialRes.error;
  if (visitedRes.error) throw visitedRes.error;
  if (summaryRowsRes.error) throw summaryRowsRes.error;

  const raw = (!reportsRes.error && reportsRes.data ? reportsRes.data : {}) as {
    month?: unknown;
    cards?: {
      revenue?: unknown;
      collections?: unknown;
      pending?: unknown;
    };
    dailyCollections?: unknown;
  };
  const summary: BillingSummary = {
    month: typeof raw.month === "string" ? raw.month : month,
    totalBills: totalRes.count ?? 0,
    paidBills: paidRes.count ?? 0,
    pendingBills: pendingRes.count ?? 0,
    partialBills: partialRes.count ?? 0,
    unpaidBills: unpaidRes.count ?? 0,
    overdueBills: overdueRes.count ?? 0,
    visitedBills: visitedRes.count ?? 0,
    totalBilled: sumBillAmounts(summaryRowsRes.data, "amount"),
    totalPaid: sumBillAmounts(summaryRowsRes.data, "paid_amount"),
    totalRemaining: sumRemaining(summaryRowsRes.data),
    overdueTotal: (
      (overdueRowsRes.data ?? []) as Array<{
        amount?: unknown;
        paid_amount?: unknown;
      }>
    ).reduce(
      (sum: number, bill) =>
        sum + Math.max(toNumber(bill.amount) - toNumber(bill.paid_amount), 0),
      0,
    ),
    dailyCollections: Array.isArray(raw.dailyCollections)
      ? raw.dailyCollections.map((row) => {
          const point = row as { d?: unknown; v?: unknown };
          return {
            d: typeof point.d === "string" ? point.d : "",
            v: toNumber(point.v),
          };
        })
      : buildDailyCollectionsFromBills(summaryRowsRes.data),
  };
  billingSummaryCache[key] = {
    data: summary,
    expiresAt: Date.now() + CACHE_MS,
  };
  return summary;
}

export async function getBillsByCustomer(customerId: string): Promise<Bill[]> {
  const { data, error } = await supabase
    .from("bills")
    .select("*")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data as Bill[];
}

export async function generateMonthlyBills(
  month: string,
): Promise<GenerateBillsResult> {
  const { data, error } = await supabase.rpc("generate_monthly_bills", {
    p_month: month,
  });
  if (error) throw error;
  clearBillsCache();
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d.created !== "number")
    throw new Error("generate_monthly_bills returned unexpected data");
  return {
    month: typeof d.month === "string" ? d.month : month,
    eligible: typeof d.eligible === "number" ? d.eligible : 0,
    created: d.created,
    existing: typeof d.existing === "number" ? d.existing : 0,
    zeroAmount: typeof d.zeroAmount === "number" ? d.zeroAmount : 0,
  };
}

export async function recordBillPayment(
  input: RecordPaymentInput,
): Promise<RecordPaymentResult> {
  let { data, error } = await supabase.rpc("record_bill_payment", {
    p_bill_id: input.billId,
    p_amount: input.amount,
    p_collected_by: input.collectedBy ?? null,
    p_method: input.method ?? "cash",
    p_source: input.source ?? "office",
    p_paid_at: input.paidAt ?? null,
    p_note: input.note ?? null,
  });
  if (isMissingNewRecordPaymentSignature(error)) {
    const legacy = await supabase.rpc("record_bill_payment", {
      p_bill_id: input.billId,
      p_amount: input.amount,
      p_collected_by: input.collectedBy ?? null,
      p_method: input.method ?? "cash",
      p_note: input.note ?? null,
    });
    data = legacy.data;
    error = legacy.error;
  }
  if (error) throw error;
  clearBillsCache();
  const d = data as Record<string, unknown> | null;
  if (!d || typeof d.receiptNo !== "string")
    throw new Error("record_bill_payment returned unexpected data");
  return {
    billId: typeof d.billId === "string" ? d.billId : input.billId,
    customerId: typeof d.customerId === "string" ? d.customerId : "",
    amountPaid: toNumber(d.amountPaid),
    paidAmount: toNumber(d.paidAmount),
    remainingAmount: toNumber(d.remainingAmount),
    status:
      d.status === "paid" || d.status === "overdue" ? d.status : "pending",
    receiptNo: d.receiptNo,
    paidAt: typeof d.paidAt === "string" ? d.paidAt : new Date().toISOString(),
  };
}

export async function markBillPaid(
  bill: Pick<Bill, "id" | "amount" | "paid_amount">,
  collectedBy?: string | null,
  method: PaymentMethod = "cash",
): Promise<RecordPaymentResult> {
  const remaining = Math.max(bill.amount - (bill.paid_amount ?? 0), 0);
  if (remaining <= 0) throw new Error("Bill is already fully paid");
  return recordBillPayment({
    billId: bill.id,
    amount: remaining,
    collectedBy,
    method,
    source: "office",
    note: null,
  });
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function emptyBillingSummary(month: string): BillingSummary {
  return {
    month,
    totalBills: 0,
    paidBills: 0,
    pendingBills: 0,
    partialBills: 0,
    unpaidBills: 0,
    overdueBills: 0,
    visitedBills: 0,
    totalBilled: 0,
    totalPaid: 0,
    totalRemaining: 0,
    overdueTotal: 0,
    dailyCollections: [],
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withCustomerFilter(query: any, customerIds?: string[]) {
  return customerIds ? query.in("customer_id", customerIds) : query;
}

async function runBillSelectWithLegacyFallback<
  T extends { data: unknown; error: unknown; count?: number | null },
>(run: (select: string) => PromiseLike<T>): Promise<T> {
  const current = await run(BILL_PAGE_SELECT);
  if (!isMissingPaymentSourceColumn(current.error)) {
    if (current.error) throw current.error;
    return current;
  }

  const legacy = await run(BILL_PAGE_SELECT_LEGACY);
  if (legacy.error) throw legacy.error;
  return legacy;
}

function isMissingPaymentSourceColumn(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  return (
    err?.code === "42703" &&
    typeof err.message === "string" &&
    err.message.includes("payment_source")
  );
}

function isMissingNewRecordPaymentSignature(error: unknown): boolean {
  const err = error as { code?: unknown; message?: unknown } | null;
  return (
    err?.code === "PGRST202" ||
    (typeof err?.message === "string" &&
      err.message.includes("record_bill_payment") &&
      err.message.includes("schema cache"))
  );
}

function sumBillAmounts(
  rows: unknown,
  field: "amount" | "paid_amount",
): number {
  return Array.isArray(rows)
    ? rows.reduce(
        (sum, row) => sum + toNumber((row as Record<string, unknown>)[field]),
        0,
      )
    : 0;
}

function sumRemaining(rows: unknown): number {
  if (!Array.isArray(rows)) return 0;
  return rows.reduce((sum, row) => {
    const bill = row as Record<string, unknown>;
    if (bill.status === "paid") return sum;
    return (
      sum + Math.max(toNumber(bill.amount) - toNumber(bill.paid_amount), 0)
    );
  }, 0);
}

function buildDailyCollectionsFromBills(rows: unknown): { d: string; v: number }[] {
  if (!Array.isArray(rows)) return [];
  const byDay = new Map<string, number>();
  rows.forEach((row) => {
    const bill = row as Record<string, unknown>;
    if (bill.status !== "paid") return;
    if (typeof bill.paid_at !== "string") return;
    const date = new Date(bill.paid_at);
    if (Number.isNaN(date.getTime())) return;
    const label = String(date.getDate()).padStart(2, "0");
    byDay.set(label, (byDay.get(label) ?? 0) + toNumber(bill.paid_amount));
  });
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, v]) => ({ d, v }));
}

async function findAreaCustomerIds(
  areaId: string,
  limit: number,
): Promise<string[]> {
  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .eq("area_id", areaId)
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((row) => row.id).filter(Boolean);
}

function mergeCustomerIdFilters(
  a: string[] | undefined,
  b: string[] | undefined,
): string[] | undefined {
  if (a === undefined && b === undefined) return undefined;
  if (a === undefined) return b;
  if (b === undefined) return a;
  const setB = new Set(b);
  return a.filter((id) => setB.has(id));
}

async function findBillingCustomerIds(
  search: string,
  limit: number,
): Promise<string[]> {
  const safeSearch = search.replaceAll(",", " ");
  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .or(
      `full_name.ilike.%${safeSearch}%,customer_code.ilike.%${safeSearch}%,username.ilike.%${safeSearch}%`,
    )
    .order("customer_code")
    .limit(limit);

  if (error) throw error;
  return Array.from(new Set((data ?? []).map((row) => row.id).filter(Boolean)));
}

export type PaymentVerificationWithRelations = {
  id: string;
  bill_id: string;
  customer_id: string;
  amount: number;
  method: string;
  receipt_url: string;
  customer_remarks: string | null;
  status: string;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  customer: {
    customer_code: string;
    full_name: string;
    phone: string;
  } | null;
  bill: {
    month: string;
    amount: number;
    paid_amount: number;
  } | null;
  reviewer?: {
    id: string;
    full_name: string;
  } | null;
};

export async function getPendingPaymentVerifications(): Promise<PaymentVerificationWithRelations[]> {
  return getPaymentVerifications("pending");
}

export async function getPaymentVerifications(
  status: "pending" | "approved" | "rejected",
): Promise<PaymentVerificationWithRelations[]> {
  const { data, error } = await supabase
    .from("payment_verifications")
    .select(`
      id,
      bill_id,
      customer_id,
      amount,
      method,
      receipt_url,
      customer_remarks,
      status,
      review_note,
      reviewed_by,
      reviewed_at,
      created_at,
      customer:customers(customer_code, full_name, phone),
      bill:bills(month, amount, paid_amount),
      reviewer:staff!reviewed_by(id, full_name)
    `)
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as PaymentVerificationWithRelations[];
}

export async function approvePaymentVerification(
  id: string,
  reviewerId: string,
  reviewNote?: string,
): Promise<void> {
  // 1. Fetch verification details
  const { data: verification, error: fetchErr } = await supabase
    .from("payment_verifications")
    .select("*")
    .eq("id", id)
    .single();

  if (fetchErr || !verification) {
    throw new Error(fetchErr?.message || "Payment verification record not found");
  }
  if (verification.status !== "pending") {
    throw new Error("This payment has already been processed");
  }

  // 2. Call recordBillPayment to update ledger and bills table
  const paymentResult = await recordBillPayment({
    billId: verification.bill_id,
    amount: verification.amount,
    collectedBy: reviewerId,
    method: verification.method,
    source: "customer",
    note: reviewNote || "Payment receipt verified by administrator",
  });

  // 3. Update the newly created payment event row with Cloudinary receipt info
  if (paymentResult.receiptNo) {
    await supabase
      .from("payments")
      .update({
        receipt_url: verification.receipt_url,
        customer_remarks: verification.customer_remarks,
      })
      .eq("receipt_no", paymentResult.receiptNo);
  }

  // 4. Update status of the verification queue row
  const { error: updateErr } = await supabase
    .from("payment_verifications")
    .update({
      status: "approved",
      review_note: reviewNote || null,
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateErr) throw updateErr;
}

export async function rejectPaymentVerification(
  id: string,
  reviewerId: string,
  reviewNote?: string,
): Promise<void> {
  const { error } = await supabase
    .from("payment_verifications")
    .update({
      status: "rejected",
      review_note: reviewNote || "Payment receipt rejected during administrative review",
      reviewed_by: reviewerId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw error;
}
