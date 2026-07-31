import type { Staff, StaffRole } from '@/types/database'

export type PageId =
  | 'dashboard'
  | 'customers'
  | 'customer_requests'
  | 'payment_approvals'
  | 'billing'
  | 'cable'
  | 'complaints'
  | 'staff'
  | 'areas'
  | 'reports'
  | 'settings'

export const ALL_PAGE_IDS: PageId[] = [
  'dashboard',
  'customers',
  'customer_requests',
  'payment_approvals',
  'billing',
  'cable',
  'complaints',
  'staff',
  'areas',
  'reports',
  'settings',
]

export const PAGE_LABELS: Record<PageId, string> = {
  dashboard: 'Dashboard',
  customers: 'Customers',
  customer_requests: 'Customer Requests',
  payment_approvals: 'Payment Approvals',
  billing: 'Billing & Payments',
  cable: 'Cable',
  complaints: 'Complaints',
  staff: 'Staff Management',
  areas: 'Areas & Packages',
  reports: 'Reports',
  settings: 'Settings',
}

/** Role defaults when allowed_pages is null/empty. */
export const NAV_BY_ROLE: Record<StaffRole, PageId[]> = {
  admin:             [...ALL_PAGE_IDS],
  complaint_manager: ['complaints', 'customers'],
  technician:        [],
  cable_technician:  [],
  recovery_agent:    [],
  helper:            [],
}

export const DEFAULT_PAGE_BY_ROLE: Record<StaffRole, PageId> = {
  admin:             'dashboard',
  complaint_manager: 'complaints',
  technician:        'dashboard',
  cable_technician:  'dashboard',
  recovery_agent:    'dashboard',
  helper:            'dashboard',
}

export const DASHBOARD_ROLES: StaffRole[] = ['admin', 'complaint_manager']

export function isDashboardRole(role: StaffRole): boolean {
  return DASHBOARD_ROLES.includes(role)
}

export const VALID_PAGE_IDS = new Set<string>(ALL_PAGE_IDS)

export function sanitizeAllowedPages(pages: unknown): PageId[] {
  if (!Array.isArray(pages)) return []
  return pages.filter((p): p is PageId => typeof p === 'string' && VALID_PAGE_IDS.has(p))
}

/** Pages this staff member may open in the dashboard. */
export function getAllowedPages(staff: Pick<Staff, 'role' | 'allowed_pages'>): PageId[] {
  if (staff.role === 'admin') return [...ALL_PAGE_IDS]
  const custom = sanitizeAllowedPages(staff.allowed_pages)
  if (custom.length > 0) return custom
  return [...NAV_BY_ROLE[staff.role]]
}

export function canAccessPage(
  staffOrRole: Pick<Staff, 'role' | 'allowed_pages'> | StaffRole,
  page: PageId,
): boolean {
  if (typeof staffOrRole === 'string') {
    return NAV_BY_ROLE[staffOrRole].includes(page)
  }
  return getAllowedPages(staffOrRole).includes(page)
}

export function defaultPageForStaff(staff: Pick<Staff, 'role' | 'allowed_pages'>): PageId {
  const allowed = getAllowedPages(staff)
  const preferred = DEFAULT_PAGE_BY_ROLE[staff.role]
  if (allowed.includes(preferred)) return preferred
  return allowed[0] ?? 'dashboard'
}
