'use client';
import React, { useState, useEffect } from 'react';
import Icon from '../Icon';
import { Badge, Switch, Modal } from '../ui';
import { getStaff, createStaff } from '@/lib/db/staff';
import { getAreas } from '@/lib/db/areas';
import { initials, avClass } from '@/lib/utils';
import type { Staff, StaffWithArea, Area } from '@/types/database';

function AddStaffModal({ open, onClose, areas, onSaved }: {
  open: boolean;
  onClose: () => void;
  areas: Area[];
  onSaved: (s: Staff) => void;
}) {
  const [form, setForm]   = useState({ full_name: '', phone: '', role: 'technician', area_id: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!form.full_name.trim()) { setError('Name required'); return; }
    setSaving(true);
    setError(null);
    try {
      const created = await createStaff({
        full_name: form.full_name.trim(),
        role:      form.role as 'technician' | 'recovery_agent',
        phone:     form.phone || null,
        area_id:   form.area_id || null,
        is_active: true,
      });
      onSaved(created);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create account');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose}>
      <div className="modal-head">
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>Add Staff Member</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Create a technician or recovery agent account</div>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <div className="field">
            <label>Full Name</label>
            <input className="input" placeholder="e.g. Mohsin Raza"
              value={form.full_name} onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))} />
          </div>
          <div className="field">
            <label>Phone</label>
            <input className="input" placeholder="+92 3——"
              value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
          </div>
          <div className="field">
            <label>Role</label>
            <select className="select" value={form.role}
              onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
              <option value="technician">Technician</option>
              <option value="recovery_agent">Recovery Agent</option>
            </select>
          </div>
          <div className="field">
            <label>Assigned Area</label>
            <select className="select" value={form.area_id}
              onChange={e => setForm(f => ({ ...f, area_id: e.target.value }))}>
              <option value="">— None —</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ padding: 14, background: 'var(--bg-muted)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <div className="row gap-sm" style={{ marginBottom: 6 }}>
            <Icon name="key" size={14} style={{ color: 'var(--blue)' }} />
            <div style={{ fontSize: 13, fontWeight: 600 }}>Auto-generated credentials</div>
          </div>
          <div className="muted" style={{ fontSize: 11 }}>
            A username and temporary password will be assigned when this staff member logs in for the first time.
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
          <Icon name="check" size={14} />{saving ? 'Creating…' : 'Create Account'}
        </button>
      </div>
    </Modal>
  );
}

export default function StaffPage() {
  const [staff, setStaff] = useState<StaffWithArea[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(false);
  const [activeMap, setActiveMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    Promise.all([getStaff(), getAreas()])
      .then(([s, a]) => {
        setStaff(s);
        setAreas(a);
        const map: Record<string, boolean> = {};
        s.forEach(m => { map[m.id] = m.is_active; });
        setActiveMap(map);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleStaffSaved = (s: Staff) => {
    const withArea: StaffWithArea = { ...s, area: areas.find(a => a.id === s.area_id) ?? null };
    setStaff(prev => [...prev, withArea]);
    setActiveMap(prev => ({ ...prev, [s.id]: s.is_active }));
  };

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="muted">Loading staff…</div>
    </div>
  );

  const technicians = staff.filter(s => s.role === 'technician');
  const agents = staff.filter(s => s.role === 'recovery_agent');

  const roleLabel = (role: string) => role === 'technician' ? 'Technician' : role === 'recovery_agent' ? 'Recovery Agent' : 'Admin';

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Staff Management</h1>
          <p>{staff.length} field staff · {technicians.length} technicians · {agents.length} recovery agents</p>
        </div>
        <div className="row gap-sm">
          <button className="btn btn-secondary"><Icon name="filter" size={14} />Filter</button>
          <button className="btn btn-primary" onClick={() => setModal(true)}><Icon name="plus" size={14} />Add Staff Member</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
        {staff.map(s => (
          <div key={s.id} className="card staff-card lift">
            <div className="head">
              <span className={`av ${avClass(s.full_name)}`} style={{ width: 44, height: 44, fontSize: 14 }}>{initials(s.full_name)}</span>
              <div className="who">
                <div className="nm">{s.full_name}</div>
                <div className="ph mono">{s.phone ?? '—'}</div>
              </div>
              <Badge color={s.role === 'technician' ? 'blue' : 'amber'}>{roleLabel(s.role)}</Badge>
            </div>

            <div className="row gap-sm" style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              <Icon name="pin" size={14} />{s.area?.name ?? 'No area assigned'}
              <span style={{ margin: '0 6px' }}>·</span>
              <Icon name="mail" size={14} />{s.full_name.toLowerCase().split(' ').join('.')}@powernet.pk
            </div>

            <div className="stats-row">
              <div className="stat-mini">
                <div className="k">Complaints handled</div>
                <div className="v num">—</div>
              </div>
              <div className="stat-mini">
                <div className="k">Collections done</div>
                <div className="v num">—</div>
              </div>
            </div>

            <div className="foot">
              <div className="row gap-sm">
                <Switch
                  on={activeMap[s.id] ?? s.is_active}
                  onChange={v => setActiveMap(prev => ({ ...prev, [s.id]: v }))}
                />
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {(activeMap[s.id] ?? s.is_active) ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="row gap-sm">
                <button className="btn btn-secondary btn-sm"><Icon name="key" size={12} />View Credentials</button>
                <button className="icon-btn" style={{ width: 32, height: 32 }}><Icon name="moreV" size={14} /></button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <AddStaffModal open={modal} onClose={() => setModal(false)} areas={areas} onSaved={handleStaffSaved} />
    </div>
  );
}
