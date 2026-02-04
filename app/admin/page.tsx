'use client';

import { useState } from 'react';
import RoundManager from './components/RoundManager';
import PrizeManager from './components/PrizeManager';
import PoolManager from './components/PoolManager';
import ConfigPanel from './components/ConfigPanel';

type TabType = 'rounds' | 'prizes' | 'pool' | 'config';

export default function AdminPage() {
  const [activeTab, setActiveTab] = useState<TabType>('rounds');

  const tabs = [
    { id: 'rounds', label: '轮次管理' },
    { id: 'prizes', label: '奖品管理' },
    { id: 'pool', label: '用户池' },
    { id: 'config', label: '系统设置' },
  ];

  return (
    <div className="admin-container">
      <h1 className="admin-title">抽奖系统管理</h1>

      <div className="admin-tabs">
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id as TabType)}
          >
            {tab.label}
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
