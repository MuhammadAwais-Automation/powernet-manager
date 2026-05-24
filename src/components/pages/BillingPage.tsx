'use client';
import React, { useEffect, useState, useRef, useCallback } from 'react';
import Icon, { type IconName } from '../Icon';
import { Badge, Avatar, IconBadge, Tabs, Modal } from '../ui';
import { BarChart } from '../charts';
import {
  getBillsPage,
  getBillingSummary,
  generateMonthlyBills,
  getBillByIdWithRelations,
  type BillingSummary,
  type GenerateBillsResult,
} from '@/lib/db/bills';
import { getAreas } from '@/lib/db/areas';
import { getCurrentBillingMonth, normalizeBillingMonth } from '@/lib/billing/core';
import { normalizeBillingSearch, normalizeBillStatusFilter, type BillingTab } from '@/lib/billing/query';
import type { Area, BillWithRelations } from '@/types/database';

function remainingAmount(bill: Pick<BillWithRelations, 'amount' | 'paid_amount'>): number {
  return Math.max(bill.amount - (bill.paid_amount ?? 0), 0);
}

function statusColor(status: string): 'green' | 'red' | 'amber' {
  if (status === 'paid') return 'green';
  if (status === 'overdue') return 'red';
  return 'amber';
}

export default function BillingPage({ refreshToken = 0, focusBillId = null, focusToken = 0 }: {
  refreshToken?: number;
  focusBillId?: string | null;
  focusToken?: number;
}) {
  const [bills, setBills] = useState<BillWithRelations[]>([]);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [totalBills, setTotalBills] = useState(0);
  const [areas, setAreas] = useState<Area[]>([]);
  const [areaFilter, setAreaFilter] = useState('');
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

  const PAGE_SIZE = 50;

  // ── Debounce search ──────────────────────────────────────────────────────────
  useEffect(() => {
    const timeout = window.setTimeout(() => setDebouncedSearch(normalizeBillingSearch(search) ?? ''), 250);
    return () => window.clearTimeout(timeout);
  }, [search]);

  // ── loadKey: single source of truth for triggering a data fetch ──────────────
  // Instead of having TWO effects that both react to areaFilter (one resets page,
  // one calls loadBilling), we use a single "loadKey" counter.  Any filter/page
  // change bumps loadKey and the single load-effect reacts only to loadKey.
  // This eliminates the double-fetch race condition entirely.
  const [loadKey, setLoadKey] = useState(0);

  // Always-fresh ref so the load callback never captures stale state
  const latestRef = useRef({ billingMonth, page, tab, debouncedSearch, areaFilter });
  latestRef.current = { billingMonth, page, tab, debouncedSearch, areaFilter };

  // ── Reset page + bump loadKey when any filter changes ───────────────────────
  // We keep page reset here; if page was already 0, setPage(0) is a no-op, but
  // loadKey still bumps so the load fires exactly once.
  useEffect(() => {
    setPage(0);
    setLoadKey(k => k + 1);
  }, [billingMonth, tab, debouncedSearch, areaFilter]);

  // ── Bump loadKey when page changes (pagination clicks) ───────────────────────
  // Note: page change triggered by the filter-reset above will have already been
  // handled by the effect above (loadKey was bumped there). We only want to fire
  // an additional load when the user explicitly paginates.
  const prevPageRef = useRef(page);
  useEffect(() => {
    if (prevPageRef.current !== page) {
      prevPageRef.current = page;
      setLoadKey(k => k + 1);
    }
  }, [page]);

  const loadBilling = useCallback(async () => {
    // Capture current values from ref so we never read stale closure state
    const { billingMonth: month0, page: page0, tab: tab0, debouncedSearch: search0, areaFilter: area0 } = latestRef.current;
    setLoading(true);
    setBills([]);        // Clear previous results immediately — prevents stale skeleton
    setTotalBills(0);
    setError(null);
    try {
      const month = normalizeBillingMonth(month0);
      const [billPage, billingSummary, areaRows] = await Promise.all([
        getBillsPage({
          month,
          page: page0,
          pageSize: PAGE_SIZE,
          status: normalizeBillStatusFilter(tab0),
          search: search0,
          areaId: area0 || undefined,
        }),
        getBillingSummary(month),
        getAreas(),
      ]);
      setBills(billPage.rows);
      setTotalBills(billPage.total);
      setSummary(billingSummary);
      setAreas(areaRows);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load bills');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Single load effect — fires only when loadKey, reloadToken, or refreshToken changes
  useEffect(() => {
    loadBilling();
  }, [loadKey, reloadToken, refreshToken, loadBilling]);

  const totalBilled = summary?.totalBilled ?? 0;
  const totalPaid = summary?.totalPaid ?? 0;
  const totalRemaining = summary?.totalRemaining ?? 0;
  const overdueTotal = summary?.overdueTotal ?? 0;

  const fmt = (n: number) => `Rs. ${n.toLocaleString()}`;

  const kpiCards: { label: string; amount: string; count: string; color: string; icon: IconName }[] = [
    { label: 'Total Billed',  amount: fmt(totalBilled),    count: String(summary?.totalBills ?? 0),   color: 'blue',  icon: 'fileText' },
    { label: 'Collected',     amount: fmt(totalPaid),       count: String(summary?.paidBills ?? 0),    color: 'green', icon: 'checkCircle' },
    { label: 'Remaining',     amount: fmt(totalRemaining),  count: String(summary?.unpaidBills ?? 0),  color: 'amber', icon: 'clock' },
    { label: 'Overdue',       amount: fmt(overdueTotal),    count: String(summary?.overdueBills ?? 0), color: 'red',   icon: 'alertTri' },
  ];

  const [exporting, setExporting] = useState(false);
  const [detailBill, setDetailBill] = useState<BillWithRelations | null>(null);
  const msgTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!focusBillId || focusToken === 0) return;

    let cancelled = false;
    getBillByIdWithRelations(focusBillId)
      .then(bill => {
        if (cancelled || !bill) return;
        setDetailBill(bill);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Could not open bill from notification');
      });

    return () => {
      cancelled = true;
    };
  }, [focusBillId, focusToken]);

  const handleExport = async () => {
    setExporting(true);
    setError(null);
    try {
      const month = normalizeBillingMonth(billingMonth);
      const status = normalizeBillStatusFilter(tab);
      const search = debouncedSearch;
      const PAGE_SIZE_EXPORT = 500;
      const MAX_ROWS = 2000;

      let allRows: BillWithRelations[] = [];
      let exportPage = 0;
      while (allRows.length < MAX_ROWS) {
        const result = await getBillsPage({ month, page: exportPage, pageSize: PAGE_SIZE_EXPORT, status, search });
        allRows = allRows.concat(result.rows);
        if (allRows.length >= result.total || result.rows.length < PAGE_SIZE_EXPORT) break;
        exportPage++;
      }

      const escape = (v: string | number | null | undefined) => {
        const s = String(v ?? '');
        return `"${s.replace(/"/g, '""')}"`;
      };

      const headers = ['Bill ID', 'Customer Code', 'Customer Name', 'Month', 'Amount', 'Paid', 'Remaining', 'Status', 'Receipt No', 'Payment Method', 'Created At'];
      const rows = allRows.map(b => [
        escape(b.id),
        escape(b.customer?.customer_code),
        escape(b.customer?.full_name),
        escape(b.month),
        escape(b.amount),
        escape(b.paid_amount ?? 0),
        escape(Math.max(b.amount - (b.paid_amount ?? 0), 0)),
        escape(b.status),
        escape(b.receipt_no),
        escape(b.payment_method),
        escape(b.created_at),
      ].join(','));

      const csv = [headers.join(','), ...rows].join('\n');
      const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bills-${billingMonth}-${tab.toLowerCase()}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const reloadAfterMutation = (notice: string) => {
    if (msgTimerRef.current) clearTimeout(msgTimerRef.current);
    setMessage(notice);
    setReloadToken(t => t + 1);
    msgTimerRef.current = setTimeout(() => setMessage(null), 4000);
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

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Billing</h1>
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
          <button className="btn btn-secondary" onClick={handleExport} disabled={exporting}>
            <Icon name="download" size={14} />{exporting ? 'Exporting...' : 'Export'}
          </button>
          <button className="btn btn-primary" onClick={handleGenerateBills} disabled={generating}>
            <Icon name="fileText" size={14} />{generating ? 'Generating...' : 'Generate Bills'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '10px 16px', background: 'var(--red-bg, #fef2f2)', color: 'var(--red, #dc2626)', borderRadius: 8, marginBottom: 12, fontSize: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
          {error}
          <button className="btn btn-sm btn-secondary" style={{ marginLeft: 'auto' }} onClick={loadBilling}>Retry</button>
        </div>
      )}
      {message && (
        <div style={{ padding: '10px 16px', background: 'var(--green-bg, #f0fdf4)', color: 'var(--green)', borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 600 }}>
          {message}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20, opacity: loading ? 0.6 : 1, transition: 'opacity 0.15s' }}>
        {kpiCards.map((s, i) => (
          <div key={i} className="card card-pad" style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <IconBadge name={s.icon} color={s.color} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{s.label}</div>
              <div style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', marginTop: 2 }} className="num">{s.amount}</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{s.count} bills</div>
            </div>
          </div>
        ))}
      </div>

      <div className="billing-workspace">
        <div className="billing-table-section">
          <div className="billing-filter-row">
            <Tabs value={tab} onChange={value => setTab(value as BillingTab)} items={[
              { value: 'All', label: 'All Bills', count: summary?.totalBills ?? 0 },
              { value: 'Unpaid', label: 'Unpaid', count: summary?.pendingBills ?? 0 },
              { value: 'Partial', label: 'Partial', count: summary?.partialBills ?? 0 },
              { value: 'Paid', label: 'Paid', count: summary?.paidBills ?? 0 },
              { value: 'Overdue', label: 'Overdue', count: summary?.overdueBills ?? 0 },
              { value: 'Visited', label: 'Visited', count: summary?.visitedBills ?? 0 },
            ]} />
            <div className="billing-filter-controls">
              <select
                className="select"
                value={areaFilter}
                onChange={e => setAreaFilter(e.target.value)}
                style={{ height: 36, fontSize: 13, minWidth: 150 }}
              >
                <option value="">All Areas</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              <div className="billing-search">
                <Icon name="search" size={14} />
                <input
                  placeholder="Search bills..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
            </div>
          </div>

          {loading && bills.length === 0 ? (
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
                  {Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j}><div style={{ height: 16, background: 'var(--bg-muted)', borderRadius: 4, width: j === 1 ? 140 : j === 7 ? 80 : 70, opacity: 0.6 }} /></td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : totalBills === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: 14, marginBottom: 8 }}>No bills for {billingMonth}</div>
              <div style={{ fontSize: 12 }}>Click Generate Bills to create this month&apos;s invoices from active customers.</div>
            </div>
          ) : (
            <div className="table-wrap" style={{ opacity: loading ? 0.5 : 1, transition: 'opacity 0.15s' }}>
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
                          <button className="icon-btn" style={{ width: 28, height: 28 }} title="Bill details" onClick={() => setDetailBill(b)}>
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
              {!loading && (summary?.dailyCollections ?? []).length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                  No collections recorded for {billingMonth}
                </div>
              ) : (
                <BarChart data={summary?.dailyCollections ?? []} accent="#3B82F6" labelKey="d" />
              )}
            </div>
          </div>
        </div>

      </div>
      {detailBill && (
        <Modal open={!!detailBill} onClose={() => setDetailBill(null)} width={480}>
          <div style={{ padding: '24px 28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 16 }}>Bill Details</div>
                <div className="muted" style={{ fontSize: 12 }}>#{detailBill.id.slice(0, 8).toUpperCase()}</div>
              </div>
              <Badge color={statusColor(detailBill.status)} dot>{detailBill.status}</Badge>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="card card-pad" style={{ padding: '10px 14px' }}>
                  <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Customer</div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4 }}>{detailBill.customer?.full_name ?? '—'}</div>
                  <div className="muted mono" style={{ fontSize: 11 }}>{detailBill.customer?.customer_code ?? ''}</div>
                  {detailBill.customer?.address_value && (
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{detailBill.customer.address_value}</div>
                  )}
                </div>
                <div className="card card-pad" style={{ padding: '10px 14px' }}>
                  <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Billing Month</div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4 }}>{detailBill.month}</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <div className="card card-pad" style={{ padding: '10px 14px' }}>
                  <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Amount</div>
                  <div className="num" style={{ fontWeight: 700, fontSize: 15, marginTop: 4 }}>{fmt(detailBill.amount)}</div>
                </div>
                <div className="card card-pad" style={{ padding: '10px 14px' }}>
                  <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Paid</div>
                  <div className="num" style={{ fontWeight: 700, fontSize: 15, marginTop: 4, color: 'var(--green)' }}>{fmt(detailBill.paid_amount ?? 0)}</div>
                </div>
                <div className="card card-pad" style={{ padding: '10px 14px' }}>
                  <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Remaining</div>
                  <div className="num" style={{ fontWeight: 700, fontSize: 15, marginTop: 4, color: remainingAmount(detailBill) > 0 ? 'var(--amber)' : 'var(--green)' }}>{fmt(remainingAmount(detailBill))}</div>
                </div>
              </div>
              {detailBill.receipt_no && (
                <div className="card card-pad" style={{ padding: '10px 14px' }}>
                  <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Receipt No</div>
                  <div className="mono" style={{ fontWeight: 600, fontSize: 13, marginTop: 4 }}>{detailBill.receipt_no}</div>
                </div>
              )}
              {detailBill.paid_at && (
                <div className="card card-pad" style={{ padding: '10px 14px' }}>
                  <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Paid At</div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4 }}>{new Date(detailBill.paid_at).toLocaleString()}</div>
                </div>
              )}
              {(detailBill.payment_method || detailBill.collector) && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  {detailBill.payment_method && (
                    <div className="card card-pad" style={{ padding: '10px 14px' }}>
                      <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
                        {detailBill.payment_method === 'visit' ? 'Visit Type' : 'Method'}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4 }}>
                        {detailBill.payment_method === 'visit' ? (
                          <Badge color="amber" dot>{detailBill.payment_note ?? 'Visit'}</Badge>
                        ) : (
                          <span style={{ textTransform: 'capitalize' }}>{detailBill.payment_method}</span>
                        )}
                      </div>
                    </div>
                  )}
                  {detailBill.collector && (
                    <div className="card card-pad" style={{ padding: '10px 14px' }}>
                      <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>
                        {detailBill.payment_method === 'visit' ? 'Visited By' : 'Collected By'}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 13, marginTop: 4 }}>{detailBill.collector.full_name}</div>
                    </div>
                  )}
                </div>
              )}
              {detailBill.payment_note && detailBill.payment_method !== 'visit' && (
                <div className="card card-pad" style={{ padding: '10px 14px' }}>
                  <div className="muted" style={{ fontSize: 11, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.05em' }}>Notes</div>
                  <div style={{ fontSize: 13, marginTop: 4 }}>{detailBill.payment_note}</div>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => setDetailBill(null)}>Close</button>
              <button className="btn btn-primary" onClick={() => {
                const b = detailBill;
                const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${b.receipt_no ?? b.id.slice(0,8)}</title><style>body{font-family:sans-serif;padding:32px;max-width:400px;margin:auto}h2{margin-bottom:4px}p{margin:4px 0;font-size:14px}.row{display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #eee}.label{color:#888;font-size:12px}</style></head><body><h2>Payment Receipt</h2><p class="label">#${(b.receipt_no ?? b.id.slice(0,8)).toUpperCase()}</p><div class="row"><span class="label">Customer</span><span>${b.customer?.full_name ?? '—'} (${b.customer?.customer_code ?? ''})</span></div><div class="row"><span class="label">Month</span><span>${b.month}</span></div><div class="row"><span class="label">Amount</span><span>Rs. ${b.amount.toLocaleString()}</span></div><div class="row"><span class="label">Paid</span><span>Rs. ${(b.paid_amount ?? 0).toLocaleString()}</span></div><div class="row"><span class="label">Status</span><span>${b.status}</span></div>${b.payment_method ? `<div class="row"><span class="label">Method</span><span>${b.payment_method}</span></div>` : ''}${b.collector ? `<div class="row"><span class="label">Collected By</span><span>${b.collector.full_name}</span></div>` : ''}<script>window.onload=()=>window.print()</script></body></html>`;
                const w = window.open('', '_blank');
                if (w) { w.document.write(html); w.document.close(); }
              }}>
                <Icon name="download" size={14} />Print Receipt
              </button>
            </div>
          </div>
        </Modal>
      )}

    </div>
  );
}
