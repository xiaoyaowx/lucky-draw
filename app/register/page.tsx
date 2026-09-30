'use client';

import { useState, useEffect, useRef } from 'react';
import './page.css';
import LanguageSwitch from '../components/LanguageSwitch';
import { useI18n } from '@/lib/i18n/useI18n';
import { isShippedFieldLabel, type TranslationKey } from '@/lib/i18n';

const DEFAULT_REGISTER_SETTINGS = {
  length: 6,
  allowLetters: false,
};

interface PoolFieldDefinition {
  key: string;
  label: string;
  type: 'text' | 'number' | 'phone' | 'email' | 'select';
  required: boolean;
}

/**
 * 服务端只回结果码，具体提示语在前端按当前语言渲染。
 * 用显式映射而不是拼 `` `register.code.${code}` `` 字符串：拼字符串在 TS 里
 * 只能强转，写错 key 不会报错，界面会静默显示成原始 key。
 */
const REGISTER_CODE_KEYS: Record<string, TranslationKey> = {
  ok: 'register.code.ok',
  closed: 'register.code.closed',
  empty: 'register.code.empty',
  formatDigits: 'register.code.formatDigits',
  formatAlnum: 'register.code.formatAlnum',
  lengthDigits: 'register.code.lengthDigits',
  lengthAlnum: 'register.code.lengthAlnum',
  notFound: 'register.code.notFound',
  duplicate: 'register.code.duplicate',
  error: 'register.code.error',
};

interface Feedback {
  type: 'success' | 'error' | '';
  /** 本地文案 key，会跟随语言切换实时变化 */
  key?: TranslationKey;
  /** 服务端原文兜底：遇到前端还不认识的结果码时至少不丢信息 */
  text?: string;
}

