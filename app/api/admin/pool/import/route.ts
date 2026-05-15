import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_USER_POOL_ID, getUserPools, normalizePoolNumbers, resetLotteryRecords, saveUserPools } from '@/lib/user-pools';
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

    // 解析CSV
    const numbers = csv
      .split(/[,\n\r]+/)
      .map(n => n.trim())
      .filter(Boolean);

    if (numbers.length === 0) {
      return NextResponse.json(
        { error: 'No valid numbers found' },
        { status: 400 }
      );
    }

    // 去重
    const uniqueNumbers = normalizePoolNumbers(numbers);

    // 替换默认用户池并清除旧的抽奖记录
    const pools = getUserPools();
    const index = pools.findIndex(pool => pool.id === DEFAULT_USER_POOL_ID);
    const now = Date.now();
    if (index === -1) {
      pools.unshift({
        id: DEFAULT_USER_POOL_ID,
        name: '默认预设池',
        numbers: uniqueNumbers,
        createdAt: now,
        updatedAt: now,
      });
    } else {
      pools[index] = { ...pools[index], numbers: uniqueNumbers, updatedAt: now };
    }
    saveUserPools(pools);
    resetLotteryRecords();

    broadcastStateUpdate(getFullState());

    return NextResponse.json({
      numberPool: uniqueNumbers,
      count: uniqueNumbers.length,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Failed to import' },
      { status: 500 }
    );
  }
}
