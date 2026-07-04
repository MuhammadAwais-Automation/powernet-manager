import { supabase } from '@/lib/supabase'

async function getAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token ?? null
}

export async function sendStaffMobilePush(input: {
  staffId: string
  title: string
  body: string
  data?: Record<string, string>
}): Promise<void> {
  const token = await getAccessToken()
  if (!token) return

  try {
    const res = await fetch('/api/mobile/push-notify', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        staffId: input.staffId,
        title: input.title,
        body: input.body,
        data: input.data,
      }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => null)
      console.warn('Mobile push failed:', body?.error ?? res.status)
    }
  } catch (error) {
    console.warn('Mobile push request failed:', error)
  }
}

export async function notifyComplaintAssignment(input: {
  complaintId: string
  complaintCode: string
  issue: string
  assignedStaffId?: string | null
  teamMemberStaffIds?: string[]
}): Promise<void> {
  const title = `Assigned: ${input.complaintCode}`
  const body = input.issue.trim().slice(0, 160) || 'New complaint assigned to you'
  const data = {
    type: 'complaint_assigned',
    complaintId: input.complaintId,
  }

  const targets = new Set<string>()
  if (input.assignedStaffId) targets.add(input.assignedStaffId)
  for (const staffId of input.teamMemberStaffIds ?? []) {
    if (staffId) targets.add(staffId)
  }

  await Promise.all(
    Array.from(targets).map((staffId) =>
      sendStaffMobilePush({ staffId, title, body, data }),
    ),
  )
}