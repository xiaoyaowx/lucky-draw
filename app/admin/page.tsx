'use client';

import { useState } from 'react';
import RoundManager from './components/RoundManager';
import PrizeManager from './components/PrizeManager';
import PoolManager from './components/PoolManager';
import ConfigPanel from './components/ConfigPanel';
import LanguageSwitch from '../components/LanguageSwitch';
import { useI18n } from '@/lib/i18n/useI18n';
import type { TranslationKey } from '@/lib/i18n';

type TabType = 'rounds' | 'prizes' | 'pool' | 'config';

export default function AdminPage() {
  const { t } = useI18n('admin');
  const [activeTab, setActiveTab] = useState<TabType>('rounds');

  const tabs: { id: TabType; labelKey: TranslationKey }[] = [
    { id: 'rounds', labelKey: 'admin.tabRounds' },
    { id: 'prizes', labelKey: 'admin.tabPrizes' },
    { id: 'pool', labelKey: 'admin.tabPool' },
    { id: 'config', labelKey: 'admin.tabConfig' },
  ];

  return (
    <div className="admin-container">
      <div className="admin-header">
        <h1 className="admin-title">{t('admin.title')}</h1>
        <LanguageSwitch scope="admin" className="lang-switch-inline" />
      </div>

      <div className="admin-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {t(tab.labelKey)}
          </button>
        ))}
      </div>

      <div className="admin-content">
        {activeTab === 'rounds' && <RoundManager />}
        {activeTab === 'prizes' && <PrizeManager />}
        {activeTab === 'pool' && <PoolManager />}
        {activeTab === 'config' && <ConfigPanel />}
      </div>
    </div>
  );
}
