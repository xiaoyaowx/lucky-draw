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
  image?: string;
  requireCheckIn?: boolean;
}

// 轮次
export interface Round {
  id: number;
  name: string;
  poolType?: 'preset' | 'live';
  poolBindings?: PoolBinding[];
  prizes: Prize[];
}

export interface PoolBinding {
  poolId: string;
  probability: number;
}

export type PoolFieldType = 'text' | 'number' | 'phone' | 'email' | 'select';

export interface PoolFieldDefinition {
  key: string;
  label: string;
  type: PoolFieldType;
  required: boolean;
  unique?: boolean;
  visible?: boolean;
  searchable?: boolean;
  mask?: 'none' | 'phone';
  options?: string[];
}

export interface ParticipantSchema {
  schemaVersion: 2;
  fields: PoolFieldDefinition[];
  uniqueField: string;
  displayTemplate: string;
}

export interface PoolMember {
  id: string;
  values: Record<string, string>;
  createdAt?: number;
  updatedAt?: number;
  source?: 'manual' | 'import' | 'generate' | 'register' | 'migration';
}

export interface DisplayParticipant {
  id: string;
  displayText: string;
  values?: Record<string, string>;
}

export interface WinnerSnapshot {
  id: string;
  poolId?: string;
  poolName?: string;
  displayText: string;
  values: Record<string, string>;
  wonAt: number;
}

// 中奖信息
export interface WinnerInfo {
  level: string;
  name: string;
  winners: WinnerSnapshot[];
  numbers?: string[];
}

// 展示状态
export interface DisplayState {
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
  rollingPool?: DisplayParticipant[];
  numbersPerRow: number;
  backgroundImage?: string;
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
  winnerDetails?: DisplayParticipant[];
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
  backgroundImage?: string;
  numberPoolConfig?: {
    start: number;
    end: number;
    excludeContains: string[];
    excludeExact: string[];
  };
  participantSchema?: ParticipantSchema;
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
  image?: string;
  requireCheckIn?: boolean;
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
