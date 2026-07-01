'use client';

import React, { useState } from 'react';
import { Tabs } from '../ui';
import CableSubscribersTab from './CableSubscribersTab';
import CableBillingTab from './CableBillingTab';
import type { Staff } from '@/types/database';

type CableSectionTab = 'Subscribers' | 'Billing';

export default function CablePage({ staff }: { staff: Staff }) {
  const [tab, setTab] = useState<CableSectionTab>('Subscribers');

  return (
    <div className="page">
      <Tabs
        value={tab}
        onChange={(value) => setTab(value as CableSectionTab)}
        items={[
          { value: 'Subscribers', label: 'Subscribers' },
          { value: 'Billing', label: 'Billing' },
        ]}
      />
      <div style={{ marginTop: 18 }}>
        {tab === 'Subscribers' ? <CableSubscribersTab /> : <CableBillingTab staff={staff} />}
      </div>
    </div>
  );
}