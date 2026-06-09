import { supabase } from "@/lib/supabase";
import { withTimeout } from "@/lib/async/with-timeout";
import {
  buildCustomerBalanceSummary,
  buildPaymentCollectionSummary,
  getCustomerLedgerCollectionStatus,
  normalizeBillingMonth,
  type DerivedBillCollectionStatus,
  type CustomerBalanceSummary,
} from "@/lib/billing/core";
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
  rows: BillingBillRow[];
  total: number;
};

export type BillingBillRow = BillWithRelations & {
  ledger_collection_status?: DerivedBillCollectionStatus;
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
const SUPABASE_PAGE_SIZE = 1000;
const POSTGREST_IN_CHUNK_SIZE = 100;
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
  const ledgerPartialCustomerIds =
    params.status === "partial"
      ? await findLedgerPartialCustomerIdsForMonth(params.month, customerIds)
      : undefined;
  const effectiveCustomerIds =
    params.status === "partial"
      ? mergeCustomerIdFilters(customerIds, ledgerPartialCustomerIds ?? [])
      : customerIds;
  if (effectiveCustomerIds?.length === 0) {
    const emptyResult = { rows: [], total: 0 };
    billsPageCache[key] = {
      data: emptyResult,
      expiresAt: Date.now() + CACHE_MS,
    };
    return emptyResult;
  }
  if (params.status === "partial") {
    const result = await getLedgerPartialBillsPage(params, effectiveCustomerIds ?? []);
    billsPageCache[key] = { data: result, expiresAt: Date.now() + CACHE_MS };
    return result;
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
      query = query.neq("status", "paid");
    else if (params.status === "visited")
      query = query.eq("payment_method", "visit");
    else if (params.status) query = query.eq("status", params.status);
    if (params.source) query = query.eq("payment_source", params.source);
    if (effectiveCustomerIds) query = query.in("customer_id", effectiveCustomerIds);
    return query;
  });

  const baseRows = (data ?? []) as unknown as BillWithRelations[];
  const rows = await withTimeout(
    annotateRowsWithLedgerStatuses(baseRows),
    5_000,
    "Ledger status annotation timed out",
  ).catch(() => baseRows);

  const result = {
    rows,
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

  const { startIso, endIso } = getBillingMonthRange(month);
  const [
    totalRes,
    paidRes,
    unpaidRes,
    pendingRes,
    overdueRes,
    overdueRowsRes,
    partialRes,
    visitedRes,
    summaryRowsRes,
    paymentRowsRes,
  ] = await Promise.all([
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
    withCustomerFilter(
      supabase
        .from("payments")
        .select("amount, paid_at, collected_by")
        .gte("paid_at", startIso)
        .lt("paid_at", endIso),
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
  if (paymentRowsRes.error) throw paymentRowsRes.error;

  const paymentSummary = buildPaymentCollectionSummary(
    (paymentRowsRes.data ?? []) as Array<{
      amount: number | null;
      paid_at: string | null;
      collected_by?: string | null;
    }>,
    month,
  );
  const ledgerPartialBills = await withTimeout(
    countLedgerPartialBillsForMonth(month, areaCustomerIds),
    8_000,
    "Ledger partial count timed out",
  ).catch(() => partialRes.count ?? 0);
  const summary: BillingSummary = {
    month,
    totalBills: totalRes.count ?? 0,
    paidBills: paidRes.count ?? 0,
    pendingBills: pendingRes.count ?? 0,
    partialBills: ledgerPartialBills,
    unpaidBills: unpaidRes.count ?? 0,
    overdueBills: overdueRes.count ?? 0,
    visitedBills: visitedRes.count ?? 0,
    totalBilled: sumBillAmounts(summaryRowsRes.data, "amount"),
    totalPaid: paymentSummary.totalCollected,
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
    dailyCollections: paymentSummary.dailyCollections,
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

export async function getCustomerBalanceSummary(
  customerId: string,
  currentMonth: string,
): Promise<CustomerBalanceSummary> {
  const month = normalizeBillingMonth(currentMonth);
  const { data: rpcData, error: rpcError } = await supabase.rpc(
    "get_customer_balance_summary",
    {
      p_customer_id: customerId,
      p_current_month: month,
    },
  );
  if (!rpcError && rpcData) return normalizeCustomerBalanceSummary(rpcData);

  const { data, error } = await supabase
    .from("bills")
    .select("id, amount, paid_amount, month, status")
    .eq("customer_id", customerId)
    .order("month", { ascending: false });
  if (error) throw error;
  return buildCustomerBalanceSummary(
    (data ?? []) as Array<{
      id: string;
      amount: number;
      paid_amount: number | null;
      month: string;
      status: "pending" | "paid" | "overdue";
    }>,
    month,
  );
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

function normalizeCustomerBalanceSummary(value: unknown): CustomerBalanceSummary {
  const raw = (value ?? {}) as Partial<CustomerBalanceSummary>;
  return {
    currentDue: toNumber(raw.currentDue),
    previousDue: toNumber(raw.previousDue),
    totalOutstanding: toNumber(raw.totalOutstanding),
    totalPaid: toNumber(raw.totalPaid),
    openBillCount: toNumber(raw.openBillCount),
    currentBillId:
      typeof raw.currentBillId === "string" ? raw.currentBillId : null,
  };
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

function getBillingMonthRange(month: string): { startIso: string; endIso: string } {
  const [year, monthNumber] = normalizeBillingMonth(month).split("-").map(Number);
  const start = new Date(Date.UTC(year, monthNumber - 1, 1));
  const end = new Date(Date.UTC(year, monthNumber, 1));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
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

async function findLedgerPartialCustomerIdsForMonth(
  month: string,
  customerIds?: string[],
): Promise<string[]> {
  const paidCustomerIds = await findCustomersWithAnyPaidBill(customerIds);
  if (paidCustomerIds.size === 0) return [];
  const openRows = await fetchOpenBillRowsForMonth<{ customer_id: string }>(
    month,
    { customerIds: Array.from(paidCustomerIds), select: "customer_id" },
  );
  return Array.from(
    new Set((openRows ?? []).map((row) => row.customer_id).filter(Boolean)),
  );
}

async function countLedgerPartialBillsForMonth(
  month: string,
  customerIds?: string[],
): Promise<number> {
  const paidCustomerIds = await findCustomersWithAnyPaidBill(customerIds);
  if (paidCustomerIds.size === 0) return 0;
  const openRows = await fetchOpenBillRowsForMonth<{ customer_id: string }>(
    month,
    { customerIds: Array.from(paidCustomerIds), select: "customer_id" },
  );
  return openRows.length;
}

async function annotateRowsWithLedgerStatuses(
  rows: BillWithRelations[],
): Promise<BillingBillRow[]> {
  const customerIds = Array.from(
    new Set(rows.map((row) => row.customer_id).filter(Boolean)),
  );
  if (customerIds.length === 0) return rows;

  const data = await fetchBillLedgerRowsForCustomers(customerIds);

  const byCustomer = new Map<
    string,
    Array<{
      amount: number;
      paid_amount: number | null;
      status: "pending" | "paid" | "overdue";
    }>
  >();
  (data as Array<{
    customer_id: string;
    amount: number;
    paid_amount: number | null;
    status: "pending" | "paid" | "overdue";
  }>).forEach((bill) => {
    const group = byCustomer.get(bill.customer_id) ?? [];
    group.push(bill);
    byCustomer.set(bill.customer_id, group);
  });

  return rows.map((row) => {
    const customerBills = byCustomer.get(row.customer_id);
    if (!customerBills) return row;
    return {
      ...row,
      ledger_collection_status: getCustomerLedgerCollectionStatus(customerBills),
    };
  });
}

async function getLedgerPartialBillsPage(
  params: BillsPageParams,
  partialCustomerIds: string[],
): Promise<BillsPageResult> {
  if (partialCustomerIds.length === 0) return { rows: [], total: 0 };
  const { from, to } = getBillRange(params.page, params.pageSize);
  const openRows = await fetchOpenBillRowsForMonth<{
    id: string;
    customer_id: string;
    created_at: string | null;
  }>(params.month, {
    customerIds: partialCustomerIds,
    source: params.source,
    select: "id, customer_id, created_at",
  });
  const sortedRows = openRows.sort((a, b) =>
    (b.created_at ?? "").localeCompare(a.created_at ?? ""),
  );
  const pageIds = sortedRows.slice(from, to + 1).map((row) => row.id);
  if (pageIds.length === 0) return { rows: [], total: sortedRows.length };

  const { data } = await runBillSelectWithLegacyFallback((select) =>
    supabase
      .from("bills")
      .select(select)
      .in("id", pageIds)
      .order("created_at", { ascending: false }),
  );
  const baseRows = (data ?? []) as unknown as BillWithRelations[];
  const rows = await withTimeout(
    annotateRowsWithLedgerStatuses(baseRows),
    5_000,
    "Ledger status annotation timed out",
  ).catch(() => baseRows);
  return { rows, total: sortedRows.length };
}

async function fetchOpenBillRowsForMonth<T extends { customer_id: string }>(
  month: string,
  options: {
    customerIds?: string[];
    select: string;
    source?: string;
  },
): Promise<T[]> {
  if (options.customerIds?.length === 0) return [];
  const rows: T[] = [];
  const chunks = options.customerIds
    ? chunkArray(options.customerIds, POSTGREST_IN_CHUNK_SIZE)
    : [undefined];

  for (const chunk of chunks) {
    for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
      let query = supabase
        .from("bills")
        .select(options.select)
        .eq("month", month)
        .neq("status", "paid")
        .range(from, from + SUPABASE_PAGE_SIZE - 1);
      if (options.source) query = query.eq("payment_source", options.source);
      if (chunk) query = query.in("customer_id", chunk);

      const { data, error } = await query;
      if (error) throw error;
      const page = (data ?? []) as unknown as T[];
      rows.push(...page);
      if (page.length < SUPABASE_PAGE_SIZE) break;
    }
  }

  return rows;
}

async function findCustomersWithAnyPaidBill(
  customerIds?: string[],
): Promise<Set<string>> {
  if (customerIds?.length === 0) return new Set();
  if (!customerIds || customerIds.length > 500) {
    const paidCustomerIds = await findAllCustomersWithAnyPaidBill();
    if (!customerIds) return paidCustomerIds;
    const allowedCustomerIds = new Set(customerIds);
    return new Set(
      Array.from(paidCustomerIds).filter((customerId) =>
        allowedCustomerIds.has(customerId),
      ),
    );
  }

  const paidCustomerIds = new Set<string>();
  for (const chunk of chunkArray(customerIds, POSTGREST_IN_CHUNK_SIZE)) {
    for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
      const { data, error } = await supabase
        .from("bills")
        .select("customer_id")
        .gt("paid_amount", 0)
        .in("customer_id", chunk)
        .range(from, from + SUPABASE_PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data ?? []) as Array<{ customer_id: string | null }>;
      page.forEach((row) => {
        if (row.customer_id) paidCustomerIds.add(row.customer_id);
      });
      if (page.length < SUPABASE_PAGE_SIZE) break;
    }
  }
  return paidCustomerIds;
}

async function findAllCustomersWithAnyPaidBill(): Promise<Set<string>> {
  const paidCustomerIds = new Set<string>();
  for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("bills")
      .select("customer_id")
      .gt("paid_amount", 0)
      .range(from, from + SUPABASE_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as Array<{ customer_id: string | null }>;
    page.forEach((row) => {
      if (row.customer_id) paidCustomerIds.add(row.customer_id);
    });
    if (page.length < SUPABASE_PAGE_SIZE) break;
  }
  return paidCustomerIds;
}

async function fetchBillLedgerRowsForCustomers(
  customerIds: string[],
): Promise<
  Array<{
    customer_id: string;
    amount: number;
    paid_amount: number | null;
    status: "pending" | "paid" | "overdue";
  }>
> {
  const rows: Array<{
    customer_id: string;
    amount: number;
    paid_amount: number | null;
    status: "pending" | "paid" | "overdue";
  }> = [];
  for (const chunk of chunkArray(customerIds, POSTGREST_IN_CHUNK_SIZE)) {
    for (let from = 0; ; from += SUPABASE_PAGE_SIZE) {
      const { data, error } = await supabase
        .from("bills")
        .select("customer_id, amount, paid_amount, status")
        .in("customer_id", chunk)
        .range(from, from + SUPABASE_PAGE_SIZE - 1);
      if (error) throw error;
      const page = (data ?? []) as typeof rows;
      rows.push(...page);
      if (page.length < SUPABASE_PAGE_SIZE) break;
    }
  }
  return rows;
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
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
  const searchTerms = buildCustomerSearchTerms(search);
  if (searchTerms.length === 0) return [];
  const filters = searchTerms
    .flatMap((term) => [
      `full_name.ilike.%${term}%`,
      `customer_code.ilike.%${term}%`,
      `username.ilike.%${term}%`,
    ])
    .join(",");
  const { data, error } = await supabase
    .from("customers")
    .select("id")
    .or(filters)
    .order("customer_code")
    .limit(limit);

  if (error) throw error;
  return Array.from(new Set((data ?? []).map((row) => row.id).filter(Boolean)));
}

function buildCustomerSearchTerms(search: string): string[] {
  const raw = search
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const spaced = raw.replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim();
  const compact = raw.replace(/[-_/\s]+/g, "").trim();
  return Array.from(new Set([raw, spaced, compact])).filter(
    (term) => term.length >= 2,
  );
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
  const { error } = await supabase.rpc("approve_payment_verification", {
    p_verification_id: id,
    p_reviewer_id: reviewerId,
    p_review_note: reviewNote ?? null,
  });
  if (error) throw error;
  clearBillsCache();
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

export async function getPaymentVerificationCounts(): Promise<{
  pending: number;
  approved: number;
  rejected: number;
}> {
  const { data, error } = await supabase
    .from("payment_verifications")
    .select("status");

  if (error) throw error;
  
  const counts = { pending: 0, approved: 0, rejected: 0 };
  (data ?? []).forEach((row) => {
    const r = row as { status: string };
    if (r.status === "pending") counts.pending++;
    else if (r.status === "approved") counts.approved++;
    else if (r.status === "rejected") counts.rejected++;
  });
  return counts;
}
