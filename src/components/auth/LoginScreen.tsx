'use client'
import React, { useState } from 'react'
import Icon from '../Icon'
import { useAuth } from '@/lib/auth/auth-context'

export default function LoginScreen() {
  const { login } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = username.trim().length > 0 && password.length > 0 && !loading

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    try {
      const res = await login(username, password)
      if (!res.ok) setError(res.error ?? 'Login failed')
    } catch {
      setError('Connection error, try again')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)', padding: 24,
    }}>
      <form onSubmit={onSubmit} className="card" style={{
        width: '100%', maxWidth: 400, padding: 32,
        display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 14, background: 'var(--color-primary)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: 12,
          }}>
            <Icon name="zap" size={28} stroke={2.25} style={{ color: '#fff' }} />
          </div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>PowerNet Manager</h1>
          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>Admin Dashboard</div>
        </div>

        <div className="field">
          <label>Username</label>
          <input
            className="input"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={username}
            onChange={e => setUsername(e.target.value)}
            disabled={loading}
          />
        </div>

        <div className="field">
          <label>Password</label>
          <div style={{ position: 'relative' }}>
            <input
              className="input"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={loading}
              style={{ paddingRight: 38 }}
            />
            <button type="button" onClick={() => setShowPw(s => !s)}
              style={{
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                background: 'transparent', border: 'none', cursor: 'pointer',
                color: 'var(--text-muted)', padding: 4,
              }}>
              <Icon name={showPw ? 'eyeOff' : 'eye'} size={16} />
            </button>
          </div>
        </div>

        {error && (
          <div style={{
            padding: '10px 12px', borderRadius: 8, background: '#fee', color: '#c33',
            fontSize: 13, fontWeight: 500,
          }}>
            {error}
          </div>
        )}

        <button type="submit" className="btn btn-primary" disabled={!canSubmit}
          style={{ width: '100%', height: 44, justifyContent: 'center', fontWeight: 600 }}>
          {loading ? 'Signing in…' : 'LOGIN'}
        </button>
      </form>
    </div>
  )
}
