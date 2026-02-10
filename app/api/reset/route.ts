import { NextRequest, NextResponse } from 'next/server';
import {
  getPrizesData,
  getLotteryState,
  saveLotteryState,
  getInitialPrizeRemaining,
} from '@/lib/lottery';
import { getFullState } from '@/lib/full-state';
import { broadcastStateUpdate, broadcastReset } from '@/lib/ws-manager';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { prizeId } = body;

    const prizesData = getPrizesData();

    if (prizeId) {
      // 单个奖品重置
      const currentState = getLotteryState();

      // 找到奖品信息
      let prize = null;
      for (const round of prizesData.rounds) {
        prize = round.prizes.find(p => p.id === prizeId);
        if (prize) break;
      }

      if (!prize) {
        return NextResponse.json({ error: 'Prize not found' }, { status: 404 });
      }

      // 获取该奖品已中奖的号码
      const prizeWinners = currentState.winnersByPrize[prizeId]?.numbers || [];

      // numberPool 始终保持不变，无需放回

      // 从 allWinners 中移除这些号码
      if (currentState.allWinners) {
        currentState.allWinners = currentState.allWinners.filter(
          n => !prizeWinners.includes(n)
        );
      }

      // 重置该奖品的剩余数量
      currentState.prizeRemaining[prizeId] = prize.quantity;

      // 清除该奖品的中奖记录
      delete currentState.winnersByPrize[prizeId];

      saveLotteryState(currentState);

      // 通知大屏/控制台刷新
      broadcastStateUpdate(getFullState());

      return NextResponse.json({
        ...currentState,
        resetPrizeId: prizeId,
      });
    } else {
      // 全部重置 — 只清除中奖记录，numberPool 保持不变
      const currentState = getLotteryState();

      const state = {
        numberPool: currentState.numberPool,
        prizeRemaining: getInitialPrizeRemaining(prizesData.rounds),
        winnersByPrize: {},
        allWinners: [],
      };

      saveLotteryState(state);

      broadcastReset();
      broadcastStateUpdate(getFullState());

      return NextResponse.json({
        ...state,
        totalNumbers: state.numberPool.length,
      });
    }
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Reset failed' }, { status: 500 });
  }
}
