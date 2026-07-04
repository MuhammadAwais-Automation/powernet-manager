'use client';

import React, { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import { Badge, Avatar, Drawer } from '../ui';
import { createCustomer, getCustomerById, updateCustomer } from '@/lib/db/customers';
import { getCableSubscriberList } from '@/lib/db/cable-list';
import { getCableBillsByCustomer } from '@/lib/db/cable-bills';
import { getCableSettings } from '@/lib/db/cable-settings';
import { getCachedAreas, setCachedAreas } from '@/lib/db/customer-cache';
import { getAreas } from '@/lib/db/areas';
import { getPackages } from '@/lib/db/packages';
import type {
  Area,
  CableBillWithRelations,
  CableListRow,
  CableType,
  CustomerStatus,
  CustomerWithRelations,
  Package,
} from '@/types/database';

function displayStatus(c: { status: CustomerStatus; is_tdc?: boolean }): CustomerStatus {
  return c.is_tdc ? 'tdc' : c.status;
}

function cableTypeLabel(type: CableType | null | undefined): string {
  if (type === 'digital') return 'Digital';
  if (type === 'analog') return 'Analog';
  return '—';
}

function cableTypeColor(type: CableType | null | undefined): 'blue' | 'amber' | 'red' {
  if (type === 'digital') return 'blue';
  if (type === 'analog') return 'amber';
  return 'red';
}

function addressDisplay(customer: {
  address_type?: CustomerWithRelations['address_type'];
  address_value?: string | null;
  house_id?: string | null;
  remarks?: string | null;
}): string {
  const parts: string[] = [];
  if (customer.address_value) {
    if (customer.address_type === 'id_number') {
      const v = customer.address_value.trim().toUpperCase();
      parts.push(v.startsWith('ID NO') || v.startsWith('ID NUMBER') ? customer.address_value : `ID NO ${customer.address_value}`);
    } else {
      parts.push(customer.address_value);
    }
  }
  if (customer.house_id && customer.house_id !== customer.address_value) {
    parts.push(customer.house_id);
  }
  if (!parts.length && customer.remarks) {
    const card = customer.remarks.match(/Card:\s*(\S+)/);
    if (card) parts.push(`Card ${card[1]}`);
  }
  return parts.join(' · ') || '—';
}

function cardFromRemarks(remarks: string | null | undefined): string | null {
  if (!remarks) return null;
  const m = remarks.match(/Card:\s*(\S+)/);
  return m ? m[1] : null;
}

function ServiceBadges({ customer }: { customer: Pick<CustomerWithRelations, 'has_cable' | 'has_internet' | 'iptv' | 'cable_type'> }) {
  const items: React.ReactNode[] = [];
  if (customer.has_cable) {
    items.push(
      <Badge key="cable" color="purple" dot>
        Cable{customer.cable_type ? ` (${cableTypeLabel(customer.cable_type)})` : ''}
      </Badge>,
    );
  }
  if (customer.has_internet) {
    items.push(<Badge key="internet" color="green" dot>Internet</Badge>);
  }
  if (customer.iptv) {
    items.push(<Badge key="iptv" color="blue" dot>IPTV</Badge>);
  }
  if (!items.length) {
    return <span className="muted" style={{ fontSize: 12 }}>—</span>;
  }
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{items}</div>;
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 500, textAlign: 'right' }}>{value ?? '—'}</span>
    </div>
  );
}