export default function RegisterPage() {
  const { t } = useI18n('front');
  const [registerSettings, setRegisterSettings] = useState(DEFAULT_REGISTER_SETTINGS);
  const [uniqueField, setUniqueField] = useState<PoolFieldDefinition | null>(null);
  const [code, setCode] = useState<string[]>(
    Array(DEFAULT_REGISTER_SETTINGS.length).fill('')
  );
  const [isOpen, setIsOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>({ type: '' });
  const [loading, setLoading] = useState(false);
  const [registeredId, setRegisteredId] = useState<string | null>(null);
  const poolVersionRef = useRef('0');
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    fetchStatus();
  }, []);

  useEffect(() => {
    setCode(prev => {
      const next = Array(registerSettings.length).fill('');
      for (let i = 0; i < Math.min(prev.length, next.length); i++) {
        const sanitized = sanitizeInput(prev[i]).slice(0, 1);
        next[i] = sanitized;
      }
      return next;
    });
  }, [registerSettings.length, registerSettings.allowLetters]);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/register');
      const data = await res.json();
      setIsOpen(data.isOpen);
      setCount(data.count);
      if (data.registerSettings) {
        setRegisterSettings({
          length: data.registerSettings.length || DEFAULT_REGISTER_SETTINGS.length,
          allowLetters: !!data.registerSettings.allowLetters,
        });
      }
      if (Array.isArray(data.fields)) {
        const nextUniqueField = data.uniqueField || 'number';
        setUniqueField(
          data.fields.find((field: PoolFieldDefinition) => field.key === nextUniqueField) || null,
        );
      }
      // 比对清空时间戳，管理员清空后自动解锁
      const savedClearedAt = localStorage.getItem('lucky-draw-pool-version');
      const serverClearedAt = String(data.version || 0);
      poolVersionRef.current = serverClearedAt;
      if (savedClearedAt && savedClearedAt !== serverClearedAt) {
        localStorage.removeItem('lucky-draw-registered-id');
        localStorage.removeItem('lucky-draw-pool-version');
        setRegisteredId(null);
      } else {
        const saved = localStorage.getItem('lucky-draw-registered-id');
        if (saved) {
          setRegisteredId(saved);
        }
      }
    } catch {
      // ignore
    }
  };

  const sanitizeInput = (value: string) => {
    const raw = value.replace(/\s+/g, '');
    if (registerSettings.allowLetters) {
      return raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    return raw.replace(/[^0-9]/g, '');
  };

  const handleInputChange = (index: number, value: string) => {
    const sanitized = sanitizeInput(value);
    const char = sanitized.slice(-1);
    setCode(prev => {
      const next = [...prev];
      next[index] = char;
      return next;
    });
    if (char && index < registerSettings.length - 1) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !code[index] && index > 0) {
      event.preventDefault();
      setCode(prev => {
        const next = [...prev];
        next[index - 1] = '';
        return next;
      });
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const text = event.clipboardData.getData('text');
    if (!text) return;
    event.preventDefault();
    const sanitized = sanitizeInput(text);
    if (!sanitized) return;
    const chars = sanitized.split('').slice(0, registerSettings.length);
    setCode(() => {
      const next = Array(registerSettings.length).fill('');
      for (let i = 0; i < chars.length; i++) {
        next[i] = chars[i];
      }
      return next;
    });
    const focusIndex = Math.min(chars.length, registerSettings.length - 1);
    inputRefs.current[focusIndex]?.focus();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const employeeId = code.join('');
    if (employeeId.length !== registerSettings.length || loading) return;

    setLoading(true);
    setFeedback({ type: '' });
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId }),
      });
      const data = await res.json();
      const mappedKey = data.code ? REGISTER_CODE_KEYS[data.code] : undefined;
      setFeedback({
        type: data.success ? 'success' : 'error',
        key: mappedKey,
        text: data.message,
      });
      if (data.success) {
        localStorage.setItem('lucky-draw-registered-id', employeeId);
        localStorage.setItem('lucky-draw-pool-version', poolVersionRef.current);
        setRegisteredId(employeeId);
        setCode(Array(registerSettings.length).fill(''));
        fetchStatus();
      }
    } catch {
      setFeedback({ type: 'error', key: 'register.networkError' });
    } finally {
      setLoading(false);
    }
  };

  // 出厂自带的 number 字段标签是程序文案，跟随语言；管理员改过的标签属于用户数据，原样展示
  const uniqueFieldLabel = uniqueField && !isShippedFieldLabel(uniqueField)
    ? uniqueField.label
    : t('register.idLabel');

  return (
    <div className="register-container">
      <div className="register-language">
        <LanguageSwitch scope="front" className="lang-switch-inline" />
      </div>
      <div className="register-card">
        <h1 className="register-title">{t('register.title')}</h1>

        {!isOpen ? (
          <div className="register-closed">
            <div className="closed-icon">&#128274;</div>
            <p>{t('register.closed')}</p>
            <p className="closed-hint">{t('register.closedHint')}</p>
          </div>
        ) : registeredId ? (
          <div className="register-closed">
            <div className="closed-icon">&#9989;</div>
            <p>{t('register.success')}</p>
            <p className="closed-hint">{uniqueFieldLabel}：{registeredId}</p>
          </div>
        ) : (
          <>
            <div className="register-status">
              <span className="status-dot open"></span>
              <span>{t('register.open')}</span>
              <span className="register-count">{t('register.count', { n: count })}</span>
            </div>

            <form onSubmit={handleSubmit} className="register-form">
              <div className="register-inputs" onPaste={handlePaste}>
                {code.map((value, index) => (
                  <input
                    key={index}
                    ref={el => { inputRefs.current[index] = el; }}
                    type="text"
                    value={value}
                    onChange={e => handleInputChange(index, e.target.value)}
                    onKeyDown={e => handleKeyDown(index, e)}
                    onFocus={e => e.currentTarget.select()}
                    inputMode={registerSettings.allowLetters ? 'text' : 'numeric'}
                    autoCapitalize={registerSettings.allowLetters ? 'characters' : 'none'}
                    autoComplete="off"
                    maxLength={1}
                    className="register-code-input"
                    aria-label={t('register.digitAria', { n: index + 1 })}
                    autoFocus={index === 0}
                    spellCheck={false}
                  />
                ))}
              </div>
              <div className="register-hint">
                {registerSettings.allowLetters
                  ? t('register.lengthAlnum', { label: uniqueFieldLabel, n: registerSettings.length })
                  : t('register.lengthDigits', { label: uniqueFieldLabel, n: registerSettings.length })}
              </div>
              <button
                type="submit"
                className="register-btn"
                disabled={loading || code.some(item => !item)}
              >
                {loading ? t('register.submitting') : t('register.submit')}
              </button>
            </form>

            {feedback.type && (
              <div className={`register-message ${feedback.type}`}>
                {feedback.key ? t(feedback.key) : feedback.text}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
