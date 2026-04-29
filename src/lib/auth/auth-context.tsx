'use client'
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { withTimeout } from '@/lib/async/with-timeout'
import type { Staff } from '@/types/database'
import { isDashboardRole } from './permissions'

const USERNAME_DOMAIN = '@powernet.local'
const AUTH_TIMEOUT_MS = 8_000

const COLS = 'id, full_name, role, phone, area_id, username, auth_user_id, is_active, created_at'

type AuthContextValue = {
  staff: Staff | null
  loading: boolean
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchStaffByAuthId(authUserId: string): Promise<Staff | null> {
  const { data, error } = await withTimeout(
    supabase
      .from('staff')
      .select(COLS)
      .eq('auth_user_id', authUserId)
      .maybeSingle(),
    AUTH_TIMEOUT_MS,
    'Staff lookup timed out'
  )
  if (error || !data) return null
  return data as Staff
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function acceptSessionUser(authUserId: string) {
      const s = await fetchStaffByAuthId(authUserId)
      if (!active) return
      if (!s || !isDashboardRole(s.role) || !s.is_active) {
        await withTimeout(supabase.auth.signOut(), AUTH_TIMEOUT_MS, 'Sign out timed out').catch(() => undefined)
        setStaff(null)
      } else {
        setStaff(s)
      }
    }

    async function bootstrap() {
      try {
        const { data: { session } } = await withTimeout(
          supabase.auth.getSession(),
          AUTH_TIMEOUT_MS,
          'Auth session check timed out'
        )
        if (!active) return
        if (!session) {
          setStaff(null)
          return
        }
        await acceptSessionUser(session.user.id)
      } catch {
        await supabase.auth.signOut().catch(() => undefined)
        if (active) setStaff(null)
      } finally {
        if (active) setLoading(false)
      }
    }
    bootstrap()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setStaff(null)
        setLoading(false)
        return
      }
      window.setTimeout(() => {
        if (!active) return
        setLoading(true)
        acceptSessionUser(session.user.id)
          .catch(async () => {
            await supabase.auth.signOut().catch(() => undefined)
            if (active) setStaff(null)
          })
          .finally(() => {
            if (active) setLoading(false)
          })
      }, 0)
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const email = `${username.trim().toLowerCase()}${USERNAME_DOMAIN}`
    const { data, error } = await withTimeout(
      supabase.auth.signInWithPassword({ email, password }),
      AUTH_TIMEOUT_MS,
      'Login timed out'
    )
    if (error || !data.session) {
      return { ok: false, error: 'Invalid credentials' }
    }
    const s = await fetchStaffByAuthId(data.session.user.id)
    if (!s) {
      await supabase.auth.signOut().catch(() => undefined)
      return { ok: false, error: 'Account not found, contact admin' }
    }
    if (!isDashboardRole(s.role)) {
      await supabase.auth.signOut().catch(() => undefined)
      return { ok: false, error: 'This account is not authorized for the dashboard' }
    }
    if (!s.is_active) {
      await supabase.auth.signOut().catch(() => undefined)
      return { ok: false, error: 'Account disabled' }
    }
    setStaff(s)
    return { ok: true }
  }, [])

  const logout = useCallback(async () => {
    await withTimeout(supabase.auth.signOut(), AUTH_TIMEOUT_MS, 'Logout timed out').catch(() => undefined)
    setStaff(null)
  }, [])

  return (
    <AuthContext.Provider value={{ staff, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
