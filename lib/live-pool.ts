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

/**
 * 签到结果码。
 *
 * 接口同时返回 `code` 和中文 `message`：message 给日志和接口调试看，
 * code 给前端按用户当前语言渲染提示。这样签到页切到英文时，
 * 后端本身仍然是中文的，两边互不干扰。
 */
export type RegisterCode =
  | 'ok'
  | 'closed'
  | 'empty'
  | 'formatDigits'
  | 'formatAlnum'
  | 'lengthDigits'
  | 'lengthAlnum'
  | 'notFound'
  | 'duplicate'
  | 'error';

export interface RegisterResult {
  success: boolean;
  code: RegisterCode;
  message: string;
  member?: PoolMember;
}

function findMemberByUniqueId(id: string): PoolMember | null {
  return getUserMemberMap().get(id) || null;
}

export function registerParticipant(values: Record<string, string>): RegisterResult {
  const pool = getLivePool();
  const schema = getConfig().participantSchema;

  if (!pool.isOpen) {
    return { success: false, code: 'closed', message: '登记已关闭' };
  }

  const member = normalizeMembers([values], schema, 'register')[0];
  if (!member) {
    return { success: false, code: 'empty', message: `${schema.uniqueField} 不能为空` };
  }

  const matchedMember = findMemberByUniqueId(member.id);
  if (!matchedMember) {
    return { success: false, code: 'notFound', message: '该工号不在抽奖名单中' };
  }

  if (pool.members.some(item => item.id === member.id)) {
    return { success: false, code: 'duplicate', message: '该工号已签到' };
  }

  pool.members.push(createRegisteredSnapshot(matchedMember, { updatedAt: Date.now() }));
  pool.registrations = getMemberIds(pool.members);
  saveLivePool(pool);

  return { success: true, code: 'ok', message: '签到成功', member: matchedMember };
}

export function registerEmployee(employeeId: string): RegisterResult {
  const schema = getConfig().participantSchema;
  return registerParticipant({ [schema.uniqueField]: employeeId });
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

/**
 * 改名时同步签到池里的成员 id。
 *
 * 为什么不能走 getLivePool()/saveLivePool()：这一对函数每次都会做
 * `normalizeCheckedInMembers`，把「在用户池里找不到对应成员」的签到记录丢掉。
 * 改名过程中新旧 id 必然有一瞬间对不上用户池，用它们会把这条签到静默抹掉 ——
 * 所以这里直接读写原始文件，不做交叉校验。
 *
 * @returns 是否真的改到了记录（没签到过就返回 false）
 */
export function renameCheckedInMember(
  oldId: string,
  newId: string,
  schema: ParticipantSchema,
): boolean {
  const raw = safeReadJSON<LivePool>(getLivePoolFile(), DEFAULT_LIVE_POOL);
  const members = Array.isArray(raw.members) ? raw.members : [];
  if (!members.some(member => member && member.id === oldId)) return false;

  const nextMembers = members.map((member) => {
    if (!member || member.id !== oldId) return member;
    return {
      ...member,
      id: newId,
      values: { ...(member.values || {}), [schema.uniqueField]: newId },
    };
  });

  safeWriteJSON(getLivePoolFile(), {
    isOpen: Boolean(raw.isOpen),
    schemaVersion: 2,
    members: nextMembers,
    clearedAt: typeof raw.clearedAt === 'number' ? raw.clearedAt : 0,
  });
  return true;
}

export function removeFromLivePool(numbers: string[]): void {
  const pool = getLivePool();
  const removeSet = new Set(numbers);
  pool.members = pool.members.filter(member => !removeSet.has(member.id));
  pool.registrations = getMemberIds(pool.members);
  saveLivePool(pool);
}
