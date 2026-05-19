import fs from 'fs';
import path from 'path';
import { getConfig } from './lottery';
import { ParticipantSchema, PoolMember, getMemberIds, normalizeMembers } from './participants';
import { getUserPools } from './user-pools';

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
  schemaVersion: 2;
  members: PoolMember[];
  registrations: string[];
  clearedAt: number;
}

const DEFAULT_LIVE_POOL: LivePool = {
  isOpen: false,
  schemaVersion: 2,
  members: [],
  registrations: [],
  clearedAt: 0,
};

function getUserMemberMap(): Map<string, PoolMember> {
  const members = new Map<string, PoolMember>();
  for (const userPool of getUserPools()) {
    for (const member of userPool.members) {
      if (!members.has(member.id)) {
        members.set(member.id, member);
      }
    }
  }
  return members;
}

function createRegisteredSnapshot(member: PoolMember, previous?: Pick<PoolMember, 'createdAt' | 'updatedAt'>): PoolMember {
  return {
    ...member,
    values: { ...member.values },
    createdAt: previous?.createdAt,
    updatedAt: previous?.updatedAt,
    source: 'register',
  };
}

function normalizeCheckedInMembers(rawPool: Partial<LivePool>, schema: ParticipantSchema): PoolMember[] {
  const hasMembersField = Array.isArray(rawPool.members);
  const rawMembers = hasMembersField
    ? rawPool.members
    : (Array.isArray(rawPool.registrations) ? rawPool.registrations : []);
  const normalized = normalizeMembers(rawMembers, schema, hasMembersField ? 'register' : 'migration');
  const userMemberMap = getUserMemberMap();
  const seen = new Set<string>();
  const members: PoolMember[] = [];

  for (const member of normalized) {
    if (seen.has(member.id)) continue;
    const matchedMember = userMemberMap.get(member.id);
    if (!matchedMember) continue;
    seen.add(member.id);
    members.push(createRegisteredSnapshot(matchedMember, member));
  }

  return members;
}

function normalizeLivePool(rawPool: Partial<LivePool>): LivePool {
  const schema = getConfig().participantSchema;
  const members = normalizeCheckedInMembers(rawPool, schema);

  return {
    isOpen: Boolean(rawPool.isOpen),
    schemaVersion: 2,
    members,
    registrations: getMemberIds(members),
    clearedAt: typeof rawPool.clearedAt === 'number' ? rawPool.clearedAt : 0,
  };
}

function serializeLivePool(pool: LivePool): Omit<LivePool, 'registrations'> {
  return {
    isOpen: pool.isOpen,
    schemaVersion: 2,
    members: pool.members,
    clearedAt: pool.clearedAt,
  };
}

export function getLivePool(): LivePool {
  return normalizeLivePool(safeReadJSON<LivePool>(getLivePoolFile(), DEFAULT_LIVE_POOL));
}

export function saveLivePool(pool: LivePool): void {
  safeWriteJSON(getLivePoolFile(), serializeLivePool(normalizeLivePool(pool)));
}

function findMemberByUniqueId(id: string): PoolMember | null {
  return getUserMemberMap().get(id) || null;
}

export function registerParticipant(values: Record<string, string>): { success: boolean; message: string; member?: PoolMember } {
  const pool = getLivePool();
  const schema = getConfig().participantSchema;

  if (!pool.isOpen) {
    return { success: false, message: '登记已关闭' };
  }

  const member = normalizeMembers([values], schema, 'register')[0];
  if (!member) {
    return { success: false, message: `${schema.uniqueField} 不能为空` };
  }

  const matchedMember = findMemberByUniqueId(member.id);
  if (!matchedMember) {
    return { success: false, message: '该工号不在抽奖名单中' };
  }

  if (pool.members.some(item => item.id === member.id)) {
    return { success: false, message: '该工号已签到' };
  }

  pool.members.push(createRegisteredSnapshot(matchedMember, { updatedAt: Date.now() }));
  pool.registrations = getMemberIds(pool.members);
  saveLivePool(pool);

  return { success: true, message: '签到成功', member: matchedMember };
}

export function registerEmployee(employeeId: string): { success: boolean; message: string } {
  const schema = getConfig().participantSchema;
  const result = registerParticipant({ [schema.uniqueField]: employeeId });
  return { success: result.success, message: result.message };
}

export function clearLivePool(): void {
  const pool = getLivePool();
  pool.members = [];
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
  const removeSet = new Set(numbers);
  pool.members = pool.members.filter(member => !removeSet.has(member.id));
  pool.registrations = getMemberIds(pool.members);
  saveLivePool(pool);
}
