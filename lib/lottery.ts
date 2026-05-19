import fs from 'fs';
import path from 'path';
import {
  DEFAULT_PARTICIPANT_SCHEMA,
  ParticipantSchema,
  WinnerSnapshot,
  normalizeParticipantSchema,
} from './participants';

// 动态获取数据目录（支持打包后的环境变量）
function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

function getPrizesFile(): string {
  return path.join(getDataDir(), 'prizes.json');
}

function getStateFile(): string {
  return path.join(getDataDir(), 'lottery-state.json');
}

function getConfigFile(): string {
  return path.join(getDataDir(), 'config.json');
}

// 安全读取 JSON 文件
function safeReadJSON<T>(filePath: string, defaultValue: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`文件不存在: ${filePath}，使用默认值`);
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch (error) {
    console.error(`读取文件失败: ${filePath}`, error);
    return defaultValue;
  }
}

// 安全写入 JSON 文件（带临时文件保护）
function safeWriteJSON(filePath: string, data: unknown): void {
  const tempPath = `${filePath}.tmp`;
  try {
    // 确保目录存在
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    // 先写入临时文件
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    // 重命名为目标文件（原子操作）
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    // 清理临时文件
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
    }
    console.error(`写入文件失败: ${filePath}`, error);
    throw error;
  }
}

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

export interface WinnerInfo {
  level: string;
  name: string;
  winners: WinnerSnapshot[];
  numbers?: string[];
}

export interface LotteryState {
  numberPool: string[];
  prizeRemaining: Record<string, number>;
  winnersByPrize: Record<string, WinnerInfo>;
  allWinners?: string[];
  allWinnerIds?: string[];
}

export interface PrizesData {
  rounds: Round[];
}

export interface NumberPoolConfig {
  type: 'auto' | 'manual';
  start?: number;
  end?: number;
  excludePatterns?: string[];  // 兼容旧配置，等同于 excludeContains
  excludeContains?: string[];  // 包含模式：排除所有包含该字符串的数字
  excludeExact?: string[];     // 精确模式：只排除精确等于该数字的
}

export interface FontSizeConfig {
  prizeLevel: number;    // 奖项等级字体大小，默认 56px
  prizeName: number;     // 奖品名称字体大小，默认 42px
  sponsor: number;       // 赞助商字体大小，默认 28px
  numberCard: number;    // 抽奖号码字体大小，默认 38px
}

export interface DisplaySettings {
  showQuantity: boolean;   // 是否显示奖品数量
  showSponsor: boolean;    // 是否显示赞助商
  showNumberBorder: boolean; // 是否显示号码卡片边框
  maskPhone: boolean;      // 是否隐藏手机号中间四位
}

export interface FontColorConfig {
  prizeName: string;     // 奖品名称颜色
  sponsor: string;       // 赞助商颜色
  numberCard: string;    // 抽奖号码颜色 (同时应用于边框)
}

export interface RegisterSettings {
  length: number;        // 工号长度
  allowLetters: boolean; // 是否允许字母
}

export interface Config {
  allowRepeatWin: boolean;
  numbersPerRow: number;
  numberPoolConfig: NumberPoolConfig;
  participantSchema: ParticipantSchema;
  fontSizes?: FontSizeConfig;
  displaySettings?: DisplaySettings;
  fontColors?: FontColorConfig;
  registerSettings?: RegisterSettings;
  calibration?: Record<string, string[]>;
}

// 生成号码池（根据配置文件生成）
export function generateNumberPool(): string[] {
  try {
    const config = getConfig();
    if (config.numberPoolConfig) {
      return generateNumberPoolFromConfig(config.numberPoolConfig);
    }
  } catch {
    // 配置文件不存在时使用默认值
  }
  // 默认配置：1-300，排除含4和13的数字
  return generateNumberPoolFromConfig({
    type: 'auto',
    start: 1,
    end: 300,
    excludePatterns: ['4', '13']
  });
}

// 获取初始奖品剩余数量
export function getInitialPrizeRemaining(rounds: Round[]): Record<string, number> {
  const remaining: Record<string, number> = {};
  rounds.forEach(r => r.prizes.forEach(p => { remaining[p.id] = p.quantity; }));
  return remaining;
}

// 默认值
const DEFAULT_PRIZES_DATA: PrizesData = { rounds: [] };
const DEFAULT_LOTTERY_STATE: LotteryState = {
  numberPool: [],
  prizeRemaining: {},
  winnersByPrize: {},
  allWinners: [],
  allWinnerIds: [],
};
const DEFAULT_CONFIG: Config = {
  allowRepeatWin: false,
  numbersPerRow: 10,
  participantSchema: DEFAULT_PARTICIPANT_SCHEMA,
  numberPoolConfig: {
    type: 'auto',
    start: 1,
    end: 300,
    excludeContains: ['4', '13'],
    excludeExact: [],
  },
  fontSizes: {
    prizeLevel: 56,
    prizeName: 42,
    sponsor: 28,
    numberCard: 38,
  },
  displaySettings: {
    showQuantity: true,
    showSponsor: true,
    showNumberBorder: true,
    maskPhone: false,
  },
  fontColors: {
    prizeName: '#ffffff',
    sponsor: '#eeeeee',
    numberCard: '#ffd700',
  },
  registerSettings: {
    length: 6,
    allowLetters: false,
  },
};

