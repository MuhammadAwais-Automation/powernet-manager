import { supabase } from "@/lib/supabase";
import type { ReportChartPoint } from "@/lib/reports/core";
import {
  normalizeAreaFilter,
  normalizeCurrencyChartForThousands,
  normalizeReportMonth,
  toChartThousands,
} from "@/lib/reports/core";

export type ReportCards = {
  revenue: number;
  collections: number;
  pending: number;
  complaints: number;
  customers: number;
  growth: number;
};

export type AgentCollectionReport = {
  name: string;
  area: string;
  payments: number;
  collected: number;
  pending: number;
  collectionRate: number;
};

export type ReportsSummary = {
  month: string;
  cards: ReportCards;
  revenueMonths: ReportChartPoint[];
  dailyCollections: ReportChartPoint[];
  complaintsMonths: ReportChartPoint[];
  customersMonths: ReportChartPoint[];
  customerGrowthMonths: ReportChartPoint[];
  agentCollections: AgentCollectionReport[];
};

let reportsCache: Record<string, { data: ReportsSummary; expiresAt: number }> =
  {};
const CACHE_MS = 60_000;

export function clearReportsCache() {
  reportsCache = {};
}

export async function getReportsSummary(
  month: string,
  areaId?: string,
): Promise<ReportsSummary> {
  const reportMonth = normalizeReportMonth(month);
  const scopeArea = normalizeAreaFilter(areaId);
  const key = JSON.stringify({ month: reportMonth, areaId: scopeArea });
  const cached = reportsCache[key];
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  const { data, error } = await supabase.rpc("get_reports_summary", {
    p_month: reportMonth,
    p_area_id: scopeArea ?? null,
  });

  const summary = error
    ? await getReportsSummaryFallback(reportMonth, scopeArea)
    : normalizeReportsSummary(data, reportMonth);
  reportsCache[key] = { data: summary, expiresAt: Date.now() + CACHE_MS };
  return summary;
}

async function getReportsSummaryFallback(
  reportMonth: string,
  areaId?: string,
): Promise<ReportsSummary> {
  const months = getRecentMonths(reportMonth, 6);
  const [billRows, paymentRows, complaintRows, customerRows] = await Promise.all([
    fetchAllRows<BillReportRow>(
      "bills",
      "amount, paid_amount, status, paid_at, month, collected_by, customer:customers(area_id, area:areas(name)), collector:staff(full_name)",
    ),
    fetchAllRows<PaymentReportRow>(
      "payments",
      "amount, paid_at, collected_by, customer:customers(area_id, area:areas(name)), collector:staff(full_name)",
    ),
    fetchAllRows<ComplaintReportRow>(
      "complaints",
      "status, opened_at, resolved_at, customer:customers(area_id)",
    ),
    fetchAllRows<CustomerReportRow>("customers", "id, area_id, status, created_at"),
  ]);

  const scopedBills = billRows.filter(
    (bill) =>
      bill.month === reportMonth &&
      (!areaId || bill.customer?.area_id === areaId),
  );
  const scopedPayments = paymentRows.filter(
    (payment) =>
      getMonth(payment.paid_at) === reportMonth &&
      (!areaId || payment.customer?.area_id === areaId),
  );
  const scopedComplaints = complaintRows.filter(
    (complaint) =>
      getMonth(complaint.opened_at) === reportMonth &&
      (!areaId || complaint.customer?.area_id === areaId),
  );
  const scopedCustomers = customerRows.filter(
    (customer) => !areaId || customer.area_id === areaId,
  );

  const revenue = scopedBills.reduce((sum, bill) => sum + toNumber(bill.amount), 0);
  const collections = scopedPayments.reduce(
    (sum, payment) => sum + toNumber(payment.amount),
    0,
  );
  const pending = scopedBills.reduce((sum, bill) => {
    if (bill.status === "paid") return sum;
    return sum + Math.max(toNumber(bill.amount) - toNumber(bill.paid_amount), 0);
  }, 0);
  const customers = scopedCustomers.filter((customer) => customer.status !== "disconnected").length;
  const newCustomers = scopedCustomers.filter(
    (customer) => getMonth(customer.created_at) === reportMonth,
  ).length;
  const disconnectedCustomers = scopedCustomers.filter(
    (customer) =>
      customer.status === "disconnected" && getMonth(customer.created_at) === reportMonth,
  ).length;

  const revenueMonths = months.map((month) => ({
    d: monthLabel(month),
    v: billRows
      .filter((bill) => bill.month === month && (!areaId || bill.customer?.area_id === areaId))
      .reduce((sum, bill) => sum + toNumber(bill.amount), 0),
  }));

  return {
    month: reportMonth,
    cards: {
      revenue,
      collections,
      pending,
      complaints: scopedComplaints.length,
      customers,
      growth: newCustomers - disconnectedCustomers,
    },
    revenueMonths: revenueMonths.map((point) => ({
      ...point,
      v: toChartThousands(point.v),
    })),
    dailyCollections: buildDailyCollections(scopedPayments).map((point) => ({
      ...point,
      v: toChartThousands(point.v),
    })),
    complaintsMonths: months.map((month) => ({
      d: monthLabel(month),
      v: complaintRows.filter(
        (complaint) =>
          getMonth(complaint.opened_at) === month &&
          (!areaId || complaint.customer?.area_id === areaId),
      ).length,
    })),
    customersMonths: months.map((month) => ({
      d: monthLabel(month),
      v: customerRows.filter(
        (customer) =>
          getMonth(customer.created_at) <= month &&
          customer.status !== "disconnected" &&
          (!areaId || customer.area_id === areaId),
      ).length,
    })),
    customerGrowthMonths: months.map((month) => {
      const created = customerRows.filter(
        (customer) =>
          getMonth(customer.created_at) === month &&
          (!areaId || customer.area_id === areaId),
      ).length;
      const disconnected = customerRows.filter(
        (customer) =>
          customer.status === "disconnected" &&
          getMonth(customer.created_at) === month &&
          (!areaId || customer.area_id === areaId),
      ).length;
      return { d: monthLabel(month), v: created - disconnected };
    }),
    agentCollections: buildAgentCollections(scopedPayments, scopedBills),
  };
}

