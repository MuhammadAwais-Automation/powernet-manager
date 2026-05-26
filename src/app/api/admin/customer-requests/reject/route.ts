import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getCallerStaff(authHeader: string | null): Promise<{ id: string; role: string } | null> {
  if (!authHeader) return null
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
  if (userErr || !userData.user) return null
  const { data: staff, error: staffErr } = await supabaseAdmin
    .from('staff')
    .select('id, role')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()
  if (staffErr || !staff) return null
  return staff as { id: string; role: string }
}

export async function POST(req: Request) {
  const caller = await getCallerStaff(req.headers.get('authorization'))
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (caller.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  const requestId = typeof body?.request_id === 'string' ? body.request_id : ''
  const reviewNote = typeof body?.review_note === 'string' ? body.review_note.trim() : ''

  if (!requestId) return NextResponse.json({ error: 'Missing request_id' }, { status: 400 })
  if (reviewNote.length < 3) {
    return NextResponse.json({ error: 'Rejection note is required' }, { status: 400 })
  }

  const { data: existing, error: fetchErr } = await supabaseAdmin
    .from('customer_signup_requests')
    .select('id, status')
    .eq('id', requestId)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!existing) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if ((existing as { status: string }).status !== 'pending') {
    return NextResponse.json({ error: 'Only pending requests can be rejected' }, { status: 409 })
  }

  const { data: request, error } = await supabaseAdmin
    .from('customer_signup_requests')
    .update({
      status: 'rejected',
      review_note: reviewNote,
      reviewed_by: caller.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .select('*, area:areas(id, name, code), package:packages(id, name, default_price), approved_customer:customers(id, customer_code, full_name)')
    .single()

  if (error || !request) {
    return NextResponse.json({ error: error?.message ?? 'Could not reject request' }, { status: 500 })
  }

  return NextResponse.json({ request })
}
