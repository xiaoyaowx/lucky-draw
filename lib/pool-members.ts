/**
 * 用户池的「成员级」操作：合并/替换导入、单个成员的增删改。
 *
 * 为什么单独成模块而不是塞进 lib/user-pools.ts：改一个成员的唯一字段（改名）
 * 会同时牵动 live-pool.json（签到状态）和 lottery-state.json（中奖快照）。
 * user-pools.ts 处在依赖链的上游（live-pool 依赖它），把跨文件联动写进去会绕成
 * 循环依赖，所以放在下游这个模块里统一处理。
 */

import {
  ParticipantSchema,
  PoolMember,
  getMemberIds,
  normalizeFieldValue,
  renderDisplayText,
} from './participants';
import { getConfig, getLotteryState, saveLotteryState } from './lottery';
import { UserPool, getUserPools, saveUserPools } from './user-pools';
import { getLivePool, removeFromLivePool, renameCheckedInMember } from './live-pool';

/** 导入方式：合并追加 / 替换名单 */
export type ImportMode = 'merge' | 'replace';

export interface ImportStats {
  mode: ImportMode;
  /** 导入后池内总人数 */
  total: number;
  added: number;
  updated: number;
  /** 仅 replace 模式有意义：被移出名单的人数 */
  removed: number;
  /** 仅 replace 模式有意义：名单缩小后仍然保留的签到数 */
  keptCheckIns: number;
}

/**
 * 成员操作的失败原因。
 *
 * 用结构化错误而不是抛带中文文案的异常：API 层据此返回错误码，
 * 前端再按用户当前语言渲染提示，后台文案与界面语言保持解耦。
 */
export type MemberOpError =
  | { kind: 'poolNotFound' }
  | { kind: 'memberNotFound' }
  | { kind: 'duplicate'; field: string; value: string }
  | { kind: 'required'; field: string; id: string };

export type MemberOpResult<T> = { ok: true; data: T } | { ok: false; error: MemberOpError };

function fail(error: MemberOpError): { ok: false; error: MemberOpError } {
  return { ok: false, error };
}

/**
 * 把失败原因压成可以直接塞进 JSON 响应的形状。
 * 前端拿到 code 后按当前语言渲染提示，所以这里只带定位信息、不带文案。
 */
export function describeMemberOpError(error: MemberOpError): {
  code: MemberOpError['kind'];
  field?: string;
  value?: string;
  id?: string;
} {
  switch (error.kind) {
    case 'duplicate':
      return { code: error.kind, field: error.field, value: error.value };
    case 'required':
      return { code: error.kind, field: error.field, id: error.id };
    default:
      return { code: error.kind };
  }
}

/** 按 schema 归一化一组字段值，空值不落库（保持 json 干净）。 */
function normalizeValues(
  raw: Record<string, unknown>,
  schema: ParticipantSchema,
): Record<string, string> {
  const values: Record<string, string> = {};
  schema.fields.forEach((field) => {
    const value = normalizeFieldValue(raw?.[field.key], field);
    if (value) values[field.key] = value;
  });
  return values;
}

/** 校验必填字段，缺哪个报哪个（前端要拿去定位到具体输入框）。 */
function checkRequired(values: Record<string, string>, schema: ParticipantSchema): MemberOpError | null {
  for (const field of schema.fields) {
    if (field.required && !values[field.key]) {
      return {
        kind: 'required',
        field: field.label,
        id: values[schema.uniqueField] || '',
      };
    }
  }
  return null;
}

function persistPools(pools: UserPool[]): void {
  saveUserPools(pools);
}

/**
 * 中奖快照里的号码改名。
 *
 * 只改 id 是不够的：快照还存了 values 和已经渲染好的 displayText（大屏和导出
 * 直接用这两个），不同步更新的话，改完名大屏上仍然是旧号码。
 */
function cascadeRenameInLotteryState(
  oldId: string,
  newId: string,
  schema: ParticipantSchema,
): void {
  const state = getLotteryState();

  const numberPool = state.numberPool.map(id => (id === oldId ? newId : id));

  const winnersByPrize = Object.fromEntries(
    Object.entries(state.winnersByPrize).map(([prizeId, info]) => {
      const winners = info.winners.map((winner) => {
        if (winner.id !== oldId) return winner;
        const values = { ...winner.values, [schema.uniqueField]: newId };
        return {
          ...winner,
          id: newId,
          values,
          displayText: renderDisplayText(values, schema),
        };
      });
      const numbers = Array.isArray(info.numbers)
        ? info.numbers.map(number => (number === oldId ? newId : number))
        : info.numbers;
      return [prizeId, { ...info, winners, numbers }];
    }),
  );

  saveLotteryState({
    ...state,
    numberPool,
    winnersByPrize,
    allWinnerIds: (state.allWinnerIds || []).map(id => (id === oldId ? newId : id)),
    allWinners: (state.allWinners || []).map(id => (id === oldId ? newId : id)),
  });
}