function normalizeReportsSummary(
  value: unknown,
  fallbackMonth: string,
): ReportsSummary {
  const raw = (value ?? {}) as Partial<ReportsSummary>;
  const cards = normalizeCards(raw.cards);

  return {
    month: typeof raw.month === "string" ? raw.month : fallbackMonth,
    cards,
    revenueMonths: normalizeCurrencyChartForThousands(
      normalizeChart(raw.revenueMonths),
      cards.revenue,
    ),
    dailyCollections: normalizeCurrencyChartForThousands(
      normalizeChart(raw.dailyCollections),
      cards.collections,
    ),
    complaintsMonths: normalizeChart(raw.complaintsMonths),
    customersMonths: normalizeChart(raw.customersMonths),
    customerGrowthMonths: normalizeChart(raw.customerGrowthMonths),
    agentCollections: Array.isArray(raw.agentCollections)
      ? raw.agentCollections.map(normalizeAgentCollection)
      : [],
  };
}

function normalizeCards(value: unknown): ReportCards {
  const raw = (value ?? {}) as Partial<ReportCards>;
  return {
    revenue: toNumber(raw.revenue),
    collections: toNumber(raw.collections),
    pending: toNumber(raw.pending),
    complaints: toNumber(raw.complaints),
    customers: toNumber(raw.customers),
    growth: toNumber(raw.growth),
  };
}

function normalizeChart(value: unknown): ReportChartPoint[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    const raw = row as Partial<ReportChartPoint>;
    return {
      d: typeof raw.d === "string" ? raw.d : "",
      v: toNumber(raw.v),
    };
  });
}

function normalizeAgentCollection(value: unknown): AgentCollectionReport {
  const raw = (value ?? {}) as Partial<AgentCollectionReport>;
  return {
    name: typeof raw.name === "string" ? raw.name : "Unknown",
    area: typeof raw.area === "string" ? raw.area : "No area",
    payments: toNumber(raw.payments),
    collected: toNumber(raw.collected),
    pending: toNumber(raw.pending),
    collectionRate: toNumber(raw.collectionRate),
  };
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

type BillReportRow = {
  amount: number | null;
  paid_amount: number | null;
  status: string | null;
  paid_at: string | null;
  month: string | null;
  collected_by: string | null;
  customer: { area_id: string | null; area?: { name: string | null } | null } | null;
  collector: { full_name: string | null } | null;
};

type PaymentReportRow = {
  amount: number | null;
  paid_at: string | null;
  collected_by: string | null;
  customer: { area_id: string | null; area?: { name: string | null } | null } | null;
  collector: { full_name: string | null } | null;
};

type ComplaintReportRow = {
  status: string | null;
  opened_at: string | null;
  resolved_at: string | null;
  customer: { area_id: string | null } | null;
};

type CustomerReportRow = {
  id: string;
  area_id: string | null;
  status: string | null;
  created_at: string | null;
};

async function fetchAllRows<T extends Record<string, unknown>>(
  table: "bills" | "payments" | "complaints" | "customers",
  select: string,
): Promise<T[]> {
  const rows: T[] = [];
  const batchSize = 1000;
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from(table)
      .select(select)
      .range(from, from + batchSize - 1);
    if (error) throw error;
    const batch = (data ?? []) as unknown as T[];
    rows.push(...batch);
    if (batch.length < batchSize) break;
    from += batchSize;
  }

  return rows;
}

