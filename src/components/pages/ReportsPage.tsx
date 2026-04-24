'use client';
import React, { useState } from 'react';
import Icon from '../Icon';
import { Avatar, Tabs } from '../ui';
import { BarChart } from '../charts';
const REVENUE_MONTHS = [
  { m: 'Nov', v: 398 }, { m: 'Dec', v: 412 }, { m: 'Jan', v: 441 },
  { m: 'Feb', v: 428 }, { m: 'Mar', v: 462 }, { m: 'Apr', v: 485 },
];

const DAILY_COLLECTION = [
  { d: 'Mon', v: 62 }, { d: 'Tue', v: 81 }, { d: 'Wed', v: 74 }, { d: 'Thu', v: 93 },
  { d: 'Fri', v: 108 }, { d: 'Sat', v: 71 }, { d: 'Sun', v: 44 },
];

const AGENT_COLLECTION = [
  { name: 'Hassan Raza', area: 'DHA Phase 5', visits: 142, collected: 428000, pending: 38000 },
  { name: 'Ahmed Sheikh', area: 'Johar Town', visits: 118, collected: 376000, pending: 52000 },
  { name: 'Usman Khan', area: 'Cantt Sector A', visits: 96, collected: 312000, pending: 24000 },
  { name: 'Kamran Butt', area: 'Gulberg Sector 3', visits: 88, collected: 289000, pending: 33000 },
];

export default function ReportsPage() {
  const [range, setRange] = useState('This Month');
  const [report, setReport] = useState('Revenue');

  const dataByReport: Record<string, { data: { d: string; v: number }[]; accent: string; unit: string; label: string }> = {
    Revenue: { data: REVENUE_MONTHS.map(m => ({ d: m.m, v: m.v })), accent: '#3B82F6', unit: 'k', label: 'Monthly Revenue (Rs. thousands)' },
    Collections: { data: DAILY_COLLECTION, accent: '#22C55E', unit: 'k', label: 'Daily Collections (Rs. thousands)' },
    Complaints: { data: [{ d: 'Nov', v: 68 }, { d: 'Dec', v: 74 }, { d: 'Jan', v: 82 }, { d: 'Feb', v: 71 }, { d: 'Mar', v: 88 }, { d: 'Apr', v: 124 }], accent: '#F59E0B', unit: '', label: 'Complaints Opened per Month' },
    Customers: { data: [{ d: 'Nov', v: 1098 }, { d: 'Dec', v: 1124 }, { d: 'Jan', v: 1156 }, { d: 'Feb', v: 1182 }, { d: 'Mar', v: 1214 }, { d: 'Apr', v: 1248 }], accent: '#8B5CF6', unit: '', label: 'Total Customers at month-end' },
  };

  const current = dataByReport[report];
  const totals: Record<string, string> = {
    Revenue: 'Rs. 26,26,000', Collections: 'Rs. 5,33,000', Complaints: '507', Customers: '1,248',
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Reports</h1>
          <p>Analytics and exports across revenue, collections, complaints and customer growth</p>
        </div>
        <div className="row gap-sm">
          <Tabs value={range} onChange={setRange} items={[
            { value: 'This Month', label: 'This Month' },
            { value: 'Last Month', label: 'Last Month' },
            { value: 'Custom', label: 'Custom' },
          ]} />
          <button className="btn btn-secondary"><Icon name="calendar" size={14} />Apr 1 — Apr 24</button>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <Tabs value={report} onChange={setReport} items={[
          { value: 'Revenue', label: 'Revenue' },
          { value: 'Collections', label: 'Collections' },
          { value: 'Complaints', label: 'Complaints' },
          { value: 'Customers', label: 'Customers' },
        ]} />
        <div style={{ flex: 1 }} />
        <div className="row gap-sm">
          <button className="btn btn-secondary btn-sm"><Icon name="download" size={12} />PDF</button>
          <button className="btn btn-secondary btn-sm"><Icon name="download" size={12} />Excel</button>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="card-head">
          <div>
            <h3>{current.label}</h3>
            <div className="sub">{range} · comparison to prior period</div>
          </div>
          <div className="row gap-md">
            <div>
              <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>Total</div>
              <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em' }} className="num">{totals[report]}</div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>vs. Prev</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--green)' }}>+8.4%</div>
            </div>
          </div>
        </div>
        <div className="card-pad" style={{ paddingTop: 8 }}>
          <BarChart data={current.data} accent={current.accent} unit={current.unit} height={260} />
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Agent-wise Collection Breakdown</h3>
            <div className="sub">Performance per recovery agent this month</div>
          </div>
          <button className="btn btn-ghost btn-sm"><Icon name="download" size={12} />Export table</button>
        </div>
        <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table className="data">
            <thead><tr><th>Agent</th><th>Area</th><th>Visits</th><th>Collected</th><th>Pending</th><th>Collection Rate</th></tr></thead>
            <tbody>
              {AGENT_COLLECTION.map((a, i) => {
                const rate = Math.round(a.collected / (a.collected + a.pending) * 100);
                return (
                  <tr key={i}>
                    <td><div className="cell-user"><Avatar name={a.name} size={28} /><div className="nm">{a.name}</div></div></td>
                    <td>{a.area}</td>
                    <td className="num">{a.visits}</td>
                    <td className="num" style={{ fontWeight: 600 }}>Rs. {a.collected.toLocaleString()}</td>
                    <td className="num" style={{ color: 'var(--amber)' }}>Rs. {a.pending.toLocaleString()}</td>
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
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
