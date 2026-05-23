export type ComplaintNotificationType = 'complaint_in_progress' | 'complaint_resolved'

// Shape of payload.old / payload.new from the Supabase realtime event
export type ComplaintRealtimeRow = {
  id?: string | null
  complaint_code?: string | null
  customer_id?: string | null
  status?: string | null
  assigned_to?: string | null
  priority?: string | null
  issue?: string | null
  resolved_at?: string | null
}

export type ComplaintNotification = {
  id: string
  dedupeKey: string
  kind: 'complaint'
  type: ComplaintNotificationType
  complaintId: string
  complaintCode: string
  customerName: string
  technicianName: string | null
  priority: string
  status: string
  createdAt: string
  read: boolean
  title: string
  message: string
}

// Detect whether a complaint UPDATE warrants a notification
export function didComplaintStatusChange(
  oldRow?: ComplaintRealtimeRow | null,
  newRow?: ComplaintRealtimeRow | null,
): boolean {
  if (!newRow?.id) return false
  if (!newRow.status) return false
  // If we have both old and new status, only notify if it changed
  if (oldRow && oldRow.status && oldRow.status === newRow.status) return false
  // Only notify on meaningful technician-driven transitions
  return (
    newRow.status === 'in_progress' ||
    newRow.status === 'resolved'
  )
}

export function buildComplaintNotificationDedupeKey(input: {
  complaintId: string
  status: string
}): string {
  return `complaint:${input.complaintId}:${input.status}`
}

export function buildComplaintNotification(source: {
  complaintId: string
  complaintCode: string
  customerName: string
  technicianName: string | null
  priority: string
  status: string
  updatedAt?: string | null
}): ComplaintNotification {
  const tech = source.technicianName ? ` by ${source.technicianName}` : ''

  let title = ''
  let message = ''
  const type: ComplaintNotificationType =
    source.status === 'resolved' ? 'complaint_resolved' : 'complaint_in_progress'

  if (source.status === 'in_progress') {
    title = 'Complaint In Progress'
    message = `${source.complaintCode} — ${source.customerName} — technician on-site${tech}`
  } else {
    title = 'Complaint Resolved'
    message = `${source.complaintCode} — ${source.customerName} — resolved${tech}`
  }

  const dedupeKey = buildComplaintNotificationDedupeKey({
    complaintId: source.complaintId,
    status: source.status,
  })

  return {
    id: `${dedupeKey}:${source.updatedAt ?? Date.now()}`,
    dedupeKey,
    kind: 'complaint',
    type,
    complaintId: source.complaintId,
    complaintCode: source.complaintCode,
    customerName: source.customerName,
    technicianName: source.technicianName,
    priority: source.priority ?? 'medium',
    status: source.status,
    createdAt: source.updatedAt ?? new Date().toISOString(),
    read: false,
    title,
    message,
  }
}
