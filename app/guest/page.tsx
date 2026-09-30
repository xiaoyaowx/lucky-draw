'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import LanguageSwitch from '../components/LanguageSwitch';
import { useI18n } from '@/lib/i18n/useI18n';
import type { TranslationKey } from '@/lib/i18n';

interface Prize {
  id: string;
  level: string;
  name: string;
  quantity: number;
  color: string;
  sponsor?: string;
  requireCheckIn?: boolean;
}

interface Round {
  id: number;
  name: string;
  prizes: Prize[];
}

interface GuestState {
  currentPrizeId: string | null;
  currentRoundId: number;
  drawCount: number;
  isRolling: boolean;
  rounds: Round[];
  prizeRemaining: Record<string, number>;
  availablePoolSize: number;
  livePoolCount: number;
}

interface WSMessage {
  type: 'state_update' | 'rolling_start' | 'rolling_stop' | 'reset' | 'show_qrcode';
  payload?: unknown;
}

function getMaxDrawCount(state: GuestState | null, prizeId: string | null): number {
  if (!state || !prizeId) return 0;
  const remaining = state.prizeRemaining[prizeId] || 0;
  const available = state.availablePoolSize ?? remaining;
  return Math.max(0, Math.min(remaining, available));
}

function normalizeDrawCount(count: number, maxDraw: number): number {
  if (maxDraw <= 0) return 0;
  if (!Number.isFinite(count)) return 1;
  return Math.min(Math.max(Math.floor(count), 1), maxDraw);
}

/**
 * 错误信息存成「文案 key 或服务端原文」二选一。
 *
 * 存 key 而不是直接存翻译好的字符串，好处是切换语言时错误提示会跟着变；
 * 服务端返回的原文（data.error）则原样展示，因为它属于后端数据。
 */
type ErrorMessage = { key: TranslationKey } | { text: string };

export default function GuestDrawPage() {
  const { t } = useI18n('front');
  const [state, setState] = useState<GuestState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);

  const currentRound = state?.rounds.find(round => round.id === state.currentRoundId) || null;
  const currentPrize = state?.currentPrizeId && currentRound
    ? currentRound.prizes.find(prize => prize.id === state.currentPrizeId) || null
    : null;
  const maxDrawCount = getMaxDrawCount(state, state?.currentPrizeId || null);

  const fetchState = useCallback(async () => {
    try {
      const res = await fetch('/api/control/state', { cache: 'no-store' });
      if (!res.ok) throw new Error('Failed to load state');
      const data = await res.json() as GuestState;
      setState(data);
      setError(null);
    } catch {
      setError({ key: 'guest.stateFailed' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  useEffect(() => {
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttemptsRef.current = 0;
      };

      ws.onclose = () => {
        const delay = Math.min(1000 * Math.pow(2, reconnectAttemptsRef.current), 30000);
        reconnectAttemptsRef.current += 1;
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = () => {
        // reconnect is handled by onclose
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;
          if (message.type === 'state_update') {
            setState(message.payload as GuestState);
            setError(null);
          }
          if (message.type === 'rolling_start') {
            const payload = message.payload as { count?: number; prizeId?: string };
            setState(prev => prev ? {
              ...prev,
              isRolling: true,
              drawCount: payload.count || prev.drawCount,
              currentPrizeId: payload.prizeId || prev.currentPrizeId,
            } : prev);
          }
          if (message.type === 'rolling_stop') {
            setState(prev => prev ? { ...prev, isRolling: false } : prev);
          }
          if (message.type === 'reset') {
            fetchState();
          }
        } catch {
          // ignore malformed websocket payloads
        }
      };
    };

    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [fetchState]);

  const handleStart = async () => {
    if (!state?.currentPrizeId || maxDrawCount <= 0) return;
    setBusy(true);
    setError(null);
    try {
      const count = normalizeDrawCount(state.drawCount, maxDrawCount);
      const res = await fetch('/api/control/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, prizeId: state.currentPrizeId }),
      });
      const data = await res.json().catch(() => ({}));
      // 服务端错误原文优先（它是后端数据），没有才退回本地文案
      if (!res.ok) throw new Error(data.error || t('guest.startFailed'));
      setState(prev => prev ? { ...prev, isRolling: true, drawCount: count } : prev);
      await fetchState();
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('guest.startFailed') });
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/control/stop', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || t('guest.stopFailed'));
      setState(prev => prev ? {
        ...prev,
        isRolling: false,
        prizeRemaining: data.prizeRemaining || prev.prizeRemaining,
        availablePoolSize: data.availablePoolSize ?? prev.availablePoolSize,
      } : prev);
      await fetchState();
    } catch (err) {
      setError({ text: err instanceof Error ? err.message : t('guest.stopFailed') });
      await fetchState();
    } finally {
      setBusy(false);
    }
  };

  const handlePrimaryAction = () => {
    if (!state || busy) return;
    if (state.isRolling) {
      handleStop();
    } else {
      handleStart();
    }
  };

  const disabled = loading || busy || !currentPrize || (!state?.isRolling && maxDrawCount <= 0);

  return (
    <main className="guest-page">
      <div className="guest-topbar">
        <div>
          <div className="guest-kicker">Lucky Draw</div>
          <h1>{t('guest.title')}</h1>
        </div>
        <LanguageSwitch scope="front" className="lang-switch-inline" />
      </div>

      <section className="guest-stage">
        <div className="guest-prize-area">
          <div className="guest-round">{currentRound?.name || t('guest.roundWaiting')}</div>
          <div className="guest-prize-level" style={{ color: currentPrize?.color || '#ffd700' }}>
            {currentPrize?.level || t('guest.noPrize')}
          </div>
          <div className="guest-prize-name">{currentPrize?.name || t('guest.selectPrize')}</div>
          {currentPrize?.sponsor && <div className="guest-sponsor">{currentPrize.sponsor}</div>}
          {error && (
            <div className="guest-error">{'key' in error ? t(error.key) : error.text}</div>
          )}
        </div>

        <div className="guest-action-area">
          <div className="guest-action-copy">
            {state?.isRolling
              ? t('guest.rolling')
              : currentPrize
                ? t('guest.ready')
                : t('guest.waiting')}
          </div>
          <button
            type="button"
            className={`guest-primary-button ${state?.isRolling ? 'stop' : 'start'}`}
            onClick={handlePrimaryAction}
            disabled={disabled}
          >
            {busy ? t('guest.processing') : state?.isRolling ? t('guest.stop') : t('guest.start')}
          </button>
        </div>
      </section>

    </main>
  );
}
