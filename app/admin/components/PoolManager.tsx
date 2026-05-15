'use client';

import { useEffect, useMemo, useState } from 'react';
import LivePoolManager from './LivePoolManager';

type PoolTab = 'preset' | 'live';
type PoolWorkMode = 'preview' | 'generate' | 'import';

interface UserPool {
  id: string;
  name: string;
  numbers: string[];
}

const DEFAULT_POOL_ID = 'default';

function PresetPoolPanel() {
  const [pools, setPools] = useState<UserPool[]>([]);
  const [selectedPoolId, setSelectedPoolId] = useState(DEFAULT_POOL_ID);
  const [newPoolName, setNewPoolName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [previewQuery, setPreviewQuery] = useState('');
  const [workMode, setWorkMode] = useState<PoolWorkMode>('preview');
  const [loading, setLoading] = useState(false);
  const [genConfig, setGenConfig] = useState({
    start: 1,
    end: 300,
    excludeContains: '4',
    excludeExact: '13',
  });

  const selectedPool = useMemo(
    () => pools.find(pool => pool.id === selectedPoolId) || pools[0],
    [pools, selectedPoolId],
  );

  const previewNumbers = useMemo(() => {
    if (!selectedPool) return [];
    const query = previewQuery.trim();
    if (!query) return selectedPool.numbers;
    return selectedPool.numbers.filter(number => number.includes(query));
  }, [selectedPool, previewQuery]);

  useEffect(() => {
    fetchPools();
    fetchConfig();
  }, []);

  useEffect(() => {
    if (selectedPool) {
      setRenameValue(selectedPool.name);
      setManualInput('');
      setPreviewQuery('');
      setWorkMode('preview');
    }
  }, [selectedPool?.id]);

  const fetchPools = async () => {
    const res = await fetch('/api/admin/user-pools');
    const data = await res.json();
    const nextPools = data.pools || [];
    setPools(nextPools);
    if (nextPools.length > 0 && !nextPools.some((pool: UserPool) => pool.id === selectedPoolId)) {
      setSelectedPoolId(nextPools[0].id);
    }
  };

  const fetchConfig = async () => {
    const res = await fetch('/api/admin/config');
    const data = await res.json();
    if (data.config?.numberPoolConfig) {
      const cfg = data.config.numberPoolConfig;
      setGenConfig({
        start: cfg.start || 1,
        end: cfg.end || 300,
        excludeContains: (cfg.excludeContains || cfg.excludePatterns || []).join(','),
        excludeExact: (cfg.excludeExact || []).join(','),
      });
    }
  };

  const updatePool = async (poolId: string, body: object) => {
    setLoading(true);
    try {
      await fetch(`/api/admin/user-pools/${poolId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      await fetchPools();
    } finally {
      setLoading(false);
    }
  };

  const handleAddPool = async () => {
    if (!newPoolName.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('/api/admin/user-pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newPoolName.trim(), numbers: [] }),
      });
      const data = await res.json();
      setNewPoolName('');
      await fetchPools();
      if (data.pool?.id) setSelectedPoolId(data.pool.id);
    } finally {
      setLoading(false);
    }
  };

  const handleRename = async () => {
    if (!selectedPool || !renameValue.trim() || renameValue.trim() === selectedPool.name) return;
    await updatePool(selectedPool.id, { name: renameValue.trim() });
  };

  const handleManualSet = async () => {
    if (!selectedPool) return;
    const numbers = manualInput.split(/[,\n\r\s]+/).map(n => n.trim()).filter(Boolean);
    if (numbers.length === 0) return;
    if (!confirm('导入会覆盖当前用户池号码，并清空已有抽奖记录，确定继续吗？')) return;
    await updatePool(selectedPool.id, { numbers });
    setManualInput('');
    setWorkMode('preview');
  };

  const handleGenerate = async () => {
    if (!selectedPool) return;
    if (!confirm('生成会覆盖当前用户池号码，并清空已有抽奖记录，确定继续吗？')) return;
    await updatePool(selectedPool.id, {
      generateConfig: {
        start: genConfig.start,
        end: genConfig.end,
        excludeContains: genConfig.excludeContains.split(',').map(s => s.trim()).filter(Boolean),
        excludeExact: genConfig.excludeExact.split(',').map(s => s.trim()).filter(Boolean),
      },
    });
    setWorkMode('preview');
  };

  const handleClear = async () => {
    if (!selectedPool || selectedPool.numbers.length === 0) return;
    if (!confirm('确定要清空当前用户池吗？已有抽奖记录也会清空。')) return;
    await updatePool(selectedPool.id, { numbers: [] });
  };

  const handleDelete = async () => {
    if (!selectedPool || selectedPool.id === DEFAULT_POOL_ID) return;
    if (!confirm(`确定删除用户池【${selectedPool.name}】？相关轮次绑定会移除，抽奖记录也会清空。`)) return;
    setLoading(true);
    try {
      await fetch(`/api/admin/user-pools/${selectedPool.id}`, { method: 'DELETE' });
      setSelectedPoolId(DEFAULT_POOL_ID);
      await fetchPools();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="manager-panel">
      <h2>用户池管理</h2>

      <div className="pool-workspace">
        <aside className="pool-sidebar">
          <div className="pool-sidebar-header">
            <span>预设用户池</span>
            <span className="pool-count-badge">{pools.length}</span>
          </div>
          <div className="pool-create-row">
            <input
              type="text"
              value={newPoolName}
              onChange={e => setNewPoolName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddPool(); }}
              placeholder="新用户池名称"
            />
            <button className="btn-primary" onClick={handleAddPool} disabled={loading || !newPoolName.trim()}>
              创建
            </button>
          </div>

          <div className="pool-list-panel">
            {pools.map(pool => (
              <button
                key={pool.id}
                type="button"
                className={`pool-list-item ${selectedPool?.id === pool.id ? 'active' : ''}`}
                onClick={() => setSelectedPoolId(pool.id)}
              >
                <span className="pool-list-name">
                  <span className="pool-list-title">{pool.name}</span>
                  {pool.id === DEFAULT_POOL_ID && <span className="status-tag closed">默认</span>}
                </span>
                <span className="pool-list-count">{pool.numbers.length} 人</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="pool-main">
          {selectedPool ? (
            <>
              <div className="pool-main-header">
                <div className="pool-title-block">
                  <div className="pool-title-row">
                    <input
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleRename(); }}
                      aria-label="用户池名称"
                    />
                    {selectedPool.id === DEFAULT_POOL_ID && <span className="status-tag closed">默认池</span>}
                  </div>
                  <div className="pool-meta">
                    <span>{selectedPool.numbers.length} 个号码</span>
                    <span>ID: {selectedPool.id}</span>
                  </div>
                </div>
                <div className="pool-header-actions">
                  <button onClick={handleRename} disabled={loading || !renameValue.trim() || renameValue.trim() === selectedPool.name}>
                    保存名称
                  </button>
                  <button
                    className="btn-danger"
                    onClick={handleClear}
                    disabled={loading || selectedPool.numbers.length === 0}
                  >
                    清空
                  </button>
                  <button
                    className="btn-danger"
                    onClick={handleDelete}
                    disabled={loading || selectedPool.id === DEFAULT_POOL_ID}
                  >
                    删除
                  </button>
                </div>
              </div>

              <div className="pool-mode-tabs">
                {([
                  ['preview', '号码预览'],
                  ['generate', '自动生成'],
                  ['import', '批量导入'],
                ] as [PoolWorkMode, string][]).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={workMode === mode ? 'active' : ''}
                    onClick={() => setWorkMode(mode)}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {workMode === 'preview' && (
                <div className="pool-action-panel">
                  <div className="pool-panel-title">
                    <span>号码预览</span>
                    <span>{previewNumbers.length} / {selectedPool.numbers.length}</span>
                  </div>
                  <input
                    value={previewQuery}
                    onChange={e => setPreviewQuery(e.target.value)}
                    placeholder="搜索号码"
                    className="pool-search-input"
                  />
                  <div className="pool-numbers pool-numbers-grid">
                    {previewNumbers.length === 0 ? (
                      <span className="pool-empty-text">没有匹配的号码</span>
                    ) : (
                      previewNumbers.map(number => <span key={number}>{number}</span>)
                    )}
                  </div>
                </div>
              )}

              {workMode === 'generate' && (
                <div className="pool-action-panel">
                  <div className="pool-panel-title">
                    <span>自动生成</span>
                    <span>覆盖当前池</span>
                  </div>
                  <div className="pool-generate-grid">
                    <label>
                      <span>起始</span>
                      <input
                        type="number"
                        value={genConfig.start}
                        onChange={e => setGenConfig({ ...genConfig, start: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      <span>结束</span>
                      <input
                        type="number"
                        value={genConfig.end}
                        onChange={e => setGenConfig({ ...genConfig, end: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      <span>包含排除</span>
                      <input
                        value={genConfig.excludeContains}
                        onChange={e => setGenConfig({ ...genConfig, excludeContains: e.target.value })}
                        placeholder="如: 4"
                      />
                    </label>
                    <label>
                      <span>精确排除</span>
                      <input
                        value={genConfig.excludeExact}
                        onChange={e => setGenConfig({ ...genConfig, excludeExact: e.target.value })}
                        placeholder="如: 13"
                      />
                    </label>
                  </div>
                  <div className="pool-action-footer">
                    <span>生成会覆盖当前用户池，并清空已有抽奖记录。</span>
                    <button className="btn-primary" onClick={handleGenerate} disabled={loading}>
                      生成到当前池
                    </button>
                  </div>
                </div>
              )}

              {workMode === 'import' && (
                <div className="pool-action-panel">
                  <div className="pool-panel-title">
                    <span>批量导入</span>
                    <span>{manualInput.split(/[,\n\r\s]+/).filter(Boolean).length} 个待导入</span>
                  </div>
                  <textarea
                    value={manualInput}
                    onChange={e => setManualInput(e.target.value)}
                    placeholder="输入号码，逗号、空格或换行分隔"
                    rows={10}
                  />
                  <div className="pool-action-footer">
                    <span>导入会覆盖当前用户池，并清空已有抽奖记录。</span>
                    <button className="btn-primary" onClick={handleManualSet} disabled={loading || !manualInput.trim()}>
                      导入到当前池
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="pool-empty-state">暂无用户池</div>
          )}
        </section>
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
