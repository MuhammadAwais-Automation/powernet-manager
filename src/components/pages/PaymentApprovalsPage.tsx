'use client';
import React, { useEffect, useState, useCallback } from 'react';
import Icon from '../Icon';
import { Avatar, Badge, Drawer, Tabs } from '../ui';
import {
  getPaymentVerifications,
  approvePaymentVerification,
  rejectPaymentVerification,
  getPaymentVerificationCounts,
  type PaymentVerificationWithRelations,
} from '@/lib/db/bills';
import { useNotifications } from '@/lib/notifications/notifications-context';

const METHOD_META: Record<string, { label: string; color: string }> = {
  bank: { label: 'Bank Transfer', color: 'blue' },
  easypaisa: { label: 'Easypaisa', color: 'green' },
  jazzcash: { label: 'JazzCash', color: 'purple' },
  other: { label: 'Other Online', color: 'amber' },
};

function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: mono ? 'JetBrains Mono, monospace' : undefined }}>{value || '-'}</span>
    </div>
  );
}

function ApprovalDrawer({
  verification,
  onClose,
  onProcessed,
  staffId,
  staffRole,
}: {
  verification: PaymentVerificationWithRelations | null;
  onClose: () => void;
  onProcessed: () => void;
  staffId: string;
  staffRole: string;
}) {
  const [reviewNote, setReviewNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(false);

  useEffect(() => {
    if (!verification) return;
    setReviewNote(verification.review_note || '');
    setError(null);
    setZoom(false);
  }, [verification]);

  if (!verification) return null;

  const handleApprove = async () => {
    setBusy(true);
    setError(null);
    try {
      await approvePaymentVerification(verification.id, staffId, reviewNote);
      onProcessed();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    setBusy(true);
    setError(null);
    try {
      await rejectPaymentVerification(verification.id, staffId, reviewNote || 'Rejected after administrative review');
      onProcessed();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rejection failed');
    } finally {
      setBusy(false);
    }
  };

  const methodMeta = METHOD_META[verification.method] || { label: verification.method, color: 'muted' };
  const isReadOnly = verification.status !== 'pending' || staffRole !== 'admin';

  return (
    <>
      <div className="drawer-head">
        <div className="row gap-md">
          <Avatar name={verification.customer?.full_name ?? 'Unknown'} size={42} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{verification.customer?.full_name ?? 'Unknown'}</div>
            <div className="muted mono" style={{ fontSize: 11 }}>{verification.customer?.customer_code}</div>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>

      <div className="drawer-body">
        {staffRole !== 'admin' && verification.status === 'pending' && (
          <div style={{ 
            padding: '12px 14px', 
            borderRadius: 8, 
            background: 'var(--amber-bg, #fef3c7)', 
            color: 'var(--amber, #d97706)', 
            border: '1px solid rgba(217, 119, 6, 0.25)',
            marginBottom: 14, 
            fontSize: 13, 
            display: 'flex', 
            alignItems: 'flex-start', 
            gap: 10 
          }}>
            <Icon name="alertTri" size={16} style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700 }}>Admin Review Only</div>
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                Reviewing and verifying customer receipts is restricted strictly to Administrators.
              </div>
            </div>
          </div>
        )}
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}

        {/* Status Audit Banner */}
        {verification.status === 'approved' && (
          <div style={{ 
            padding: '12px 14px', 
            borderRadius: 8, 
            background: 'var(--green-bg, #f0fdf4)', 
            color: 'var(--green, #15803d)', 
            border: '1px solid rgba(21, 128, 61, 0.25)',
            marginBottom: 14, 
            fontSize: 13, 
            display: 'flex', 
            alignItems: 'flex-start', 
            gap: 10 
          }}>
            <Icon name="checkCircle" size={16} style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700 }}>Receipt Approved & Verified</div>
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                Reviewed by {verification.reviewer?.full_name ?? 'Administrator'} on {new Date(verification.reviewed_at!).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {verification.status === 'rejected' && (
          <div style={{ 
            padding: '12px 14px', 
            borderRadius: 8, 
            background: 'var(--red-bg, #fef2f2)', 
            color: 'var(--red, #b91c1c)', 
            border: '1px solid rgba(185, 28, 28, 0.25)',
            marginBottom: 14, 
            fontSize: 13, 
            display: 'flex', 
            alignItems: 'flex-start', 
            gap: 10 
          }}>
            <Icon name="ban" size={16} style={{ marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700 }}>Receipt Rejected</div>
              <div style={{ fontSize: 11, opacity: 0.85, marginTop: 2 }}>
                Reviewed by {verification.reviewer?.full_name ?? 'Administrator'} on {new Date(verification.reviewed_at!).toLocaleString()}
              </div>
            </div>
          </div>
        )}

        {/* Verification Context Card */}
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <div className="row gap-sm" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <strong style={{ fontSize: 14 }}>Payment Transaction Details</strong>
            <Badge color={methodMeta.color} dot>{methodMeta.label}</Badge>
          </div>
          <InfoRow label="Amount Paid" value={<strong style={{ color: 'var(--green)' }}>Rs. {verification.amount.toLocaleString()}</strong>} />
          <InfoRow label="Method" value={methodMeta.label} />
          <InfoRow label="Remarks / Ref ID" value={<span className="mono">{verification.customer_remarks || 'None'}</span>} />
          <InfoRow label="Submission Date" value={new Date(verification.created_at).toLocaleString()} />
        </div>

        {/* Bill Context Card */}
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <strong style={{ fontSize: 14 }}>Bill Context</strong>
          <div style={{ height: 8 }} />
          <InfoRow label="Bill Month" value={verification.bill?.month} mono />
          <InfoRow label="Total Billed" value={`Rs. ${verification.bill?.amount.toLocaleString()}`} />
          <InfoRow label="Already Paid" value={`Rs. ${verification.bill?.paid_amount.toLocaleString()}`} />
          <InfoRow label="Remaining Balance" value={`Rs. ${((verification.bill?.amount ?? 0) - (verification.bill?.paid_amount ?? 0)).toLocaleString()}`} />
        </div>

        {/* Cloudinary Receipt Card */}
        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <strong style={{ fontSize: 14 }}>Uploaded Receipt Screenshot</strong>
          <div style={{ height: 12 }} />
          <div 
            onClick={() => setZoom(!zoom)}
            style={{ 
              position: 'relative',
              borderRadius: 8, 
              overflow: 'hidden', 
              border: '1px solid var(--border)', 
              cursor: 'zoom-in',
              background: '#f8fafc',
              height: zoom ? 'auto' : 240,
              maxHeight: zoom ? 800 : 240,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.3s ease'
            }}
          >
            <img 
              src={verification.receipt_url} 
              alt="Receipt Screenshot" 
              style={{ 
                width: '100%', 
                height: zoom ? 'auto' : '100%', 
                objectFit: zoom ? 'contain' : 'cover' 
              }} 
            />
            {!zoom && (
              <div style={{
                position: 'absolute',
                bottom: 8,
                right: 8,
                background: 'rgba(15, 23, 42, 0.75)',
                color: '#fff',
                padding: '4px 8px',
                borderRadius: 4,
                fontSize: 10,
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}>
                <Icon name="search" size={10} /> Click to zoom
              </div>
            )}
          </div>
        </div>

        {/* Administrative Review Remarks */}
        <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <strong style={{ fontSize: 14 }}>{isReadOnly ? 'Reviewer Notes' : 'Review Notes'}</strong>
          <textarea
            className="select"
            rows={3}
            value={reviewNote}
            disabled={isReadOnly}
            onChange={e => setReviewNote(e.target.value)}
            placeholder={isReadOnly ? 'No review notes provided' : 'Enter a note or remarks for the customer...'}
            style={{ resize: 'none', background: isReadOnly ? 'var(--bg-muted, #f8fafc)' : undefined }}
          />
        </div>
      </div>

      <div className="drawer-foot">
        {isReadOnly ? (
          <button className="btn btn-secondary" onClick={onClose} style={{ marginLeft: 'auto' }}>
            Close
          </button>
        ) : (
          <>
            <button className="btn btn-secondary" onClick={handleReject} disabled={busy}>
              <Icon name="ban" size={14} /> Reject
            </button>
            <button className="btn btn-primary" onClick={handleApprove} disabled={busy}>
              <Icon name="check" size={14} /> {busy ? 'Processing...' : 'Verify & Approve'}
            </button>
          </>
        )}
      </div>
    </>
  );
}

export default function PaymentApprovalsPage({
  staffId,
  staffRole,
  onVerificationsCountChange,
}: {
  staffId: string;
  staffRole: string;
  onVerificationsCountChange?: (count: number) => void;
}) {
  const [verifications, setVerifications] = useState<PaymentVerificationWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<PaymentVerificationWithRelations | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [counts, setCounts] = useState<{ pending: number; approved: number; rejected: number }>({
    pending: 0,
    approved: 0,
    rejected: 0,
  });

  const { paymentVerificationsVersion } = useNotifications();

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    Promise.all([
      getPaymentVerifications(activeTab),
      getPaymentVerificationCounts(),
    ])
      .then(([data, cnts]) => {
        setVerifications(data);
        setCounts(cnts);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load payment approvals queue'))
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, [activeTab]);

  // Reload when tab changes
  useEffect(() => {
    load();
    setSelected(null);
  }, [load]);

  // Trigger silent reload when notification context version changes
  useEffect(() => {
    load(true);
  }, [paymentVerificationsVersion, load]);

  // Synchronize the global pending approvals count badge in the sidebar
  useEffect(() => {
    if (onVerificationsCountChange) {
      onVerificationsCountChange(counts.pending);
    }
  }, [counts.pending, onVerificationsCountChange]);

  const updateList = () => {
    load();
    setSelected(null);
  };

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Payment Approvals</h1>
          <p>
            {activeTab === 'pending' && `${verifications.length} customer-uploaded receipts awaiting review`}
            {activeTab === 'approved' && `${verifications.length} historically approved receipts`}
            {activeTab === 'rejected' && `${verifications.length} historically rejected receipts`}
          </p>
        </div>
        <button className="btn btn-secondary" onClick={() => load()} disabled={loading}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div style={{ padding: '10px 16px', background: '#fef2f2', color: '#dc2626', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Premium Tab Bar Selector */}
      <div style={{ marginBottom: 18 }}>
        <Tabs
          value={activeTab}
          onChange={(value) => setActiveTab(value as 'pending' | 'approved' | 'rejected')}
          items={[
            {
              value: 'pending',
              label: `Pending Reviews (${counts.pending})`,
            },
            {
              value: 'approved',
              label: `Approved History (${counts.approved})`,
            },
            {
              value: 'rejected',
              label: `Rejected History (${counts.rejected})`,
            },
          ]}
        />
      </div>

      <div className="table-wrap" style={{ opacity: loading ? 0.55 : 1 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Customer</th>
              <th>Bill Month</th>
              <th>Method</th>
              <th>Amount Submitted</th>
              <th>Remarks / Ref ID</th>
              <th>{activeTab === 'pending' ? 'Submitted At' : 'Reviewed At'}</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && verifications.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j}><div style={{ height: 16, background: 'var(--border)', borderRadius: 4, opacity: 0.5 }} /></td>
                  ))}
                </tr>
              ))
            ) : verifications.length === 0 ? (
              <tr>
                <td colSpan={7} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                  <Icon name="checkCircle" size={24} style={{ color: 'var(--green)', opacity: 0.5, marginBottom: 8, display: 'block', marginLeft: 'auto', marginRight: 'auto' }} />
                  {activeTab === 'pending' && 'No pending payment receipts to review. Great job!'}
                  {activeTab === 'approved' && 'No approved payments found.'}
                  {activeTab === 'rejected' && 'No rejected payments found.'}
                </td>
              </tr>
            ) : verifications.map((item) => {
              const methodMeta = METHOD_META[item.method] || { label: item.method, color: 'muted' };
              return (
                <tr key={item.id} className="clickable" onClick={() => setSelected(item)}>
                  <td>
                    <div className="cell-user">
                      <Avatar name={item.customer?.full_name ?? 'Unknown'} size={32} />
                      <div>
                        <div className="nm">{item.customer?.full_name ?? 'Unknown'}</div>
                        <div className="sub mono">{item.customer?.customer_code}</div>
                      </div>
                    </div>
                  </td>
                  <td className="mono">{item.bill?.month}</td>
                  <td><Badge color={methodMeta.color} dot>{methodMeta.label}</Badge></td>
                  <td style={{ fontWeight: 600 }}>Rs. {item.amount.toLocaleString()}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{item.customer_remarks || '—'}</td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {activeTab === 'pending' 
                      ? new Date(item.created_at).toLocaleString() 
                      : item.reviewed_at ? new Date(item.reviewed_at).toLocaleString() : '—'
                    }
                  </td>
                  <td style={{ textAlign: 'right' }} onClick={(e) => e.stopPropagation()}>
                    <button 
                      className="icon-btn" 
                      onClick={() => setSelected(item)} 
                      title={activeTab === 'pending' ? 'Review request' : 'View audit details'}
                    >
                      <Icon name={activeTab === 'pending' ? 'eye' : 'fileText'} size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Drawer open={!!selected} onClose={() => setSelected(null)} width={520}>
        <ApprovalDrawer 
          verification={selected} 
          onClose={() => setSelected(null)} 
          onProcessed={updateList} 
          staffId={staffId} 
          staffRole={staffRole}
        />
      </Drawer>
    </div>
  );
}
