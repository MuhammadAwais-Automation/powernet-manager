import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'

async function getCallerStaff(authHeader: string | null): Promise<{ role: string; auth_user_id: string } | null> {
  if (!authHeader) return null
  const token = authHeader.replace(/^Bearer\s+/i, '')
  const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token)
  if (userErr || !userData.user) return null
  const { data: staff, error: staffErr } = await supabaseAdmin
    .from('staff')
    .select('role, auth_user_id')
    .eq('auth_user_id', userData.user.id)
    .maybeSingle()
  if (staffErr || !staff) return null
  return staff as { role: string; auth_user_id: string }
}

export async function DELETE(req: Request) {
  const caller = await getCallerStaff(req.headers.get('authorization'))
  if (!caller) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (caller.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => null)
  if (!body?.staff_id) {
    return NextResponse.json({ error: 'Missing staff_id' }, { status: 400 })
  }
  const { staff_id } = body as { staff_id: string }

  const { data: staffRow, error: fetchErr } = await supabaseAdmin
    .from('staff')
    .select('id, auth_user_id, role, is_active')
    .eq('id', staff_id)
    .maybeSingle()

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!staffRow) {
    return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  }

  const row = staffRow as { id: string; auth_user_id: string | null; role: string; is_active: boolean }

  if (caller.auth_user_id && caller.auth_user_id === row.auth_user_id) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 403 })
  }

  if (row.role === 'admin') {
    const { count, error: countErr } = await supabaseAdmin
      .from('staff')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'admin')
      .eq('is_active', true)
    if (countErr) {
      return NextResponse.json({ error: countErr.message }, { status: 500 })
    }
    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: 'Cannot delete the last active admin' }, { status: 403 })
    }
  }

  const { error: deleteErr } = await supabaseAdmin
    .from('staff')
    .delete()
    .eq('id', staff_id)

  if (deleteErr) {
    if (deleteErr.code === '23503') {
      return NextResponse.json(
        {
          error:
            'This staff member is linked to other records that block deletion. Please deactivate the account instead.',
        },
        { status: 409 },
      )
    }
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  if (row.auth_user_id) {
    const { error: authDeleteErr } = await supabaseAdmin.auth.admin.deleteUser(row.auth_user_id)
    if (authDeleteErr) {
      console.error('[delete-staff] Auth user delete failed:', authDeleteErr.message)
    }
  }

  return NextResponse.json({ success: true })
}
