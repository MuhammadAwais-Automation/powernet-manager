'use client'

import React, { useEffect, useRef } from 'react'
import Icon from '../Icon'
import { formatRs } from '@/lib/notifications/billing'
import { useNotifications, type AppNotification } from '@/lib/notifications/notifications-context'

const TOAST_DURATION_MS = 5000

function SingleToast({ notification, onDismiss, onOpenNotification }: {
  notification: AppNotification
  onDismiss: (id: string) => void
  onOpenNotification?: (item: AppNotification) => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(notification.id), TOAST_DURATION_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [notification.id, onDismiss])

  const handleOpen = () => {
    onDismiss(notification.id)
    onOpenNotification?.(notification)
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter' && event.key !== ' ') return
    event.preventDefault()
    handleOpen()
  }

  const handleDismiss = (event: React.MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation()
    onDismiss(notification.id)
  }

  if (notification.kind === 'customer_signup') {
    return (
      <div
        className="payment-toast payment-toast--partial"
        role="button"
        tabIndex={0}
        aria-live="polite"
        aria-label={`Open ${notification.title}`}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
        style={{ borderLeft: '3px solid var(--color-primary)' }}
      >
        <div className="payment-toast__icon">
          <Icon name="users" size={18} />
        </div>
        <div className="payment-toast__body">
          <div className="payment-toast__title">{notification.title}</div>
          <div className="payment-toast__message">{notification.message}</div>
          <div className="payment-toast__meta">House ID: {notification.houseId}</div>
        </div>
        <button
          className="payment-toast__close"
          aria-label="Dismiss notification"
          onClick={handleDismiss}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    )
  }

  // ── Complaint toast ─────────────────────────────────────────────────────────
  if (notification.kind === 'complaint') {
    const isResolved = notification.type === 'complaint_resolved'
    return (
      <div
        className={`payment-toast payment-toast--${isResolved ? 'full' : 'partial'}`}
        role="button"
        tabIndex={0}
        aria-live="polite"
        aria-label={`Open ${notification.title}`}
        onClick={handleOpen}
        onKeyDown={handleKeyDown}
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
          onClick={handleDismiss}
        >
          <Icon name="x" size={14} />
        </button>
      </div>
    )
  }

  // ── Billing toast (existing behavior) ──────────────────────────────────────
  const isFull = notification.type === 'payment_full'
  return (
    <div
      className={`payment-toast payment-toast--${isFull ? 'full' : 'partial'}`}
      role="button"
      tabIndex={0}
      aria-live="polite"
      aria-label={`Open ${notification.title}`}
      onClick={handleOpen}
      onKeyDown={handleKeyDown}
    >
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
        onClick={handleDismiss}
      >
        <Icon name="x" size={14} />
      </button>
    </div>
  )
}

export function PaymentToastContainer({ onOpenNotification }: {
  onOpenNotification?: (item: AppNotification) => void
}) {
  const { toasts, dismissToast } = useNotifications()

  if (toasts.length === 0) return null

  return (
    <div className="payment-toast-container" aria-label="Live notifications">
      {toasts.map(notification => (
        <SingleToast
          key={notification.id}
          notification={notification}
          onDismiss={dismissToast}
          onOpenNotification={onOpenNotification}
        />
      ))}
    </div>
  )
}
