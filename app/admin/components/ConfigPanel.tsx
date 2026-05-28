'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

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
  backgroundImage?: string;
  participantSchema?: ParticipantSchema;
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
  poolBindings?: PoolBinding[];
}

type PoolFieldType = 'text' | 'number' | 'phone' | 'email' | 'select';
type SettingSection = 'basic' | 'participants' | 'display' | 'calibration';

interface PoolFieldDefinition {
  key: string;
  label: string;
  type: PoolFieldType;
  required: boolean;
  unique?: boolean;
  visible?: boolean;
  searchable?: boolean;
  mask?: 'none' | 'phone';
}

interface ParticipantSchema {
  schemaVersion: 2;
  fields: PoolFieldDefinition[];
  uniqueField: string;
  displayTemplate: string;
}

interface PoolBinding {
  poolId: string;
  probability: number;
}

interface Round {
  id: number;
  name: string;
  poolType?: 'preset' | 'live';
  poolBindings?: PoolBinding[];
  prizes: Prize[];
}

interface UserPool {
  id: string;
  name: string;
  numbers: string[];
  members?: { id: string; values: Record<string, string> }[];
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

const DEFAULT_PARTICIPANT_SCHEMA: ParticipantSchema = {
  schemaVersion: 2,
  uniqueField: 'number',
  displayTemplate: '{number}',
  fields: [
    {
      key: 'number',
      label: '号码',
      type: 'text',
      required: true,
      unique: true,
      visible: true,
      searchable: true,
      mask: 'none',
    },
  ],
};

export default function ConfigPanel() {
  const [config, setConfig] = useState<Config | null>(null);
  const [allPrizes, setAllPrizes] = useState<Prize[]>([]);
  const [calPrizeId, setCalPrizeId] = useState('');
  const [calNumbers, setCalNumbers] = useState('');
  const [calMessage, setCalMessage] = useState('');
  const [numberPool, setNumberPool] = useState<string[]>([]);
  const [userPools, setUserPools] = useState<UserPool[]>([]);
  const [schemaMessage, setSchemaMessage] = useState('');
  const [activeSection, setActiveSection] = useState<SettingSection>('basic');
  const [backgroundUploading, setBackgroundUploading] = useState(false);
  const [backgroundDragging, setBackgroundDragging] = useState(false);
  const backgroundInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/admin/config')
      .then(res => res.json())
      .then(data => setConfig(data.config));
    fetch('/api/admin/rounds')
      .then(res => res.json())
      .then(data => {
        const prizes: Prize[] = [];
        (data.rounds || []).forEach((r: Round) =>
          (r.prizes || []).forEach(p => prizes.push({ ...p, poolType: r.poolType, poolBindings: r.poolBindings }))
        );
        setAllPrizes(prizes);
      });
    fetch('/api/admin/user-pools')
      .then(res => res.json())
      .then(data => {
        const pools = data.pools || [];
        setUserPools(pools);
        setNumberPool(Array.from(new Set(pools.flatMap((pool: UserPool) => pool.numbers || []))));
      });
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

  const saveBackgroundImage = useCallback(async (backgroundImage: string) => {
    if (!config) return;
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ backgroundImage }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || '保存底图失败');
      return;
    }
    setConfig(data.config);
  }, [config]);

  const uploadBackgroundFile = useCallback(async (file: File) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert('仅支持 jpg/png/gif/webp 格式');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('文件大小不能超过 5MB');
      return;
    }

    setBackgroundUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('scope', 'background');
      const res = await fetch('/api/admin/upload', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok || !data.url) {
        alert(data.error || '上传失败');
        return;
      }
      await saveBackgroundImage(data.url);
    } catch {
      alert('上传失败');
    } finally {
      setBackgroundUploading(false);
    }
  }, [saveBackgroundImage]);

  const handleBackgroundUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadBackgroundFile(file);
    if (backgroundInputRef.current) backgroundInputRef.current.value = '';
  };

  const handleBackgroundDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setBackgroundDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) uploadBackgroundFile(file);
  }, [uploadBackgroundFile]);

  const participantSchema = config?.participantSchema || DEFAULT_PARTICIPANT_SCHEMA;

  const updateParticipantSchemaLocal = (participantSchema: ParticipantSchema) => {
    if (!config) return;
    setConfig({ ...config, participantSchema });
  };

  const handleFieldChange = (index: number, patch: Partial<PoolFieldDefinition>) => {
    const fields = participantSchema.fields.map((field, i) => i === index ? { ...field, ...patch } : field);
    updateParticipantSchemaLocal({ ...participantSchema, fields });
  };

  const handleAddField = () => {
    const nextIndex = participantSchema.fields.length + 1;
    updateParticipantSchemaLocal({
      ...participantSchema,
      fields: [
        ...participantSchema.fields,
        {
          key: `field${nextIndex}`,
          label: `字段${nextIndex}`,
          type: 'text',
          required: false,
          visible: true,
          searchable: true,
          mask: 'none',
        },
      ],
    });
  };

  const handleRemoveField = (index: number) => {
    const field = participantSchema.fields[index];
    if (!field || field.key === participantSchema.uniqueField) return;
    updateParticipantSchemaLocal({
      ...participantSchema,
      fields: participantSchema.fields.filter((_, i) => i !== index),
    });
  };

  const handleSaveParticipantSchema = async () => {
    if (!config) return;
    setSchemaMessage('');
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantSchema }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSchemaMessage(data.error || '保存失败');
      return;
    }
    setConfig(data.config);
    setSchemaMessage('已保存');
  };

  if (!config) return <div>加载中...</div>;

  const fontSizes = config.fontSizes || DEFAULT_FONT_SIZES;
  const fontColors = config.fontColors || DEFAULT_FONT_COLORS;
  const displaySettings = config.displaySettings || { showQuantity: true, showSponsor: true, showNumberBorder: true, maskPhone: false };
  const backgroundImage = config.backgroundImage || '/bg.jpg';
  const settingsNav: { id: SettingSection; label: string; description: string }[] = [
    { id: 'basic', label: '基本设置', description: '中奖规则与布局数量' },
    { id: 'participants', label: '参与者字段', description: `${participantSchema.fields.length} 个字段` },
    { id: 'display', label: '展示样式', description: '显示项、颜色、字体' },
    { id: 'calibration', label: '抽样校准', description: `${Object.keys(config.calibration || {}).length} 个奖项` },
  ];

  return (
    <div className="manager-panel">
      <h2>系统设置</h2>

      <div className="settings-layout">
        <aside className="settings-sidebar" aria-label="系统设置分组">
          {settingsNav.map(item => (
            <button
              key={item.id}
              type="button"
              className={`settings-nav-item ${activeSection === item.id ? 'active' : ''}`}
              onClick={() => setActiveSection(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.description}</small>
            </button>
          ))}
        </aside>

        <section className="settings-content">
          {activeSection === 'basic' && (
            <div className="settings-section-stack">
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
            </div>
          )}

          {activeSection === 'participants' && (
            <div className="settings-section-stack">
              <div className="admin-card">
                <div className="admin-card-header">参与者字段</div>
        <p className="config-hint" style={{ marginTop: 0 }}>
          默认只使用号码字段。新增字段后，所有用户池、签到登记、中奖展示和导出都会按这套字段规范处理。
        </p>

        <div className="participant-schema-controls">
          <label>
            <span>唯一字段</span>
            <select
              value={participantSchema.uniqueField}
              onChange={(e) => updateParticipantSchemaLocal({ ...participantSchema, uniqueField: e.target.value })}
            >
              {participantSchema.fields.map(field => (
                <option key={field.key} value={field.key}>{field.label} ({field.key})</option>
              ))}
            </select>
            <small></small>
          </label>

          <label>
            <span>展示模板</span>
            <input
              value={participantSchema.displayTemplate}
              onChange={(e) => updateParticipantSchemaLocal({ ...participantSchema, displayTemplate: e.target.value })}
              placeholder="{number}"
            />
            <small>例如 {'{name}（{number}）'}</small>
          </label>
        </div>

        <div className="participant-fields">
          <div className="participant-field-header" aria-hidden="true">
            <span>字段 Key</span>
            <span>显示名称</span>
            <span>类型</span>
            <span>选项</span>
            <span>脱敏</span>
            <span>操作</span>
          </div>
          {participantSchema.fields.map((field, index) => (
            <div
              key={`participant-field-${index}`}
              className="participant-field-row"
            >
              <label className="participant-field-cell">
                <span>字段 Key</span>
                <input
                  value={field.key}
                  onChange={(e) => handleFieldChange(index, { key: e.target.value })}
                  placeholder="字段 key"
                  disabled={field.key === participantSchema.uniqueField}
                />
              </label>
              <label className="participant-field-cell">
                <span>显示名称</span>
                <input
                  value={field.label}
                  onChange={(e) => handleFieldChange(index, { label: e.target.value })}
                  placeholder="显示名称"
                />
              </label>
              <label className="participant-field-cell">
                <span>类型</span>
                <select
                  value={field.type}
                  onChange={(e) => handleFieldChange(index, { type: e.target.value as PoolFieldType })}
                >
                  <option value="text">文本</option>
                  <option value="number">数字</option>
                  <option value="phone">手机号</option>
                  <option value="email">邮箱</option>
                  <option value="select">选项</option>
                </select>
              </label>
              <div className="participant-field-options">
                <label>
                  <input
                    type="checkbox"
                    checked={field.required || field.key === participantSchema.uniqueField}
                    disabled={field.key === participantSchema.uniqueField}
                    onChange={(e) => handleFieldChange(index, { required: e.target.checked })}
                  />
                  必填
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={field.visible ?? true}
                    onChange={(e) => handleFieldChange(index, { visible: e.target.checked })}
                  />
                  展示
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={field.searchable ?? true}
                    onChange={(e) => handleFieldChange(index, { searchable: e.target.checked })}
                  />
                  搜索
                </label>
              </div>
              <label className="participant-field-cell">
                <span>脱敏</span>
                <select
                  value={field.mask || 'none'}
                  onChange={(e) => handleFieldChange(index, { mask: e.target.value as 'none' | 'phone' })}
                >
                  <option value="none">不脱敏</option>
                  <option value="phone">手机号脱敏</option>
                </select>
              </label>
              <button
                className="btn-danger btn-sm participant-field-delete"
                onClick={() => handleRemoveField(index)}
                disabled={field.key === participantSchema.uniqueField}
              >
                删除
              </button>
            </div>
          ))}
        </div>

        <div className="btns" style={{ marginTop: 14 }}>
          <button onClick={handleAddField}>新增字段</button>
          <button className="btn-primary" onClick={handleSaveParticipantSchema}>保存字段设置</button>
        </div>
        {schemaMessage && (
          <p style={{ color: schemaMessage === '已保存' ? '#4ade80' : '#ff6b6b', fontSize: 13, marginTop: 10 }}>
            {schemaMessage}
          </p>
        )}
      </div>
            </div>
          )}

          {activeSection === 'display' && (
            <div className="settings-section-stack">
              <div className="admin-card">
                <div className="admin-card-header">抽奖底图</div>
                <p className="config-hint" style={{ marginTop: 0 }}>
                  用于大屏抽奖展示页，嘉宾抽奖页不使用底图。
                </p>
                <input
                  ref={backgroundInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  onChange={handleBackgroundUpload}
                  style={{ display: 'none' }}
                />
                {backgroundImage ? (
                  <div className="upload-preview background-preview">
                    <img src={backgroundImage} alt="抽奖底图" />
                    <div className="upload-preview-actions">
                      <button
                        type="button"
                        onClick={() => backgroundInputRef.current?.click()}
                        disabled={backgroundUploading}
                      >
                        更换
                      </button>
                      {backgroundImage !== '/bg.jpg' && (
                        <button
                          type="button"
                          className="btn-danger btn-sm"
                          onClick={() => saveBackgroundImage('/bg.jpg')}
                          disabled={backgroundUploading}
                        >
                          恢复默认
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div
                    className={`upload-dropzone${backgroundDragging ? ' dragover' : ''}${backgroundUploading ? ' uploading' : ''}`}
                    onClick={() => !backgroundUploading && backgroundInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setBackgroundDragging(true); }}
                    onDragLeave={() => setBackgroundDragging(false)}
                    onDrop={handleBackgroundDrop}
                  >
                    {backgroundUploading ? (
                      <>
                        <svg className="upload-spinner" viewBox="0 0 24 24" width="28" height="28">
                          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeDasharray="50 20" />
                        </svg>
                        <span>上传中...</span>
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M12 16V4m0 0L8 8m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M20 16v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2" strokeLinecap="round" />
                        </svg>
                        <span>点击或拖拽底图到此处</span>
                        <span style={{ fontSize: 11, opacity: 0.5 }}>jpg / png / gif / webp, 最大 5MB</span>
                      </>
                    )}
                  </div>
                )}
              </div>

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
            </div>
          )}

          {activeSection === 'calibration' && (
            <div className="settings-section-stack">
              <div className="admin-card">
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
            const bindings = selectedPrize?.poolBindings || [{
              poolId: selectedPrize?.poolType === 'live' ? 'live' : 'default',
              probability: 100,
            }];
            const includesLive = bindings.some(binding => binding.poolId === 'live');
            const boundNumbers = new Set(
              userPools
                .filter(pool => bindings.some(binding => binding.poolId === pool.id))
                .flatMap(pool => pool.numbers)
            );
            const validNumbers = boundNumbers.size > 0 ? boundNumbers : new Set(numberPool);
            if (!includesLive) {
              const invalid = numbers.filter(n => !validNumbers.has(n));
              if (invalid.length > 0) {
                setCalMessage(`以下号码不在当前绑定用户池中: ${invalid.join(', ')}`);
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
          )}
        </section>
      </div>
    </div>
  );
}
