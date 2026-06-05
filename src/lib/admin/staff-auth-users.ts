import type { User } from '@supabase/supabase-js'
import { supabaseAdmin } from '@/lib/supabase-admin'

const MAX_USER_LOOKUP_PAGES = 10
const USER_LOOKUP_PAGE_SIZE = 100

export type StaffAuthUserResult = {
  user: User
  created: boolean
}

export async function findAuthUserByEmail(email: string): Promise<User | null> {
  const normalizedEmail = email.trim().toLowerCase()

  for (let page = 1; page <= MAX_USER_LOOKUP_PAGES; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page,
      perPage: USER_LOOKUP_PAGE_SIZE,
    })
    if (error) throw error

    const user = data.users.find(u => u.email?.toLowerCase() === normalizedEmail)
    if (user) return user
    if (data.users.length < USER_LOOKUP_PAGE_SIZE) return null
  }

  return null
}

export async function createOrReuseStaffAuthUser(
  email: string,
  password: string
): Promise<StaffAuthUserResult> {
  const normalizedEmail = email.trim().toLowerCase()
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email: normalizedEmail,
    password,
    email_confirm: true,
  })

  if (!createErr && created.user) {
    return { user: created.user, created: true }
  }

  const msg = createErr?.message ?? 'Could not create auth user'
  if (!msg.toLowerCase().includes('already')) throw new Error(msg)

  const existingUser = await findAuthUserByEmail(normalizedEmail)
  if (!existingUser) throw new Error('Username already exists')

  const { error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(existingUser.id, {
    password,
  })
  if (updateErr) throw updateErr

  return { user: existingUser, created: false }
}
