"use client";
import React, { useState, useEffect } from "react";
import Icon, { type IconName } from "../Icon";
import { Switch } from "../ui";

// Notification types matching NotificationPreferences
const notificationTypes = [
  { key: "complaint_created", label: "New Complaint Created", desc: "When a customer submits a new complaint", icon: "plus" },
  { key: "complaint_in_progress", label: "Complaint In Progress", desc: "When a technician starts working on a complaint", icon: "wrench" },
  { key: "complaint_resolved", label: "Complaint Resolved", desc: "When a complaint is marked as resolved", icon: "checkCircle" },
  { key: "payment_full", label: "Full Payment Received", desc: "When full payment is collected", icon: "dollar" },
  { key: "payment_partial", label: "Partial Payment Received", desc: "When partial payment is collected", icon: "cash" },
  { key: "visit", label: "Visit Logged", desc: "When technician or agent logs a visit", icon: "mapPin" },
  { key: "customer_signup_pending", label: "New Customer Signup", desc: "When a new customer signup request is submitted", icon: "users" },
];

export default function SettingsPage() {
  const [success, setSuccess] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Load persisted settings
    const savedNotifs = localStorage.getItem("notification_settings");
    if (savedNotifs) {
      setNotifications(JSON.parse(savedNotifs));
    } else {
      const defaults: Record<string, boolean> = {};
      notificationTypes.forEach((n) => (defaults[n.key] = true));
      setNotifications(defaults);
      localStorage.setItem("notification_settings", JSON.stringify(defaults));
    }
  }, []);

  const saveNotifications = (newNotifs: Record<string, boolean>) => {
    setNotifications(newNotifs);
    localStorage.setItem("notification_settings", JSON.stringify(newNotifs));
    showSuccessAlert("Notification preferences updated!");
  };

  const toggleNotif = (key: string) => {
    const updated = { ...notifications, [key]: !notifications[key] };
    saveNotifications(updated);
  };

  const showSuccessAlert = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 3000);
  };

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 26 }}>
        <div>
          <h1>System Settings</h1>
          <p>Configure notification preferences and real-time alerts</p>
        </div>
      </div>

      {success && (
        <div
          style={{
            padding: "12px 18px",
            background: "var(--green-50)",
            color: "var(--green)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid color-mix(in srgb, var(--green) 30%, transparent)",
            marginBottom: 20,
            display: "flex",
            alignItems: "center",
            gap: 10,
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "var(--shadow-sm)",
            animation: "fadeIn 0.2s ease-out",
          }}
        >
          <Icon name="checkCircle" size={16} />
          <span>{success}</span>
        </div>
      )}

      <div style={{ maxWidth: 800 }}>
        <div className="card card-pad" style={{ borderRadius: "var(--radius)", padding: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--border)", paddingBottom: 16, marginBottom: 20 }}>
            <span style={{ display: "inline-flex", padding: 8, borderRadius: "50%", background: "var(--brand-50)", color: "var(--brand-600)" }}>
              <Icon name="bell" size={20} />
            </span>
            <div>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Notification Preferences</h3>
              <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>Choose which event notifications and real-time alerts show on your dashboard</p>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {notificationTypes.map((notif) => {
              const isEnabled = notifications[notif.key] ?? true;
              return (
                <div
                  key={notif.key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 16px",
                    background: "var(--bg-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    transition: "all 0.15s ease",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = "color-mix(in srgb, var(--brand) 30%, var(--border))")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <span
                      style={{
                        display: "inline-flex",
                        padding: 8,
                        borderRadius: 8,
                        background: isEnabled ? "var(--brand-50)" : "var(--border)",
                        color: isEnabled ? "var(--brand-600)" : "var(--text-faint)",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <Icon name={notif.icon as IconName} size={15} />
                    </span>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13, color: "var(--text)" }}>{notif.label}</div>
                      <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{notif.desc}</div>
                    </div>
                  </div>
                  <Switch
                    on={isEnabled}
                    onChange={() => toggleNotif(notif.key)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
