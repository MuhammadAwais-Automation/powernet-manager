'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Icon, { type IconName } from './Icon';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import CustomerRequestsPage from './pages/CustomerRequestsPage';
import PaymentApprovalsPage from './pages/PaymentApprovalsPage';
import BillingPage from './pages/BillingPage';
import CablePage from './pages/CablePage';
import ComplaintsPage from './pages/ComplaintsPage';
import StaffPage from './pages/StaffPage';
import AreasPage from './pages/AreasPage';
import ReportsPage from './pages/ReportsPage';
import SettingsPage from './pages/SettingsPage';
import LoginScreen from './auth/LoginScreen';
import AccessDenied from './auth/AccessDenied';
import { NotificationBell, NotificationDrawer } from './notifications/NotificationCenter'
import { PaymentToastContainer } from './notifications/PaymentToast';
import { AuthProvider, useAuth } from '@/lib/auth/auth-context';
import { NotificationsProvider, useNotifications } from '@/lib/notifications/notifications-context';
import { getDashboardRefreshToken } from '@/lib/dashboard/summary';
import { getNotificationNavigationTarget } from '@/lib/notifications/navigation';
import { NAV_BY_ROLE, DEFAULT_PAGE_BY_ROLE, canAccessPage, VALID_PAGE_IDS, type PageId } from '@/lib/auth/permissions';
import { initials } from '@/lib/utils';
import type { Staff } from '@/types/database';
import { globalSearch, type SearchResult } from '@/lib/search';
import { Drawer } from './ui';

import { supabase } from '@/lib/supabase';

type NotificationFocus =
  | { page: 'billing'; id: string; requestId: number }
  | { page: 'complaints'; id: string; requestId: number }
  | { page: 'customer_requests'; id: string; requestId: number }

type NavEntry = { id: PageId; label: string; icon: IconName };

const NAV_BY_ID: Record<PageId, NavEntry> = {
  dashboard:  { id: 'dashboard',  label: 'Dashboard',          icon: 'grid' },
  customers:  { id: 'customers',  label: 'Customers',          icon: 'users' },
  customer_requests: { id: 'customer_requests', label: 'Customer Requests', icon: 'fileText' },
  payment_approvals: { id: 'payment_approvals', label: 'Payment Approvals', icon: 'cash' },
  billing:    { id: 'billing',    label: 'Billing & Payments', icon: 'card' },
  cable:      { id: 'cable',      label: 'Cable',              icon: 'tv' },
  complaints: { id: 'complaints', label: 'Complaints',         icon: 'alert' },
  staff:      { id: 'staff',      label: 'Staff Management',   icon: 'briefcase' },
  areas:      { id: 'areas',      label: 'Areas & Sectors',    icon: 'pin' },
  reports:    { id: 'reports',    label: 'Reports',            icon: 'chart' },
  settings:   { id: 'settings',   label: 'Settings',           icon: 'settings' },
};

const NAV_GROUPS: { label: string; items: PageId[] }[] = [
  { label: 'Operations', items: ['dashboard', 'customers', 'customer_requests', 'payment_approvals', 'billing', 'cable', 'complaints', 'staff'] },
  { label: 'Analytics', items: ['areas', 'reports'] },
];

