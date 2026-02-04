import { NextRequest, NextResponse } from 'next/server';
import { updateDisplayState, getDisplayState } from '@/lib/display-state';
import { broadcastRollingStart } from '@/lib/ws-manager';

interface StartRollingRequest {
  count: number;
  prizeId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as StartRollingRequest;
    const { count, prizeId } = body;

    // 参数验证
    if (typeof count !== 'number' || count < 1) {
      return NextResponse.json({ error: 'Invalid count' }, { status: 400 });
    }
    if (typeof prizeId !== 'string' || !prizeId) {
      return NextResponse.json({ error: 'Invalid prizeId' }, { status: 400 });
    }

    const state = getDisplayState();

    if (state.isRolling) {
      return NextResponse.json({ error: 'Already rolling' }, { status: 400 });
    }

    updateDisplayState({
      isRolling: true,
      drawCount: count,
      currentPrizeId: prizeId,
      winners: [],
    });

    broadcastRollingStart(count, prizeId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error starting rolling:', error);
    return NextResponse.json({ error: 'Failed to start' }, { status: 500 });
  }
}
