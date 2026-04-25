'use client'
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import type { Staff } from '@/types/database'
import { isDashboardRole } from './permissions'

const USERNAME_DOMAIN = '@powernet.local'

const COLS = 'id, full_name, role, phone, area_id, username, auth_user_id, is_active, created_at'

type AuthContextValue = {
  staff: Staff | null
  loading: boolean
  login: (username: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchStaffByAuthId(authUserId: string): Promise<Staff | null> {
  const { data, error } = await supabase
    .from('staff')
    .select(COLS)
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  if (error || !data) return null
  return data as Staff
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function bootstrap() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!active) return
      if (!session) {
        setStaff(null)
        setLoading(false)
        return
      }
      const s = await fetchStaffByAuthId(session.user.id)
      if (!active) return
      if (!s || !isDashboardRole(s.role) || !s.is_active) {
        await supabase.auth.signOut()
        setStaff(null)
      } else {
        setStaff(s)
      }
      setLoading(false)
    }
    bootstrap()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!session) {
        setStaff(null)
        return
      }
      const s = await fetchStaffByAuthId(session.user.id)
      if (!s || !isDashboardRole(s.role) || !s.is_active) {
        await supabase.auth.signOut()
        setStaff(null)
      } else {
        setStaff(s)
      }
    })
    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const login = useCallback(async (username: string, password: string) => {
    const email = `${username.trim().toLowerCase()}${USERNAME_DOMAIN}`
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error || !data.session) {
      return { ok: false, error: 'Invalid credentials' }
    }
    const s = await fetchStaffByAuthId(data.session.user.id)
    if (!s) {
      await supabase.auth.signOut()
      return { ok: false, error: 'Account not found, contact admin' }
    }
    if (!isDashboardRole(s.role)) {
      await supabase.auth.signOut()
      return { ok: false, error: 'This account is not authorized for the dashboard' }
    }
    if (!s.is_active) {
      await supabase.auth.signOut()
      return { ok: false, error: 'Account disabled' }
    }
    setStaff(s)
    return { ok: true }
  }, [])

  const logout = useCallback(async () => {
    await supabase.auth.signOut()
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
