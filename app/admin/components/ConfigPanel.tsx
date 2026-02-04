'use client';

import { useState, useEffect } from 'react';

interface FontSizeConfig {
  prizeLevel: number;
  prizeName: number;
  sponsor: number;
  numberCard: number;
}

interface FontColorConfig {
  prizeName: string;
  sponsor: string;
  numberCard: string;
}

interface Config {
  allowRepeatWin: boolean;
  numbersPerRow: number;
  numberPoolConfig: {
    type: 'auto' | 'manual';
    start?: number;
    end?: number;
    excludePatterns?: string[];
    excludeContains?: string[];
    excludeExact?: string[];
  };
  fontSizes?: FontSizeConfig;
  displaySettings?: {
    showQuantity: boolean;
    showSponsor: boolean;
  };
  fontColors?: FontColorConfig;
}

const DEFAULT_FONT_SIZES: FontSizeConfig = {
  prizeLevel: 56,
  prizeName: 42,
  sponsor: 28,
  numberCard: 38,
};

const DEFAULT_FONT_COLORS: FontColorConfig = {
  prizeName: '#ffffff',
  sponsor: '#eeeeee',
  numberCard: '#ffd700',
};

export default function ConfigPanel() {
  const [config, setConfig] = useState<Config | null>(null);

  useEffect(() => {
    fetch('/api/admin/config')
      .then(res => res.json())
      .then(data => setConfig(data.config));
  }, []);

  const handleToggle = async () => {
    if (!config) return;
    const newConfig = { ...config, allowRepeatWin: !config.allowRepeatWin };
    await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ allowRepeatWin: newConfig.allowRepeatWin }),
    });
    setConfig(newConfig);
  };

  const handleNumbersPerRowChange = async (value: number) => {
    if (!config || value < 1 || value > 20) return;
    await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numbersPerRow: value }),
    });
    setConfig({ ...config, numbersPerRow: value });
  };

  const handleFontSizeChange = async (key: keyof FontSizeConfig, value: number) => {
    if (!config || value < 10 || value > 200) return;
    const newFontSizes = {
      ...DEFAULT_FONT_SIZES,
      ...config.fontSizes,
      [key]: value,
    };
    await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fontSizes: newFontSizes }),
    });
    setConfig({ ...config, fontSizes: newFontSizes });
  };

  const handleDisplaySettingChange = async (key: 'showQuantity' | 'showSponsor') => {
    if (!config) return;
    const currentSettings = config.displaySettings || { showQuantity: true, showSponsor: true };
    const newSettings = {
      ...currentSettings,
      [key]: !currentSettings[key],
    };
    await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displaySettings: newSettings }),
    });
    setConfig({ ...config, displaySettings: newSettings });
  };

  const handleColorChange = async (key: keyof FontColorConfig, value: string) => {
    if (!config) return;
    const newColors = {
      ...DEFAULT_FONT_COLORS,
      ...config.fontColors,
      [key]: value,
    };
    await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fontColors: newColors }),
    });
    setConfig({ ...config, fontColors: newColors });
  };

  if (!config) return <div>加载中...</div>;

  const fontSizes = config.fontSizes || DEFAULT_FONT_SIZES;
  const fontColors = config.fontColors || DEFAULT_FONT_COLORS;
  const displaySettings = config.displaySettings || { showQuantity: true, showSponsor: true };

  return (
    <div className="manager-panel">
      <h2>系统设置</h2>

      <div className="config-item">
        <label>
          <input
            type="checkbox"
            checked={config.allowRepeatWin}
            onChange={handleToggle}
          />
          允许重复中奖（跨奖项）
        </label>
        <p className="config-hint">
          {config.allowRepeatWin
            ? '已开启：同一号码可在不同奖项中重复中奖'
            : '已关闭：已中奖号码不能再次中奖'}
        </p>
      </div>

      <div className="config-item">
        <label>
          每行显示数量：
          <input
            type="number"
            min="1"
            max="20"
            value={config.numbersPerRow || 10}
            onChange={(e) => handleNumbersPerRowChange(parseInt(e.target.value))}
            style={{ width: '60px', marginLeft: '10px' }}
          />
        </label>
        <p className="config-hint">
          抽奖展示页面每行显示的号码数量（1-20）
        </p>
      </div>

      <h3 style={{ color: '#ffd700', marginTop: '24px', marginBottom: '16px' }}>显示设置</h3>

      <div className="config-item">
        <label>
          <input
            type="checkbox"
            checked={displaySettings.showQuantity}
            onChange={() => handleDisplaySettingChange('showQuantity')}
          />
          显示奖品数量
        </label>
      </div>

      <div className="config-item">
        <label>
          <input
            type="checkbox"
            checked={displaySettings.showSponsor}
            onChange={() => handleDisplaySettingChange('showSponsor')}
          />
          显示赞助商
        </label>
      </div>

      <h3 style={{ color: '#ffd700', marginTop: '24px', marginBottom: '16px' }}>字体颜色设置</h3>

      <div className="config-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
        <label style={{ width: '120px' }}>奖品名称颜色：</label>
        <input
          type="color"
          value={fontColors.prizeName}
          onChange={(e) => handleColorChange('prizeName', e.target.value)}
          style={{ width: '50px', height: '30px', padding: '0', border: 'none', cursor: 'pointer' }}
        />
        <span style={{ marginLeft: '10px', color: '#aaa', fontSize: '12px' }}>{fontColors.prizeName}</span>
      </div>

      <div className="config-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
        <label style={{ width: '120px' }}>赞助商颜色：</label>
        <input
          type="color"
          value={fontColors.sponsor}
          onChange={(e) => handleColorChange('sponsor', e.target.value)}
          style={{ width: '50px', height: '30px', padding: '0', border: 'none', cursor: 'pointer' }}
        />
        <span style={{ marginLeft: '10px', color: '#aaa', fontSize: '12px' }}>{fontColors.sponsor}</span>
      </div>

      <div className="config-item" style={{ display: 'flex', alignItems: 'center', marginBottom: '10px' }}>
        <label style={{ width: '120px' }}>抽奖号码颜色：</label>
        <input
          type="color"
          value={fontColors.numberCard}
          onChange={(e) => handleColorChange('numberCard', e.target.value)}
          style={{ width: '50px', height: '30px', padding: '0', border: 'none', cursor: 'pointer' }}
        />
        <span style={{ marginLeft: '10px', color: '#aaa', fontSize: '12px' }}>{fontColors.numberCard}</span>
        <span style={{ marginLeft: '10px', color: '#888', fontSize: '12px' }}>(同时应用于字体和边框)</span>
      </div>

      <h3 style={{ color: '#ffd700', marginTop: '24px', marginBottom: '16px' }}>字体大小设置</h3>

      <div className="config-item">
        <label>
          奖项等级：
          <input
            type="number"
            min="10"
            max="200"
            value={fontSizes.prizeLevel}
            onChange={(e) => handleFontSizeChange('prizeLevel', parseInt(e.target.value))}
            style={{ width: '60px', marginLeft: '10px' }}
          />
          <span style={{ marginLeft: '5px', color: 'rgba(255,255,255,0.6)' }}>px</span>
        </label>
      </div>

      <div className="config-item">
        <label>
          奖品名称：
          <input
            type="number"
            min="10"
            max="200"
            value={fontSizes.prizeName}
            onChange={(e) => handleFontSizeChange('prizeName', parseInt(e.target.value))}
            style={{ width: '60px', marginLeft: '10px' }}
          />
          <span style={{ marginLeft: '5px', color: 'rgba(255,255,255,0.6)' }}>px</span>
        </label>
      </div>

      <div className="config-item">
        <label>
          赞助商：
          <input
            type="number"
            min="10"
            max="200"
            value={fontSizes.sponsor}
            onChange={(e) => handleFontSizeChange('sponsor', parseInt(e.target.value))}
            style={{ width: '60px', marginLeft: '10px' }}
          />
          <span style={{ marginLeft: '5px', color: 'rgba(255,255,255,0.6)' }}>px</span>
        </label>
      </div>

      <div className="config-item">
        <label>
          抽奖号码：
          <input
            type="number"
            min="10"
            max="200"
            value={fontSizes.numberCard}
            onChange={(e) => handleFontSizeChange('numberCard', parseInt(e.target.value))}
            style={{ width: '60px', marginLeft: '10px' }}
          />
          <span style={{ marginLeft: '5px', color: 'rgba(255,255,255,0.6)' }}>px</span>
        </label>
      </div>

      <p className="config-hint" style={{ marginTop: '8px' }}>
        设置展示页面的字体大小（10-200px），修改后自动保存
      </p>

      <div className="config-info">
        <h3>当前号码池配置</h3>
        <p>类型：{config.numberPoolConfig.type}</p>
        <p>范围：{config.numberPoolConfig.start} - {config.numberPoolConfig.end}</p>
        <p>包含排除：{(config.numberPoolConfig.excludeContains || config.numberPoolConfig.excludePatterns || []).join(', ') || '无'}</p>
        <p>精确排除：{(config.numberPoolConfig.excludeExact || []).join(', ') || '无'}</p>
      </div>
    </div>
  );
}
