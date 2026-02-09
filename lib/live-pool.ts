import fs from 'fs';
import path from 'path';

function getDataDir(): string {
  return process.env.DATA_DIR || path.join(process.cwd(), 'data');
}

function getLivePoolFile(): string {
  return path.join(getDataDir(), 'live-pool.json');
}

function safeReadJSON<T>(filePath: string, defaultValue: T): T {
  try {
    if (!fs.existsSync(filePath)) return defaultValue;
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

export interface LivePool {
  isOpen: boolean;
  registrations: string[];
  clearedAt: number;
}

const DEFAULT_LIVE_POOL: LivePool = {
  isOpen: false,
  registrations: [],
  clearedAt: 0,
};

export function getLivePool(): LivePool {
  return safeReadJSON<LivePool>(getLivePoolFile(), DEFAULT_LIVE_POOL);
}

export function saveLivePool(pool: LivePool): void {
  safeWriteJSON(getLivePoolFile(), pool);
}

export function registerEmployee(employeeId: string): { success: boolean; message: string } {
  const pool = getLivePool();

  if (!pool.isOpen) {
    return { success: false, message: '登记已关闭' };
  }

  const trimmedId = employeeId.trim();
  if (!trimmedId) {
    return { success: false, message: '工号不能为空' };
  }

  if (pool.registrations.includes(trimmedId)) {
    return { success: false, message: '该工号已登记' };
  }

  pool.registrations.push(trimmedId);
  saveLivePool(pool);

  return { success: true, message: '登记成功' };
}

export function clearLivePool(): void {
  const pool = getLivePool();
  pool.registrations = [];
  pool.clearedAt = Date.now();
  saveLivePool(pool);
}

export function setLivePoolOpen(isOpen: boolean): void {
  const pool = getLivePool();
  pool.isOpen = isOpen;
  saveLivePool(pool);
}

export function removeFromLivePool(numbers: string[]): void {
  const pool = getLivePool();
  pool.registrations = pool.registrations.filter(id => !numbers.includes(id));
  saveLivePool(pool);
}
