export type NotificationNavigationTarget =
  | { page: 'billing'; billId: string }
  | { page: 'complaints'; complaintId: string }
  | { page: 'customer_requests'; requestId: string }

export function getNotificationNavigationTarget(notification: unknown): NotificationNavigationTarget | null {
  if (!notification || typeof notification !== 'object') return null

  const item = notification as { kind?: unknown; billId?: unknown; complaintId?: unknown; requestId?: unknown }

  if (item.kind === 'billing' && typeof item.billId === 'string' && item.billId.length > 0) {
    return { page: 'billing', billId: item.billId }
  }

  if (item.kind === 'complaint' && typeof item.complaintId === 'string' && item.complaintId.length > 0) {
    return { page: 'complaints', complaintId: item.complaintId }
  }

  if (item.kind === 'customer_signup' && typeof item.requestId === 'string' && item.requestId.length > 0) {
    return { page: 'customer_requests', requestId: item.requestId }
  }

  return null
}
