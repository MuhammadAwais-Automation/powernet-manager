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

export async function DELETE(req: Request) {
  // 1. Auth check — sirf admin delete kar sakta hai
  const callerRole = await getCallerStaffRole(req.headers.get('authorization'))
  if (!callerRole) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (callerRole !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // 2. Body parse
  const body = await req.json().catch(() => null)
  if (!body?.staff_id) {
    return NextResponse.json({ error: 'Missing staff_id' }, { status: 400 })
  }
  const { staff_id } = body as { staff_id: string }

  // 3. Staff row fetch — auth_user_id lena hai agar dashboard user hai
  const { data: staffRow, error: fetchErr } = await supabaseAdmin
    .from('staff')
    .select('id, auth_user_id, role')
    .eq('id', staff_id)
    .maybeSingle()

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!staffRow) {
    return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  }

  // 4. Safety: admin khud apne aap ko delete nahi kar sakta
  //    (frontend bhi filter karti hai, yeh backend safety hai)
  const { data: callerData } = await supabaseAdmin.auth.getUser(
    req.headers.get('authorization')!.replace(/^Bearer\s+/i, '')
  )
  if (callerData?.user?.id && callerData.user.id === (staffRow as { auth_user_id: string | null }).auth_user_id) {
    return NextResponse.json({ error: 'You cannot delete your own account' }, { status: 403 })
  }

  // 5. Database se staff row delete karo
  const { error: deleteErr } = await supabaseAdmin
    .from('staff')
    .delete()
    .eq('id', staff_id)

  if (deleteErr) {
    return NextResponse.json({ error: deleteErr.message }, { status: 500 })
  }

  // 6. Agar Supabase Auth user bhi linked hai (dashboard user) toh use bhi delete karo
  const authUserId = (staffRow as { auth_user_id: string | null }).auth_user_id
  if (authUserId) {
    const { error: authDeleteErr } = await supabaseAdmin.auth.admin.deleteUser(authUserId)
    if (authDeleteErr) {
      // Staff row already delete ho chuka — auth cleanup fail hone par sirf log karein
      console.error('[delete-staff] Auth user delete failed:', authDeleteErr.message)
    }
  }

  return NextResponse.json({ success: true })
}
