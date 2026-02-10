import { NextRequest, NextResponse } from 'next/server';
import { updateDisplayState, getDisplayState } from '@/lib/display-state';
import { getPrizesData, getLotteryState, getConfig } from '@/lib/lottery';
import { getLivePool } from '@/lib/live-pool';
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

    // 检查号码池是否有可用号码
    const prizesData = getPrizesData();
    const lotteryState = getLotteryState();
    const config = getConfig();

    let targetRound = null;
    for (const round of prizesData.rounds) {
      if (round.prizes.find(p => p.id === prizeId)) {
        targetRound = round;
        break;
      }
    }

    const isLivePool = targetRound?.poolType === 'live';
    let availablePool: string[];
    if (isLivePool) {
      const livePool = getLivePool();
      availablePool = [...livePool.registrations];
    } else {
      availablePool = [...lotteryState.numberPool];
    }

    // 排除已中奖号码
    const currentPrizeWinners = lotteryState.winnersByPrize[prizeId]?.numbers || [];
    if (currentPrizeWinners.length > 0) {
      availablePool = availablePool.filter(n => !currentPrizeWinners.includes(n));
    }
    if (!config.allowRepeatWin && lotteryState.allWinners && lotteryState.allWinners.length > 0) {
      availablePool = availablePool.filter(n => !lotteryState.allWinners!.includes(n));
    }

    if (availablePool.length === 0) {
      const poolName = isLivePool ? '签到池' : '号码池';
      return NextResponse.json({ error: `${poolName}中没有可用号码` }, { status: 400 });
    }

    const newDisplayState = updateDisplayState({
      isRolling: true,
      drawCount: count,
      currentPrizeId: prizeId,
      winners: [],
      rollingPool: availablePool,
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
