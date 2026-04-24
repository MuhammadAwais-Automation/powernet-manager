'use client';
import React, { useState, useEffect } from 'react';
import Icon from '../Icon';
import { Badge, Avatar, Modal, Tabs } from '../ui';
import { getComplaints, createComplaint } from '@/lib/db/complaints';
import { getAreas } from '@/lib/db/areas';
import { getStaff } from '@/lib/db/staff';
import { searchCustomers } from '@/lib/db/customers';
import type { ComplaintWithRelations, Area, StaffWithArea, CustomerWithRelations, ComplaintType, ComplaintPriority, ComplaintStatus } from '@/types/database';

function LogComplaintModal({ onClose, staff, onSaved }: {
  onClose: () => void;
  staff: StaffWithArea[];
  onSaved: (c: ComplaintWithRelations) => void;
}) {
  const [customerSearch, setCustomerSearch]     = useState('');
  const [customerResults, setCustomerResults]   = useState<CustomerWithRelations[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerWithRelations | null>(null);
  const [form, setForm] = useState({
    issue:       '',
    type:        'connectivity' as ComplaintType,
    priority:    'medium'       as ComplaintPriority,
    assigned_to: '',
    status:      'open'         as ComplaintStatus,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  useEffect(() => {
    if (customerSearch.length < 2) { setCustomerResults([]); return; }
    const t = setTimeout(() => {
      searchCustomers(customerSearch).then(r => setCustomerResults(r.slice(0, 8)));
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const handleSubmit = async () => {
    if (!selectedCustomer) { setError('Select a customer'); return; }
    if (!form.issue.trim()) { setError('Issue description required'); return; }
    setSaving(true);
    setError(null);
    try {
      const created = await createComplaint({
        customer_id: selectedCustomer.id,
        issue:       form.issue.trim(),
        type:        form.type,
        priority:    form.priority,
        status:      form.status,
        assigned_to: form.assigned_to || null,
      });
      const withRelations: ComplaintWithRelations = {
        ...created,
        customer:   { id: selectedCustomer.id, full_name: selectedCustomer.full_name, area_id: selectedCustomer.area_id },
        technician: form.assigned_to ? (staff.find(s => s.id === form.assigned_to) ?? null) : null,
      };
      onSaved(withRelations);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to log complaint');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} width={520}>
      <div className="modal-head">
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>Log Complaint</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Register a new customer complaint</div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      <div className="modal-body">
        {error && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#dc2626',
                        borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div className="field" style={{ marginBottom: 14, position: 'relative' }}>
          <label>Customer *</label>
          {selectedCustomer ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                          background: 'var(--bg-muted)', borderRadius: 8, border: '1px solid var(--border)' }}>
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{selectedCustomer.full_name}</span>
              <span className="mono muted" style={{ fontSize: 11 }}>{selectedCustomer.customer_code}</span>
              <button className="icon-btn" style={{ width: 22, height: 22 }}
                onClick={() => { setSelectedCustomer(null); setCustomerSearch(''); }}>
                <Icon name="close" size={12} />
              </button>
            </div>
          ) : (
            <>
              <input className="input" placeholder="Search by name or customer code…"
                value={customerSearch} onChange={e => setCustomerSearch(e.target.value)} autoFocus />
              {customerResults.length > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                              background: 'var(--bg-elev)', border: '1px solid var(--border)',
                              borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', overflow: 'hidden' }}>
                  {customerResults.map(c => (
                    <div key={c.id}
                      style={{ padding: '8px 14px', cursor: 'pointer', fontSize: 13,
                               borderBottom: '1px solid var(--border)' }}
                      onClick={() => { setSelectedCustomer(c); setCustomerResults([]); }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-muted)')}
                      onMouseLeave={e => (e.currentTarget.style.background = '')}>
                      <span style={{ fontWeight: 500 }}>{c.full_name}</span>
                      <span className="mono muted" style={{ fontSize: 11, marginLeft: 8 }}>{c.customer_code}</span>
                      <span className="muted" style={{ fontSize: 11, marginLeft: 8 }}>{c.area?.name ?? '—'}</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label>Issue Description *</label>
          <input className="input" placeholder="e.g. Frequent disconnections, slow speed at night…"
            value={form.issue} onChange={e => setForm(f => ({ ...f, issue: e.target.value }))} />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <div className="field">
            <label>Type</label>
            <select className="select" value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as ComplaintType }))}>
              <option value="connectivity">Connectivity</option>
              <option value="speed">Speed</option>
              <option value="hardware">Hardware</option>
              <option value="billing">Billing</option>
              <option value="upgrade">Upgrade</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="field">
            <label>Priority</label>
            <select className="select" value={form.priority}
              onChange={e => setForm(f => ({ ...f, priority: e.target.value as ComplaintPriority }))}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label>Assign to Technician (optional)</label>
          <select className="select" value={form.assigned_to}
            onChange={e => setForm(f => ({ ...f, assigned_to: e.target.value }))}>
            <option value="">— Unassigned —</option>
            {staff.filter(s => s.role === 'technician').map(s => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving…' : <><Icon name="plus" size={14} />Log Complaint</>}
        </button>
      </div>
    </Modal>
  );
}

function ComplaintModal({ complaint, onClose, staff }: {
  complaint: ComplaintWithRelations;
  onClose: () => void;
  staff: StaffWithArea[];
}) {
  const priLabel: Record<string, string> = { high: 'High', medium: 'Medium', low: 'Low' };
  const statusColor = (s: string) => s === 'open' ? 'red' : s === 'in_progress' ? 'amber' : 'green';
  const statusLabel = (s: string) => s === 'open' ? 'Open' : s === 'in_progress' ? 'In Progress' : 'Resolved';

  return (
    <Modal open={!!complaint} onClose={onClose} width={640}>
      <div className="modal-head">
        <div>
          <div className="row gap-sm" style={{ marginBottom: 4 }}>
            <span className="mono muted" style={{ fontSize: 12 }}>{complaint.complaint_code}</span>
            <Badge color={statusColor(complaint.status)} dot>{statusLabel(complaint.status)}</Badge>
            <span className={`pri-dot ${complaint.priority}`} />
            <span className="muted" style={{ fontSize: 12 }}>{priLabel[complaint.priority]} priority</span>
          </div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>{complaint.issue}</div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      <div className="modal-body">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 18 }}>
          {[
            { label: 'Customer', content: <div className="row gap-sm"><Avatar name={complaint.customer?.full_name ?? '?'} size={24} /><span style={{ fontSize: 13, fontWeight: 500 }}>{complaint.customer?.full_name ?? '—'}</span></div> },
            { label: 'Issue Type', content: <Badge color="blue">{complaint.type}</Badge> },
            { label: 'Opened', content: <div style={{ fontSize: 13 }}>{new Date(complaint.opened_at).toLocaleDateString('en-PK')}</div> },
            { label: 'Priority', content: <span className={`pri-dot ${complaint.priority}`} style={{ marginRight: 6 }} /> },
          ].map((item, i) => (
            <div key={i} style={{ padding: 12, background: 'var(--bg-muted)', borderRadius: 8 }}>
              <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 6 }}>{item.label}</div>
              {item.content}
            </div>
          ))}
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label>Assign to Technician</label>
          <select className="select" defaultValue={complaint.assigned_to ?? ''}>
            <option value="">— Unassigned —</option>
            {staff.filter(s => s.role === 'technician').map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
          </select>
        </div>

        <div className="field" style={{ marginBottom: 18 }}>
          <label>Status</label>
          <div className="row gap-sm">
            {(['open', 'in_progress', 'resolved'] as const).map(s => (
              <button key={s} className={`btn ${complaint.status === s ? 'btn-primary' : 'btn-secondary'} btn-sm`} style={{ flex: 1 }}>
                {statusLabel(s)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Timeline</div>
        <div className="timeline">
          <div className="tl-item done">
            <div className="ttl">Opened by customer</div>
            <div className="sub">{complaint.customer?.full_name ?? '—'} · {new Date(complaint.opened_at).toLocaleDateString('en-PK')}</div>
          </div>
          <div className={`tl-item ${complaint.technician ? 'done' : ''}`}>
            <div className="ttl">{complaint.technician ? `Assigned to ${complaint.technician.full_name}` : 'Awaiting assignment'}</div>
            <div className="sub">{complaint.technician ? 'Technician notified via SMS' : 'No technician selected yet'}</div>
          </div>
          <div className={`tl-item ${complaint.status === 'in_progress' ? 'active' : complaint.status === 'resolved' ? 'done' : ''}`}>
            <div className="ttl">In progress</div>
            <div className="sub">{complaint.status === 'resolved' ? 'Work completed on-site' : complaint.status === 'in_progress' ? 'Technician on-site investigating' : '—'}</div>
          </div>
          <div className={`tl-item ${complaint.status === 'resolved' ? 'done' : ''}`}>
            <div className="ttl">Resolved</div>
            <div className="sub">{complaint.status === 'resolved' ? 'Customer confirmation received' : '—'}</div>
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Close</button>
        <button className="btn btn-primary"><Icon name="check" size={14} />Save changes</button>
      </div>
    </Modal>
  );
}

export default function ComplaintsPage() {
  const [complaints, setComplaints] = useState<ComplaintWithRelations[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [staff, setStaff] = useState<StaffWithArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('kanban');
  const [open, setOpen] = useState<ComplaintWithRelations | null>(null);
  const [logOpen, setLogOpen] = useState(false);

  useEffect(() => {
    Promise.all([getComplaints(), getAreas(), getStaff()])
      .then(([c, a, s]) => { setComplaints(c); setAreas(a); setStaff(s); })
      .finally(() => setLoading(false));
  }, []);

  const handleComplaintSaved = (c: ComplaintWithRelations) => {
    setComplaints(prev => [c, ...prev]);
  };

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="muted">Loading complaints…</div>
    </div>
  );

  const byStatus = {
    open:        complaints.filter(c => c.status === 'open'),
    in_progress: complaints.filter(c => c.status === 'in_progress'),
    resolved:    complaints.filter(c => c.status === 'resolved'),
  };

  const priLabel: Record<string, string> = { high: 'High', medium: 'Med', low: 'Low' };
  const statusColor = (s: string) => s === 'open' ? 'red' : s === 'in_progress' ? 'amber' : 'green';
  const statusLabel = (s: string) => s === 'open' ? 'Open' : s === 'in_progress' ? 'In Progress' : 'Resolved';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Complaint Management</h1>
          <p>{complaints.length} total · {byStatus.open.length} open · {complaints.filter(c => !c.assigned_to).length} unassigned</p>
        </div>
        <div className="row gap-sm">
          <Tabs value={view} onChange={setView} items={[{ value: 'kanban', label: 'Board' }, { value: 'list', label: 'List' }]} />
          <button className="btn btn-primary" onClick={() => setLogOpen(true)}><Icon name="plus" size={14} />Log Complaint</button>
        </div>
      </div>

      <div className="kpi-row" style={{ marginBottom: 16 }}>
        {[
          { key: 'open',        label: 'Open',        color: '#EF4444', bg: '#FEF2F2', trend: 'needs attention', value: byStatus.open.length },
          { key: 'in_progress', label: 'In Progress', color: '#F59E0B', bg: '#FFFBEB', trend: 'being handled',   value: byStatus.in_progress.length },
          { key: 'resolved',    label: 'Resolved',    color: '#22C55E', bg: '#F0FDF4', trend: 'completed',        value: byStatus.resolved.length },
        ].map(k => (
          <div key={k.key} className="kpi-card" style={{ '--kpi-color': k.color, '--kpi-bg': k.bg } as React.CSSProperties}>
            <div className="kpi-glow" />
            <div className="kpi-head"><span className="kpi-label">{k.label}</span><span className="kpi-bolt" style={{ background: k.color }} /></div>
            <div className="kpi-value num">{k.value}</div>
            <div className="kpi-foot"><span className="kpi-trend">{k.trend}</span></div>
          </div>
        ))}
      </div>

      <div className="filter-bar">
        <select className="select" style={{ width: 'auto' }}>
          <option>All areas</option>
          {areas.map(a => <option key={a.id}>{a.name}</option>)}
        </select>
        <select className="select" style={{ width: 'auto' }}>
          <option>All types</option><option>Connectivity</option><option>Speed</option><option>Hardware</option><option>Billing</option>
        </select>
        <select className="select" style={{ width: 'auto' }}>
          <option>All priorities</option><option>High</option><option>Medium</option><option>Low</option>
        </select>
        <div className="spacer" />
        <button className="btn btn-ghost btn-sm"><Icon name="refresh" size={14} />Refresh</button>
      </div>

      {complaints.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 14 }}>No complaints logged yet</div>
        </div>
      ) : view === 'kanban' ? (
        <div className="kanban">
          {(['open', 'in_progress', 'resolved'] as const).map(col => {
            const color = col === 'open' ? '#EF4444' : col === 'in_progress' ? '#F59E0B' : '#22C55E';
            return (
              <div key={col} className="kanban-col">
                <div className="kanban-col-head">
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: color, display: 'inline-block' }} />
                  <span className="title">{statusLabel(col)}</span>
                  <span className="cnt">{byStatus[col].length}</span>
                </div>
                <div className="kanban-col-cards">
                  {byStatus[col].map(c => (
                    <div key={c.id} className="kanban-card" onClick={() => setOpen(c)}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <span className="id">{c.complaint_code}</span>
                        <div className="row gap-sm">
                          <span className={`pri-dot ${c.priority}`} />
                          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{priLabel[c.priority]}</span>
                        </div>
                      </div>
                      <div className="issue">{c.issue}</div>
                      <div className="row gap-sm" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                        <Icon name="user" size={12} />{c.customer?.full_name ?? '—'}
                      </div>
                      <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div className="assignee">
                          {c.technician
                            ? <><Avatar name={c.technician.full_name} size={20} /><span>{c.technician.full_name}</span></>
                            : <span style={{ fontStyle: 'italic' }}>Unassigned</span>}
                        </div>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }} className="row gap-sm">
                          <Icon name="clock" size={11} />{new Date(c.opened_at).toLocaleDateString('en-PK')}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>ID</th><th>Issue</th><th>Customer</th><th>Priority</th><th>Technician</th><th>Status</th><th>Opened</th></tr></thead>
            <tbody>
              {complaints.map(c => (
                <tr key={c.id} className="clickable" onClick={() => setOpen(c)}>
                  <td className="mono" style={{ fontSize: 12 }}>{c.complaint_code}</td>
                  <td style={{ fontWeight: 500 }}>{c.issue}</td>
                  <td>{c.customer?.full_name ?? '—'}</td>
                  <td><span className={`pri-dot ${c.priority}`} style={{ marginRight: 6 }} /><span style={{ fontSize: 12 }}>{priLabel[c.priority]}</span></td>
                  <td>{c.technician?.full_name ?? <span className="muted" style={{ fontStyle: 'italic' }}>Unassigned</span>}</td>
                  <td><Badge color={statusColor(c.status)} dot>{statusLabel(c.status)}</Badge></td>
                  <td className="muted" style={{ fontSize: 12 }}>{new Date(c.opened_at).toLocaleDateString('en-PK')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && <ComplaintModal complaint={open} onClose={() => setOpen(null)} staff={staff} />}
      {logOpen && (
        <LogComplaintModal
          onClose={() => setLogOpen(false)}
          staff={staff}
          onSaved={handleComplaintSaved}
        />
      )}
    </div>
  );
}
