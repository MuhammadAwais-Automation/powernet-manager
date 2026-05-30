export type DashboardStatsShape = {
  totalCustomers: number;
  activeCustomers: number;
  unpaidBills: number;
  openComplaints: number;
  monthlyRevenue: number;
  expectedRevenue: number;
  pendingRevenue: number;
  activeStaff: number;
  revenueByMonth: { m: string; v: number }[];
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

  const revenueByMonth = Array.isArray(source.revenueByMonth)
    ? source.revenueByMonth
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

  return {
    totalCustomers: toNumber(source.totalCustomers),
    activeCustomers: toNumber(source.activeCustomers),
    unpaidBills: toNumber(source.unpaidBills),
    openComplaints: toNumber(source.openComplaints),
    monthlyRevenue: toNumber(source.monthlyRevenue),
    expectedRevenue: toNumber(source.expectedRevenue),
    pendingRevenue: toNumber(source.pendingRevenue),
    activeStaff: toNumber(source.activeStaff),
    revenueByMonth,
    complaintsByStatus: {
      open: toNumber(complaintsByStatus.open),
      in_progress: toNumber(complaintsByStatus.in_progress),
      resolved: toNumber(complaintsByStatus.resolved),
    },
  };
}
