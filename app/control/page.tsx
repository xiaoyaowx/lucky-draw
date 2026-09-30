'use client';

import { useState, useEffect } from 'react';
import LanguageSwitch from '../components/LanguageSwitch';
import { useI18n } from '@/lib/i18n/useI18n';

interface Prize {
  id: string;
  level: string;
  name: string;
  quantity: number;
  color: string;
  sponsor: string;
  requireCheckIn?: boolean;
}

interface Round {
  id: number;
  name: string;
  prizes: Prize[];
  poolType?: 'preset' | 'live';
  poolBindings?: PoolBinding[];
}

interface PoolBinding {
  poolId: string;
  probability: number;
}

interface AvailablePool {
  poolId: string;
  name: string;
  probability: number;
  count: number;
  isLive?: boolean;
}

interface WinnerInfo {
  level: string;
  name: string;
  winners?: WinnerSnapshot[];
  numbers?: string[];
  roundName?: string;
}

interface WinnerSnapshot {
  id: string;
  displayText: string;
  values: Record<string, string>;
  wonAt: number;
}

interface ControlState {
  currentPrizeId: string | null;
  currentRoundId: number;
  drawCount: number;
  isRolling: boolean;
  winners: string[];
  rounds: Round[];
  prizeRemaining: Record<string, number>;
  winnersByPrize: Record<string, WinnerInfo>;
  numberPool: string[];
  livePoolCount: number;
  availablePoolSize: number;
  currentRoundPoolBindings?: PoolBinding[];
  availablePools?: AvailablePool[];
  allowRepeatWin?: boolean;
}

function getWinnerIds(info: WinnerInfo): string[] {
  return info.winners && info.winners.length > 0
    ? info.winners.map(winner => winner.id)
    : (info.numbers || []);
}

function getWinnerTexts(info: WinnerInfo): string[] {
  return info.winners && info.winners.length > 0
    ? info.winners.map(winner => winner.displayText || winner.id)
    : (info.numbers || []);
}

