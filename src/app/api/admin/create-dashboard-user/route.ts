import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { createOrReuseStaffAuthUser } from '@/lib/admin/staff-auth-users'
import { sanitizeAllowedPages, type PageId } from '@/lib/auth/permissions'

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

  const {
    username, password, full_name, phone, area_id, area_ids, cable_area_ids,
    role: newRole, allowed_pages,
  } = body as {
    username?: string; password?: string; full_name?: string;
    phone?: string | null; area_id?: string | null; area_ids?: string[] | null;
    cable_area_ids?: string[] | null; role?: string;
    allowed_pages?: string[] | null;
  }

  if (!username || !password || !full_name || !newRole) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }
  if (newRole !== 'admin' && newRole !== 'complaint_manager') {
    return NextResponse.json({ error: 'Invalid dashboard role' }, { status: 400 })
  }

  let pages: PageId[] | null = null
  if (newRole === 'complaint_manager') {
    pages = sanitizeAllowedPages(allowed_pages)
    if (pages.length === 0) {
      return NextResponse.json({ error: 'Select at least one page for custom access' }, { status: 400 })
    }
  }

  const normalizedUsername = username.trim().toLowerCase()
  const email = `${normalizedUsername}${USERNAME_DOMAIN}`

  const { data: existingStaff, error: existingStaffErr } = await supabaseAdmin
    .from('staff')
    .select('id')
    .eq('username', normalizedUsername)
    .maybeSingle()
  if (existingStaffErr) {
    return NextResponse.json({ error: existingStaffErr.message }, { status: 500 })
  }
  if (existingStaff) {
    return NextResponse.json({ error: 'Username already exists' }, { status: 409 })
  }

  let authUser
  let createdAuthUser = false
  try {
    const result = await createOrReuseStaffAuthUser(email, password)
    authUser = result.user
    createdAuthUser = result.created
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Could not create auth user'
    const status = msg.toLowerCase().includes('already') ? 409 : 500
    return NextResponse.json({ error: status === 409 ? 'Username already exists' : msg }, { status })
  }

  const finalAreaIds = area_ids ?? (area_id ? [area_id] : [])
  const finalAreaId = finalAreaIds[0] ?? null

  const { data: staffRow, error: staffErr } = await supabaseAdmin
    .from('staff')
    .insert({
      full_name,
      role: newRole,
      phone: phone ?? null,
      area_id: finalAreaId,
      area_ids: finalAreaIds,
      cable_area_ids: cable_area_ids ?? null,
      username: normalizedUsername,
      auth_user_id: authUser.id,
      allowed_pages: newRole === 'admin' ? null : pages,
      is_active: true,
    })
    .select('id, full_name, role, phone, area_id, area_ids, cable_area_ids, username, auth_user_id, allowed_pages, is_active, created_at')
    .single()

  if (staffErr || !staffRow) {
    if (createdAuthUser) await supabaseAdmin.auth.admin.deleteUser(authUser.id)
    return NextResponse.json({ error: staffErr?.message ?? 'Could not create staff row' }, { status: 500 })
  }

  return NextResponse.json({ staff: staffRow })
}
