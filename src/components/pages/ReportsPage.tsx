'use client';
import React, { useEffect, useState } from 'react';
import Icon, { type IconName } from '../Icon';
import { Avatar, IconBadge, Tabs } from '../ui';
import { BarChart } from '../charts';
import { getReportsSummary, type AgentCollectionReport, type ReportsSummary } from '@/lib/db/reports';
import {
  REPORT_TYPES,
  buildCsv,
  getCurrentReportMonth,
  getReportChart,
  normalizeReportMonth,
  type ReportType,
} from '@/lib/reports/core';

type Period = 'This Month' | 'Last Month' | 'Custom';

const PERIODS: { value: Period; label: string }[] = [
  { value: 'This Month', label: 'This Month' },
  { value: 'Last Month', label: 'Last Month' },
  { value: 'Custom', label: 'Custom' },
];

function previousMonth(month: string): string {
  const [year, monthNumber] = normalizeReportMonth(month).split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 2, 1));
  return date.toISOString().slice(0, 7);
}

function fmtCurrency(value: number): string {
  return `Rs. ${value.toLocaleString()}`;
}

function fmtValue(report: ReportType, value: number): string {
  return report === 'Revenue' || report === 'Collections'
    ? fmtCurrency(value)
    : value.toLocaleString();
}

function totalForReport(summary: ReportsSummary, report: ReportType): number {
  if (report === 'Revenue') return summary.cards.revenue;
  if (report === 'Collections') return summary.cards.collections;
  if (report === 'Complaints') return summary.cards.complaints;
  return summary.cards.customers;
}

