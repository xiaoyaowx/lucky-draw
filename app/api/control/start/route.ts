import { NextRequest, NextResponse } from 'next/server';
import { updateDisplayState, getDisplayState } from '@/lib/display-state';
import { getPrizesData, getLotteryState, getConfig } from '@/lib/lottery';
import { getAvailablePoolsForRound, getAvailableUnion } from '@/lib/pool-selection';
import { createDisplayParticipant } from '@/lib/participants';
import { broadcastRollingStart, broadcastStateUpdate } from '@/lib/ws-manager';
import { getFullState } from '@/lib/full-state';

interface StartRollingRequest {
  count: number;
  prizeId: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as StartRollingRequest;
    const { count, prizeId } = body;

    // 参数验证
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1) {
      return NextResponse.json({ error: 'Invalid count' }, { status: 400 });
    }
    if (typeof prizeId !== 'string' || !prizeId) {
      return NextResponse.json({ error: 'Invalid prizeId' }, { status: 400 });
    }

    const state = getDisplayState();

    if (state.isRolling) {
      return NextResponse.json({ error: 'Already rolling' }, { status: 400 });
    }

    // 检查号码池是否有可用号码
    const prizesData = getPrizesData();
    const lotteryState = getLotteryState();
    const config = getConfig();

    let targetRound = null;
    let targetPrize = null;
    for (const round of prizesData.rounds) {
      const found = round.prizes.find(p => p.id === prizeId);
      if (found) {
        targetRound = round;
        targetPrize = found;
        break;
      }
    }

    if (!targetPrize) {
      return NextResponse.json({ error: 'Prize not found' }, { status: 404 });
    }

    const availablePools = getAvailablePoolsForRound(targetRound, lotteryState, config, prizeId);
    const availablePool = getAvailableUnion(availablePools);
    const rollingPool = availablePool.map(candidate => createDisplayParticipant(candidate, config.participantSchema));
    const remaining = lotteryState.prizeRemaining[prizeId] || 0;
    const maxDraw = Math.min(remaining, availablePool.length);

    if (maxDraw <= 0) {
      return NextResponse.json({ error: '绑定的用户池中没有可用号码' }, { status: 400 });
    }
    if (count > maxDraw) {
      return NextResponse.json({ error: `抽取数量不能超过 ${maxDraw}` }, { status: 400 });
    }

    const newDisplayState = updateDisplayState({
      isRolling: true,
      drawCount: count,
      currentPrizeId: prizeId,
      winners: [],
      winnerDetails: [],
      rollingPool,
    });

    // 广播完整状态（让展示屏拿到 rollingPool，用于本地滚动显示）
    broadcastStateUpdate(getFullState(newDisplayState));

    broadcastRollingStart(count, prizeId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error starting rolling:', error);
    return NextResponse.json({ error: 'Failed to start' }, { status: 500 });
  }
}
