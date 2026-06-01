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
  const [activeTab, setActiveTab] = useState("general");
  const [saving, setSaving] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // 1. General settings
  const [org, setOrg] = useState({
    companyName: "PowerNet Broadband Ltd",
    hotline: "+92 300 1234567",
    whatsapp: "+92 300 7654321",
    email: "support@powernet.net",
    address: "Suite 402, Sector G, Garrison Commercial, Lahore",
    timezone: "Asia/Karachi",
    currency: "PKR",
  });

  // 2. Billing settings
  const [billing, setBilling] = useState({
    taxRate: "19.5",
    lateFee: "200",
    billingCycleDay: "1",
    gracePeriod: "5",
    autoSuspend: true,
    enableOnlinePayment: true,
  });

  // 3. SMS gateway settings
  const [sms, setSms] = useState({
    gateway: "twilio",
    apiKey: "••••••••••••••••••••••••",
    apiSecret: "••••••••••••••••••••••••",
    senderId: "POWERNET",
    welcomeTemplate: "Welcome to PowerNet, {customer_name}! Your House ID is {house_id} and connection is active.",
    billAlertTemplate: "Dear {customer_name}, your bill of Rs.{amount} for {month} is generated. Please pay by {due_date} to avoid suspension.",
    resolvedTemplate: "Dear Customer, your complaint {complaint_code} has been marked RESOLVED. Thank you for choosing PowerNet!",
  });

  // 4. Notification Settings (using standard localStorage matching NotificationPreferences)
  const [notifications, setNotifications] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Load persisted settings
    const savedOrg = localStorage.getItem("powernet_org_settings");
    if (savedOrg) setOrg(JSON.parse(savedOrg));

    const savedBilling = localStorage.getItem("powernet_billing_settings");
    if (savedBilling) setBilling(JSON.parse(savedBilling));

    const savedSms = localStorage.getItem("powernet_sms_settings");
    if (savedSms) setSms(JSON.parse(savedSms));

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

  const saveSettings = (key: string, data: Record<string, string | boolean | number>) => {
    setSaving(key);
    setTimeout(() => {
      localStorage.setItem(`powernet_${key}_settings`, JSON.stringify(data));
      setSaving(null);
      showSuccessAlert(`${key.charAt(0).toUpperCase() + key.slice(1)} settings saved successfully!`);
    }, 600);
  };

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

  const handleTestSms = () => {
    showSuccessAlert("Test SMS sent successfully to support hotline!");
  };

  return (
    <div className="page">
      <div className="page-header" style={{ marginBottom: 26 }}>
        <div>
          <h1>System Settings</h1>
          <p>Configure company profile, billing configurations, SMS gateway, and notification preferences</p>
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

      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 30, alignItems: "start" }}>
        {/* Sidebar Tabs */}
        <div
          className="card card-pad"
          style={{
            padding: 12,
            background: "var(--bg-elev)",
            borderRadius: "var(--radius)",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {[
            { id: "general", label: "Organization", icon: "home" as const },
            { id: "billing", label: "Billing Rules", icon: "dollar" as const },
            { id: "sms", label: "SMS & Gateway", icon: "zap" as const },
            { id: "notifications", label: "Notifications", icon: "bell" as const },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                fontSize: 13,
                fontWeight: 600,
                textAlign: "left",
                background: activeTab === tab.id ? "var(--brand-50)" : "transparent",
                color: activeTab === tab.id ? "var(--brand-600)" : "var(--text-muted)",
                transition: "all 0.15s ease",
              }}
              onMouseEnter={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.background = "var(--bg-muted)";
                  e.currentTarget.style.color = "var(--text)";
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== tab.id) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--text-muted)";
                }
              }}
            >
              <Icon name={tab.icon} size={15} style={{ color: activeTab === tab.id ? "var(--brand-600)" : "var(--text-faint)" }} />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        {/* Tab Content Panels */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          {/* TAB 1: GENERAL */}
          {activeTab === "general" && (
            <div className="card card-pad" style={{ borderRadius: "var(--radius)", padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--border)", paddingBottom: 16, marginBottom: 20 }}>
                <span style={{ display: "inline-flex", padding: 8, borderRadius: "50%", background: "var(--brand-50)", color: "var(--brand-600)" }}>
                  <Icon name="home" size={20} />
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Organization Profile</h3>
                  <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>Configure base company details shown on customer receipts and portals</p>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div className="field">
                  <label>Company / Organization Name</label>
                  <input
                    type="text"
                    className="input"
                    value={org.companyName}
                    onChange={(e) => setOrg({ ...org, companyName: e.target.value })}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div className="field">
                    <label>Support Phone Hotline</label>
                    <input
                      type="text"
                      className="input"
                      value={org.hotline}
                      onChange={(e) => setOrg({ ...org, hotline: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>WhatsApp Business Hotline</label>
                    <input
                      type="text"
                      className="input"
                      value={org.whatsapp}
                      onChange={(e) => setOrg({ ...org, whatsapp: e.target.value })}
                    />
                  </div>
                </div>

                <div className="field">
                  <label>Support Email Address</label>
                  <input
                    type="email"
                    className="input"
                    value={org.email}
                    onChange={(e) => setOrg({ ...org, email: e.target.value })}
                  />
                </div>

                <div className="field">
                  <label>Physical Office Address</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={org.address}
                    style={{ resize: "vertical", minHeight: 60 }}
                    onChange={(e) => setOrg({ ...org, address: e.target.value })}
                  />
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div className="field">
                    <label>Default Timezone</label>
                    <select
                      className="select"
                      value={org.timezone}
                      onChange={(e) => setOrg({ ...org, timezone: e.target.value })}
                    >
                      <option value="Asia/Karachi">Asia/Karachi (PKT)</option>
                      <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                      <option value="UTC">UTC / GMT</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Base Currency</label>
                    <select
                      className="select"
                      value={org.currency}
                      onChange={(e) => setOrg({ ...org, currency: e.target.value })}
                    >
                      <option value="PKR">Pakistani Rupee (Rs. / PKR)</option>
                      <option value="USD">US Dollar ($ / USD)</option>
                      <option value="AED">UAE Dirham (AED)</option>
                    </select>
                  </div>
                </div>

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 18, display: "flex", justifyContent: "flex-end" }}>
                  <button
                    className="btn btn-primary"
                    disabled={saving === "org"}
                    onClick={() => saveSettings("org", org)}
                  >
                    {saving === "org" ? "Saving..." : "Save Changes"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: BILLING RULES */}
          {activeTab === "billing" && (
            <div className="card card-pad" style={{ borderRadius: "var(--radius)", padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--border)", paddingBottom: 16, marginBottom: 20 }}>
                <span style={{ display: "inline-flex", padding: 8, borderRadius: "50%", background: "var(--brand-50)", color: "var(--brand-600)" }}>
                  <Icon name="dollar" size={20} />
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Billing & Financial Rules</h3>
                  <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>Configure late fee surcharges, tax levels, and automated system actions</p>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div className="field">
                    <label>Internet Sales Tax Rate (%)</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type="number"
                        className="input"
                        step="0.1"
                        value={billing.taxRate}
                        onChange={(e) => setBilling({ ...billing, taxRate: e.target.value })}
                      />
                      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)", fontWeight: 600 }}>%</span>
                    </div>
                  </div>
                  <div className="field">
                    <label>Default Late Surcharge (Rs.)</label>
                    <div style={{ position: "relative" }}>
                      <input
                        type="number"
                        className="input"
                        value={billing.lateFee}
                        onChange={(e) => setBilling({ ...billing, lateFee: e.target.value })}
                      />
                      <span style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "var(--text-faint)", fontWeight: 600 }}>PKR</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div className="field">
                    <label>Billing Cycle Day</label>
                    <select
                      className="select"
                      value={billing.billingCycleDay}
                      onChange={(e) => setBilling({ ...billing, billingCycleDay: e.target.value })}
                    >
                      <option value="1">1st of the month</option>
                      <option value="5">5th of the month</option>
                      <option value="10">10th of the month</option>
                      <option value="15">15th of the month</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Grace Period for Suspensions (Days)</label>
                    <input
                      type="number"
                      className="input"
                      value={billing.gracePeriod}
                      onChange={(e) => setBilling({ ...billing, gracePeriod: e.target.value })}
                    />
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 16px",
                    background: "var(--bg-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                    marginTop: 6,
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Automate Suspension</div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Automatically suspend internet line of unpaid customers after grace period</div>
                  </div>
                  <Switch
                    on={billing.autoSuspend}
                    onChange={(v) => setBilling({ ...billing, autoSuspend: v })}
                  />
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "14px 16px",
                    background: "var(--bg-muted)",
                    border: "1px solid var(--border)",
                    borderRadius: "var(--radius-sm)",
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>Customer Portal Online Payments</div>
                    <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Permit customers to process payments via Easypaisa, Jazzcash, or Direct Debit</div>
                  </div>
                  <Switch
                    on={billing.enableOnlinePayment}
                    onChange={(v) => setBilling({ ...billing, enableOnlinePayment: v })}
                  />
                </div>

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 18, display: "flex", justifyContent: "flex-end" }}>
                  <button
                    className="btn btn-primary"
                    disabled={saving === "billing"}
                    onClick={() => saveSettings("billing", billing)}
                  >
                    {saving === "billing" ? "Saving..." : "Save Config"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SMS INTEGRATIONS */}
          {activeTab === "sms" && (
            <div className="card card-pad" style={{ borderRadius: "var(--radius)", padding: 24 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid var(--border)", paddingBottom: 16, marginBottom: 20 }}>
                <span style={{ display: "inline-flex", padding: 8, borderRadius: "50%", background: "var(--brand-50)", color: "var(--brand-600)" }}>
                  <Icon name="zap" size={20} />
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>SMS Gateway & Integrations</h3>
                  <p className="muted" style={{ margin: "2px 0 0", fontSize: 12 }}>Connect SMS providers and configure customer broadcast alert templates</p>
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div className="field">
                    <label>SMS Gateway Provider</label>
                    <select
                      className="select"
                      value={sms.gateway}
                      onChange={(e) => setSms({ ...sms, gateway: e.target.value })}
                    >
                      <option value="twilio">Twilio SMS API</option>
                      <option value="telenor">Telenor Corporate Bulk Gateway</option>
                      <option value="infobip">Infobip Messaging Cloud</option>
                      <option value="none">— Disabled —</option>
                    </select>
                  </div>
                  <div className="field">
                    <label>Sender ID / Masking</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. POWERNET"
                      value={sms.senderId}
                      onChange={(e) => setSms({ ...sms, senderId: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                  <div className="field">
                    <label>API Auth Username / Key</label>
                    <input
                      type="text"
                      className="input"
                      value={sms.apiKey}
                      onChange={(e) => setSms({ ...sms, apiKey: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label>API Secret Token</label>
                    <input
                      type="password"
                      className="input"
                      value={sms.apiSecret}
                      onChange={(e) => setSms({ ...sms, apiSecret: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ borderBottom: "1px solid var(--border)", paddingBottom: 10, marginTop: 10 }}>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Broadcast Templates</div>
                  <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>Edit text sent during auto-triggers. Variables like {"{customer_name}"} will be filled in.</div>
                </div>

                <div className="field">
                  <label>Customer Welcome Alert</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={sms.welcomeTemplate}
                    style={{ resize: "vertical", minHeight: 50, fontFamily: "sans-serif", fontSize: 12 }}
                    onChange={(e) => setSms({ ...sms, welcomeTemplate: e.target.value })}
                  />
                </div>

                <div className="field">
                  <label>Monthly Invoice Generation Alert</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={sms.billAlertTemplate}
                    style={{ resize: "vertical", minHeight: 50, fontFamily: "sans-serif", fontSize: 12 }}
                    onChange={(e) => setSms({ ...sms, billAlertTemplate: e.target.value })}
                  />
                </div>

                <div className="field">
                  <label>Complaint Resolved Confirmation Alert</label>
                  <textarea
                    className="input"
                    rows={2}
                    value={sms.resolvedTemplate}
                    style={{ resize: "vertical", minHeight: 50, fontFamily: "sans-serif", fontSize: 12 }}
                    onChange={(e) => setSms({ ...sms, resolvedTemplate: e.target.value })}
                  />
                </div>

                <div style={{ borderTop: "1px solid var(--border)", paddingTop: 18, display: "flex", gap: 10, justifyContent: "flex-end" }}>
                  <button
                    className="btn btn-secondary"
                    onClick={handleTestSms}
                  >
                    Send Test SMS
                  </button>
                  <button
                    className="btn btn-primary"
                    disabled={saving === "sms"}
                    onClick={() => saveSettings("sms", sms)}
                  >
                    {saving === "sms" ? "Saving..." : "Save Gateways"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: NOTIFICATIONS */}
          {activeTab === "notifications" && (
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
          )}
        </div>
      </div>
    </div>
  );
}
