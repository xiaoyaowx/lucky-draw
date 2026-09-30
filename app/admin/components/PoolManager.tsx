'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildMembersFromTable, parseMembersFromText } from '@/lib/participants';
import type { ParticipantSchema, PoolMember } from '@/lib/participants';
import { useI18n } from '@/lib/i18n/useI18n';
import { isShippedFieldLabel, type TranslationKey } from '@/lib/i18n';
import { buildImportTemplate } from '@/lib/import-template';
import { buildXlsx } from '@/lib/xlsx-write';
import { downloadBlob } from '@/lib/download';
import LivePoolManager from './LivePoolManager';
import MemberEditor from './MemberEditor';

type PoolTab = 'preset' | 'live';
type PoolWorkMode = 'preview' | 'generate' | 'import';
type ImportMode = 'merge' | 'replace';

interface UserPool {
  id: string;
  name: string;
  numbers: string[];
  members?: PoolMember[];
}

/** 操作结果提示。用结构化字段而不是去猜文案里有没有「失败」两个字。 */
interface PoolMessage {
  kind: 'success' | 'error';
  text: string;
}

const DEFAULT_POOL_ID = 'default';
const DEFAULT_SCHEMA: ParticipantSchema = {
  schemaVersion: 2,
  fields: [{ key: 'number', label: '号码', type: 'text', required: true, unique: true, visible: true, searchable: true }],
  uniqueField: 'number',
  displayTemplate: '{number}',
};

/** 接口返回的错误码 → 文案 key。显式映射，写错 key 编译期就能发现。 */
const MEMBER_ERROR_KEYS: Record<string, TranslationKey> = {
  duplicate: 'member.uniqueConflict',
  required: 'member.requiredMissing',
  poolNotFound: 'member.poolNotFound',
  memberNotFound: 'member.memberNotFound',
};

/** 文件解析接口的错误码 → 文案 key。 */
const PARSE_ERROR_KEYS: Record<string, TranslationKey> = {
  badType: 'import.errorBadType',
  legacyXls: 'import.errorLegacyXls',
  emptyFile: 'import.errorEmptyFile',
  fileTooLarge: 'import.errorFileTooLarge',
  noFile: 'import.errorEmptyFile',
};

/** 文件预览展示的行数（含表头）。够看出有没有串列就行。 */
const PREVIEW_ROWS = 6;

interface ImportFile {
  /** 保留原始 File，用户在多个工作表之间切换时不用重新选文件 */
  file: File;
  name: string;
  rows: string[][];
  sheetName?: string;
  sheetNames: string[];
  sheetIndex: number;
}

/** 接口失败时的兜底文案构造，两个面板共用。 */
function apiErrorText(
  data: { code?: string; error?: string; field?: string; value?: string; id?: string } | null,
  t: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  const key = data?.code ? MEMBER_ERROR_KEYS[data.code] : undefined;
  if (key) {
    return t(key, { field: data?.field ?? '', value: data?.value ?? '', id: data?.id ?? '' });
  }
  // 服务端原文（后端保持中文）优先于本地兜底文案
  return data?.error || t('member.saveFailed');
}

function getPoolMembers(pool: UserPool | undefined, schema: ParticipantSchema): PoolMember[] {
  if (!pool) return [];
  if (Array.isArray(pool.members) && pool.members.length > 0) return pool.members;
  return (pool.numbers || []).map(number => ({
    id: number,
    values: { [schema.uniqueField]: number },
  }));
}

function getMemberText(member: PoolMember, schema: ParticipantSchema): string {
  const text = schema.displayTemplate.replace(/\{([\w]+)\}/g, (_, key: string) => member.values[key] || '').trim();
  return text || member.id;
}

function getMissingRequiredFields(member: PoolMember, schema: ParticipantSchema) {
  return schema.fields.filter(field => field.required && !member.values[field.key]);
}

