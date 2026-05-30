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
    <div className="max-w-3xl">
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-orange-500 to-red-500 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Notification Preferences</h2>
            <p className="text-sm text-gray-500 mt-0.5">Control which notifications you receive</p>
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">Notification Types</div>
              <div className="text-xs text-gray-500">Toggle to enable or disable</div>
            </div>
            <div className="text-xs px-3 py-1 rounded-full bg-white border text-gray-500">
              {Object.values(settings).filter(Boolean).length} of {notificationTypes.length} enabled
            </div>
          </div>
        </div>

        <div className="divide-y">
          {notificationTypes.map((notif, index) => {
            const isEnabled = settings[notif.key] ?? true;
            return (
              <div key={notif.key} className="px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors group">
                <div className="flex-1 pr-4">
                  <div className="font-medium text-[15px]">{notif.label}</div>
                  <div className="text-sm text-gray-500 mt-0.5">{notif.desc}</div>
                </div>
                
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isEnabled}
                    onChange={() => toggle(notif.key)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-offset-2 peer-focus:ring-orange-500 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-orange-500"></div>
                </label>
              </div>
            );
          })}
        </div>
      </div>

      <div className="mt-4 text-xs text-gray-500 px-1">
        Changes are saved automatically
      </div>
    </div>
  );
}
