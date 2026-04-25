import type { StaffRole } from '@/types/database'

export type PageId =
  | 'dashboard'
  | 'customers'
  | 'billing'
  | 'complaints'
  | 'staff'
  | 'areas'
  | 'reports'
  | 'settings'

export const NAV_BY_ROLE: Record<StaffRole, PageId[]> = {
  admin:             ['dashboard', 'customers', 'billing', 'complaints', 'staff', 'areas', 'reports', 'settings'],
  complaint_manager: ['complaints', 'customers'],
  technician:        [],
  recovery_agent:    [],
  helper:            [],
}

export const DEFAULT_PAGE_BY_ROLE: Record<StaffRole, PageId> = {
  admin:             'dashboard',
  complaint_manager: 'complaints',
  technician:        'dashboard',
  recovery_agent:    'dashboard',
  helper:            'dashboard',
}

export function canAccessPage(role: StaffRole, page: PageId): boolean {
  return NAV_BY_ROLE[role].includes(page)
}

export const DASHBOARD_ROLES: StaffRole[] = ['admin', 'complaint_manager']

export function isDashboardRole(role: StaffRole): boolean {
  return DASHBOARD_ROLES.includes(role)
}
