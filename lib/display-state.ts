// 使用内存存储，避免文件写入触发 HMR

export interface DisplayState {
  currentPrizeId: string | null;
  currentRoundId: number;
  drawCount: number;
  isRolling: boolean;
  winners: string[];
  // 开始滚动时锁定的候选池（用于保证“滚动看到的范围”与最终抽取一致）
  rollingPool?: string[];
  showQRCode?: boolean;
  qrCodeMessage?: string;
}

const defaultState: DisplayState = {
  currentPrizeId: null,
  currentRoundId: 1,
  drawCount: 1,
  isRolling: false,
  winners: [],
  showQRCode: false,
  qrCodeMessage: '',
};

// 使用全局变量存储状态（在服务器进程中持久化）
declare global {
  // eslint-disable-next-line no-var
  var displayState: DisplayState | undefined;
}

// 深拷贝状态，避免外部修改影响内部状态
function cloneState(state: DisplayState): DisplayState {
  return {
    ...state,
    winners: [...state.winners],
    rollingPool: state.rollingPool ? [...state.rollingPool] : undefined,
  };
}

export function getDisplayState(): DisplayState {
  if (!global.displayState) {
    global.displayState = cloneState(defaultState);
  }
  // 返回拷贝，防止外部直接修改
  return cloneState(global.displayState);
}

export function saveDisplayState(state: DisplayState): void {
  // 存储拷贝，防止外部引用修改
  global.displayState = cloneState(state);
}

export function updateDisplayState(updates: Partial<DisplayState>): DisplayState {
  const state = getDisplayState();
  const newState: DisplayState = {
    ...state,
    ...updates,
    // 确保 winners 数组也被正确处理
    winners: updates.winners ? [...updates.winners] : [...state.winners],
    rollingPool:
      updates.rollingPool !== undefined
        ? (updates.rollingPool ? [...updates.rollingPool] : undefined)
        : (state.rollingPool ? [...state.rollingPool] : undefined),
  };
  global.displayState = newState;
  return cloneState(newState);
}
