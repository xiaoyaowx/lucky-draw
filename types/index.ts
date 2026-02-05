/**
 * 共享类型定义
 */

// 奖品
export interface Prize {
  id: string;
  level: string;
  name: string;
  quantity: number;
  color: string;
  sponsor: string;
}

// 轮次
export interface Round {
  id: number;
  name: string;
  prizes: Prize[];
}

// 中奖信息
export interface WinnerInfo {
  level: string;
  name: string;
  numbers: string[];
}

// 展示状态
export interface DisplayState {
  currentPrizeId: string | null;
  currentRoundId: number;
  drawCount: number;
  isRolling: boolean;
  winners: string[];
  rounds: Round[];
  prizeRemaining: Record<string, number>;
  winnersByPrize: Record<string, WinnerInfo>;
  numberPool: string[];
  numbersPerRow: number;
}

// 控制状态
export interface ControlState {
  currentPrizeId: string | null;
  currentRoundId: number;
  drawCount: number;
  isRolling: boolean;
}

// WebSocket 消息类型
export type WSMessageType = 'state_update' | 'rolling_start' | 'rolling_stop' | 'reset';

export interface WSMessage {
  type: WSMessageType;
  payload?: StateUpdatePayload | RollingStartPayload | RollingStopPayload;
}

export interface StateUpdatePayload extends DisplayState {}

export interface RollingStartPayload {
  count: number;
}

export interface RollingStopPayload {
  winners: string[];
}

// API 请求类型
export interface GeneratePoolRequest {
  start: number;
  end: number;
  excludeContains?: string[];
  excludeExact?: string[];
}

export interface DrawRequest {
  prizeId: string;
  count: number;
}

export interface StartRollingRequest {
  prizeId: string;
  count: number;
}

export interface ConfigUpdateRequest {
  allowRepeatWin?: boolean;
  numbersPerRow?: number;
  numberPoolConfig?: {
    start: number;
    end: number;
    excludeContains: string[];
    excludeExact: string[];
  };
  registerSettings?: {
    length: number;
    allowLetters: boolean;
  };
}

export interface PrizeCreateRequest {
  roundId: number;
  level: string;
  name: string;
  quantity: number;
  color: string;
  sponsor: string;
}

export interface RoundCreateRequest {
  name: string;
}

// API 响应类型
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}