function buildDailyCollections(payments: PaymentReportRow[]): ReportChartPoint[] {
  const byDay = new Map<string, number>();
  payments.forEach((payment) => {
    if (toNumber(payment.amount) <= 0 || !payment.paid_at) return;
    const date = new Date(payment.paid_at);
    if (Number.isNaN(date.getTime())) return;
    const day = String(date.getDate()).padStart(2, "0");
    byDay.set(day, (byDay.get(day) ?? 0) + toNumber(payment.amount));
  });
  return Array.from(byDay.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([d, v]) => ({ d, v }));
}

function buildAgentCollections(
  payments: PaymentReportRow[],
  bills: BillReportRow[],
): AgentCollectionReport[] {
  const byAgent = new Map<string, AgentCollectionReport>();
  payments.forEach((payment) => {
    const key = payment.collected_by ?? "__unassigned__";
    const existing = byAgent.get(key) ?? {
      name: payment.collector?.full_name ?? "Unassigned / Manual",
      area: payment.customer?.area?.name ?? "No area",
      payments: 0,
      collected: 0,
      pending: 0,
      collectionRate: 0,
    };
    existing.payments += 1;
    existing.collected += toNumber(payment.amount);
    byAgent.set(key, existing);
  });

  bills.forEach((bill) => {
    if (bill.status === "paid") return;
    const pending = Math.max(toNumber(bill.amount) - toNumber(bill.paid_amount), 0);
    if (pending <= 0) return;
    const key = bill.collected_by ?? "__unassigned__";
    const existing = byAgent.get(key) ?? {
      name: bill.collector?.full_name ?? "Unassigned / Manual",
      area: bill.customer?.area?.name ?? "No area",
      payments: 0,
      collected: 0,
      pending: 0,
      collectionRate: 0,
    };
    existing.pending += pending;
    byAgent.set(key, existing);
  });

  return Array.from(byAgent.values()).map((agent) => ({
    ...agent,
    collectionRate:
      agent.collected + agent.pending <= 0
        ? 0
        : Math.round((agent.collected / (agent.collected + agent.pending)) * 100),
  }));
}

function getRecentMonths(month: string, count: number): string[] {
  const [year, monthNumber] = normalizeReportMonth(month).split("-").map(Number);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(year, monthNumber - count + index, 1));
    return date.toISOString().slice(0, 7);
  });
}

function getMonth(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleString("en", {
    month: "short",
  });
}

export type AreaConnectionStats = {
  areaId: string;
  areaName: string;
  totalConnections: number;
  activeConnections: number;
  inactiveConnections: number;
};

export async function getAreaConnectionStats(): Promise<AreaConnectionStats[]> {
  const { data, error } = await supabase.rpc("get_area_connection_stats");
  if (error) {
    console.warn("RPC get_area_connection_stats failed, using fallback:", error);
    return getAreaConnectionStatsFallback();
  }
  return (data as Array<{
    area_id: string;
    area_name: string;
    total_connections: number;
    active_connections: number;
    inactive_connections: number;
  }> ?? []).map((row) => ({
    areaId: row.area_id,
    areaName: row.area_name,
    totalConnections: toNumber(row.total_connections),
    activeConnections: toNumber(row.active_connections),
    inactiveConnections: toNumber(row.inactive_connections),
  }));
}

async function getAreaConnectionStatsFallback(): Promise<AreaConnectionStats[]> {
  const [areas, customers] = await Promise.all([
    supabase.from("areas").select("id, name").eq("is_active", true),
    fetchAllRows<CustomerReportRow>("customers", "id, area_id, status"),
  ]);

  if (areas.error) throw areas.error;

  const areaList = (areas.data as Array<{ id: string; name: string }>) ?? [];
  const customerList = customers ?? [];

  return areaList.map((area) => {
    const areaCustomers = customerList.filter((c) => c.area_id === area.id);
    const active = areaCustomers.filter((c) => c.status === "active" || c.status === "free").length;
    const inactive = areaCustomers.length - active;

    return {
      areaId: area.id,
      areaName: area.name,
      totalConnections: areaCustomers.length,
      activeConnections: active,
      inactiveConnections: inactive,
    };
  }).sort((a, b) => a.areaName.localeCompare(b.areaName));
}

