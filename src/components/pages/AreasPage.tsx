'use client';
import React, { useState, useEffect } from 'react';
import Icon from '../Icon';
import { Badge, Modal } from '../ui';
import { getAreas, createArea, updateArea, getAreaCustomerCounts } from '@/lib/db/areas';
import { getStaff } from '@/lib/db/staff';
import type { Area, StaffWithArea } from '@/types/database';

const pins = [
  { x: 22, y: 30 }, { x: 52, y: 22 }, { x: 38, y: 52 }, { x: 64, y: 48 },
  { x: 28, y: 72 }, { x: 72, y: 68 }, { x: 82, y: 35 }, { x: 45, y: 40 },
];

function AreaFormModal({ area, onClose, onSaved }: {
  area?: Area;
  onClose: () => void;
  onSaved: (a: Area) => void;
}) {
  const [form, setForm] = useState({
    name: area?.name ?? '',
    code: area?.code ?? '',
    type: (area?.type ?? 'civilian') as 'garrison' | 'civilian',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!form.name.trim()) { setError('Name required'); return; }
    if (!form.code.trim()) { setError('Code required'); return; }
    setSaving(true);
    setError(null);
    try {
      const saved = area
        ? await updateArea(area.id, { name: form.name.trim(), code: form.code.trim().toUpperCase(), type: form.type })
        : await createArea({ name: form.name.trim(), code: form.code.trim().toUpperCase(), type: form.type, is_active: true });
      onSaved(saved);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} width={440}>
      <div className="modal-head">
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>
            {area ? 'Edit Area' : 'Add Area'}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {area ? `Editing ${area.name}` : 'Register a new service area'}
          </div>
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="field">
            <label>Area Name</label>
            <input className="input" placeholder="e.g. Bilal Town"
              value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div className="field">
            <label>Area Code</label>
            <input className="input" placeholder="e.g. BT" maxLength={10}
              value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
            <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Short uppercase code used in customer IDs (e.g. BT, AMT, GT)</div>
          </div>
          <div className="field">
            <label>Type</label>
            <select className="select" value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value as 'garrison' | 'civilian' }))}>
              <option value="civilian">Civilian</option>
              <option value="garrison">Garrison</option>
            </select>
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
          <Icon name="check" size={14} />{saving ? 'Saving…' : area ? 'Save Changes' : 'Add Area'}
        </button>
      </div>
    </Modal>
  );
}

function AreaCard({ area, customerCount, assignedStaff, onEdit }: {
  area: Area;
  customerCount: number;
  assignedStaff: StaffWithArea[];
  onEdit: () => void;
}) {
  const techs  = assignedStaff.filter(s => s.role === 'technician');
  const agents = assignedStaff.filter(s => s.role === 'recovery_agent');

  return (
    <div className="card area-card lift">
      <div className="head">
        <div style={{ flex: 1 }}>
          <div className="title">{area.name}</div>
          <div className="city row gap-sm">
            <Icon name="pin" size={12} />
            <span className="mono" style={{ fontSize: 11 }}>{area.code}</span>
            <Badge color={area.type === 'garrison' ? 'blue' : 'green'}>
              {area.type}
            </Badge>
          </div>
        </div>
        <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={onEdit}>
          <Icon name="edit" size={14} />
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 10 }}>
        <div style={{ padding: '8px 10px', background: 'var(--bg-muted)', borderRadius: 6 }}>
          <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 2 }}>
            Customers
          </div>
          <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{customerCount}</div>
        </div>
        <div style={{ padding: '8px 10px', background: 'var(--bg-muted)', borderRadius: 6 }}>
          <div className="muted" style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600, marginBottom: 2 }}>
            Staff
          </div>
          <div className="num" style={{ fontSize: 18, fontWeight: 700 }}>{assignedStaff.length}</div>
        </div>
      </div>

      {assignedStaff.length > 0 && (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {techs.length > 0 && (
            <div className="row gap-sm" style={{ fontSize: 12 }}>
              <Icon name="wrench" size={12} style={{ color: 'var(--blue)' }} />
              <span className="muted">Tech:</span>
              <span>{techs.map(s => s.full_name).join(', ')}</span>
            </div>
          )}
          {agents.length > 0 && (
            <div className="row gap-sm" style={{ fontSize: 12 }}>
              <Icon name="briefcase" size={12} style={{ color: 'var(--amber)' }} />
              <span className="muted">Agent:</span>
              <span>{agents.map(s => s.full_name).join(', ')}</span>
            </div>
          )}
        </div>
      )}
      {assignedStaff.length === 0 && (
        <div className="muted" style={{ fontSize: 12, marginTop: 10, fontStyle: 'italic' }}>No staff assigned</div>
      )}
    </div>
  );
}

