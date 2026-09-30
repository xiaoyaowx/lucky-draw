'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useI18n } from '@/lib/i18n/useI18n';

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

/** 面板内的操作反馈：成功用绿色、失败用红色，不再靠猜文案里有没有「失败」。 */
interface PanelMessage {
  kind: 'success' | 'error';
  text: string;
}

export default function ConfigPanel() {
  const { t } = useI18n('admin');
  const [config, setConfig] = useState<Config | null>(null);
  const [allPrizes, setAllPrizes] = useState<Prize[]>([]);
  const [calPrizeId, setCalPrizeId] = useState('');
  const [calNumbers, setCalNumbers] = useState('');
  const [calMessage, setCalMessage] = useState('');
  const [numberPool, setNumberPool] = useState<string[]>([]);
  const [userPools, setUserPools] = useState<UserPool[]>([]);
  const [schemaMessage, setSchemaMessage] = useState<PanelMessage | null>(null);
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
      alert(data.error || t('config.bgSaveFailed'));
      return;
    }
    setConfig(data.config);
  }, [config, t]);

  const uploadBackgroundFile = useCallback(async (file: File) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      alert(t('config.errorType'));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert(t('config.errorSize'));
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
        alert(data.error || t('config.errorUpload'));
        return;
      }
      await saveBackgroundImage(data.url);
    } catch {
      alert(t('config.errorUpload'));
    } finally {
      setBackgroundUploading(false);
    }
  }, [saveBackgroundImage, t]);

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
          // 默认标签按当前界面语言落库：这是管理员此刻能看到并会去修改的值
          label: t('config.fieldDefaultLabel', { n: nextIndex }),
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
    setSchemaMessage(null);
    const res = await fetch('/api/admin/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ participantSchema }),
    });
    const data = await res.json();
    if (!res.ok) {
      setSchemaMessage({ kind: 'error', text: data.error || t('config.saveFailed') });
      return;
    }
    setConfig(data.config);
    setSchemaMessage({ kind: 'success', text: t('config.saved') });
  };

  if (!config) return <div>{t('common.loading')}</div>;

  const fontSizes = config.fontSizes || DEFAULT_FONT_SIZES;
  const fontColors = config.fontColors || DEFAULT_FONT_COLORS;
  const displaySettings = config.displaySettings || { showQuantity: true, showSponsor: true, showNumberBorder: true, maskPhone: false };
  const backgroundImage = config.backgroundImage || '/bg.jpg';
  const settingsNav: { id: SettingSection; label: string; description: string }[] = [
    { id: 'basic', label: t('config.navBasic'), description: t('config.navBasicDesc') },
    { id: 'participants', label: t('config.navParticipants'), description: t('config.navParticipantsDesc', { n: participantSchema.fields.length }) },
    { id: 'display', label: t('config.navDisplay'), description: t('config.navDisplayDesc') },
    { id: 'calibration', label: t('config.navCalibration'), description: t('config.navCalibrationDesc', { n: Object.keys(config.calibration || {}).length }) },
  ];

  return (
    <div className="manager-panel">
      <h2>{t('config.title')}</h2>

      <div className="settings-layout">
        <aside className="settings-sidebar" aria-label={t('config.navAria')}>
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
                <div className="admin-card-header">{t('config.navBasic')}</div>

        <div className="config-item">
          <label>
            <input
              type="checkbox"
              checked={config.allowRepeatWin}
              onChange={handleToggle}
            />
            {t('config.allowRepeatWin')}
          </label>
          <p className="config-hint">
            {config.allowRepeatWin
              ? t('config.allowRepeatWinOn')
              : t('config.allowRepeatWinOff')}
          </p>
        </div>

        <div className="config-item">
          <label>
            {t('config.numbersPerRow')}
            <input
              type="number"
              min="1"
              max="20"
              value={config.numbersPerRow || 10}
              onChange={(e) => handleNumbersPerRowChange(parseInt(e.target.value))}
              style={{ width: 60 }}
            />
          </label>
          <p className="config-hint">{t('config.numbersPerRowHint')}</p>
        </div>
      </div>
            </div>
          )}

          {activeSection === 'participants' && (
            <div className="settings-section-stack">
              <div className="admin-card">
                <div className="admin-card-header">{t('config.navParticipants')}</div>
        <p className="config-hint" style={{ marginTop: 0 }}>
          {t('config.participantHint')}
        </p>

        <div className="participant-schema-controls">
          <label>
            <span>{t('config.uniqueField')}</span>
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
            <span>{t('config.displayTemplate')}</span>
            <input
              value={participantSchema.displayTemplate}
              onChange={(e) => updateParticipantSchemaLocal({ ...participantSchema, displayTemplate: e.target.value })}
              placeholder="{number}"
            />
            <small>{t('config.displayTemplateHint', { example: '{name}（{number}）' })}</small>
          </label>
        </div>

        <div className="participant-fields">
          <div className="participant-field-header" aria-hidden="true">
            <span>{t('config.colKey')}</span>
            <span>{t('config.colLabel')}</span>
            <span>{t('config.colType')}</span>
            <span>{t('config.colOptions')}</span>
            <span>{t('config.colMask')}</span>
            <span>{t('config.colActions')}</span>
          </div>
          {participantSchema.fields.map((field, index) => (
            <div
              key={`participant-field-${index}`}
              className="participant-field-row"
            >
              <label className="participant-field-cell">
                <span>{t('config.colKey')}</span>
                <input
                  value={field.key}
                  onChange={(e) => handleFieldChange(index, { key: e.target.value })}
                  placeholder={t('config.fieldKeyPlaceholder')}
                  disabled={field.key === participantSchema.uniqueField}
                />
              </label>
              <label className="participant-field-cell">
                <span>{t('config.colLabel')}</span>
                <input
                  value={field.label}
                  onChange={(e) => handleFieldChange(index, { label: e.target.value })}
                  placeholder={t('config.labelPlaceholder')}
                />
              </label>
              <label className="participant-field-cell">
                <span>{t('config.colType')}</span>
                <select
                  value={field.type}
                  onChange={(e) => handleFieldChange(index, { type: e.target.value as PoolFieldType })}
                >
                  <option value="text">{t('config.typeText')}</option>
                  <option value="number">{t('config.typeNumber')}</option>
                  <option value="phone">{t('config.typePhone')}</option>
                  <option value="email">{t('config.typeEmail')}</option>
                  <option value="select">{t('config.typeSelect')}</option>
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
                  {t('config.required')}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={field.visible ?? true}
                    onChange={(e) => handleFieldChange(index, { visible: e.target.checked })}
                  />
                  {t('config.visible')}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={field.searchable ?? true}
                    onChange={(e) => handleFieldChange(index, { searchable: e.target.checked })}
                  />
                  {t('config.searchable')}
                </label>
              </div>
              <label className="participant-field-cell">
                <span>{t('config.colMask')}</span>
                <select
                  value={field.mask || 'none'}
                  onChange={(e) => handleFieldChange(index, { mask: e.target.value as 'none' | 'phone' })}
                >
                  <option value="none">{t('config.maskNone')}</option>
                  <option value="phone">{t('config.maskPhone')}</option>
                </select>
              </label>
              <button
                className="btn-danger btn-sm participant-field-delete"
                onClick={() => handleRemoveField(index)}
                disabled={field.key === participantSchema.uniqueField}
              >
                {t('common.delete')}
              </button>
            </div>
          ))}
        </div>

        <div className="btns" style={{ marginTop: 14 }}>
          <button onClick={handleAddField}>{t('config.addField')}</button>
          <button className="btn-primary" onClick={handleSaveParticipantSchema}>{t('config.saveSchema')}</button>
        </div>
        {schemaMessage && (
          <p style={{ color: schemaMessage.kind === 'success' ? '#4ade80' : '#ff6b6b', fontSize: 13, marginTop: 10 }}>
            {schemaMessage.text}
          </p>
        )}
      </div>
            </div>
          )}

          {activeSection === 'display' && (
            <div className="settings-section-stack">
              <div className="admin-card">
                <div className="admin-card-header">{t('config.bgTitle')}</div>
                <p className="config-hint" style={{ marginTop: 0 }}>
                  {t('config.bgHint')}
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
                    <img src={backgroundImage} alt={t('config.bgAlt')} />
                    <div className="upload-preview-actions">
                      <button
                        type="button"
                        onClick={() => backgroundInputRef.current?.click()}
                        disabled={backgroundUploading}
                      >
                        {t('config.bgChange')}
                      </button>
                      {backgroundImage !== '/bg.jpg' && (
                        <button
                          type="button"
                          className="btn-danger btn-sm"
                          onClick={() => saveBackgroundImage('/bg.jpg')}
                          disabled={backgroundUploading}
                        >
                          {t('config.bgRestore')}
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
                        <span>{t('config.uploading')}</span>
                      </>
                    ) : (
                      <>
                        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" strokeWidth="1.5">
                          <path d="M12 16V4m0 0L8 8m4-4l4 4" strokeLinecap="round" strokeLinejoin="round" />
                          <path d="M20 16v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2" strokeLinecap="round" />
                        </svg>
                        <span>{t('config.bgDropHint')}</span>
                        <span style={{ fontSize: 11, opacity: 0.5 }}>{t('config.fileHint')}</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div className="admin-card">
                <div className="admin-card-header">{t('config.displaySettings')}</div>

        <div className="config-item">
          <label>
            <input
              type="checkbox"
              checked={displaySettings.showQuantity}
              onChange={() => handleDisplaySettingChange('showQuantity')}
            />
            {t('config.showQuantity')}
          </label>
        </div>

        <div className="config-item" style={{ marginBottom: 0 }}>
          <label>
            <input
              type="checkbox"
              checked={displaySettings.showSponsor}
              onChange={() => handleDisplaySettingChange('showSponsor')}
            />
            {t('config.showSponsor')}
          </label>
        </div>

        <div className="config-item" style={{ marginBottom: 0, marginTop: 16 }}>
          <label>
            <input
              type="checkbox"
              checked={displaySettings.showNumberBorder ?? true}
              onChange={() => handleDisplaySettingChange('showNumberBorder')}
            />
            {t('config.showNumberBorder')}
          </label>
        </div>

        <div className="config-item" style={{ marginBottom: 0, marginTop: 16 }}>
          <label>
            <input
              type="checkbox"
              checked={displaySettings.maskPhone ?? false}
              onChange={() => handleDisplaySettingChange('maskPhone')}
            />
            {t('config.maskPhoneSetting')}
          </label>
          <p className="config-hint">{t('config.maskPhoneHint')}</p>
        </div>
      </div>

      {/* 字体颜色 */}
      <div className="admin-card">
        <div className="admin-card-header">{t('config.fontColors')}</div>

        <div className="form-row">
          <label>{t('config.fontPrizeName')}</label>
          <input
            type="color"
            value={fontColors.prizeName}
            onChange={(e) => handleColorChange('prizeName', e.target.value)}
          />
          <span className="color-hex">{fontColors.prizeName}</span>
        </div>

        <div className="form-row">
          <label>{t('config.fontSponsor')}</label>
          <input
            type="color"
            value={fontColors.sponsor}
            onChange={(e) => handleColorChange('sponsor', e.target.value)}
          />
          <span className="color-hex">{fontColors.sponsor}</span>
        </div>

        <div className="form-row">
          <label>{t('config.fontNumber')}</label>
          <input
            type="color"
            value={fontColors.numberCard}
            onChange={(e) => handleColorChange('numberCard', e.target.value)}
          />
          <span className="color-hex">{fontColors.numberCard}</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{t('config.fontNumberHint')}</span>
        </div>
      </div>

      {/* 字体大小 */}
      <div className="admin-card">
        <div className="admin-card-header">{t('config.fontSizes')}</div>

        {([
          ['prizeLevel', t('config.fontPrizeLevel')],
          ['prizeName', t('config.fontPrizeName')],
          ['sponsor', t('config.fontSponsor')],
          ['numberCard', t('config.fontNumber')],
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
        <p className="config-hint">{t('config.fontSizesHint')}</p>
      </div>
            </div>
          )}

          {activeSection === 'calibration' && (
            <div className="settings-section-stack">
              <div className="admin-card">
                <div className="admin-card-header">{t('config.calibrationTitle')}</div>
        <p className="config-hint" style={{ marginTop: 0, marginBottom: 14 }}>
          {t('config.calibrationHint')}
        </p>

        <div className="prize-form" style={{ marginBottom: 12 }}>
          <select
            value={calPrizeId}
            onChange={e => setCalPrizeId(e.target.value)}
            style={{ flex: '0 0 auto', minWidth: 140 }}
          >
            <option value="">{t('config.calibrationPick')}</option>
            {allPrizes.map(p => (
              <option key={p.id} value={p.id}>{p.level} - {p.name}</option>
            ))}
          </select>
          <input
            placeholder={t('config.calibrationNumbers')}
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
                setCalMessage(t('config.calibrationInvalid', { list: invalid.join(', ') }));
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
          }}>{t('config.calibrationSet')}</button>
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
                  }}>{t('config.calibrationClear')}</button>
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