// 读取奖品配置
export function getPrizesData(): PrizesData {
  return safeReadJSON<PrizesData>(getPrizesFile(), DEFAULT_PRIZES_DATA);
}

function normalizeWinnerInfo(rawInfo: WinnerInfo | undefined): WinnerInfo | undefined {
  if (!rawInfo) return undefined;
  const legacyNumbers = Array.isArray(rawInfo.numbers)
    ? rawInfo.numbers.map(String).filter(Boolean)
    : [];
  const winners = Array.isArray(rawInfo.winners)
    ? rawInfo.winners
        .map((winner) => {
          const id = typeof winner.id === 'string' ? winner.id.trim() : '';
          if (!id) return null;
          const snapshot: WinnerSnapshot = {
            id,
            displayText: typeof winner.displayText === 'string' && winner.displayText.trim()
              ? winner.displayText.trim()
              : id,
            values: winner.values && typeof winner.values === 'object'
              ? Object.fromEntries(Object.entries(winner.values).map(([key, value]) => [key, String(value)]))
              : { number: id },
            wonAt: typeof winner.wonAt === 'number' ? winner.wonAt : 0,
          };
          if (typeof winner.poolId === 'string') snapshot.poolId = winner.poolId;
          if (typeof winner.poolName === 'string') snapshot.poolName = winner.poolName;
          return snapshot;
        })
        .filter((winner): winner is WinnerSnapshot => Boolean(winner))
    : [];

  if (winners.length === 0 && legacyNumbers.length > 0) {
    winners.push(...legacyNumbers.map(number => ({
      id: number,
      displayText: number,
      values: { number },
      wonAt: 0,
    })));
  }

  const numbers = legacyNumbers.length > 0 ? legacyNumbers : winners.map(winner => winner.id);
  return {
    level: rawInfo.level,
    name: rawInfo.name,
    winners,
    numbers,
  };
}

function normalizeLotteryState(state: LotteryState): LotteryState {
  const winnersByPrize: Record<string, WinnerInfo> = {};
  Object.entries(state.winnersByPrize || {}).forEach(([prizeId, info]) => {
    const normalizedInfo = normalizeWinnerInfo(info);
    if (normalizedInfo) {
      winnersByPrize[prizeId] = normalizedInfo;
    }
  });

  const flattenedWinnerIds = Object.values(winnersByPrize).flatMap(info => info.winners.map(winner => winner.id));
  const allWinnerIds = Array.isArray(state.allWinnerIds) && state.allWinnerIds.length > 0
    ? state.allWinnerIds.map(String)
    : (Array.isArray(state.allWinners) && state.allWinners.length > 0
      ? state.allWinners.map(String)
      : flattenedWinnerIds);

  return {
    numberPool: Array.isArray(state.numberPool) ? state.numberPool.map(String) : [],
    prizeRemaining: state.prizeRemaining || {},
    winnersByPrize,
    allWinners: Array.isArray(state.allWinners) ? state.allWinners.map(String) : allWinnerIds,
    allWinnerIds,
  };
}

// 读取抽奖状态
export function getLotteryState(): LotteryState {
  return normalizeLotteryState(safeReadJSON<LotteryState>(getStateFile(), DEFAULT_LOTTERY_STATE));
}

// 保存抽奖状态
export function saveLotteryState(state: LotteryState): void {
  safeWriteJSON(getStateFile(), state);
}

// 读取配置
export function getConfig(): Config {
  const config = safeReadJSON<Config>(getConfigFile(), DEFAULT_CONFIG);
  const registerSettings: RegisterSettings = {
    ...DEFAULT_CONFIG.registerSettings!,
    ...config.registerSettings,
  };
  return {
    ...DEFAULT_CONFIG,
    ...config,
    numberPoolConfig: {
      ...DEFAULT_CONFIG.numberPoolConfig,
      ...config.numberPoolConfig,
    },
    participantSchema: normalizeParticipantSchema(config.participantSchema),
    registerSettings,
  };
}

// 保存配置
export function saveConfig(config: Config): void {
  safeWriteJSON(getConfigFile(), config);
}

// 保存奖品数据
export function savePrizesData(data: PrizesData): void {
  safeWriteJSON(getPrizesFile(), data);
}

// 根据配置生成号码池
export function generateNumberPoolFromConfig(config: NumberPoolConfig): string[] {
  const pool: string[] = [];
  const start = config.start || 1;
  const end = config.end || 300;
  // 兼容旧配置：excludePatterns 等同于 excludeContains
  const containsPatterns = config.excludeContains || config.excludePatterns || [];
  const exactPatterns = config.excludeExact || [];

  for (let i = start; i <= end; i++) {
    const numStr = i.toString();
    let exclude = false;

    // 包含模式检查
    for (const pattern of containsPatterns) {
      if (numStr.includes(pattern)) {
        exclude = true;
        break;
      }
    }

    // 精确模式检查
    if (!exclude) {
      for (const pattern of exactPatterns) {
        if (numStr === pattern) {
          exclude = true;
          break;
        }
      }
    }

    if (!exclude) {
      pool.push(numStr.padStart(3, '0'));
    }
  }
  return pool;
}
