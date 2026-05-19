import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_USER_POOL_ID, getUserPools, resetLotteryRecords, saveUserPools } from '@/lib/user-pools';
import { getConfig } from '@/lib/lottery';
import { getMemberIds, getRequiredMemberError, parseMembersFromText } from '@/lib/participants';
import { getFullState } from '@/lib/full-state';
import { broadcastStateUpdate } from '@/lib/ws-manager';

// 批量导入号码池（CSV格式）
export async function POST(request: NextRequest) {
  try {
    const { csv } = await request.json();

    if (!csv || typeof csv !== 'string') {
      return NextResponse.json(
        { error: 'Invalid CSV data' },
        { status: 400 }
      );
    }

    const schema = getConfig().participantSchema;
    const members = parseMembersFromText(csv, schema, 'import');

    if (members.length === 0) {
      return NextResponse.json(
        { error: 'No valid numbers found' },
        { status: 400 }
      );
    }

    const memberError = getRequiredMemberError(members, schema);
    if (memberError) {
      return NextResponse.json({ error: memberError }, { status: 400 });
    }

    // 替换默认用户池并清除旧的抽奖记录
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
      numberPool: getMemberIds(members),
      count: members.length,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Failed to import' },
      { status: 500 }
    );
  }
}
