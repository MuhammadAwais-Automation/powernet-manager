export type ReportType = 'Revenue' | 'Collections' | 'Complaints' | 'Customers'

export type ReportChartPoint = {
  d: string
  v: number
}

export type ReportSummaryForCharts = {
  revenueMonths: ReportChartPoint[]
  dailyCollections: ReportChartPoint[]
  complaintsMonths: ReportChartPoint[]
  customersMonths: ReportChartPoint[]
}

export type ReportChartConfig = {
  data: ReportChartPoint[]
  accent: string
  unit: string
  label: string
}

export const REPORT_TYPES: ReportType[] = ['Revenue', 'Collections', 'Complaints', 'Customers']

const REPORT_CONFIG: Record<ReportType, Omit<ReportChartConfig, 'data'>> = {
  Revenue: {
    accent: '#3B82F6',
    unit: 'k',
    label: 'Monthly Revenue (Rs. thousands)',
  },
  Collections: {
    accent: '#22C55E',
    unit: 'k',
    label: 'Daily Collections (Rs. thousands)',
  },
  Complaints: {
    accent: '#F59E0B',
    unit: '',
    label: 'Complaints Opened per Month',
  },
  Customers: {
    accent: '#8B5CF6',
    unit: '',
    label: 'Total Customers at month-end',
  },
}

export function normalizeReportMonth(value: string): string {
  const trimmed = value.trim()
  const month = trimmed.slice(0, 7)

  if (!/^\d{4}-\d{2}$/.test(month)) {
    throw new Error('Report month must use YYYY-MM format')
  }

  const monthNumber = Number(month.slice(5, 7))
  if (monthNumber < 1 || monthNumber > 12) {
    throw new Error('Report month must use YYYY-MM format')
  }

  return month
}

export function getCurrentReportMonth(date = new Date()): string {
  return date.toISOString().slice(0, 7)
}

export function toChartThousands(value: number): number {
  return Math.round(value / 1000)
}

export function getReportChart(
  summary: ReportSummaryForCharts,
  report: ReportType
): ReportChartConfig {
  const dataByReport: Record<ReportType, ReportChartPoint[]> = {
    Revenue: summary.revenueMonths,
    Collections: summary.dailyCollections,
    Complaints: summary.complaintsMonths,
    Customers: summary.customersMonths,
  }

  return {
    ...REPORT_CONFIG[report],
    data: dataByReport[report],
  }
}

export function buildCsv(rows: Array<Array<string | number | null | undefined>>): string {
  return rows
    .map(row => row.map(cell => formatCsvCell(cell)).join(','))
    .join('\r\n')
}

function formatCsvCell(value: string | number | null | undefined): string {
  if (value == null) return ''
  const text = String(value)
  if (!/[",\r\n]/.test(text)) return text
  return `"${text.replace(/"/g, '""')}"`
}
