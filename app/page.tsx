'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Prize {
  id: string;
  level: string;
  name: string;
  quantity: number;
  color: string;
  sponsor: string;
  image?: string;
}

interface Round {
  id: number;
  name: string;
  prizes: Prize[];
}

interface WinnerInfo {
  level: string;
  name: string;
  winners?: WinnerSnapshot[];
  numbers?: string[];
}

interface WinnerSnapshot {
  id: string;
  displayText: string;
  values: Record<string, string>;
  wonAt: number;
}

interface DisplayParticipant {
  id: string;
  displayText: string;
  values?: Record<string, string>;
}

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

interface DisplaySettings {
  showQuantity: boolean;
  showSponsor: boolean;
  showNumberBorder: boolean;
  maskPhone: boolean;
}

interface DisplayState {
  currentPrizeId: string | null;
  currentRoundId: number;
  drawCount: number;
  isRolling: boolean;
  winners: string[];
  winnerDetails?: DisplayParticipant[];
  rounds: Round[];
  prizeRemaining: Record<string, number>;
  winnersByPrize: Record<string, WinnerInfo>;
  numberPool: string[];
  numbersPerRow: number;
  rollingPool?: Array<string | DisplayParticipant>;
  fontSizes?: FontSizeConfig;
  displaySettings?: DisplaySettings;
  fontColors?: FontColorConfig;
}



// 计算文本视觉宽度（区分全角/半角字符）
function getTextVisualWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const char of text) {
    const code = char.charCodeAt(0);
    // CJK统一汉字、全角标点等全角字符约占 1.0 倍字号宽度
    if (code > 0x2E7F || (code >= 0xFF00 && code <= 0xFFEF)) {
      width += fontSize;
    } else {
      width += fontSize * 0.6;
    }
  }
  return width;
}

// 计算池中最大文本视觉宽度
function getPoolMaxWidth(pool: DisplayParticipant[], fontSize: number): number {
  if (pool.length === 0) return 0;
  return Math.max(...pool.map(t => getTextVisualWidth(t.displayText, fontSize)));
}

function toDisplayParticipant(value: string | DisplayParticipant): DisplayParticipant {
  if (typeof value === 'string') {
    return { id: value, displayText: value };
  }
  return {
    id: value.id,
    displayText: value.displayText || value.id,
    values: value.values,
  };
}

interface WSMessage {
  type: 'state_update' | 'rolling_start' | 'rolling_stop' | 'reset' | 'show_qrcode';
  payload?: unknown;
}

