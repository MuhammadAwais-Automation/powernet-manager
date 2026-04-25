'use client';
import React, { useState, useEffect } from 'react';
import Icon from '../Icon';
import { Badge, Avatar, IconBadge, Switch, Drawer } from '../ui';
import { getCustomers, createCustomer, getCustomerById, updateCustomer } from '@/lib/db/customers';
import { getAreas } from '@/lib/db/areas';
import { getPackages } from '@/lib/db/packages';
import { getBillsByCustomer } from '@/lib/db/bills';
import { useAuth } from '@/lib/auth/auth-context';
import type { CustomerWithRelations, Area, Package, CustomerStatus, Bill } from '@/types/database';

// ── Add Customer Drawer ──────────────────────────────────────────────────────

function AddCustomerDrawer({
  areas, packages, onClose, onSaved, editTarget,
}: {
  areas: Area[];
  packages: Package[];
  onClose: () => void;
  onSaved: (c: CustomerWithRelations) => void;
  editTarget?: CustomerWithRelations;
}) {
  const [form, setForm] = useState({
    full_name:         editTarget?.full_name           ?? '',
    cnic:              editTarget?.cnic                 ?? '',
    phone:             editTarget?.phone                ?? '',
    username:          editTarget?.username              ?? '',
    package_id:        editTarget?.package_id            ?? '',
    iptv:              editTarget?.iptv                  ?? false,
    address_type:      (editTarget?.address_type         ?? 'id_number') as 'text' | 'id_number',
    address_value:     editTarget?.address_value         ?? '',
    area_id:           editTarget?.area_id               ?? '',
    connection_date:   editTarget?.connection_date        ?? '',
    due_amount:        editTarget?.due_amount?.toString() ?? '',
    status:            (editTarget?.status                ?? 'active') as CustomerStatus,
    onu_number:        editTarget?.onu_number             ?? '',
    remarks:           editTarget?.remarks               ?? '',
    disconnected_date: editTarget?.disconnected_date      ?? '',
    reconnected_date:  editTarget?.reconnected_date       ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (key: string, val: unknown) => setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    if (!form.full_name.trim()) { setError('Name required'); return; }
    if (!form.area_id) { setError('Area required'); return; }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        username:          form.username || null,
        full_name:         form.full_name.trim(),
        cnic:              form.cnic || null,
        phone:             form.phone || null,
        package_id:        form.package_id || null,
        iptv:              form.iptv,
        address_type:      form.address_type,
        address_value:     form.address_value || null,
        area_id:           form.area_id,
        connection_date:   form.connection_date || null,
        due_amount:        form.due_amount ? parseInt(form.due_amount) : null,
        onu_number:        form.onu_number || null,
        status:            form.status,
        disconnected_date: form.disconnected_date || null,
        reconnected_date:  form.reconnected_date || null,
        remarks:           form.remarks || null,
      };
      if (editTarget) {
        await updateCustomer(editTarget.id, payload);
        const full = await getCustomerById(editTarget.id);
        if (full) onSaved(full);
      } else {
        const created = await createCustomer(payload);
        const full = await getCustomerById(created.id);
        if (full) onSaved(full);
      }
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="drawer-head">
        <div><div style={{ fontSize: 15, fontWeight: 600 }}>{editTarget ? 'Edit Customer' : 'Add Customer'}</div></div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      <div className="drawer-body">
        {error && (
          <div style={{ padding: '10px 16px', background: 'var(--red-bg, #fef2f2)', color: 'var(--red, #dc2626)',
                        borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Basic Info */}
        <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Basic Info</div>
          <input className="select" placeholder="Full Name *" value={form.full_name} onChange={e => set('full_name', e.target.value)} />
          <input className="select" placeholder="CNIC (optional)" value={form.cnic} onChange={e => set('cnic', e.target.value)} />
          <input className="select" placeholder="Phone (optional)" value={form.phone} onChange={e => set('phone', e.target.value)} />
        </div>

        {/* Connection */}
        <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Connection</div>
          <input className="select" placeholder="Username (e.g. a027_)" value={form.username} onChange={e => set('username', e.target.value)} />
          <select className="select" value={form.package_id} onChange={e => set('package_id', e.target.value)}>
            <option value="">Select package</option>
            {packages.map(p => <option key={p.id} value={p.id}>{p.name}{p.default_price ? ` — Rs. ${p.default_price}` : ''}</option>)}
          </select>
          <div className="row gap-sm" style={{ alignItems: 'center' }}>
            <Switch on={form.iptv} onChange={(v: boolean) => set('iptv', v)} />
            <span style={{ fontSize: 13 }}>IPTV</span>
          </div>
        </div>

        {/* Location */}
        <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Location</div>
          <div className="row gap-sm">
            <button className={`btn btn-sm ${form.address_type === 'id_number' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => set('address_type', 'id_number')}>ID Number</button>
            <button className={`btn btn-sm ${form.address_type === 'text' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => set('address_type', 'text')}>Text Address</button>
          </div>
          <input className="select"
            placeholder={form.address_type === 'id_number' ? 'ID Number (e.g. 14)' : 'Address (e.g. QTR NO 6/2 F2)'}
            value={form.address_value} onChange={e => set('address_value', e.target.value)} />
          <select className="select" value={form.area_id} onChange={e => set('area_id', e.target.value)}>
            <option value="">Select area *</option>
            {areas.map(a => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
          </select>
        </div>

        {/* Financial */}
        <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Financial</div>
          <input className="select" type="number" placeholder="Monthly Due (PKR)" value={form.due_amount} onChange={e => set('due_amount', e.target.value)} />
          <input className="select" type="date" value={form.connection_date} onChange={e => set('connection_date', e.target.value)} />
          <select className="select" value={form.status} onChange={e => set('status', e.target.value as CustomerStatus)}>
            <option value="active">Active</option>
            <option value="free">Free</option>
            <option value="suspended">Suspended</option>
            <option value="disconnected">Disconnected</option>
            <option value="tdc">TDC (Temp Disconnected)</option>
            <option value="shifted">Shifted</option>
          </select>
        </div>

        {/* Equipment & Notes */}
        <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Equipment & Notes</div>
          <input className="select" placeholder="ONU Number (garrison only)" value={form.onu_number} onChange={e => set('onu_number', e.target.value)} />
          <textarea className="select" placeholder="Remarks" rows={2} value={form.remarks}
            onChange={e => set('remarks', e.target.value)} style={{ resize: 'none' }} />
          {(form.status === 'disconnected' || form.status === 'tdc') && (
            <>
              <input className="select" type="date" placeholder="Disconnected Date" value={form.disconnected_date} onChange={e => set('disconnected_date', e.target.value)} />
              <input className="select" type="date" placeholder="Reconnected Date" value={form.reconnected_date} onChange={e => set('reconnected_date', e.target.value)} />
            </>
          )}
        </div>
      </div>
      <div className="drawer-foot">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>
          {saving ? 'Saving…' : 'Save Customer'}
        </button>
      </div>
    </>
  );
}

// ── Customer Detail Drawer ───────────────────────────────────────────────────

function CustomerDetail({ customer, onClose, onEdit, readOnly }: { customer: CustomerWithRelations; onClose: () => void; onEdit: () => void; readOnly?: boolean; }) {
  const [bills, setBills] = useState<Bill[]>([]);

  useEffect(() => {
    getBillsByCustomer(customer.id).then(setBills);
  }, [customer.id]);

  const statusColor = (s: string) => {
    if (s === 'active') return 'green';
    if (s === 'free') return 'blue';
    if (s === 'suspended' || s === 'tdc') return 'amber';
    return 'red';
  };

  const addressDisplay = () => {
    if (!customer.address_value) return '—';
    if (customer.address_type === 'id_number') {
      const v = customer.address_value.trim().toUpperCase();
      if (v.startsWith('ID NO') || v.startsWith('ID NUMBER')) return customer.address_value;
      return `ID NO ${customer.address_value}`;
    }
    return customer.address_value;
  };

  const InfoRow = ({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0',
                  borderBottom: '1px solid var(--border)' }}>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', width: 110, flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: mono ? 'JetBrains Mono, monospace' : undefined, flex: 1 }}>
        {value || '—'}
      </span>
    </div>
  );

  return (
    <>
      <div className="drawer-head">
        <div className="row gap-md">
          <Avatar name={customer.full_name} size={44} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em' }}>{customer.full_name}</div>
            <div className="muted mono" style={{ fontSize: 11 }}>
              {customer.customer_code} · {customer.area?.name ?? '—'}
            </div>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>

      <div className="drawer-body">
        {/* Status bar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
                      background: 'var(--bg-muted)', borderRadius: 10, marginBottom: 16,
                      border: '1px solid var(--border)' }}>
          <Badge color={statusColor(customer.status)} dot>{customer.status.toUpperCase()}</Badge>
          {customer.iptv && <Badge color="purple" dot>IPTV</Badge>}
          {customer.due_amount
            ? <span style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 600, fontFamily: 'JetBrains Mono, monospace' }}>
                Rs. {customer.due_amount.toLocaleString()}/mo
              </span>
            : <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>Free / No charge</span>
          }
        </div>

        {/* Personal Info */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Personal Info</h3></div>
          <div className="card-pad" style={{ paddingTop: 8, paddingBottom: 8 }}>
            <InfoRow label="CNIC" value={customer.cnic} mono />
            <InfoRow label="Phone" value={customer.phone} mono />
            <InfoRow label="Address" value={addressDisplay()} />
          </div>
        </div>

        {/* Connection Details */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Connection Details</h3></div>
          <div className="card-pad" style={{ paddingTop: 8, paddingBottom: 8 }}>
            <InfoRow label="Package" value={customer.package?.name} />
            <InfoRow label="Area" value={customer.area?.name} />
            {customer.username && <InfoRow label="Username" value={customer.username} mono />}
            {customer.onu_number && <InfoRow label="ONU Number" value={customer.onu_number} mono />}
            <InfoRow label="IPTV"
              value={customer.iptv
                ? <Badge color="purple" dot>Active</Badge>
                : <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Not subscribed</span>}
            />
            {customer.connection_date && <InfoRow label="Connected Since" value={customer.connection_date} />}
            {customer.disconnected_date && <InfoRow label="Disconnected On" value={customer.disconnected_date} />}
            {customer.reconnected_date && <InfoRow label="Reconnected On" value={customer.reconnected_date} />}
          </div>
        </div>

        {/* Bill History */}
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Bill History</h3></div>
          {bills.length === 0 ? (
            <div style={{ padding: '14px 20px', color: 'var(--text-muted)', fontSize: 13 }}>No bills recorded</div>
          ) : bills.map((b, i) => (
            <div key={i} className="minirow">
              <div className="row gap-sm">
                <Icon name="calendar" size={14} style={{ color: 'var(--text-muted)' }} />
                {b.month}
              </div>
              <div className="row gap-md">
                <span className="mono">Rs. {b.amount.toLocaleString()}</span>
                <Badge color={b.status === 'paid' ? 'green' : 'amber'} dot>{b.status}</Badge>
              </div>
            </div>
          ))}
        </div>

        {/* Remarks */}
        {customer.remarks && (
          <div className="card">
            <div className="card-head"><h3>Remarks</h3></div>
            <div style={{ padding: '12px 20px', fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {customer.remarks}
            </div>
          </div>
        )}
      </div>

      {!readOnly && (
        <div className="drawer-foot">
          <button className="btn btn-secondary" onClick={onEdit}><Icon name="edit" size={14} />Edit</button>
          <button className="btn btn-danger"><Icon name="ban" size={14} />Suspend</button>
        </div>
      )}
    </>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function CustomersPage() {
  const { staff } = useAuth();
  const readOnly = staff?.role === 'complaint_manager';
  const [customers, setCustomers] = useState<CustomerWithRelations[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CustomerWithRelations | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('All areas');
  const [statusFilter, setStatusFilter] = useState('All status');
  const [pkgFilter, setPkgFilter] = useState('All packages');
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);

  useEffect(() => { setPage(0); }, [search, areaFilter, statusFilter, pkgFilter]);

  useEffect(() => {
    Promise.all([getCustomers(), getAreas(), getPackages()])
      .then(([c, a, p]) => { setCustomers(c); setAreas(a); setPackages(p); })
      .finally(() => setLoading(false));
  }, []);

  const [editCustomer, setEditCustomer] = useState<CustomerWithRelations | null>(null);

  const handleCustomerSaved = (c: CustomerWithRelations) => {
    setCustomers(prev => [c, ...prev]);
  };

  const handleCustomerUpdated = (updated: CustomerWithRelations) => {
    setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
    setSelected(null);
  };

  const filtered = customers.filter(c => {
    if (search && !c.full_name.toLowerCase().includes(search.toLowerCase()) &&
        !c.customer_code.includes(search) && !(c.username ?? '').includes(search)) return false;
    if (areaFilter !== 'All areas' && c.area?.name !== areaFilter) return false;
    if (statusFilter !== 'All status' && c.status !== statusFilter) return false;
    if (pkgFilter !== 'All packages' && c.package?.name !== pkgFilter) return false;
    return true;
  });

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="muted">Loading customers…</div>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Customers</h1>
          <p>{customers.length} total · managing active, suspended and onboarding subscribers</p>
        </div>
        <div className="row gap-sm">
          <button className="btn btn-secondary"><Icon name="download" size={14} />Export CSV</button>
          {!readOnly && (
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Icon name="plus" size={14} />Add Customer</button>
          )}
        </div>
      </div>

      <div className="filter-bar">
        <div className="search">
          <Icon name="search" size={14} />
          <input placeholder="Search by name, username or customer ID…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="select" style={{ width: 'auto' }} value={areaFilter} onChange={e => setAreaFilter(e.target.value)}>
          <option>All areas</option>
          {areas.map(a => <option key={a.id}>{a.name}</option>)}
        </select>
        <select className="select" style={{ width: 'auto' }} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option>All status</option>
          <option value="active">Active</option>
          <option value="free">Free</option>
          <option value="suspended">Suspended</option>
          <option value="disconnected">Disconnected</option>
          <option value="tdc">TDC</option>
          <option value="shifted">Shifted</option>
        </select>
        <select className="select" style={{ width: 'auto' }} value={pkgFilter} onChange={e => setPkgFilter(e.target.value)}>
          <option>All packages</option>
          {packages.map(p => <option key={p.id}>{p.name}</option>)}
        </select>
        <div className="spacer" />
        <button className="btn btn-ghost btn-sm"><Icon name="filter" size={14} />More filters</button>
      </div>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 40 }}><input type="checkbox" /></th>
              <th>Customer</th>
              <th>CNIC</th>
              <th>Phone</th>
              <th>Area</th>
              <th>Package</th>
              <th>Status</th>
              <th>Due Amount</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginated.map(c => (
              <tr key={c.id} className={`clickable ${selected?.id === c.id ? 'selected' : ''}`} onClick={() => setSelected(c)}>
                <td onClick={e => e.stopPropagation()}><input type="checkbox" /></td>
                <td>
                  <div className="cell-user">
                    <Avatar name={c.full_name} size={32} />
                    <div>
                      <div className="nm">{c.full_name}</div>
                      <div className="sub mono">{c.customer_code}</div>
                    </div>
                  </div>
                </td>
                <td className="mono muted" style={{ fontSize: 12 }}>{c.cnic ?? '—'}</td>
                <td className="mono" style={{ fontSize: 12 }}>{c.phone ?? '—'}</td>
                <td>{c.area?.name ?? '—'}</td>
                <td>{c.package?.name ?? '—'}</td>
                <td>
                  <Badge color={c.status === 'active' ? 'green' : c.status === 'free' ? 'blue' : c.status === 'suspended' ? 'amber' : 'red'} dot>
                    {c.status}
                  </Badge>
                </td>
                <td className="mono" style={{ fontSize: 12 }}>
                  {c.due_amount ? `Rs. ${c.due_amount.toLocaleString()}` : '—'}
                </td>
                <td onClick={e => e.stopPropagation()} style={{ textAlign: 'right' }}>
                  <div className="row gap-sm" style={{ justifyContent: 'flex-end' }}>
                    <button className="icon-btn" style={{ width: 28, height: 28 }}><Icon name="eye" size={14} /></button>
                    {!readOnly && (
                      <button className="icon-btn" style={{ width: 28, height: 28 }} onClick={() => setEditCustomer(c)}><Icon name="edit" size={14} /></button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, fontSize: 13, color: 'var(--text-muted)' }}>
        <div>
          Showing <strong style={{ color: 'var(--text)' }}>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filtered.length)}</strong> of {filtered.length}
        </div>
        <div className="row gap-sm">
          <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
            <Icon name="chevronLeft" size={12} />Prev
          </button>
          <span style={{ fontSize: 12, padding: '0 4px' }}>Page {page + 1} of {totalPages || 1}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
            Next<Icon name="chevronRight" size={12} />
          </button>
        </div>
      </div>

      <Drawer open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <CustomerDetail
            customer={selected}
            onClose={() => setSelected(null)}
            onEdit={() => { setEditCustomer(selected); setSelected(null); }}
            readOnly={readOnly}
          />
        )}
      </Drawer>

      <Drawer open={showAdd} onClose={() => setShowAdd(false)}>
        {showAdd && (
          <AddCustomerDrawer
            areas={areas}
            packages={packages}
            onClose={() => setShowAdd(false)}
            onSaved={handleCustomerSaved}
          />
        )}
      </Drawer>

      <Drawer open={!!editCustomer} onClose={() => setEditCustomer(null)}>
        {editCustomer && (
          <AddCustomerDrawer
            areas={areas}
            packages={packages}
            onClose={() => setEditCustomer(null)}
            onSaved={handleCustomerUpdated}
            editTarget={editCustomer}
          />
        )}
      </Drawer>
    </div>
  );
}
