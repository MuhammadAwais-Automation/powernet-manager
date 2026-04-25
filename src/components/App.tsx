'use client';
import React, { useState, useEffect, useMemo } from 'react';
import Icon from './Icon';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import BillingPage from './pages/BillingPage';
import ComplaintsPage from './pages/ComplaintsPage';
import StaffPage from './pages/StaffPage';
import AreasPage from './pages/AreasPage';
import ReportsPage from './pages/ReportsPage';
import LoginScreen from './auth/LoginScreen';
import AccessDenied from './auth/AccessDenied';
import { AuthProvider, useAuth } from '@/lib/auth/auth-context';
import { NAV_BY_ROLE, DEFAULT_PAGE_BY_ROLE, canAccessPage, type PageId } from '@/lib/auth/permissions';
import { initials } from '@/lib/utils';

const ALL_NAV: { id: PageId; label: string; icon: string }[] = [
  { id: 'dashboard',  label: 'Dashboard',          icon: 'grid' },
  { id: 'customers',  label: 'Customers',          icon: 'users' },
  { id: 'billing',    label: 'Billing & Payments', icon: 'card' },
  { id: 'complaints', label: 'Complaints',         icon: 'alert' },
  { id: 'staff',      label: 'Staff Management',   icon: 'briefcase' },
  { id: 'areas',      label: 'Areas & Sectors',    icon: 'pin' },
  { id: 'reports',    label: 'Reports',            icon: 'chart' },
];

const PAGE_META: Record<PageId, { title: string; sub: string }> = {
  dashboard:  { title: 'Dashboard',          sub: 'Overview of network operations' },
  customers:  { title: 'Customers',          sub: 'Subscribers across service areas' },
  billing:    { title: 'Billing & Payments', sub: 'Monthly billing & collections' },
  complaints: { title: 'Complaints',         sub: 'Open & in-progress tickets' },
  staff:      { title: 'Staff Management',   sub: 'Field agents & dashboard users' },
  areas:      { title: 'Areas & Sectors',    sub: 'Service zones' },
  reports:    { title: 'Reports',            sub: 'Analytics & exports' },
  settings:   { title: 'Settings',           sub: 'Organization, billing and integrations' },
};

const ROLE_LABEL_SHORT: Record<string, string> = {
  admin: 'Admin',
  complaint_manager: 'Complaint Manager',
};

function Sidebar({ active, setActive, allowedNav, staffName, staffRole, onLogout }: {
  active: PageId;
  setActive: (id: PageId) => void;
  allowedNav: PageId[];
  staffName: string;
  staffRole: string;
  onLogout: () => void;
}) {
  const visibleMain = ALL_NAV.filter(n => allowedNav.includes(n.id));
  const showSettings = allowedNav.includes('settings');
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
        {visibleMain.map(n => (
          <a key={n.id} className={`sidebar-link ${active === n.id ? 'active' : ''}`}
            onClick={e => { e.preventDefault(); setActive(n.id); }} href="#">
            <Icon name={n.icon as 'grid' | 'users' | 'card' | 'alert' | 'briefcase' | 'pin' | 'chart'} size={17} />
            <span>{n.label}</span>
          </a>
        ))}
        {showSettings && (
          <>
            <div style={{ height: 8 }} />
            <div className="sidebar-section-label" style={{ padding: '8px 12px 6px' }}>System</div>
            <a className={`sidebar-link ${active === 'settings' ? 'active' : ''}`}
              onClick={e => { e.preventDefault(); setActive('settings'); }} href="#">
              <Icon name="settings" size={17} /><span>Settings</span>
            </a>
          </>
        )}
      </nav>

      <div className="sidebar-user">
        <div className="avatar">{initials(staffName)}</div>
        <div className="who">
          <div className="name">{staffName}</div>
          <div className="role">{ROLE_LABEL_SHORT[staffRole] ?? staffRole}</div>
        </div>
        <button className="menu-btn" title="Logout" onClick={onLogout}>
          <Icon name="logout" size={16} />
        </button>
      </div>
    </aside>
  );
}

function Topbar({ meta, isDark, onToggleTheme, staffName, staffRole, onLogout }: {
  meta: { title: string; sub: string };
  isDark: boolean;
  onToggleTheme: () => void;
  staffName: string;
  staffRole: string;
  onLogout: () => void;
}) {
  return (
    <header className="topbar">
      <div>
        <div className="topbar-title">{meta.title}</div>
        <div className="topbar-sub">{meta.sub}</div>
      </div>
      <div className="topbar-search">
        <Icon name="search" size={14} />
        <input placeholder="Search…" />
        <span className="kbd">⌘K</span>
      </div>
      <button className="icon-btn" title="Theme" onClick={onToggleTheme}>
        <Icon name={isDark ? 'sun' : 'moon'} size={16} />
      </button>
      <div style={{ width: 1, height: 28, background: 'var(--border)' }} />
      <div className="row gap-sm">
        <div className="topbar-avatar">{initials(staffName)}</div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2 }}>{staffName}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.2 }}>
            {ROLE_LABEL_SHORT[staffRole] ?? staffRole}
          </span>
        </div>
        <button className="icon-btn" title="Logout" onClick={onLogout}>
          <Icon name="logout" size={16} />
        </button>
      </div>
    </header>
  );
}

function FullScreenSpinner() {
  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 36, height: 36, borderRadius: '50%',
        border: '3px solid var(--border)', borderTopColor: 'var(--color-primary)',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

function Shell() {
  const { staff, loading, logout } = useAuth();
  const [active, setActive] = useState<PageId>('dashboard');
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    if (staff) setActive(DEFAULT_PAGE_BY_ROLE[staff.role]);
  }, [staff]);

  const allowedNav = useMemo(() => staff ? NAV_BY_ROLE[staff.role] : [], [staff]);

  if (loading) return <FullScreenSpinner />;
  if (!staff) return <LoginScreen />;

  const meta = PAGE_META[active];

  const renderPage = () => {
    if (!canAccessPage(staff.role, active)) return <AccessDenied />;
    switch (active) {
      case 'dashboard':  return <DashboardPage />;
      case 'customers':  return <CustomersPage />;
      case 'billing':    return <BillingPage />;
      case 'complaints': return <ComplaintsPage />;
      case 'staff':      return <StaffPage />;
      case 'areas':      return <AreasPage />;
      case 'reports':    return <ReportsPage />;
      case 'settings':
        return (
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
        );
    }
  };

  return (
    <div className="app">
      <Sidebar active={active} setActive={setActive} allowedNav={allowedNav}
        staffName={staff.full_name} staffRole={staff.role} onLogout={logout} />
      <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <Topbar meta={meta} isDark={isDark} onToggleTheme={() => setIsDark(d => !d)}
          staffName={staff.full_name} staffRole={staff.role} onLogout={logout} />
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {renderPage()}
        </div>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