export default function ControlPage() {
  const { t, lang } = useI18n('admin');
  const [state, setState] = useState<ControlState | null>(null);
  const [currentRoundId, setCurrentRoundId] = useState(1);
  const [currentPrizeId, setCurrentPrizeId] = useState<string | null>(null);
  const [drawCount, setDrawCount] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  // 空串表示「还没设过提示语」，此时输入框用 placeholder 显示当前语言的默认文案，
  // 真正保存时再把它落成具体文字 —— 这样切语言不会把已保存的自定义文案覆盖掉。
  const [qrCodeMessage, setQRCodeMessage] = useState('');

  const currentRound = state?.rounds.find(r => r.id === currentRoundId);
  const currentPrize = currentPrizeId && currentRound
    ? currentRound.prizes.find(p => p.id === currentPrizeId)
    : null;
  const maxDrawCount = currentPrizeId ? getMaxDrawCount(state, currentPrizeId) : 0;

  function getMaxDrawCount(targetState: ControlState | null, prizeId: string | null): number {
    if (!targetState || !prizeId) return 0;
    const remaining = targetState.prizeRemaining[prizeId] || 0;
    const available = targetState.availablePoolSize ?? remaining;
    return Math.max(0, Math.min(remaining, available));
  }

  function normalizeDrawCount(count: number, maxDraw = maxDrawCount): number {
    if (maxDraw <= 0) return 0;
    if (!Number.isFinite(count)) return 1;
    return Math.min(Math.max(Math.floor(count), 1), maxDraw);
  }

  useEffect(() => {
    fetchState();
    fetchQRCodeState();
  }, []);

  const fetchQRCodeState = async () => {
    try {
      const res = await fetch('/api/control/qrcode');
      const data = await res.json();
      setShowQRCode(data.showQRCode || false);
      if (typeof data.qrCodeMessage === 'string') {
        setQRCodeMessage(data.qrCodeMessage);
      }
    } catch {
      // ignore
    }
  };

  const fetchState = async () => {
    const res = await fetch('/api/control/state');
    const data = await res.json();
    const nextPrizeId = data.currentPrizeId || null;
    const nextDrawCount = nextPrizeId
      ? normalizeDrawCount(Number(data.drawCount ?? 1), getMaxDrawCount(data, nextPrizeId))
      : (data.drawCount || 1);
    setState(data);
    setCurrentRoundId(data.currentRoundId || 1);
    setCurrentPrizeId(nextPrizeId);
    setDrawCount(nextDrawCount);
    setIsRolling(data.isRolling || false);
    if (nextPrizeId && data.drawCount !== nextDrawCount) {
      updateState({ drawCount: nextDrawCount });
    }
  };

  const updateState = async (updates: Partial<ControlState>) => {
    const res = await fetch('/api/control/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    const data = await res.json();
    if (res.ok) {
      setState(data);
    }
    return data;
  };

  const handleRoundChange = async (roundId: number) => {
    if (isRolling) return;
    setCurrentRoundId(roundId);
    setCurrentPrizeId(null);
    await updateState({ currentRoundId: roundId, currentPrizeId: null });
    fetchState();
  };

  const handlePrizeChange = async (prizeId: string) => {
    if (isRolling) return;
    setCurrentPrizeId(prizeId);
    const nextState = await updateState({ currentPrizeId: prizeId });
    const newCount = Math.min(getMaxDrawCount(nextState, prizeId), 30);
    setDrawCount(newCount);
    await updateState({ currentPrizeId: prizeId, drawCount: newCount });
  };

  const handleCountChange = (count: number) => {
    const nextCount = normalizeDrawCount(count);
    setDrawCount(nextCount);
    updateState({ drawCount: nextCount });
  };

  const handleStart = async () => {
    if (!currentPrizeId) return;
    if (maxDrawCount <= 0) {
      alert(t('control.noAvailable'));
      return;
    }
    if (drawCount < 1 || drawCount > maxDrawCount) {
      const nextCount = normalizeDrawCount(drawCount);
      setDrawCount(nextCount);
      updateState({ drawCount: nextCount });
      alert(t('control.overLimit', { n: maxDrawCount }));
      return;
    }
    setIsRolling(true);
    const res = await fetch('/api/control/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: drawCount, prizeId: currentPrizeId }),
    });
    if (!res.ok) {
      const data = await res.json();
      setIsRolling(false);
      alert(data.error || t('control.startFailed'));
    }
  };

  const handleStop = async () => {
    const res = await fetch('/api/control/stop', { method: 'POST' });
    const data = await res.json();
    setIsRolling(false);
    if (!res.ok) {
      alert(data.error || t('control.stopFailed'));
      fetchState();
      return;
    }
    if (state) {
      setState({
        ...state,
        prizeRemaining: data.prizeRemaining,
        winnersByPrize: data.winnersByPrize,
        numberPool: data.numberPool || state.numberPool,
        availablePoolSize: data.availablePoolSize ?? state.availablePoolSize,
      });
      // 自动调整抽取数量，避免超出剩余
      if (currentPrizeId) {
        const newRemaining = data.prizeRemaining[currentPrizeId] || 0;
        const newAvailable = data.availablePoolSize ?? newRemaining;
        const newMaxDraw = Math.max(0, Math.min(newRemaining, newAvailable));
        if (drawCount > newMaxDraw) {
          const adjusted = normalizeDrawCount(drawCount, newMaxDraw);
          setDrawCount(adjusted);
          updateState({ drawCount: adjusted });
        }
      }
    }
  };

  const handleReset = async () => {
    if (!confirm(t('control.confirmResetAll'))) return;
    await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    fetchState();
  };

  const handleResetPrize = async () => {
    if (!currentPrizeId || !currentPrize) return;
    if (!confirm(t('control.confirmResetPrize', { level: currentPrize.level, name: currentPrize.name }))) return;
    await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prizeId: currentPrizeId }),
    });
    fetchState();
  };

  const handleToggleQRCode = async () => {
    try {
      const res = await fetch('/api/control/qrcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show: !showQRCode, message: qrCodeMessage }),
      });
      const data = await res.json();
      setShowQRCode(data.showQRCode);
      if (typeof data.qrCodeMessage === 'string') {
        setQRCodeMessage(data.qrCodeMessage);
      }
    } catch {
      // ignore
    }
  };

  const handleUpdateQRCodeMessage = async () => {
    try {
      const res = await fetch('/api/control/qrcode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ show: showQRCode, message: qrCodeMessage }),
      });
      const data = await res.json();
      setShowQRCode(data.showQRCode);
      if (typeof data.qrCodeMessage === 'string') {
        setQRCodeMessage(data.qrCodeMessage);
      }
    } catch {
      // ignore
    }
  };

  const totalWinners = state
    ? Object.values(state.winnersByPrize).reduce((s, p) => s + getWinnerIds(p).length, 0)
    : 0;

  // 根据奖品ID获取轮次名称
  const getRoundNameByPrizeId = (prizeId: string): string => {
    if (!state) return '';
    for (const round of state.rounds) {
      if (round.prizes.some(p => p.id === prizeId)) {
        return round.name;
      }
    }
    return '';
  };

  // 导出中奖记录
  const handleExport = () => {
    if (!state) return;

    let content = t('control.exportTitle') + '\n';
    content += t('control.exportTime', { time: new Date().toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US') }) + '\n';
    content += '=' .repeat(50) + '\n\n';

    // 按轮次分组
    const byRound: Record<string, WinnerInfo[]> = {};

    Object.entries(state.winnersByPrize).forEach(([prizeId, info]) => {
      const roundName = getRoundNameByPrizeId(prizeId);
      if (!byRound[roundName]) {
        byRound[roundName] = [];
      }
      byRound[roundName].push(info);
    });

    Object.entries(byRound).forEach(([roundName, prizes]) => {
      content += t('control.exportRound', { name: roundName }) + '\n';
      prizes.forEach(p => {
        const winnerTexts = getWinnerTexts(p);
        content += '  ' + t('control.exportPrizeLine', { level: p.level, name: p.name, n: winnerTexts.length }) + '\n';
        content += '  ' + t('control.exportWinnerList', { list: winnerTexts.join(', ') }) + '\n\n';
      });
    });

    content += '=' .repeat(50) + '\n';
    content += t('control.exportTotal', { n: totalWinners }) + '\n';

    // 下载文件
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${t('control.exportFilename', { date: new Date().toISOString().slice(0, 10) })}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!state) {
    return <div className="control-container"><h1>{t('common.loading')}</h1></div>;
  }

  return (
    <div className="control-container">
      <div className="control-header">
        <LanguageSwitch scope="admin" className="lang-switch-inline" />
        <h1 className="control-title">{t('control.title')}</h1>
      </div>

      <div className="control-section">
        <h3>{t('control.roundSelect')}</h3>
        <div className="btns">
          {state.rounds.map(r => (
            <button
              key={r.id}
              className={currentRoundId === r.id ? 'active' : ''}
              onClick={() => handleRoundChange(r.id)}
              disabled={isRolling}
            >
              {r.name}
            </button>
          ))}
        </div>
      </div>

      <div className="control-section">
        <h3>{t('control.prizeSelect')}</h3>
        <div className="prize-list">
          {currentRound?.prizes.map(p => {
            const rem = state.prizeRemaining[p.id] || 0;
            return (
              <div
                key={p.id}
                className={`prize-item ${currentPrizeId === p.id ? 'active' : ''} ${rem === 0 ? 'empty' : ''}`}
                onClick={() => !isRolling && handlePrizeChange(p.id)}
              >
                <span style={{ color: p.color }}>{p.level}</span>
                <span className="pname">{p.name}</span>
                {p.requireCheckIn && <span className="prize-tag">{t('control.checkInOnly')}</span>}
                <span>{rem}/{p.quantity}</span>
              </div>
            );
          })}
        </div>
      </div>

      {currentPrize && (
        <div className="control-section">
          <h3>{t('control.drawCount')}</h3>
          <div className="count-selector">
            <div className="btns">
              {(() => {
                const remaining = state.prizeRemaining[currentPrize.id] || 0;
                const available = state.availablePoolSize ?? remaining;
                const maxDraw = Math.min(remaining, available);
                const baseOptions = [1, 5, 10, 15, 20, 30];
                // 如果剩余数量大于0且不在基础选项中，添加它
                const options = (maxDraw > 0 && !baseOptions.includes(maxDraw))
                  ? [...baseOptions, maxDraw].sort((a, b) => a - b)
                  : baseOptions;
                return options.map(n => (
                  <button
                    key={n}
                    className={drawCount === n ? 'active' : ''}
                    disabled={n > maxDraw || isRolling}
                    onClick={() => handleCountChange(n)}
                  >
                    {n === maxDraw && !baseOptions.includes(maxDraw) ? t('control.allOption', { n }) : n}
                  </button>
                ));
              })()}
            </div>
            <div className="custom-count-row">
              <label htmlFor="custom-draw-count">{t('control.custom')}</label>
              <input
                id="custom-draw-count"
                className="control-input custom-count-input"
                type="number"
                min={maxDrawCount > 0 ? 1 : 0}
                max={maxDrawCount}
                step={1}
                value={drawCount}
                disabled={isRolling || maxDrawCount <= 0}
                onChange={(e) => handleCountChange(Number(e.target.value))}
                onBlur={() => handleCountChange(drawCount)}
              />
              <span className="count-limit">{t('control.maxCount', { n: maxDrawCount })}</span>
            </div>
          </div>
        </div>
      )}

      <div className="control-section">
        <h3>{t('control.checkIn')}</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>
            {t('control.qrMessageLabel')}
          </label>
          <div className="control-input-group">
            <input
              type="text"
              value={qrCodeMessage}
              onChange={(e) => setQRCodeMessage(e.target.value)}
              placeholder={t('control.defaultQrMessage')}
              className="control-input"
            />
            <button
              type="button"
              className="control-icon-btn"
              onClick={handleUpdateQRCodeMessage}
              disabled={isRolling}
              aria-label={t('control.saveQrMessage')}
              title={t('control.saveQrMessage')}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M5 4h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm2 0v6h8V4H7zm0 10h10v5H7v-5zm2-8h4v3H9V6z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </div>
        <div className="btns">
          <button
            className={showQRCode ? 'stop' : 'start'}
            onClick={handleToggleQRCode}
            disabled={isRolling}
            style={{ flex: 1 }}
          >
            {showQRCode ? t('control.hideQr') : t('control.showQr')}
          </button>
        </div>
        {showQRCode && (
          <p style={{ marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            {t('control.qrShowing')}
          </p>
        )}
      </div>

      <div className="control-section">
        <h3>{t('control.actions')}</h3>
        <div className="btns">
          <button
            className={`action ${isRolling ? 'stop' : 'start'}`}
            onClick={() => isRolling ? handleStop() : handleStart()}
            disabled={showQRCode || !currentPrize || (state.prizeRemaining[currentPrize?.id || ''] || 0) === 0 || (!isRolling && (state.availablePoolSize === 0 || drawCount < 1 || drawCount > maxDrawCount))}
          >
            {isRolling ? t('control.stop') : t('control.start')}
          </button>
          <button
            onClick={handleResetPrize}
            disabled={isRolling || !currentPrize}
          >
            {t('control.resetPrize')}
          </button>
          <button onClick={handleReset} disabled={isRolling}>{t('control.resetAll')}</button>
        </div>
      </div>

      <div className="control-section">
        <h3>{t('control.status')}</h3>
        <p>{t('control.availableNumbers', { n: state.availablePoolSize })}</p>
        {state.availablePools && state.availablePools.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
            {state.availablePools.map(pool => (
              <span
                key={pool.poolId}
                style={{
                  padding: '4px 8px',
                  borderRadius: 6,
                  background: 'rgba(255,255,255,0.08)',
                  color: 'rgba(255,255,255,0.75)',
                  fontSize: 12,
                }}
              >
                {t('control.poolChip', { name: pool.name, p: pool.probability, n: pool.count })}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="control-section winners">
        <h3>
          {t('control.winnersCount', { n: totalWinners })}
          {totalWinners > 0 && (
            <button onClick={handleExport} className="export-btn">{t('control.exportWinners')}</button>
          )}
        </h3>
        {state.rounds.map(round => {
          const roundPrizes = Object.entries(state.winnersByPrize).filter(
            ([prizeId]) => round.prizes.some(p => p.id === prizeId)
          );
          if (roundPrizes.length === 0) return null;
          return (
            <div key={round.id} className="round-winners">
              <div className="round-title">{round.name}</div>
              {roundPrizes.map(([id, d]) => (
                <div key={id} className="winner-group">
                  <div className="wg-header">{d.level} - {d.name} ({getWinnerIds(d).length})</div>
                  <div className="wg-nums">{getWinnerTexts(d).join(', ')}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
