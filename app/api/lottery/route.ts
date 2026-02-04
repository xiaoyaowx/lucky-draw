import { NextResponse } from 'next/server';
import {
  getPrizesData,
  getLotteryState,
  saveLotteryState,
  generateNumberPool,
  getInitialPrizeRemaining,
} from '@/lib/lottery';

export async function GET() {
  try {
    const prizesData = getPrizesData();
    let state = getLotteryState();

    // 如果号码池为空，初始化
    if (state.numberPool.length === 0) {
      state = {
        numberPool: generateNumberPool(),
        prizeRemaining: getInitialPrizeRemaining(prizesData.rounds),
        winnersByPrize: {},
      };
      saveLotteryState(state);
    }

    return NextResponse.json({
      rounds: prizesData.rounds,
      ...state,
      totalNumbers: generateNumberPool().length,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to get lottery data' }, { status: 500 });
  }
}
