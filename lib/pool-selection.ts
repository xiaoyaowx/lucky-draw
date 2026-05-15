import { Config, LotteryState, PoolBinding, Round } from './lottery';
import { getLivePool } from './live-pool';
import { DEFAULT_USER_POOL_ID, getUserPools, LIVE_USER_POOL_ID, UserPool } from './user-pools';

export interface ResolvedPool {
  poolId: string;
  name: string;
  probability: number;
  numbers: string[];
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

export function getPoolOptions(userPools = getUserPools()): PoolOption[] {
  const livePool = getLivePool();
  return [
    ...userPools.map(pool => ({
      id: pool.id,
      name: pool.name,
      count: pool.numbers.length,
    })),
    {
      id: LIVE_USER_POOL_ID,
      name: '签到登记池',
      count: livePool.registrations.length,
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

export function resolveRoundPools(round: Round | null | undefined): ResolvedPool[] {
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
          numbers: [...livePool.registrations],
          isLive: true,
        };
      }

      const pool = userPoolMap.get(binding.poolId);
      if (!pool) return null;
      return {
        poolId: pool.id,
        name: pool.name,
        probability: binding.probability,
        numbers: [...pool.numbers],
      };
    })
    .filter((pool): pool is ResolvedPool => Boolean(pool));
}

function uniqueNumbers(numbers: string[]): string[] {
  return Array.from(new Set(numbers));
}

function removeNumberFromPools(pools: ResolvedPool[], number: string): void {
  pools.forEach((pool) => {
    pool.numbers = pool.numbers.filter(item => item !== number);
  });
}

export function getAvailablePoolsForRound(
  round: Round | null | undefined,
  lotteryState: LotteryState,
  config: Config,
  prizeId?: string,
): ResolvedPool[] {
  let pools = resolveRoundPools(round)
    .map(pool => ({
      ...pool,
      numbers: uniqueNumbers(pool.numbers),
    }));

  const excluded = new Set<string>();
  const currentPrizeWinners = prizeId ? lotteryState.winnersByPrize[prizeId]?.numbers || [] : [];
  currentPrizeWinners.forEach(number => excluded.add(number));

  if (!config.allowRepeatWin && lotteryState.allWinners?.length) {
    lotteryState.allWinners.forEach(number => excluded.add(number));
  }

  if (excluded.size > 0) {
    pools = pools.map(pool => ({
      ...pool,
      numbers: pool.numbers.filter(number => !excluded.has(number)),
    }));
  }

  return pools.filter(pool => pool.probability > 0 && pool.numbers.length > 0);
}

export function getAvailableUnion(pools: ResolvedPool[]): string[] {
  return uniqueNumbers(pools.flatMap(pool => pool.numbers));
}

export function takeCalibrationNumbers(
  pools: ResolvedPool[],
  calibrationList: string[],
  maxCount: number,
): { numbers: string[]; usedCalibration: string[] } {
  const numbers: string[] = [];
  const usedCalibration: string[] = [];

  for (const rawNumber of calibrationList) {
    if (numbers.length >= maxCount) break;
    const candidates = [rawNumber, rawNumber.padStart(3, '0')];
    const matched = candidates.find(candidate =>
      pools.some(pool => pool.numbers.includes(candidate))
    );

    if (matched) {
      numbers.push(matched);
      removeNumberFromPools(pools, matched);
      usedCalibration.push(rawNumber);
    } else {
      console.log('[calibration] number not in pool:', rawNumber);
    }
  }

  return { numbers, usedCalibration };
}

export function drawWeightedNumbers(pools: ResolvedPool[], count: number): string[] {
  const winners: string[] = [];

  for (let i = 0; i < count; i += 1) {
    const availablePools = pools.filter(pool => pool.probability > 0 && pool.numbers.length > 0);
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

    const winner = selectedPool.numbers[Math.floor(Math.random() * selectedPool.numbers.length)];
    winners.push(winner);
    removeNumberFromPools(pools, winner);
  }

  return winners;
}