// ── 导入 ──────────────────────────────────────────────────────────────

function mergeMembers(
  existing: PoolMember[],
  incoming: PoolMember[],
  now: number,
): { members: PoolMember[]; added: number; updated: number } {
  const indexById = new Map(existing.map((member, index) => [member.id, index]));
  const members = [...existing];
  let added = 0;
  let updated = 0;

  incoming.forEach((member) => {
    const index = indexById.get(member.id);
    if (index === undefined) {
      indexById.set(member.id, members.length);
      members.push({ ...member, createdAt: now, updatedAt: now });
      added += 1;
      return;
    }

    // 逐字段合并而不是整体替换：只导入了一列工号时，不能把已有成员的姓名、
    // 手机号抹掉 —— 现场最常见的用法就是拿一份精简名单来补齐/纠正。
    members[index] = {
      ...members[index],
      values: { ...members[index].values, ...member.values },
      updatedAt: now,
    };
    updated += 1;
  });

  return { members, added, updated };
}

function replaceMembers(
  existing: PoolMember[],
  incoming: PoolMember[],
  now: number,
  existingCheckInIds: Set<string>,
): { members: PoolMember[]; added: number; updated: number; removed: number; keptCheckIns: number } {
  const existingById = new Map(existing.map(member => [member.id, member]));
  let added = 0;
  let updated = 0;

  const members = incoming.map((member) => {
    const previous = existingById.get(member.id);
    if (!previous) {
      added += 1;
      return { ...member, createdAt: now, updatedAt: now };
    }
    updated += 1;
    return {
      ...previous,
      values: { ...previous.values, ...member.values },
      updatedAt: now,
    };
  });

  const incomingIds = new Set(incoming.map(member => member.id));
  const removed = existing.filter(member => !incomingIds.has(member.id)).length;
  // 签到状态本身存在 live-pool 里，替换名单不会主动删它；只要人还在新名单里，
  // 读 live-pool 时就能重新对上，签到自然保留。
  const keptCheckIns = [...existingCheckInIds].filter(id => incomingIds.has(id)).length;

  return { members, added, updated, removed, keptCheckIns };
}

/**
 * 把导入的成员写进指定用户池。
 *
 * 两种模式都**不会**清空抽奖记录 —— 这是相对旧版「导入即覆盖并重置」的关键变化：
 * 现场临时加人时，重置会抹掉已经产生的签到与中奖结果。
 * 需要清空请走「重置全部」或「清空用户池」，那两个入口的破坏性是明示的。
 */
export function importIntoPool(
  poolId: string,
  incoming: PoolMember[],
  mode: ImportMode,
  checkInIds: string[] = [],
): MemberOpResult<{ pool: UserPool; stats: ImportStats }> {
  const pools = getUserPools();
  const index = pools.findIndex(pool => pool.id === poolId);
  if (index === -1) return fail({ kind: 'poolNotFound' });

  const pool = pools[index];
  const now = Date.now();

  if (mode === 'merge') {
    const { members, added, updated } = mergeMembers(pool.members, incoming, now);
    const nextPool: UserPool = {
      ...pool,
      members,
      numbers: getMemberIds(members),
      updatedAt: now,
    };
    pools[index] = nextPool;
    persistPools(pools);
    return {
      ok: true,
      data: {
        pool: nextPool,
        stats: { mode, total: members.length, added, updated, removed: 0, keptCheckIns: 0 },
      },
    };
  }

  const { members, added, updated, removed, keptCheckIns } = replaceMembers(
    pool.members,
    incoming,
    now,
    new Set(checkInIds),
  );
  const nextPool: UserPool = {
    ...pool,
    members,
    numbers: getMemberIds(members),
    updatedAt: now,
  };
  pools[index] = nextPool;
  persistPools(pools);
  return {
    ok: true,
    data: {
      pool: nextPool,
      stats: { mode, total: members.length, added, updated, removed, keptCheckIns },
    },
  };
}

// ── 单个成员 ──────────────────────────────────────────────────────────

