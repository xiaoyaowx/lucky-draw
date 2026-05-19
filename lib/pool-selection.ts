import { Config, LotteryState, PoolBinding, Round } from './lottery';
import { getLivePool } from './live-pool';
import { DrawCandidate, createDrawCandidate } from './participants';
import { DEFAULT_USER_POOL_ID, getUserPools, LIVE_USER_POOL_ID, UserPool } from './user-pools';

export interface ResolvedPool {
  poolId: string;
  name: string;
  probability: number;
  members: DrawCandidate[];
  isLive?: boolean;
}

export interface PoolOption {
  id: string;
  name: string;
  count: number;
  isLive?: boolean;
}

export function normalizePoolBindings(bindings: unknown): PoolBinding[] {
  if (!Array.isArray(bindings)) return [];

  const merged = new Map<string, number>();
  bindings.forEach((binding) => {
    if (!binding || typeof binding !== 'object') return;
    const item = binding as { poolId?: unknown; probability?: unknown };
    const poolId = typeof item.poolId === 'string' ? item.poolId.trim() : '';
    const probability = Number(item.probability);
    if (!poolId || !Number.isFinite(probability) || probability <= 0) return;
    merged.set(poolId, (merged.get(poolId) || 0) + probability);
  });

  return Array.from(merged.entries()).map(([poolId, probability]) => ({
    poolId,
    probability,
  }));
}

export function getRoundPoolBindings(round: Round | null | undefined): PoolBinding[] {
  const bindings = normalizePoolBindings(round?.poolBindings);
  if (bindings.length > 0) return bindings;

  return [{
    poolId: round?.poolType === 'live' ? LIVE_USER_POOL_ID : DEFAULT_USER_POOL_ID,
    probability: 100,
  }];
}

function prizeRequiresCheckIn(round: Round | null | undefined, prizeId?: string): boolean {
  if (!round || !prizeId) return false;
  return Boolean(round.prizes.find(prize => prize.id === prizeId)?.requireCheckIn);
}

export function getPoolOptions(userPools = getUserPools()): PoolOption[] {
  const livePool = getLivePool();
  return [
    ...userPools.map(pool => ({
      id: pool.id,
      name: pool.name,
      count: pool.members.length,
    })),
    {
      id: LIVE_USER_POOL_ID,
      name: '签到登记池',
      count: livePool.members.length,
      isLive: true,
    },
  ];
}

export function getPoolBindingLabel(bindings: PoolBinding[] | undefined, userPools = getUserPools()): string {
  const poolOptions = getPoolOptions(userPools);
  const poolNameById = new Map(poolOptions.map(pool => [pool.id, pool.name]));
  const normalized = normalizePoolBindings(bindings);

  return normalized
    .map(binding => `${poolNameById.get(binding.poolId) || binding.poolId} ${binding.probability}%`)
    .join(' / ');
}

export function resolveRoundPools(round: Round | null | undefined, config?: Config): ResolvedPool[] {
  const schema = config?.participantSchema;
  const userPools = getUserPools();
  const userPoolMap = new Map<string, UserPool>(userPools.map(pool => [pool.id, pool]));
  const livePool = getLivePool();

  return getRoundPoolBindings(round)
    .map((binding) => {
      if (binding.poolId === LIVE_USER_POOL_ID) {
        return {
          poolId: LIVE_USER_POOL_ID,
          name: '签到登记池',
          probability: binding.probability,
          members: livePool.members.map(member => createDrawCandidate(
            member,
            { id: LIVE_USER_POOL_ID, name: '签到登记池' },
            binding.probability,
            schema,
          )),
          isLive: true,
        };
      }

      const pool = userPoolMap.get(binding.poolId);
      if (!pool) return null;
      return {
        poolId: pool.id,
        name: pool.name,
        probability: binding.probability,
        members: pool.members.map(member => createDrawCandidate(
          member,
          { id: pool.id, name: pool.name },
          binding.probability,
          schema,
        )),
      };
    })
    .filter((pool): pool is ResolvedPool => Boolean(pool));
}

