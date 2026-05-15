import { NextRequest, NextResponse } from 'next/server';
import { getPrizesData, savePrizesData } from '@/lib/lottery';
import { getPoolOptions, normalizePoolBindings } from '@/lib/pool-selection';
import { LIVE_USER_POOL_ID } from '@/lib/user-pools';
import { getFullState } from '@/lib/full-state';
import { broadcastStateUpdate } from '@/lib/ws-manager';

function isValidPoolBindings(poolBindings: ReturnType<typeof normalizePoolBindings>): boolean {
  const validPoolIds = new Set(getPoolOptions().map(pool => pool.id));
  return poolBindings.length > 0 && poolBindings.every(binding => validPoolIds.has(binding.poolId));
}

// 修改轮次
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const roundId = parseInt(id);
    const { name, poolType, poolBindings } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 });
    }

    const data = getPrizesData();
    const roundIndex = data.rounds.findIndex(r => r.id === roundId);

    if (roundIndex === -1) {
      return NextResponse.json({ error: 'Round not found' }, { status: 404 });
    }

    data.rounds[roundIndex].name = name;
    if (poolBindings !== undefined) {
      const resolvedPoolBindings = normalizePoolBindings(poolBindings);
      if (!isValidPoolBindings(resolvedPoolBindings)) {
        return NextResponse.json({ error: 'Invalid pool bindings' }, { status: 400 });
      }
      data.rounds[roundIndex].poolBindings = resolvedPoolBindings;
      data.rounds[roundIndex].poolType = resolvedPoolBindings.length === 1 && resolvedPoolBindings[0].poolId === LIVE_USER_POOL_ID ? 'live' : 'preset';
    } else if (poolType) {
      data.rounds[roundIndex].poolType = poolType;
    }
    savePrizesData(data);

    broadcastStateUpdate(getFullState());

    return NextResponse.json({ round: data.rounds[roundIndex] });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to update round' }, { status: 500 });
  }
}

// 删除轮次
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const roundId = parseInt(id);

    const data = getPrizesData();
    const roundIndex = data.rounds.findIndex(r => r.id === roundId);

    if (roundIndex === -1) {
      return NextResponse.json({ error: 'Round not found' }, { status: 404 });
    }

    data.rounds.splice(roundIndex, 1);
    savePrizesData(data);

    broadcastStateUpdate(getFullState());

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to delete round' }, { status: 500 });
  }
}
