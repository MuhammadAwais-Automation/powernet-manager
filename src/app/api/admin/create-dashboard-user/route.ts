import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

const USERNAME_DOMAIN = '@powernet.local'

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

  const { username, password, full_name, phone, area_id, role: newRole } = body as {
    username?: string; password?: string; full_name?: string;
    phone?: string | null; area_id?: string | null; role?: string;
  }

  if (!username || !password || !full_name || !newRole) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (newRole !== 'admin' && newRole !== 'complaint_manager') {
    return NextResponse.json({ error: 'Invalid dashboard role' }, { status: 400 })
  }

  const email = `${username.trim().toLowerCase()}${USERNAME_DOMAIN}`

  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  })
  if (createErr || !created.user) {
    const msg = createErr?.message ?? 'Could not create auth user'
    if (msg.toLowerCase().includes('already')) {
      return NextResponse.json({ error: 'Username already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const { data: staffRow, error: staffErr } = await supabaseAdmin
    .from('staff')
    .insert({
      full_name,
      role: newRole,
      phone: phone ?? null,
      area_id: area_id ?? null,
      username: username.trim().toLowerCase(),
      auth_user_id: created.user.id,
      is_active: true,
    })
    .select('id, full_name, role, phone, area_id, username, auth_user_id, is_active, created_at')
    .single()

  if (staffErr || !staffRow) {
    await supabaseAdmin.auth.admin.deleteUser(created.user.id)
    return NextResponse.json({ error: staffErr?.message ?? 'Could not create staff row' }, { status: 500 })
  }

  return NextResponse.json({ staff: staffRow })
}
