'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
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

const SERVICE_FILTERS: { value: ServiceType; label: string }[] = [
  { value: 'both', label: 'All' },
  { value: 'internet', label: 'Internet' },
  { value: 'cable', label: 'Cable' },
];

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

function activityGroupLabel(at: string): string {
  if (!at) return 'Earlier';
  const diff = Date.now() - new Date(at).getTime();
  const hours = diff / 3_600_000;
  if (hours < 24) return 'Last 24 hours';
  if (hours < 168) return 'This week';
  return 'Earlier';
}

function activityNavigateTarget(kind: ActivityItem['kind']): PageId {
  if (kind === 'payment') return 'billing';
  if (kind === 'complaint') return 'complaints';
  return 'customers';
}

type StatCard = {
  key: string;
  label: string;
  value: string;
  sub: string;
  icon: IconName;
  accent: string;
  pill?: string;
  pillClass?: 'up' | 'down' | 'neutral';
  page?: PageId;
};

function StatCardView({
  card,
  onNavigate,
}: {
  card: StatCard;
  onNavigate?: (page: PageId) => void;
}) {
  const clickable = Boolean(card.page && onNavigate);
  const className = `stat-v2${clickable ? ' stat-v2-clickable' : ''}`;

  const inner = (
    <>
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
    </>
  );

  if (clickable) {
    return (
      <button
        type="button"
        className={className}
        style={{ '--stat-accent': card.accent } as React.CSSProperties}
        onClick={() => onNavigate!(card.page!)}
      >
        {inner}
      </button>
    );
  }

  return (
    <div className={className} style={{ '--stat-accent': card.accent } as React.CSSProperties}>
      {inner}
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

  const groupedActivity = useMemo(() => {
    const groups = new Map<string, ActivityItem[]>();
    for (const item of activity) {
      const label = activityGroupLabel(item.at);
      const list = groups.get(label) ?? [];
      list.push(item);
      groups.set(label, list);
    }
    const order = ['Last 24 hours', 'This week', 'Earlier'];
    return order
      .filter((label) => groups.has(label))
      .map((label) => ({ label, items: groups.get(label)! }));
  }, [activity]);

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="muted">Loading dashboard…</div>
    </div>
  );

  if (error) return (
    <div className="page">
      <div className="card card--static" style={{ padding: 24 }}>
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
  const activePct = s.totalCustomers > 0
    ? Math.round((s.activeCustomers / s.totalCustomers) * 100)
    : 0;

  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  const collectedPill = picked.collected === 0
    ? { text: 'No collections yet', cls: 'neutral' as const }
    : rateNum !== null && rateNum < 50
      ? { text: rate, cls: 'down' as const }
      : { text: rate, cls: 'up' as const };

  const heroCards: StatCard[] = [
    {
      key: 'customers',
      label: 'Total Customers',
      value: s.totalCustomers.toLocaleString(),
      sub: `${s.activeCustomers.toLocaleString()} active (${activePct}%)`,
      icon: 'users',
      accent: 'var(--brand)',
      page: 'customers',
    },
    {
      key: 'complaints',
      label: 'Open Complaints',
      value: s.openComplaints.toLocaleString(),
      sub: `${s.complaintsByStatus.in_progress} in progress`,
      icon: 'alertTri',
      accent: 'var(--amber)',
      page: 'complaints',
    },
    {
      key: 'agents',
      label: 'Active Staff',
      value: s.activeStaff.toLocaleString(),
      sub: 'Technicians and field agents',
      icon: 'briefcase',
      accent: 'var(--purple)',
      page: 'staff',
    },
    {
      key: 'collection-rate',
      label: 'Collection Rate',
      value: rateNum !== null ? `${rateNum}%` : '—',
      sub: picked.expected > 0 ? `${fmt(picked.collected)} of ${fmt(picked.expected)}` : 'No billing expected',
      icon: 'percent',
      accent: 'var(--green)',
      page: 'billing',
    },
  ];

  const financialCards: StatCard[] = [
    {
      key: 'collected',
      label: 'Collected This Month',
      value: fmt(picked.collected),
      sub: serviceFilter === 'both'
        ? `${fmt(s.monthlyInternetRevenue)} internet · ${fmt(s.monthlyCableRevenue)} cable`
        : `As of ${dateStr}`,
      icon: 'dollar',
      accent: 'var(--green)',
      pill: collectedPill.text,
      pillClass: collectedPill.cls,
      page: 'billing',
    },
    {
      key: 'expected',
      label: 'Expected This Month',
      value: fmt(picked.expected),
      sub: serviceFilter === 'both'
        ? `${fmt(s.expectedInternetRevenue)} internet · ${fmt(s.expectedCableRevenue)} cable`
        : serviceLabel,
      icon: 'fileText',
      accent: 'var(--text-muted)',
      page: 'billing',
    },
    {
      key: 'pending',
      label: 'Pending Collections',
      value: fmt(picked.pending),
      sub: serviceFilter === 'both'
        ? `${fmt(s.pendingInternetRevenue)} internet · ${fmt(s.pendingCableRevenue)} cable`
        : 'Outstanding bill balance',
      icon: 'cash',
      accent: 'var(--red)',
      page: 'billing',
    },
  ];

  const unpaidCards: StatCard[] = [
    {
      key: 'unpaid-internet',
      label: 'Unpaid Internet Bills',
      value: picked.unpaidInternet.toLocaleString(),
      sub: serviceFilter === 'cable' ? 'Hidden by filter' : 'Internet subscribers',
      icon: 'wifi',
      accent: 'var(--red)',
      page: 'billing',
    },
    {
      key: 'unpaid-cable',
      label: 'Unpaid Cable Bills',
      value: picked.unpaidCable.toLocaleString(),
      sub: serviceFilter === 'internet' ? 'Hidden by filter' : 'Cable subscribers',
      icon: 'tv',
      accent: 'var(--blue)',
      page: 'billing',
    },
  ];

  const donutSegs = [
    { label: 'Open', value: s.complaintsByStatus.open, color: 'var(--red)' },
    { label: 'In Progress', value: s.complaintsByStatus.in_progress, color: 'var(--amber)' },
    { label: 'Resolved', value: s.complaintsByStatus.resolved, color: 'var(--green)' },
  ];
  const totalComplaints = donutSegs.reduce((a, b) => a + b.value, 0);
  const needsAttention = s.complaintsByStatus.open + s.complaintsByStatus.in_progress;

  const showInternetChart = serviceFilter !== 'cable' && picked.chartInternet.length > 0;
  const showCableChart = serviceFilter !== 'internet' && picked.chartCable.length > 0;
  const cableHasCollections = picked.chartCable.some((d) => d.v > 0);

  const chartData = showInternetChart ? picked.chartInternet : picked.chartCable;
  const chartData2 = showInternetChart && showCableChart ? picked.chartCable : undefined;

  return (
    <div className="page dashboard-page">
      <div className="dashboard-toolbar">
        <div className="dashboard-toolbar-left">
          <div className="segmented-control" role="group" aria-label="Service filter">
            {SERVICE_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                className={serviceFilter === f.value ? 'active' : ''}
                aria-pressed={serviceFilter === f.value}
                onClick={() => setServiceFilter(f.value)}
              >
                {f.label}
              </button>
            ))}
          </div>
          {lastUpdated && (
            <span className="dashboard-last-updated">
              Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="dashboard-controls">
          <button className="btn btn-ghost btn-sm" onClick={handleRefresh} title="Refresh data">
            <Icon name="refresh" size={14} />Refresh
          </button>
          <button className="btn btn-secondary btn-sm" onClick={handleExport}>
            <Icon name="download" size={14} />Export
          </button>
        </div>
      </div>

      {onNavigate && (
        <div className="dashboard-quick-actions">
          <button className="btn btn-primary" onClick={() => onNavigate('customers')}>
            <Icon name="plus" size={14} />Add Customer
          </button>
          <button className="btn btn-secondary" onClick={() => onNavigate('complaints')}>
            <Icon name="alert" size={14} />New Complaint
          </button>
          <button className="btn btn-ghost" onClick={() => onNavigate('billing')}>
            <Icon name="card" size={14} />Go to Billing
          </button>
        </div>
      )}

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">Operations</h2>
        <div className="grid-kpi-4">
          {heroCards.map((c) => (
            <StatCardView key={c.key} card={c} onNavigate={onNavigate} />
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">Collections · {serviceLabel}</h2>
        <div className="grid-kpi-3">
          {financialCards.map((c) => (
            <StatCardView key={c.key} card={c} onNavigate={onNavigate} />
          ))}
        </div>
        {picked.expected > 0 && (
          <div className="collection-progress">
            <div className="collection-progress-head">
              <span>Month-to-date collection</span>
              <span className="num">{rate}</span>
            </div>
            <div className="collection-progress-track">
              <div
                className="collection-progress-fill"
                style={{ width: `${Math.min(rateNum ?? 0, 100)}%` }}
              />
            </div>
          </div>
        )}
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">Outstanding bills</h2>
        <div className="grid-kpi-2">
          {unpaidCards.map((c) => (
            <StatCardView key={c.key} card={c} onNavigate={onNavigate} />
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <h2 className="dashboard-section-title">Insights</h2>
        <div className="grid-dashboard-main">
          <div className="card card--static">
            <div className="card-head">
              <div>
                <h3>Monthly Revenue</h3>
                <div className="sub">Last 6 months · Rs. thousands · {serviceLabel}</div>
              </div>
            </div>
            <div className="card-pad chart-card-pad">
              {chartData.length === 0 ? (
                <div className="chart-empty-state">No revenue data for this filter</div>
              ) : (
                <RevenueLineChart
                  data={chartData}
                  data2={chartData2}
                  showCableLegend={serviceFilter === 'both'}
                  cableEmpty={showCableChart && !cableHasCollections}
                />
              )}
            </div>
          </div>

          <div className="card card--static dashboard-complaints-card">
            <div className="card-head">
              <div>
                <h3>Complaints by Status</h3>
                <div className="sub">{needsAttention} need attention</div>
              </div>
            </div>
            <div className="card-pad dashboard-donut-wrap">
              {totalComplaints === 0 ? (
                <div className="chart-empty-state">No complaints yet</div>
              ) : (
                <>
                  <Donut
                    segments={donutSegs}
                    size={176}
                    thickness={24}
                    center={{ value: needsAttention, label: 'Active' }}
                  />
                  <div className="legend">
                    {donutSegs.map((seg) => (
                      <div key={seg.label} className="item">
                        <span className="sw" style={{ background: seg.color }} />
                        {seg.label} · <strong className="num">{seg.value}</strong>
                      </div>
                    ))}
                  </div>
                  {onNavigate && needsAttention > 0 && (
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm dashboard-donut-cta"
                      onClick={() => onNavigate('complaints')}
                    >
                      View open complaints
                      <Icon name="arrowRight" size={14} />
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-section">
        <div className="card card--static">
          <div className="card-head">
            <div>
              <h3>Recent Activity</h3>
              <div className="sub">Latest payments, complaints and onboarding</div>
            </div>
          </div>
          {activity.length === 0 ? (
            <div className="activity-empty-state">
              No recent activity — add customers, log complaints or record payments to see events here.
            </div>
          ) : (
            <div>
              {groupedActivity.map((group) => (
                <div key={group.label}>
                  <div className="activity-group-label">{group.label}</div>
                  {group.items.map((a) => {
                    const clickable = Boolean(onNavigate);
                    const target = activityNavigateTarget(a.kind);
                    return (
                      <div
                        key={`${a.kind}-${a.at}-${a.lead}`}
                        className={`activity-item${clickable ? ' clickable' : ''}`}
                        onClick={clickable ? () => onNavigate!(target) : undefined}
                        role={clickable ? 'button' : undefined}
                        tabIndex={clickable ? 0 : undefined}
                        onKeyDown={clickable ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') onNavigate!(target);
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
                          {a.kind === 'customer' && <Badge color="blue">New</Badge>}
                          {a.amt && <div className="amt">{a.amt}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}