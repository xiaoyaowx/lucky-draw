import { NextRequest, NextResponse } from 'next/server';
import { createUserPool, getUserPools, normalizePoolNumbers } from '@/lib/user-pools';
import { getConfig } from '@/lib/lottery';
import { getRequiredMemberError, normalizeMembers } from '@/lib/participants';
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
    const { name, numbers, members } = await request.json();
    if (typeof name !== 'string' || !name.trim()) {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 });
    }

    const schema = getConfig().participantSchema;
    const poolMembers = Array.isArray(members)
      ? normalizeMembers(members, schema, 'manual')
      : normalizeMembers(normalizePoolNumbers(Array.isArray(numbers) ? numbers : []), schema, 'manual');
    const memberError = getRequiredMemberError(poolMembers, schema);
    if (memberError) {
      return NextResponse.json({ error: memberError }, { status: 400 });
    }
    const pool = createUserPool(name, poolMembers);
    broadcastStateUpdate(getFullState());

    return NextResponse.json({ pool });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to create user pool' }, { status: 500 });
  }
}
