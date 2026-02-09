'use client';

import { useState, useEffect, useRef } from 'react';
import './page.css';

const DEFAULT_REGISTER_SETTINGS = {
  length: 6,
  allowLetters: false,
};

export default function RegisterPage() {
  const [registerSettings, setRegisterSettings] = useState(DEFAULT_REGISTER_SETTINGS);
  const [code, setCode] = useState<string[]>(
    Array(DEFAULT_REGISTER_SETTINGS.length).fill('')
  );
  const [isOpen, setIsOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState<'success' | 'error' | ''>('');
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
    setMessage('');
    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ employeeId }),
      });
      const data = await res.json();
      setMessage(data.message);
      setMessageType(data.success ? 'success' : 'error');
      if (data.success) {
        localStorage.setItem('lucky-draw-registered-id', employeeId);
        localStorage.setItem('lucky-draw-pool-version', poolVersionRef.current);
        setRegisteredId(employeeId);
        setCode(Array(registerSettings.length).fill(''));
        fetchStatus();
      }
    } catch {
      setMessage('网络错误，请重试');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="register-container">
      <div className="register-card">
        <h1 className="register-title">抽奖登记</h1>

        {!isOpen ? (
          <div className="register-closed">
            <div className="closed-icon">&#128274;</div>
            <p>登记通道暂未开放</p>
            <p className="closed-hint">请等待管理员开启登记</p>
          </div>
        ) : registeredId ? (
          <div className="register-closed">
            <div className="closed-icon">&#9989;</div>
            <p>您已成功登记</p>
            <p className="closed-hint">工号：{registeredId}</p>
          </div>
        ) : (
          <>
            <div className="register-status">
              <span className="status-dot open"></span>
              <span>登记开放中</span>
              <span className="register-count">已登记 {count} 人</span>
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
                    aria-label={`第 ${index + 1} 位工号`}
                    autoFocus={index === 0}
                    spellCheck={false}
                  />
                ))}
              </div>
              <div className="register-hint">
                工号为 {registerSettings.length} 位
                {registerSettings.allowLetters ? '字母或数字' : '数字'}
              </div>
              <button
                type="submit"
                className="register-btn"
                disabled={loading || code.some(item => !item)}
              >
                {loading ? '登记中...' : '立即登记'}
              </button>
            </form>

            {message && (
              <div className={`register-message ${messageType}`}>
                {message}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
