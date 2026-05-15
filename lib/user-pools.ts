import fs from 'fs';
import path from 'path';
import {
  generateNumberPool,
  getInitialPrizeRemaining,
  getLotteryState,
  getPrizesData,
  saveLotteryState,
} from './lottery';

export const DEFAULT_USER_POOL_ID = 'default';
export const LIVE_USER_POOL_ID = 'live';

export interface UserPool {
  id: string;
  name: string;
  numbers: string[];
  createdAt?: number;
  updatedAt?: number;
}

interface UserPoolsData {
  pools: UserPool[];
}

function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

function getUserPoolsFile(): string {
  return path.join(getDataDir(), 'user-pools.json');
}

function safeReadJSON<T>(filePath: string, defaultValue: T): T {
  try {
    if (!fs.existsSync(filePath)) {
      return defaultValue;
    }
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data) as T;
  } catch (error) {
    console.error(`读取文件失败: ${filePath}`, error);
    return defaultValue;
  }
}

function safeWriteJSON(filePath: string, data: unknown): void {
  const tempPath = `${filePath}.tmp`;
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      try { fs.unlinkSync(tempPath); } catch { /* ignore */ }
    }
    console.error(`写入文件失败: ${filePath}`, error);
    throw error;
  }
}

export function normalizePoolNumbers(numbers: unknown[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  numbers.forEach((value) => {
    const number = String(value).trim();
    if (!number || seen.has(number)) return;
    seen.add(number);
    result.push(number);
  });

  return result;
}

function createDefaultPool(): UserPool {
  const lotteryState = getLotteryState();
  const numbers = lotteryState.numberPool.length > 0
    ? lotteryState.numberPool
    : generateNumberPool();
  const now = Date.now();

  return {
    id: DEFAULT_USER_POOL_ID,
    name: '默认预设池',
    numbers: normalizePoolNumbers(numbers),
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeUserPools(data: UserPoolsData): UserPoolsData {
  const poolMap = new Map<string, UserPool>();

  data.pools.forEach((pool) => {
    if (!pool || typeof pool.id !== 'string' || !pool.id.trim()) return;
    const id = pool.id.trim();
    if (id === LIVE_USER_POOL_ID) return;
    poolMap.set(id, {
      ...pool,
      id,
      name: typeof pool.name === 'string' && pool.name.trim() ? pool.name.trim() : '未命名用户池',
      numbers: normalizePoolNumbers(Array.isArray(pool.numbers) ? pool.numbers : []),
    });
  });

  if (!poolMap.has(DEFAULT_USER_POOL_ID)) {
    poolMap.set(DEFAULT_USER_POOL_ID, createDefaultPool());
  }

  const defaultPool = poolMap.get(DEFAULT_USER_POOL_ID)!;
  const pools = [
    defaultPool,
    ...Array.from(poolMap.values()).filter(pool => pool.id !== DEFAULT_USER_POOL_ID),
  ];

  return { pools };
}

export function getUserPools(): UserPool[] {
  const filePath = getUserPoolsFile();
  const exists = fs.existsSync(filePath);
  const data = safeReadJSON<UserPoolsData>(filePath, { pools: [] });
  const normalized = normalizeUserPools(data);

  if (!exists || JSON.stringify(data) !== JSON.stringify(normalized)) {
    saveUserPools(normalized.pools);
  }

  return normalized.pools;
}

export function saveUserPools(pools: UserPool[]): void {
  const normalized = normalizeUserPools({ pools });
  safeWriteJSON(getUserPoolsFile(), normalized);

  const defaultPool = normalized.pools.find(pool => pool.id === DEFAULT_USER_POOL_ID);
  if (defaultPool) {
    const state = getLotteryState();
    if (JSON.stringify(state.numberPool) !== JSON.stringify(defaultPool.numbers)) {
      saveLotteryState({
        ...state,
        numberPool: defaultPool.numbers,
      });
    }
  }
}

export function getUserPoolById(poolId: string): UserPool | undefined {
  return getUserPools().find(pool => pool.id === poolId);
}

export function createUserPool(name: string, numbers: unknown[] = []): UserPool {
  const now = Date.now();
  const pool: UserPool = {
    id: `pool-${now}-${Math.random().toString(36).slice(2, 8)}`,
    name: name.trim(),
    numbers: normalizePoolNumbers(numbers),
    createdAt: now,
    updatedAt: now,
  };
  const pools = getUserPools();
  pools.push(pool);
  saveUserPools(pools);
  return pool;
}

export function resetLotteryRecords(): void {
  const prizesData = getPrizesData();
  const defaultPool = getUserPoolById(DEFAULT_USER_POOL_ID) || createDefaultPool();
  saveLotteryState({
    numberPool: defaultPool.numbers,
    prizeRemaining: getInitialPrizeRemaining(prizesData.rounds),
    winnersByPrize: {},
    allWinners: [],
  });
}