export default function AreasPage() {
  const [areas, setAreas]           = useState<Area[]>([]);
  const [staff, setStaff]           = useState<StaffWithArea[]>([]);
  const [counts, setCounts]         = useState<Record<string, number>>({});
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [addOpen, setAddOpen]       = useState(false);
  const [editTarget, setEditTarget] = useState<Area | null>(null);

  useEffect(() => {
    Promise.all([getAreas(), getStaff(), getAreaCustomerCounts()])
      .then(([a, s, c]) => { setAreas(a); setStaff(s); setCounts(c); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load areas'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="muted">Loading areas…</div>
    </div>
  );

  if (error) return (
    <div className="page">
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Data load failed</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>{error}</div>
        <button className="btn btn-primary" onClick={() => window.location.reload()}>
          <Icon name="refresh" size={14} />Retry
        </button>
      </div>
    </div>
  );

  const garrisonAreas  = areas.filter(a => a.type === 'garrison');
  const civilianAreas  = areas.filter(a => a.type === 'civilian');
  const staffForArea   = (id: string) => staff.filter(s => s.area_id === id);
  const totalCustomers = Object.values(counts).reduce((s, v) => s + v, 0);

  const handleAreaSaved = (saved: Area) => {
    setAreas(prev => {
      const idx = prev.findIndex(a => a.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next; }
      return [...prev, saved];
    });
  };

  const renderSection = (sectionAreas: Area[], title: string) =>
    sectionAreas.length > 0 ? (
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                      color: 'var(--text-muted)', marginBottom: 12 }}>
          {title}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {sectionAreas.map(a => (
            <AreaCard
              key={a.id}
              area={a}
              customerCount={counts[a.id] ?? 0}
              assignedStaff={staffForArea(a.id)}
              onEdit={() => setEditTarget(a)}
            />
          ))}
        </div>
      </div>
    ) : null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Areas & Sectors</h1>
          <p>{areas.length} service areas · {garrisonAreas.length} garrison · {civilianAreas.length} civilian · {totalCustomers} customers</p>
        </div>
        <div className="row gap-sm">
          <button className="btn btn-secondary"><Icon name="download" size={14} />Export</button>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
            <Icon name="plus" size={14} />Add Area
          </button>
        </div>
      </div>

      {renderSection(garrisonAreas, 'Garrison Areas')}
      {renderSection(civilianAreas, 'Civilian Areas')}

      {areas.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <div style={{ fontSize: 14 }}>No areas yet — click &ldquo;Add Area&rdquo; to create one.</div>
        </div>
      )}

      <div className="card">
        <div className="card-head">
          <div>
            <h3>Area Distribution</h3>
            <div className="sub">Coverage map · all service areas</div>
          </div>
          <div className="legend">
            <div className="item"><span className="sw" style={{ background: 'var(--blue)', borderRadius: '50%' }} />Garrison</div>
            <div className="item"><span className="sw" style={{ background: 'var(--green)', borderRadius: '50%' }} />Civilian</div>
          </div>
        </div>
        <div className="card-pad">
          <div className="map-placeholder">
            {areas.slice(0, pins.length).map((a, i) => (
              <div key={a.id} className="map-pin" style={{ left: `${pins[i].x}%`, top: `${pins[i].y}%` }}>
                <span className="dot" style={{
                  width: 14, height: 14,
                  background: a.type === 'garrison' ? 'var(--blue)' : 'var(--green)',
                }} />
                <span className="lbl">{a.code}</span>
              </div>
            ))}
            <div style={{ position: 'absolute', right: 14, bottom: 14, background: 'var(--bg-elev)',
                          border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px',
                          fontSize: 11, color: 'var(--text-muted)' }}>
              <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: 2 }}>Rahwali / Garrison, PK</div>
              {areas.length} areas · {totalCustomers} customers
            </div>
          </div>
        </div>
      </div>

      {addOpen && (
        <AreaFormModal onClose={() => setAddOpen(false)} onSaved={handleAreaSaved} />
      )}
      {editTarget && (
        <AreaFormModal area={editTarget} onClose={() => setEditTarget(null)} onSaved={handleAreaSaved} />
      )}
    </div>
  );
}
