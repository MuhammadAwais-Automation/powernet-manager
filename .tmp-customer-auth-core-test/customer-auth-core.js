"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CUSTOMER_AUTH_DOMAIN = void 0;
exports.normalizeCustomerAuthIdentifier = normalizeCustomerAuthIdentifier;
exports.makeCustomerAuthEmail = makeCustomerAuthEmail;
exports.pickCustomerLoginIdentifier = pickCustomerLoginIdentifier;
exports.validateCustomerTemporaryPassword = validateCustomerTemporaryPassword;
exports.CUSTOMER_AUTH_DOMAIN = '@powernet.local';
function normalizeCustomerAuthIdentifier(value) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');
}
function makeCustomerAuthEmail(identifier) {
    const normalized = normalizeCustomerAuthIdentifier(identifier);
    if (!normalized)
        throw new Error('Invalid customer login ID');
    return `customer_${normalized}${exports.CUSTOMER_AUTH_DOMAIN}`;
}
function pickCustomerLoginIdentifier(customer) {
    const candidates = [
        customer.house_id,
        customer.username,
        customer.address_value,
        customer.customer_code,
    ];
    const found = candidates.find(value => typeof value === 'string' && value.trim().length > 0);
    return found?.trim() ?? null;
}
function validateCustomerTemporaryPassword(password) {
    if (typeof password !== 'string' || password.length < 8)
        return 'Temporary password must be at least 8 characters';
    if (password.length > 72)
        return 'Temporary password is too long';
    return null;
}
