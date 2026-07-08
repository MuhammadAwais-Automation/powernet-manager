'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Icon, { type IconName } from '../Icon';
import { Badge, Avatar, Tabs, Modal } from '../ui';
import {
  generateMonthlyCableBills,
  getCableBillById,
  getCableBillPayments,
  getCableBillingSummary,
  getCableBillsPage,
  getCableBillStatusLabel,
  normalizeBillStatusFilter,
  normalizeBillingMonth,
  recordCableBillPayment,
  type CableBillingSummary,
} from '@/lib/db/cable-bills';
import { getCableSettings } from '@/lib/db/cable-settings';
import { getAreas } from '@/lib/db/areas';
import { getCurrentBillingMonth, getBillCollectionStatus } from '@/lib/billing/core';
import type { Area, CableBillWithRelations, PaymentMethod, Staff } from '@/types/database';

type CableTab = 'All' | 'Unpaid' | 'Paid' | 'Overdue' | 'Partial';

function remainingAmount(bill: Pick<CableBillWithRelations, 'amount' | 'paid_amount'>): number {
  return Math.max(bill.amount - (bill.paid_amount ?? 0), 0);
}

function statusColor(status: string): 'green' | 'red' | 'amber' | 'purple' {
  if (status === 'paid') return 'green';
  if (status === 'partial') return 'purple';
  if (status === 'overdue') return 'red';
  return 'amber';
}

function cableBillStatusKey(
  bill: Pick<CableBillWithRelations, 'amount' | 'paid_amount' | 'status'>,
): string {
  const status = getBillCollectionStatus(bill);
  return status === 'partial' ? 'partial' : bill.status;
}

