'use client';
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Icon from './Icon';
import DashboardPage from './pages/DashboardPage';
import CustomersPage from './pages/CustomersPage';
import CustomerRequestsPage from './pages/CustomerRequestsPage';
import PaymentApprovalsPage from './pages/PaymentApprovalsPage';
import BillingPage from './pages/BillingPage';
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

import { supabase } from '@/lib/supabase';

type NotificationFocus =
  | { page: 'billing'; id: string; requestId: number }
  | { page: 'complaints'; id: string; requestId: number }
  | { page: 'customer_requests'; id: string; requestId: number }

const ALL_NAV: { id: PageId; label: string; icon: string }[] = [
  { id: 'dashboard',  label: 'Dashboard',          icon: 'grid' },
  { id: 'customers',  label: 'Customers',          icon: 'users' },
  { id: 'customer_requests', label: 'Customer Requests', icon: 'fileText' },
  { id: 'payment_approvals', label: 'Payment Approvals', icon: 'check' },
  { id: 'billing',    label: 'Billing & Payments', icon: 'card' },
  { id: 'complaints', label: 'Complaints',         icon: 'alert' },
  { id: 'staff',      label: 'Staff Management',   icon: 'briefcase' },
  { id: 'areas',      label: 'Areas & Sectors',    icon: 'pin' },
  { id: 'reports',    label: 'Reports',            icon: 'chart' },
];

const PAGE_META: Record<PageId, { title: string; sub: string }> = {
  dashboard:  { title: 'Dashboard',          sub: 'Overview of network operations' },
  customers:  { title: 'Customers',          sub: 'Subscribers across service areas' },
  customer_requests: { title: 'Customer Requests', sub: 'New signup approvals and account activation' },
  payment_approvals: { title: 'Payment Approvals', sub: 'Review customer-uploaded receipts and verify payments' },
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

function Sidebar({ active, setActive, allowedNav, staffName, staffRole, onLogout, badges }: {
  active: PageId;
  setActive: (id: PageId) => void;
  allowedNav: PageId[];
  staffName: string;
  staffRole: string;
  onLogout: () => void;
  badges: Record<string, number>;
}) {
  const visibleMain = ALL_NAV.filter(n => allowedNav.includes(n.id));
  const showSettings = allowedNav.includes('settings');
  return (
    <aside className="sidebar">
      <div className="sidebar-brand" style={{ paddingLeft: 4 }}>
        <div>
          <div style={{ fontSize: 24, lineHeight: 1.1 }}>
            <span style={{ fontWeight: 900, color: 'var(--text)', letterSpacing: '-0.03em' }}>POWER</span>
            <span style={{ fontWeight: 900, color: 'var(--brand)', letterSpacing: '-0.03em' }}>NET</span>
          </div>
          <span className="title-sub" style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginTop: 3, display: 'block' }}>ISP Solution</span>
        </div>
      </div>

      <div className="sidebar-section-label">Main</div>
      <nav className="sidebar-nav">
        {visibleMain.map(n => {
          const badgeVal = badges[n.id];
          return (
            <button key={n.id} type="button" className={`sidebar-link ${active === n.id ? 'active' : ''}`}
              onClick={() => setActive(n.id)}>
              <Icon name={n.icon as 'grid' | 'users' | 'fileText' | 'card' | 'alert' | 'briefcase' | 'pin' | 'chart' | 'check'} size={17} />
              <span>{n.label}</span>
              {badgeVal && badgeVal > 0 ? <span className="count">{badgeVal}</span> : null}
            </button>
          );
        })}
        {showSettings && (
          <>
            <div style={{ height: 8 }} />
            <div className="sidebar-section-label" style={{ padding: '8px 12px 6px' }}>System</div>
            <button type="button" className={`sidebar-link ${active === 'settings' ? 'active' : ''}`}
              onClick={() => setActive('settings')}>
              <Icon name="settings" size={17} /><span>Settings</span>
            </button>
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
        <input placeholder="Search…" />
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

  // Load theme from localStorage on mount
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

  // Track counts
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

  // Calculate unread counts
  const unreadBilling = useMemo(() => {
    return items.filter(item => item.kind === 'billing' && !item.read).length;
  }, [items]);

  const unreadComplaints = useMemo(() => {
    return items.filter(item => item.kind === 'complaint' && !item.read).length;
  }, [items]);

  // Mark page kind notifications as read when active
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
        <Topbar meta={meta} isDark={isDark} onToggleTheme={handleToggleTheme}
        />
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {!canAccessPage(staff.role, active) ? <AccessDenied /> : (
            <>
              {canAccessPage(staff.role, 'dashboard') && (
                <div style={{ display: active === 'dashboard' ? 'contents' : 'none' }}>
                  <DashboardPage refreshToken={dashboardRefreshToken} />
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
              {canAccessPage(staff.role, 'complaints') && (
                <div style={{ display: active === 'complaints' ? 'contents' : 'none' }}>
                  <ComplaintsPage
                    refreshToken={complaintsVersion}
                    focusComplaintId={notificationFocus?.page === 'complaints' ? notificationFocus.id : null}
                    focusToken={notificationFocus?.page === 'complaints' ? notificationFocus.requestId : 0}
                  />
                </div>
              )}
              {canAccessPage(staff.role, 'staff') && (
                <div style={{ display: active === 'staff' ? 'contents' : 'none' }}>
                  <StaffPage />
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
