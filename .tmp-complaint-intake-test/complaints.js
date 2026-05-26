"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.didComplaintStatusChange = didComplaintStatusChange;
exports.buildComplaintNotificationDedupeKey = buildComplaintNotificationDedupeKey;
exports.buildComplaintNotification = buildComplaintNotification;
// Detect whether a complaint realtime row warrants a notification.
function didComplaintStatusChange(oldRow, newRow) {
    if (!newRow?.id)
        return false;
    if (!newRow.status)
        return false;
    if (!oldRow && newRow.status === 'open')
        return true;
    if (oldRow && oldRow.status && oldRow.status === newRow.status)
        return false;
    return (newRow.status === 'open' ||
        newRow.status === 'in_progress' ||
        newRow.status === 'resolved');
}
function buildComplaintNotificationDedupeKey(input) {
    return `complaint:${input.complaintId}:${input.status}`;
}
function buildComplaintNotification(source) {
    const tech = source.technicianName ? ` by ${source.technicianName}` : '';
    let title = '';
    let message = '';
    let type = 'complaint_created';
    if (source.status === 'open') {
        title = 'New Customer Complaint';
        message = `${source.complaintCode} - ${source.customerName} - Awaiting assignment`;
    }
    else if (source.status === 'in_progress') {
        type = 'complaint_in_progress';
        title = 'Complaint In Progress';
        message = `${source.complaintCode} - ${source.customerName} - technician on-site${tech}`;
    }
    else {
        type = 'complaint_resolved';
        title = 'Complaint Resolved';
        message = `${source.complaintCode} - ${source.customerName} - resolved${tech}`;
    }
    const dedupeKey = buildComplaintNotificationDedupeKey({
        complaintId: source.complaintId,
        status: source.status,
    });
    return {
        id: `${dedupeKey}:${source.updatedAt ?? Date.now()}`,
        dedupeKey,
        kind: 'complaint',
        type,
        complaintId: source.complaintId,
        complaintCode: source.complaintCode,
        customerName: source.customerName,
        technicianName: source.technicianName,
        priority: source.priority ?? 'medium',
        status: source.status,
        createdAt: source.updatedAt ?? new Date().toISOString(),
        read: false,
        title,
        message,
    };
}
