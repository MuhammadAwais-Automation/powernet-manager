export type BillingTab =
  | "All"
  | "Unpaid"
  | "Paid"
  | "Overdue"
  | "Partial"
  | "Visited"
  | "CallToAction";
export type BillStatus = "pending" | "paid" | "overdue";
export type BillStatusFilter =
  | BillStatus
  | "unpaid"
  | "partial"
  | "visited"
  | undefined;
export type BillsPageQuery = {
  month: string;
  page: number;
  pageSize: number;
  status?: BillStatusFilter;
  search?: string;
  areaId?: string;
  source?: string;
};

export type BillingSummaryQuery = {
  month: string;
  areaId?: string;
};

export function getBillRange(
  page: number,
  pageSize: number,
): { from: number; to: number } {
  if (!Number.isInteger(page) || page < 0)
    throw new Error("page must be zero or greater");
  if (!Number.isInteger(pageSize) || pageSize <= 0)
    throw new Error("page size must be greater than zero");

  const from = page * pageSize;
  return { from, to: from + pageSize - 1 };
}

export function normalizeBillStatusFilter(tab: BillingTab): BillStatusFilter {
  if (tab === "Paid") return "paid";
  if (tab === "Overdue") return "overdue";
  if (tab === "Unpaid") return "unpaid";
  if (tab === "Partial") return "partial";
  if (tab === "Visited") return "visited";
  if (tab === "CallToAction") return "visited";
  return undefined;
}

export function normalizeBillingSearch(search?: string): string | undefined {
  const normalized = search
    ?.trim()
    .replace(/[,%()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return normalized && normalized.length >= 2 ? normalized : undefined;
}

export function buildBillsPageCacheKey(params: BillsPageQuery): string {
  const { from, to } = getBillRange(params.page, params.pageSize);
  return JSON.stringify({
    month: params.month,
    page: params.page,
    pageSize: params.pageSize,
    status: params.status,
    search: normalizeBillingSearch(params.search),
    areaId: params.areaId,
    source: params.source,
    from,
    to,
  });
}

export function buildBillingSummaryCacheKey(
  params: BillingSummaryQuery,
): string {
  const areaId = params.areaId?.trim();
  return JSON.stringify({
    month: params.month,
    ...(areaId ? { areaId } : {}),
  });
}
