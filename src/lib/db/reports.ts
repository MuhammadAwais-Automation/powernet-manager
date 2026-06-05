import { supabase } from '@/lib/supabase'
import type { ReportChartPoint } from '@/lib/reports/core'
import { normalizeReportMonth } from '@/lib/reports/core'

export type ReportCards = {
  revenue: number
  collections: number
  pending: number
  complaints: number
  customers: number
}

export type AgentCollectionReport = {
  name: string
  area: string
  payments: number
  collected: number
  pending: number
  collectionRate: number
}

export type ReportsSummary = {
  month: string
  cards: ReportCards
  revenueMonths: ReportChartPoint[]
  dailyCollections: ReportChartPoint[]
  complaintsMonths: ReportChartPoint[]
  customersMonths: ReportChartPoint[]
  agentCollections: AgentCollectionReport[]
}

let reportsCache: Record<string, { data: ReportsSummary; expiresAt: number }> = {}
const CACHE_MS = 60_000

export function clearReportsCache() {
  reportsCache = {}
}

export async function getReportsSummary(month: string): Promise<ReportsSummary> {
  const reportMonth = normalizeReportMonth(month)
  const cached = reportsCache[reportMonth]
  if (cached && cached.expiresAt > Date.now()) return cached.data

  const { data, error } = await supabase.rpc('get_reports_summary', { p_month: reportMonth })
  if (error) throw error

  const summary = normalizeReportsSummary(data, reportMonth)
  reportsCache[reportMonth] = { data: summary, expiresAt: Date.now() + CACHE_MS }
  return summary
}

function normalizeReportsSummary(value: unknown, fallbackMonth: string): ReportsSummary {
  const raw = (value ?? {}) as Partial<ReportsSummary>

  return {
    month: typeof raw.month === 'string' ? raw.month : fallbackMonth,
    cards: normalizeCards(raw.cards),
    revenueMonths: normalizeChart(raw.revenueMonths),
    dailyCollections: normalizeChart(raw.dailyCollections),
    complaintsMonths: normalizeChart(raw.complaintsMonths),
    customersMonths: normalizeChart(raw.customersMonths),
    agentCollections: Array.isArray(raw.agentCollections)
      ? raw.agentCollections.map(normalizeAgentCollection)
      : [],
  }
}

function normalizeCards(value: unknown): ReportCards {
  const raw = (value ?? {}) as Partial<ReportCards>
  return {
    revenue: toNumber(raw.revenue),
    collections: toNumber(raw.collections),
    pending: toNumber(raw.pending),
    complaints: toNumber(raw.complaints),
    customers: toNumber(raw.customers),
  }
}

function normalizeChart(value: unknown): ReportChartPoint[] {
  if (!Array.isArray(value)) return []
  return value.map(row => {
    const raw = row as Partial<ReportChartPoint>
    return {
      d: typeof raw.d === 'string' ? raw.d : '',
      v: toNumber(raw.v),
    }
  })
}

function normalizeAgentCollection(value: unknown): AgentCollectionReport {
  const raw = (value ?? {}) as Partial<AgentCollectionReport>
  return {
    name: typeof raw.name === 'string' ? raw.name : 'Unknown',
    area: typeof raw.area === 'string' ? raw.area : 'No area',
    payments: toNumber(raw.payments),
    collected: toNumber(raw.collected),
    pending: toNumber(raw.pending),
    collectionRate: toNumber(raw.collectionRate),
  }
}

function toNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}
