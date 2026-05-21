'use client'

import React, { useEffect, useRef } from 'react'
import Icon from '../Icon'
import { formatRs } from '@/lib/notifications/billing'
import { useNotifications } from '@/lib/notifications/notifications-context'
import type { BillingNotification } from '@/lib/notifications/billing'

const TOAST_DURATION_MS = 5000

function SingleToast({ notification, onDismiss }: {
  notification: BillingNotification
  onDismiss: (id: string) => void
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(notification.id), TOAST_DURATION_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [notification.id, onDismiss])

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
    <div className="payment-toast-container" aria-label="Payment notifications">
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
