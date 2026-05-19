import { NextRequest, NextResponse } from 'next/server';
import { getUserPools, DEFAULT_USER_POOL_ID, normalizePoolNumbers, resetLotteryRecords, saveUserPools } from '@/lib/user-pools';
import { getConfig } from '@/lib/lottery';
import { getMemberIds, getRequiredMemberError, normalizeMembers } from '@/lib/participants';
import { getFullState } from '@/lib/full-state';
import { broadcastStateUpdate } from '@/lib/ws-manager';

// 获取号码池
export async function GET() {
  try {
    const defaultPool = getUserPools().find(pool => pool.id === DEFAULT_USER_POOL_ID);
    const numberPool = defaultPool?.numbers || [];
    return NextResponse.json({
      numberPool,
      count: numberPool.length,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to get pool' }, { status: 500 });
  }
}

// 设置号码池（手动输入）
export async function POST(request: NextRequest) {
  try {
    const { numbers } = await request.json();

    if (!Array.isArray(numbers)) {
      return NextResponse.json({ error: 'Invalid numbers format' }, { status: 400 });
    }

    const numberPool = normalizePoolNumbers(numbers);
    const schema = getConfig().participantSchema;
    const members = normalizeMembers(numberPool, schema, 'manual');
    const memberError = getRequiredMemberError(members, schema);
    if (memberError) {
      return NextResponse.json({ error: memberError }, { status: 400 });
    }

    // 替换默认号码池并清除旧的抽奖记录
    const pools = getUserPools();
    const index = pools.findIndex(pool => pool.id === DEFAULT_USER_POOL_ID);
    const now = Date.now();
    if (index === -1) {
      pools.unshift({
        id: DEFAULT_USER_POOL_ID,
        name: '默认预设池',
        schemaVersion: 2,
        members,
        numbers: getMemberIds(members),
        createdAt: now,
        updatedAt: now,
      });
    } else {
      pools[index] = { ...pools[index], members, numbers: getMemberIds(members), updatedAt: now };
    }
    saveUserPools(pools);
    resetLotteryRecords();

    broadcastStateUpdate(getFullState());

    return NextResponse.json({
      numberPool,
      count: numberPool.length,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to set pool' }, { status: 500 });
  }
}
