export type NotificationNavigationTarget =
  | { page: 'billing'; billId: string }
  | { page: 'complaints'; complaintId: string }

export function getNotificationNavigationTarget(notification: unknown): NotificationNavigationTarget | null {
  if (!notification || typeof notification !== 'object') return null

  const item = notification as { kind?: unknown; billId?: unknown; complaintId?: unknown }

  if (item.kind === 'billing' && typeof item.billId === 'string' && item.billId.length > 0) {
    return { page: 'billing', billId: item.billId }
  }

  if (item.kind === 'complaint' && typeof item.complaintId === 'string' && item.complaintId.length > 0) {
    return { page: 'complaints', complaintId: item.complaintId }
  }

  return null
}
