'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

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

export default function GuestDrawPage() {
  const [state, setState] = useState<GuestState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
      setError('');
    } catch {
      setError('状态同步失败');
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
            setError('');
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
    setError('');
    try {
      const count = normalizeDrawCount(state.drawCount, maxDrawCount);
      const res = await fetch('/api/control/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count, prizeId: state.currentPrizeId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '开始抽奖失败');
      setState(prev => prev ? { ...prev, isRolling: true, drawCount: count } : prev);
      await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : '开始抽奖失败');
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/control/stop', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '停止抽奖失败');
      setState(prev => prev ? {
        ...prev,
        isRolling: false,
        prizeRemaining: data.prizeRemaining || prev.prizeRemaining,
        availablePoolSize: data.availablePoolSize ?? prev.availablePoolSize,
      } : prev);
      await fetchState();
    } catch (err) {
      setError(err instanceof Error ? err.message : '停止抽奖失败');
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
          <h1>嘉宾抽奖</h1>
        </div>
      </div>

      <section className="guest-stage">
        <div className="guest-prize-area">
          <div className="guest-round">{currentRound?.name || '等待控制台'}</div>
          <div className="guest-prize-level" style={{ color: currentPrize?.color || '#ffd700' }}>
            {currentPrize?.level || '未选择奖品'}
          </div>
          <div className="guest-prize-name">{currentPrize?.name || '请先在控制台选择本次奖品'}</div>
          {currentPrize?.sponsor && <div className="guest-sponsor">{currentPrize.sponsor}</div>}
          {error && <div className="guest-error">{error}</div>}
        </div>

        <div className="guest-action-area">
          <div className="guest-action-copy">
            {state?.isRolling ? '抽奖进行中' : currentPrize ? '请点击按钮启动本次抽奖' : '等待控制台选择奖品'}
          </div>
          <button
            type="button"
            className={`guest-primary-button ${state?.isRolling ? 'stop' : 'start'}`}
            onClick={handlePrimaryAction}
            disabled={disabled}
          >
            {busy ? '处理中' : state?.isRolling ? '停止抽奖' : '开始抽奖'}
          </button>
        </div>
      </section>

    </main>
  );
}
