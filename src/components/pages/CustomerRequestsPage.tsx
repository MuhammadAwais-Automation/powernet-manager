'use client'
import React, { useEffect, useMemo, useState } from 'react'
import Icon from '../Icon'
import { Avatar, Badge, Drawer, Tabs } from '../ui'
import {
  approveCustomerSignupRequest,
  getCustomerSignupRequests,
  rejectCustomerSignupRequest,
} from '@/lib/db/customer-signup-requests'
import type { CustomerSignupRequestWithRelations, CustomerSignupStatus } from '@/types/database'

const STATUS_META: Record<CustomerSignupStatus, { label: string; color: string }> = {
  pending: { label: 'Pending', color: 'amber' },
  approved: { label: 'Approved', color: 'green' },
  rejected: { label: 'Rejected', color: 'red' },
}

function makeTemporaryPassword(request: CustomerSignupRequestWithRelations): string {
  const suffix = request.house_id.replace(/[^a-zA-Z0-9]/g, '').slice(-4) || '2026'
  return `Pn-${suffix}-${Math.random().toString(36).slice(2, 8)}`
}

function InfoRow({ label, value, mono = false }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
      <span className="muted" style={{ fontSize: 12 }}>{label}</span>
      <span style={{ fontSize: 13, fontFamily: mono ? 'JetBrains Mono, monospace' : undefined }}>{value || '-'}</span>
    </div>
  )
}

function RequestDrawer({ request, onClose, onChanged }: {
  request: CustomerSignupRequestWithRelations | null
  onClose: () => void
  onChanged: (request: CustomerSignupRequestWithRelations) => void
}) {
  const [reviewNote, setReviewNote] = useState('')
  const [temporaryPassword, setTemporaryPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [approvedPassword, setApprovedPassword] = useState<string | null>(null)

  useEffect(() => {
    if (!request) return
    setReviewNote(request.review_note ?? '')
    setTemporaryPassword(makeTemporaryPassword(request))
    setApprovedPassword(null)
    setError(null)
  }, [request])

  if (!request) return null

  const status = STATUS_META[request.status]

  const approve = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await approveCustomerSignupRequest({
        requestId: request.id,
        temporaryPassword,
        reviewNote,
      })
      setApprovedPassword(result.temporaryPassword)
      onChanged(result.request)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed')
    } finally {
      setBusy(false)
    }
  }

  const reject = async () => {
    setBusy(true)
    setError(null)
    try {
      const result = await rejectCustomerSignupRequest({
        requestId: request.id,
        reviewNote: reviewNote || 'Rejected after verification',
      })
      onChanged(result.request)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rejection failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="drawer-head">
        <div className="row gap-md">
          <Avatar name={request.full_name} size={42} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{request.full_name}</div>
            <div className="muted mono" style={{ fontSize: 11 }}>{request.house_id} - {request.area?.name ?? 'No area'}</div>
          </div>
        </div>
        <button className="icon-btn" onClick={onClose}><Icon name="close" size={16} /></button>
      </div>
      <div className="drawer-body">
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 8, background: '#fef2f2', color: '#dc2626', marginBottom: 12, fontSize: 13 }}>
            {error}
          </div>
        )}
        {approvedPassword && (
          <div style={{ padding: 14, borderRadius: 8, background: 'var(--green-bg, #f0fdf4)', color: 'var(--green, #16a34a)', marginBottom: 12, fontSize: 13 }}>
            Temporary password: <strong className="mono">{approvedPassword}</strong>
          </div>
        )}

        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <div className="row gap-sm" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
            <strong style={{ fontSize: 14 }}>Application</strong>
            <Badge color={status.color} dot>{status.label}</Badge>
          </div>
          <InfoRow label="Father name" value={request.father_name} />
          <InfoRow label="CNIC" value={request.cnic} mono />
          <InfoRow label="Phone" value={request.phone} mono />
          <InfoRow label="WhatsApp" value={request.whatsapp} mono />
          <InfoRow label="Email" value={request.email} />
          <InfoRow label="Gender" value={request.gender} />
          <InfoRow label="Profession" value={request.profession} />
          <InfoRow label="Rank/Position" value={request.rank_or_position} />
          <InfoRow label="Unit" value={request.unit} />
        </div>

        <div className="card card-pad" style={{ marginBottom: 14 }}>
          <strong style={{ fontSize: 14 }}>Connection</strong>
          <div style={{ height: 8 }} />
          <InfoRow label="House ID" value={request.house_id} mono />
          <InfoRow label="Area" value={request.area ? `${request.area.name} (${request.area.code})` : '-'} />
          <InfoRow label="Package" value={request.package?.name} />
          <InfoRow label="Street address" value={request.street_address} />
          <InfoRow label="Submitted" value={new Date(request.created_at).toLocaleString()} />
          {request.approved_customer && (
            <InfoRow label="Customer" value={`${request.approved_customer.customer_code} - ${request.approved_customer.full_name}`} />
          )}
        </div>

        {request.status === 'pending' && (
          <div className="card card-pad" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <strong style={{ fontSize: 14 }}>Review</strong>
            <input
              className="select"
              value={temporaryPassword}
              onChange={e => setTemporaryPassword(e.target.value)}
              placeholder="Temporary password"
            />
            <textarea
              className="select"
              rows={3}
              value={reviewNote}
              onChange={e => setReviewNote(e.target.value)}
              placeholder="Review note"
              style={{ resize: 'none' }}
            />
          </div>
        )}
      </div>
      {request.status === 'pending' && (
        <div className="drawer-foot">
          <button className="btn btn-secondary" onClick={reject} disabled={busy}>
            <Icon name="ban" size={14} />Reject
          </button>
          <button className="btn btn-primary" onClick={approve} disabled={busy || temporaryPassword.length < 8}>
            <Icon name="check" size={14} />{busy ? 'Saving...' : 'Approve'}
          </button>
        </div>
      )}
    </>
  )
}

