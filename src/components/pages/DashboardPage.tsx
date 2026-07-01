'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Icon, { type IconName } from '../Icon';
import { Badge, IconBadge } from '../ui';
import { RevenueLineChart, Donut } from '../charts';
import {
  getDashboardStats,
  getRecentActivity,
  clearDashboardCache,
  type DashboardStats,
  type ActivityItem,
} from '@/lib/db/dashboard';
import {
  type ServiceType,
  getServiceTypeLabel,
  buildCsv,
} from '@/lib/reports/core';
import type { PageId } from '@/lib/auth/permissions';

type PickedStats = {
  collected: number;
  expected: number;
  pending: number;
  unpaidInternet: number;
  unpaidCable: number;
  unpaidTotal: number;
  chartInternet: { m: string; v: number }[];
  chartCable: { m: string; v: number }[];
};

function pickStats(s: DashboardStats, filter: ServiceType): PickedStats {
  if (filter === 'internet') {
    return {
      collected: s.monthlyInternetRevenue,
      expected: s.expectedInternetRevenue,
      pending: s.pendingInternetRevenue,
      unpaidInternet: s.unpaidInternetBills,
      unpaidCable: 0,
      unpaidTotal: s.unpaidInternetBills,
      chartInternet: s.revenueByMonthInternet.length > 0 ? s.revenueByMonthInternet : s.revenueByMonth,
      chartCable: [],
    };
  }
  if (filter === 'cable') {
    return {
      collected: s.monthlyCableRevenue,
      expected: s.expectedCableRevenue,
      pending: s.pendingCableRevenue,
      unpaidInternet: 0,
      unpaidCable: s.unpaidCableBills,
      unpaidTotal: s.unpaidCableBills,
      chartInternet: [],
      chartCable: s.revenueByMonthCable,
    };
  }
  return {
    collected: s.monthlyRevenue,
    expected: s.expectedRevenue,
    pending: s.pendingRevenue,
    unpaidInternet: s.unpaidInternetBills,
    unpaidCable: s.unpaidCableBills,
    unpaidTotal: s.unpaidBills,
    chartInternet: s.revenueByMonthInternet.length > 0 ? s.revenueByMonthInternet : s.revenueByMonth,
    chartCable: s.revenueByMonthCable,
  };
}

function fmt(n: number) {
  return n >= 100000 ? `Rs. ${(n / 100000).toFixed(2)}L` : `Rs. ${n.toLocaleString()}`;
}

function collectionRate(collected: number, expected: number): string {
  if (expected <= 0) return '—';
  return `${Math.round((collected / expected) * 100)}% collected`;
}

type StatCard = {
  key: string;
  label: string;
  value: string;
  sub: string;
  icon: IconName;
  accent: string;
  pill?: string;
  pillClass?: 'up' | 'down';
};

function StatCardView({ card }: { card: StatCard }) {
  return (
    <div className="stat-v2" style={{ '--stat-accent': card.accent } as React.CSSProperties}>
      <div className="stat-v2-glow" />
      <div className="stat-v2-head">
        <span className="stat-v2-icon"><Icon name={card.icon} size={18} /></span>
        <span className="stat-v2-label">{card.label}</span>
      </div>
      <div className="stat-v2-body">
        <div className="stat-v2-value num">{card.value}</div>
        {card.pill && (
          <span className={`stat-v2-pill ${card.pillClass ?? 'up'}`}>{card.pill}</span>
        )}
      </div>
      <div className="stat-v2-foot stat-v2-foot--no-spark">
        <span className="stat-v2-sub">{card.sub}</span>
      </div>
    </div>
  );
}

function downloadTextFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function priorityBadgeColor(priority: 'low' | 'medium' | 'high'): string {
  if (priority === 'high') return 'red';
  if (priority === 'medium') return 'amber';
  return 'gray';
}

