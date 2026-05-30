import React, { useState, useEffect } from 'react';

const notificationTypes = [
  { key: 'complaint_created', label: 'New Complaint Created', desc: 'When a customer submits a new complaint' },
  { key: 'complaint_in_progress', label: 'Complaint In Progress', desc: 'When a technician starts working on a complaint' },
  { key: 'complaint_resolved', label: 'Complaint Resolved', desc: 'When a complaint is marked as resolved' },
  { key: 'payment_full', label: 'Full Payment Received', desc: 'When full payment is collected' },
  { key: 'payment_partial', label: 'Partial Payment Received', desc: 'When partial payment is collected' },
  { key: 'visit', label: 'Visit Logged', desc: 'When technician or agent logs a visit' },
  { key: 'customer_signup_pending', label: 'New Customer Signup', desc: 'When a new customer registration request is submitted' },
];

export default function NotificationPreferences() {
  const [settings, setSettings] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const saved = localStorage.getItem('notification_settings');
    if (saved) {
      setSettings(JSON.parse(saved));
    } else {
      const defaults: Record<string, boolean> = {};
      notificationTypes.forEach(n => defaults[n.key] = true);
      setSettings(defaults);
      localStorage.setItem('notification_settings', JSON.stringify(defaults));
    }
  }, []);

  const toggle = (key: string) => {
    const newSettings = { ...settings, [key]: !settings[key] };
    setSettings(newSettings);
    localStorage.setItem('notification_settings', JSON.stringify(newSettings));
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold">Notification Preferences</h2>
        <p className="text-sm text-gray-500 mt-1">Choose which notifications you want to receive</p>
      </div>

      <div className="space-y-px bg-white border border-gray-200 rounded-xl overflow-hidden">
        {notificationTypes.map((notif, index) => {
          const isEnabled = settings[notif.key] ?? true;
          return (
            <div key={notif.key} className="flex items-center justify-between px-5 py-4 hover:bg-gray-50 border-b last:border-b-0">
              <div>
                <div className="font-medium">{notif.label}</div>
                <div className="text-sm text-gray-500 mt-0.5">{notif.desc}</div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={isEnabled} 
                  onChange={() => toggle(notif.key)} 
                  className="sr-only peer" 
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-orange-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
              </label>
            </div>
          );
        })}
      </div>
    </div>
  );
}