function CablePaymentModal({
  bill,
  staff,
  fmt,
  onClose,
  onSaved,
}: {
  bill: CableBillWithRelations;
  staff: Staff;
  fmt: (n: number) => string;
  onClose: () => void;
  onSaved: (notice: string) => void;
}) {
  const remaining = remainingAmount(bill);
  const [amount, setAmount] = useState(String(remaining));
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [paidAt, setPaidAt] = useState(() => new Date().toISOString().slice(0, 16));
  const [note, setNote] = useState('Paid in office');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numericAmount = Number(amount);

  const handleSubmit = async () => {
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Enter a valid payment amount.');
      return;
    }
    if (numericAmount > remaining) {
      setError('Payment amount cannot exceed remaining balance.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await recordCableBillPayment({
        billId: bill.id,
        amount: Math.round(numericAmount),
        collectedBy: staff.id,
        method,
        source: 'office',
        paidAt: paidAt ? new Date(paidAt).toISOString() : null,
        note,
      });
      onSaved(`Cable payment recorded. Receipt ${result.receiptNo}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not record payment.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open onClose={onClose} width={460}>
      <div className="modal-head">
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>Record Cable Payment</div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            {bill.customer?.full_name ?? 'Subscriber'} — remaining {fmt(remaining)}
          </div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      <div className="modal-body">
        {error && <div style={{ padding: '10px 12px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', marginBottom: 12, fontSize: 13 }}>{error}</div>}
        <label className="muted" style={{ fontSize: 11, fontWeight: 600 }}>Amount (PKR)</label>
        <input className="select" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ marginBottom: 12 }} />
        <label className="muted" style={{ fontSize: 11, fontWeight: 600 }}>Method</label>
        <select className="select" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} style={{ marginBottom: 12 }}>
          <option value="cash">Cash</option>
          <option value="bank">Bank</option>
          <option value="easypaisa">Easypaisa</option>
          <option value="jazzcash">JazzCash</option>
          <option value="other">Other</option>
        </select>
        <label className="muted" style={{ fontSize: 11, fontWeight: 600 }}>Paid at</label>
        <input className="select" type="datetime-local" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} style={{ marginBottom: 12 }} />
        <label className="muted" style={{ fontSize: 11, fontWeight: 600 }}>Note</label>
        <input className="select" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <div className="modal-foot">
        <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn btn-primary" onClick={handleSubmit} disabled={saving}>{saving ? 'Saving…' : 'Record Payment'}</button>
      </div>
    </Modal>
  );
}

export default function CableBillingTab({ staff }: { staff: Staff }) {
  const [billingMonth, setBillingMonth] = useState(getCurrentBillingMonth());
  const [tab, setTab] = useState<CableTab>('All');
  const [rawSearch, setRawSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [areaFilter, setAreaFilter] = useState('');
  const [areas, setAreas] = useState<Area[]>([]);
  const [cablePrice, setCablePrice] = useState(0);
  const [rows, setRows] = useState<CableBillWithRelations[]>([]);
  const [totalBills, setTotalBills] = useState(0);
  const [summary, setSummary] = useState<CableBillingSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [page, setPage] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [detailBill, setDetailBill] = useState<CableBillWithRelations | null>(null);
  const [paymentBill, setPaymentBill] = useState<CableBillWithRelations | null>(null);
  const [billPayments, setBillPayments] = useState<unknown[]>([]);
  const PAGE_SIZE = 50;

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(rawSearch), 250);
    return () => window.clearTimeout(timer);
  }, [rawSearch]);

  useEffect(() => { setPage(0); }, [tab, debouncedSearch, areaFilter, billingMonth]);

  useEffect(() => {
    getAreas().then(setAreas).catch(() => {});
    getCableSettings().then((s) => setCablePrice(s.monthly_price)).catch(() => {});
  }, [reloadToken]);

  const loadKey = useMemo(
    () => JSON.stringify({ billingMonth, tab, debouncedSearch, areaFilter, page, reloadToken }),
    [billingMonth, tab, debouncedSearch, areaFilter, page, reloadToken],
  );

  const loadBilling = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const month = normalizeBillingMonth(billingMonth);
      const [pageResult, summaryResult] = await Promise.all([
        getCableBillsPage({
          month,
          page,
          pageSize: PAGE_SIZE,
          status: normalizeBillStatusFilter(tab),
          search: debouncedSearch,
          areaId: areaFilter || undefined,
        }),
        getCableBillingSummary(month, areaFilter || undefined),
      ]);
      setRows(pageResult.rows);
      setTotalBills(pageResult.total);
      setSummary(summaryResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load cable billing');
    } finally {
      setLoading(false);
    }
  }, [billingMonth, tab, debouncedSearch, areaFilter, page]);

  useEffect(() => { loadBilling(); }, [loadKey, loadBilling]);

  useEffect(() => {
    if (!detailBill) { setBillPayments([]); return; }
    getCableBillPayments(detailBill.id).then(setBillPayments).catch(() => setBillPayments([]));
  }, [detailBill]);

  const fmt = (n: number) => `Rs. ${n.toLocaleString()}`;
  const totalPages = Math.ceil(totalBills / PAGE_SIZE) || 1;

  const kpiCards: { label: string; amount: string; count: string; color: string; icon: IconName }[] = [
    { label: 'Total Billed', amount: fmt(summary?.totalBilled ?? 0), count: String(summary?.totalBills ?? 0), color: 'blue', icon: 'fileText' },
    { label: 'Collected', amount: fmt(summary?.totalPaid ?? 0), count: String(summary?.paidBills ?? 0), color: 'green', icon: 'checkCircle' },
    { label: 'Remaining', amount: fmt(summary?.totalRemaining ?? 0), count: String(summary?.unpaidBills ?? 0), color: 'amber', icon: 'clock' },
    { label: 'Overdue', amount: fmt(summary?.overdueTotal ?? 0), count: String(summary?.overdueBills ?? 0), color: 'red', icon: 'alertTri' },
  ];

  const handleGenerate = async () => {
    if (cablePrice <= 0) {
      setError('Set cable monthly price in Settings before generating bills.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const result = await generateMonthlyCableBills(normalizeBillingMonth(billingMonth));
      setMessage(`${result.created} cable bills generated for ${result.month} at Rs. ${result.price}/subscriber.`);
      setReloadToken((t) => t + 1);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not generate cable bills');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Cable Billing</h1>
          <p>{billingMonth} cycle · fixed rate Rs. {cablePrice.toLocaleString()}/subscriber</p>
        </div>
        <div className="row gap-sm">
          <input className="select" type="month" value={billingMonth} onChange={(e) => setBillingMonth(e.target.value)} style={{ width: 150 }} />
          <button className="btn btn-primary" onClick={handleGenerate} disabled={generating}>
            <Icon name="fileText" size={14} />
            {generating ? 'Generating…' : 'Generate Cable Bills'}
          </button>
        </div>
      </div>

      {message && <div style={{ padding: '10px 16px', background: 'var(--green-50)', color: 'var(--green)', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{message}</div>}
      {error && <div style={{ padding: '10px 16px', background: 'var(--red-bg, #fef2f2)', color: 'var(--red)', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>{error}</div>}

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        {kpiCards.map((k) => (
          <div key={k.label} className="card card-pad">
            <div className="row gap-sm" style={{ alignItems: 'center', marginBottom: 8 }}>
              <span className={`icon-badge ${k.color}`} style={{ width: 32, height: 32 }}><Icon name={k.icon} size={16} /></span>
              <span className="muted" style={{ fontSize: 12 }}>{k.label}</span>
            </div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{k.amount}</div>
            <div className="muted" style={{ fontSize: 12 }}>{k.count} bills</div>
          </div>
        ))}
      </div>

      <Tabs
        value={tab}
        onChange={(value) => setTab(value as CableTab)}
        items={[
          { value: 'All', label: 'All Bills', count: summary?.totalBills ?? 0 },
          { value: 'Unpaid', label: 'Unpaid', count: summary?.unpaidBills ?? 0 },
          { value: 'Partial', label: 'Less Paid' },
          { value: 'Paid', label: 'Paid', count: summary?.paidBills ?? 0 },
          { value: 'Overdue', label: 'Overdue', count: summary?.overdueBills ?? 0 },
        ]}
      />

      <div className="filter-bar" style={{ marginTop: 14 }}>
        <div className="search">
          <Icon name="search" size={14} />
          <input placeholder="Search subscriber…" value={rawSearch} onChange={(e) => setRawSearch(e.target.value)} />
        </div>
        <select className="select" style={{ width: 'auto' }} value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}>
          <option value="">All areas</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </div>

      <div className="table-wrap" style={{ marginTop: 14, opacity: loading ? 0.5 : 1 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Subscriber</th>
              <th>Month</th>
              <th>Amount</th>
              <th>Paid</th>
              <th>Remaining</th>
              <th>Status</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b) => {
              const label = getCableBillStatusLabel(b);
              const rem = remainingAmount(b);
              return (
                <tr key={b.id} className="clickable" onClick={() => setDetailBill(b)}>
                  <td>
                    <div className="cell-user">
                      <Avatar name={b.customer?.full_name ?? '?'} size={32} />
                      <div>
                        <div className="nm">{b.customer?.full_name ?? '—'}</div>
                        <div className="sub mono">{b.customer?.customer_code}</div>
                      </div>
                    </div>
                  </td>
                  <td className="mono">{b.month}</td>
                  <td className="mono">{fmt(b.amount)}</td>
                  <td className="mono">{fmt(b.paid_amount ?? 0)}</td>
                  <td className="mono">{fmt(rem)}</td>
                  <td><Badge color={statusColor(cableBillStatusKey(b))} dot>{label}</Badge></td>
                  <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>
                    {rem > 0 && (
                      <button className="btn btn-sm btn-primary" onClick={() => setPaymentBill(b)}>Pay</button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, fontSize: 13, color: 'var(--text-muted)' }}>
        <span>{totalBills} bills</span>
        <div className="row gap-sm">
          <button className="btn btn-secondary btn-sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Prev</button>
          <span>Page {page + 1} of {totalPages}</span>
          <button className="btn btn-secondary btn-sm" disabled={page >= totalPages - 1} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      </div>

      {paymentBill && (
        <CablePaymentModal
          bill={paymentBill}
          staff={staff}
          fmt={fmt}
          onClose={() => setPaymentBill(null)}
          onSaved={(notice) => {
            setPaymentBill(null);
            setMessage(notice);
            setReloadToken((t) => t + 1);
            if (detailBill?.id === paymentBill.id) {
              getCableBillById(paymentBill.id).then((b) => { if (b) setDetailBill(b); });
            }
          }}
        />
      )}

      <Modal open={!!detailBill} onClose={() => setDetailBill(null)} width={520}>
        {detailBill && (
          <>
            <div className="modal-head">
              <div>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{detailBill.customer?.full_name}</div>
                <div className="muted" style={{ fontSize: 12 }}>{detailBill.month} · {fmt(detailBill.amount)}</div>
              </div>
              <button className="icon-btn" onClick={() => setDetailBill(null)}><Icon name="close" size={16} /></button>
            </div>
            <div className="modal-body">
              <Badge color={statusColor(cableBillStatusKey(detailBill))} dot>{getCableBillStatusLabel(detailBill)}</Badge>
              <div style={{ marginTop: 14, fontSize: 13 }}>
                <div>Paid: {fmt(detailBill.paid_amount ?? 0)}</div>
                <div>Remaining: {fmt(remainingAmount(detailBill))}</div>
                {detailBill.receipt_no && <div className="mono muted" style={{ marginTop: 6 }}>Receipt: {detailBill.receipt_no}</div>}
              </div>
              {billPayments.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div className="muted" style={{ fontSize: 11, fontWeight: 600, marginBottom: 8 }}>PAYMENTS</div>
                  {(billPayments as { id: string; amount: number; receipt_no: string; paid_at: string }[]).map((p) => (
                    <div key={p.id} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                      {fmt(p.amount)} · {p.receipt_no} · {new Date(p.paid_at).toLocaleString()}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-foot">
              {remainingAmount(detailBill) > 0 && (
                <button className="btn btn-primary" onClick={() => { setPaymentBill(detailBill); }}>Record Payment</button>
              )}
              <button className="btn btn-secondary" onClick={() => setDetailBill(null)}>Close</button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}