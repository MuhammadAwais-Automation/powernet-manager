'use client';
import React, { useEffect, useState } from 'react';
import Icon, { type IconName } from '../Icon';
import { Badge, Avatar, IconBadge, Tabs } from '../ui';
import { BarChart } from '../charts';
import {
  getBillsPage,
  getBillingSummary,
  generateMonthlyBills,
  markBillPaid,
  recordBillPayment,
  searchUnpaidBills,
  type BillingSummary,
  type GenerateBillsResult,
} from '@/lib/db/bills';
import { getStaff } from '@/lib/db/staff';
import { getCurrentBillingMonth, normalizeBillingMonth } from '@/lib/billing/core';
import { normalizeBillingSearch, normalizeBillStatusFilter, type BillingTab } from '@/lib/billing/query';
import { useAuth } from '@/lib/auth/auth-context';
import type { BillWithRelations, PaymentMethod, StaffWithArea } from '@/types/database';

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank' },
  { value: 'easypaisa', label: 'Easypaisa' },
  { value: 'jazzcash', label: 'JazzCash' },
  { value: 'other', label: 'Other' },
];

function remainingAmount(bill: Pick<BillWithRelations, 'amount' | 'paid_amount'>): number {
  return Math.max(bill.amount - (bill.paid_amount ?? 0), 0);
}

function statusColor(status: string): 'green' | 'red' | 'amber' {
  if (status === 'paid') return 'green';
  if (status === 'overdue') return 'red';
  return 'amber';
}

