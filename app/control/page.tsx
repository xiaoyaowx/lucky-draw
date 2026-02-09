'use client';

import { useState, useEffect } from 'react';

interface Prize {
  id: string;
  level: string;
  name: string;
  quantity: number;
  color: string;
  sponsor: string;
}

interface Round {
  id: number;
  name: string;
  prizes: Prize[];
}

interface WinnerInfo {
  level: string;
  name: string;
  numbers: string[];
  roundName?: string;
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
  allowRepeatWin?: boolean;
}

export default function ControlPage() {
  const [state, setState] = useState<ControlState | null>(null);
  const [currentRoundId, setCurrentRoundId] = useState(1);
  const [currentPrizeId, setCurrentPrizeId] = useState<string | null>(null);
  const [drawCount, setDrawCount] = useState(1);
  const [isRolling, setIsRolling] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [qrCodeMessage, setQRCodeMessage] = useState('请扫描二维码，输入工号完成签到');

  const currentRound = state?.rounds.find(r => r.id === currentRoundId);
  const currentPrize = currentPrizeId && currentRound
    ? currentRound.prizes.find(p => p.id === currentPrizeId)
    : null;

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
        setQRCodeMessage(data.qrCodeMessage || '请扫描二维码，输入工号完成签到');
      }
    } catch {
      // ignore
    }
  };

  const fetchState = async () => {
    const res = await fetch('/api/control/state');
    const data = await res.json();
    setState(data);
    setCurrentRoundId(data.currentRoundId || 1);
    setCurrentPrizeId(data.currentPrizeId);
    setDrawCount(data.drawCount || 1);
    setIsRolling(data.isRolling || false);
  };

  const updateState = async (updates: Partial<ControlState>) => {
    await fetch('/api/control/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
  };

  const handleRoundChange = (roundId: number) => {
    if (isRolling) return;
    setCurrentRoundId(roundId);
    setCurrentPrizeId(null);
    updateState({ currentRoundId: roundId, currentPrizeId: null });
  };

  const handlePrizeChange = (prizeId: string) => {
    if (isRolling) return;
    setCurrentPrizeId(prizeId);
    const remaining = state?.prizeRemaining[prizeId] || 0;
    const newCount = Math.min(remaining, 30);
    setDrawCount(newCount);
    updateState({ currentPrizeId: prizeId, drawCount: newCount });
  };

  const handleCountChange = (count: number) => {
    setDrawCount(count);
    updateState({ drawCount: count });
  };

  const handleStart = async () => {
    if (!currentPrizeId) return;
    setIsRolling(true);
    const res = await fetch('/api/control/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ count: drawCount, prizeId: currentPrizeId }),
    });
    if (!res.ok) {
      const data = await res.json();
      setIsRolling(false);
      alert(data.error || '开始抽奖失败');
    }
  };

  const handleStop = async () => {
    const res = await fetch('/api/control/stop', { method: 'POST' });
    const data = await res.json();
    setIsRolling(false);
    if (!res.ok) {
      alert(data.error || '停止抽奖失败');
      return;
    }
    if (state) {
      setState({
        ...state,
        prizeRemaining: data.prizeRemaining,
        winnersByPrize: data.winnersByPrize,
        numberPool: data.numberPool || state.numberPool,
      });
      // 自动调整抽取数量，避免超出剩余
      if (currentPrizeId) {
        const newRemaining = data.prizeRemaining[currentPrizeId] || 0;
        if (drawCount > newRemaining) {
          const adjusted = Math.min(newRemaining, 30);
          setDrawCount(adjusted);
          updateState({ drawCount: adjusted });
        }
      }
    }
  };

  const handleReset = async () => {
    if (!confirm('确定要重置所有抽奖数据吗？')) return;
    await fetch('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    fetchState();
  };

  const handleResetPrize = async () => {
    if (!currentPrizeId || !currentPrize) return;
    if (!confirm(`确定要重置【${currentPrize.level} - ${currentPrize.name}】的抽奖数据吗？`)) return;
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
        setQRCodeMessage(data.qrCodeMessage || qrCodeMessage);
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
        setQRCodeMessage(data.qrCodeMessage || qrCodeMessage);
      }
    } catch {
      // ignore
    }
  };

  const totalWinners = state
    ? Object.values(state.winnersByPrize).reduce((s, p) => s + p.numbers.length, 0)
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

    let content = '抽奖中奖记录\n';
    content += '导出时间: ' + new Date().toLocaleString() + '\n';
    content += '=' .repeat(50) + '\n\n';

    // 按轮次分组
    const byRound: Record<string, { level: string; name: string; numbers: string[] }[]> = {};

    Object.entries(state.winnersByPrize).forEach(([prizeId, info]) => {
      const roundName = getRoundNameByPrizeId(prizeId);
      if (!byRound[roundName]) {
        byRound[roundName] = [];
      }
      byRound[roundName].push(info);
    });

    Object.entries(byRound).forEach(([roundName, prizes]) => {
      content += `【${roundName}】\n`;
      prizes.forEach(p => {
        content += `  ${p.level} - ${p.name} (${p.numbers.length}人)\n`;
        content += `  中奖号码: ${p.numbers.join(', ')}\n\n`;
      });
    });

    content += '=' .repeat(50) + '\n';
    content += `总计中奖: ${totalWinners}人\n`;

    // 下载文件
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `中奖记录_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!state) {
    return <div className="control-container"><h1>加载中...</h1></div>;
  }

  return (
    <div className="control-container">
      <h1 className="control-title">抽奖控制台</h1>

      <div className="control-section">
        <h3>轮次选择</h3>
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
        <h3>奖品选择</h3>
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
                <span>{rem}/{p.quantity}</span>
              </div>
            );
          })}
        </div>
      </div>

      {currentPrize && (
        <div className="control-section">
          <h3>抽取数量</h3>
          <div className="btns">
            {(() => {
              const remaining = state.prizeRemaining[currentPrize.id] || 0;
              const baseOptions = [1, 5, 10, 15, 20, 30];
              // 如果剩余数量大于0且不在基础选项中，添加它
              const options = (remaining > 0 && !baseOptions.includes(remaining))
                ? [...baseOptions, remaining].sort((a, b) => a - b)
                : baseOptions;
              return options.map(n => (
                <button
                  key={n}
                  className={drawCount === n ? 'active' : ''}
                  disabled={n > remaining || isRolling}
                  onClick={() => handleCountChange(n)}
                >
                  {n === remaining && !baseOptions.includes(remaining) ? `${n}(全部)` : n}
                </button>
              ));
            })()}
          </div>
        </div>
      )}

      <div className="control-section">
        <h3>签到登记</h3>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: 'block', fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 6 }}>
            二维码提示文字
          </label>
          <div className="control-input-group">
            <input
              type="text"
              value={qrCodeMessage}
              onChange={(e) => setQRCodeMessage(e.target.value)}
              placeholder="请输入提示文字"
              className="control-input"
            />
            <button
              type="button"
              className="control-icon-btn"
              onClick={handleUpdateQRCodeMessage}
              disabled={isRolling}
              aria-label="保存提示文字"
              title="保存提示文字"
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
            {showQRCode ? '关闭签到二维码' : '显示签到二维码'}
          </button>
        </div>
        {showQRCode && (
          <p style={{ marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
            大屏正在显示签到二维码，用户可扫码登记工号
          </p>
        )}
      </div>

      <div className="control-section">
        <h3>操作</h3>
        <div className="btns">
          <button
            className={`action ${isRolling ? 'stop' : 'start'}`}
            onClick={() => isRolling ? handleStop() : handleStart()}
            disabled={showQRCode || !currentPrize || (state.prizeRemaining[currentPrize?.id || ''] || 0) === 0}
          >
            {isRolling ? '停止抽奖' : '开始抽奖'}
          </button>
          <button
            onClick={handleResetPrize}
            disabled={isRolling || !currentPrize}
          >
            重置当前奖品
          </button>
          <button onClick={handleReset} disabled={isRolling}>重置全部</button>
        </div>
      </div>

      <div className="control-section">
        <h3>状态</h3>
        <p>剩余号码: {state.allowRepeatWin ? state.numberPool.length : `${state.numberPool.length - totalWinners} / ${state.numberPool.length}`}</p>
      </div>

      <div className="control-section winners">
        <h3>
          中奖记录 ({totalWinners}人)
          {totalWinners > 0 && (
            <button onClick={handleExport} className="export-btn">导出记录</button>
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
                  <div className="wg-header">{d.level} - {d.name} ({d.numbers.length})</div>
                  <div className="wg-nums">{d.numbers.join(', ')}</div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
