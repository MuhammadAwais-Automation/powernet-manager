"use client";
import React, { useState, useEffect } from "react";
import Icon from "../Icon";
import { Badge, Avatar, Modal, Tabs } from "../ui";
import {
  getComplaintById,
  getComplaints,
  createComplaint,
  updateComplaint,
} from "@/lib/db/complaints";
import { getAreas } from "@/lib/db/areas";
import { getStaff } from "@/lib/db/staff";
import { getTeams } from "@/lib/db/teams";
import { searchCustomers, type CustomerSearchResult } from "@/lib/db/customers";
import type {
  ComplaintWithRelations,
  Area,
  StaffWithArea,
  ComplaintType,
  ComplaintPriority,
  ComplaintStatus,
  TeamWithMembers,
} from "@/types/database";
import { COMPLAINT_TYPES, CABLE_COMPLAINT_TYPES, ALL_COMPLAINT_TYPES, formatComplaintType, getComplaintServiceLine, assignableTechnicianRoles, formatServiceLine } from "@/lib/complaints/types";

const ROLE_SHORT: Record<string, string> = {
  technician: "Internet Tech",
  cable_technician: "Cable Tech",
};

function complaintLine(c: Pick<ComplaintWithRelations, "type" | "service_line">): "internet" | "cable" {
  return c.service_line ?? getComplaintServiceLine(c.type);
}