export default function BillingPage() {
  const { staff: currentStaff } = useAuth();
  const [bills, setBills] = useState<BillWithRelations[]>([]);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [totalBills, setTotalBills] = useState(0);
  const [staff, setStaff] = useState<StaffWithArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<BillingTab>('All');
  const [billingMonth, setBillingMonth] = useState(getCurrentBillingMonth());
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(0);
  const [reloadToken, setReloadToken] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [payingBillId, setPayingBillId] = useState<string | null>(null);
  const [billSearch, setBillSearch] = useState('');
  const [unpaidBillOptions, setUnpaidBillOptions] = useState<BillWithRelations[]>([]);
  const [searchingUnpaid, setSearchingUnpaid] = useState(false);
  const [recordForm, setRecordForm] = useState({
    billId: '',
    amount: '',
    collectedBy: '',
    method: 'cash' as PaymentMethod,
    note: '',
  });

  const PAGE_SIZE = 50;

  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(normalizeBillingSearch(search) ?? ''), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  useEffect(() => { setPage(0); }, [billingMonth, tab, debouncedSearch]);

  const loadBilling = async () => {
    setLoading(true);
    setError(null);
    try {
      const month = normalizeBillingMonth(billingMonth);
      const [billPage, billingSummary, staffRows] = await Promise.all([
        getBillsPage({
          month,
          page,
          pageSize: PAGE_SIZE,
          status: normalizeBillStatusFilter(tab),
          search: debouncedSearch,
        }),
        getBillingSummary(month),
        getStaff(),
      ]);
      setBills(billPage.rows);
      setTotalBills(billPage.total);
      setSummary(billingSummary);
      setStaff(staffRows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load bills');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadBilling();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingMonth, page, tab, debouncedSearch, reloadToken]);

  useEffect(() => {
    let cancelled = false;
    const timeout = window.setTimeout(async () => {
      const normalized = normalizeBillingSearch(billSearch);
      if (!normalized) {
        setUnpaidBillOptions([]);
        setSearchingUnpaid(false);
        return;
      }

      setSearchingUnpaid(true);
      try {
        const options = await searchUnpaidBills(normalizeBillingMonth(billingMonth), normalized, 12);
        if (!cancelled) setUnpaidBillOptions(options);
      } catch (e: unknown) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Could not search unpaid bills');
      } finally {
        if (!cancelled) setSearchingUnpaid(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [billSearch, billingMonth, reloadToken]);

  const currentPageUnpaidBills = bills.filter(b => b.status !== 'paid' && remainingAmount(b) > 0);
  const billOptions = Array.from(
    new Map([...unpaidBillOptions, ...currentPageUnpaidBills].map(bill => [bill.id, bill])).values()
  );
  const selectedBill = billOptions.find(b => b.id === recordForm.billId) ?? null;

  const totalBilled = summary?.totalBilled ?? 0;
  const totalPaid = summary?.totalPaid ?? 0;
  const totalRemaining = summary?.totalRemaining ?? 0;
  const overdueTotal = summary?.overdueTotal ?? 0;

  const fmt = (n: number) => `Rs. ${n.toLocaleString()}`;

  const stats: { label: string; value: string; color: string; icon: IconName }[] = [
    { label: 'Total Billed', value: fmt(totalBilled), color: 'blue', icon: 'fileText' },
    { label: 'Collected', value: fmt(totalPaid), color: 'green', icon: 'checkCircle' },
    { label: 'Remaining', value: fmt(totalRemaining), color: 'amber', icon: 'clock' },
    { label: 'Overdue', value: fmt(overdueTotal), color: 'red', icon: 'alertTri' },
  ];

  const reloadAfterMutation = async (notice: string) => {
    setMessage(notice);
    setReloadToken(t => t + 1);
  };

  const handleGenerateBills = async () => {
    setGenerating(true);
    setError(null);
    setMessage(null);
    try {
      const result: GenerateBillsResult = await generateMonthlyBills(normalizeBillingMonth(billingMonth));
      await reloadAfterMutation(
        `${result.created} bills generated for ${result.month}. ${result.existing} already existed, ${result.zeroAmount} skipped with zero amount.`
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not generate bills');
    } finally {
      setGenerating(false);
    }
  };

  const handleMarkPaid = async (bill: BillWithRelations) => {
    setPayingBillId(bill.id);
    setError(null);
    setMessage(null);
    try {
      const result = await markBillPaid(bill, currentStaff?.id ?? null);
      await reloadAfterMutation(`Payment recorded. Receipt ${result.receiptNo}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not mark bill paid');
    } finally {
      setPayingBillId(null);
    }
  };

  const handleRecordPayment = async () => {
    if (!selectedBill) { setError('Select an unpaid bill first'); return; }
    const amount = Number(recordForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) { setError('Enter a valid payment amount'); return; }
    if (amount > remainingAmount(selectedBill)) { setError('Payment amount exceeds remaining balance'); return; }

    setPayingBillId(selectedBill.id);
    setError(null);
    setMessage(null);
    try {
      const result = await recordBillPayment({
        billId: selectedBill.id,
        amount,
        collectedBy: recordForm.collectedBy || currentStaff?.id || null,
        method: recordForm.method,
        note: recordForm.note || null,
      });
      setRecordForm({ billId: '', amount: '', collectedBy: '', method: 'cash', note: '' });
      await reloadAfterMutation(`Payment recorded. Receipt ${result.receiptNo}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not record payment');
    } finally {
      setPayingBillId(null);
    }
  };

  if (loading) return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 300 }}>
      <div className="muted">Loading bills...</div>
    </div>
  );

  if (error && bills.length === 0) return (
    <div className="page">
      <div className="card" style={{ padding: 24 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Data load failed</div>
        <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>{error}</div>
        <button className="btn btn-primary" onClick={loadBilling}>
          <Icon name="refresh" size={14} />Retry
        </button>
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Billing & Payments</h1>
          <p>{billingMonth} cycle · {summary?.totalBills ?? totalBills} bills · {fmt(totalBilled)} total invoiced</p>
        </div>
        <div className="row gap-sm">
          <input
            className="select"
            type="month"
            value={billingMonth}
            onChange={e => setBillingMonth(e.target.value)}
            style={{ width: 150 }}
          />
          <button className="btn btn-secondary"><Icon name="download" size={14} />Export</button>
          <button className="btn btn-primary" onClick={handleGenerateBills} disabled={generating}>
            <Icon name="fileText" size={14} />{generating ? 'Generating...' : 'Generate Bills'}
          </button>
        </div>
      </div>

      {(error || message) && (
        <div
          className="card"
          style={{
            padding: '10px 14px',
            marginBottom: 14,
            color: error ? '#dc2626' : 'var(--green)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          {error ?? message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {stats.map((s, i) => (
          <div key={i} className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <IconBadge name={s.icon} color={s.color} size={40} />
            <div style={{ flex: 1 }}>
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', marginTop: 2 }} className="num">{s.value}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
            <Tabs value={tab} onChange={value => setTab(value as BillingTab)} items={[
              { value: 'All', label: 'All Bills', count: summary?.totalBills ?? 0 },
              { value: 'Unpaid', label: 'Unpaid', count: summary?.unpaidBills ?? 0 },
              { value: 'Paid', label: 'Paid', count: summary?.paidBills ?? 0 },
              { value: 'Overdue', label: 'Overdue', count: summary?.overdueBills ?? 0 },
            ]} />
            <div className="search" style={{ minWidth: 260, height: 36, border: '1px solid var(--border)', borderRadius: 8, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--bg-elev)' }}>
              <Icon name="search" size={14} />
              <input
                placeholder="Search bills..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ border: 'none', outline: 'none', background: 'none', fontSize: 13, flex: 1 }}
              />
            </div>
          </div>

          {totalBills === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>No bills for {billingMonth}</div>
              <div style={{ fontSize: 12 }}>Click Generate Bills to create this month&apos;s invoices from active customers.</div>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Bill ID</th>
                    <th>Customer</th>
                    <th>Amount</th>
                    <th>Paid</th>
                    <th>Remaining</th>
                    <th>Status</th>
                    <th>Receipt</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.map(b => (
                    <tr key={b.id} className="clickable">
                      <td className="mono" style={{ fontSize: 12 }}>{b.id.slice(0, 8)}...</td>
                      <td>
                        <div className="cell-user">
                          <Avatar name={b.customer?.full_name ?? '?'} size={28} />
                          <div>
                            <div className="nm" style={{ fontSize: 13 }}>{b.customer?.full_name ?? 'Unknown customer'}</div>
                            <div className="sub mono">{b.customer?.customer_code ?? ''}</div>
                          </div>
                        </div>
                      </td>
                      <td className="num" style={{ fontWeight: 600 }}>{fmt(b.amount)}</td>
                      <td className="num" style={{ color: 'var(--green)' }}>{fmt(b.paid_amount ?? 0)}</td>
                      <td className="num" style={{ color: remainingAmount(b) > 0 ? 'var(--amber)' : 'var(--green)' }}>{fmt(remainingAmount(b))}</td>
                      <td><Badge color={statusColor(b.status)} dot>{b.status}</Badge></td>
                      <td className="mono" style={{ fontSize: 11 }}>{b.receipt_no ?? '-'}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="row gap-sm" style={{ justifyContent: 'flex-end' }}>
                          {b.status !== 'paid' && remainingAmount(b) > 0 && (
                            <button className="btn btn-secondary btn-sm" onClick={() => handleMarkPaid(b)} disabled={payingBillId === b.id}>
                              <Icon name="check" size={12} />{payingBillId === b.id ? 'Saving' : 'Mark paid'}
                            </button>
                          )}
                          <button className="icon-btn" style={{ width: 28, height: 28 }} title={b.payment_note ?? 'Bill details'}>
                            <Icon name="fileText" size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, fontSize: 13, color: 'var(--text-muted)' }}>
            <div>
              Showing <strong style={{ color: 'var(--text)' }}>{totalBills === 0 ? 0 : page * PAGE_SIZE + 1}-{Math.min((page + 1) * PAGE_SIZE, totalBills)}</strong> of {totalBills}
            </div>
            <div className="row gap-sm">
              <button className="btn btn-secondary btn-sm" disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)}>
                <Icon name="chevronLeft" size={12} />Prev
              </button>
              <span style={{ fontSize: 12, padding: '0 4px' }}>Page {page + 1} of {Math.ceil(totalBills / PAGE_SIZE) || 1}</span>
              <button className="btn btn-secondary btn-sm" disabled={page >= Math.ceil(totalBills / PAGE_SIZE) - 1 || loading} onClick={() => setPage(p => p + 1)}>
                Next<Icon name="chevronRight" size={12} />
              </button>
            </div>
          </div>

          <div className="card" style={{ marginTop: 20 }}>
            <div className="card-head">
              <div>
                <h3>Daily Collection Summary</h3>
                <div className="sub">Selected cycle · Rs. in thousands</div>
              </div>
              <div className="legend">
                <div className="item"><span className="sw" style={{ background: '#3B82F6' }} />Collected</div>
              </div>
            </div>
            <div className="card-pad" style={{ paddingTop: 8 }}>
              <BarChart data={summary?.dailyCollections ?? []} accent="#3B82F6" labelKey="d" />
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card">
            <div className="card-head">
              <div><h3>Generate Bills</h3><div className="sub">Bulk invoice active customers</div></div>
            </div>
            <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="field">
                <label>Billing Month</label>
                <input className="input" type="month" value={billingMonth} onChange={e => setBillingMonth(e.target.value)} />
              </div>
              <div style={{ padding: 12, borderRadius: 10, background: 'var(--bg-muted)', fontSize: 12, color: 'var(--text-muted)' }}>
                Active customers with a monthly due/package price will receive one bill for this month. Existing bills are skipped safely.
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleGenerateBills} disabled={generating}>
                <Icon name="fileText" size={14} />{generating ? 'Generating...' : 'Generate Bills'}
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-head">
              <div><h3>Record Cash Payment</h3><div className="sub">Manual collection receipt</div></div>
            </div>
            <div className="card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className="field">
                <label>Unpaid Bill</label>
                <input
                  className="input"
                  placeholder="Search customer code/name..."
                  value={billSearch}
                  onChange={e => setBillSearch(e.target.value)}
                  style={{ marginBottom: 8 }}
                />
                <select
                  className="select"
                  value={recordForm.billId}
                  onChange={e => {
                    const bill = billOptions.find(b => b.id === e.target.value);
                    setRecordForm(f => ({
                      ...f,
                      billId: e.target.value,
                      amount: bill ? String(remainingAmount(bill)) : '',
                    }));
                  }}
                >
                  <option value="">{searchingUnpaid ? 'Searching...' : 'Select bill...'}</option>
                  {billOptions.map(b => (
                    <option key={b.id} value={b.id}>
                      {b.customer?.customer_code ?? b.id.slice(0, 8)} · {b.customer?.full_name ?? 'Unknown'} · {fmt(remainingAmount(b))}
                    </option>
                  ))}
                </select>
                {normalizeBillingSearch(billSearch) && !searchingUnpaid && unpaidBillOptions.length === 0 && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
                    No unpaid bill found for this search in {billingMonth}.
                  </div>
                )}
              </div>
              <div className="field">
                <label>Amount (Rs.)</label>
                <input className="input" type="number" min={1} placeholder="0" value={recordForm.amount}
                  onChange={e => setRecordForm(f => ({ ...f, amount: e.target.value }))} />
              </div>
              <div className="field">
                <label>Collected By</label>
                <select className="select" value={recordForm.collectedBy}
                  onChange={e => setRecordForm(f => ({ ...f, collectedBy: e.target.value }))}>
                  <option value="">Current user / unassigned</option>
                  {staff.filter(s => s.is_active).map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Method</label>
                <select className="select" value={recordForm.method}
                  onChange={e => setRecordForm(f => ({ ...f, method: e.target.value as PaymentMethod }))}>
                  {PAYMENT_METHODS.map(method => <option key={method.value} value={method.value}>{method.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label>Notes (optional)</label>
                <input className="input" placeholder="e.g. partial payment, receipt #4428" value={recordForm.note}
                  onChange={e => setRecordForm(f => ({ ...f, note: e.target.value }))} />
              </div>
              {selectedBill && (
                <div className="muted" style={{ fontSize: 12 }}>
                  Remaining balance: <span className="num" style={{ color: 'var(--text)', fontWeight: 600 }}>{fmt(remainingAmount(selectedBill))}</span>
                </div>
              )}
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={handleRecordPayment} disabled={!recordForm.billId || payingBillId === recordForm.billId}>
                <Icon name="cash" size={14} />{payingBillId === recordForm.billId ? 'Recording...' : 'Record Payment'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
