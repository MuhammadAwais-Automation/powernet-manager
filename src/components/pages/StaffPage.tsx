'use client';
import React, { useState, useEffect } from 'react';
import Icon from '../Icon';
import { Badge, Switch, Modal } from '../ui';
import { supabase } from '@/lib/supabase';
import { getStaff, createStaff, updateStaff, updateStaffPassword } from '@/lib/db/staff';
import { getAreas } from '@/lib/db/areas';
import { initials, avClass } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import type { Staff, StaffWithArea, Area, StaffRole } from '@/types/database';

const ROLE_LABELS: Record<string, string> = {
  technician:        'Technician',
  recovery_agent:    'Recovery Agent',
  helper:            'Helper',
  admin:             'Admin',
  complaint_manager: 'Complaint Manager',
};

const ROLE_COLORS: Record<string, 'blue' | 'amber' | 'green' | 'purple' | 'gray'> = {
  technician:        'blue',
  recovery_agent:    'amber',
  helper:            'green',
  admin:             'gray',
  complaint_manager: 'purple',
};

const DASHBOARD_ROLES = new Set(['admin', 'complaint_manager']);

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Add / Edit Staff Modal ────────────────────────────────────────────────────

function StaffFormModal({ open, onClose, areas, onSaved, editTarget }: {
  open: boolean;
  onClose: () => void;
  areas: Area[];
  onSaved: (s: Staff) => void;
  editTarget?: StaffWithArea;
}) {
  const [form, setForm] = useState({
    full_name: editTarget?.full_name ?? '',
    phone:     editTarget?.phone     ?? '',
    role:      editTarget?.role      ?? 'technician',
    area_id:   editTarget?.area_id   ?? '',
    username:  editTarget?.username  ?? '',
    password:  '',
  });
  const [showPw, setShowPw]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.full_name.trim()) { setError('Name required'); return; }
    if (!editTarget && !form.username.trim()) { setError('Username required'); return; }
    if (!editTarget && !form.password.trim()) { setError('Password required'); return; }
    setSaving(true);
    setError(null);
    try {
      let saved: Staff;
      if (editTarget) {
        const patch: Record<string, string | null> = {
          full_name: form.full_name.trim(),
          role:      form.role,
          phone:     form.phone || null,
          area_id:   form.area_id || null,
        };
        if (form.username.trim()) patch.username = form.username.trim().toLowerCase();
        saved = await updateStaff(editTarget.id, patch);
        if (form.password.trim()) await updateStaffPassword(editTarget.id, form.password.trim());
      } else {
        if (DASHBOARD_ROLES.has(form.role)) {
          const res = await fetch('/api/admin/create-dashboard-user', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
            body: JSON.stringify({
              username:  form.username.trim().toLowerCase(),
              password:  form.password.trim(),
              full_name: form.full_name.trim(),
              phone:     form.phone || null,
              area_id:   form.area_id || null,
              role:      form.role,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error ?? 'Could not create dashboard user');
          }
          const { staff: created } = await res.json();
          saved = created;
        } else {
          saved = await createStaff({
            full_name: form.full_name.trim(),
            role:      form.role,
            phone:     form.phone || null,
            area_id:   form.area_id || null,
            username:  form.username.trim().toLowerCase(),
            is_active: true,
            password:  form.password.trim(),
          });
        }
      }
      onSaved(saved);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} width={480}>
      <div className="modal-head">
        <div>
          <div style={{ fontSize: 17, fontWeight: 600, letterSpacing: '-0.01em' }}>
            {editTarget ? 'Edit Staff Member' : 'Add Staff Member'}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {editTarget ? `Editing ${editTarget.full_name}` : 'Create a new staff account'}
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

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
          <div className="field">
            <label>Full Name *</label>
            <input className="input" placeholder="e.g. Mohsin Raza"
              value={form.full_name} onChange={e => set('full_name', e.target.value)} />
          </div>
          <div className="field">
            <label>Phone</label>
            <input className="input" placeholder="0300-0000000"
              value={form.phone} onChange={e => set('phone', e.target.value)} />
          </div>
          <div className="field">
            <label>Role *</label>
            <select className="select" value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="technician">Technician</option>
              <option value="recovery_agent">Recovery Agent</option>
              <option value="helper">Helper</option>
              <option value="admin">Admin</option>
              <option value="complaint_manager">Complaint Manager</option>
            </select>
          </div>
          <div className="field">
            <label>Assigned Area</label>
            <select className="select" value={form.area_id} onChange={e => set('area_id', e.target.value)}>
              <option value="">— None —</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>

        <div style={{ background: 'var(--bg-muted)', borderRadius: 10, padding: 14,
                      border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row gap-sm">
            <Icon name="key" size={14} style={{ color: 'var(--brand)' }} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>Login Credentials</span>
            <span className="muted" style={{ fontSize: 11 }}>— Staff will use these to log in</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="field">
              <label>Username *</label>
              <input className="input" placeholder="e.g. mohsin_tech"
                value={form.username} onChange={e => set('username', e.target.value.toLowerCase().replace(/\s/g, '_'))} />
            </div>
            <div className="field">
              <label>{editTarget ? 'New Password (optional)' : 'Password *'}</label>
              <div style={{ position: 'relative' }}>
                <input
                  className="input"
                  type={showPw ? 'text' : 'password'}
                  placeholder={editTarget ? 'Leave blank to keep' : 'Set password'}
                  value={form.password}
                  onChange={e => set('password', e.target.value)}
                  style={{ paddingRight: 36 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                           background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                  <Icon name={showPw ? 'eye' : 'eyeOff'} size={14} />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
          <Icon name="check" size={14} />
          {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Create Account'}
        </button>
      </div>
    </Modal>
  );
}

// ── Credentials Modal ─────────────────────────────────────────────────────────

function CredentialsModal({ staff, onClose, onPasswordReset }: {
  staff: StaffWithArea;
  onClose: () => void;
  onPasswordReset: (s: StaffWithArea, newPw: string) => Promise<void>;
}) {
  const [resetMode, setResetMode] = useState(false);
  const [newPw, setNewPw]         = useState('');
  const [showPw, setShowPw]       = useState(false);
  const [saving, setSaving]       = useState(false);
  const [copied, setCopied]       = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1800);
  };

  const handleReset = async () => {
    if (!newPw.trim()) { setError('Password required'); return; }
    setSaving(true);
    setError(null);
    try {
      await onPasswordReset(staff, newPw.trim());
      setResetMode(false);
      setNewPw('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} width={420}>
      <div className="modal-head">
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>Login Credentials</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{staff.full_name}</div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      <div className="modal-body">
        {/* Username row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px',
                      background: 'var(--bg-muted)', borderRadius: 10, marginBottom: 10,
                      border: '1px solid var(--border)' }}>
          <div style={{ flex: 1 }}>
            <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                                             letterSpacing: '0.06em', marginBottom: 2 }}>Username</div>
            <div className="mono" style={{ fontSize: 14, fontWeight: 600 }}>
              {staff.username ?? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Not set</span>}
            </div>
          </div>
          {staff.username && (
            <button className="btn btn-secondary btn-sm" onClick={() => copy(staff.username!, 'user')}>
              {copied === 'user' ? <Icon name="check" size={12} /> : <Icon name="copy" size={12} />}
              {copied === 'user' ? 'Copied!' : 'Copy'}
            </button>
          )}
        </div>

        {/* Password reset section */}
        {!resetMode ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '12px 14px', background: 'var(--bg-muted)', borderRadius: 10,
                        border: '1px solid var(--border)' }}>
            <div>
              <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                                               letterSpacing: '0.06em', marginBottom: 2 }}>Password</div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>••••••••  (hashed, not viewable)</div>
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => setResetMode(true)}>
              <Icon name="key" size={12} />Reset
            </button>
          </div>
        ) : (
          <div style={{ padding: '12px 14px', background: 'var(--bg-muted)', borderRadius: 10,
                        border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {error && <div style={{ fontSize: 12, color: '#dc2626' }}>{error}</div>}
            <div className="field">
              <label>New Password</label>
              <div style={{ position: 'relative' }}>
                <input className="input" type={showPw ? 'text' : 'password'}
                  placeholder="Enter new password" value={newPw}
                  onChange={e => setNewPw(e.target.value)} style={{ paddingRight: 36 }} />
                <button type="button" onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                           background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                  <Icon name={showPw ? 'eye' : 'eyeOff'} size={14} />
                </button>
              </div>
            </div>
            <div className="row gap-sm">
              <button className="btn btn-ghost btn-sm" onClick={() => { setResetMode(false); setNewPw(''); }}>Cancel</button>
              <button className="btn btn-primary btn-sm" onClick={handleReset} disabled={saving}>
                {saving ? 'Saving…' : 'Set Password'}
              </button>
            </div>
          </div>
        )}

        <div style={{ marginTop: 14, padding: '10px 14px', background: 'var(--brand-50)',
                      borderRadius: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          <strong style={{ color: 'var(--brand)' }}>Flutter App:</strong> Staff will use these credentials to log in to the mobile app.
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-primary" onClick={onClose}>Done</button>
      </div>
    </Modal>
  );
}

// ── Staff Card ────────────────────────────────────────────────────────────────

function StaffCard({ s, onEdit, onViewCreds, onToggleActive }: {
  s: StaffWithArea;
  onEdit: () => void;
  onViewCreds: () => void;
  onToggleActive: (v: boolean) => void;
}) {
  const roleLabel = ROLE_LABELS[s.role] ?? s.role;
  const roleColor = ROLE_COLORS[s.role] ?? 'gray';

  return (
    <div className="card staff-card lift">
      <div className="head">
        <span className={`av ${avClass(s.full_name)}`} style={{ width: 44, height: 44, fontSize: 14 }}>
          {initials(s.full_name)}
        </span>
        <div className="who" style={{ flex: 1, minWidth: 0 }}>
          <div className="nm">{s.full_name}</div>
          <div className="ph mono" style={{ fontSize: 11 }}>
            {s.username
              ? <span style={{ color: 'var(--brand)' }}>@{s.username}</span>
              : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>no username</span>
            }
          </div>
        </div>
        <Badge color={roleColor}>{roleLabel}</Badge>
      </div>

      <div className="row gap-sm" style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
        <Icon name="pin" size={13} />
        <span>{s.area?.name ?? 'No area assigned'}</span>
        {s.phone && (
          <>
            <span style={{ margin: '0 4px' }}>·</span>
            <Icon name="phone" size={13} />
            <span className="mono">{s.phone}</span>
          </>
        )}
      </div>

      <div className="foot" style={{ marginTop: 12 }}>
        <div className="row gap-sm">
          <Switch on={s.is_active} onChange={onToggleActive} />
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {s.is_active ? 'Active' : 'Inactive'}
          </span>
        </div>
        <div className="row gap-sm">
          <button className="btn btn-secondary btn-sm" onClick={onViewCreds}>
            <Icon name="key" size={12} />Credentials
          </button>
          <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={onEdit}>
            <Icon name="edit" size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StaffPage() {
  const { staff: currentStaff } = useAuth();
  const [staff, setStaff]             = useState<StaffWithArea[]>([]);
  const [areas, setAreas]             = useState<Area[]>([]);
  const [loading, setLoading]         = useState(true);
  const [addOpen, setAddOpen]         = useState(false);
  const [editTarget, setEditTarget]   = useState<StaffWithArea | null>(null);
  const [credsTarget, setCredsTarget] = useState<StaffWithArea | null>(null);

  useEffect(() => {
    Promise.all([getStaff(), getAreas()])
      .then(([s, a]) => { setStaff(s); setAreas(a); })
      .finally(() => setLoading(false));
  }, []);

  const visibleStaff = staff.filter(s => s.id !== currentStaff?.id);

  const handleSaved = (saved: Staff) => {
    const area = areas.find(a => a.id === saved.area_id) ?? null;
    const withArea: StaffWithArea = { ...saved, area };
    setStaff(prev => {
      const idx = prev.findIndex(s => s.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = withArea; return next; }
      return [...prev, withArea];
    });
  };

  const handleToggleActive = async (s: StaffWithArea, val: boolean) => {
    setStaff(prev => prev.map(m => m.id === s.id ? { ...m, is_active: val } : m));
    try {
      const { updateStaff } = await import('@/lib/db/staff');
      await updateStaff(s.id, { is_active: val });
    } catch {
      setStaff(prev => prev.map(m => m.id === s.id ? { ...m, is_active: !val } : m));
    }
  };

  const handlePasswordReset = async (s: StaffWithArea, newPw: string) => {
    if (s.auth_user_id) {
      const res = await fetch('/api/admin/reset-dashboard-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
        body: JSON.stringify({ auth_user_id: s.auth_user_id, password: newPw }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Could not reset password');
      }
    } else {
      await updateStaffPassword(s.id, newPw);
    }
  };

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="muted">Loading staff…</div>
    </div>
  );

  const byRole = (role: StaffRole) => visibleStaff.filter(s => s.role === role);
  const dashUsers   = visibleStaff.filter(s => DASHBOARD_ROLES.has(s.role));
  const technicians = byRole('technician');
  const agents      = byRole('recovery_agent');
  const helpers     = byRole('helper');

  const SectionHeader = ({ label, count, color }: { label: string; count: number; color: string }) =>
    count > 0 ? (
      <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                    color: 'var(--text-muted)', marginBottom: 10, marginTop: 20, display: 'flex',
                    alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, display: 'inline-block' }} />
        {label} · {count}
      </div>
    ) : null;

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Staff Management</h1>
          <p>
            {visibleStaff.length} total · {dashUsers.length} dashboard · {technicians.length} technicians · {agents.length} recovery agents
            {helpers.length > 0 ? ` · ${helpers.length} helpers` : ''}
          </p>
        </div>
        <div className="row gap-sm">
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
            <Icon name="plus" size={14} />Add Staff
          </button>
        </div>
      </div>

      <SectionHeader label="Dashboard Users" count={dashUsers.length} color="var(--purple)" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 4 }}>
        {dashUsers.map(s => (
          <StaffCard key={s.id} s={s}
            onEdit={() => setEditTarget(s)}
            onViewCreds={() => setCredsTarget(s)}
            onToggleActive={v => handleToggleActive(s, v)} />
        ))}
      </div>

      <SectionHeader label="Technicians"       count={technicians.length} color="var(--blue)" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 4 }}>
        {technicians.map(s => (
          <StaffCard key={s.id} s={s}
            onEdit={() => setEditTarget(s)}
            onViewCreds={() => setCredsTarget(s)}
            onToggleActive={v => handleToggleActive(s, v)} />
        ))}
      </div>

      <SectionHeader label="Recovery Agents"   count={agents.length}     color="var(--amber)" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 4 }}>
        {agents.map(s => (
          <StaffCard key={s.id} s={s}
            onEdit={() => setEditTarget(s)}
            onViewCreds={() => setCredsTarget(s)}
            onToggleActive={v => handleToggleActive(s, v)} />
        ))}
      </div>

      <SectionHeader label="Helpers" count={helpers.length} color="var(--green)" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {helpers.map(s => (
          <StaffCard key={s.id} s={s}
            onEdit={() => setEditTarget(s)}
            onViewCreds={() => setCredsTarget(s)}
            onToggleActive={v => handleToggleActive(s, v)} />
        ))}
      </div>

      {visibleStaff.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Icon name="briefcase" size={28} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No staff yet</div>
          <div style={{ fontSize: 13 }}>Click "Add Staff" to create your first staff member.</div>
        </div>
      )}

      <StaffFormModal open={addOpen} onClose={() => setAddOpen(false)}
        areas={areas} onSaved={handleSaved} />

      {editTarget && (
        <StaffFormModal open onClose={() => setEditTarget(null)}
          areas={areas} onSaved={s => { handleSaved(s); setEditTarget(null); }}
          editTarget={editTarget} />
      )}

      {credsTarget && (
        <CredentialsModal
          staff={credsTarget}
          onClose={() => setCredsTarget(null)}
          onPasswordReset={handlePasswordReset} />
      )}
    </div>
  );
}
