'use client';

import { useState } from 'react';
import { useI18n } from '@/lib/i18n/useI18n';
import { isShippedFieldLabel } from '@/lib/i18n';
import type { ParticipantSchema } from '@/lib/participants';

interface MemberEditorProps {
  schema: ParticipantSchema;
  title: string;
  /** 编辑时传入当前值；新增时传空对象 */
  initialValues: Record<string, string>;
  submitLabel: string;
  onCancel: () => void;
  /**
   * 提交回调。返回 `null` 表示成功（由调用方关闭弹层），
   * 返回字符串则作为错误提示显示在弹层里、保持弹层打开让用户改。
   */
  onSubmit: (values: Record<string, string>) => Promise<string | null>;
}

/**
 * 成员信息编辑弹层。
 *
 * 用弹层而不是行内编辑：成员字段数量由「参与者字段」配置决定，可能有好几列，
 * 塞进表格行里会在窄屏上挤成一团。
 *
 * 这里渲染 schema 里的**全部**字段（不只是 visible 的），因为 visible 控制的是
 * 「展示」，不代表这个字段不该被维护。
 */
export default function MemberEditor({
  schema,
  title,
  initialValues,
  submitLabel,
  onCancel,
  onSubmit,
}: MemberEditorProps) {
  const { t } = useI18n('admin');
  const [values, setValues] = useState<Record<string, string>>(() => ({ ...initialValues }));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    setBusy(true);
    setMessage('');
    try {
      const error = await onSubmit(values);
      if (error) setMessage(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="member-editor-backdrop"
      onClick={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}
    >
      <div className="member-editor" role="dialog" aria-modal="true" aria-label={title}>
        <h3>{title}</h3>

        {schema.fields.map((field) => {
          const label = isShippedFieldLabel(field) ? t('register.idLabel') : field.label;
          const value = values[field.key] ?? '';
          const update = (next: string) => setValues(prev => ({ ...prev, [field.key]: next }));

          return (
            <label className="member-editor-field" key={field.key}>
              <span>
                {label}
                {field.required && <span className="required-mark">*</span>}
              </span>
              {field.type === 'select' && field.options && field.options.length > 0 ? (
                <select value={value} onChange={e => update(e.target.value)}>
                  <option value="">--</option>
                  {field.options.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              ) : (
                <input
                  type={field.type === 'phone' ? 'tel' : field.type === 'email' ? 'email' : 'text'}
                  value={value}
                  onChange={e => update(e.target.value)}
                  autoComplete="off"
                />
              )}
            </label>
          );
        })}

        {message && <p className="member-editor-message">{message}</p>}

        <div className="member-editor-actions">
          <button className="btn-ghost" onClick={onCancel} disabled={busy}>
            {t('common.cancel')}
          </button>
          <button className="btn-primary" onClick={handleSubmit} disabled={busy}>
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