function CableSubscriberForm({
  areas,
  packages,
  cablePrice,
  onClose,
  onSaved,
  editTarget,
}: {
  areas: Area[];
  packages: Package[];
  cablePrice: number;
  onClose: () => void;
  onSaved: () => void;
  editTarget?: CustomerWithRelations;
}) {
  const [form, setForm] = useState({
    full_name: editTarget?.full_name ?? '',
    cnic: editTarget?.cnic ?? '',
    phone: editTarget?.phone ?? '',
    cable_type: (editTarget?.cable_type ?? '') as '' | CableType,
    address_type: (editTarget?.address_type ?? 'text') as 'text' | 'id_number',
    address_value: editTarget?.address_value ?? '',
    area_id: editTarget?.area_id ?? '',
    connection_date: editTarget?.connection_date ?? '',
    status: (editTarget?.is_tdc ? 'tdc' : (editTarget?.status ?? 'active')) as CustomerStatus,
    remarks: editTarget?.remarks ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: string, val: unknown) => setForm((f) => ({ ...f, [key]: val }));

  const handleSubmit = async () => {
    if (!form.full_name.trim()) { setError('Name required'); return; }
    if (!form.area_id) { setError('Area required'); return; }
    if (!form.phone.trim()) { setError('Phone required'); return; }
    if (!form.cable_type) { setError('Cable type required (Digital or Analog)'); return; }

    setSaving(true);
    setError(null);
    try {
      const payload = {
        full_name: form.full_name.trim(),
        cnic: form.cnic || null,
        phone: form.phone || null,
        username: editTarget?.username ?? null,
        has_cable: true,
        has_internet: editTarget?.has_internet ?? false,
        iptv: editTarget?.iptv ?? false,
        package_id: editTarget?.package_id ?? null,
        due_amount: editTarget?.due_amount ?? null,
        cable_type: form.cable_type,
        address_type: form.address_type,
        address_value: form.address_value || null,
        area_id: form.area_id,
        connection_date: form.connection_date || null,
        status: form.status,
        remarks: form.remarks || null,
        onu_number: editTarget?.onu_number ?? null,
        disconnected_date: editTarget?.disconnected_date ?? null,
        reconnected_date: editTarget?.reconnected_date ?? null,
      };

      if (editTarget) {
        await updateCustomer(editTarget.id, payload);
      } else {
        await createCustomer(payload);
      }
      onSaved();
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
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{editTarget ? 'Edit Cable Subscriber' : 'Add Cable Subscriber'}</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>Fixed cable rate: Rs. {cablePrice.toLocaleString()}/mo</div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      <div className="drawer-body">
        {error && (
          <div style={{ padding: '10px 16px', background: 'var(--red-bg, #fef2f2)', color: 'var(--red, #dc2626)', borderRadius: 8, marginBottom: 14, fontSize: 13 }}>
            {error}
          </div>
        )}

        <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Basic Info</div>
          <input className="select" placeholder="Full Name *" value={form.full_name} onChange={(e) => set('full_name', e.target.value)} />
          <input className="select" placeholder="CNIC (optional)" value={form.cnic} onChange={(e) => set('cnic', e.target.value)} />
          <input className="select" placeholder="Phone *" value={form.phone} onChange={(e) => set('phone', e.target.value)} />
        </div>

        <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Cable Type</div>
          <div className="row gap-sm">
            <button type="button" className={`btn btn-sm ${form.cable_type === 'digital' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => set('cable_type', 'digital')}>Digital (DECO)</button>
            <button type="button" className={`btn btn-sm ${form.cable_type === 'analog' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => set('cable_type', 'analog')}>Analog (ANAL)</button>
          </div>
        </div>

        <div className="card card-pad" style={{ marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="muted" style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Location</div>
          <div className="row gap-sm">
            <button type="button" className={`btn btn-sm ${form.address_type === 'id_number' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => set('address_type', 'id_number')}>ID Number</button>
            <button type="button" className={`btn btn-sm ${form.address_type === 'text' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => set('address_type', 'text')}>Text Address</button>
          </div>
          <input className="select" placeholder={form.address_type === 'id_number' ? 'ID Number' : 'Address'} value={form.address_value} onChange={(e) => set('address_value', e.target.value)} />
          <select className="select" value={form.area_id} onChange={(e) => set('area_id', e.target.value)}>
            <option value="">Select area *</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.code})</option>)}
          </select>
          <input className="select" type="date" value={form.connection_date} onChange={(e) => set('connection_date', e.target.value)} />
          <select className="select" value={form.status} onChange={(e) => set('status', e.target.value)}>
            <option value="active">Active</option>
            <option value="free">Free</option>
            <option value="suspended">Suspended</option>
            <option value="disconnected">Disconnected</option>
            <option value="tdc">TDC</option>
            <option value="shifted">Shifted</option>
          </select>
        </div>
      </div>
      <div className="drawer-foot">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : editTarget ? 'Save Changes' : 'Add Subscriber'}</button>
      </div>
    </>
  );
}

function CableSubscriberDetail({
  customer,
  cablePrice,
  onClose,
  onEdit,
}: {
  customer: CustomerWithRelations;
  cablePrice: number;
  onClose: () => void;
  onEdit: () => void;
}) {
  const [bills, setBills] = useState<CableBillWithRelations[]>([]);

  useEffect(() => {
    getCableBillsByCustomer(customer.id).then(setBills).catch(() => setBills([]));
  }, [customer.id]);

  const outstanding = bills.reduce((sum, b) => sum + Math.max(b.amount - (b.paid_amount ?? 0), 0), 0);
  const cardNo = cardFromRemarks(customer.remarks);

  return (
    <>
      <div className="drawer-head">
        <div className="row gap-md">
          <Avatar name={customer.full_name} size={44} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{customer.full_name}</div>
            <div className="muted mono" style={{ fontSize: 11 }}>{customer.customer_code} · {customer.area?.name ?? '—'}</div>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      <div className="drawer-body">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-muted)', borderRadius: 10, marginBottom: 16, border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          {customer.cable_type && (
            <Badge color={cableTypeColor(customer.cable_type)} dot>{cableTypeLabel(customer.cable_type)} Cable</Badge>
          )}
          <Badge color="purple" dot>Cable Rs. {cablePrice.toLocaleString()}/mo</Badge>
          <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }}>
            {displayStatus(customer).toUpperCase()}
          </span>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Personal Info</h3></div>
          <div className="card-pad" style={{ paddingTop: 8, paddingBottom: 8 }}>
            <InfoRow label="CNIC" value={customer.cnic} />
            <InfoRow label="Phone" value={customer.phone} />
            <InfoRow label="Card No" value={cardNo} />
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Location</h3></div>
          <div className="card-pad" style={{ paddingTop: 8, paddingBottom: 8 }}>
            <InfoRow label="Address" value={addressDisplay(customer)} />
            <InfoRow label="Area" value={customer.area ? `${customer.area.name} (${customer.area.code})` : '—'} />
            {customer.connection_date && <InfoRow label="Connected Since" value={customer.connection_date} />}
          </div>
        </div>

        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-head"><h3>Services</h3></div>
          <div className="card-pad" style={{ paddingTop: 8, paddingBottom: 8 }}>
            <InfoRow label="Cable Type" value={customer.cable_type ? <Badge color={cableTypeColor(customer.cable_type)} dot>{cableTypeLabel(customer.cable_type)}</Badge> : '—'} />
            <InfoRow label="Cable" value={customer.has_cable ? <Badge color="purple" dot>Active</Badge> : <span className="muted" style={{ fontSize: 12 }}>Not subscribed</span>} />
            <InfoRow label="Internet" value={customer.has_internet ? <Badge color="green" dot>{customer.package?.name ?? 'Active'}</Badge> : <span className="muted" style={{ fontSize: 12 }}>Not subscribed</span>} />
            <InfoRow label="IPTV" value={customer.iptv ? <Badge color="blue" dot>Active</Badge> : <span className="muted" style={{ fontSize: 12 }}>Not subscribed</span>} />
            {customer.onu_number && <InfoRow label="ONU Number" value={customer.onu_number} />}
          </div>
        </div>

        {customer.remarks && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-head"><h3>Remarks</h3></div>
            <div className="card-pad" style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5 }}>{customer.remarks}</div>
          </div>
        )}

        <div className="card">
          <div className="card-head">
            <h3>Cable Bills</h3>
            <span className="muted" style={{ fontSize: 12 }}>Outstanding: Rs. {outstanding.toLocaleString()}</span>
          </div>
          <div className="card-pad" style={{ paddingTop: 0 }}>
            {bills.length === 0 ? (
              <div className="muted" style={{ fontSize: 13, padding: '12px 0' }}>No cable bills yet. Generate from Cable Billing tab.</div>
            ) : (
              bills.slice(0, 6).map((b) => (
                <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                  <span className="mono">{b.month}</span>
                  <span>Rs. {b.amount.toLocaleString()}</span>
                  <Badge color={b.status === 'paid' ? 'green' : b.status === 'overdue' ? 'red' : 'amber'} dot>{b.status}</Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      <div className="drawer-foot">
        <button className="btn btn-secondary" onClick={onEdit}><Icon name="edit" size={14} />Edit</button>
        <button className="btn btn-primary" onClick={onClose}>Close</button>
      </div>
    </>
  );
}

export default function CableSubscribersTab() {
  const [rows, setRows] = useState<CableListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [areas, setAreas] = useState<Area[]>(() => getCachedAreas() ?? []);
  const [packages, setPackages] = useState<Package[]>([]);
  const [cablePrice, setCablePrice] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<CustomerWithRelations | null>(null);
  const [editTarget, setEditTarget] = useState<CustomerWithRelations | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [rawSearch, setRawSearch] = useState('');
  const [search, setSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [cableTypeFilter, setCableTypeFilter] = useState<'' | CableType>('');
  const [internetFilter, setInternetFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [reloadToken, setReloadToken] = useState(0);
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(0);
  const moreFiltersRef = useRef<HTMLDivElement>(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(rawSearch), 250);
    return () => window.clearTimeout(timer);
  }, [rawSearch]);

  useEffect(() => {
    setPage(0);
  }, [search, areaFilter, cableTypeFilter, internetFilter, reloadToken]);

  useEffect(() => {
    Promise.all([
      getCachedAreas() ? Promise.resolve(getCachedAreas()!) : getAreas(),
      getPackages(),
      getCableSettings(),
    ])
      .then(([loadedAreas, loadedPackages, settings]) => {
        setCachedAreas(loadedAreas);
        setAreas(loadedAreas);
        setPackages(loadedPackages);
        setCablePrice(settings.monthly_price);
      })
      .catch(() => {});
  }, [reloadToken]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getCableSubscriberList({
      page,
      pageSize: PAGE_SIZE,
      search,
      areaId: areaFilter || undefined,
      cableType: cableTypeFilter || undefined,
      hasInternet: internetFilter === 'all' ? undefined : internetFilter === 'yes',
    })
      .then((result) => {
        if (cancelled) return;
        setRows(result.rows);
        setTotal(result.total);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load cable subscribers');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [page, search, areaFilter, cableTypeFilter, internetFilter, reloadToken]);

  const handleSelect = async (id: string) => {
    const full = await getCustomerById(id);
    if (full) setSelected(full);
  };

  const totalPages = Math.ceil(total / PAGE_SIZE) || 1;

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Cable Subscribers</h1>
          <p>{total.toLocaleString()} subscribers · fixed rate Rs. {cablePrice.toLocaleString()}/mo</p>
        </div>
        <button className="btn btn-primary" onClick={() => setShowAdd(true)}>
          <Icon name="plus" size={14} />Add Subscriber
        </button>
      </div>

      <div className="filter-bar">
        <div className="search">
          <Icon name="search" size={14} />
          <input placeholder="Search by name, code, phone…" value={rawSearch} onChange={(e) => setRawSearch(e.target.value)} />
        </div>
        <select className="select" style={{ width: 'auto' }} value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
          <option value="">All areas</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="select" style={{ width: 'auto' }} value={cableTypeFilter} onChange={(e) => setCableTypeFilter(e.target.value as '' | CableType)}>
          <option value="">All cable types</option>
          <option value="digital">Digital (DECO)</option>
          <option value="analog">Analog (ANAL)</option>
        </select>
        <div className="spacer" />
        <div ref={moreFiltersRef} style={{ position: 'relative' }}>
          <button className={`btn btn-ghost btn-sm${showMoreFilters || internetFilter !== 'all' ? ' active' : ''}`} onClick={() => setShowMoreFilters((v) => !v)}>
            <Icon name="filter" size={14} />More filters
          </button>
          {showMoreFilters && (
            <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', padding: '12px 16px', minWidth: 200 }}>
              <select className="select" value={internetFilter} onChange={(e) => setInternetFilter(e.target.value as 'all' | 'yes' | 'no')} style={{ width: '100%' }}>
                <option value="all">All subscribers</option>
                <option value="yes">With internet</option>
                <option value="no">Cable only</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 16px', background: 'var(--red-bg, #fef2f2)', color: 'var(--red)', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="table-wrap" style={{ opacity: loading ? 0.5 : 1 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Subscriber</th>
              <th>Phone</th>
              <th>Address</th>
              <th>Area</th>
              <th>Services</th>
              <th>Cable Type</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="clickable" onClick={() => handleSelect(c.id)}>
                <td>
                  <div className="cell-user">
                    <Avatar name={c.full_name} size={32} />
                    <div>
                      <div className="nm">{c.full_name}</div>
                      <div className="sub mono">{c.customer_code}</div>
                    </div>
                  </div>
                </td>
                <td className="mono" style={{ fontSize: 12 }}>{c.phone ?? '—'}</td>
                <td style={{ fontSize: 12, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{addressDisplay(c)}</td>
                <td>{c.area?.name ?? '—'}</td>
                <td><ServiceBadges customer={c} /></td>
                <td>
                  {c.cable_type
                    ? <Badge color={cableTypeColor(c.cable_type)} dot>{cableTypeLabel(c.cable_type)}</Badge>
                    : <span className="muted" style={{ fontSize: 12 }}>—</span>}
                </td>
                <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>
                  <button className="icon-btn" onClick={() => handleSelect(c.id)}><Icon name="eye" size={14} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, fontSize: 13, color: 'var(--text-muted)' }}>
        <div>Showing {total === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}</div>
        <div className="row gap-sm">
          <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span style={{ fontSize: 12 }}>Page {page + 1} of {totalPages}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>

      <Drawer open={showAdd || !!editTarget} onClose={() => { setShowAdd(false); setEditTarget(null); }}>
        {(showAdd || editTarget) && (
          <CableSubscriberForm
            areas={areas}
            packages={packages}
            cablePrice={cablePrice}
            editTarget={editTarget ?? undefined}
            onClose={() => { setShowAdd(false); setEditTarget(null); }}
            onSaved={() => setReloadToken((t) => t + 1)}
          />
        )}
      </Drawer>

      <Drawer open={!!selected} onClose={() => setSelected(null)}>
        {selected && (
          <CableSubscriberDetail
            customer={selected}
            cablePrice={cablePrice}
            onClose={() => setSelected(null)}
            onEdit={() => { setEditTarget(selected); setSelected(null); }}
          />
        )}
      </Drawer>
    </div>
  );
}