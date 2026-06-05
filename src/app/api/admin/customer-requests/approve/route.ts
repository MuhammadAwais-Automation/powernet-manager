import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import { makeCustomerAuthEmail, validateCustomerTemporaryPassword } from '@/lib/admin/customer-auth-core'

type SignupRequestRow = {
  id: string
  full_name: string
  father_name: string | null
  cnic: string
  gender: string | null
  profession: string | null
  rank_or_position: string | null
  unit: string | null
  phone: string
  whatsapp: string | null
  area_id: string
  package_id: string
  house_id: string
  street_address: string | null
  email: string | null
  status: string
}

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
  const temporaryPassword = typeof body?.temporary_password === 'string' ? body.temporary_password : ''
  const reviewNote = typeof body?.review_note === 'string' && body.review_note.trim()
    ? body.review_note.trim()
    : null

  if (!requestId) return NextResponse.json({ error: 'Missing request_id' }, { status: 400 })
  const passwordError = validateCustomerTemporaryPassword(temporaryPassword)
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 })

  const { data: request, error: requestErr } = await supabaseAdmin
    .from('customer_signup_requests')
    .select('*')
    .eq('id', requestId)
    .maybeSingle()

  if (requestErr) return NextResponse.json({ error: requestErr.message }, { status: 500 })
  if (!request) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const signup = request as SignupRequestRow
  if (signup.status !== 'pending') {
    return NextResponse.json({ error: 'Only pending requests can be approved' }, { status: 409 })
  }

  const phoneDigits = signup.phone.replace(/[^0-9]/g, '')
  if (!phoneDigits) {
    return NextResponse.json({ error: 'Invalid phone number in signup request' }, { status: 400 })
  }
  const email = makeCustomerAuthEmail(phoneDigits)

  const duplicateChecks = await Promise.all([
    supabaseAdmin.from('customers').select('id').eq('house_id', signup.house_id).limit(1),
    supabaseAdmin.from('customers').select('id').eq('address_value', signup.house_id).limit(1),
    supabaseAdmin.from('customers').select('id').eq('phone', signup.phone).limit(1),
  ])
  const duplicateErr = duplicateChecks.find(result => result.error)?.error
  if (duplicateErr) return NextResponse.json({ error: duplicateErr.message }, { status: 500 })
  if (duplicateChecks.some(result => (result.data ?? []).length > 0)) {
    return NextResponse.json({ error: 'A customer with this house ID or phone already exists' }, { status: 409 })
  }

  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: {
      role: 'customer',
      login_id: phoneDigits,
      house_id: signup.house_id,
      full_name: signup.full_name,
    },
  })
  if (authErr || !authData.user) {
    const message = authErr?.message ?? 'Could not create customer auth user'
    return NextResponse.json({ error: message.includes('already') ? 'Customer login already exists' : message }, {
      status: message.includes('already') ? 409 : 500,
    })
  }

  const { data: customer, error: customerErr } = await supabaseAdmin
    .from('customers')
    .insert({
      username: signup.house_id,
      auth_user_id: authData.user.id,
      house_id: signup.house_id,
      full_name: signup.full_name,
      father_name: signup.father_name,
      cnic: signup.cnic,
      gender: signup.gender,
      profession: signup.profession,
      rank_or_position: signup.rank_or_position,
      unit: signup.unit,
      phone: signup.phone,
      whatsapp: signup.whatsapp,
      email: signup.email,
      package_id: signup.package_id,
      iptv: false,
      address_type: 'id_number',
      address_value: signup.house_id,
      area_id: signup.area_id,
      connection_date: new Date().toISOString().slice(0, 10),
      due_amount: null,
      status: 'active',
      remarks: signup.street_address,
    })
    .select('id, customer_code, full_name')
    .single()

  if (customerErr || !customer) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => undefined)
    return NextResponse.json({ error: customerErr?.message ?? 'Could not create customer' }, { status: 500 })
  }

  const { data: updatedRequest, error: updateErr } = await supabaseAdmin
    .from('customer_signup_requests')
    .update({
      status: 'approved',
      review_note: reviewNote,
      approved_customer_id: (customer as { id: string }).id,
      reviewed_by: caller.id,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', signup.id)
    .select('*, area:areas(id, name, code), package:packages(id, name, default_price), approved_customer:customers(id, customer_code, full_name)')
    .single()

  if (updateErr || !updatedRequest) {
    return NextResponse.json({ error: updateErr?.message ?? 'Customer created, but request update failed' }, { status: 500 })
  }

  return NextResponse.json({
    request: updatedRequest,
    temporaryPassword,
  })
}