export default function CustomerRequestsPage({ refreshToken = 0, focusRequestId = null, focusToken = 0 }: {
  refreshToken?: number
  focusRequestId?: string | null
  focusToken?: number
}) {
  const [requests, setRequests] = useState<CustomerSignupRequestWithRelations[]>([])
  const [status, setStatus] = useState<CustomerSignupStatus | 'all'>('pending')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<CustomerSignupRequestWithRelations | null>(null)

  const load = () => {
    setLoading(true)
    setError(null)
    getCustomerSignupRequests(status === 'all' ? undefined : status)
      .then(setRequests)
      .catch(e => setError(e instanceof Error ? e.message : 'Could not load customer requests'))
      .finally(() => setLoading(false))
  }

  useEffect(load, [status, refreshToken])

  useEffect(() => {
    if (!focusRequestId || focusToken === 0) return
    const found = requests.find(item => item.id === focusRequestId)
    if (found) setSelected(found)
  }, [focusRequestId, focusToken, requests])

  const counts = useMemo(() => ({
    all: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }), [requests])

  const updateRequest = (updated: CustomerSignupRequestWithRelations) => {
    setRequests(current => current.map(item => item.id === updated.id ? updated : item))
    setSelected(updated)
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Customer Requests</h1>
          <p>{counts.pending} pending signup applications awaiting verification</p>
        </div>
        <button className="btn btn-secondary" onClick={load} disabled={loading}><Icon name="refresh" size={14} />Refresh</button>
      </div>

      <div className="filter-bar">
        <Tabs
          value={status}
          onChange={v => setStatus(v as CustomerSignupStatus | 'all')}
          items={[
            { value: 'pending', label: 'Pending', count: counts.pending },
            { value: 'approved', label: 'Approved', count: counts.approved },
            { value: 'rejected', label: 'Rejected', count: counts.rejected },
            { value: 'all', label: 'All', count: counts.all },
          ]}
        />
      </div>

      {error && (
        <div style={{ padding: '10px 16px', background: '#fef2f2', color: '#dc2626', borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
          {error}
        </div>
      )}

      <div className="table-wrap" style={{ opacity: loading ? 0.55 : 1 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Applicant</th>
              <th>House ID</th>
              <th>Area</th>
              <th>Package</th>
              <th>Phone</th>
              <th>Status</th>
              <th>Submitted</th>
              <th style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && requests.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 8 }).map((__, j) => (
                    <td key={j}><div style={{ height: 16, background: 'var(--border)', borderRadius: 4, opacity: 0.5 }} /></td>
                  ))}
                </tr>
              ))
            ) : requests.length === 0 ? (
              <tr><td colSpan={8} style={{ textAlign: 'center', padding: 32, color: 'var(--text-muted)' }}>No customer requests found</td></tr>
            ) : requests.map(request => {
              const meta = STATUS_META[request.status]
              return (
                <tr key={request.id} className="clickable" onClick={() => setSelected(request)}>
                  <td>
                    <div className="cell-user">
                      <Avatar name={request.full_name} size={32} />
                      <div>
                        <div className="nm">{request.full_name}</div>
                        <div className="sub mono">{request.cnic}</div>
                      </div>
                    </div>
                  </td>
                  <td className="mono">{request.house_id}</td>
                  <td>{request.area?.name ?? '-'}</td>
                  <td>{request.package?.name ?? '-'}</td>
                  <td className="mono">{request.phone}</td>
                  <td><Badge color={meta.color} dot>{meta.label}</Badge></td>
                  <td className="muted" style={{ fontSize: 12 }}>{new Date(request.created_at).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                    <button className="icon-btn" onClick={() => setSelected(request)}><Icon name="eye" size={14} /></button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <Drawer open={!!selected} onClose={() => setSelected(null)} width={520}>
        <RequestDrawer request={selected} onClose={() => setSelected(null)} onChanged={updateRequest} />
      </Drawer>
    </div>
  )
}
