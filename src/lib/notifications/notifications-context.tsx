'use client'

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { clearBillsCache, getBillByIdWithRelations } from '@/lib/db/bills'
import { clearDashboardCache } from '@/lib/db/dashboard'
import { clearComplaintsCache, getComplaintById } from '@/lib/db/complaints'
import {
  buildBillingNotification,
  didBillRefreshChange,
  didNotifyChange,
  type BillingNotification,
  type BillingRealtimeBillRow,
} from './billing'
import {
  buildComplaintNotification,
  didComplaintStatusChange,
  type ComplaintNotification,
  type ComplaintRealtimeRow,
} from './complaints'

const MAX_TOASTS = 3

// Unified notification type — discriminated union on `kind`
export type AppNotification = BillingNotification | ComplaintNotification

type NotificationsContextValue = {
  items: AppNotification[]
  toasts: AppNotification[]
  unreadCount: number
  billingVersion: number
  complaintsVersion: number
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
  const [items, setItems] = useState<AppNotification[]>([])
  const [toasts, setToasts] = useState<AppNotification[]>([])
  const [billingVersion, setBillingVersion] = useState(0)
  const [complaintsVersion, setComplaintsVersion] = useState(0)
  const [isInboxOpen, setInboxOpen] = useState(false)
  const seenKeysRef = useRef<Set<string>>(new Set())

  const dismissToast = useCallback((id: string) => {
    setToasts(current => current.filter(t => t.id !== id))
  }, [])

  const addNotification = useCallback((notification: AppNotification) => {
    if (seenKeysRef.current.has(notification.dedupeKey)) return
    seenKeysRef.current.add(notification.dedupeKey)
    setItems(current => [notification, ...current].slice(0, 50))
    setToasts(current => [notification, ...current].slice(0, MAX_TOASTS))
  }, [])

  // ── Billing realtime subscription (bills table) ───────────────────────────────
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

        if (!didNotifyChange(oldRow, newRow)) return

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
            paymentMethod: bill.payment_method,
            paymentNote: bill.payment_note,
          })

          addNotification(notification)
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
  }, [addNotification])

  // ── Complaints realtime subscription (complaints table) ───────────────────────
  useEffect(() => {
    const channel = supabase
      .channel('dashboard-complaint-updates')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'complaints' }, async payload => {
        const oldRow = payload.old as ComplaintRealtimeRow | null
        const newRow = payload.new as ComplaintRealtimeRow | null

        // Always clear cache so the complaints page refreshes
        clearComplaintsCache()
        setComplaintsVersion(v => v + 1)

        // Only show a notification on meaningful technician-driven status changes
        if (!didComplaintStatusChange(oldRow, newRow) || !newRow?.id) return

        try {
          const complaint = await getComplaintById(newRow.id)
          if (!complaint) return

          const notification = buildComplaintNotification({
            complaintId: complaint.id,
            complaintCode: complaint.complaint_code,
            customerName: complaint.customer?.full_name ?? 'Unknown customer',
            technicianName: complaint.technician?.full_name ?? null,
            priority: complaint.priority,
            status: complaint.status,
            updatedAt: new Date().toISOString(),
          })

          addNotification(notification)
        } catch (error) {
          console.error('Could not build complaint notification', error)
        }
      })
      .subscribe(status => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.warn('Dashboard complaints realtime channel is not healthy:', status)
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [addNotification])

  const value = useMemo<NotificationsContextValue>(() => ({
    items,
    toasts,
    unreadCount: items.filter(item => !item.read).length,
    billingVersion,
    complaintsVersion,
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
  }), [billingVersion, complaintsVersion, dismissToast, isInboxOpen, items, toasts])

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
