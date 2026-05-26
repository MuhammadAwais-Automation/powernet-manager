"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildCustomerSignupNotification = buildCustomerSignupNotification;
function buildCustomerSignupNotification(source) {
    const area = source.areaName ? ` in ${source.areaName}` : '';
    const plan = source.packageName ? ` for ${source.packageName}` : '';
    const dedupeKey = `customer-signup:${source.requestId}`;
    return {
        id: `${dedupeKey}:${source.createdAt ?? Date.now()}`,
        dedupeKey,
        kind: 'customer_signup',
        type: 'customer_signup_pending',
        requestId: source.requestId,
        customerName: source.customerName,
        houseId: source.houseId,
        areaName: source.areaName,
        packageName: source.packageName,
        createdAt: source.createdAt ?? new Date().toISOString(),
        read: false,
        title: 'New customer signup',
        message: `${source.customerName} submitted house ID ${source.houseId}${area}${plan}`,
    };
}
