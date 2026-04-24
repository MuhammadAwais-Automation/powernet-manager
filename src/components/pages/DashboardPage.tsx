'use client';
import React, { useState, useEffect } from 'react';
import Icon from '../Icon';
import { IconBadge } from '../ui';
import { RevenueLineChart, Donut, Sparkline } from '../charts';
import { getDashboardStats, getRecentActivity } from '@/lib/db/dashboard';
import type { DashboardStats, ActivityItem } from '@/lib/db/dashboard';

export default function DashboardPage() {
  const [stats, setStats]       = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    Promise.all([getDashboardStats(), getRecentActivity()])
      .then(([s, a]) => { setStats(s); setActivity(a); })
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n: number) =>
    n >= 100000 ? `Rs. ${(n / 100000).toFixed(2)}L` : `Rs. ${n.toLocaleString()}`;

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="muted">Loading dashboard…</div>
    </div>
  );

  const s = stats!;

  const statCards = [
    {
      key: 'customers', label: 'Total Customers',
      value: s.totalCustomers.toLocaleString(),
      sub: `${s.activeCustomers.toLocaleString()} active`,
      icon: 'users', accent: '#F05A2B',
      spark: [
        Math.max(0, s.totalCustomers - 60), Math.max(0, s.totalCustomers - 48),
        Math.max(0, s.totalCustomers - 36), Math.max(0, s.totalCustomers - 24),
        Math.max(0, s.totalCustomers - 12), s.totalCustomers,
      ],
    },
    {
      key: 'active', label: 'Active Connections',
      value: s.activeCustomers.toLocaleString(),
      sub: `of ${s.totalCustomers} total`,
      icon: 'wifi', accent: '#22C55E',
      spark: [
        Math.max(0, s.activeCustomers - 40), Math.max(0, s.activeCustomers - 30),
        Math.max(0, s.activeCustomers - 20), Math.max(0, s.activeCustomers - 10),
        Math.max(0, s.activeCustomers - 5),  s.activeCustomers,
      ],
    },
    {
      key: 'unpaid', label: 'Unpaid Bills',
      value: s.unpaidBills.toLocaleString(),
      sub: 'pending + overdue',
      icon: 'alertTri', accent: '#EF4444',
      spark: [
        s.unpaidBills + 10, s.unpaidBills + 8, s.unpaidBills + 5,
        s.unpaidBills + 3,  s.unpaidBills + 1, s.unpaidBills,
      ],
    },
    {
      key: 'revenue', label: 'Monthly Revenue',
      value: fmt(s.monthlyRevenue),
      sub: 'this month (paid)',
      icon: 'dollar', accent: '#F05A2B',
      spark: s.revenueByMonth.map(r => r.v),
    },
  ];

  const wideCards = [
    {
      key: 'complaints', label: 'Open Complaints',
      value: s.openComplaints.toLocaleString(),
      sub: `${s.complaintsByStatus.in_progress} in progress`,
      icon: 'alertTri', accent: '#F59E0B',
      spark: [s.openComplaints + 5, s.openComplaints + 3, s.openComplaints + 2,
              s.openComplaints + 1, s.openComplaints],
    },
    {
      key: 'agents', label: 'Active Staff',
      value: s.activeStaff.toLocaleString(),
      sub: 'technicians + agents',
      icon: 'briefcase', accent: '#8B5CF6',
      spark: [s.activeStaff, s.activeStaff, s.activeStaff, s.activeStaff, s.activeStaff],
    },
  ];

  const donutSegs = [
    { label: 'Open',        value: s.complaintsByStatus.open,        color: '#F05A2B' },
    { label: 'In Progress', value: s.complaintsByStatus.in_progress, color: '#1A1A1A' },
    { label: 'Resolved',    value: s.complaintsByStatus.resolved,    color: '#F7825A' },
  ];
  const totalComplaints = donutSegs.reduce((a, b) => a + b.value, 0);

  const now = new Date();
  const dayName = now.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>PowerNet Dashboard</h1>
          <p>Live network overview · {dayName}, {dateStr}</p>
        </div>
        <div className="row gap-sm">
          <button className="btn btn-secondary"><Icon name="download" size={14} />Export</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 16 }}>
        {statCards.map((c, i) => (
          <div key={i} className="stat-v2" style={{ '--stat-accent': c.accent } as React.CSSProperties}>
            <div className="stat-v2-glow" />
            <div className="stat-v2-head">
              <span className="stat-v2-icon"><Icon name={c.icon as any} size={18} /></span>
              <span className="stat-v2-label">{c.label}</span>
            </div>
            <div className="stat-v2-body">
              <div className="stat-v2-value num">{c.value}</div>
            </div>
            <div className="stat-v2-foot">
              <span className="stat-v2-sub">{c.sub}</span>
              <Sparkline data={c.spark} color={c.accent} width={72} height={22} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16, marginBottom: 20 }}>
        {wideCards.map((c, i) => (
          <div key={i} className="stat-v2 stat-v2-wide" style={{ '--stat-accent': c.accent } as React.CSSProperties}>
            <div className="stat-v2-glow" />
            <div className="stat-v2-head">
              <span className="stat-v2-icon"><Icon name={c.icon as any} size={18} /></span>
              <span className="stat-v2-label">{c.label}</span>
            </div>
            <div className="stat-v2-body">
              <div className="stat-v2-value num">{c.value}</div>
            </div>
            <div className="stat-v2-foot">
              <span className="stat-v2-sub">{c.sub}</span>
              <Sparkline data={c.spark} color={c.accent} width={120} height={26} />
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginBottom: 20 }}>
        <div className="card">
          <div className="card-head">
            <div>
              <h3>Monthly Revenue</h3>
              <div className="sub">Last 6 months, Rs. thousands (paid bills)</div>
            </div>
          </div>
          <div className="card-pad" style={{ paddingTop: 8 }}>
            <RevenueLineChart data={s.revenueByMonth} />
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
                  {donutSegs.map(seg => (
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
              <div key={i} className="activity-item">
                <IconBadge name={a.icon as any} color={a.color} size={32} />
                <div className="main">
                  <div className="lead">{a.lead}</div>
                  <div className="when">
                    <Icon name="clock" size={10} style={{ verticalAlign: -1, marginRight: 4 }} />{a.when}
                  </div>
                </div>
                <div className="amt">{a.amt}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
