import React, { useState, useEffect } from 'react';

const notificationTypes = [
  { key: 'complaint_created', label: 'New Complaint Created' },
  { key: 'complaint_in_progress', label: 'Complaint In Progress' },
  { key: 'complaint_resolved', label: 'Complaint Resolved' },
  { key: 'payment_full', label: 'Full Payment Received' },
  { key: 'payment_partial', label: 'Partial Payment Received' },
  { key: 'visit', label: 'Visit Logged' },
  { key: 'customer_signup_pending', label: 'New Customer Signup' },
];

export default function NotificationPreferences() {
  const [settings, setSettings] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = localStorage.getItem('notification_settings');
    if (saved) {
      setSettings(JSON.parse(saved));
    } else {
      // Default all ON
      const defaults: Record<string, boolean> = {};
      notificationTypes.forEach(n => defaults[n.key] = true);
      setSettings(defaults);
    }
  }, []);

  const toggle = (key: string) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings);
    localStorage.setItem('notification_settings', JSON.stringify(newSettings));
  };

  return (
    <div className="notification-preferences">
      <h3>Notification Preferences</h3>
      <p className="text-sm text-gray-600 mb-4">Toggle which notifications you want to receive</p>
      
      <div className="space-y-3">
        {notificationTypes.map((notif) => (
          <div key={notif.key} className="flex items-center justify-between p-3 border rounded">
            <span>{notif.label}</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings[notif.key] ?? true}
                onChange={() => toggle(notif.key)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}
