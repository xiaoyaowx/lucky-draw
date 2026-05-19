import { NextResponse } from 'next/server';
import {
  getPrizesData,
  getLotteryState,
  saveLotteryState,
  getInitialPrizeRemaining,
} from '@/lib/lottery';
import { DEFAULT_USER_POOL_ID, getUserPools } from '@/lib/user-pools';

export async function GET() {
  try {
    const prizesData = getPrizesData();
    let state = getLotteryState();

    // 如果号码池为空，初始化
    if (state.numberPool.length === 0) {
      const defaultPool = getUserPools().find(pool => pool.id === DEFAULT_USER_POOL_ID);
      state = {
        numberPool: defaultPool?.numbers || [],
        prizeRemaining: getInitialPrizeRemaining(prizesData.rounds),
        winnersByPrize: {},
        allWinners: [],
        allWinnerIds: [],
      };
      saveLotteryState(state);
    }

    return NextResponse.json({
      rounds: prizesData.rounds,
      ...state,
      totalNumbers: state.numberPool.length,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to get lottery data' }, { status: 500 });
  }
}
