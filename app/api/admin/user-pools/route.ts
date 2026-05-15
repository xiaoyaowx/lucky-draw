import { NextRequest, NextResponse } from 'next/server';
import { createUserPool, getUserPools, normalizePoolNumbers } from '@/lib/user-pools';
import { getPoolOptions } from '@/lib/pool-selection';
import { getFullState } from '@/lib/full-state';
import { broadcastStateUpdate } from '@/lib/ws-manager';

// 获取所有用户池
export async function GET() {
  try {
    const pools = getUserPools();
    return NextResponse.json({
      pools,
      options: getPoolOptions(pools),
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to get user pools' }, { status: 500 });
  }
}

// 新增用户池
export async function POST(request: NextRequest) {
  try {
    const { name, numbers } = await request.json();
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 });
    }

    const pool = createUserPool(name, normalizePoolNumbers(Array.isArray(numbers) ? numbers : []));
    broadcastStateUpdate(getFullState());

    return NextResponse.json({ pool });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to create user pool' }, { status: 500 });
  }
}
