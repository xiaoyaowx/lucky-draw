import { NextRequest, NextResponse } from 'next/server';
import { getPrizesData, savePrizesData, Round } from '@/lib/lottery';
import { getPoolOptions, normalizePoolBindings } from '@/lib/pool-selection';
import { DEFAULT_USER_POOL_ID, LIVE_USER_POOL_ID } from '@/lib/user-pools';
import { getFullState } from '@/lib/full-state';
import { broadcastStateUpdate } from '@/lib/ws-manager';

function resolvePoolBindings(poolBindings: unknown, poolType: unknown) {
  const bindings = normalizePoolBindings(poolBindings);
  if (bindings.length > 0) return bindings;

  return [{
    poolId: poolType === 'live' ? LIVE_USER_POOL_ID : DEFAULT_USER_POOL_ID,
    probability: 100,
  }];
}

function isValidPoolBindings(poolBindings: ReturnType<typeof normalizePoolBindings>): boolean {
  const validPoolIds = new Set(getPoolOptions().map(pool => pool.id));
  return poolBindings.length > 0 && poolBindings.every(binding => validPoolIds.has(binding.poolId));
}

// 获取所有轮次
export async function GET() {
  try {
    const data = getPrizesData();
    return NextResponse.json({ rounds: data.rounds });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to get rounds' }, { status: 500 });
  }
}

// 新增轮次
export async function POST(request: NextRequest) {
  try {
    const { name, poolType, poolBindings } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 });
    }

    const resolvedPoolBindings = resolvePoolBindings(poolBindings, poolType);
    if (!isValidPoolBindings(resolvedPoolBindings)) {
      return NextResponse.json({ error: 'Invalid pool bindings' }, { status: 400 });
    }

    const data = getPrizesData();
    const newId = data.rounds.length > 0
      ? Math.max(...data.rounds.map(r => r.id)) + 1
      : 1;

    const newRound: Round = {
      id: newId,
      name,
      poolType: resolvedPoolBindings.length === 1 && resolvedPoolBindings[0].poolId === LIVE_USER_POOL_ID ? 'live' : 'preset',
      poolBindings: resolvedPoolBindings,
      prizes: [],
    };

    data.rounds.push(newRound);
    savePrizesData(data);

    broadcastStateUpdate(getFullState());

    return NextResponse.json({ round: newRound });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to create round' }, { status: 500 });
  }
}