export default function DashboardPage({
  refreshToken = 0,
  onNavigate,
}: {
  refreshToken?: number;
  onNavigate?: (page: PageId) => void;
}) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [serviceFilter, setServiceFilter] = useState<ServiceType>('both');
  const [reloadToken, setReloadToken] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadData = useCallback(async () => {
    setError(null);
    const [s, a] = await Promise.all([getDashboardStats(), getRecentActivity()]);
    setStats(s);
    setActivity(a);
    setLastUpdated(new Date());
  }, []);

  useEffect(() => {
    if (!stats) setLoading(true);
    let active = true;
    loadData()
      .catch((e: unknown) => {
        if (active) setError(e instanceof Error ? e.message : 'Could not load dashboard');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken, reloadToken]);

  const handleRefresh = () => {
    clearDashboardCache();
    setReloadToken((t) => t + 1);
  };

  const handleExport = () => {
    if (!stats) return;
    const picked = pickStats(stats, serviceFilter);
    const serviceLabel = getServiceTypeLabel(serviceFilter);
    const now = new Date();
    const rows: Array<Array<string | number>> = [
      ['PowerNet Dashboard Export'],
      ['Generated', now.toISOString()],
      ['Service filter', serviceLabel],
      [],
      ['Metric', 'Value'],
      ['Total Customers', stats.totalCustomers],
      ['Active Connections', stats.activeCustomers],
      ['Open Complaints', stats.openComplaints],
      ['Active Staff', stats.activeStaff],
      ['Collected This Month', picked.collected],
      ['Expected This Month', picked.expected],
      ['Pending Collections', picked.pending],
      ['Unpaid Internet Bills', picked.unpaidInternet],
      ['Unpaid Cable Bills', picked.unpaidCable],
      [],
      ['Month', 'Internet (Rs. thousands)', 'Cable (Rs. thousands)'],
    ];
    const months = picked.chartInternet.length > 0
      ? picked.chartInternet
      : picked.chartCable;
    months.forEach((point, i) => {
      rows.push([
        point.m,
        picked.chartInternet[i]?.v ?? 0,
        picked.chartCable[i]?.v ?? 0,
      ]);
    });
    downloadTextFile(
      `dashboard-${serviceFilter}-${now.toISOString().slice(0, 10)}.csv`,
      buildCsv(rows),
    );
  };

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="muted">Loading dashboard…</div>
    </div>
  );

  if (error) return (
    <div className="page">
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Data load failed</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>{error}</div>
        <button className="btn btn-primary" onClick={handleRefresh}>
          <Icon name="refresh" size={14} />Retry
        </button>
      </div>
    </div>
  );

  const s = stats!;
  const picked = pickStats(s, serviceFilter);
  const serviceLabel = getServiceTypeLabel(serviceFilter);
  const rate = collectionRate(picked.collected, picked.expected);
  const rateNum = picked.expected > 0 ? Math.round((picked.collected / picked.expected) * 100) : null;

  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  const row1: StatCard[] = [
    {
      key: 'customers', label: 'Total Customers',
      value: s.totalCustomers.toLocaleString(),
      sub: `${s.activeCustomers.toLocaleString()} active`,
      icon: 'users', accent: '#F5A623',
    },
    {
      key: 'active', label: 'Active Connections',
      value: s.activeCustomers.toLocaleString(),
      sub: `of ${s.totalCustomers.toLocaleString()} total`,
      icon: 'wifi', accent: '#22C55E',
    },
    {
      key: 'complaints', label: 'Open Complaints',
      value: s.openComplaints.toLocaleString(),
      sub: `${s.complaintsByStatus.in_progress} in progress`,
      icon: 'alertTri', accent: '#F59E0B',
    },
    {
      key: 'agents', label: 'Active Staff',
      value: s.activeStaff.toLocaleString(),
      sub: 'technicians + agents',
      icon: 'briefcase', accent: '#8B5CF6',
    },
  ];

  const row2: StatCard[] = [
    {
      key: 'collected', label: 'Collected This Month',
      value: fmt(picked.collected),
      sub: serviceFilter === 'both'
        ? `${fmt(s.monthlyInternetRevenue)} internet · ${fmt(s.monthlyCableRevenue)} cable`
        : `As of ${dateStr}`,
      icon: 'dollar', accent: '#F5A623',
      pill: rate !== '—' ? rate : undefined,
      pillClass: rateNum !== null && rateNum < 50 ? 'down' : 'up',
    },
    {
      key: 'expected', label: 'Expected This Month',
      value: fmt(picked.expected),
      sub: serviceFilter === 'both'
        ? `${fmt(s.expectedInternetRevenue)} internet · ${fmt(s.expectedCableRevenue)} cable`
        : serviceLabel,
      icon: 'fileText', accent: '#3B82F6',
    },
    {
      key: 'pending', label: 'Pending Collections',
      value: fmt(picked.pending),
      sub: serviceFilter === 'both'
        ? `${fmt(s.pendingInternetRevenue)} internet · ${fmt(s.pendingCableRevenue)} cable`
        : 'Outstanding bill balance',
      icon: 'cash', accent: '#EF4444',
    },
  ];

  const row3: StatCard[] = [
    {
      key: 'unpaid-internet', label: 'Unpaid Internet Bills',
      value: picked.unpaidInternet.toLocaleString(),
      sub: serviceFilter === 'cable' ? 'Hidden by filter' : 'Internet subscribers',
      icon: 'alertTri', accent: '#EF4444',
    },
    {
      key: 'unpaid-cable', label: 'Unpaid Cable Bills',
      value: picked.unpaidCable.toLocaleString(),
      sub: serviceFilter === 'internet' ? 'Hidden by filter' : 'Cable subscribers',
      icon: 'tv', accent: '#3B82F6',
    },
  ];

  const donutSegs = [
    { label: 'Open', value: s.complaintsByStatus.open, color: '#EF4444' },
    { label: 'In Progress', value: s.complaintsByStatus.in_progress, color: '#F59E0B' },
    { label: 'Resolved', value: s.complaintsByStatus.resolved, color: '#22C55E' },
  ];
  const totalComplaints = donutSegs.reduce((a, b) => a + b.value, 0);

  const showInternetChart = serviceFilter !== 'cable' && picked.chartInternet.length > 0;
  const showCableChart = serviceFilter !== 'internet' && picked.chartCable.length > 0;
  const cableHasCollections = picked.chartCable.some((d) => d.v > 0);

  const chartData = showInternetChart ? picked.chartInternet : picked.chartCable;
  const chartData2 = showInternetChart && showCableChart ? picked.chartCable : undefined;

  return (
    <div className="page">
      <div className="dashboard-meta-row">
        <p>Live overview · {dayName}, {dateStr} · {serviceLabel}</p>
        <div className="dashboard-controls">
          {lastUpdated && (
            <span className="dashboard-last-updated">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <select
            className="select"
            value={serviceFilter}
            onChange={(e) => setServiceFilter(e.target.value as ServiceType)}
            style={{ width: 140 }}
          >
            <option value="both">All Services</option>
            <option value="internet">Internet</option>
            <option value="cable">Cable</option>
          </select>
          <button className="btn btn-secondary" onClick={handleRefresh}>
            <Icon name="refresh" size={14} />Refresh
          </button>
          <button className="btn btn-secondary" onClick={handleExport}>
            <Icon name="download" size={14} />Export
          </button>
        </div>
      </div>

      {onNavigate && (
        <div className="dashboard-quick-actions">
          <button className="btn btn-secondary" onClick={() => onNavigate('customers')}>
            <Icon name="plus" size={14} />Add Customer
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('complaints')}>
            <Icon name="alert" size={14} />New Complaint
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('billing')}>
            <Icon name="card" size={14} />Go to Billing
          </button>
        </div>
      )}

      <div className="grid-kpi-4" style={{ marginBottom: 16 }}>
        {row1.map((c) => <StatCardView key={c.key} card={c} />)}
      </div>

      <div className="grid-kpi-3" style={{ marginBottom: 16 }}>
        {row2.map((c) => <StatCardView key={c.key} card={c} />)}
      </div>

      <div className="grid-kpi-2" style={{ marginBottom: 20 }}>
        {row3.map((c) => <StatCardView key={c.key} card={c} />)}
      </div>

      <div className="grid-dashboard-main" style={{ marginBottom: 20 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Monthly Revenue</h3>
              <div className="sub">Last 6 months, Rs. thousands (collected) · {serviceLabel}</div>
            </div>
          </div>
          <div className="card-pad" style={{ paddingTop: 8 }}>
            {chartData.length === 0 ? (
              <div className="muted" style={{ padding: 32, fontSize: 13, textAlign: 'center' }}>
                No revenue data for this filter
              </div>
            ) : (
              <>
                <RevenueLineChart
                  data={chartData}
                  data2={chartData2}
                  showCableLegend={serviceFilter === 'both'}
                />
                {showCableChart && !cableHasCollections && (
                  <div className="muted" style={{ fontSize: 12, textAlign: 'center', marginTop: 8 }}>
                    No cable collections yet — cable line will appear when payments are recorded
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <div>
              <h3>Complaints by Status</h3>
              <div className="sub">Current snapshot</div>
            </div>
          </div>
          <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
            {totalComplaints === 0 ? (
              <div className="muted" style={{ padding: 32, fontSize: 13 }}>No complaints yet</div>
            ) : (
              <>
                <Donut segments={donutSegs} center={{ value: totalComplaints, label: 'Total' }} />
                <div className="legend" style={{ justifyContent: 'center' }}>
                  {donutSegs.map((seg) => (
                    <div key={seg.label} className="item">
                      <span className="sw" style={{ background: seg.color }} />
                      {seg.label} · <strong style={{ color: 'var(--text)' }}>{seg.value}</strong>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Recent Activity</h3>
            <div className="sub">Latest payments, complaints and onboarding</div>
          </div>
        </div>
        {activity.length === 0 ? (
          <div style={{ padding: '24px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
            No recent activity — add customers, log complaints or record payments to see events here.
          </div>
        ) : (
          <div>
            {activity.map((a, i) => (
              <div
                key={i}
                className={`activity-item${a.kind === 'complaint' && onNavigate ? ' clickable' : ''}`}
                onClick={a.kind === 'complaint' && onNavigate ? () => onNavigate('complaints') : undefined}
                role={a.kind === 'complaint' && onNavigate ? 'button' : undefined}
                tabIndex={a.kind === 'complaint' && onNavigate ? 0 : undefined}
                onKeyDown={a.kind === 'complaint' && onNavigate ? (e) => {
                  if (e.key === 'Enter' || e.key === ' ') onNavigate('complaints');
                } : undefined}
              >
                <IconBadge name={a.icon} color={a.color} size={32} />
                <div className="main">
                  <div className="lead lead-truncate">{a.lead}</div>
                  <div className="when">
                    <Icon name="clock" size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
                    {a.when}
                  </div>
                </div>
                <div className="amt-col">
                  {a.kind === 'payment' && (
                    <>
                      <Badge color="green">Paid</Badge>
                      {a.service && (
                        <Badge color={a.service === 'cable' ? 'blue' : 'gray'}>
                          {a.service === 'cable' ? 'Cable' : 'Internet'}
                        </Badge>
                      )}
                    </>
                  )}
                  {a.kind === 'complaint' && a.priority && (
                    <Badge color={priorityBadgeColor(a.priority)} dot>
                      {a.priority === 'high' ? 'High' : a.priority === 'medium' ? 'Medium' : 'Low'}
                    </Badge>
                  )}
                  {a.amt && <div className="amt">{a.amt}</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
