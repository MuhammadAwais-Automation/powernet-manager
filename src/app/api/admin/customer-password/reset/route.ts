import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase-admin'
import {
  makeCustomerAuthEmail,
  pickCustomerLoginIdentifier,
  validateCustomerTemporaryPassword,
  type CustomerLoginSource,
} from '@/lib/admin/customer-auth-core'

type CustomerPasswordRow = CustomerLoginSource & {
  id: string
  full_name: string
  phone: string | null
  auth_user_id: string | null
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
  const customerId = typeof body?.customer_id === 'string' ? body.customer_id : ''
  const temporaryPassword = typeof body?.temporary_password === 'string' ? body.temporary_password : ''

  if (!customerId) return NextResponse.json({ error: 'Missing customer_id' }, { status: 400 })
  const passwordError = validateCustomerTemporaryPassword(temporaryPassword)
  if (passwordError) return NextResponse.json({ error: passwordError }, { status: 400 })

  const { data: customerData, error: customerErr } = await supabaseAdmin
    .from('customers')
    .select('id, customer_code, username, auth_user_id, house_id, full_name, phone, address_value, status')
    .eq('id', customerId)
    .maybeSingle()

  if (customerErr) return NextResponse.json({ error: customerErr.message }, { status: 500 })
  if (!customerData) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const customer = customerData as CustomerPasswordRow
  if (!customer.phone || customer.phone.trim().length === 0) {
    return NextResponse.json({ error: 'Customer has no registered phone number' }, { status: 400 })
  }
  const loginId = pickCustomerLoginIdentifier(customer)
  if (!loginId) {
    return NextResponse.json({ error: 'Customer has no usable login ID' }, { status: 409 })
  }

  let email: string
  try {
    email = makeCustomerAuthEmail(loginId)
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid customer login ID' },
      { status: 400 }
    )
  }

  const metadata = {
    role: 'customer',
    customer_id: customer.id,
    login_id: loginId,
    house_id: customer.house_id ?? customer.address_value ?? loginId,
    full_name: customer.full_name,
  }

  if (customer.auth_user_id) {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(customer.auth_user_id, {
      email,
      password: temporaryPassword,
      email_confirm: true,
      user_metadata: metadata,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({
      ok: true,
      loginId,
      temporaryPassword,
      createdAuthUser: false,
      authUserId: customer.auth_user_id,
    })
  }

  const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true,
    user_metadata: metadata,
  })
  if (authErr || !authData.user) {
    const message = authErr?.message ?? 'Could not create customer auth user'
    return NextResponse.json({ error: message.includes('already') ? 'Customer login already exists' : message }, {
      status: message.includes('already') ? 409 : 500,
    })
  }

  const { error: updateErr } = await supabaseAdmin
    .from('customers')
    .update({ auth_user_id: authData.user.id })
    .eq('id', customer.id)

  if (updateErr) {
    await supabaseAdmin.auth.admin.deleteUser(authData.user.id).catch(() => undefined)
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    loginId,
    temporaryPassword,
    createdAuthUser: true,
    authUserId: authData.user.id,
  })
}
