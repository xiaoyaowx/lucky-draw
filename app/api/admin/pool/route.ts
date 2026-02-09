import { NextRequest, NextResponse } from 'next/server';
import { getLotteryState, saveLotteryState, getPrizesData, getInitialPrizeRemaining } from '@/lib/lottery';

// 获取号码池
export async function GET() {
  try {
    const state = getLotteryState();
    return NextResponse.json({
      numberPool: state.numberPool,
      count: state.numberPool.length,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to get pool' }, { status: 500 });
  }
}

// 设置号码池（手动输入）
export async function POST(request: NextRequest) {
  try {
    const { numbers } = await request.json();

    if (!Array.isArray(numbers)) {
      return NextResponse.json({ error: 'Invalid numbers format' }, { status: 400 });
    }

    const numberPool = numbers.map((n: unknown) => String(n).trim()).filter(Boolean);

    // 替换号码池并清除旧的抽奖记录
    const prizesData = getPrizesData();
    const state = {
      numberPool,
      prizeRemaining: getInitialPrizeRemaining(prizesData.rounds),
      winnersByPrize: {},
      allWinners: [] as string[],
    };
    saveLotteryState(state);

    return NextResponse.json({
      numberPool: state.numberPool,
      count: state.numberPool.length,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to set pool' }, { status: 500 });
  }
}
