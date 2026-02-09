'use client';

import { useState, useEffect } from 'react';

interface LivePoolData {
  isOpen: boolean;
  registrations: string[];
  count: number;
  registerSettings?: {
    length: number;
    allowLetters: boolean;
  };
}

const DEFAULT_REGISTER_SETTINGS = {
  length: 6,
  allowLetters: false,
};

export default function LivePoolManager() {
  const [pool, setPool] = useState<LivePoolData>({
    isOpen: false,
    registrations: [],
    count: 0,
    registerSettings: DEFAULT_REGISTER_SETTINGS,
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchPool();
  }, []);

  const fetchPool = async () => {
    try {
      const res = await fetch('/api/register');
      const data = await res.json();
      setPool({
        ...data,
        registerSettings: data.registerSettings || DEFAULT_REGISTER_SETTINGS,
      });
    } catch {
      // ignore
    }
  };

  const updateRegisterSettings = async (settings: { length: number; allowLetters: boolean }) => {
    await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ registerSettings: settings }),
    });
  };

  const toggleOpen = async () => {
    setLoading(true);
    try {
      await fetch('/api/register', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isOpen: !pool.isOpen }),
      });
      fetchPool();
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!confirm('确定要清空所有登记记录吗？')) return;
    setLoading(true);
    try {
      await fetch('/api/register', { method: 'DELETE' });
      fetchPool();
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterLengthChange = async (value: number) => {
    if (!Number.isFinite(value) || value < 1 || value > 20) return;
    const currentSettings = pool.registerSettings || DEFAULT_REGISTER_SETTINGS;
    const newSettings = {
      ...DEFAULT_REGISTER_SETTINGS,
      ...currentSettings,
      length: value,
    };
    setLoading(true);
    try {
      await updateRegisterSettings(newSettings);
      setPool(prev => ({ ...prev, registerSettings: newSettings }));
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterAllowLettersChange = async () => {
    const currentSettings = pool.registerSettings || DEFAULT_REGISTER_SETTINGS;
    const newSettings = {
      ...DEFAULT_REGISTER_SETTINGS,
      ...currentSettings,
      allowLetters: !currentSettings.allowLetters,
    };
    setLoading(true);
    try {
      await updateRegisterSettings(newSettings);
      setPool(prev => ({ ...prev, registerSettings: newSettings }));
    } finally {
      setLoading(false);
    }
  };

  const registerSettings = pool.registerSettings || DEFAULT_REGISTER_SETTINGS;

  return (
    <div className="manager-panel">
      <h2>签到登记管理</h2>

      {/* 登记状态 */}
      <div className="admin-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>登记状态</span>
            <span className={`status-tag ${pool.isOpen ? 'open' : 'closed'}`}>
              {pool.isOpen ? '已开启' : '已关闭'}
            </span>
          </div>
          <button
            className={pool.isOpen ? 'btn-danger' : 'btn-primary'}
            onClick={toggleOpen}
            disabled={loading}
          >
            {pool.isOpen ? '关闭登记' : '开启登记'}
          </button>
        </div>

        <div style={{
          marginTop: 14,
          padding: '10px 14px',
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 8,
          fontSize: 13,
        }}>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>登记链接：</span>
          <code style={{ color: '#ffd700', wordBreak: 'break-all' }}>
            {typeof window !== 'undefined' ? `${window.location.origin}/register` : '/register'}
          </code>
        </div>
      </div>

      {/* 登记设置 */}
      <div className="admin-card">
        <div className="admin-card-header">登记设置</div>
        <div className="form-row">
          <label>工号位数</label>
          <input
            type="number"
            min="1"
            max="20"
            value={registerSettings.length}
            onChange={(e) => handleRegisterLengthChange(parseInt(e.target.value))}
            style={{ width: 70 }}
            disabled={loading}
          />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>1 ~ 20</span>
        </div>
        <div className="form-row">
          <label>允许字母</label>
          <input
            type="checkbox"
            checked={registerSettings.allowLetters}
            onChange={handleRegisterAllowLettersChange}
            disabled={loading}
          />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            开启后允许字母和数字混合输入
          </span>
        </div>
      </div>

      {/* 已登记列表 */}
      <div className="admin-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="admin-card-header" style={{ marginBottom: 0 }}>
            已登记工号
            <span className="badge" style={{ background: 'rgba(255,215,0,0.12)', color: '#ffd700' }}>
              {pool.count} 人
            </span>
            <button
              className="btn-ghost btn-sm"
              onClick={fetchPool}
              disabled={loading}
              title="刷新"
              style={{ marginLeft: 4, padding: '2px 8px', fontSize: 14 }}
            >
              &#x21bb;
            </button>
          </div>
          <button
            className="btn-danger btn-sm"
            onClick={handleClear}
            disabled={loading || pool.count === 0}
          >
            清空登记
          </button>
        </div>

        {pool.registrations.length > 0 ? (
          <div style={{
            maxHeight: 280,
            overflowY: 'auto',
            padding: 14,
            background: 'rgba(0,0,0,0.2)',
            borderRadius: 8,
            fontFamily: "'Courier New', monospace",
            fontSize: 13,
            color: 'rgba(255,255,255,0.7)',
            lineHeight: 1.8,
          }}>
            {pool.registrations.join(', ')}
          </div>
        ) : (
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 24 }}>
            暂无登记记录
          </p>
        )}
      </div>
    </div>
  );
}
