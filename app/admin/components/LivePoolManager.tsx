'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/lib/i18n/useI18n';
import { isShippedFieldLabel, type TranslationKey } from '@/lib/i18n';
import { buildCsv } from '@/lib/csv';
import { downloadTextFile } from '@/lib/download';
import type { ParticipantSchema, PoolFieldDefinition, PoolMember } from '@/lib/participants';
import MemberEditor from './MemberEditor';

interface LivePoolData {
  isOpen: boolean;
  registrations: string[];
  members?: PoolMember[];
  fields?: PoolFieldDefinition[];
  uniqueField?: string;
  displayTemplate?: string;
  count: number;
  registerSettings?: {
    length: number;
    allowLetters: boolean;
  };
}

interface UserPoolSummary {
  id: string;
  name: string;
  members?: PoolMember[];
}

const DEFAULT_REGISTER_SETTINGS = {
  length: 6,
  allowLetters: false,
};

const FALLBACK_FIELDS: PoolFieldDefinition[] = [
  { key: 'number', label: '号码', type: 'text', required: true, unique: true, visible: true, searchable: true },
];

const MEMBER_ERROR_KEYS: Record<string, TranslationKey> = {
  duplicate: 'member.uniqueConflict',
  required: 'member.requiredMissing',
  poolNotFound: 'member.poolNotFound',
  memberNotFound: 'member.memberNotFound',
};

