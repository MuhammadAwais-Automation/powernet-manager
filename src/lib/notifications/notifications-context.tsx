'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { clearBillsCache, getBillByIdWithRelations } from '@/lib/db/bills'
import { clearDashboardCache } from '@/lib/db/dashboard'
import {
  buildBillingNotification,
  didBillRefreshChange,
  didPaymentChange,
  type BillingNotification,
  type BillingRealtimeBillRow,
} from './billing'

const MAX_TOASTS = 3

type NotificationsContextValue = {
  items: BillingNotification[]
  toasts: BillingNotification[]
  unreadCount: number
  billingVersion: number
  isInboxOpen: boolean
  openInbox: () => void
  closeInbox: () => void
  markAllRead: () => void
  markRead: (id: string) => void
  clearAll: () => void
  dismissToast: (id: string) => void
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null)

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<BillingNotification[]>([])
  const [toasts, setToasts] = useState<BillingNotification[]>([])
  const [billingVersion, setBillingVersion] = useState(0)
  const [isInboxOpen, setInboxOpen] = useState(false)
  const seenKeysRef = useRef<Set<string>>(new Set())

  const dismissToast = useCallback((id: string) => {
    setToasts(current => current.filter(t => t.id !== id))
  }, [])

  const addBillingNotification = useCallback((notification: BillingNotification) => {
    if (seenKeysRef.current.has(notification.dedupeKey)) return
    seenKeysRef.current.add(notification.dedupeKey)
    setItems(current => [notification, ...current].slice(0, 50))
    setToasts(current => [notification, ...current].slice(0, MAX_TOASTS))
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('dashboard-billing-payments')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bills' }, async payload => {
        const oldRow = payload.old as BillingRealtimeBillRow | null
        const newRow = payload.new as BillingRealtimeBillRow | null
        if (!didBillRefreshChange(oldRow, newRow) || !newRow?.id) return

        clearBillsCache()
        clearDashboardCache()
        setBillingVersion(version => version + 1)

        if (!didPaymentChange(oldRow, newRow)) return

        try {
          const bill = await getBillByIdWithRelations(newRow.id)
          if (!bill) return

          const oldPaid = typeof oldRow?.paid_amount === 'number' ? oldRow.paid_amount : 0
          const paidAmount = bill.paid_amount ?? 0
          const amountPaid = Math.max(paidAmount - oldPaid, 0) || paidAmount
          const notification = buildBillingNotification({
            billId: bill.id,
            customerName: bill.customer?.full_name ?? 'Unknown customer',
            customerCode: bill.customer?.customer_code,
            collectorName: bill.collector?.full_name,
            amount: amountPaid,
            paidAmount,
            remainingAmount: Math.max(bill.amount - paidAmount, 0),
            status: bill.status,
            receiptNo: bill.receipt_no,
            paidAt: bill.paid_at ?? new Date().toISOString(),
          })

          addBillingNotification(notification)
        } catch (error) {
          console.error('Could not build billing notification', error)
        }
      })
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Dashboard billing realtime channel is not healthy:', status)
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [addBillingNotification])

  const value = useMemo<NotificationsContextValue>(() => ({
    items,
    toasts,
    unreadCount: items.filter(item => !item.read).length,
    billingVersion,
    isInboxOpen,
    openInbox: () => setInboxOpen(true),
    closeInbox: () => setInboxOpen(false),
    markAllRead: () => setItems(current => current.map(item => ({ ...item, read: true }))),
    markRead: (id: string) => setItems(current => current.map(item => (
      item.id === id ? { ...item, read: true } : item
    ))),
    clearAll: () => {
      seenKeysRef.current.clear()
      setItems([])
    },
    dismissToast,
  }), [billingVersion, dismissToast, isInboxOpen, items, toasts])

  return (
    <NotificationsContext.Provider value={value}>
      {children}
    </NotificationsContext.Provider>
  )
}

export function useNotifications(): NotificationsContextValue {
  const context = useContext(NotificationsContext)
  if (!context) throw new Error('useNotifications must be used inside NotificationsProvider')
  return context
}
