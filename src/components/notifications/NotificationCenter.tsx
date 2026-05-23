'use client'

import React from 'react'
import Icon from '../Icon'
import { Badge, Drawer } from '../ui'
import { formatRs } from '@/lib/notifications/billing'
import { useNotifications } from '@/lib/notifications/notifications-context'

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'just now'
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function NotificationBell() {
  const { unreadCount, openInbox } = useNotifications()

  return (
    <button className="icon-btn notification-bell" title="Notifications" onClick={openInbox}>
      <Icon name="bell" size={16} />
      {unreadCount > 0 && (
        <span className="notification-count">{unreadCount > 9 ? '9+' : unreadCount}</span>
      )}
    </button>
  )
}

export function NotificationDrawer() {
  const { items, unreadCount, isInboxOpen, closeInbox, markAllRead, markRead, clearAll } = useNotifications()

  return (
    <Drawer open={isInboxOpen} onClose={closeInbox} width={420}>
      <div className="drawer-head notification-drawer-head">
        <div>
          <div className="notification-title">Operations Inbox</div>
          <div className="notification-sub">{unreadCount} unread live updates</div>
        </div>
        <button className="icon-btn" title="Close" onClick={closeInbox}>
          <Icon name="x" size={16} />
        </button>
      </div>

      <div className="drawer-body notification-list">
        {items.length === 0 ? (
          <div className="notification-empty">
            <span className="notification-empty-icon"><Icon name="bell" size={22} /></span>
            <div className="notification-empty-title">No activity yet</div>
            <div className="notification-empty-sub">
              Recovery agent payments and visits will appear here live without page reload.
            </div>
          </div>
        ) : (
          items.map(item => (
            <button
              key={item.id}
              className={`notification-item ${item.read ? 'read' : 'unread'}`}
              onClick={() => markRead(item.id)}
            >
              <span className="notification-item-icon">
                <Icon
                  name={
                    item.type === 'payment_full'
                      ? 'checkCircle'
                      : item.type === 'visit'
                      ? 'mapPin'
                      : 'cash'
                  }
                  size={18}
                />
              </span>
              <span className="notification-item-main">
                <span className="notification-item-row">
                  <span className="notification-item-title">{item.title}</span>
                  {!item.read && <span className="notification-live-dot" />}
                </span>
                <span className="notification-item-message">{item.message}</span>
                <span className="notification-item-meta">
                  {item.customerCode ?? 'No code'} · {formatTime(item.createdAt)}
                </span>
              </span>
              <span className="notification-item-side">
                {item.type !== 'visit' && (
                  <span className="notification-amount">{formatRs(item.amountPaid)}</span>
                )}
                <Badge
                  color={
                    item.type === 'payment_full'
                      ? 'green'
                      : item.type === 'visit'
                      ? 'blue'
                      : 'amber'
                  }
                  dot
                >
                  {item.type === 'payment_full'
                    ? 'paid'
                    : item.type === 'visit'
                    ? 'visited'
                    : 'partial'}
                </Badge>
              </span>
            </button>
          ))
        )}
      </div>

      <div className="drawer-foot">
        <button className="btn btn-secondary btn-sm" onClick={clearAll} disabled={items.length === 0}>
          Clear history
        </button>
        <button className="btn btn-primary btn-sm" onClick={markAllRead} disabled={unreadCount === 0}>
          Mark all read
        </button>
      </div>
    </Drawer>
  )
}