function PresetPoolPanel() {
  const { t } = useI18n('admin');
  const [pools, setPools] = useState<UserPool[]>([]);
  const [schema, setSchema] = useState<ParticipantSchema>(DEFAULT_SCHEMA);
  const [selectedPoolId, setSelectedPoolId] = useState(DEFAULT_POOL_ID);
  const [newPoolName, setNewPoolName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [manualInput, setManualInput] = useState('');
  const [importMode, setImportMode] = useState<ImportMode>('merge');
  const [importFile, setImportFile] = useState<ImportFile | null>(null);
  const [importFileError, setImportFileError] = useState('');
  const [parsingFile, setParsingFile] = useState(false);
  const [fileDragging, setFileDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewQuery, setPreviewQuery] = useState('');
  const [workMode, setWorkMode] = useState<PoolWorkMode>('preview');
  const [loading, setLoading] = useState(false);
  const [poolMessage, setPoolMessage] = useState<PoolMessage | null>(null);
  const [editingMember, setEditingMember] = useState<{ id?: string; values: Record<string, string> } | null>(null);
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

  const previewMembers = useMemo(() => {
    if (!selectedPool) return [];
    const query = previewQuery.trim();
    const members = getPoolMembers(selectedPool, schema);
    if (!query) return members;
    return members.filter(member =>
      member.id.includes(query) ||
      getMemberText(member, schema).includes(query) ||
      Object.values(member.values).some(value => value.includes(query))
    );
  }, [selectedPool, previewQuery, schema]);
  const visibleFields = useMemo(
    () => schema.fields.filter(field => field.visible !== false),
    [schema],
  );
  const importFieldOrder = useMemo(
    () => [
      ...schema.fields.filter(field => field.key === schema.uniqueField),
      ...schema.fields.filter(field => field.key !== schema.uniqueField),
    ],
    [schema],
  );
  const isMultiFieldSchema = schema.fields.length > 1;
  const autoGenerateBlockReason = isMultiFieldSchema ? t('pool.autoGenerateBlocked') : '';
  // 文件优先于粘贴框：两者同时有内容时不再让用户猜「到底导的是哪份」，
  // 选了文件就把粘贴框收起来，要改回粘贴就点「移除文件」。
  const importMembers = useMemo(
    () => (importFile
      ? buildMembersFromTable(importFile.rows, schema, 'import')
      : parseMembersFromText(manualInput, schema, 'manual')),
    [importFile, manualInput, schema],
  );
  const importError = useMemo(() => {
    if (!importFile && !manualInput.trim()) return '';
    if (importMembers.length === 0) return t('pool.importEmpty');
    for (const member of importMembers) {
      const missing = getMissingRequiredFields(member, schema)[0];
      if (missing) return t('pool.importMissingField', { id: member.id, field: missing.label });
    }
    return '';
  }, [importFile, importMembers, manualInput, schema, t]);

  useEffect(() => {
    fetchPools();
    fetchConfig();
  }, []);

  useEffect(() => {
    if (selectedPool) {
      setRenameValue(selectedPool.name);
      setManualInput('');
      setImportFile(null);
      setImportFileError('');
      setPreviewQuery('');
      setPoolMessage(null);
      setWorkMode('preview');
      setEditingMember(null);
    }
  }, [selectedPool?.id]);

  useEffect(() => {
    if (isMultiFieldSchema && workMode === 'generate') {
      setWorkMode('import');
      setPoolMessage({ kind: 'error', text: autoGenerateBlockReason });
    }
  }, [autoGenerateBlockReason, isMultiFieldSchema, workMode]);

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
    if (data.config?.participantSchema) {
      setSchema(data.config.participantSchema);
    }
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
    setPoolMessage(null);
    try {
      const res = await fetch(`/api/admin/user-pools/${poolId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPoolMessage({ kind: 'error', text: data.error || t('pool.saveFailed') });
        return false;
      }
      await fetchPools();
      setPoolMessage({
        kind: 'success',
        text: data.reset ? t('pool.savedAndReset') : t('pool.saved'),
      });
      return true;
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

  /**
   * 批量导入。
   *
   * 注意提交的是 `selectedPool.id`：旧版这里写死导入到默认池，界面上却写着
   * 「导入到当前池」，选着别的池操作会悄悄改到默认池去。
   */
  const handleImport = async () => {
    if (!selectedPool || importMembers.length === 0) return;
    if (importError) {
      setPoolMessage({ kind: 'error', text: importError });
      return;
    }
    if (importMode === 'replace' && !confirm(t('pool.confirmReplace'))) return;

    setLoading(true);
    setPoolMessage(null);
    try {
      // 文件走 rows、粘贴走 csv：文件不必先转成 CSV 文本，
      // 也就绕开了「单元格里有逗号或换行」时来回转义出错的坑
      const payload = importFile
        ? { rows: importFile.rows, mode: importMode, poolId: selectedPool.id }
        : { csv: manualInput, mode: importMode, poolId: selectedPool.id };

      const res = await fetch('/api/admin/pool/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const text = data.code === 'noMembers'
          ? t('pool.importEmpty')
          : data.code === 'required'
            ? t('pool.importMissingField', { id: data.id ?? '', field: data.field ?? '' })
            : data.error || t('pool.saveFailed');
        setPoolMessage({ kind: 'error', text });
        return;
      }

      const stats = data.stats as {
        mode: ImportMode; total: number; added: number; updated: number;
        removed: number; keptCheckIns: number;
      };
      const unchanged = stats.mode === 'merge'
        ? stats.added === 0 && stats.updated === 0
        : stats.added === 0 && stats.updated === 0 && stats.removed === 0;
      const text = unchanged
        ? t('pool.importNoChange')
        : stats.mode === 'replace'
          ? t('pool.importReplaceDone', {
            total: stats.total, removed: stats.removed, kept: stats.keptCheckIns,
          })
          : t('pool.importMergeDone', {
            added: stats.added, updated: stats.updated, total: stats.total,
          });

      await fetchPools();
      setManualInput('');
      setImportFile(null);
      setImportFileError('');
      setPoolMessage({ kind: 'success', text });
    } finally {
      setLoading(false);
    }
  };

  /**
   * 上传并解析名单文件（xlsx / csv / txt）。解析在服务端做，见 /api/admin/pool/parse。
   *
   * `sheetIndex` 只在 xlsx 多工作表时有意义，切换工作表会带着同一个 File 重新解析。
   */
  const uploadImportFile = async (file: File, sheetIndex = 0) => {
    setImportFileError('');
    setParsingFile(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('sheetIndex', String(sheetIndex));
      const res = await fetch('/api/admin/pool/parse', { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const key = PARSE_ERROR_KEYS[data.code as string];
        setImportFileError(key
          ? t(key)
          : t('import.parseFailed', { reason: data.error || t('import.errorBadType') }));
        setImportFile(null);
        return;
      }

      const rows: string[][] = Array.isArray(data.rows) ? data.rows : [];
      const sheetNames: string[] = Array.isArray(data.sheetNames) ? data.sheetNames : [];
      if (rows.length === 0) {
        // 多工作表时不直接判死：可能只是选错了页，把页签留着让用户换一个
        setImportFileError(t('import.errorNoRows'));
        setImportFile({ file, name: file.name, rows: [], sheetName: data.sheetName, sheetNames, sheetIndex });
        return;
      }

      setImportFile({ file, name: file.name, rows, sheetName: data.sheetName, sheetNames, sheetIndex });
      setManualInput('');
    } catch {
      setImportFileError(t('import.errorNetwork'));
      setImportFile(null);
    } finally {
      setParsingFile(false);
    }
  };

  const handleFileInput = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // 清空 input，否则连续选同一个文件不会再触发 change
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (file) await uploadImportFile(file);
  };

  const handleFileDrop = async (event: React.DragEvent) => {
    event.preventDefault();
    setFileDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) await uploadImportFile(file);
  };

  /** 下载按当前参与者字段实时生成的导入模板。 */
  const handleDownloadTemplate = () => {
    const template = buildImportTemplate(schema, t);
    const bytes = buildXlsx(template.sheets);
    const date = new Date().toISOString().slice(0, 10);
    downloadBlob(
      `${t('import.templateFilename', { date })}.xlsx`,
      new Blob([bytes], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
  };

  const handleGenerate = async () => {
    if (!selectedPool) return;
    if (autoGenerateBlockReason) {
      setPoolMessage({ kind: 'error', text: autoGenerateBlockReason });
      setWorkMode('import');
      return;
    }
    if (!confirm(t('pool.generateHint'))) return;
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
    if (!selectedPool || getPoolMembers(selectedPool, schema).length === 0) return;
    if (!confirm(t('pool.confirmClear'))) return;
    await updatePool(selectedPool.id, { numbers: [] });
  };

  const handleDelete = async () => {
    if (!selectedPool || selectedPool.id === DEFAULT_POOL_ID) return;
    if (!confirm(t('pool.confirmDelete', { name: selectedPool.name }))) return;
    setLoading(true);
    try {
      await fetch(`/api/admin/user-pools/${selectedPool.id}`, { method: 'DELETE' });
      setSelectedPoolId(DEFAULT_POOL_ID);
      await fetchPools();
    } finally {
      setLoading(false);
    }
  };

  /** 成员弹层的提交回调：返回错误文案则弹层保持打开。 */
  const submitMember = async (values: Record<string, string>): Promise<string | null> => {
    if (!selectedPool || !editingMember) return t('member.saveFailed');
    const isEdit = Boolean(editingMember.id);
    try {
      const res = await fetch(`/api/admin/user-pools/${selectedPool.id}/members`, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isEdit ? { memberId: editingMember.id, values } : { values }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return apiErrorText(data, t);

      await fetchPools();
      setEditingMember(null);
      setPoolMessage({ kind: 'success', text: isEdit ? t('member.saved') : t('member.added') });
      return null;
    } catch {
      return t('member.saveFailed');
    }
  };

  const handleDeleteMember = async (member: PoolMember) => {
    if (!selectedPool) return;
    const name = getMemberText(member, schema);
    if (!confirm(t('member.confirmDelete', { name }))) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/user-pools/${selectedPool.id}/members?memberId=${encodeURIComponent(member.id)}`,
        { method: 'DELETE' },
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setPoolMessage({ kind: 'error', text: apiErrorText(data, t) });
        return;
      }
      await fetchPools();
      setPoolMessage({ kind: 'success', text: t('member.deleted') });
    } finally {
      setLoading(false);
    }
  };

  const renderMemberActions = (member: PoolMember) => (
    <div className="pool-member-actions">
      <button
        className="btn-sm"
        onClick={() => setEditingMember({ id: member.id, values: { ...member.values } })}
        disabled={loading}
      >
        {t('common.edit')}
      </button>
      <button className="btn-danger btn-sm" onClick={() => handleDeleteMember(member)} disabled={loading}>
        {t('common.delete')}
      </button>
    </div>
  );

  /** 字段标签：出厂自带的 number 字段跟随界面语言，管理员改过的原样展示。 */
  const fieldLabel = (field?: { key: string; label: string }) =>
    !field ? '' : isShippedFieldLabel(field) ? t('register.idLabel') : field.label;
  const uniqueFieldLabel = fieldLabel(
    schema.fields.find(field => field.key === schema.uniqueField) || schema.fields[0],
  );

  return (
    <div className="manager-panel">
      <h2>{t('pool.title')}</h2>

      <div className="pool-workspace">
        <aside className="pool-sidebar">
          <div className="pool-sidebar-header">
            <span>{t('pool.sidebarTitle')}</span>
            <span className="pool-count-badge">{pools.length}</span>
          </div>
          <div className="pool-create-row">
            <input
              type="text"
              value={newPoolName}
              onChange={e => setNewPoolName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddPool(); }}
              placeholder={t('pool.newNamePlaceholder')}
            />
            <button className="btn-primary" onClick={handleAddPool} disabled={loading || !newPoolName.trim()}>
              {t('common.create')}
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
                  {pool.id === DEFAULT_POOL_ID && <span className="status-tag closed">{t('pool.defaultTag')}</span>}
                </span>
                <span className="pool-list-count">
                  {t('common.people', { n: getPoolMembers(pool, schema).length })}
                </span>
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
                      aria-label={t('pool.poolNameAria')}
                    />
                    {selectedPool.id === DEFAULT_POOL_ID && <span className="status-tag closed">{t('pool.defaultPoolTag')}</span>}
                  </div>
                  <div className="pool-meta">
                    <span>{t('pool.membersCount', { n: getPoolMembers(selectedPool, schema).length })}</span>
                    <span>ID: {selectedPool.id}</span>
                  </div>
                </div>
                <div className="pool-header-actions">
                  <button onClick={handleRename} disabled={loading || !renameValue.trim() || renameValue.trim() === selectedPool.name}>
                    {t('pool.saveName')}
                  </button>
                  <button
                    className="btn-danger"
                    onClick={handleClear}
                    disabled={loading || getPoolMembers(selectedPool, schema).length === 0}
                  >
                    {t('common.clear')}
                  </button>
                  <button
                    className="btn-danger"
                    onClick={handleDelete}
                    disabled={loading || selectedPool.id === DEFAULT_POOL_ID}
                  >
                    {t('common.delete')}
                  </button>
                </div>
              </div>

              <div className="pool-mode-tabs">
                {([
                  ['preview', isMultiFieldSchema ? t('pool.modePreviewMembers') : t('pool.modePreviewNumbers')],
                  ['generate', t('pool.modeGenerate')],
                  ['import', t('pool.modeImport')],
                ] as [PoolWorkMode, string][]).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    className={workMode === mode ? 'active' : ''}
                    disabled={mode === 'generate' && isMultiFieldSchema}
                    title={mode === 'generate' && isMultiFieldSchema ? autoGenerateBlockReason : undefined}
                    onClick={() => {
                      if (mode === 'generate' && autoGenerateBlockReason) {
                        setPoolMessage({ kind: 'error', text: autoGenerateBlockReason });
                        return;
                      }
                      setWorkMode(mode);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {poolMessage && (
                <div className={`pool-message ${poolMessage.kind === 'error' ? 'error' : 'success'}`}>
                  {poolMessage.text}
                </div>
              )}

              {workMode === 'preview' && (
                <div className="pool-action-panel">
                  <div className="pool-panel-title">
                    <span>{t('pool.panelMembers')}</span>
                    <span>{previewMembers.length} / {getPoolMembers(selectedPool, schema).length}</span>
                  </div>
                  <div className="pool-preview-toolbar">
                    <input
                      value={previewQuery}
                      onChange={e => setPreviewQuery(e.target.value)}
                      placeholder={t('pool.searchPlaceholder')}
                      className="pool-search-input"
                    />
                    <button
                      className="btn-primary"
                      onClick={() => setEditingMember({ values: {} })}
                      disabled={loading}
                    >
                      {t('member.add')}
                    </button>
                  </div>
                  {!isMultiFieldSchema ? (
                    <div className="pool-numbers pool-numbers-grid">
                      {previewMembers.length === 0 ? (
                        <span className="pool-empty-text">{t('pool.noMatch')}</span>
                      ) : (
                        previewMembers.map(member => <span key={member.id}>{getMemberText(member, schema)}</span>)
                      )}
                    </div>
                  ) : (
                    <div className="pool-member-table-wrap">
                      <table className="pool-member-table">
                        <thead>
                          <tr>
                            <th>{t('pool.thDisplay')}</th>
                            {visibleFields.map(field => <th key={field.key}>{fieldLabel(field)}</th>)}
                            <th>{t('member.operations')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {previewMembers.length === 0 ? (
                            <tr>
                              <td colSpan={visibleFields.length + 2} className="pool-member-empty">{t('pool.noMatch')}</td>
                            </tr>
                          ) : (
                            previewMembers.map((member) => {
                              const missingFields = getMissingRequiredFields(member, schema);
                              return (
                                <tr key={member.id} className={missingFields.length > 0 ? 'pool-member-row-warning' : undefined}>
                                  <td>
                                    <span className="pool-member-display-text">{getMemberText(member, schema)}</span>
                                    {missingFields.length > 0 && (
                                      <span className="pool-member-warning">
                                        {t('pool.missing', { fields: missingFields.map(fieldLabel).join(' / ') })}
                                      </span>
                                    )}
                                  </td>
                                  {visibleFields.map(field => (
                                    <td
                                      key={field.key}
                                      className={field.required && !member.values[field.key] ? 'pool-member-cell-warning' : undefined}
                                    >
                                      {member.values[field.key] || (field.required ? t('pool.notFilled') : '')}
                                    </td>
                                  ))}
                                  <td>{renderMemberActions(member)}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {workMode === 'generate' && (
                <div className="pool-action-panel">
                  <div className="pool-panel-title">
                    <span>{t('pool.generateTitle')}</span>
                    <span>{t('pool.overwriteCurrent')}</span>
                  </div>
                  <div className="pool-generate-grid">
                    <label>
                      <span>{t('pool.rangeStart')}</span>
                      <input
                        type="number"
                        value={genConfig.start}
                        onChange={e => setGenConfig({ ...genConfig, start: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      <span>{t('pool.rangeEnd')}</span>
                      <input
                        type="number"
                        value={genConfig.end}
                        onChange={e => setGenConfig({ ...genConfig, end: Number(e.target.value) })}
                      />
                    </label>
                    <label>
                      <span>{t('pool.excludeContains')}</span>
                      <input
                        value={genConfig.excludeContains}
                        onChange={e => setGenConfig({ ...genConfig, excludeContains: e.target.value })}
                        placeholder={t('pool.excludeContainsPlaceholder')}
                      />
                    </label>
                    <label>
                      <span>{t('pool.excludeExact')}</span>
                      <input
                        value={genConfig.excludeExact}
                        onChange={e => setGenConfig({ ...genConfig, excludeExact: e.target.value })}
                        placeholder={t('pool.excludeExactPlaceholder')}
                      />
                    </label>
                  </div>
                  <div className="pool-action-footer">
                    <span>
                      {autoGenerateBlockReason || t('pool.generateHint')}
                    </span>
                    <button className="btn-primary" onClick={handleGenerate} disabled={loading || Boolean(autoGenerateBlockReason)}>
                      {t('pool.generateButton')}
                    </button>
                  </div>
                </div>
              )}

              {workMode === 'import' && (
                <div className="pool-action-panel">
                  <div className="pool-panel-title">
                    <span>{t('pool.importTitle')}</span>
                    <span>{t('pool.pendingImport', { n: importMembers.length })}</span>
                  </div>

                  <div className="import-mode-group" role="radiogroup" aria-label={t('pool.importModeLabel')}>
                    {([
                      ['merge', t('pool.importModeMerge'), t('pool.importModeMergeHint', { field: uniqueFieldLabel })],
                      ['replace', t('pool.importModeReplace'), t('pool.importModeReplaceHint')],
                    ] as [ImportMode, string, string][]).map(([mode, title, hint]) => (
                      <label
                        key={mode}
                        className={`import-mode-option ${importMode === mode ? 'active' : ''}`}
                      >
                        <input
                          type="radio"
                          name="import-mode"
                          checked={importMode === mode}
                          onChange={() => setImportMode(mode)}
                        />
                        <span className="import-mode-copy">
                          <span className="import-mode-title">{title}</span>
                          <span className="import-mode-hint">{hint}</span>
                        </span>
                      </label>
                    ))}
                  </div>

                  {/* 文件导入 */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.csv,.txt"
                    onChange={handleFileInput}
                    style={{ display: 'none' }}
                  />

                  <div className="import-file-row">
                    <div
                      className={`import-dropzone${fileDragging ? ' dragover' : ''}${parsingFile ? ' uploading' : ''}${importFile ? ' has-file' : ''}`}
                      onClick={() => { if (!parsingFile) fileInputRef.current?.click(); }}
                      onDragOver={e => { e.preventDefault(); setFileDragging(true); }}
                      onDragLeave={() => setFileDragging(false)}
                      onDrop={handleFileDrop}
                    >
                      {importFile ? (
                        <>
                          <span className="import-file-name">
                            {importFile.sheetName
                              ? t('import.fileLoaded', {
                                name: importFile.name,
                                sheet: importFile.sheetName,
                                rows: importFile.rows.length,
                              })
                              : t('import.fileLoadedNoSheet', {
                                name: importFile.name,
                                rows: importFile.rows.length,
                              })}
                          </span>
                          <button
                            type="button"
                            className="btn-ghost btn-sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setImportFile(null);
                              setImportFileError('');
                            }}
                          >
                            {t('import.fileRemove')}
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="import-file-title">
                            {parsingFile ? t('import.parsing') : t('import.pickFile')}
                          </span>
                          <span className="import-file-hint">{t('import.fileHint')}</span>
                        </>
                      )}
                    </div>

                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={handleDownloadTemplate}
                      title={t('import.templateHint')}
                    >
                      {t('import.downloadTemplate')}
                    </button>
                  </div>

                  {importFileError && (
                    <div className="pool-message error" style={{ marginBottom: 12 }}>
                      {importFileError}
                    </div>
                  )}

                  {/* 多工作表时让用户选读哪一页：HR 导出的表格常有封面页/说明页，
                      默认读第一页会读到一张没有名单的表 */}
                  {importFile && importFile.sheetNames.length > 1 && (
                    <div className="import-sheet-row">
                      <span className="import-sheet-label">{t('import.sheetLabel')}</span>
                      {importFile.sheetNames.map((sheetName, index) => (
                        <button
                          key={`${sheetName}-${index}`}
                          type="button"
                          className={`import-sheet-btn${index === importFile.sheetIndex ? ' active' : ''}`}
                          disabled={parsingFile}
                          onClick={() => uploadImportFile(importFile.file, index)}
                        >
                          {sheetName}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* 原始行预览：串列是文件导入最典型的失败方式，看一眼就能发现 */}
                  {importFile && importFile.rows.length > 0 && (
                    <div className="import-preview">
                      <div className="import-preview-title">
                        {t('import.previewTitle', { n: Math.min(PREVIEW_ROWS, importFile.rows.length) })}
                      </div>
                      <div className="import-preview-scroll">
                        <table className="import-preview-table">
                          <tbody>
                            {importFile.rows.slice(0, PREVIEW_ROWS).map((row, rowIndex) => (
                              <tr key={rowIndex} className={rowIndex === 0 ? 'header-row' : undefined}>
                                {Array.from(
                                  { length: importFile.rows.reduce((max, r) => Math.max(max, r.length), 0) },
                                  (_, columnIndex) => (
                                    <td key={columnIndex}>{row[columnIndex] ?? ''}</td>
                                  ),
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {!importFile && (
                    <>
                      <div className="import-paste-label">{t('import.orPaste')}</div>
                      <textarea
                        value={manualInput}
                        onChange={e => setManualInput(e.target.value)}
                        placeholder={
                          !isMultiFieldSchema
                            ? t('pool.importPlaceholderSingle')
                            : t('pool.importPlaceholderCsv', {
                              header: importFieldOrder.map(field => field.key).join(','),
                              sample: importFieldOrder.map((field, index) => index === 0 ? '001' : field.label).join(','),
                            })
                        }
                        rows={10}
                      />
                    </>
                  )}

                  <div className="pool-action-footer">
                    <span className={importError ? 'pool-footer-error' : ''}>
                      {importError || (importMode === 'merge'
                        ? t('pool.importModeMergeHint', { field: uniqueFieldLabel })
                        : t('pool.importModeReplaceHint'))}
                    </span>
                    <button
                      className="btn-primary"
                      onClick={handleImport}
                      disabled={loading || parsingFile || Boolean(importError) || (!importFile && !manualInput.trim())}
                    >
                      {t('pool.importToPool')}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="pool-empty-state">{t('pool.emptyState')}</div>
          )}
        </section>
      </div>

      {editingMember && (
        <MemberEditor
          schema={schema}
          title={editingMember.id ? t('member.editTitle') : t('member.addTitle')}
          initialValues={editingMember.values}
          submitLabel={t('common.save')}
          onCancel={() => setEditingMember(null)}
          onSubmit={submitMember}
        />
      )}
    </div>
  );
}

export default function PoolManager() {
  const { t } = useI18n('admin');
  const [activeTab, setActiveTab] = useState<PoolTab>('preset');

  const tabs: { id: PoolTab; label: string }[] = [
    { id: 'preset', label: t('pool.tabPreset') },
    { id: 'live', label: t('pool.tabLive') },
  ];

  return (
    <div>
      <div className="admin-tabs" style={{ justifyContent: 'flex-start', marginBottom: 20, maxWidth: 260 }}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'preset' ? <PresetPoolPanel /> : <LivePoolManager />}
    </div>
  );
}
