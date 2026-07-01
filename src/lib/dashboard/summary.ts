export type DashboardStatsShape = {
  totalCustomers: number;
  activeCustomers: number;
  unpaidBills: number;
  unpaidInternetBills: number;
  unpaidCableBills: number;
  openComplaints: number;
  monthlyRevenue: number;
  monthlyInternetRevenue: number;
  monthlyCableRevenue: number;
  expectedRevenue: number;
  expectedInternetRevenue: number;
  expectedCableRevenue: number;
  pendingRevenue: number;
  pendingInternetRevenue: number;
  pendingCableRevenue: number;
  activeStaff: number;
  revenueByMonth: { m: string; v: number }[];
  revenueByMonthInternet: { m: string; v: number }[];
  revenueByMonthCable: { m: string; v: number }[];
  complaintsByStatus: { open: number; in_progress: number; resolved: number };
};

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function getDashboardRefreshToken(
  billingVersion: number,
  complaintsVersion: number,
): number {
  return toNumber(billingVersion) + toNumber(complaintsVersion);
}

export function normalizeDashboardStats(input: unknown): DashboardStatsShape {
  const source =
    input && typeof input === "object"
      ? (input as Record<string, unknown>)
      : {};
  const complaintsByStatus =
    source.complaintsByStatus && typeof source.complaintsByStatus === "object"
      ? (source.complaintsByStatus as Record<string, unknown>)
      : {};

  const normalizeMonthSeries = (value: unknown) =>
    Array.isArray(value)
      ? value
          .map((point) => {
            const row =
              point && typeof point === "object"
                ? (point as Record<string, unknown>)
                : {};
            return {
              m: typeof row.m === "string" ? row.m : "",
              v: toNumber(row.v),
            };
          })
          .filter((point) => point.m.length > 0)
      : [];

  const revenueByMonth = normalizeMonthSeries(source.revenueByMonth);
  const revenueByMonthInternet = normalizeMonthSeries(source.revenueByMonthInternet);
  const revenueByMonthCable = normalizeMonthSeries(source.revenueByMonthCable);

  return {
    totalCustomers: toNumber(source.totalCustomers),
    activeCustomers: toNumber(source.activeCustomers),
    unpaidBills: toNumber(source.unpaidBills),
    unpaidInternetBills: toNumber(source.unpaidInternetBills),
    unpaidCableBills: toNumber(source.unpaidCableBills),
    openComplaints: toNumber(source.openComplaints),
    monthlyRevenue: toNumber(source.monthlyRevenue),
    monthlyInternetRevenue: toNumber(source.monthlyInternetRevenue),
    monthlyCableRevenue: toNumber(source.monthlyCableRevenue),
    expectedRevenue: toNumber(source.expectedRevenue),
    expectedInternetRevenue: toNumber(source.expectedInternetRevenue),
    expectedCableRevenue: toNumber(source.expectedCableRevenue),
    pendingRevenue: toNumber(source.pendingRevenue),
    pendingInternetRevenue: toNumber(source.pendingInternetRevenue),
    pendingCableRevenue: toNumber(source.pendingCableRevenue),
    activeStaff: toNumber(source.activeStaff),
    revenueByMonth,
    revenueByMonthInternet,
    revenueByMonthCable,
    complaintsByStatus: {
      open: toNumber(complaintsByStatus.open),
      in_progress: toNumber(complaintsByStatus.in_progress),
      resolved: toNumber(complaintsByStatus.resolved),
    },
  };
}