function safeRate(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function buildReportRows(summary: ReportsSummary, report: ReportType) {
  const chart = getReportChart(summary, report);

  return [
    ['PowerNet Manager Report'],
    ['Month', summary.month],
    ['Report', report],
    [],
    ['Metric', 'Value'],
    ['Total billed revenue', summary.cards.revenue],
    ['Collected payments', summary.cards.collections],
    ['Pending receivables', summary.cards.pending],
    ['Complaints opened', summary.cards.complaints],
    ['Customers at month-end', summary.cards.customers],
    [],
    [chart.label],
    ['Label', 'Value'],
    ...chart.data.map(point => [point.d, point.v]),
    [],
    ['Agent-wise Collection Breakdown'],
    ['Agent', 'Area', 'Payments', 'Collected', 'Pending', 'Collection Rate %'],
    ...summary.agentCollections.map(agent => [
      agent.name,
      agent.area,
      agent.payments,
      agent.collected,
      agent.pending,
      agent.collectionRate,
    ]),
  ];
}

function AgentRow({ agent }: { agent: AgentCollectionReport }) {
  const rate = safeRate(agent.collectionRate);

  return (
    <tr>
      <td><div className="cell-user"><Avatar name={agent.name} size={28} /><div className="nm">{agent.name}</div></div></td>
      <td>{agent.area}</td>
      <td className="num">{agent.payments}</td>
      <td className="num" style={{ fontWeight: 600 }}>{fmtCurrency(agent.collected)}</td>
      <td className="num" style={{ color: agent.pending > 0 ? 'var(--amber)' : 'var(--green)' }}>{fmtCurrency(agent.pending)}</td>
      <td>
        <div className="row gap-sm" style={{ minWidth: 140 }}>
          <div className="progress" style={{ flex: 1 }}>
            <span style={{ width: `${rate}%`, background: rate > 85 ? 'var(--green)' : rate > 70 ? 'var(--blue)' : 'var(--amber)' }} />
          </div>
          <span className="num" style={{ fontSize: 12, fontWeight: 600, minWidth: 32 }}>{rate}%</span>
        </div>
      </td>
    </tr>
  );
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<Period>('This Month');
  const [report, setReport] = useState<ReportType>('Revenue');
  const [reportMonth, setReportMonth] = useState(getCurrentReportMonth());
  const [summary, setSummary] = useState<ReportsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;

    async function loadReports() {
      setLoading(true);
      setError(null);
      setSummary(null);
      try {
        const data = await getReportsSummary(reportMonth);
        if (active) setSummary(data);
      } catch (e: unknown) {
        if (active) setError(e instanceof Error ? e.message : 'Could not load reports');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadReports();
    return () => { active = false; };
  }, [reportMonth, reloadToken]);

  const handlePeriodChange = (value: string) => {
    const nextPeriod = value as Period;
    setPeriod(nextPeriod);

    if (nextPeriod === 'This Month') setReportMonth(getCurrentReportMonth());
    if (nextPeriod === 'Last Month') setReportMonth(previousMonth(getCurrentReportMonth()));
  };

  const handleReportChange = (value: string) => {
    if (REPORT_TYPES.includes(value as ReportType)) setReport(value as ReportType);
  };

  const handleMonthChange = (value: string) => {
    setPeriod('Custom');
    setReportMonth(value);
  };

  const handleExportCsv = () => {
    if (!summary) return;
    const csv = buildCsv(buildReportRows(summary, report));
    downloadTextFile(`powernet-${report.toLowerCase()}-${summary.month}.csv`, csv, 'text/csv;charset=utf-8');
  };

  if (loading && !summary) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="muted">Loading live reports...</div>
    </div>
  );

  if (error && !summary) return (
    <div className="page">
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Reports load failed</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>{error}</div>
        <button className="btn btn-primary" onClick={() => setReloadToken(t => t + 1)}>
          <Icon name="refresh" size={14} />Retry
        </button>
      </div>
    </div>
  );

  if (!summary) return null;

  const current = getReportChart(summary, report);
  const chartData = current.data.length > 0 ? current.data : [{ d: '-', v: 0 }];
  const selectedTotal = totalForReport(summary, report);
  const stats: { label: string; value: string; color: string; icon: IconName }[] = [
    { label: 'Billed Revenue', value: fmtCurrency(summary.cards.revenue), color: 'blue', icon: 'fileText' },
    { label: 'Collections', value: fmtCurrency(summary.cards.collections), color: 'green', icon: 'cash' },
    { label: 'Pending', value: fmtCurrency(summary.cards.pending), color: 'amber', icon: 'clock' },
    { label: 'Customers', value: summary.cards.customers.toLocaleString(), color: 'purple', icon: 'users' },
  ];

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p>Live analytics and exports across revenue, collections, complaints and customer growth</p>
        </div>
        <div className="row gap-sm">
          <Tabs value={period} onChange={handlePeriodChange} items={PERIODS} />
          <input
            className="select"
            type="month"
            value={reportMonth}
            onChange={e => handleMonthChange(e.target.value)}
            style={{ width: 150 }}
          />
          <button className="btn btn-secondary" onClick={() => setReloadToken(t => t + 1)} disabled={loading}>
            <Icon name="refresh" size={14} />{loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 14, color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {stats.map(stat => (
          <div key={stat.label} className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <IconBadge name={stat.icon} color={stat.color} size={40} />
            <div style={{ flex: 1 }}>
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{stat.label}</div>
              <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 2 }} className="num">{stat.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <Tabs value={report} onChange={handleReportChange} items={REPORT_TYPES.map(type => ({ value: type, label: type }))} />
        <div style={{ flex: 1 }} />
        <div className="row gap-sm">
          <button className="btn btn-secondary btn-sm" onClick={() => window.print()}>
            <Icon name="download" size={12} />PDF
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleExportCsv}>
            <Icon name="download" size={12} />Excel
          </button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <div>
            <h3>{current.label}</h3>
            <div className="sub">{summary.month} cycle - live Supabase summary</div>
          </div>
          <div className="row gap-md">
            <div>
              <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Total</div>
              <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }} className="num">{fmtValue(report, selectedTotal)}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Source</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>Live DB</div>
            </div>
          </div>
        </div>
        <div className="card-pad" style={{ paddingTop: 8 }}>
          <BarChart data={chartData} accent={current.accent} unit={current.unit} height={260} />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Agent-wise Collection Breakdown</h3>
            <div className="sub">Payments, pending amount and collection rate for {summary.month}</div>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={handleExportCsv}><Icon name="download" size={12} />Export table</button>
        </div>
        <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="data">
            <thead><tr><th>Agent</th><th>Area</th><th>Payments</th><th>Collected</th><th>Pending</th><th>Collection Rate</th></tr></thead>
            <tbody>
              {summary.agentCollections.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 28 }}>
                    No collection activity found for this month.
                  </td>
                </tr>
              ) : (
                summary.agentCollections.map(agent => <AgentRow key={`${agent.name}-${agent.area}`} agent={agent} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
