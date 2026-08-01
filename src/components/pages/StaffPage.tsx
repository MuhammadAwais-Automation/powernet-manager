'use client';
import React, { useState, useEffect } from 'react';
import Icon from '../Icon';
import { Badge, Switch, Modal, Drawer, Tabs } from '../ui';
import { supabase } from '@/lib/supabase';
import { getStaff, updateStaff, updateStaffPassword, getStaffActivity, invalidateStaffCache, type StaffActivity } from '@/lib/db/staff';
import { getAreas } from '@/lib/db/areas';
import { getTeams, createTeam, updateTeam, deleteTeam, updateTeamMembers } from '@/lib/db/teams';
import { initials, avClass } from '@/lib/utils';
import { useAuth } from '@/lib/auth/auth-context';
import { ALL_PAGE_IDS, PAGE_LABELS, getAllowedPages, type PageId } from '@/lib/auth/permissions';
import { formatPromisedDate, formatVisitNote } from '@/lib/notifications/billing';
import type { Staff, StaffWithArea, Area, StaffRole, Team, TeamWithMembers } from '@/types/database';

const ROLE_LABELS: Record<string, string> = {
  technician:        'Internet Technician',
  cable_technician:  'Cable Technician',
  recovery_agent:    'Recovery Agent',
  helper:            'Helper',
  admin:             'Admin',
  complaint_manager: 'Custom Access',
};

const ROLE_COLORS: Record<string, 'blue' | 'amber' | 'green' | 'purple' | 'gray' | 'teal'> = {
  technician:        'blue',
  cable_technician:  'purple',
  recovery_agent:    'amber',
  helper:            'green',
  admin:             'gray',
  complaint_manager: 'teal',
};

const ROLE_ACCENT: Record<string, string> = {
  technician:        'var(--blue)',
  cable_technician:  'var(--purple)',
  recovery_agent:    'var(--amber)',
  helper:            'var(--green)',
  admin:             'var(--color-primary)',
  complaint_manager: '#0D9488',
};

const ROLE_DOT: Record<string, string> = {
  admin:             'var(--color-primary)',
  complaint_manager: '#0D9488',
  technician:        'var(--blue)',
  cable_technician:  'var(--purple)',
  recovery_agent:    'var(--amber)',
  helper:            'var(--green)',
};

const DASHBOARD_ROLES = new Set(['admin', 'complaint_manager']);

const MOBILE_STAFF_ROLE_OPTIONS = [
  { value: 'technician', label: 'Internet Technician' },
  { value: 'cable_technician', label: 'Cable Technician' },
  { value: 'recovery_agent', label: 'Recovery Agent' },
  { value: 'helper', label: 'Helper' },
] as const;

const DASHBOARD_STAFF_ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'complaint_manager', label: 'Custom Access' },
] as const;

const DEFAULT_CUSTOM_PAGES: PageId[] = ['complaints', 'customers'];

async function getAuthHeaders(): Promise<Record<string, string>> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── Add / Edit Staff Modal ────────────────────────────────────────────────────

