'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import LanguageSwitch from './components/LanguageSwitch';
import { useI18n } from '@/lib/i18n/useI18n';
import { computeDisplayLayout, fitTextFontSize } from '@/lib/display-layout';

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
  backgroundImage?: string;
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

/**
 * 最长展示文本在「字号 1」时的视觉宽度。
 *
 * 存成「每 1px 字号占多少像素」而不是某个具体字号下的像素宽度，
 * 这样缩放字号时可以直接乘出来，不用重新量。
 */
function getMaxTextUnits(items: DisplayParticipant[]): number {
  if (items.length === 0) return 0;
  return Math.max(...items.map(item => getTextVisualWidth(item.displayText, 1)));
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
  const { t } = useI18n('front');
  const [state, setState] = useState<DisplayState | null>(null);
  const [displayItems, setDisplayItems] = useState<DisplayParticipant[]>([]);
  const [isRolling, setIsRolling] = useState(false);
  const [showQRCode, setShowQRCode] = useState(false);
  const [qrCodeUrl, setQRCodeUrl] = useState('');
  const [qrCodeMessage, setQRCodeMessage] = useState('');
  const rollInterval = useRef<NodeJS.Timeout | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const poolRef = useRef<DisplayParticipant[]>([]);
  const poolTextUnitsRef = useRef<number>(0);
  const lastPrizeIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttempts = useRef(0);
  const backgroundImage = state?.backgroundImage || '/bg.jpg';

  // ── 布局测量 ────────────────────────────────────────────────────────
  // 号码卡片的尺寸必须按「实际剩下多少空间」反解，所以得先量出舞台和奖品区的大小
  const mainRef = useRef<HTMLDivElement>(null);
  const prizeRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState({ width: 0, height: 0 });
  const [prizeNaturalHeight, setPrizeNaturalHeight] = useState(0);

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
        // 用整个池的最长文本定卡片宽度：滚动时每帧抽到的人不同，跟着变会让卡片忽宽忽窄
        poolTextUnitsRef.current = getMaxTextUnits(poolRef.current);

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
        poolTextUnitsRef.current = getMaxTextUnits(poolRef.current);

        if (data.showQRCode) {
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

  // 量舞台的内容区尺寸。投影仪改分辨率、拖窗口都会变，用 ResizeObserver 跟着重算。
  // 依赖里带上 showQRCode：二维码页和抽奖页是两个不同的 .main-display 节点，
  // 切换时 ref 会指到新节点上，不重跑就会一直观察着已经卸载的那一个。
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    const measure = () => {
      const style = window.getComputedStyle(main);
      const padX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      const padY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
      // clientWidth/Height 是**含 padding** 的，减掉才是真正能放内容的空间
      setStage({
        width: Math.max(0, main.clientWidth - padX),
        height: Math.max(0, main.clientHeight - padY),
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(main);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [state, showQRCode]);

  // 量奖品区的自然高度。
  //
  // 这里必须用 offsetHeight 而不是 getBoundingClientRect：offsetHeight 反映的是**布局**高度，
  // 不受 CSS transform 影响 —— 而下面正是用 transform 缩放奖品区的。
  // 换成 rect 会变成：缩放改变测量值 → 测量值又改变缩放，两个方向来回抖。
  useEffect(() => {
    const prize = prizeRef.current;
    if (!prize) return;
    const measure = () => setPrizeNaturalHeight(prize.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(prize);
    return () => observer.disconnect();
  }, [state, showQRCode]);

  const displayTextUnits = useMemo(() => getMaxTextUnits(displayItems), [displayItems]);

  /**
   * 号码区布局。行列数由「人数 + 每行个数」定死，字号反解 —— 详见 lib/display-layout.ts。
   * 卡片宽度取「整个池的最长文本」和「当前这批中奖者」的较大者：
   * 前者避免滚动时卡片忽宽忽窄，后者兜住「中奖者已不在池中」的情况。
   */
  const layout = useMemo(() => computeDisplayLayout({
    count: displayItems.length,
    numbersPerRow: state?.numbersPerRow || 10,
    availableWidth: stage.width,
    availableHeight: stage.height,
    configuredFontSize: state?.fontSizes?.numberCard || 38,
    maxTextUnits: Math.max(poolTextUnitsRef.current, displayTextUnits),
    prizeNaturalHeight,
  }), [
    displayItems.length,
    displayTextUnits,
    state?.numbersPerRow,
    state?.fontSizes?.numberCard,
    stage.width,
    stage.height,
    prizeNaturalHeight,
  ]);

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
        {/* 加载态也要挂语言开关：万一状态接口挂了，至少还能切语言看提示 */}
        <LanguageSwitch scope="front" className="lang-switch-floating" />
        <div className="main-display">
          <h1>{t('common.loading')}</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <div className="bg" style={{ backgroundImage: `url("${backgroundImage}")` }}></div>
      <LanguageSwitch scope="front" className="lang-switch-floating" />
      {showQRCode ? (
        <div className="main-display" ref={mainRef}>
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
              {t('display.scanTitle')}
            </h1>
            <div style={{
              background: '#fff',
              padding: 20,
              borderRadius: 16,
              boxShadow: '0 0 40px rgba(255, 215, 0, 0.4)',
            }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=280x280&data=${encodeURIComponent(qrCodeUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/register`)}`}
                alt={t('display.qrAlt')}
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
              {qrCodeMessage || t('display.qrHint')}
            </p>
          </div>
        </div>
      ) : (
        <div className="main-display" ref={mainRef}>
          {currentPrize ? (
            // 外层占位块负责「占住缩放后的高度」，内层用 transform 缩放 ——
            // transform 不影响布局，所以奖品区的自然高度测得准，不会和缩放互相打架
            <div
              className="prize-slot"
              style={{ height: prizeNaturalHeight > 0 ? `${layout.prizeHeight}px` : undefined }}
            >
            <div
              className={`prize-info ${currentPrize.image ? 'prize-info-with-image' : ''}`}
              ref={prizeRef}
              style={{ transform: `scale(${layout.prizeScale})`, transformOrigin: 'top center' }}
            >
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
            </div>
          ) : (
            <h1></h1>
          )}

          <div className="number-display">
            {displayItems.length > 0 ? (() => {
              const showBorder = state?.displaySettings?.showNumberBorder ?? true;
              const maskPhone = state?.displaySettings?.maskPhone ?? false;
              const maskNum = (n: string) =>
                maskPhone && n.length === 11 ? n.slice(0, 3) + '****' + n.slice(7) : n;
              const borderWidth = Math.max(2, layout.fontSize * 0.08);

              return (
                // 用 grid 而不是 flex-wrap：列数已经算死了，再让它自己换行等于把布局
                // 交回给浏览器，多一行少一行都不受控 —— 而溢出必然导致重叠
                <div
                  className="numbers-grid"
                  style={{
                    gridTemplateColumns: `repeat(${layout.columns}, ${layout.cardWidth}px)`,
                    gap: `${layout.gap}px`,
                  }}
                >
                  {displayItems.map((item, i) => {
                    const text = maskNum(item.displayText);
                    // 字号被下限卡住时卡片可能仍不够宽，此时单独把这一格的文字缩一点
                    const scaledFontSize = fitTextFontSize(
                      getTextVisualWidth(text, 1),
                      layout.cardWidth,
                      layout.fontSize,
                    );
                    return (
                      <div
                        key={`${item.id}-${i}`}
                        className={`number-card ${!isRolling ? 'winner' : ''}`}
                        style={{
                          fontSize: `${scaledFontSize}px`,
                          width: `${layout.cardWidth}px`,
                          height: `${layout.cardHeight}px`,
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
                {currentPrize ? t('display.waitingDraw') : t('display.selectPrize')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
