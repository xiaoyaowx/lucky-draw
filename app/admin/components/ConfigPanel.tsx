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
    showNumberBorder?: boolean;
    maskPhone?: boolean;
  };
  fontColors?: FontColorConfig;
  calibration?: Record<string, string[]>;
}

interface Prize {
  id: string;
  level: string;
  name: string;
  poolType?: 'preset' | 'live';
}

interface Round {
  id: number;
  name: string;
  poolType?: 'preset' | 'live';
  prizes: Prize[];
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
  const [allPrizes, setAllPrizes] = useState<Prize[]>([]);
  const [calPrizeId, setCalPrizeId] = useState('');
  const [calNumbers, setCalNumbers] = useState('');
  const [calMessage, setCalMessage] = useState('');
  const [numberPool, setNumberPool] = useState<string[]>([]);

  useEffect(() => {
    fetch('/api/admin/config')
      .then(res => res.json())
      .then(data => setConfig(data.config));
    fetch('/api/admin/rounds')
      .then(res => res.json())
      .then(data => {
        const prizes: Prize[] = [];
        (data.rounds || []).forEach((r: Round) =>
          (r.prizes || []).forEach(p => prizes.push({ ...p, poolType: r.poolType }))
        );
        setAllPrizes(prizes);
      });
    fetch('/api/admin/pool')
      .then(res => res.json())
      .then(data => setNumberPool(data.numberPool || []));
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

  const handleDisplaySettingChange = async (key: 'showQuantity' | 'showSponsor' | 'showNumberBorder' | 'maskPhone') => {
    if (!config) return;
    const defaults = { showQuantity: true, showSponsor: true, showNumberBorder: true, maskPhone: false };
    const currentSettings = { ...defaults, ...config.displaySettings };
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
  const displaySettings = config.displaySettings || { showQuantity: true, showSponsor: true, showNumberBorder: true, maskPhone: false };

  return (
    <div className="manager-panel">
      <h2>系统设置</h2>

      {/* 基本设置 */}
      <div className="admin-card">
        <div className="admin-card-header">基本设置</div>

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
            每行显示数量
            <input
              type="number"
              min="1"
              max="20"
              value={config.numbersPerRow || 10}
              onChange={(e) => handleNumbersPerRowChange(parseInt(e.target.value))}
              style={{ width: 60 }}
            />
          </label>
          <p className="config-hint">抽奖展示页面每行显示的号码数量（1-20）</p>
        </div>
      </div>

      {/* 显示设置 */}
      <div className="admin-card">
        <div className="admin-card-header">显示设置</div>

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

        <div className="config-item" style={{ marginBottom: 0 }}>
          <label>
            <input
              type="checkbox"
              checked={displaySettings.showSponsor}
              onChange={() => handleDisplaySettingChange('showSponsor')}
            />
            显示赞助商
          </label>
        </div>

        <div className="config-item" style={{ marginBottom: 0, marginTop: 16 }}>
          <label>
            <input
              type="checkbox"
              checked={displaySettings.showNumberBorder ?? true}
              onChange={() => handleDisplaySettingChange('showNumberBorder')}
            />
            显示号码边框
          </label>
        </div>

        <div className="config-item" style={{ marginBottom: 0, marginTop: 16 }}>
          <label>
            <input
              type="checkbox"
              checked={displaySettings.maskPhone ?? false}
              onChange={() => handleDisplaySettingChange('maskPhone')}
            />
            隐藏手机号中间四位
          </label>
          <p className="config-hint">开启后 11 位号码显示为 138****8000</p>
        </div>
      </div>

      {/* 字体颜色 */}
      <div className="admin-card">
        <div className="admin-card-header">字体颜色</div>

        <div className="form-row">
          <label>奖品名称</label>
          <input
            type="color"
            value={fontColors.prizeName}
            onChange={(e) => handleColorChange('prizeName', e.target.value)}
          />
          <span className="color-hex">{fontColors.prizeName}</span>
        </div>

        <div className="form-row">
          <label>赞助商</label>
          <input
            type="color"
            value={fontColors.sponsor}
            onChange={(e) => handleColorChange('sponsor', e.target.value)}
          />
          <span className="color-hex">{fontColors.sponsor}</span>
        </div>

        <div className="form-row">
          <label>抽奖号码</label>
          <input
            type="color"
            value={fontColors.numberCard}
            onChange={(e) => handleColorChange('numberCard', e.target.value)}
          />
          <span className="color-hex">{fontColors.numberCard}</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>(含边框)</span>
        </div>
      </div>

      {/* 字体大小 */}
      <div className="admin-card">
        <div className="admin-card-header">字体大小</div>

        {([
          ['prizeLevel', '奖项等级'],
          ['prizeName', '奖品名称'],
          ['sponsor', '赞助商'],
          ['numberCard', '抽奖号码'],
        ] as [keyof FontSizeConfig, string][]).map(([key, label]) => (
          <div className="form-row" key={key}>
            <label>{label}</label>
            <input
              type="number"
              min="10"
              max="200"
              value={fontSizes[key]}
              onChange={(e) => handleFontSizeChange(key, parseInt(e.target.value))}
              style={{ width: 70 }}
            />
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>px</span>
          </div>
        ))}
        <p className="config-hint">设置展示页面的字体大小（10-200px），修改后自动保存</p>
      </div>

      {/* 号码池信息 */}
      <div className="config-info">
        <div className="admin-card-header">当前号码池配置</div>
        <p>类型：{config.numberPoolConfig.type}</p>
        <p>范围：{config.numberPoolConfig.start} - {config.numberPoolConfig.end}</p>
        <p>包含排除：{(config.numberPoolConfig.excludeContains || config.numberPoolConfig.excludePatterns || []).join(', ') || '无'}</p>
        <p>精确排除：{(config.numberPoolConfig.excludeExact || []).join(', ') || '无'}</p>
      </div>

      {/* 抽样校准 */}
      <div className="admin-card" style={{ marginTop: 16 }}>
        <div className="admin-card-header">抽样校准</div>
        <p className="config-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          设置指定奖项的校准样本序列，用于结果验证
        </p>

        <div className="prize-form" style={{ marginBottom: 12 }}>
          <select
            value={calPrizeId}
            onChange={e => setCalPrizeId(e.target.value)}
            style={{ flex: '0 0 auto', minWidth: 140 }}
          >
            <option value="">选择奖项</option>
            {allPrizes.map(p => (
              <option key={p.id} value={p.id}>{p.level} - {p.name}</option>
            ))}
          </select>
          <input
            placeholder="号码，逗号分隔"
            value={calNumbers}
            onChange={e => setCalNumbers(e.target.value)}
            style={{ flex: 1 }}
          />
          <button className="btn-primary" onClick={async () => {
            if (!calPrizeId || !calNumbers.trim()) return;
            const numbers = calNumbers.split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
            if (numbers.length === 0) return;
            const selectedPrize = allPrizes.find(p => p.id === calPrizeId);
            if (selectedPrize?.poolType !== 'live') {
              const invalid = numbers.filter(n => !numberPool.includes(n));
              if (invalid.length > 0) {
                setCalMessage(`以下号码不在当前号码池中: ${invalid.join(', ')}`);
                return;
              }
            }
            setCalMessage('');
            const newCal = { ...config.calibration, [calPrizeId]: numbers };
            await fetch('/api/admin/config', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ calibration: newCal }),
            });
            setConfig({ ...config, calibration: newCal });
            setCalPrizeId('');
            setCalNumbers('');
          }}>设置</button>
        </div>

        {calMessage && (
          <p style={{ color: '#ff6b6b', fontSize: 13, margin: '0 0 12px' }}>{calMessage}</p>
        )}

        {config.calibration && Object.keys(config.calibration).length > 0 && (
          <ul className="item-list" style={{ marginTop: 8 }}>
            {Object.entries(config.calibration).map(([pid, nums]) => {
              const prize = allPrizes.find(p => p.id === pid);
              return (
                <li key={pid}>
                  <span>{prize ? `${prize.level} - ${prize.name}` : pid}</span>
                  <span style={{ color: 'rgba(255,255,255,0.5)', fontFamily: "'Courier New', monospace", fontSize: 13 }}>{nums.join(', ')}</span>
                  <button className="btn-danger btn-sm" onClick={async () => {
                    const newCal = { ...config.calibration };
                    delete newCal[pid];
                    await fetch('/api/admin/config', {
                      method: 'PUT',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ calibration: Object.keys(newCal).length > 0 ? newCal : {} }),
                    });
                    setConfig({ ...config, calibration: Object.keys(newCal).length > 0 ? newCal : undefined });
                  }}>清除</button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