const PAGE_META: Record<PageId, { title: string; sub: string }> = {
  dashboard:  { title: 'Dashboard',          sub: 'Overview of network operations' },
  customers:  { title: 'Customers',          sub: 'Subscribers across service areas' },
  customer_requests: { title: 'Customer Requests', sub: 'New signup approvals and account activation' },
  payment_approvals: { title: 'Payment Approvals', sub: 'Review customer-uploaded receipts and verify payments' },
  billing:    { title: 'Billing & Payments', sub: 'Monthly billing & collections' },
  cable:      { title: 'Cable',              sub: 'Cable subscribers and monthly collections' },
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

function NavLinks({ active, setActive, allowedNav, badges, onNavigate }: {
  active: PageId;
  setActive: (id: PageId) => void;
  allowedNav: PageId[];
  badges: Record<string, number>;
  onNavigate?: () => void;
}) {
  const handleClick = (id: PageId) => {
    setActive(id);
    onNavigate?.();
  };

  return (
    <>
      {NAV_GROUPS.map((group) => {
        const items = group.items
          .map((id) => NAV_BY_ID[id])
          .filter((n) => allowedNav.includes(n.id));
        if (items.length === 0) return null;
        return (
          <React.Fragment key={group.label}>
            <div className="sidebar-section-label">{group.label}</div>
            {items.map((n) => {
              const badgeVal = badges[n.id];
              return (
                <button
                  key={n.id}
                  type="button"
                  className={`sidebar-link ${active === n.id ? 'active' : ''}`}
                  aria-current={active === n.id ? 'page' : undefined}
                  onClick={() => handleClick(n.id)}
                >
                  <Icon name={n.icon} size={17} />
                  <span className="sidebar-link-label">{n.label}</span>
                  {badgeVal && badgeVal > 0 ? <span className="count">{badgeVal}</span> : null}
                </button>
              );
            })}
          </React.Fragment>
        );
      })}
      {allowedNav.includes('settings') && (
        <>
          <div className="sidebar-divider" role="separator" />
          <button
            type="button"
            className={`sidebar-link ${active === 'settings' ? 'active' : ''}`}
            aria-current={active === 'settings' ? 'page' : undefined}
            onClick={() => handleClick('settings')}
          >
            <Icon name="settings" size={17} />
            <span className="sidebar-link-label">Settings</span>
          </button>
        </>
      )}
    </>
  );
}

function SidebarBrand() {
  return (
    <div className="sidebar-brand">
      <span className="bolt" aria-hidden="true">
        <Icon name="zap" size={18} />
      </span>
      <div>
        <div className="sidebar-brand-title">
          <span className="power">POWER</span>
          <span className="net">NET</span>
        </div>
        <span className="title-sub">ISP Solution</span>
      </div>
    </div>
  );
}

function SidebarUser({ staffName, staffRole, onLogout }: {
  staffName: string;
  staffRole: string;
  onLogout: () => void;
}) {
  return (
    <div className="sidebar-user">
      <div className="avatar">{initials(staffName)}</div>
      <div className="who">
        <div className="name">{staffName}</div>
        <div className="role">{ROLE_LABEL_SHORT[staffRole] ?? staffRole}</div>
      </div>
      <button type="button" className="sidebar-logout" aria-label="Sign out" onClick={onLogout}>
        <Icon name="logout" size={15} />
        <span>Sign out</span>
      </button>
    </div>
  );
}

function Sidebar({ active, setActive, allowedNav, staffName, staffRole, onLogout, badges }: {
  active: PageId;
  setActive: (id: PageId) => void;
  allowedNav: PageId[];
  staffName: string;
  staffRole: string;
  onLogout: () => void;
  badges: Record<string, number>;
}) {
  return (
    <aside className="sidebar">
      <SidebarBrand />
      <nav className="sidebar-nav" aria-label="Main navigation">
        <NavLinks active={active} setActive={setActive} allowedNav={allowedNav} badges={badges} />
      </nav>
      <SidebarUser staffName={staffName} staffRole={staffRole} onLogout={onLogout} />
    </aside>
  );
}

function Topbar({ meta, isDark, onToggleTheme, searchValue, onSearchChange, onSearchFocus, onOpenMobileNav }: {
  meta: { title: string; sub: string };
  isDark: boolean;
  onToggleTheme: () => void;
  searchValue?: string;
  onSearchChange?: (v: string) => void;
  onSearchFocus?: () => void;
  onOpenMobileNav?: () => void;
}) {
  return (
    <header className="topbar">
      <button
        type="button"
        className="icon-btn mobile-nav-btn"
        title="Menu"
        onClick={onOpenMobileNav}
        aria-label="Open navigation menu"
      >
        <Icon name="menu" size={18} />
      </button>
      <div>
        <div className="topbar-title">{meta.title}</div>
        <div className="topbar-sub">{meta.sub}</div>
      </div>
      <div className="topbar-search">
        <Icon name="search" size={14} />
        <input
          placeholder="Search customers, bills, complaints…  ⌘K"
          value={searchValue || ''}
          onChange={(e) => onSearchChange?.(e.target.value)}
          onFocus={() => onSearchFocus?.()}
        />
        <span className="kbd">⌘K</span>
      </div>
      <div className="topbar-actions">
        <NotificationBell />
        <button className="icon-btn" title="Theme" onClick={onToggleTheme}>
          <Icon name={isDark ? 'sun' : 'moon'} size={16} />
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

function ShellContent({ staff, logout }: {
  staff: Staff;
  logout: () => void;
}) {
  const [active, setActive] = useState<PageId>(() => {
    try {
      const saved = sessionStorage.getItem('powernet_current_page');
      if (saved && VALID_PAGE_IDS.has(saved)) return saved as PageId;
    } catch { /* SSR / private browsing guard */ }
    return 'dashboard';
  });
  const [isDark, setIsDark] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationFocus, setNotificationFocus] = useState<NotificationFocus | null>(null);
  
  const {
    billingVersion,
    complaintsVersion,
    customerRequestsVersion,
    paymentVerificationsVersion,
    items,
    markKindRead,
  } = useNotifications();

  const [pendingVerifications, setPendingVerifications] = useState(0);
  const [pendingCustomerRequests, setPendingCustomerRequests] = useState(0);
  const [staffCatalogVersion, setStaffCatalogVersion] = useState(0);
  const bumpStaffCatalog = useCallback(() => {
    setStaffCatalogVersion((v) => v + 1);
  }, []);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    try {
      const savedTheme = localStorage.getItem('powernet_theme');
      if (savedTheme === 'dark') {
        setIsDark(true);
      }
    } catch (e) {
      /* ignore */
    }
  }, []);

  const handleToggleTheme = useCallback(() => {
    setIsDark((d) => {
      const next = !d;
      try {
        localStorage.setItem('powernet_theme', next ? 'dark' : 'light');
      } catch (e) {
        /* ignore */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    supabase
      .from('payment_verifications')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => {
        setPendingVerifications(count ?? 0);
      });
  }, [paymentVerificationsVersion]);

  useEffect(() => {
    supabase
      .from('customer_signup_requests')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending')
      .then(({ count }) => {
        setPendingCustomerRequests(count ?? 0);
      });
  }, [customerRequestsVersion]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) {
      setSearchResults([]);
      setSearchOpen(false);
      return;
    }
    setSearchLoading(true);
    const t = window.setTimeout(() => {
      globalSearch(q, 10)
        .then((res) => {
          setSearchResults(res);
          setSearchOpen(true);
        })
        .catch(() => {})
        .finally(() => setSearchLoading(false));
    }, 160);
    return () => window.clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        const inp = document.querySelector<HTMLInputElement>('.topbar-search input');
        if (inp) {
          inp.focus();
          inp.select();
        }
      }
      if (e.key === 'Escape' && searchOpen) {
        setSearchOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [searchOpen]);

  const unreadBilling = useMemo(() => {
    return items.filter(item => item.kind === 'billing' && !item.read).length;
  }, [items]);

  const unreadComplaints = useMemo(() => {
    return items.filter(item => item.kind === 'complaint' && !item.read).length;
  }, [items]);

  useEffect(() => {
    if (active === 'billing') {
      markKindRead('billing');
    } else if (active === 'complaints') {
      markKindRead('complaint');
    } else if (active === 'customer_requests') {
      markKindRead('customer_signup');
    } else if (active === 'payment_approvals') {
      markKindRead('payment_verification');
    }
  }, [active, markKindRead]);

  const badges = useMemo(() => ({
    customer_requests: pendingCustomerRequests,
    payment_approvals: pendingVerifications,
    billing: unreadBilling,
    complaints: unreadComplaints,
  }), [pendingCustomerRequests, pendingVerifications, unreadBilling, unreadComplaints]);

  const handlePageChange = useCallback((page: PageId) => {
    setActive(page);
    try { sessionStorage.setItem('powernet_current_page', page); } catch { /* SSR guard */ }
  }, []);

  const handleSearchResult = useCallback((r: SearchResult) => {
    setSearchOpen(false);
    setSearchQuery('');
    handlePageChange(r.page as PageId);
    if (r.focusId) {
      if (r.page === 'billing') {
        setNotificationFocus({ page: 'billing', id: r.focusId, requestId: ((Date.now() % 100000) + 1) });
      } else if (r.page === 'complaints') {
        setNotificationFocus({ page: 'complaints', id: r.focusId, requestId: ((Date.now() % 100000) + 1) });
      }
    }
  }, [handlePageChange]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  useEffect(() => {
    if (!staff) return;
    try {
      const saved = sessionStorage.getItem('powernet_current_page');
      if (saved && VALID_PAGE_IDS.has(saved) && canAccessPage(staff.role, saved as PageId)) return;
    } catch { /* SSR guard */ }
    handlePageChange(DEFAULT_PAGE_BY_ROLE[staff.role]);
  }, [staff, handlePageChange]);

  const allowedNav = useMemo(() => staff ? NAV_BY_ROLE[staff.role] : [], [staff]);
  const dashboardRefreshToken = getDashboardRefreshToken(billingVersion, complaintsVersion);

  const meta = PAGE_META[active];

  const handleNotificationOpen = useCallback((item: unknown) => {
    const target = getNotificationNavigationTarget(item);
    if (!target || !canAccessPage(staff.role, target.page)) return;

    handlePageChange(target.page);
    setNotificationFocus(current => {
      const id = target.page === 'billing'
        ? target.billId
        : target.page === 'complaints'
          ? target.complaintId
          : target.requestId;
      return {
        page: target.page,
        id,
        requestId: (current?.requestId ?? 0) + 1,
      };
    });
  }, [handlePageChange, staff.role]);

  return (
    <div className="app">
      <Sidebar active={active} setActive={handlePageChange} allowedNav={allowedNav}
        staffName={staff.full_name} staffRole={staff.role} onLogout={logout} badges={badges} />
      <main style={{ minWidth: 0, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
        <Topbar
          meta={meta}
          isDark={isDark}
          onToggleTheme={handleToggleTheme}
          searchValue={searchQuery}
          onSearchChange={setSearchQuery}
          onSearchFocus={() => { if (searchResults.length > 0) setSearchOpen(true); }}
          onOpenMobileNav={() => setMobileNavOpen(true)}
        />
        {searchOpen && searchResults.length > 0 && (
          <div
            className="global-search-dropdown"
            style={{
              position: 'absolute',
              left: 220,
              top: 58,
              zIndex: 200,
              minWidth: 420,
              maxWidth: 520,
              background: 'var(--bg-elev)',
              border: '1px solid var(--border)',
              borderRadius: 10,
              boxShadow: 'var(--shadow)',
              overflow: 'hidden',
            }}
          >
            <div style={{ padding: '6px 10px', fontSize: 11, color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Results for “{searchQuery}” {searchLoading ? '…' : ''}</span>
              <button onClick={() => setSearchOpen(false)} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}>Esc</button>
            </div>
            {searchResults.map((r) => (
              <button
                key={`${r.kind}:${r.id}`}
                type="button"
                onClick={() => handleSearchResult(r)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '8px 10px',
                  display: 'flex',
                  gap: 8,
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--bg-muted)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 4, background: 'var(--bg-muted)', color: 'var(--text-muted)', alignSelf: 'flex-start', marginTop: 2, textTransform: 'uppercase' }}>{r.kind}</span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontWeight: 600, color: 'var(--text)', fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.subtitle}</div>
                </div>
                {r.meta && <span style={{ fontSize: 11, color: 'var(--text-faint)', marginLeft: 'auto', alignSelf: 'center' }}>{r.meta}</span>}
              </button>
            ))}
            <div style={{ padding: 6, fontSize: 10, color: 'var(--text-faint)', textAlign: 'center' }}>Click to open • ⌘K focus</div>
          </div>
        )}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {!canAccessPage(staff.role, active) ? <AccessDenied /> : (
            <>
              {canAccessPage(staff.role, 'dashboard') && (
                <div style={{ display: active === 'dashboard' ? 'contents' : 'none' }}>
                  <DashboardPage refreshToken={dashboardRefreshToken} onNavigate={handlePageChange} />
                </div>
              )}
              {canAccessPage(staff.role, 'customers') && (
                <div style={{ display: active === 'customers' ? 'contents' : 'none' }}>
                  <CustomersPage />
                </div>
              )}
              {canAccessPage(staff.role, 'customer_requests') && (
                <div style={{ display: active === 'customer_requests' ? 'contents' : 'none' }}>
                  <CustomerRequestsPage
                    refreshToken={customerRequestsVersion}
                    focusRequestId={notificationFocus?.page === 'customer_requests' ? notificationFocus.id : null}
                    focusToken={notificationFocus?.page === 'customer_requests' ? notificationFocus.requestId : 0}
                  />
                </div>
              )}              {canAccessPage(staff.role, 'payment_approvals') && (
                <div style={{ display: active === 'payment_approvals' ? 'contents' : 'none' }}>
                  <PaymentApprovalsPage
                    staffId={staff.id}
                    staffRole={staff.role}
                  />
                </div>
              )}

              {canAccessPage(staff.role, 'billing') && (
                <div style={{ display: active === 'billing' ? 'contents' : 'none' }}>
                  <BillingPage
                    staff={staff}
                    refreshToken={billingVersion}
                    focusBillId={notificationFocus?.page === 'billing' ? notificationFocus.id : null}
                    focusToken={notificationFocus?.page === 'billing' ? notificationFocus.requestId : 0}
                  />
                </div>
              )}
              {canAccessPage(staff.role, 'cable') && (
                <div style={{ display: active === 'cable' ? 'contents' : 'none' }}>
                  <CablePage staff={staff} />
                </div>
              )}
              {canAccessPage(staff.role, 'complaints') && (
                <div style={{ display: active === 'complaints' ? 'contents' : 'none' }}>
                  <ComplaintsPage
                    refreshToken={complaintsVersion}
                    staffRefreshToken={staffCatalogVersion}
                    isActive={active === 'complaints'}
                    focusComplaintId={notificationFocus?.page === 'complaints' ? notificationFocus.id : null}
                    focusToken={notificationFocus?.page === 'complaints' ? notificationFocus.requestId : 0}
                  />
                </div>
              )}
              {canAccessPage(staff.role, 'staff') && (
                <div style={{ display: active === 'staff' ? 'contents' : 'none' }}>
                  <StaffPage onCatalogChange={bumpStaffCatalog} />
                </div>
              )}
              {canAccessPage(staff.role, 'areas') && (
                <div style={{ display: active === 'areas' ? 'contents' : 'none' }}>
                  <AreasPage />
                </div>
              )}
              {canAccessPage(staff.role, 'reports') && (
                <div style={{ display: active === 'reports' ? 'contents' : 'none' }}>
                  <ReportsPage />
                </div>
              )}
              {canAccessPage(staff.role, 'settings') && (
                <div style={{ display: active === 'settings' ? 'contents' : 'none' }}>
                  <SettingsPage />
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Drawer open={mobileNavOpen} onClose={() => setMobileNavOpen(false)} width={280}>
        <div className="drawer-nav-shell">
          <SidebarBrand />
          <nav className="sidebar-nav drawer-nav-scroll" aria-label="Main navigation">
            <NavLinks
              active={active}
              setActive={handlePageChange}
              allowedNav={allowedNav}
              badges={badges}
              onNavigate={() => setMobileNavOpen(false)}
            />
          </nav>
          <SidebarUser staffName={staff.full_name} staffRole={staff.role} onLogout={logout} />
        </div>
      </Drawer>
      <NotificationDrawer onOpenNotification={handleNotificationOpen} />
      <PaymentToastContainer onOpenNotification={handleNotificationOpen} />
    </div>
  );
}

function Shell() {
  const { staff, loading, logout } = useAuth();

  if (loading) return <FullScreenSpinner />;
  if (!staff) return <LoginScreen />;

  return (
    <NotificationsProvider>
      <ShellContent staff={staff} logout={logout} />
    </NotificationsProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