export default function LivePoolManager() {
  const { t, lang } = useI18n('admin');
  const [pool, setPool] = useState<LivePoolData>({
    isOpen: false,
    registrations: [],
    count: 0,
    registerSettings: DEFAULT_REGISTER_SETTINGS,
  });
  /** memberId → 所属用户池。签到池是各用户池的并集，改/删要回到源池去操作。 */
  const [poolByMember, setPoolByMember] = useState<Map<string, UserPoolSummary>>(new Map());
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState<{ memberId: string; values: Record<string, string> } | null>(null);

  const fetchPool = useCallback(async () => {
    try {
      const [registerRes, poolsRes] = await Promise.all([
        fetch('/api/register'),
        fetch('/api/admin/user-pools'),
      ]);
      const data = await registerRes.json();
      setPool({
        ...data,
        registerSettings: data.registerSettings || DEFAULT_REGISTER_SETTINGS,
      });

      const poolsData = await poolsRes.json().catch(() => ({}));
      const map = new Map<string, UserPoolSummary>();
      (poolsData.pools || []).forEach((item: UserPoolSummary) => {
        (item.members || []).forEach((member) => {
          if (!map.has(member.id)) map.set(member.id, item);
        });
      });
      setPoolByMember(map);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    fetchPool();
  }, [fetchPool]);

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
      await fetchPool();
    } finally {
      setLoading(false);
    }
  };

  const handleClear = async () => {
    if (!confirm(t('live.confirmClear'))) return;
    setLoading(true);
    try {
      await fetch('/api/register', { method: 'DELETE' });
      await fetchPool();
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterLengthChange = async (value: number) => {
    if (!Number.isFinite(value) || value < 1 || value > 20) return;
    const currentSettings = pool.registerSettings || DEFAULT_REGISTER_SETTINGS;
    const newSettings = { ...DEFAULT_REGISTER_SETTINGS, ...currentSettings, length: value };
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
  const fields = useMemo(
    () => (pool.fields && pool.fields.length > 0 ? pool.fields : FALLBACK_FIELDS),
    [pool.fields],
  );
  const uniqueField = pool.uniqueField || 'number';
  const schema: ParticipantSchema = useMemo(() => ({
    schemaVersion: 2,
    fields,
    uniqueField,
    displayTemplate: pool.displayTemplate || `{${uniqueField}}`,
  }), [fields, uniqueField, pool.displayTemplate]);

  const members: PoolMember[] = useMemo(
    () => (pool.members && pool.members.length > 0
      ? pool.members
      : pool.registrations.map(id => ({ id, values: { [uniqueField]: id } }))),
    [pool.members, pool.registrations, uniqueField],
  );

  const fieldLabel = (field: PoolFieldDefinition) =>
    isShippedFieldLabel(field) ? t('register.idLabel') : field.label;

  const getMemberText = (member: PoolMember) => {
    const text = schema.displayTemplate
      .replace(/\{([\w]+)\}/g, (_, key: string) => member.values[key] || '')
      .trim();
    return text || member.id;
  };

  /** 编辑签到人员的信息：写回它所属的那个用户池。 */
  const submitMember = async (values: Record<string, string>): Promise<string | null> => {
    if (!editing) return t('member.saveFailed');
    const owner = poolByMember.get(editing.memberId);
    if (!owner) return t('live.unknownPool');

    try {
      const res = await fetch(`/api/admin/user-pools/${owner.id}/members`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: editing.memberId, values }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const key = data?.code ? MEMBER_ERROR_KEYS[data.code] : undefined;
        return key
          ? t(key, { field: data.field ?? '', value: data.value ?? '' })
          : data?.error || t('member.saveFailed');
      }
      await fetchPool();
      setEditing(null);
      setMessage(t('member.saved'));
      return null;
    } catch {
      return t('member.saveFailed');
    }
  };

  /** 取消签到：只把人从签到池里拿掉，保留在用户池里。 */
  const handleUndoCheckIn = async (member: PoolMember) => {
    if (!confirm(t('live.confirmRemove', { name: getMemberText(member) }))) return;
    setLoading(true);
    try {
      await fetch('/api/admin/checkin', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberIds: [member.id] }),
      });
      await fetchPool();
      setMessage(t('live.removed'));
    } finally {
      setLoading(false);
    }
  };

  /** 删除人员：连同用户池里的记录一起删除（签到状态一并消失）。 */
  const handleDeleteMember = async (member: PoolMember) => {
    const owner = poolByMember.get(member.id);
    if (!owner) {
      setMessage(t('live.unknownPool'));
      return;
    }
    if (!confirm(t('live.confirmDeleteMember', { name: getMemberText(member) }))) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/user-pools/${owner.id}/members?memberId=${encodeURIComponent(member.id)}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const key = data?.code ? MEMBER_ERROR_KEYS[data.code] : undefined;
        setMessage(key ? t(key, { field: data.field ?? '', value: data.value ?? '' }) : t('member.saveFailed'));
        return;
      }
      await fetchPool();
      setMessage(t('live.memberDeleted'));
    } finally {
      setLoading(false);
    }
  };

  /**
   * 导出已签到名单。
   *
   * 在浏览器端拼 CSV 而不是让后端生成：表头要跟着界面语言走，而服务端本身
   * 保持中文，放在前端生成就不用为了一个导出把语言状态传给后端。
   */
  const handleExport = () => {
    if (members.length === 0) {
      setMessage(t('live.exportEmpty'));
      return;
    }

    const header = [...fields.map(fieldLabel), t('live.checkInTime')];
    const rows = members.map(member => [
      ...fields.map(field => member.values[field.key] || ''),
      // updatedAt 记录的就是签到那一刻的时间，读取时会原样保留
      member.updatedAt ? new Date(member.updatedAt).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US') : '',
    ]);

    downloadTextFile(
      `${t('live.exportFilename', { date: new Date().toISOString().slice(0, 10) })}.csv`,
      buildCsv([header, ...rows]),
    );
    setMessage('');
  };

  return (
    <div className="manager-panel">
      <h2>{t('live.title')}</h2>

      {/* 登记状态 */}
      <div className="admin-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)' }}>{t('live.statusLabel')}</span>
            <span className={`status-tag ${pool.isOpen ? 'open' : 'closed'}`}>
              {pool.isOpen ? t('live.open') : t('live.closed')}
            </span>
          </div>
          <button
            className={pool.isOpen ? 'btn-danger' : 'btn-primary'}
            onClick={toggleOpen}
            disabled={loading}
          >
            {pool.isOpen ? t('live.closeBtn') : t('live.openBtn')}
          </button>
        </div>

        <div style={{
          marginTop: 14,
          padding: '10px 14px',
          background: 'rgba(0,0,0,0.2)',
          borderRadius: 8,
          fontSize: 13,
        }}>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>{t('live.linkLabel')}</span>
          <code style={{ color: '#ffd700', wordBreak: 'break-all' }}>
            {typeof window !== 'undefined' ? `${window.location.origin}/register` : '/register'}
          </code>
        </div>
      </div>

      {/* 登记设置 */}
      <div className="admin-card">
        <div className="admin-card-header">{t('live.settings')}</div>
        <div className="form-row">
          <label>{t('live.idLength')}</label>
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
          <label>{t('live.allowLetters')}</label>
          <input
            type="checkbox"
            checked={registerSettings.allowLetters}
            onChange={handleRegisterAllowLettersChange}
            disabled={loading}
          />
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            {t('live.allowLettersHint')}
          </span>
        </div>
      </div>

      {/* 已登记列表 */}
      <div className="admin-card">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div className="admin-card-header" style={{ marginBottom: 0 }}>
            {t('live.members')}
            <span className="badge" style={{ background: 'rgba(255,215,0,0.12)', color: '#ffd700' }}>
              {t('common.people', { n: pool.count })}
            </span>
            <button
              className="btn-ghost btn-sm"
              onClick={fetchPool}
              disabled={loading}
              title={t('live.refresh')}
              style={{ marginLeft: 4, padding: '2px 8px', fontSize: 14 }}
            >
              &#x21bb;
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="btn-primary btn-sm"
              onClick={handleExport}
              disabled={loading || pool.count === 0}
            >
              {t('live.export')}
            </button>
            <button
              className="btn-danger btn-sm"
              onClick={handleClear}
              disabled={loading || pool.count === 0}
            >
              {t('live.clearBtn')}
            </button>
          </div>
        </div>

        {message && (
          <div className="pool-message success" style={{ marginBottom: 12 }}>{message}</div>
        )}

        {members.length > 0 ? (
          <div className="pool-member-table-wrap">
            <table className="pool-member-table">
              <thead>
                <tr>
                  {fields.map(field => (
                    <th key={field.key}>{fieldLabel(field)}</th>
                  ))}
                  <th>{t('live.poolColumn')}</th>
                  <th>{t('member.operations')}</th>
                </tr>
              </thead>
              <tbody>
                {members.map(member => (
                  <tr key={member.id}>
                    {fields.map(field => (
                      <td key={field.key}>{member.values[field.key] || ''}</td>
                    ))}
                    <td style={{ color: 'rgba(255,255,255,0.45)' }}>
                      {poolByMember.get(member.id)?.name || t('live.unknownPool')}
                    </td>
                    <td>
                      <div className="pool-member-actions">
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => setEditing({ memberId: member.id, values: { ...member.values } })}
                          disabled={loading}
                        >
                          {t('common.edit')}
                        </button>
                        <button
                          className="btn-ghost btn-sm"
                          onClick={() => handleUndoCheckIn(member)}
                          disabled={loading}
                        >
                          {t('live.undoCheckIn')}
                        </button>
                        <button
                          className="btn-danger btn-sm"
                          onClick={() => handleDeleteMember(member)}
                          disabled={loading}
                        >
                          {t('live.deleteMember')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', textAlign: 'center', padding: 24 }}>
            {t('live.empty')}
          </p>
        )}
      </div>

      {editing && (
        <MemberEditor
          schema={schema}
          title={t('member.editTitle')}
          initialValues={editing.values}
          submitLabel={t('common.save')}
          onCancel={() => setEditing(null)}
          onSubmit={submitMember}
        />
      )}
    </div>
  );
}