export function addPoolMember(
  poolId: string,
  rawValues: Record<string, unknown>,
): MemberOpResult<{ pool: UserPool; member: PoolMember }> {
  const schema = getConfig().participantSchema;
  const pools = getUserPools();
  const index = pools.findIndex(pool => pool.id === poolId);
  if (index === -1) return fail({ kind: 'poolNotFound' });

  const values = normalizeValues(rawValues, schema);
  const id = values[schema.uniqueField] || '';
  if (!id) {
    return fail({ kind: 'required', field: schema.uniqueField, id: '' });
  }
  const requiredError = checkRequired(values, schema);
  if (requiredError) return fail(requiredError);

  const pool = pools[index];
  if (pool.members.some(member => member.id === id)) {
    return fail({ kind: 'duplicate', field: schema.uniqueField, value: id });
  }

  const now = Date.now();
  const member: PoolMember = { id, values, createdAt: now, updatedAt: now, source: 'manual' };
  const members = [...pool.members, member];
  const nextPool: UserPool = { ...pool, members, numbers: getMemberIds(members), updatedAt: now };
  pools[index] = nextPool;
  persistPools(pools);

  return { ok: true, data: { pool: nextPool, member } };
}

/**
 * 修改成员信息。唯一字段被改动时视为「改名」，需要把 id 变更级联到
 * 签到池和中奖快照，否则会出现「改完名签到没了 / 大屏还是旧号码」。
 */
export function updatePoolMember(
  poolId: string,
  memberId: string,
  rawValues: Record<string, unknown>,
): MemberOpResult<{ pool: UserPool; member: PoolMember; renamed: boolean }> {
  const schema = getConfig().participantSchema;
  const pools = getUserPools();
  const poolIndex = pools.findIndex(pool => pool.id === poolId);
  if (poolIndex === -1) return fail({ kind: 'poolNotFound' });

  const pool = pools[poolIndex];
  const memberIndex = pool.members.findIndex(member => member.id === memberId);
  if (memberIndex === -1) return fail({ kind: 'memberNotFound' });

  const values = normalizeValues(rawValues, schema);
  const newId = values[schema.uniqueField] || '';
  if (!newId) {
    return fail({ kind: 'required', field: schema.uniqueField, id: '' });
  }
  const requiredError = checkRequired(values, schema);
  if (requiredError) return fail(requiredError);

  const renamed = newId !== memberId;
  if (renamed && pool.members.some(member => member.id === newId)) {
    return fail({ kind: 'duplicate', field: schema.uniqueField, value: newId });
  }

  const now = Date.now();
  const member: PoolMember = {
    ...pool.members[memberIndex],
    id: newId,
    values,
    updatedAt: now,
  };
  const members = pool.members.map((item, i) => (i === memberIndex ? member : item));
  const nextPool: UserPool = { ...pool, members, numbers: getMemberIds(members), updatedAt: now };
  pools[poolIndex] = nextPool;

  // 顺序有讲究：先把改名落进用户池，签到池的 id 才对得上；
  // renameCheckedInMember 直接读写原始文件、不做交叉校验，正是为了绕开这一点。
  persistPools(pools);
  if (renamed) {
    renameCheckedInMember(memberId, newId, schema);
    cascadeRenameInLotteryState(memberId, newId, schema);
  }

  return { ok: true, data: { pool: nextPool, member, renamed } };
}

/**
 * 删除成员。
 *
 * 已中奖的记录不会被抹掉 —— 奖已经发出去了，删名单不该改写历史。
 * 副作用是：如果之后又把同一个 id 加回来，因为 allWinnerIds 里还留着它，
 * 该号码在「不允许重复中奖」时仍然不能再中奖；需要发放就重置对应奖项。
 */
export function deletePoolMember(
  poolId: string,
  memberId: string,
): MemberOpResult<{ pool: UserPool; removedCheckIn: boolean }> {
  const pools = getUserPools();
  const poolIndex = pools.findIndex(pool => pool.id === poolId);
  if (poolIndex === -1) return fail({ kind: 'poolNotFound' });

  const pool = pools[poolIndex];
  if (!pool.members.some(member => member.id === memberId)) {
    return fail({ kind: 'memberNotFound' });
  }

  // 必须在写回用户池之前判断：live-pool 读取时会把「用户池里已不存在」的成员
  // 过滤掉，等写回之后再问就问不到了。
  const removedCheckIn = getLivePool().members.some(member => member.id === memberId);

  const members = pool.members.filter(member => member.id !== memberId);
  const nextPool: UserPool = {
    ...pool,
    members,
    numbers: getMemberIds(members),
    updatedAt: Date.now(),
  };
  pools[poolIndex] = nextPool;
  persistPools(pools);

  // 显式撤掉签到。其实 live-pool 读取时会自动丢弃这类记录，但那属于归一化的
  // 副作用；明写出来，语义才不会随归一化逻辑变动而悄悄改变。
  removeFromLivePool([memberId]);

  return { ok: true, data: { pool: nextPool, removedCheckIn } };
}
