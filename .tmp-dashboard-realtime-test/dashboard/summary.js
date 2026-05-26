"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDashboardRefreshToken = getDashboardRefreshToken;
exports.normalizeDashboardStats = normalizeDashboardStats;
function toNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
function getDashboardRefreshToken(billingVersion, complaintsVersion) {
    return toNumber(billingVersion) + toNumber(complaintsVersion);
}
function normalizeDashboardStats(input) {
    const source = (input && typeof input === 'object') ? input : {};
    const complaintsByStatus = (source.complaintsByStatus && typeof source.complaintsByStatus === 'object'
        ? source.complaintsByStatus
        : {});
    const revenueByMonth = Array.isArray(source.revenueByMonth)
        ? source.revenueByMonth
            .map(point => {
            const row = (point && typeof point === 'object') ? point : {};
            return {
                m: typeof row.m === 'string' ? row.m : '',
                v: toNumber(row.v),
            };
        })
            .filter(point => point.m.length > 0)
        : [];
    return {
        totalCustomers: toNumber(source.totalCustomers),
        activeCustomers: toNumber(source.activeCustomers),
        unpaidBills: toNumber(source.unpaidBills),
        openComplaints: toNumber(source.openComplaints),
        monthlyRevenue: toNumber(source.monthlyRevenue),
        activeStaff: toNumber(source.activeStaff),
        revenueByMonth,
        complaintsByStatus: {
            open: toNumber(complaintsByStatus.open),
            in_progress: toNumber(complaintsByStatus.in_progress),
            resolved: toNumber(complaintsByStatus.resolved),
        },
    };
}
