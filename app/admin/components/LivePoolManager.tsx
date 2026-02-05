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

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>
            登记状态：
            <span style={{ color: pool.isOpen ? '#4caf50' : '#f44336', fontWeight: 'bold' }}>
              {pool.isOpen ? '已开启' : '已关闭'}
            </span>
          </span>
          <button
            onClick={toggleOpen}
            disabled={loading}
            style={{
              background: pool.isOpen
                ? 'linear-gradient(135deg, #f44336, #d32f2f)'
                : 'linear-gradient(135deg, #4caf50, #388e3c)',
              color: '#fff',
            }}
          >
            {pool.isOpen ? '关闭登记' : '开启登记'}
          </button>
        </div>

        <div style={{ marginBottom: 16, padding: 12, background: 'rgba(0,0,0,0.2)', borderRadius: 8 }}>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 8 }}>
            登记页面链接（供用户扫码访问）：
          </p>
          <code style={{ color: '#ffd700', fontSize: 14, wordBreak: 'break-all' }}>
            {typeof window !== 'undefined' ? `${window.location.origin}/register` : '/register'}
          </code>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <h3 style={{ marginBottom: 12 }}>登记设置</h3>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)' }}>工号位数：</span>
          <input
            type="number"
            min="1"
            max="20"
            value={registerSettings.length}
            onChange={(e) => handleRegisterLengthChange(parseInt(e.target.value))}
            style={{ width: '70px' }}
            disabled={loading}
          />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>(1-20)</span>
        </div>
        <label style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', display: 'inline-flex', gap: 8 }}>
          <input
            type="checkbox"
            checked={registerSettings.allowLetters}
            onChange={handleRegisterAllowLettersChange}
            disabled={loading}
          />
          允许字母（A-Z）
        </label>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 8 }}>
          关闭时仅允许数字，开启后允许字母和数字混合
        </p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>已登记工号 ({pool.count} 人)</h3>
          <button
            onClick={handleClear}
            disabled={loading || pool.count === 0}
            style={{
              background: 'linear-gradient(135deg, #ff5722, #e64a19)',
              color: '#fff',
              fontSize: 12,
              padding: '6px 12px',
            }}
          >
            清空登记
          </button>
        </div>

        {pool.registrations.length > 0 ? (
          <div style={{
            maxHeight: 300,
            overflowY: 'auto',
            padding: 12,
            background: 'rgba(0,0,0,0.3)',
            borderRadius: 6,
            fontFamily: "'Courier New', monospace",
            fontSize: 13,
            color: 'rgba(255,255,255,0.8)',
            lineHeight: 1.8,
          }}>
            {pool.registrations.join('、')}
          </div>
        ) : (
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: 20 }}>
            暂无登记记录
          </p>
        )}
      </div>
    </div>
  );
}
