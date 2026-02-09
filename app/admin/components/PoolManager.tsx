'use client';

import { useState, useEffect } from 'react';
import LivePoolManager from './LivePoolManager';

type PoolTab = 'preset' | 'live';

function PresetPoolPanel() {
  const [pool, setPool] = useState<string[]>([]);
  const [manualInput, setManualInput] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [genConfig, setGenConfig] = useState({
    start: 1,
    end: 300,
    excludeContains: '4',    // 包含模式：排除所有包含该数字的号码
    excludeExact: '13',      // 精确模式：只排除精确等于该数字的号码
  });

  useEffect(() => {
    fetchPool();
    fetchConfig();
  }, []);

  const fetchPool = async () => {
    const res = await fetch('/api/admin/pool');
    const data = await res.json();
    setPool(data.numberPool || []);
  };

  const fetchConfig = async () => {
    const res = await fetch('/api/admin/config');
    const data = await res.json();
    if (data.config?.numberPoolConfig) {
      const cfg = data.config.numberPoolConfig;
      setGenConfig({
        start: cfg.start || 1,
        end: cfg.end || 300,
        // 兼容旧配置：如果只有 excludePatterns，则作为包含模式处理
        excludeContains: (cfg.excludeContains || cfg.excludePatterns || []).join(','),
        excludeExact: (cfg.excludeExact || []).join(','),
      });
    }
  };

  const handleManualSet = async () => {
    const numbers = manualInput.split(/[,\n\r\s]+/).filter(n => n);
    if (numbers.length === 0) return;
    await fetch('/api/admin/pool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numbers }),
    });
    setManualInput('');
    fetchPool();
  };

  const handleClear = async () => {
    if (!confirm('确定要清空号码池吗？')) return;
    await fetch('/api/admin/pool', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numbers: [] }),
    });
    fetchPool();
  };

  const handleGenerate = async () => {
    await fetch('/api/admin/pool/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start: genConfig.start,
        end: genConfig.end,
        excludeContains: genConfig.excludeContains.split(',').map(s => s.trim()).filter(s => s),
        excludeExact: genConfig.excludeExact.split(',').map(s => s.trim()).filter(s => s),
      }),
    });
    fetchPool();
  };

  return (
    <div className="manager-panel">
      <h2>用户池管理</h2>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <p className="stat-row" style={{ margin: 0 }}>当前号码数量：<span className="stat-value">{pool.length}</span></p>
        <button
          className="btn-danger btn-sm"
          onClick={handleClear}
          disabled={pool.length === 0}
        >
          清空号码池
        </button>
      </div>

      <div className="pool-section">
        <h3>自动生成</h3>
        <div className="gen-form">
          <label>起始：<input type="number" value={genConfig.start}
            onChange={e => setGenConfig({...genConfig, start: Number(e.target.value)})} /></label>
          <label>结束：<input type="number" value={genConfig.end}
            onChange={e => setGenConfig({...genConfig, end: Number(e.target.value)})} /></label>
          <label>
            包含排除：
            <input value={genConfig.excludeContains}
              onChange={e => setGenConfig({...genConfig, excludeContains: e.target.value})}
              placeholder="如: 4 (排除所有含4的号码)" />
          </label>
          <label>
            精确排除：
            <input value={genConfig.excludeExact}
              onChange={e => setGenConfig({...genConfig, excludeExact: e.target.value})}
              placeholder="如: 13 (只排除13)" />
          </label>
          <button onClick={handleGenerate}>生成</button>
        </div>
        <p className="config-hint" style={{ marginTop: 8 }}>
          包含排除：排除所有包含该数字的号码（如"4"会排除4,14,24,40,140...）<br/>
          精确排除：只排除精确等于该数字的号码（如"13"只排除13，保留113,130...）
        </p>
      </div>

      <div className="pool-section">
        <h3>批量导入</h3>
        <textarea
          value={manualInput}
          onChange={e => setManualInput(e.target.value)}
          placeholder="输入号码，逗号或换行分隔"
          rows={4}
        />
        <button onClick={handleManualSet}>导入</button>
      </div>

      <div className="pool-preview">
        <h3>
          当前号码池预览
          <button
            onClick={() => setExpanded(!expanded)}
            style={{ marginLeft: '10px', padding: '4px 12px', fontSize: '12px' }}
          >
            {expanded ? '收起' : '展开全部'}
          </button>
        </h3>
        <div className={`pool-numbers ${expanded ? 'expanded' : ''}`}>
          {expanded ? pool.join(', ') : (
            <>
              {pool.slice(0, 50).join(', ')}
              {pool.length > 50 && ` ... 共${pool.length}个`}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function PoolManager() {
  const [activeTab, setActiveTab] = useState<PoolTab>('preset');

  const tabs = [
    { id: 'preset', label: '预设池' },
    { id: 'live', label: '签到登记' },
  ];

  return (
    <div>
      <div className="admin-tabs" style={{ justifyContent: 'flex-start', marginBottom: 20, maxWidth: 260 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id as PoolTab)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'preset' ? <PresetPoolPanel /> : <LivePoolManager />}
    </div>
  );
}
