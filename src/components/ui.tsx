'use client';
import React from 'react';
import { initials, avClass } from '@/lib/utils';
import Icon, { type IconName } from './Icon';

export function Badge({ color = 'gray', dot = false, children }: { color?: string; dot?: boolean; children: React.ReactNode }) {
  return (
    <span className={`badge ${color}`}>
      {dot && <span className="dot" />}
      {children}
    </span>
  );
}

export function Avatar({ name, size = 32 }: { name: string; size?: number }) {
  const cls = avClass(name || '');
  return (
    <span className={`av ${cls}`} style={{ width: size, height: size, fontSize: Math.round(size * 0.35) }}>
      {initials(name || '?')}
    </span>
  );
}

export function IconBadge({ name, color = 'blue', size = 36 }: { name: IconName; color?: string; size?: number }) {
  return (
    <span className={`icon-badge ${color}`} style={{ width: size, height: size }}>
      <Icon name={name} size={Math.round(size * 0.5)} />
    </span>
  );
}

export function Switch({ on, onChange }: { on: boolean; onChange?: (v: boolean) => void }) {
  return (
    <button
      className={`switch ${on ? 'on' : ''}`}
      onClick={() => onChange?.(!on)}
      aria-pressed={on}
    />
  );
}

export function Drawer({ open, onClose, children, width = 460 }: {
  open: boolean; onClose: () => void; children: React.ReactNode; width?: number;
}) {
  return (
    <>
      <div className={`drawer-backdrop ${open ? 'open' : ''}`} onClick={onClose} />
      <div className={`drawer ${open ? 'open' : ''}`} style={{ width }}>
        {children}
      </div>
    </>
  );
}

export function Modal({ open, onClose, children, width = 560 }: {
  open: boolean; onClose: () => void; children: React.ReactNode; width?: number;
}) {
  return (
    <div className={`modal-backdrop ${open ? 'open' : ''}`} onClick={onClose}>
      <div className="modal" style={{ width }} onClick={e => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Tabs({ value, onChange, items }: {
  value: string;
  onChange: (v: string) => void;
  items: { value: string; label: string; count?: number }[];
}) {
  return (
    <div className="tabs">
      {items.map(it => (
        <button key={it.value} className={value === it.value ? 'active' : ''} onClick={() => onChange(it.value)}>
          {it.label}
          {it.count != null && <span className="count">{it.count}</span>}
        </button>
      ))}
    </div>
  );
}