function LogComplaintModal({
  onClose,
  staff,
  teams,
  onSaved,
}: {
  onClose: () => void;
  staff: StaffWithArea[];
  teams: TeamWithMembers[];
  onSaved: (c: ComplaintWithRelations) => void;
}) {
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerResults, setCustomerResults] = useState<
    CustomerSearchResult[]
  >([]);
  const [selectedCustomer, setSelectedCustomer] =
    useState<CustomerSearchResult | null>(null);
  const [form, setForm] = useState({
    issue: "",
    type: "fiber_issue" as ComplaintType,
    priority: "medium" as ComplaintPriority,
    assigned_to: "", // Holds "staff:ID" or "team:ID"
    status: "open" as ComplaintStatus,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (customerSearch.length < 2) {
      setCustomerResults([]);
      return;
    }
    const t = setTimeout(() => {
      searchCustomers(customerSearch, 8).then(setCustomerResults);
    }, 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const assignRoles = assignableTechnicianRoles();

  const handleSubmit = async () => {
    if (!selectedCustomer) {
      setError("Select a customer");
      return;
    }
    if (!form.issue.trim()) {
      setError("Issue description required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let assignedToId: string | null = null;
      let teamId: string | null = null;
      if (form.assigned_to.startsWith("staff:")) {
        assignedToId = form.assigned_to.substring(6);
      } else if (form.assigned_to.startsWith("team:")) {
        teamId = form.assigned_to.substring(5);
      }

      const serviceLine = getComplaintServiceLine(form.type);

      const created = await createComplaint({
        customer_id: selectedCustomer.id,
        issue: form.issue.trim(),
        type: form.type,
        service_line: serviceLine,
        priority: form.priority,
        status: form.status,
        assigned_to: assignedToId,
        assigned_at: assignedToId || teamId ? new Date().toISOString() : null,
        in_progress_at: null,
        team_id: teamId,
      });
      const withRelations: ComplaintWithRelations = {
        ...created,
        customer: {
          id: selectedCustomer.id,
          full_name: selectedCustomer.full_name,
          area_id: selectedCustomer.area_id,
          phone: selectedCustomer.phone,
          house_id: selectedCustomer.house_id,
          address_value: selectedCustomer.address_value,
          address_type: "text",
          whatsapp: null,
          email: null,
          area: selectedCustomer.area
            ? {
                id: selectedCustomer.area.id,
                name: selectedCustomer.area.name,
                code: "",
              }
            : null,
        },
        technician: assignedToId
          ? (staff.find((s) => s.id === assignedToId) ?? null)
          : null,
        team: teamId
          ? (teams.find((t) => t.id === teamId) ?? null)
          : null,
      };
      onSaved(withRelations);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to log complaint");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} width={520}>
      <div className="modal-head">
        <div>
          <div
            style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}
          >
            Log Complaint
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
            Search registered phone first, verify customer, then log complaint
          </div>
        </div>
        <button className="icon-btn" onClick={onClose}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="modal-body">
        {error && (
          <div
            style={{
              padding: "10px 14px",
              background: "var(--red-50)",
              color: "var(--red)",
              borderRadius: 8,
              marginBottom: 14,
              fontSize: 13,
            }}
          >
            {error}
          </div>
        )}

        <div
          className="field"
          style={{ marginBottom: 14, position: "relative" }}
        >
          <label>Customer *</label>
          {selectedCustomer ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "8px 12px",
                background: "var(--bg-muted)",
                borderRadius: 8,
                border: "1px solid var(--border)",
              }}
            >
              <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>
                {selectedCustomer.full_name}
              </span>
              <span className="mono muted" style={{ fontSize: 11 }}>
                {selectedCustomer.username ||
                  selectedCustomer.house_id ||
                  selectedCustomer.customer_code}
              </span>
              <button
                className="icon-btn"
                style={{ width: 22, height: 22 }}
                onClick={() => {
                  setSelectedCustomer(null);
                  setCustomerSearch("");
                }}
              >
                <Icon name="close" size={12} />
              </button>
            </div>
          ) : (
            <>
              <input
                className="input"
                placeholder="Search registered phone, name, or config ID"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                autoFocus
              />
              {customerResults.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    zIndex: 50,
                    background: "var(--bg-elev)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
                    overflow: "hidden",
                  }}
                >
                  {customerResults.map((c) => (
                    <div
                      key={c.id}
                      style={{
                        padding: "8px 14px",
                        cursor: "pointer",
                        fontSize: 13,
                        borderBottom: "1px solid var(--border)",
                      }}
                      onClick={() => {
                        setSelectedCustomer(c);
                        setCustomerResults([]);
                      }}
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.background = "var(--bg-muted)")
                      }
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.background = "")
                      }
                    >
                      <span style={{ fontWeight: 500 }}>{c.full_name}</span>
                      <span
                        className="mono muted"
                        style={{ fontSize: 11, marginLeft: 8 }}
                      >
                        {c.phone ?? c.username ?? c.house_id ?? c.customer_code}
                      </span>
                      <span
                        className="muted"
                        style={{ fontSize: 11, marginLeft: 8 }}
                      >
                        {c.area?.name ?? "—"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {selectedCustomer && (
          <div
            style={{
              padding: 12,
              background: "var(--bg-muted)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              marginBottom: 14,
            }}
          >
            <div
              className="muted"
              style={{
                fontSize: 10,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 700,
                marginBottom: 8,
              }}
            >
              Call Verification Details
            </div>
            <div className="grid-responsive-2" style={{ gap: 10 }}>
              <div>
                <div className="muted" style={{ fontSize: 11 }}>
                  Phone
                </div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                  {selectedCustomer.phone ?? "—"}
                </div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 11 }}>
                  Config / House ID
                </div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                  {selectedCustomer.username ||
                    selectedCustomer.house_id ||
                    "—"}
                </div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 11 }}>
                  Area
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {selectedCustomer.area?.name ?? "—"}
                </div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 11 }}>
                  Package / Status
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {selectedCustomer.package?.name ?? "—"} ·{" "}
                  {selectedCustomer.status}
                </div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 11 }}>
                  CNIC
                </div>
                <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>
                  {selectedCustomer.cnic ?? "—"}
                </div>
              </div>
              <div>
                <div className="muted" style={{ fontSize: 11 }}>
                  Address
                </div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>
                  {selectedCustomer.address_value ?? "—"}
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="field" style={{ marginBottom: 14 }}>
          <label>Issue Description *</label>
          <input
            className="input"
            placeholder="e.g. Frequent disconnections, slow speed at night…"
            value={form.issue}
            onChange={(e) => setForm((f) => ({ ...f, issue: e.target.value }))}
          />
        </div>

        <div className="grid-responsive-2" style={{ marginBottom: 14 }}>
          <div className="field">
            <label>Type</label>
            <select
              className="select"
              value={form.type}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  type: e.target.value as ComplaintType,
                  assigned_to: "",
                }))
              }
            >
              <optgroup label="Internet">
                {COMPLAINT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
              <optgroup label="Cable">
                {CABLE_COMPLAINT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </optgroup>
            </select>
          </div>
          <div className="field">
            <label>Priority</label>
            <select
              className="select"
              value={form.priority}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  priority: e.target.value as ComplaintPriority,
                }))
              }
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
        </div>

        <div className="field" style={{ marginBottom: 14 }}>
          <label>Assign to Technician or Team (optional)</label>
          <select
            className="select"
            value={form.assigned_to}
            onChange={(e) =>
              setForm((f) => ({ ...f, assigned_to: e.target.value }))
            }
          >
            <option value="">— Unassigned —</option>
            {teams.length > 0 && (
              <optgroup label="Teams">
                {teams.map((t) => (
                  <option key={t.id} value={`team:${t.id}`}>
                    {t.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Individuals">
              {staff
                .filter((s) => assignRoles.includes(s.role))
                .map((s) => (
                  <option key={s.id} value={`staff:${s.id}`}>
                    {s.full_name} ({ROLE_SHORT[s.role] ?? s.role})
                  </option>
                ))}
            </optgroup>
          </select>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSubmit}
          disabled={saving}
        >
          {saving ? (
            "Saving…"
          ) : (
            <>
              <Icon name="plus" size={14} />
              Log Complaint
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}


function formatDateTime(isoString: string | null | undefined): string {
  if (!isoString) return "—";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "—";
    return date.toLocaleString("en-PK", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return "—";
  }
}

function ComplaintModal({
  complaint,
  onClose,
  staff,
  teams,
  onSaved,
}: {
  complaint: ComplaintWithRelations;
  onClose: () => void;
  staff: StaffWithArea[];
  teams: TeamWithMembers[];
  onSaved: () => void;
}) {
  const [assignedEntity, setAssignedEntity] = useState(
    complaint.team_id
      ? `team:${complaint.team_id}`
      : complaint.assigned_to
        ? `staff:${complaint.assigned_to}`
        : ""
  );
  const assignedTeam = complaint.team_id
    ? teams.find((t) => t.id === complaint.team_id) ?? complaint.team
    : null;
  const assignedStaff =
    !complaint.team_id && complaint.assigned_to
      ? staff.find((s) => s.id === complaint.assigned_to) ?? complaint.technician
      : null;
  const assignedLabel = assignedTeam
    ? assignedTeam.name
    : assignedStaff
      ? assignedStaff.full_name
      : "";
  const assignedKind = assignedTeam ? "team" : assignedStaff ? "staff" : null;

  const [status, setStatus] = useState(complaint.status);
  const [priority, setPriority] = useState<ComplaintPriority>(
    complaint.priority,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAlreadyAssigned = !!(complaint.assigned_to || complaint.team_id);
  const assignRoles = assignableTechnicianRoles();
  const priLabel: Record<string, string> = {
    high: "High",
    medium: "Medium",
    low: "Low",
  };
  const statusColor = (s: string) =>
    s === "open" ? "red" : s === "in_progress" ? "amber" : "green";
  const statusLabel = (s: string) =>
    s === "open" ? "Open" : s === "in_progress" ? "In Progress" : "Resolved";

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      let assignedToId: string | null = null;
      let teamId: string | null = null;
      if (assignedEntity.startsWith("team:")) {
        teamId = assignedEntity.substring(5);
      } else if (assignedEntity.startsWith("staff:")) {
        assignedToId = assignedEntity.substring(6);
      }

      const hasAssignment = !!(assignedToId || teamId);
      const newlyAssigned = hasAssignment && !(complaint.assigned_to || complaint.team_id);
      const assignedAt = newlyAssigned
        ? new Date().toISOString()
        : !hasAssignment
          ? null
          : complaint.assigned_at;
      const effectiveStatus = newlyAssigned ? "open" : status;

      const inProgressAt =
        effectiveStatus === "in_progress" && complaint.status !== "in_progress"
          ? new Date().toISOString()
          : effectiveStatus === "open"
            ? null
            : complaint.in_progress_at;

      const resolvedAt =
        effectiveStatus === "resolved" && complaint.status !== "resolved"
          ? new Date().toISOString()
          : effectiveStatus !== "resolved"
            ? null
            : complaint.resolved_at;

      await updateComplaint(complaint.id, {
        assigned_to: teamId ? null : assignedToId,
        team_id: teamId,
        assigned_at: assignedAt,
        in_progress_at: inProgressAt,
        status: effectiveStatus,
        priority,
        resolved_at: resolvedAt,
      });
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save changes");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={!!complaint} onClose={onClose} width={640}>
      <div className="modal-head">
        <div>
          <div className="row gap-sm" style={{ marginBottom: 4 }}>
            <span className="mono muted" style={{ fontSize: 12 }}>
              {complaint.complaint_code}
            </span>
            <Badge color={statusColor(status)} dot>
              {statusLabel(status)}
            </Badge>
            <span className={`pri-dot ${priority}`} />
            <span className="muted" style={{ fontSize: 12 }}>
              {priLabel[priority]} priority
            </span>
          </div>
          <div
            style={{ fontSize: 17, fontWeight: 600, letterSpacing: "-0.01em" }}
          >
            {complaint.issue}
          </div>
        </div>
        <button className="icon-btn" onClick={onClose} disabled={saving}>
          <Icon name="close" size={16} />
        </button>
      </div>
      <div className="modal-body">
        {error && (
          <div
            style={{
              color: "var(--red)",
              background: "var(--red-50)",
              padding: 10,
              borderRadius: 6,
              fontSize: 13,
              marginBottom: 14,
              border:
                "1px solid color-mix(in srgb, var(--red) 30%, transparent)",
            }}
          >
            {error}
          </div>
        )}

        {/* 1. Extended Customer Details Block */}
        <div
          style={{
            padding: 14,
            background: "var(--bg-muted)",
            borderRadius: 8,
            marginBottom: 18,
            border: "1px solid var(--border)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              fontWeight: 600,
              color: "var(--text-muted)",
              marginBottom: 8,
            }}
          >
            Customer Contact & Location Details
          </div>
          <div className="grid-responsive-2" style={{ gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Customer Name
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  marginTop: 2,
                }}
              >
                <Avatar name={complaint.customer?.full_name ?? "?"} size={18} />
                <span>{complaint.customer?.full_name ?? "—"}</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Area / Location Code
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>
                {complaint.customer?.area?.name
                  ? `${complaint.customer.area.name} (${complaint.customer.area.code ?? "—"})`
                  : "—"}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Phone & WhatsApp
              </div>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  display: "flex",
                  gap: 10,
                  marginTop: 2,
                }}
              >
                {complaint.customer?.phone ? (
                  <a
                    href={`tel:${complaint.customer.phone}`}
                    className="row gap-xs hover-underline"
                    style={{ color: "var(--color-primary)" }}
                  >
                    <Icon name="phone" size={12} /> {complaint.customer.phone}
                  </a>
                ) : (
                  <span className="muted">—</span>
                )}
                {complaint.customer?.whatsapp && (
                  <a
                    href={`https://wa.me/${complaint.customer.whatsapp.replace(/[^0-9]/g, "")}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="row gap-xs hover-underline"
                    style={{ color: "#25D366" }}
                  >
                    <Icon name="zap" size={12} /> WhatsApp
                  </a>
                )}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                Email Address
              </div>
              <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>
                {complaint.customer?.email ? (
                  <a
                    href={`mailto:${complaint.customer.email}`}
                    className="hover-underline"
                    style={{ color: "var(--color-primary)" }}
                  >
                    {complaint.customer.email}
                  </a>
                ) : (
                  <span className="muted">—</span>
                )}
              </div>
            </div>
            {complaint.customer?.address_value && (
              <div style={{ gridColumn: "span 2" }}>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                  House ID & Address (
                  {complaint.customer.address_type === "id_number"
                    ? "ID Number"
                    : "Free Text"}
                  )
                </div>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    marginTop: 2,
                    display: "flex",
                    gap: 6,
                  }}
                >
                  {complaint.customer.house_id && (
                    <span
                      className="mono"
                      style={{
                        background: "var(--bg-elev)",
                        border: "1px solid var(--border)",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 11,
                      }}
                    >
                      {complaint.customer.house_id}
                    </span>
                  )}
                  <span>{complaint.customer.address_value}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 2. Lock Alert Banner */}
        {isAlreadyAssigned && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 12px",
              background: "var(--bg-muted)",
              border: "1px dashed var(--border)",
              borderRadius: 6,
              marginBottom: 14,
              fontSize: 12,
              color: "var(--text-muted)",
            }}
          >
            <Icon name="key" size={14} />
            <span>
              Complaint is assigned to active board. Priority and assignee
              fields are now locked.
            </span>
          </div>
        )}

        <div className="grid-responsive-2" style={{ marginBottom: 14 }}>
          <div className="field">
            <label>Priority</label>
            <select
              className="select"
              value={priority}
              onChange={(e) => setPriority(e.target.value as ComplaintPriority)}
              disabled={isAlreadyAssigned || saving}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="field">
            <label>Assign to Technician or Team</label>
            <select
              className="select"
              value={assignedEntity}
              onChange={(e) => setAssignedEntity(e.target.value)}
              disabled={isAlreadyAssigned || saving}
            >
              <option value="">— Unassigned —</option>
              {teams.length > 0 && (
                <optgroup label="Teams">
                  {teams.map((t) => (
                    <option key={t.id} value={`team:${t.id}`}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Individuals">
                {staff
                  .filter((s) => assignRoles.includes(s.role))
                  .map((s) => (
                    <option key={s.id} value={`staff:${s.id}`}>
                      {s.full_name} ({ROLE_SHORT[s.role] ?? s.role})
                    </option>
                  ))}
              </optgroup>
            </select>
          </div>
        </div>

        <div className="field" style={{ marginBottom: 18 }}>
          <label>Status</label>
          <div className="row gap-sm">
            {(["open", "in_progress", "resolved"] as const).map((s) => (
              <button
                key={s}
                className={`btn ${status === s ? "btn-primary" : "btn-secondary"} btn-sm`}
                style={{ flex: 1 }}
                onClick={() => setStatus(s)}
                disabled={saving}
              >
                {statusLabel(s)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          Timeline
        </div>
        <div className="timeline">
          <div className="tl-item done">
            <div className="ttl">Opened by customer</div>
            <div className="sub">
              {complaint.customer?.full_name ?? "—"} ·{" "}
              {formatDateTime(complaint.opened_at)}
            </div>
          </div>
          <div className={`tl-item ${assignedEntity ? "done" : ""}`}>
            <div className="ttl">
              {assignedLabel ? (
                `Assigned to ${assignedLabel}${assignedKind === "team" ? " team" : ""}`
              ) : (
                "Awaiting assignment"
              )}
            </div>
            <div className="sub">
              {assignedEntity
                ? `Technicians notified · ${
                    (assignedEntity.startsWith("staff:") && complaint.assigned_to === assignedEntity.substring(6)) ||
                    (assignedEntity.startsWith("team:") && complaint.team_id === assignedEntity.substring(5))
                      ? complaint.assigned_at
                        ? formatDateTime(complaint.assigned_at)
                        : ""
                      : "Just now (unsaved)"
                  }`
                : "No technician or team selected yet"}
            </div>
          </div>
          <div
            className={`tl-item ${status === "in_progress" ? "active" : status === "resolved" ? "done" : ""}`}
          >
            <div className="ttl">In progress</div>
            <div className="sub">
              {status === "resolved"
                ? `Work completed on-site · ${complaint.in_progress_at ? formatDateTime(complaint.in_progress_at) : ""}`
                : status === "in_progress"
                  ? `Technician on-site investigating · ${complaint.status === "in_progress" && complaint.in_progress_at ? formatDateTime(complaint.in_progress_at) : "Just now (unsaved)"}`
                  : "—"}
            </div>
          </div>
          <div className={`tl-item ${status === "resolved" ? "done" : ""}`}>
            <div className="ttl">Resolved</div>
            <div className="sub">
              {status === "resolved"
                ? `Customer confirmation received · ${complaint.status === "resolved" && complaint.resolved_at ? formatDateTime(complaint.resolved_at) : "Just now (unsaved)"}`
                : "—"}
            </div>
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button className="btn btn-ghost" onClick={onClose} disabled={saving}>
          Close
        </button>
        <button
          className="btn btn-primary"
          onClick={handleSave}
          disabled={saving}
        >
          <Icon
            name={saving ? "refresh" : "check"}
            size={14}
            style={{ marginRight: 6 }}
          />
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </Modal>
  );
}

export default function ComplaintsPage({
  refreshToken = 0,
  focusComplaintId = null,
  focusToken = 0,
}: {
  refreshToken?: number;
  focusComplaintId?: string | null;
  focusToken?: number;
}) {
  const [complaints, setComplaints] = useState<ComplaintWithRelations[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [staff, setStaff] = useState<StaffWithArea[]>([]);
  const [teams, setTeams] = useState<TeamWithMembers[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState("kanban");
  const [open, setOpen] = useState<ComplaintWithRelations | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [savedComplaintCode, setSavedComplaintCode] = useState<string | null>(
    null,
  );

  // Dynamic filter states
  const [filterArea, setFilterArea] = useState<string>("all");
  const [filterServiceLine, setFilterServiceLine] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [filterPriority, setFilterPriority] = useState<string>("all");
  const [searchTerm, setSearchTerm] = useState("");

  const prevRefreshRef = React.useRef(refreshToken);

  useEffect(() => {
    Promise.all([getComplaints(), getAreas(), getStaff(), getTeams()])
      .then(([c, a, s, t]) => {
        setComplaints(c);
        setAreas(a);
        setStaff(s);
        setTeams(t);
      })
      .catch((e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not load complaints"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (prevRefreshRef.current === refreshToken) return;
    prevRefreshRef.current = refreshToken;
    getComplaints()
      .then((c) => setComplaints(c))
      .catch(() => {});
  }, [refreshToken]);

  useEffect(() => {
    if (!focusComplaintId || focusToken === 0) return;

    let cancelled = false;
    getComplaintById(focusComplaintId)
      .then((complaint) => {
        if (cancelled || !complaint) return;
        setComplaints((prev) => {
          const exists = prev.some((item) => item.id === complaint.id);
          return exists
            ? prev.map((item) => (item.id === complaint.id ? complaint : item))
            : [complaint, ...prev];
        });
        setOpen(complaint);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(
          e instanceof Error
            ? e.message
            : "Could not open complaint from notification",
        );
      });

    return () => {
      cancelled = true;
    };
  }, [focusComplaintId, focusToken]);

  const handleComplaintSaved = (c: ComplaintWithRelations) => {
    setComplaints((prev) => [c, ...prev]);
    setSavedComplaintCode(c.complaint_code);
  };

  if (loading)
    return (
      <div
        className="page"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: 300,
        }}
      >
        <div className="muted">Loading complaints…</div>
      </div>
    );

  if (error)
    return (
      <div className="page">
        <div className="card" style={{ padding: 24 }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Data load failed
          </div>
          <div className="muted" style={{ fontSize: 13, marginBottom: 14 }}>
            {error}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => window.location.reload()}
          >
            <Icon name="refresh" size={14} />
            Retry
          </button>
        </div>
      </div>
    );

  // Apply state filters
  const filteredComplaints = complaints.filter((c) => {
    if (filterArea !== "all" && c.customer?.area_id !== filterArea)
      return false;
    if (filterServiceLine !== "all" && complaintLine(c) !== filterServiceLine) return false;
    if (filterType !== "all" && c.type !== filterType) return false;
    if (filterPriority !== "all" && c.priority !== filterPriority) return false;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase().trim();
      const codeMatch = c.complaint_code?.toLowerCase()?.includes(term) ?? false;
      const phoneMatch = c.customer?.phone?.toLowerCase()?.includes(term) ?? false;
      const nameMatch = c.customer?.full_name?.toLowerCase()?.includes(term) ?? false;
      const issueMatch = c.issue?.toLowerCase()?.includes(term) ?? false;
      const houseMatch = c.customer?.house_id?.toLowerCase()?.includes(term) ?? false;
      if (!codeMatch && !phoneMatch && !nameMatch && !issueMatch && !houseMatch)
        return false;
    }
    return true;
  });

  const unassignedComplaints = filteredComplaints.filter(
    (c) => (c.assigned_to === null || c.assigned_to === "") && (c.team_id === null || c.team_id === ""),
  );
  const assignedComplaints = filteredComplaints.filter(
    (c) => (c.assigned_to !== null && c.assigned_to !== "") || (c.team_id !== null && c.team_id !== ""),
  );

  const byStatus = {
    open: assignedComplaints.filter((c) => c.status === "open"),
    in_progress: assignedComplaints.filter((c) => c.status === "in_progress"),
    resolved: assignedComplaints.filter((c) => c.status === "resolved"),
  };

  const priLabel: Record<string, string> = {
    high: "High",
    medium: "Med",
    low: "Low",
  };
  const statusColor = (s: string) =>
    s === "open" ? "red" : s === "in_progress" ? "amber" : "green";
  const statusLabel = (s: string) =>
    s === "open" ? "Open" : s === "in_progress" ? "In Progress" : "Resolved";

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Complaint Management</h1>
          <p>
            {filteredComplaints.length} total ·{" "}
            {filteredComplaints.filter((c) => c.status === "open").length} open
            · {unassignedComplaints.length} unassigned
          </p>
        </div>
        <div className="row gap-sm">
          <Tabs
            value={view}
            onChange={setView}
            items={[
              { value: "kanban", label: "Board" },
              { value: "list", label: "List" },
            ]}
          />
          <button className="btn btn-primary" onClick={() => setLogOpen(true)}>
            <Icon name="plus" size={14} />
            Log Complaint
          </button>
        </div>
      </div>

      {savedComplaintCode && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 8,
            background: "var(--green-50)",
            color: "var(--green)",
            marginBottom: 14,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontWeight: 700,
          }}
        >
          <Icon name="checkCircle" size={16} />
          <span>
            Complaint registered. Tell caller complaint number:{" "}
            <span className="mono">{savedComplaintCode}</span>
          </span>
          <button
            className="btn btn-ghost btn-sm"
            style={{ marginLeft: "auto" }}
            onClick={() => setSavedComplaintCode(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="kpi-row" style={{ marginBottom: 16 }}>
        {[
          {
            key: "open",
            label: "Open",
            color: "var(--red)",
            bg: "var(--red-50)",
            trend: "needs attention",
            value: filteredComplaints.filter((c) => c.status === "open").length,
          },
          {
            key: "in_progress",
            label: "In Progress",
            color: "var(--amber)",
            bg: "var(--amber-50)",
            trend: "being handled",
            value: filteredComplaints.filter((c) => c.status === "in_progress")
              .length,
          },
          {
            key: "resolved",
            label: "Resolved",
            color: "var(--green)",
            bg: "var(--green-50)",
            trend: "completed",
            value: filteredComplaints.filter((c) => c.status === "resolved")
              .length,
          },
        ].map((k) => (
          <div
            key={k.key}
            className="kpi-card"
            style={
              {
                "--kpi-color": k.color,
                "--kpi-bg": k.bg,
              } as React.CSSProperties
            }
          >
            <div className="kpi-glow" />
            <div className="kpi-head">
              <span className="kpi-label">{k.label}</span>
              <span className="kpi-bolt" style={{ background: k.color }} />
            </div>
            <div className="kpi-value num">{k.value}</div>
            <div className="kpi-foot">
              <span className="kpi-trend">{k.trend}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Fully Functional State-Driven Filter Bar */}
      <div className="filter-bar">
        <input type="text" className="input" placeholder="Search complaint #, phone, name, issue..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: "260px", marginRight: "8px" }} />
        <select
          className="select"
          style={{ width: "auto" }}
          value={filterArea}
          onChange={(e) => setFilterArea(e.target.value)}
        >
          <option value="all">All areas</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
        <select
          className="select"
          style={{ width: "auto" }}
          value={filterServiceLine}
          onChange={(e) => setFilterServiceLine(e.target.value)}
        >
          <option value="all">All services</option>
          <option value="internet">Internet</option>
          <option value="cable">Cable</option>
        </select>
        <select
          className="select"
          style={{ width: "auto" }}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
        >
          <option value="all">All types</option>
          {ALL_COMPLAINT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <select
          className="select"
          style={{ width: "auto" }}
          value={filterPriority}
          onChange={(e) => setFilterPriority(e.target.value)}
        >
          <option value="all">All priorities</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <div className="spacer" />
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => {
            setFilterArea("all");
            setFilterServiceLine("all");
            setFilterType("all");
            setFilterPriority("all");
            getComplaints()
              .then(setComplaints)
              .catch(() => {});
          }}
        >
          <Icon name="refresh" size={14} />
          Reset Filters
        </button>
      </div>

      {complaints.length === 0 ? (
        <div
          className="card"
          style={{
            padding: 40,
            textAlign: "center",
            color: "var(--text-muted)",
          }}
        >
          <div style={{ fontSize: 14 }}>No complaints logged yet</div>
        </div>
      ) : view === "kanban" ? (
        // Grid template overridden to display 4 columns dynamically
        <div
          className="kanban"
          style={{ gridTemplateColumns: "repeat(4, 1fr)" }}
        >
          {/* New Column: Incoming Queue for Unassigned Complaints */}
          <div
            className="kanban-col"
            style={{
              background: "var(--bg-muted)",
              border: "1px dashed var(--border)",
            }}
          >
            <div className="kanban-col-head">
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: "var(--text-muted)",
                  display: "inline-block",
                }}
              />
              <span className="title" style={{ fontWeight: 700 }}>
                Incoming (Unassigned)
              </span>
              <span className="cnt">{unassignedComplaints.length}</span>
            </div>
            <div className="kanban-col-cards">
              {unassignedComplaints.length === 0 ? (
                <div
                  style={{
                    padding: "24px 12px",
                    textAlign: "center",
                    color: "var(--text-muted)",
                    fontSize: 12,
                    fontStyle: "italic",
                  }}
                >
                  No unassigned complaints
                </div>
              ) : (
                unassignedComplaints.map((c) => (
                  <div
                    key={c.id}
                    className="kanban-card"
                    onClick={() => setOpen(c)}
                    style={{ borderLeft: "3px solid var(--border)" }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span className="id">{c.complaint_code}</span>
                      <div className="row gap-sm">
                        <span className={`pri-dot ${c.priority}`} />
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 600,
                            color: "var(--text-muted)",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          {priLabel[c.priority]}
                        </span>
                      </div>
                    </div>
                    <div className="issue">{c.issue}</div>
                    <div
                      className="row gap-sm"
                      style={{ fontSize: 12, color: "var(--text-muted)" }}
                    >
                      <Icon name="user" size={12} />
                      {c.customer?.full_name ?? "—"}
                    </div>
                    {c.customer?.area?.name && (
                      <div
                        className="row gap-sm"
                        style={{
                          fontSize: 11,
                          color: "var(--text-muted)",
                          marginTop: 2,
                        }}
                      >
                        <Icon name="mapPin" size={11} />
                        {c.customer.area.name}
                      </div>
                    )}
                    <div
                      style={{
                        borderTop: "1px solid var(--border)",
                        marginTop: 4,
                        paddingTop: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <span
                        style={{
                          fontSize: 11,
                          color: "var(--color-primary)",
                          fontStyle: "italic",
                          fontWeight: 500,
                        }}
                      >
                        Click to assign
                      </span>
                      <span
                        style={{ fontSize: 11, color: "var(--text-muted)" }}
                        className="row gap-sm"
                      >
                        <Icon name="clock" size={11} />
                        {new Date(c.opened_at).toLocaleDateString("en-PK")}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Active Board Columns (Assigned Complaints only) */}
          {(["open", "in_progress", "resolved"] as const).map((col) => {
            const color =
              col === "open"
                ? "#EF4444"
                : col === "in_progress"
                  ? "#F59E0B"
                  : "#22C55E";
            return (
              <div key={col} className="kanban-col">
                <div className="kanban-col-head">
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: color,
                      display: "inline-block",
                    }}
                  />
                  <span className="title">{statusLabel(col)}</span>
                  <span className="cnt">{byStatus[col].length}</span>
                </div>
                <div className="kanban-col-cards">
                  {byStatus[col].map((c) => (
                    <div
                      key={c.id}
                      className="kanban-card"
                      onClick={() => setOpen(c)}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <span className="id">{c.complaint_code}</span>
                        <div className="row gap-sm">
                          <span className={`pri-dot ${c.priority}`} />
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 600,
                              color: "var(--text-muted)",
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            {priLabel[c.priority]}
                          </span>
                        </div>
                      </div>
                      <div className="issue">{c.issue}</div>
                      <div
                        className="row gap-sm"
                        style={{ fontSize: 12, color: "var(--text-muted)" }}
                      >
                        <Icon name="user" size={12} />
                        {c.customer?.full_name ?? "—"}
                      </div>
                      <div
                        style={{
                          borderTop: "1px solid var(--border)",
                          marginTop: 4,
                          paddingTop: 10,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                        }}
                      >
                        <div className="assignee">
                          {c.team ? (
                            <>
                              <Avatar name={c.team.name} size={20} />
                              <span style={{ color: 'var(--color-primary)', fontWeight: 600 }}>{c.team.name}</span>
                            </>
                          ) : c.technician ? (
                            <>
                              <Avatar name={c.technician.full_name} size={20} />
                              <span>{c.technician.full_name}</span>
                            </>
                          ) : (
                            <span style={{ fontStyle: "italic" }}>
                              Unassigned
                            </span>
                          )}
                        </div>
                        <span
                          style={{ fontSize: 11, color: "var(--text-muted)" }}
                          className="row gap-sm"
                        >
                          <Icon name="clock" size={11} />
                          {new Date(c.opened_at).toLocaleDateString("en-PK")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        // List table displays all filtered complaints (both assigned and unassigned)
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>ID</th>
                <th>Service</th>
                <th>Type</th>
                <th>Issue</th>
                <th>Customer</th>
                <th>Priority</th>
                <th>Technician</th>
                <th>Status</th>
                <th>Opened</th>
              </tr>
            </thead>
            <tbody>
              {filteredComplaints.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => setOpen(c)}>
                  <td className="mono" style={{ fontSize: 12 }}>
                    {c.complaint_code}
                  </td>
                  <td>
                    <Badge color={complaintLine(c) === "cable" ? "purple" : "blue"}>
                      {formatServiceLine(complaintLine(c))}
                    </Badge>
                  </td>
                  <td style={{ fontSize: 12 }}>{formatComplaintType(c.type)}</td>
                  <td style={{ fontWeight: 500 }}>{c.issue}</td>
                  <td>{c.customer?.full_name ?? "—"}</td>
                  <td>
                    <span
                      className={`pri-dot ${c.priority}`}
                      style={{ marginRight: 6 }}
                    />
                    <span style={{ fontSize: 12 }}>{priLabel[c.priority]}</span>
                  </td>
                  <td>
                    {c.team?.name ?? c.technician?.full_name ?? (
                      <span className="muted" style={{ fontStyle: "italic" }}>
                        Unassigned
                      </span>
                    )}
                  </td>
                  <td>
                    <Badge color={statusColor(c.status)} dot>
                      {statusLabel(c.status)}
                    </Badge>
                  </td>
                  <td className="muted" style={{ fontSize: 12 }}>
                    {new Date(c.opened_at).toLocaleDateString("en-PK")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {open && (
        <ComplaintModal
          complaint={open}
          onClose={() => setOpen(null)}
          staff={staff}
          teams={teams}
          onSaved={() => {
            getComplaints()
              .then((c) => setComplaints(c))
              .catch(() => {});
          }}
        />
      )}
      {logOpen && (
        <LogComplaintModal
          onClose={() => setLogOpen(false)}
          staff={staff}
          teams={teams}
          onSaved={handleComplaintSaved}
        />
      )}
    </div>
  );
}
