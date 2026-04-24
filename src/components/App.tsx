'use client';
import React, { useState, useEffect } from 'react';
import Icon from './Icon';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import BillingPage from './pages/BillingPage';
import ComplaintsPage from './pages/ComplaintsPage';
import StaffPage from './pages/StaffPage';
import AreasPage from './pages/AreasPage';
import ReportsPage from './pages/ReportsPage';

type PageId = 'dashboard' | 'customers' | 'billing' | 'complaints' | 'staff' | 'areas' | 'reports' | 'settings';

const NAV = [
  { id: 'dashboard' as PageId, label: 'Dashboard', icon: 'grid' },
  { id: 'customers' as PageId, label: 'Customers', icon: 'users', count: '1.2k' },
  { id: 'billing' as PageId, label: 'Billing & Payments', icon: 'card' },
  { id: 'complaints' as PageId, label: 'Complaints', icon: 'alert', count: '23' },
  { id: 'staff' as PageId, label: 'Staff Management', icon: 'briefcase' },
  { id: 'areas' as PageId, label: 'Areas & Sectors', icon: 'pin' },
  { id: 'reports' as PageId, label: 'Reports', icon: 'chart' },
];

const PAGE_META: Record<PageId, { title: string; sub: string }> = {
  dashboard: { title: 'Dashboard', sub: 'Overview of network operations' },
  customers: { title: 'Customers', sub: '1,248 subscribers across 7 areas' },
  billing: { title: 'Billing & Payments', sub: 'April 2026 billing cycle' },
  complaints: { title: 'Complaints', sub: '23 open · 14 in progress' },
  staff: { title: 'Staff Management', sub: '8 field agents active' },
  areas: { title: 'Areas & Sectors', sub: '7 service zones across Lahore' },
  reports: { title: 'Reports', sub: 'Analytics & exports' },
  settings: { title: 'Settings', sub: 'Organization, billing and integrations' },
};

function Sidebar({ active, setActive }: { active: PageId; setActive: (id: PageId) => void }) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <span className="bolt"><Icon name="zap" size={16} stroke={2.25} /></span>
        <div>
          PowerNet Manager
          <span className="title-sub">ISP Operations</span>
        </div>
      </div>

      <div className="sidebar-section-label">Main</div>
      <nav className="sidebar-nav">
        {NAV.map(n => (
          <a key={n.id} className={`sidebar-link ${active === n.id ? 'active' : ''}`}
            onClick={e => { e.preventDefault(); setActive(n.id); }} href="#">
            <Icon name={n.icon as any} size={17} />
            <span>{n.label}</span>
            {n.count && <span className="count">{n.count}</span>}
          </a>
        ))}
        <div style={{ height: 8 }} />
        <div className="sidebar-section-label" style={{ padding: '8px 12px 6px' }}>System</div>
        <a className={`sidebar-link ${active === 'settings' ? 'active' : ''}`}
          onClick={e => { e.preventDefault(); setActive('settings'); }} href="#">
          <Icon name="settings" size={17} /><span>Settings</span>
        </a>
      </nav>

      <div className="sidebar-user">
        <div className="avatar">AK</div>
        <div className="who">
          <div className="name">Ahmed Khan</div>
          <div className="role">Super Admin</div>
        </div>
        <button className="menu-btn"><Icon name="more" size={16} /></button>
      </div>
    </aside>
  );
}

function Topbar({ meta, isDark, onToggleTheme }: {
  meta: { title: string; sub: string };
  isDark: boolean;
  onToggleTheme: () => void;
}) {
  return (
    <header className="topbar">
      <div>
        <div className="topbar-title">{meta.title}</div>
        <div className="topbar-sub">{meta.sub}</div>
      </div>
      <div className="topbar-search">
        <Icon name="search" size={14} />
        <input placeholder="Search customers, bills, complaints…" />
        <span className="kbd">⌘K</span>
      </div>
      <button className="icon-btn" title="Notifications">
        <Icon name="bell" size={16} />
        <span className="dot" />
      </button>
      <button className="icon-btn" title="Help">
        <Icon name="help" size={16} />
      </button>
      <button className="icon-btn" title="Theme" onClick={onToggleTheme}>
        <Icon name={isDark ? 'sun' : 'moon'} size={16} />
      </button>
      <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
      <div className="row gap-sm">
        <div className="topbar-avatar">AK</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>Ahmed Khan</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.2 }}>Super Admin</span>
        </div>
        <Icon name="arrowDown" size={12} style={{ color: 'var(--text-muted)' }} />
      </div>
    </header>
  );
}

export default function App() {
  const [active, setActive] = useState<PageId>('dashboard');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const meta = PAGE_META[active];

  const pages: Record<PageId, React.ReactNode> = {
    dashboard: <DashboardPage />,
    customers: <CustomersPage />,
    billing: <BillingPage />,
    complaints: <ComplaintsPage />,
    staff: <StaffPage />,
    areas: <AreasPage />,
    reports: <ReportsPage />,
    settings: (
      <div className="page">
        <div className="page-header">
          <div><h1>Settings</h1><p>Organization profile, billing integrations and API keys</p></div>
        </div>
        <div className="card card-pad" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          <Icon name="settings" size={32} style={{ color: 'var(--text-faint)', marginBottom: 12 }} />
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>Settings coming soon</div>
          <div style={{ fontSize: 13 }}>Configure organization details, tax rates, payment gateways and SMS templates here.</div>
        </div>
      </div>
    ),
  };

  return (
    <div className="app">
      <Sidebar active={active} setActive={setActive} />
      <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <Topbar meta={meta} isDark={isDark} onToggleTheme={() => setIsDark(d => !d)} />
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {pages[active]}
        </div>
      </main>
    </div>
  );
}