function StaffFormModal({ open, onClose, areas, onSaved, editTarget, activeAdminCount }: {
  open: boolean;
  onClose: () => void;
  areas: Area[];
  onSaved: (s: Staff) => void;
  editTarget?: StaffWithArea;
  activeAdminCount: number;
}) {
  const initialPages = editTarget
    ? (editTarget.role === 'admin'
      ? [...ALL_PAGE_IDS]
      : getAllowedPages(editTarget))
    : [...DEFAULT_CUSTOM_PAGES];

  const [form, setForm] = useState({
    full_name: editTarget?.full_name ?? '',
    phone:     editTarget?.phone     ?? '',
    role:      editTarget?.role      ?? 'technician',
    area_ids:  editTarget?.area_ids  ?? (editTarget?.area_id ? [editTarget.area_id] : []),
    cable_area_ids: editTarget?.cable_area_ids ?? [],
    username:  editTarget?.username  ?? '',
    password:  '',
    allowed_pages: initialPages as PageId[],
  });
  const [showPw, setShowPw]   = useState(false);
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const set = (k: string, v: string | string[]) => setForm(f => ({ ...f, [k]: v }));

  const isDashboardRole = DASHBOARD_ROLES.has(form.role);
  const isAdminRole = form.role === 'admin';
  const isCustomAccess = form.role === 'complaint_manager';

  const handleRoleChange = (role: string) => {
    const nextRole = role as StaffRole;
    setForm(f => {
      let pages = f.allowed_pages;
      if (nextRole === 'admin') pages = [...ALL_PAGE_IDS];
      else if (nextRole === 'complaint_manager' && (f.role === 'admin' || pages.length === 0)) {
        pages = [...DEFAULT_CUSTOM_PAGES];
      }
      return { ...f, role: nextRole, allowed_pages: pages };
    });
  };

  const togglePage = (page: PageId) => {
    if (isAdminRole) return;
    setForm(f => {
      const has = f.allowed_pages.includes(page);
      const next = has
        ? f.allowed_pages.filter(p => p !== page)
        : [...f.allowed_pages, page];
      return { ...f, allowed_pages: next };
    });
  };

  const handleSubmit = async () => {
    if (!form.full_name.trim()) { setError('Name required'); return; }
    if (!editTarget && !form.username.trim()) { setError('Username required'); return; }
    if (!editTarget && !form.password.trim()) { setError('Password required'); return; }
    if (isCustomAccess && form.allowed_pages.length === 0) {
      setError('Select at least one page for custom access');
      return;
    }
    if (
      editTarget?.role === 'admin' &&
      form.role !== 'admin' &&
      activeAdminCount <= 1
    ) {
      setError('Cannot demote the last active admin');
      return;
    }
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
          cable_area_ids: form.cable_area_ids,
          allowed_pages: form.role === 'admin'
            ? null
            : form.role === 'complaint_manager'
              ? form.allowed_pages
              : null,
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
              cable_area_ids: form.cable_area_ids,
              role:      form.role,
              allowed_pages: form.role === 'complaint_manager' ? form.allowed_pages : null,
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
              cable_area_ids: form.cable_area_ids,
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
    <Modal open={open} onClose={onClose} width={520}>
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
            <select className="select" value={form.role} onChange={e => handleRoleChange(e.target.value)}>
              <optgroup label="Mobile App Roles">
                {MOBILE_STAFF_ROLE_OPTIONS.map(role => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </optgroup>
              <optgroup label="Dashboard Roles">
                {DASHBOARD_STAFF_ROLE_OPTIONS.map(role => (
                  <option key={role.value} value={role.value}>{role.label}</option>
                ))}
              </optgroup>
            </select>
            <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
              Admin has full access. Custom access lets you pick sections below.
            </div>
          </div>
        </div>

        {isDashboardRole && (
          <div className="field" style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Page access</label>
            <div style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '10px 12px',
              background: 'var(--bg-muted)',
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 8,
            }}>
              {ALL_PAGE_IDS.map(page => {
                const checked = isAdminRole || form.allowed_pages.includes(page);
                return (
                  <label key={page} style={{
                    display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                    cursor: isAdminRole ? 'default' : 'pointer', userSelect: 'none',
                    opacity: isAdminRole ? 0.85 : 1,
                  }}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={isAdminRole}
                      style={{ accentColor: 'var(--brand)', cursor: isAdminRole ? 'default' : 'pointer' }}
                      onChange={() => togglePage(page)}
                    />
                    <span>{PAGE_LABELS[page]}</span>
                  </label>
                );
              })}
            </div>
            {isAdminRole && (
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                Admins always have access to every section.
              </div>
            )}
            {isCustomAccess && (
              <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
                Only selected sections appear in their sidebar.
              </div>
            )}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
          <div className="field">
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Assigned Internet Areas</label>
            <div style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              maxHeight: 120,
              overflowY: 'auto',
              padding: '8px 12px',
              background: 'var(--bg-muted)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
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

          <div className="field">
            <label style={{ display: 'block', marginBottom: 6, fontWeight: 500 }}>Assigned Cable Areas</label>
            <div style={{
              border: '1px solid var(--border)',
              borderRadius: 8,
              maxHeight: 120,
              overflowY: 'auto',
              padding: '8px 12px',
              background: 'var(--bg-muted)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8
            }}>
              {areas.map(a => {
                const checked = form.cable_area_ids.includes(a.id);
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
                          const ids = f.cable_area_ids.includes(a.id)
                            ? f.cable_area_ids.filter(id => id !== a.id)
                            : [...f.cable_area_ids, a.id];
                          return { ...f, cable_area_ids: ids };
                        });
                      }}
                    />
                    <span>{a.name}</span>
                  </label>
                );
              })}
            </div>
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
  const [resetMode, setResetMode]           = useState(false);
  const [newPw, setNewPw]                   = useState('');
  const [activePassword, setActivePassword] = useState<string | null>(null);
  const [showPw, setShowPw]                 = useState(true);
  const [saving, setSaving]                 = useState(false);
  const [copied, setCopied]                 = useState<string | null>(null);
  const [error, setError]                   = useState<string | null>(null);

  const roleLabel = ROLE_LABELS[staff.role] ?? staff.role;
  const roleColor = ROLE_COLORS[staff.role] ?? 'gray';

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const generateRandomPassword = () => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz';
    let randStr = '';
    for (let i = 0; i < 6; i++) {
      randStr += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const gen = `Pass@${randStr}`;
    setNewPw(gen);
    setShowPw(true);
  };

  const handleReset = async (pwToSet?: string) => {
    const targetPw = (pwToSet || newPw).trim();
    if (!targetPw) { setError('Password required'); return; }
    setSaving(true);
    setError(null);
    try {
      await onPasswordReset(staff, targetPw);
      setActivePassword(targetPw);
      setShowPw(true);
      setResetMode(false);
      setNewPw('');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Reset failed');
    } finally {
      setSaving(false);
    }
  };

  const shareText = `🔐 PowerNet Staff Access\nStaff: ${staff.full_name}\nUsername: ${staff.username || 'Not set'}\nPassword: ${activePassword || '(Not changed)'}\nRole: ${roleLabel}\nApp: Mobile Staff App`;

  return (
    <Modal open onClose={onClose} width={440}>
      <div className="modal-head" style={{ borderBottom: '1px solid var(--border)', padding: '16px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 42,
            height: 42,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, var(--brand), #ff7a50)',
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 15,
            boxShadow: '0 2px 8px rgba(240, 90, 43, 0.25)'
          }}>
            {initials(staff.full_name)}
          </div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.2 }}>{staff.full_name}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
              <Badge color={roleColor}>{roleLabel}</Badge>
              <span style={{ fontSize: 11, color: staff.is_active ? 'var(--green)' : 'var(--text-muted)', fontWeight: 600 }}>
                • {staff.is_active ? 'Active Account' : 'Inactive'}
              </span>
            </div>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>

      <div className="modal-body" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Username Card */}
        <div style={{
          padding: '14px 16px',
          background: 'var(--bg-muted)',
          borderRadius: 12,
          border: '1px solid var(--border)',
          borderLeft: '4px solid var(--brand)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div>
            <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
              Username / Login ID
            </div>
            <div className="mono" style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-main)' }}>
              {staff.username ?? <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>Not set</span>}
            </div>
          </div>
          {staff.username && (
            <button className="btn btn-secondary btn-sm" style={{ borderRadius: 8, gap: 6 }} onClick={() => copy(staff.username!, 'user')}>
              {copied === 'user' ? <Icon name="check" size={13} /> : <Icon name="copy" size={13} />}
              {copied === 'user' ? 'Copied' : 'Copy'}
            </button>
          )}
        </div>

        {/* Password Card */}
        <div style={{
          padding: '14px 16px',
          background: 'var(--bg-muted)',
          borderRadius: 12,
          border: '1px solid var(--border)',
          borderLeft: '4px solid #3b82f6',
          display: 'flex',
          flexDirection: 'column',
          gap: 12
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div className="muted" style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
                Account Password
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="mono" style={{ fontSize: 15, fontWeight: 700, letterSpacing: showPw ? '0.02em' : '0.15em' }}>
                  {activePassword
                    ? (showPw ? activePassword : '••••••••••••')
                    : (showPw ? '••••••••' : '••••••••')}
                </span>
                {activePassword && (
                  <span style={{ fontSize: 10, background: 'rgba(34, 197, 94, 0.15)', color: 'var(--green)', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>
                    Newly Updated
                  </span>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(activePassword || resetMode) && (
                <button className="btn btn-ghost btn-sm" style={{ padding: '6px 8px' }} onClick={() => setShowPw(v => !v)} title={showPw ? 'Hide password' : 'Show password'}>
                  <Icon name={showPw ? 'eyeOff' : 'eye'} size={14} />
                </button>
              )}
              {activePassword && (
                <button className="btn btn-secondary btn-sm" style={{ borderRadius: 8, gap: 6 }} onClick={() => copy(activePassword, 'pw')}>
                  {copied === 'pw' ? <Icon name="check" size={13} /> : <Icon name="copy" size={13} />}
                  {copied === 'pw' ? 'Copied' : 'Copy'}
                </button>
              )}
              {!resetMode && (
                <button className="btn btn-secondary btn-sm" style={{ borderRadius: 8, gap: 4 }} onClick={() => setResetMode(true)}>
                  <Icon name="key" size={13} /> {activePassword ? 'Change' : 'Set / Reset'}
                </button>
              )}
            </div>
          </div>

          {/* Reset / Set Password Form */}
          {resetMode && (
            <div style={{
              marginTop: 4,
              paddingTop: 12,
              borderTop: '1px dashed var(--border)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10
            }}>
              {error && <div style={{ fontSize: 12, color: 'var(--red)', fontWeight: 500 }}>{error}</div>}
              <div className="field" style={{ margin: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: 11, fontWeight: 600 }}>New Password</label>
                  <button type="button" onClick={generateRandomPassword} style={{ background: 'none', border: 'none', color: 'var(--brand)', cursor: 'pointer', fontSize: 11, fontWeight: 600, padding: 0 }}>
                    ⚡ Quick Generate
                  </button>
                </div>
                <div style={{ position: 'relative' }}>
                  <input
                    className="input"
                    type={showPw ? 'text' : 'password'}
                    placeholder="Enter or generate password"
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    style={{ paddingRight: 38, fontSize: 13 }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(v => !v)}
                    style={{
                      position: 'absolute',
                      right: 8,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: 'var(--text-muted)',
                      padding: 4
                    }}
                  >
                    <Icon name={showPw ? 'eyeOff' : 'eye'} size={14} />
                  </button>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { setResetMode(false); setNewPw(''); setError(null); }}>
                  Cancel
                </button>
                <button className="btn btn-primary btn-sm" onClick={() => handleReset()} disabled={saving}>
                  <Icon name="check" size={13} />
                  {saving ? 'Saving…' : 'Save & View Password'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Share Credentials Box */}
        <div style={{
          padding: '12px 14px',
          background: 'var(--bg-elev)',
          borderRadius: 10,
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            <strong style={{ color: 'var(--text-main)', display: 'block', marginBottom: 2 }}>Mobile App Access:</strong>
            Send login details to staff for Android / iOS login.
          </div>
          <button className="btn btn-ghost btn-sm" style={{ color: 'var(--brand)', fontWeight: 600, gap: 6, flexShrink: 0 }} onClick={() => copy(shareText, 'share')}>
            {copied === 'share' ? <Icon name="check" size={13} /> : <Icon name="copy" size={13} />}
            {copied === 'share' ? 'Copied All!' : 'Copy All'}
          </button>
        </div>
      </div>

      <div className="modal-foot" style={{ borderTop: '1px solid var(--border)', padding: '14px 20px' }}>
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

// ── Staff Activity Drawer ──────────────────────────────────────────────────────

function StaffActivityDrawer({ staff, onClose }: {
  staff: StaffWithArea;
  onClose: () => void;
}) {
  const [dateStr, setDateStr] = useState(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<StaffActivity | null>(null);
  const [activeTab, setActiveTab] = useState<string>('');

  const isFieldCollector = staff.role === 'recovery_agent' || staff.role === 'helper';
  const isTech = staff.role === 'technician' || staff.role === 'cable_technician';
  const isCustom = staff.role === 'complaint_manager';

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    getStaffActivity(
      staff.id,
      dateStr,
      staff.role === 'cable_technician' ? 'cable' : staff.role === 'technician' ? 'internet' : null,
    )
      .then(data => {
        if (!active) return;
        setActivity(data);
        if (isFieldCollector) setActiveTab('payments');
        else if (isTech) setActiveTab('active');
        else if (isCustom) setActiveTab(data.activeComplaints.length > 0 ? 'active' : 'resolved');
        else if (data.payments.length > 0) setActiveTab('payments');
        else if (data.activeComplaints.length > 0) setActiveTab('active');
        else if (data.visits.length > 0) setActiveTab('visits');
        else setActiveTab('resolved');
      })
      .catch(e => {
        if (!active) return;
        setError(e instanceof Error ? e.message : 'Could not load activity');
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => { active = false; };
  }, [staff.id, staff.role, dateStr, isFieldCollector, isTech, isCustom]);

  const formatTime = (isoString: string | null) => {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const getAddress = (cust: { address_type: string; address_value: string | null; area: { name: string } | null } | null) => {
    if (!cust) return 'No customer details';
    const areaName = cust.area?.name || 'No Area';
    const val = cust.address_value;
    if (!val) return areaName;
    return cust.address_type === 'id_number' ? `${areaName} (ID: ${val})` : `${areaName} - ${val}`;
  };

  const totalRecovered = activity?.payments.reduce((sum, p) => sum + p.amount, 0) ?? 0;
  const internetRecovered = activity?.payments.filter(p => p.service === 'internet').reduce((sum, p) => sum + p.amount, 0) ?? 0;
  const cableRecovered = activity?.payments.filter(p => p.service === 'cable').reduce((sum, p) => sum + p.amount, 0) ?? 0;
  const lessPaidCount = activity?.payments.filter(p => p.amount < (p.bill?.amount ?? p.amount)).length ?? 0;
  const fullCount = (activity?.payments.length ?? 0) - lessPaidCount;
  const visitsCount = activity?.visits.length ?? 0;
  const resolvedCount = activity?.resolvedComplaints.length ?? 0;
  const activeCount = activity?.activeComplaints.length ?? 0;

  const tabsList: { value: string; label: string; count: number }[] = [];
  if (isFieldCollector || (activity && (activity.payments.length > 0 || activity.visits.length > 0))) {
    tabsList.push({ value: 'payments', label: 'Payments', count: activity?.payments.length ?? 0 });
    tabsList.push({ value: 'visits', label: 'Visits', count: visitsCount });
  }
  if (isTech || isCustom || (activity && (activity.resolvedComplaints.length > 0 || activity.activeComplaints.length > 0))) {
    tabsList.push({ value: 'active', label: 'Active', count: activeCount });
    tabsList.push({ value: 'resolved', label: 'Resolved', count: resolvedCount });
  }
  if (tabsList.length === 0) {
    tabsList.push({ value: 'payments', label: 'Payments', count: 0 });
    tabsList.push({ value: 'visits', label: 'Visits', count: 0 });
  }

  const currentTab = tabsList.some(t => t.value === activeTab) ? activeTab : (tabsList[0]?.value || 'payments');
  const roleLabel = ROLE_LABELS[staff.role] ?? staff.role;
  const roleColor = ROLE_COLORS[staff.role] ?? 'gray';

  return (
    <Drawer open onClose={onClose} width={500}>
      <div className="drawer-head staff-activity-drawer">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <span className={`av ${avClass(staff.full_name)}`} style={{ width: 42, height: 42, fontSize: 14, flexShrink: 0 }}>
            {initials(staff.full_name)}
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {staff.full_name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
              <Badge color={roleColor}>{roleLabel}</Badge>
              <span className="muted" style={{ fontSize: 11 }}>Daily activity</span>
            </div>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <Icon name="close" size={16} />
        </button>
      </div>

      <div className="drawer-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div className="staff-activity-date">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text)', fontSize: 13, fontWeight: 600 }}>
            <Icon name="calendar" size={15} style={{ color: 'var(--brand)' }} />
            Report date
          </div>
          <input
            type="date"
            className="input"
            value={dateStr}
            onChange={e => setDateStr(e.target.value)}
            style={{ width: 'auto', minWidth: 148, padding: '5px 10px', height: 34, borderRadius: 8, fontSize: 13 }}
          />
        </div>

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 140 }}>
            <span className="muted" style={{ fontSize: 13 }}>Loading activity…</span>
          </div>
        ) : error ? (
          <div style={{ padding: '12px 14px', background: 'var(--red-50)', color: 'var(--red)', borderRadius: 10, fontSize: 13 }}>
            {error}
          </div>
        ) : (
          <>
            <div className="staff-activity-kpis">
              {isFieldCollector ? (
                <>
                  <div className="kpi span-2">
                    <span className="k">Total recovered</span>
                    <span className="v brand">Rs. {totalRecovered.toLocaleString()}</span>
                  </div>
                  <div className="kpi">
                    <span className="k">Internet</span>
                    <span className="v blue">Rs. {internetRecovered.toLocaleString()}</span>
                  </div>
                  <div className="kpi">
                    <span className="k">Cable</span>
                    <span className="v purple">Rs. {cableRecovered.toLocaleString()}</span>
                  </div>
                  <div className="kpi">
                    <span className="k">Payments</span>
                    <span className="v">{fullCount}<span className="sub"> full</span> / {lessPaidCount}<span className="sub"> less</span></span>
                  </div>
                  <div className="kpi">
                    <span className="k">Visits</span>
                    <span className="v amber">{visitsCount}</span>
                    <span className="sub">customers visited</span>
                  </div>
                </>
              ) : isTech ? (
                <>
                  <div className="kpi">
                    <span className="k">Resolved today</span>
                    <span className="v green">{resolvedCount}</span>
                    <span className="sub">jobs closed</span>
                  </div>
                  <div className="kpi">
                    <span className="k">In progress</span>
                    <span className="v blue">{activeCount}</span>
                    <span className="sub">open tickets</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="kpi">
                    <span className="k">Active</span>
                    <span className="v blue">{activeCount}</span>
                    <span className="sub">complaints</span>
                  </div>
                  <div className="kpi">
                    <span className="k">Resolved</span>
                    <span className="v green">{resolvedCount}</span>
                    <span className="sub">today</span>
                  </div>
                  {(activity?.payments.length ?? 0) > 0 && (
                    <div className="kpi span-2">
                      <span className="k">Payments logged</span>
                      <span className="v brand">Rs. {totalRecovered.toLocaleString()}</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <Tabs value={currentTab} onChange={setActiveTab} items={tabsList} />

            <div className="staff-activity-list">
              {currentTab === 'payments' && (
                activity?.payments.length === 0 ? (
                  <div className="staff-activity-empty">No payments collected on this day.</div>
                ) : activity?.payments.map(p => (
                  <div className="staff-activity-row" key={p.id}>
                    <div className="row-top">
                      <div style={{ minWidth: 0 }}>
                        <div className="row-name">{p.customer?.full_name}</div>
                        <div className="row-code">{p.customer?.customer_code}</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                        <span className="row-amt">Rs. {p.amount.toLocaleString()}</span>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <Badge color={p.service === 'cable' ? 'purple' : 'blue'}>
                            {p.service === 'cable' ? 'Cable' : 'Internet'}
                          </Badge>
                          <Badge color={(p.bill?.status === 'paid' || p.amount >= (p.bill?.amount ?? p.amount)) ? 'green' : 'amber'}>
                            {(p.bill?.status === 'paid' || p.amount >= (p.bill?.amount ?? p.amount)) ? 'Paid' : 'Less Paid'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="row-meta">
                      <div className="row-meta-line"><Icon name="pin" size={13} /><span>{getAddress(p.customer)}</span></div>
                      <div className="row-meta-line">
                        <Icon name="clock" size={13} />
                        <span>Received at {formatTime(p.paid_at)} · <span style={{ textTransform: 'capitalize' }}>{p.method}</span></span>
                      </div>
                      {p.receipt_no && (
                        <div className="row-meta-line"><Icon name="checkCircle" size={12} /><span>Receipt {p.receipt_no}</span></div>
                      )}
                      {p.note && <div className="row-note">Note: {p.note}</div>}
                      {p.receipt_url && (
                        <a href={p.receipt_url} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--brand)' }}>
                          <Icon name="eye" size={12} /> View payment proof
                        </a>
                      )}
                    </div>
                  </div>
                ))
              )}

              {currentTab === 'visits' && (
                activity?.visits.length === 0 ? (
                  <div className="staff-activity-empty">No customer visits logged on this day.</div>
                ) : activity?.visits.map(v => (
                  <div className="staff-activity-row" key={v.id}>
                    <div className="row-top">
                      <div>
                        <div className="row-name">{v.customer?.full_name}</div>
                        <div className="row-code">{v.customer?.customer_code}</div>
                      </div>
                      <Badge color="amber">Visit</Badge>
                    </div>
                    <div className="row-meta">
                      <div className="row-meta-line"><Icon name="pin" size={13} /><span>{getAddress(v.customer)}</span></div>
                      <div className="row-meta-line">
                        <Icon name="cash" size={13} />
                        <span>Target bill Rs. {v.amount.toLocaleString()}</span>
                      </div>
                      {v.payment_note && (
                        <div className="row-note">
                          <strong>Visit:</strong> {formatVisitNote(v.payment_note)}
                          {v.payment_note === 'promise_to_pay' && v.promised_date && (
                            <> — <strong>Promised:</strong> {formatPromisedDate(v.promised_date)}</>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}

              {currentTab === 'active' && (
                activity?.activeComplaints.length === 0 ? (
                  <div className="staff-activity-empty">No active complaints assigned.</div>
                ) : activity?.activeComplaints.map(c => (
                  <div className="staff-activity-row" key={c.id}>
                    <div className="row-top">
                      <div>
                        <div className="row-name">{c.customer?.full_name}</div>
                        <div className="row-code">{c.complaint_code}</div>
                      </div>
                      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <Badge color={c.priority === 'high' ? 'red' : c.priority === 'medium' ? 'amber' : 'blue'}>{c.priority}</Badge>
                        <Badge color={c.status === 'in_progress' ? 'blue' : 'gray'}>
                          {c.status === 'in_progress' ? 'In Progress' : 'Open'}
                        </Badge>
                      </div>
                    </div>
                    <div className="row-note"><strong>Issue:</strong> {c.issue}</div>
                    <div className="row-meta">
                      <div className="row-meta-line"><Icon name="pin" size={13} /><span>{getAddress(c.customer)}</span></div>
                      <div className="row-meta-line">
                        <Icon name="clock" size={13} />
                        <span>Opened {new Date(c.opened_at).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}

              {currentTab === 'resolved' && (
                activity?.resolvedComplaints.length === 0 ? (
                  <div className="staff-activity-empty">No complaints resolved on this day.</div>
                ) : activity?.resolvedComplaints.map(c => (
                  <div className="staff-activity-row" key={c.id}>
                    <div className="row-top">
                      <div>
                        <div className="row-name">{c.customer?.full_name}</div>
                        <div className="row-code">{c.complaint_code}</div>
                      </div>
                      <Badge color="green">Resolved</Badge>
                    </div>
                    <div className="row-note"><strong>Issue:</strong> {c.issue}</div>
                    <div className="row-meta">
                      <div className="row-meta-line"><Icon name="pin" size={13} /><span>{getAddress(c.customer)}</span></div>
                      <div className="row-meta-line"><Icon name="clock" size={13} /><span>Resolved at {formatTime(c.resolved_at)}</span></div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      <div className="drawer-foot">
        <button className="btn btn-secondary" onClick={onClose}>Close</button>
      </div>
    </Drawer>
  );
}

// ── Staff Card ────────────────────────────────────────────────────────────────

function StaffCard({ s, onEdit, onViewCreds, onToggleActive, onDelete, onViewActivity }: {
  s: StaffWithArea;
  onEdit: () => void;
  onViewCreds: () => void;
  onToggleActive: (v: boolean) => void;
  onDelete: () => void;
  onViewActivity: () => void;
}) {
  const roleLabel = ROLE_LABELS[s.role] ?? s.role;
  const roleColor = ROLE_COLORS[s.role] ?? 'gray';
  const accent = ROLE_ACCENT[s.role] ?? 'var(--border-strong)';
  const [menuOpen, setMenuOpen] = useState(false);

  const areaBits: string[] = [];
  if (s.areas?.length) areaBits.push(...s.areas.map(a => a.name));
  else if (s.area?.name) areaBits.push(s.area.name);
  if (s.cable_areas?.length) areaBits.push(...s.cable_areas.map(a => a.name));
  const areaText = areaBits.length > 0
    ? [...new Set(areaBits)].join(', ')
    : 'No area assigned';

  const pages = s.role === 'complaint_manager' ? getAllowedPages(s) : [];
  const pagePreview = pages.slice(0, 2);
  const pageExtra = pages.length - pagePreview.length;

  const accessLabel = s.role === 'admin'
    ? 'Full access'
    : s.role === 'complaint_manager'
      ? 'Custom pages'
      : 'Mobile app';

  return (
    <div
      className={`card staff-card lift${s.is_active ? '' : ' is-inactive'}`}
      style={{ position: 'relative', ['--staff-accent' as keyof React.CSSProperties]: accent } as React.CSSProperties}
    >
      <div className="staff-card-body">
        <div className="head">
          <span className={`av ${avClass(s.full_name)}`} style={{ width: 40, height: 40, fontSize: 13, flexShrink: 0 }}>
            {initials(s.full_name)}
          </span>
          <div className="who">
            <div className="nm" title={s.full_name}>{s.full_name}</div>
            <div className="ph" title={s.username ? `@${s.username}` : undefined}>
              {s.username
                ? <span className="uname">@{s.username}</span>
                : <span style={{ fontStyle: 'italic' }}>no username</span>}
            </div>
          </div>
          <div className="head-actions">
            <div style={{ position: 'relative' }}>
              <button
                className="icon-btn"
                style={{ width: 30, height: 30, borderRadius: 8 }}
                onClick={() => setMenuOpen(v => !v)}
                title="More actions"
                aria-label="More actions"
              >
                <Icon name="moreV" size={15} />
              </button>
              {menuOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 15 }} onClick={() => setMenuOpen(false)} />
                  <div className="staff-menu">
                    <button type="button" onClick={() => { setMenuOpen(false); onEdit(); }}>
                      <Icon name="edit" size={13} /> Edit details
                    </button>
                    <button type="button" onClick={() => { setMenuOpen(false); onViewCreds(); }}>
                      <Icon name="key" size={13} /> Credentials
                    </button>
                    <div className="menu-sep" />
                    <button type="button" className="danger" onClick={() => { setMenuOpen(false); onDelete(); }}>
                      <Icon name="trash" size={13} /> Remove staff
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="role-row">
          <Badge color={roleColor}>{roleLabel}</Badge>
        </div>

        <div className="meta-list">
          <div className="meta-row">
            <Icon name="pin" size={13} />
            <span title={areaText}>{areaText}</span>
          </div>
          {s.phone ? (
            <div className="meta-row">
              <Icon name="phone" size={13} />
              <span className="mono" title={s.phone}>{s.phone}</span>
            </div>
          ) : (
            <div className="meta-row" style={{ visibility: 'hidden' }} aria-hidden>
              <Icon name="phone" size={13} />
              <span>—</span>
            </div>
          )}
        </div>

        <div className="access-strip" title={s.role === 'complaint_manager' ? pages.map(p => PAGE_LABELS[p]).join(', ') : accessLabel}>
          <span className="access-label">{accessLabel}</span>
          {s.role === 'complaint_manager' && pagePreview.length > 0 && (
            <div className="access-pills">
              {pagePreview.map(page => (
                <span key={page} className="access-pill">{PAGE_LABELS[page]}</span>
              ))}
              {pageExtra > 0 && <span className="access-pill more">+{pageExtra}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="foot">
        <div className="foot-status">
          <Switch on={s.is_active} onChange={onToggleActive} />
          <span>{s.is_active ? 'Active' : 'Inactive'}</span>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onViewActivity}>
          <Icon name="chart" size={12} /> Activity
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function StaffPage({ onCatalogChange }: { onCatalogChange?: () => void }) {
  const { staff: currentStaff } = useAuth();
  const [staff, setStaff]             = useState<StaffWithArea[]>([]);
  const [areas, setAreas]             = useState<Area[]>([]);
  const [teams, setTeams]             = useState<TeamWithMembers[]>([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [addOpen, setAddOpen]           = useState(false);
  const [editTarget, setEditTarget]     = useState<StaffWithArea | null>(null);
  const [credsTarget, setCredsTarget]   = useState<StaffWithArea | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<StaffWithArea | null>(null);
  const [activityTarget, setActivityTarget] = useState<StaffWithArea | null>(null);
  const [activePageTab, setActivePageTab]   = useState<'members' | 'teams'>('members');
  const [teamAddOpen, setTeamAddOpen]       = useState(false);
  const [teamEditTarget, setTeamEditTarget] = useState<TeamWithMembers | null>(null);
  const [teamDeleteTarget, setTeamDeleteTarget] = useState<TeamWithMembers | null>(null);
  const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('all');

  useEffect(() => {
    Promise.all([getStaff(), getAreas(), getTeams()])
      .then(([s, a, t]) => { setStaff(s); setAreas(a); setTeams(t); })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'Could not load staff'))
      .finally(() => setLoading(false));
  }, []);

  const visibleStaff = staff.filter(s => s.id !== currentStaff?.id);

  const handleSaved = (saved: Staff) => {
    invalidateStaffCache();
    const sAreaIds = saved.area_ids || [];
    const sAreas = areas.filter(a => sAreaIds.includes(a.id));
    const area = areas.find(a => a.id === saved.area_id) ?? sAreas[0] ?? null;
    const sCableAreaIds = saved.cable_area_ids || [];
    const sCableAreas = areas.filter(a => sCableAreaIds.includes(a.id));
    const withArea: StaffWithArea = {
      ...saved,
      area,
      areas: sAreas,
      cable_areas: sCableAreas,
      allowed_pages: saved.allowed_pages ?? null,
    };
    setStaff(prev => {
      const idx = prev.findIndex(s => s.id === saved.id);
      if (idx >= 0) { const next = [...prev]; next[idx] = withArea; return next; }
      return [...prev, withArea];
    });
    onCatalogChange?.();
  };

  const handleToggleActive = async (s: StaffWithArea, val: boolean) => {
    if (!val && s.role === 'admin' && activeAdminCount <= 1) {
      setError('Cannot deactivate the last active admin');
      return;
    }
    setStaff(prev => prev.map(m => m.id === s.id ? { ...m, is_active: val } : m));
    try {
      const { updateStaff } = await import('@/lib/db/staff');
      await updateStaff(s.id, { is_active: val });
      invalidateStaffCache();
      onCatalogChange?.();
    } catch {
      setStaff(prev => prev.map(m => m.id === s.id ? { ...m, is_active: !val } : m));
    }
  };

  const activeAdminCount = staff.filter(s => s.role === 'admin' && s.is_active).length;

  const handleDelete = async (s: StaffWithArea) => {
    const res = await fetch('/api/admin/delete-staff', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', ...(await getAuthHeaders()) },
      body: JSON.stringify({ staff_id: s.id }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? 'Could not delete staff');
    }
    invalidateStaffCache();
    setStaff(prev => prev.filter(m => m.id !== s.id));
    setDeleteTarget(null);
    onCatalogChange?.();
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
  const admins = byRole('admin');
  const customAccess = byRole('complaint_manager');
  const technicians = byRole('technician');
  const cableTechnicians = byRole('cable_technician');
  const agents = byRole('recovery_agent');
  const helpers = byRole('helper');

  const roleFilters = [
    { value: 'all', label: 'All', count: visibleStaff.length },
    { value: 'admin', label: 'Admins', count: admins.length, color: ROLE_DOT.admin },
    { value: 'complaint_manager', label: 'Custom Access', count: customAccess.length, color: ROLE_DOT.complaint_manager },
    { value: 'technician', label: 'Internet Technicians', count: technicians.length, color: ROLE_DOT.technician },
    { value: 'cable_technician', label: 'Cable Technicians', count: cableTechnicians.length, color: ROLE_DOT.cable_technician },
    { value: 'recovery_agent', label: 'Recovery Agents', count: agents.length, color: ROLE_DOT.recovery_agent },
    { value: 'helper', label: 'Helpers', count: helpers.length, color: ROLE_DOT.helper },
  ];

  const filteredStaff = visibleStaff.filter(s => {
    if (selectedRoleFilter === 'all') return true;
    if (selectedRoleFilter === 'dashboard') return DASHBOARD_ROLES.has(s.role);
    return s.role === selectedRoleFilter;
  });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Staff Management</h1>
          <p>
            {activePageTab === 'members' ? (
              <>
                {visibleStaff.length} total · {admins.length} admin · {customAccess.length} custom · {technicians.length} internet · {cableTechnicians.length} cable · {agents.length} recovery
                {helpers.length > 0 ? ` · ${helpers.length} helpers` : ''}
              </>
            ) : (
              <>{teams.length} teams configured</>
            )}
          </p>
        </div>
        <div className="row gap-sm">
          {activePageTab === 'members' ? (
            <button className="btn btn-primary" onClick={() => setAddOpen(true)}>
              <Icon name="plus" size={14} />Add Staff
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => setTeamAddOpen(true)}>
              <Icon name="plus" size={14} />Add Team
            </button>
          )}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <Tabs
          value={activePageTab}
          onChange={(val) => setActivePageTab(val as 'members' | 'teams')}
          items={[
            { value: 'members', label: 'Staff Members', count: visibleStaff.length },
            { value: 'teams', label: 'Teams', count: teams.length }
          ]}
        />
      </div>

      {activePageTab === 'teams' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 14 }}>
            {teams.map(t => (
              <div className="card staff-card lift" key={t.id} style={{ display: 'flex', flexDirection: 'column', padding: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <h3 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{t.name}</h3>
                    <span className="muted" style={{ fontSize: 12 }}>{t.members.length} members</span>
                  </div>
                  <div className="row gap-xs">
                    <button className="icon-btn" onClick={() => setTeamEditTarget(t)}>
                      <Icon name="edit" size={14} />
                    </button>
                    <button className="icon-btn" onClick={() => setTeamDeleteTarget(t)}
                      onMouseEnter={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = 'var(--red-50)';
                        (e.currentTarget as HTMLButtonElement).style.color = 'var(--red)';
                        (e.currentTarget as HTMLButtonElement).style.borderColor = 'color-mix(in srgb, var(--red) 30%, transparent)';
                      }}
                      onMouseLeave={e => {
                        (e.currentTarget as HTMLButtonElement).style.background = '';
                        (e.currentTarget as HTMLButtonElement).style.color = '';
                        (e.currentTarget as HTMLButtonElement).style.borderColor = '';
                      }}>
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
                  {t.members.length === 0 ? (
                    <span className="muted" style={{ fontSize: 12, fontStyle: 'italic' }}>No members in this team</span>
                  ) : (
                    t.members.map(m => {
                      if (!m.staff) return null;
                      return (
                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className={`av ${avClass(m.staff.full_name)}`} style={{ width: 26, height: 26, fontSize: 11 }}>
                            {initials(m.staff.full_name)}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 500, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{m.staff.full_name}</div>
                          </div>
                          <Badge color={ROLE_COLORS[m.staff.role] ?? 'gray'}>
                            {ROLE_LABELS[m.staff.role] ?? m.staff.role}
                          </Badge>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ))}
          </div>

          {teams.length === 0 && (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <Icon name="users" size={28} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No teams yet</div>
              <div style={{ fontSize: 13 }}>Click Add Team to create a new team of staff.</div>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="staff-role-chips" role="tablist" aria-label="Filter staff by role">
            {roleFilters.map(filter => {
              const isActive = selectedRoleFilter === filter.value;
              return (
                <button
                  key={filter.value}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  className={`staff-role-chip${isActive ? ' is-active' : ''}`}
                  onClick={() => setSelectedRoleFilter(filter.value)}
                >
                  {filter.color && <span className="chip-dot" style={{ background: filter.color }} />}
                  {filter.label}
                  <span className="chip-count">{filter.count}</span>
                </button>
              );
            })}
          </div>

          {filteredStaff.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <Icon name="filter" size={26} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
              <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No staff in this filter</div>
              <div style={{ fontSize: 13 }}>Try another role chip or add a new staff member.</div>
            </div>
          ) : (
            <div className="staff-grid">
              {filteredStaff.map(s => (
                <StaffCard key={s.id} s={s}
                  onEdit={() => setEditTarget(s)}
                  onViewCreds={() => setCredsTarget(s)}
                  onToggleActive={v => handleToggleActive(s, v)}
                  onDelete={() => setDeleteTarget(s)}
                  onViewActivity={() => setActivityTarget(s)} />
              ))}
            </div>
          )}
        </>
      )}

      {activePageTab === 'members' && visibleStaff.length === 0 && (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Icon name="briefcase" size={28} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>No staff yet</div>
          <div style={{ fontSize: 13 }}>Click Add Staff to create your first staff member.</div>
        </div>
      )}

      <StaffFormModal open={addOpen} onClose={() => setAddOpen(false)}
        areas={areas} onSaved={handleSaved} activeAdminCount={activeAdminCount} />

      {editTarget && (
        <StaffFormModal open onClose={() => setEditTarget(null)}
          areas={areas} onSaved={s => { handleSaved(s); setEditTarget(null); }}
          editTarget={editTarget} activeAdminCount={activeAdminCount} />
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

      {activityTarget && (
        <StaffActivityDrawer
          staff={activityTarget}
          onClose={() => setActivityTarget(null)}
        />
      )}

      {teamAddOpen && (
        <TeamFormModal
          open
          onClose={() => setTeamAddOpen(false)}
          staff={visibleStaff}
          onSaved={(newTeam) => {
            setTeams(prev => [...prev, newTeam]);
            setTeamAddOpen(false);
            onCatalogChange?.();
          }}
        />
      )}

      {teamEditTarget && (
        <TeamFormModal
          open
          onClose={() => setTeamEditTarget(null)}
          staff={visibleStaff}
          editTarget={teamEditTarget}
          onSaved={(updatedTeam) => {
            setTeams(prev => prev.map(t => t.id === updatedTeam.id ? updatedTeam : t));
            setTeamEditTarget(null);
            onCatalogChange?.();
          }}
        />
      )}

      {teamDeleteTarget && (
        <TeamDeleteConfirmModal
          open
          onClose={() => setTeamDeleteTarget(null)}
          team={teamDeleteTarget}
          onConfirm={async () => {
            await deleteTeam(teamDeleteTarget.id);
            setTeams(prev => prev.filter(t => t.id !== teamDeleteTarget.id));
            setTeamDeleteTarget(null);
            onCatalogChange?.();
          }}
        />
      )}
    </div>
  );
}

// ── Team Form Modal ────────────────────────────────────────────────────────────

function TeamFormModal({ open, onClose, staff, onSaved, editTarget }: {
  open: boolean;
  onClose: () => void;
  staff: StaffWithArea[];
  onSaved: (t: TeamWithMembers) => void;
  editTarget?: TeamWithMembers | null;
}) {
  const [name, setName] = useState(editTarget?.name ?? '');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>(
    editTarget?.members.map(m => m.staff_id) ?? []
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSubmit = async () => {
    if (!name.trim()) { setError('Team name required'); return; }
    setSaving(true);
    setError(null);
    try {
      let saved: Team;
      if (editTarget) {
        saved = await updateTeam(editTarget.id, name.trim());
      } else {
        saved = await createTeam(name.trim());
      }
      await updateTeamMembers(saved.id, selectedStaffIds);
      
      const members = selectedStaffIds.map(staffId => {
        const s = staff.find(x => x.id === staffId)!;
        return {
          id: '', // dummy
          team_id: saved.id,
          staff_id: staffId,
          created_at: new Date().toISOString(),
          staff: {
            id: s.id,
            full_name: s.full_name,
            role: s.role,
            phone: s.phone
          }
        };
      });
      onSaved({ ...saved, members });
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const filterBySearch = (list: StaffWithArea[]) => {
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter(s => 
      s.full_name.toLowerCase().includes(q) || 
      (s.username && s.username.toLowerCase().includes(q))
    );
  };

  const technicians = filterBySearch(staff.filter(s => s.role === 'technician'));
  const cableTechnicians = filterBySearch(staff.filter(s => s.role === 'cable_technician'));
  const helpers = filterBySearch(staff.filter(s => s.role === 'helper'));
  const recoveryAgents = filterBySearch(staff.filter(s => s.role === 'recovery_agent'));
  const complaintManagers = filterBySearch(staff.filter(s => s.role === 'complaint_manager'));

  const renderStaffSection = (title: string, list: StaffWithArea[], color: string) => {
    if (list.length === 0) return null;
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
          {title}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {list.map(s => {
            const isChecked = selectedStaffIds.includes(s.id);
            return (
              <label key={s.id} className="card lift" style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
                borderRadius: 10, cursor: 'pointer', 
                border: isChecked ? '1px solid var(--color-primary)' : '1px solid var(--border)',
                background: isChecked ? 'var(--bg-muted)' : 'none',
                transition: 'all 0.2s',
                userSelect: 'none'
              }}>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  border: isChecked ? '2px solid var(--color-primary)' : '2px solid var(--text-faint)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: isChecked ? 'var(--color-primary)' : 'none',
                  transition: 'all 0.15s'
                }}>
                  {isChecked && <Icon name="check" size={10} style={{ color: 'white' }} />}
                </div>
                
                <input type="checkbox" checked={isChecked} style={{ display: 'none' }} onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedStaffIds(prev => [...prev, s.id]);
                  } else {
                    setSelectedStaffIds(prev => prev.filter(id => id !== s.id));
                  }
                }} />
                
                <span className={`av ${avClass(s.full_name)}`} style={{ width: 26, height: 26, fontSize: 11 }}>
                  {initials(s.full_name)}
                </span>
                <span style={{ fontSize: 13, fontWeight: 500, flex: 1, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }} title={s.full_name}>
                  {s.full_name}
                </span>
              </label>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Modal open={open} onClose={onClose} width={500}>
      <div className="modal-head">
        <div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>
            {editTarget ? 'Edit Team' : 'Create Team'}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {editTarget ? `Editing ${editTarget.name}` : 'Group multiple staff members into a team'}
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

        <div className="field" style={{ marginBottom: 16 }}>
          <label>Team Name *</label>
          <input className="input" placeholder="e.g. Mukhtar Team, DHA North Team"
            value={name} onChange={e => setName(e.target.value)} />
        </div>

        <div className="field" style={{ marginBottom: 16 }}>
          <label>Search Members</label>
          <input className="input" placeholder="Filter staff by name or username..."
            value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
        </div>

        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 10 }}>Select Team Members</label>
          <div style={{ maxHeight: 300, overflowY: 'auto', paddingRight: 4 }}>
            {renderStaffSection('Internet Technicians', technicians, 'var(--blue)')}
            {renderStaffSection('Cable Technicians', cableTechnicians, 'var(--purple)')}
            {renderStaffSection('Helpers', helpers, 'var(--green)')}
            {renderStaffSection('Recovery Agents', recoveryAgents, 'var(--amber)')}
            {renderStaffSection('Custom Access', complaintManagers, 'var(--purple)')}
          </div>
        </div>
      </div>

      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
          <Icon name="check" size={14} />
          {saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Create Team'}
        </button>
      </div>
    </Modal>
  );
}

// ── Team Delete Confirm Modal ──────────────────────────────────────────────────

function TeamDeleteConfirmModal({ open, onClose, team, onConfirm }: {
  open: boolean;
  onClose: () => void;
  team: TeamWithMembers | null;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!team) return;
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
    <Modal open={open} onClose={onClose} width={420}>
      <div className="modal-head">
        <div>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--red)' }}>Delete Team</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>This action cannot be undone</div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>

      <div className="modal-body">
        <div style={{
          padding: '12px 14px', borderRadius: 10,
          background: 'var(--bg-muted)', border: '1px solid var(--border)',
          marginBottom: 16, fontSize: 14
        }}>
          Are you sure you want to delete <strong>{team?.name}</strong>?
          <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
            This team has {team?.members.length ?? 0} members. This will not delete the staff members themselves.
          </div>
        </div>

        {error && (
          <div style={{ padding: '10px 14px', background: '#fef2f2', color: '#dc2626',
                        borderRadius: 8, fontSize: 13 }}>
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
          {deleting ? 'Deleting…' : 'Delete Team'}
        </button>
      </div>
    </Modal>
  );
}
