import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getCallerStaffRole(authHeader: string | null): Promise<string | null> {
  if (!authHeader) return null
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
  if (userErr || !userData.user) return null
  const { data: staff, error: staffErr } = await supabaseAdmin
    .from('staff')
    .select('role')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()
  if (staffErr || !staff) return null
  return (staff as { role: string }).role
}

export async function POST(req: Request) {
  const role = await getCallerStaffRole(req.headers.get('authorization'))
  if (!role) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

  const { auth_user_id, password } = body as { auth_user_id?: string; password?: string }
  if (!auth_user_id || !password) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const { error } = await supabaseAdmin.auth.admin.updateUserById(auth_user_id, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
