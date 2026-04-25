'use client'
import React from 'react'
import Icon from '../Icon'

export default function AccessDenied() {
  return (
    <div className="page" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 400 }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <Icon name="ban" size={36} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
        <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text)', marginBottom: 6 }}>Access denied</div>
        <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          You don&apos;t have permission to view this page.
        </div>
      </div>
    </div>
  )
}
