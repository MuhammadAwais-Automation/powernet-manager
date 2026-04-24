'use client';
import React, { useState, useEffect } from 'react';
import Icon from '../Icon';
import { Badge, Avatar, IconBadge, Tabs } from '../ui';
import { BarChart } from '../charts';
import { getBills } from '@/lib/db/bills';
import type { BillWithRelations } from '@/types/database';

const DAILY_COLLECTION = [
  { d: 'Mon', v: 62 }, { d: 'Tue', v: 81 }, { d: 'Wed', v: 74 }, { d: 'Thu', v: 93 },
  { d: 'Fri', v: 108 }, { d: 'Sat', v: 71 }, { d: 'Sun', v: 44 },
];

export default function BillingPage() {
  const [bills, setBills] = useState<BillWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('All');

  useEffect(() => {
    getBills().then(setBills).finally(() => setLoading(false));
  }, []);

  const filtered = bills.filter(b => {
    if (tab === 'All') return true;
    if (tab === 'Unpaid') return b.status !== 'paid';
    return b.status === tab.toLowerCase();
  });

  const totalBilled  = bills.reduce((s, b) => s + b.amount, 0);
  const totalPaid    = bills.filter(b => b.status === 'paid').reduce((s, b) => s + b.amount, 0);
  const totalPending = bills.filter(b => b.status === 'pending').reduce((s, b) => s + b.amount, 0);
  const totalOverdue = bills.filter(b => b.status === 'overdue').reduce((s, b) => s + b.amount, 0);

  const fmt = (n: number) => `Rs. ${n.toLocaleString()}`;

  const stats = [
    { label: 'Total Billed',  value: fmt(totalBilled),  color: 'blue',  icon: 'fileText'   },
    { label: 'Collected',     value: fmt(totalPaid),    color: 'green', icon: 'checkCircle' },
    { label: 'Pending',       value: fmt(totalPending), color: 'amber', icon: 'clock'       },
    { label: 'Overdue',       value: fmt(totalOverdue), color: 'red',   icon: 'alertTri'    },
  ];

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="muted">Loading bills…</div>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Billing & Payments</h1>
          <p>Current cycle · {bills.length} bills · {fmt(totalBilled)} total invoiced</p>
        </div>
        <div className="row gap-sm">
          <button className="btn btn-secondary"><Icon name="download" size={14} />Export</button>
          <button className="btn btn-primary"><Icon name="fileText" size={14} />Generate Bills</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {stats.map((s, i) => (
          <div key={i} className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <IconBadge name={s.icon as any} color={s.color} size={40} />
            <div style={{ flex: 1 }}>
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 2 }} className="num">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <Tabs value={tab} onChange={setTab} items={[
              { value: 'All',     label: 'All Bills', count: bills.length },
              { value: 'Unpaid',  label: 'Unpaid',    count: bills.filter(b => b.status !== 'paid').length },
              { value: 'Paid',    label: 'Paid',      count: bills.filter(b => b.status === 'paid').length },
              { value: 'Overdue', label: 'Overdue',   count: bills.filter(b => b.status === 'overdue').length },
            ]} />
            <div className="search" style={{ minWidth: 240, height: 36, border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elev)' }}>
              <Icon name="search" size={14} />
              <input placeholder="Search bills…" style={{ border: 'none', outline: 'none', background: 'none', fontSize: 13, flex: 1 }} />
            </div>
          </div>

          {bills.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>No bills yet</div>
              <div style={{ fontSize: 12 }}>Generate bills for this cycle using the panel on the right.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Bill ID</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Month</th>
                    <th>Status</th>
                    <th>Collected By</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(b => (
                    <tr key={b.id} className="clickable">
                      <td className="mono" style={{ fontSize: 12 }}>{b.id.slice(0, 8)}…</td>
                      <td>
                        <div className="cell-user">
                          <Avatar name={b.customer?.full_name ?? '?'} size={28} />
                          <div>
                            <div className="nm" style={{ fontSize: 13 }}>{b.customer?.full_name ?? '—'}</div>
                            <div className="sub mono">{b.customer?.customer_code ?? ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>Rs. {b.amount.toLocaleString()}</td>
                      <td className="mono" style={{ fontSize: 12 }}>{b.month}</td>
                      <td><Badge color={b.status === 'paid' ? 'green' : b.status === 'overdue' ? 'red' : 'amber'} dot>{b.status}</Badge></td>
                      <td className="muted">{b.collector?.full_name ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="row gap-sm" style={{ justifyContent: 'flex-end' }}>
                          {b.status !== 'paid' && <button className="btn btn-secondary btn-sm"><Icon name="check" size={12} />Mark paid</button>}
                          <button className="icon-btn" style={{ width: 28, height: 28 }}><Icon name="fileText" size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-head">
              <div>
                <h3>Daily Collection Summary</h3>
                <div className="sub">This week · Rs. in thousands</div>
              </div>
              <div className="legend">
                <div className="item"><span className="sw" style={{ background: '#3B82F6' }} />Collected</div>
              </div>
            </div>
            <div className="card-pad" style={{ paddingTop: 8 }}>
              <BarChart data={DAILY_COLLECTION.map((d, i) => ({ ...d, highlight: i === 4 }))} accent="#3B82F6" labelKey="d" />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <div><h3>Generate Bills</h3><div className="sub">Bulk invoice for a billing period</div></div>
            </div>
            <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label>Billing Month</label>
                <select className="select" defaultValue="Apr 2026">
                  <option>Apr 2026</option><option>May 2026</option><option>Jun 2026</option>
                </select>
              </div>
              <div className="field">
                <label>Include</label>
                <select className="select">
                  <option>All active customers</option>
                  <option>By area…</option>
                  <option>Custom list…</option>
                </select>
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }}><Icon name="fileText" size={14} />Generate Bills</button>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div><h3>Record Cash Payment</h3><div className="sub">Manual entry from field agent</div></div>
            </div>
            <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="field"><label>Customer</label><input className="input" placeholder="Search by name or ID…" /></div>
              <div className="field"><label>Amount (Rs.)</label><input className="input" placeholder="0" /></div>
              <div className="field"><label>Collected By</label>
                <select className="select"><option>— Select staff —</option></select>
              </div>
              <div className="field"><label>Notes (optional)</label><input className="input" placeholder="e.g. partial payment, receipt #4428" /></div>
              <button className="btn btn-primary" style={{ width: '100%' }}><Icon name="cash" size={14} />Record Payment</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
