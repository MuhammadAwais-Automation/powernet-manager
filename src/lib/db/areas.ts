import { supabase } from "@/lib/supabase";
import type { Area } from "@/types/database";
import {
  normalizeServiceType,
  type ServiceType,
} from "@/lib/reports/core";

let areasCache: { data: Area[]; expiresAt: number } | null = null;
let areaCountsCache: {
  data: Record<string, number>;
  expiresAt: number;
} | null = null;
let areaFinancialCache: {
  data: Record<string, AreaFinancialSummary>;
  expiresAt: number;
  month: string;
  serviceType: ServiceType;
} | null = null;
const CACHE_MS = 60_000;

export type AreaFinancialSummary = {
  areaId: string;
  customerCount: number;
  staffCount: number;
  expectedRevenue: number;
  receivedRevenue: number;
  pendingRevenue: number;
};

function clearAreaCaches() {
  areasCache = null;
  areaCountsCache = null;
  areaFinancialCache = null;
}

export async function getAreaFinancialSummaries(
  month: string,
  serviceType: ServiceType = "both",
): Promise<Record<string, AreaFinancialSummary>> {
  const scopeService = normalizeServiceType(serviceType);
  if (
    areaFinancialCache &&
    areaFinancialCache.month === month &&
    areaFinancialCache.serviceType === scopeService &&
    areaFinancialCache.expiresAt > Date.now()
  ) {
    return areaFinancialCache.data;
  }

  const { data, error } = await supabase.rpc("get_area_financial_summaries", {
    p_month: month,
    p_service_type: scopeService,
  });
  if (error) {
    const fallback = await getAreaFinancialSummariesFallback(month, scopeService);
    areaFinancialCache = {
      data: fallback,
      month,
      serviceType: scopeService,
      expiresAt: Date.now() + CACHE_MS,
    };
    return fallback;
  }

  const summaries = (data ?? []).reduce(
    (
      acc: Record<string, AreaFinancialSummary>,
      row: Record<string, unknown>,
    ) => {
      const areaId = typeof row.area_id === "string" ? row.area_id : "";
      if (!areaId) return acc;
      acc[areaId] = {
        areaId,
        customerCount: toNumber(row.customer_count),
        staffCount: toNumber(row.staff_count),
        expectedRevenue: toNumber(row.expected_revenue),
        receivedRevenue: toNumber(row.received_revenue),
        pendingRevenue: toNumber(row.pending_revenue),
      };
      return acc;
    },
    {},
  );

  areaFinancialCache = {
    data: summaries,
    month,
    serviceType: scopeService,
    expiresAt: Date.now() + CACHE_MS,
  };
  return summaries;
}

async function getAreaFinancialSummariesFallback(
  month: string,
  serviceType: ServiceType = "both",
): Promise<Record<string, AreaFinancialSummary>> {
  const includeInternet = serviceType === "internet" || serviceType === "both";
  const includeCable = serviceType === "cable" || serviceType === "both";

  const [customerRows, billRows, cableBillRows, cableSettings, staffRows] =
    await Promise.all([
      fetchAllRows<{
        area_id: string | null;
        due_amount: number | null;
        status: string | null;
        has_internet: boolean | null;
        has_cable: boolean | null;
        package: { default_price: number | null } | null;
      }>(
        "customers",
        "area_id, due_amount, status, has_internet, has_cable, package:packages(default_price)",
      ),
      includeInternet
        ? fetchAllRows<{
            amount: number | null;
            paid_amount: number | null;
            status: string | null;
            customer: { area_id: string | null } | null;
          }>("bills", "amount, paid_amount, status, customer:customers(area_id)", {
            month,
          })
        : Promise.resolve([]),
      includeCable
        ? fetchAllRows<{
            amount: number | null;
            paid_amount: number | null;
            status: string | null;
            customer: { area_id: string | null } | null;
          }>(
            "cable_bills",
            "amount, paid_amount, status, customer:customers(area_id)",
            { month },
          )
        : Promise.resolve([]),
      includeCable
        ? supabase.from("cable_settings").select("monthly_price").eq("id", 1).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      fetchAllRows<{
        area_id: string | null;
        area_ids: string[] | null;
        is_active: boolean | null;
      }>("staff", "area_id, area_ids, is_active"),
    ]);

  const cablePrice = toNumber(
    (cableSettings.data as { monthly_price?: number } | null)?.monthly_price,
  );

  const summaries: Record<string, AreaFinancialSummary> = {};
  const ensure = (areaId: string): AreaFinancialSummary => {
    summaries[areaId] ??= {
      areaId,
      customerCount: 0,
      staffCount: 0,
      expectedRevenue: 0,
      receivedRevenue: 0,
      pendingRevenue: 0,
    };
    return summaries[areaId];
  };

  customerRows.forEach((customer) => {
    if (!customer.area_id || customer.status !== "active") return;
    const summary = ensure(customer.area_id);
    const internetAmount = toNumber(
      customer.due_amount ?? customer.package?.default_price ?? 0,
    );
    const countsTowardInternet =
      includeInternet && customer.has_internet === true && internetAmount > 0;
    const countsTowardCable =
      includeCable && customer.has_cable === true && cablePrice > 0;

    if (countsTowardInternet || countsTowardCable) {
      summary.customerCount += 1;
    }
    if (countsTowardInternet) {
      summary.expectedRevenue += internetAmount;
    }
    if (countsTowardCable) {
      summary.expectedRevenue += cablePrice;
    }
  });

  billRows.forEach((bill) => {
    const areaId = bill.customer?.area_id;
    if (!areaId) return;
    const summary = ensure(areaId);
    const paid = toNumber(bill.paid_amount);
    summary.receivedRevenue += paid;
    if (bill.status !== "paid") {
      summary.pendingRevenue += Math.max(toNumber(bill.amount) - paid, 0);
    }
  });

  cableBillRows.forEach((bill) => {
    const areaId = bill.customer?.area_id;
    if (!areaId) return;
    const summary = ensure(areaId);
    const paid = toNumber(bill.paid_amount);
    summary.receivedRevenue += paid;
    if (bill.status !== "paid") {
      summary.pendingRevenue += Math.max(toNumber(bill.amount) - paid, 0);
    }
  });

  staffRows.forEach((staff) => {
    if (staff.is_active === false) return;
    const areaIds = new Set<string>();
    if (staff.area_id) areaIds.add(staff.area_id);
    (staff.area_ids ?? []).forEach((id) => {
      if (id) areaIds.add(id);
    });
    areaIds.forEach((areaId) => {
      ensure(areaId).staffCount += 1;
    });
  });

  return summaries;
}

