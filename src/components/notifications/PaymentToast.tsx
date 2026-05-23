'use client'

import React, { useEffect, useRef } from 'react'
import Icon from '../Icon'
import { formatRs } from '@/lib/notifications/billing'
import { useNotifications, type AppNotification } from '@/lib/notifications/notifications-context'

const TOAST_DURATION_MS = 5000

function SingleToast({ notification, onDismiss }: {
  notification: AppNotification
  onDismiss: (id: string) => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(notification.id), TOAST_DURATION_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [notification.id, onDismiss])

  // ── Complaint toast ─────────────────────────────────────────────────────────
  if (notification.kind === 'complaint') {
    const isResolved = notification.type === 'complaint_resolved'
    return (
      <div
        className={`payment-toast payment-toast--${isResolved ? 'full' : 'partial'}`}
        role="alert"
        aria-live="polite"
        style={{ borderLeft: `3px solid ${isResolved ? 'var(--green)' : 'var(--amber)'}` }}
      >
        <div className="payment-toast__icon">
          <Icon name={isResolved ? 'check' : 'wrench'} size={18} />
        </div>
        <div className="payment-toast__body">
          <div className="payment-toast__title">{notification.title}</div>
          <div className="payment-toast__message">{notification.message}</div>
          {notification.technicianName && (
            <div className="payment-toast__meta">
              Technician: {notification.technicianName} · {notification.complaintCode}
            </div>
          )}
        </div>
        <button
          className="payment-toast__close"
          aria-label="Dismiss notification"
          onClick={() => onDismiss(notification.id)}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    )
  }

  // ── Billing toast (existing behavior) ──────────────────────────────────────
  const isFull = notification.type === 'payment_full'
  return (
    <div className={`payment-toast payment-toast--${isFull ? 'full' : 'partial'}`} role="alert" aria-live="polite">
      <div className="payment-toast__icon">
        <Icon name={isFull ? 'checkCircle' : 'clock'} size={18} />
      </div>
      <div className="payment-toast__body">
        <div className="payment-toast__title">{notification.title}</div>
        <div className="payment-toast__message">{notification.message}</div>
        {notification.collectorName && (
          <div className="payment-toast__meta">
            Collected by {notification.collectorName} &middot; {formatRs(notification.amountPaid)}
          </div>
        )}
      </div>
      <button
        className="payment-toast__close"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(notification.id)}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}

export function PaymentToastContainer() {
  const { toasts, dismissToast } = useNotifications()

  if (toasts.length === 0) return null

  return (
    <div className="payment-toast-container" aria-label="Live notifications">
      {toasts.map(notification => (
        <SingleToast
          key={notification.id}
          notification={notification}
          onDismiss={dismissToast}
        />
      ))}
    </div>
  )
}
