'use client';
import React, { useState, useEffect } from 'react';
import Icon from '../Icon';
import { Badge, Switch, Modal } from '../ui';
import { supabase } from '@/lib/supabase';
import { getStaff, updateStaff, updateStaffPassword, deleteStaff } from '@/lib/db/staff';
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

const STAFF_ROLE_OPTIONS = [
  { value: 'technician', label: 'Technician' },
  { value: 'recovery_agent', label: 'Recovery Agent' },
  { value: 'helper', label: 'Helper' },
  { value: 'complaint_manager', label: 'Complaint Manager' },
];

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
    area_ids:  editTarget?.area_ids  ?? (editTarget?.area_id ? [editTarget.area_id] : []),
    username:  editTarget?.username  ?? '',
    password:  '',
  });
  const [showPw, setShowPw]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const set = (k: string, v: string | string[]) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.full_name.trim()) { setError('Name required'); return; }
    if (!editTarget && !form.username.trim()) { setError('Username required'); return; }
    if (!editTarget && !form.password.trim()) { setError('Password required'); return; }
    setSaving(true);
    setError(null);
    try {
      let saved: Staff;
      if (editTarget) {
        const patch: Parameters<typeof updateStaff>[1] = {
          full_name: form.full_name.trim(),
          role:      form.role,
          phone:     form.phone || null,
          area_ids:  form.area_ids,
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
              area_ids:  form.area_ids,
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
          const res = await fetch('/api/admin/create-staff', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
            body: JSON.stringify({
              username:  form.username.trim().toLowerCase(),
              password:  form.password.trim(),
              full_name: form.full_name.trim(),
              phone:     form.phone || null,
              area_ids:  form.area_ids,
              role:      form.role,
            }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error ?? 'Could not create staff');
          }
          const { staff: created } = await res.json();
          saved = created;
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
          <div style={{ padding: '10px 14px', background: 'var(--red-50)', color: 'var(--red)',
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
          <div className="field" style={{ gridColumn: 'span 2' }}>
            <label>Role *</label>
            <select className="select" value={form.role} onChange={e => set('role', e.target.value)}>
              {editTarget?.role === 'admin' && <option value="admin">Admin (fixed)</option>}
              {STAFF_ROLE_OPTIONS.map(role => (
                <option key={role.value} value={role.value}>{role.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="field" style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Assigned Areas (Multiple)</label>
          <div style={{
            border: '1px solid var(--border)',
            borderRadius: 8,
            maxHeight: 120,
            overflowY: 'auto',
            padding: '8px 12px',
            background: 'var(--bg-muted)',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '8px 12px'
          }}>
            {areas.map(a => {
              const checked = form.area_ids.includes(a.id);
              return (
                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer', userSelect: 'none' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    style={{
                      accentColor: 'var(--brand)',
                      cursor: 'pointer'
                    }}
                    onChange={() => {
                      setForm(f => {
                        const ids = f.area_ids.includes(a.id)
                          ? f.area_ids.filter(id => id !== a.id)
                          : [...f.area_ids, a.id];
                        return { ...f, area_ids: ids };
                      });
                    }}
                  />
                  <span>{a.name}</span>
                </label>
              );
            })}
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
            {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
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

// ── Delete Confirm Modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({ staff, onClose, onConfirm }: {
  staff: StaffWithArea;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const roleLabel = ROLE_LABELS[staff.role] ?? staff.role;
  const roleColor = ROLE_COLORS[staff.role] ?? 'gray';

  const handleConfirm = async () => {
    setDeleting(true);
    setError(null);
    try {
      await onConfirm();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      setDeleting(false);
    }
  };

  return (
    <Modal open onClose={onClose} width={420}>
      <div className="modal-head">
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--red)' }}>Remove Staff Member</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>This action cannot be undone</div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>

      <div className="modal-body">
        {/* Staff info card */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '14px 16px', borderRadius: 10,
          background: 'var(--bg-muted)', border: '1px solid var(--border)',
          marginBottom: 16,
        }}>
          <span className={`av ${avClass(staff.full_name)}`} style={{ width: 40, height: 40, fontSize: 13, flexShrink: 0 }}>
            {initials(staff.full_name)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14 }}>{staff.full_name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              <span style={{
                padding: '1px 7px', borderRadius: 99, fontSize: 11, fontWeight: 600,
                background: roleColor === 'blue' ? 'var(--blue-50)' : roleColor === 'amber' ? 'var(--amber-50)' :
                             roleColor === 'green' ? 'var(--green-50)' : roleColor === 'purple' ? 'var(--purple-50)' : 'var(--bg-muted)',
                color: roleColor === 'blue' ? 'var(--blue)' : roleColor === 'amber' ? 'var(--amber)' :
                        roleColor === 'green' ? 'var(--green)' : roleColor === 'purple' ? 'var(--purple)' : 'var(--text-muted)',
                border: '1px solid var(--border)',
              }}>{roleLabel}</span>
              {staff.username && (
                <span className="mono" style={{ marginLeft: 8, color: 'var(--brand)' }}>@{staff.username}</span>
              )}
            </div>
          </div>
        </div>

        <div style={{
          padding: '12px 14px', borderRadius: 8,
          background: 'var(--red-50)', border: '1px solid color-mix(in srgb, var(--red) 20%, transparent)',
          fontSize: 13, color: 'var(--red)', lineHeight: 1.5,
        }}>
          <strong>Warning:</strong> Yeh staff member permanently delete ho jaye ga.
          {DASHBOARD_ROLES.has(staff.role) && (
            <span> Inke dashboard login account bhi remove ho jaye ga.</span>
          )}
        </div>

        {error && (
          <div style={{
            marginTop: 12, padding: '10px 14px',
            background: 'var(--red-50)', color: 'var(--red)',
            borderRadius: 8, fontSize: 13,
          }}>
            {error}
          </div>
        )}
      </div>

      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose} disabled={deleting}>Cancel</button>
        <button
          className="btn"
          style={{
            background: deleting ? 'color-mix(in srgb, var(--red) 50%, transparent)' : 'var(--red)',
            color: '#fff',
            borderColor: 'transparent',
            opacity: deleting ? 0.8 : 1,
          }}
          onClick={handleConfirm}
          disabled={deleting}
        >
          <Icon name="trash" size={13} />
          {deleting ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Modal>
  );
}

// ── Staff Card ────────────────────────────────────────────────────────────────

function StaffCard({ s, onEdit, onViewCreds, onToggleActive, onDelete }: {
  s: StaffWithArea;
  onEdit: () => void;
  onViewCreds: () => void;
  onToggleActive: (v: boolean) => void;
  onDelete: () => void;
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
        <span style={{
          textOverflow: 'ellipsis',
          overflow: 'hidden',
          whiteSpace: 'nowrap',
          maxWidth: 180
        }} title={s.areas && s.areas.length > 0 ? s.areas.map(a => a.name).join(', ') : (s.area?.name ?? 'No area assigned')}>
          {s.areas && s.areas.length > 0
            ? s.areas.map(a => a.name).join(', ')
            : (s.area?.name ?? 'No area assigned')
          }
        </span>
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
          <button
            className="icon-btn"
            style={{ width: 32, height: 32 }}
            onClick={onDelete}
            title="Remove staff member"
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.background = 'var(--red-50)';
              (e.currentTarget as HTMLButtonElement).style.color = 'var(--red)';
              (e.currentTarget as HTMLButtonElement).style.borderColor = 'color-mix(in srgb, var(--red) 30%, transparent)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.background = '';
              (e.currentTarget as HTMLButtonElement).style.color = '';
              (e.currentTarget as HTMLButtonElement).style.borderColor = '';
            }}
          >
            <Icon name="trash" size={14} />
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
  const [error, setError]             = useState<string | null>(null);
  const [addOpen, setAddOpen]           = useState(false);
  const [editTarget, setEditTarget]     = useState<StaffWithArea | null>(null);
  const [credsTarget, setCredsTarget]   = useState<StaffWithArea | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffWithArea | null>(null);

  useEffect(() => {
    Promise.all([getStaff(), getAreas()])
      .then(([s, a]) => { setStaff(s); setAreas(a); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load staff'))
      .finally(() => setLoading(false));
  }, []);

  const visibleStaff = staff.filter(s => s.id !== currentStaff?.id);

  const handleSaved = (saved: Staff) => {
    const sAreaIds = saved.area_ids || [];
    const sAreas = areas.filter(a => sAreaIds.includes(a.id));
    const area = areas.find(a => a.id === saved.area_id) ?? sAreas[0] ?? null;
    const withArea: StaffWithArea = { ...saved, area, areas: sAreas };
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

  const handleDelete = async (s: StaffWithArea) => {
    await deleteStaff(s.id);
    setStaff(prev => prev.filter(m => m.id !== s.id));
    setDeleteTarget(null);
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
            onToggleActive={v => handleToggleActive(s, v)}
            onDelete={() => setDeleteTarget(s)} />
        ))}
      </div>

      <SectionHeader label="Technicians"       count={technicians.length} color="var(--blue)" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 4 }}>
        {technicians.map(s => (
          <StaffCard key={s.id} s={s}
            onEdit={() => setEditTarget(s)}
            onViewCreds={() => setCredsTarget(s)}
            onToggleActive={v => handleToggleActive(s, v)}
            onDelete={() => setDeleteTarget(s)} />
        ))}
      </div>

      <SectionHeader label="Recovery Agents"   count={agents.length}     color="var(--amber)" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14, marginBottom: 4 }}>
        {agents.map(s => (
          <StaffCard key={s.id} s={s}
            onEdit={() => setEditTarget(s)}
            onViewCreds={() => setCredsTarget(s)}
            onToggleActive={v => handleToggleActive(s, v)}
            onDelete={() => setDeleteTarget(s)} />
        ))}
      </div>

      <SectionHeader label="Helpers" count={helpers.length} color="var(--green)" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
        {helpers.map(s => (
          <StaffCard key={s.id} s={s}
            onEdit={() => setEditTarget(s)}
            onViewCreds={() => setCredsTarget(s)}
            onToggleActive={v => handleToggleActive(s, v)}
            onDelete={() => setDeleteTarget(s)} />
        ))}
      </div>

      {visibleStaff.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Icon name="briefcase" size={28} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No staff yet</div>
          <div style={{ fontSize: 13 }}>Click Add Staff to create your first staff member.</div>
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

      {deleteTarget && (
        <DeleteConfirmModal
          staff={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => handleDelete(deleteTarget)} />
      )}
    </div>
  );
}