export async function getAreas(): Promise<Area[]> {
  if (areasCache && areasCache.expiresAt > Date.now()) return areasCache.data;

  const { data, error } = await supabase
    .from("areas")
    .select("*")
    .eq("is_active", true)
    .order("type")
    .order("name");
  if (error) throw error;
  const areas = data as Area[];
  areasCache = { data: areas, expiresAt: Date.now() + CACHE_MS };
  return areas;
}

export async function getAreaById(id: string): Promise<Area | null> {
  const { data, error } = await supabase
    .from("areas")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return null;
  return data as Area;
}

export async function createArea(input: {
  name: string;
  code: string;
  type: "garrison" | "civilian";
  is_active: boolean;
}): Promise<Area> {
  const { data, error } = await supabase
    .from("areas")
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  clearAreaCaches();
  return data as Area;
}

export async function updateArea(
  id: string,
  input: Partial<{
    name: string;
    code: string;
    type: "garrison" | "civilian";
    is_active: boolean;
  }>,
): Promise<Area> {
  const { data, error } = await supabase
    .from("areas")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  clearAreaCaches();
  return data as Area;
}

export async function getAreaCustomerCounts(): Promise<Record<string, number>> {
  if (areaCountsCache && areaCountsCache.expiresAt > Date.now())
    return areaCountsCache.data;

  const { data, error } = await supabase.rpc("get_area_customer_counts");
  if (error) {
    // fallback: batch fetch
    const BATCH = 1000;
    let all: { area_id: string }[] = [];
    let from = 0;
    while (true) {
      const { data: batch, error: bErr } = await supabase
        .from("customers")
        .select("area_id")
        .range(from, from + BATCH - 1);
      if (bErr || !batch || batch.length === 0) break;
      all = all.concat(batch as { area_id: string }[]);
      if (batch.length < BATCH) break;
      from += BATCH;
    }
    const counts = all.reduce(
      (acc, c) => {
        if (c.area_id) acc[c.area_id] = (acc[c.area_id] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>,
    );
    areaCountsCache = { data: counts, expiresAt: Date.now() + CACHE_MS };
    return counts;
  }
  const counts = (data ?? []).reduce(
    (acc: Record<string, number>, row: { area_id: string; count: number }) => {
      acc[row.area_id] = row.count;
      return acc;
    },
    {},
  );
  areaCountsCache = { data: counts, expiresAt: Date.now() + CACHE_MS };
  return counts;
}

function toNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function fetchAllRows<T extends Record<string, unknown>>(
  table: "customers" | "bills" | "cable_bills" | "staff",
  select: string,
  filters?: { month?: string },
): Promise<T[]> {
  const rows: T[] = [];
  const batchSize = 1000;
  let from = 0;

  while (true) {
    let query = supabase
      .from(table)
      .select(select)
      .range(from, from + batchSize - 1);
    if (filters?.month && (table === "bills" || table === "cable_bills")) {
      query = query.eq("month", filters.month);
    }

    const { data, error } = await query;
    if (error) throw error;
    const batch = (data ?? []) as unknown as T[];
    rows.push(...batch);
    if (batch.length < batchSize) break;
    from += batchSize;
  }

  return rows;
}