export default function DisplayPage() {
  const [state, setState] = useState<DisplayState | null>(null);
  const [displayItems, setDisplayItems] = useState<DisplayParticipant[]>([]);
  const [isRolling, setIsRolling] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [qrCodeUrl, setQRCodeUrl] = useState('');
  const [qrCodeMessage, setQRCodeMessage] = useState('');
  const rollInterval = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const poolRef = useRef<DisplayParticipant[]>([]);
  const poolMaxWidthRef = useRef<number>(0);
  const lastPrizeIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);

  // 获取当前奖品
  const currentPrize = state?.currentPrizeId && state?.rounds
    ? state.rounds.flatMap(r => r.prizes).find(p => p.id === state.currentPrizeId)
    : null;

  // 清理定时器
  const clearRollInterval = useCallback(() => {
    if (rollInterval.current) {
      clearInterval(rollInterval.current);
      rollInterval.current = null;
    }
  }, []);

  // 本地滚动动画
  const startLocalRolling = useCallback((count: number) => {
    setIsRolling(true);
    clearRollInterval();

    rollInterval.current = setInterval(() => {
      const items: DisplayParticipant[] = [];
      const pool = poolRef.current;
      for (let i = 0; i < count && pool.length > 0; i++) {
        items.push(pool[Math.floor(Math.random() * pool.length)]);
      }
      setDisplayItems(items);
    }, 60);
  }, [clearRollInterval]);

  const stopLocalRolling = useCallback((winners: string[], winnerDetails?: DisplayParticipant[]) => {
    clearRollInterval();
    setIsRolling(false);
    setDisplayItems(
      winnerDetails && winnerDetails.length > 0
        ? winnerDetails.map(toDisplayParticipant)
        : winners.map(toDisplayParticipant)
    );
  }, [clearRollInterval]);

  // 处理 WebSocket 消息 - 使用 useCallback 避免闭包陷阱
  const handleWSMessage = useCallback((message: WSMessage) => {
    switch (message.type) {
      case 'state_update': {
        const newState = message.payload as DisplayState;
        setState(newState);
        poolRef.current = newState.rollingPool
          ? newState.rollingPool.map(toDisplayParticipant)
          : (newState.numberPool || []).map(toDisplayParticipant);
        const fontSize = newState.fontSizes?.numberCard || 38;
        poolMaxWidthRef.current = getPoolMaxWidth(poolRef.current, fontSize);

        // 检测奖品切换，清空显示
        if (newState.currentPrizeId !== lastPrizeIdRef.current) {
          lastPrizeIdRef.current = newState.currentPrizeId;
          setDisplayItems([]);
        }

        // 停止滚动
        if (!newState.isRolling) {
          clearRollInterval();
          setIsRolling(false);
        }
        break;
      }

      case 'rolling_start': {
        const payload = message.payload as { count: number };
        startLocalRolling(payload.count);
        break;
      }

      case 'rolling_stop': {
        const payload = message.payload as { winners: string[]; winnerDetails?: DisplayParticipant[] };
        stopLocalRolling(payload.winners, payload.winnerDetails);
        break;
      }

      case 'reset':
        setDisplayItems([]);
        setIsRolling(false);
        clearRollInterval();
        break;

      case 'show_qrcode': {
        const qrPayload = message.payload as { show: boolean; url: string; message?: string };
        setShowQRCode(qrPayload.show);
        setQRCodeUrl(qrPayload.url);
        setQRCodeMessage(qrPayload.message || '');
        break;
      }
    }
  }, [clearRollInterval, startLocalRolling, stopLocalRolling]);

  // 初始化获取状态
  useEffect(() => {
    fetch('/api/control/state')
      .then(res => {
        if (!res.ok) throw new Error('Failed to fetch state');
        return res.json();
      })
      .then(data => {
        setState(data);
        poolRef.current = data.rollingPool
          ? data.rollingPool.map(toDisplayParticipant)
          : (data.numberPool || []).map(toDisplayParticipant);
        const fontSize = data.fontSizes?.numberCard || 38;
        poolMaxWidthRef.current = getPoolMaxWidth(poolRef.current, fontSize); if (data.showQRCode) {
          setShowQRCode(true);
          setQRCodeUrl(`${window.location.origin}/register`);
          setQRCodeMessage(data.qrCodeMessage || '');
        }
      })
      .catch(err => console.error('Failed to load state:', err));
  }, []);

  // WebSocket 连接（带自动重连）
  useEffect(() => {
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        reconnectAttempts.current = 0;
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        // 自动重连（指数退避，最大 30 秒）
        const delay = Math.min(1000 * Math.pow(2, reconnectAttempts.current), 30000);
        reconnectAttempts.current++;
        console.log(`Reconnecting in ${delay}ms...`);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      };

      ws.onerror = (err) => console.error('WebSocket error:', err);

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as WSMessage;
          handleWSMessage(message);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };
    };

    connect();

    return () => {
      // 清理重连定时器
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      // 关闭 WebSocket
      if (wsRef.current) {
        wsRef.current.onclose = null; // 防止触发重连
        wsRef.current.close();
      }
      clearRollInterval();
    };
  }, [handleWSMessage, clearRollInterval]);

  // 获取显示设置（带有默认值 fallback）
  const showQuantity = state?.displaySettings?.showQuantity ?? true;
  const showSponsor = state?.displaySettings?.showSponsor ?? true;

  // 获取字体颜色（带有默认值 fallback）
  const fontColors = state?.fontColors || {
    prizeName: '#ffffff',
    sponsor: '#eeeeee',
    numberCard: '#ffd700',
  };

  if (!state) {
    return (
      <div className="app">
        <div className="bg"></div>
        <div className="main-display">
          <h1>加载中...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="bg"></div>
      {showQRCode ? (
        <div className="main-display">
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 30,
          }}>
            <h1 style={{
              fontSize: 56,
              color: '#ffd700',
              textShadow: '0 0 20px rgba(255, 215, 0, 0.6), 0 4px 10px rgba(0, 0, 0, 0.5)',
            }}>
              扫码签到
            </h1>
            <div style={{
              background: '#fff',
              padding: 20,
              borderRadius: 16,
              boxShadow: '0 0 40px rgba(255, 215, 0, 0.4)',
            }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrCodeUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/register`)}`}
                alt="签到二维码"
                width={280}
                height={280}
                style={{ display: 'block' }}
              />
            </div>
            <p style={{
              fontSize: 28,
              color: 'rgba(255, 255, 255, 0.8)',
              textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
            }}>
              {qrCodeMessage || '请扫描二维码，输入工号完成签到'}
            </p>
          </div>
        </div>
      ) : (
        <div className="main-display">
          {currentPrize ? (
            <div className={`prize-info ${currentPrize.image ? 'prize-info-with-image' : ''}`}>
              {currentPrize.image && (
                <div className="prize-image">
                  <img src={currentPrize.image} alt={currentPrize.name} />
                </div>
              )}
              <div className="prize-text">
                <h1
                  className="prize-level-title"
                  style={{
                    color: currentPrize.color,
                    fontSize: `${state?.fontSizes?.prizeLevel || 56}px`
                  }}
                >
                  🎊 {currentPrize.level} 🎊
                </h1>
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '15px' }}>
                  <div
                    className="prize-name"
                    style={{
                      fontSize: `${state?.fontSizes?.prizeName || 42}px`,
                      color: fontColors.prizeName
                    }}
                  >
                    {currentPrize.name}
                  </div>

                  {showQuantity && (
                    <div
                      className="prize-quantity"
                      style={{
                        fontSize: `${(state?.fontSizes?.prizeName || 42) * 0.7}px`,
                        color: fontColors.prizeName,
                        opacity: 0.9,
                      }}
                    >
                      ×{currentPrize.quantity}
                    </div>
                  )}
                </div>

                {showSponsor && (
                  <div
                    className="prize-sponsor"
                    style={{
                      fontSize: `${state?.fontSizes?.sponsor || 28}px`,
                      color: fontColors.sponsor
                    }}
                  >
                    （{currentPrize.sponsor}）
                  </div>
                )}
              </div>
            </div>
          ) : (
            <h1></h1>
          )}

          <div className="number-display">
            {displayItems.length > 0 ? (() => {
              // 动态计算样式
              const numFontSize = state?.fontSizes?.numberCard || 38;
              const borderWidth = Math.max(2, numFontSize * 0.08);
              const showBorder = state?.displaySettings?.showNumberBorder ?? true;
              const maskPhone = state?.displaySettings?.maskPhone ?? false;
              const maskNum = (n: string) =>
                maskPhone && n.length === 11 ? n.slice(0, 3) + '****' + n.slice(7) : n;
              const displayTexts = displayItems.map(item => maskNum(item.displayText));

              // 使用整个池的最大宽度来稳定卡片尺寸，避免滚动时布局抖动
              const cardPadding = numFontSize * 0.8;
              const poolBasedWidth = poolMaxWidthRef.current + cardPadding;
              // 同时也考虑当前显示文本（停止后中奖者可能不在池中了）
              const currentMaxWidth = Math.max(
                ...displayTexts.map(t => getTextVisualWidth(t, numFontSize)), 0
              ) + cardPadding;
              const cardWidth = Math.max(numFontSize * 2.8, poolBasedWidth, currentMaxWidth);
              const cardHeight = numFontSize * 1.8;
              const gap = 15;
              const maxWidth = (state?.numbersPerRow || 10) * (cardWidth + gap);

              return (
                <div
                  className="numbers-grid"
                  style={{
                    maxWidth: `${maxWidth}px`,
                    gap: `${gap}px`
                  }}
                >
                  {displayItems.map((item, i) => {
                    const text = displayTexts[i];
                    // 文字过长时自动缩小字号以适配卡片
                    const textWidth = getTextVisualWidth(text, numFontSize);
                    const availableWidth = cardWidth - cardPadding;
                    const scaledFontSize = textWidth > availableWidth
                      ? numFontSize * (availableWidth / textWidth)
                      : numFontSize;
                    return (
                      <div
                        key={`${item.id}-${i}`}
                        className={`number-card ${!isRolling ? 'winner' : ''}`}
                        style={{
                          fontSize: `${scaledFontSize}px`,
                          width: `${cardWidth}px`,
                          height: `${cardHeight}px`,
                          borderWidth: showBorder ? `${borderWidth}px` : 0,
                          color: fontColors.numberCard,
                          borderColor: showBorder ? fontColors.numberCard : 'transparent',
                          background: showBorder ? undefined : 'transparent',
                          boxShadow: showBorder ? undefined : 'none',
                        }}
                      >
                        {text}
                      </div>
                    );
                  })}
                </div>
              );
            })() : (
              <div className="placeholder">
                {currentPrize ? '等待抽奖...' : '请在控制台选择奖品'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