function uniqueCandidates(candidates: DrawCandidate[]): DrawCandidate[] {
  const seen = new Set<string>();
  const result: DrawCandidate[] = [];
  candidates.forEach((candidate) => {
    if (!candidate.id || seen.has(candidate.id)) return;
    seen.add(candidate.id);
    result.push(candidate);
  });
  return result;
}

function removeCandidateFromPools(pools: ResolvedPool[], id: string): void {
  pools.forEach((pool) => {
    pool.members = pool.members.filter(item => item.id !== id);
  });
}

export function getAvailablePoolsForRound(
  round: Round | null | undefined,
  lotteryState: LotteryState,
  config: Config,
  prizeId?: string,
): ResolvedPool[] {
  const requireCheckIn = prizeRequiresCheckIn(round, prizeId);
  const checkedInIds = requireCheckIn
    ? new Set(getLivePool().registrations)
    : null;

  let pools = resolveRoundPools(round, config)
    .map(pool => ({
      ...pool,
      members: uniqueCandidates(pool.members).filter(member => !checkedInIds || checkedInIds.has(member.id)),
    }));

  const excluded = new Set<string>();
  const currentPrizeInfo = prizeId ? lotteryState.winnersByPrize[prizeId] : undefined;
  const currentPrizeWinners = currentPrizeInfo
    ? [
        ...(currentPrizeInfo.winners || []).map(winner => winner.id),
        ...(currentPrizeInfo.numbers || []),
      ]
    : [];
  currentPrizeWinners.forEach(number => excluded.add(number));

  const allWinnerIds = lotteryState.allWinnerIds || lotteryState.allWinners || [];
  if (!config.allowRepeatWin && allWinnerIds.length) {
    allWinnerIds.forEach(number => excluded.add(number));
  }

  if (excluded.size > 0) {
    pools = pools.map(pool => ({
      ...pool,
      members: pool.members.filter(member => !excluded.has(member.id)),
    }));
  }

  return pools.filter(pool => pool.probability > 0 && pool.members.length > 0);
}

export function getAvailableUnion(pools: ResolvedPool[]): DrawCandidate[] {
  return uniqueCandidates(pools.flatMap(pool => pool.members));
}

export function takeCalibrationNumbers(
  pools: ResolvedPool[],
  calibrationList: string[],
  maxCount: number,
): { candidates: DrawCandidate[]; numbers: string[]; usedCalibration: string[] } {
  const candidates: DrawCandidate[] = [];
  const usedCalibration: string[] = [];

  for (const rawNumber of calibrationList) {
    if (candidates.length >= maxCount) break;
    const candidateIds = [rawNumber, rawNumber.padStart(3, '0')];
    const matched = candidateIds
      .map(candidate => pools.flatMap(pool => pool.members).find(member => member.id === candidate))
      .find((candidate): candidate is DrawCandidate => Boolean(candidate));

    if (matched) {
      candidates.push(matched);
      removeCandidateFromPools(pools, matched.id);
      usedCalibration.push(rawNumber);
    } else {
      console.log('[calibration] number not in pool:', rawNumber);
    }
  }

  return {
    candidates,
    numbers: candidates.map(candidate => candidate.id),
    usedCalibration,
  };
}

export function drawWeightedNumbers(pools: ResolvedPool[], count: number): DrawCandidate[] {
  const winners: DrawCandidate[] = [];

  for (let i = 0; i < count; i += 1) {
    const availablePools = pools.filter(pool => pool.probability > 0 && pool.members.length > 0);
    if (availablePools.length === 0) break;

    const totalWeight = availablePools.reduce((sum, pool) => sum + pool.probability, 0);
    let threshold = Math.random() * totalWeight;
    let selectedPool = availablePools[availablePools.length - 1];

    for (const pool of availablePools) {
      threshold -= pool.probability;
      if (threshold <= 0) {
        selectedPool = pool;
        break;
      }
    }

    const winner = selectedPool.members[Math.floor(Math.random() * selectedPool.members.length)];
    winners.push(winner);
    removeCandidateFromPools(pools, winner.id);
  }

  return winners;
}
