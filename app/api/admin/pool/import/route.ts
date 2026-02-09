import { NextRequest, NextResponse } from 'next/server';
import { saveLotteryState, getPrizesData, getInitialPrizeRemaining } from '@/lib/lottery';

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
    const uniqueNumbers = [...new Set(numbers)];

    // 替换号码池并清除旧的抽奖记录
    const prizesData = getPrizesData();
    const state = {
      numberPool: uniqueNumbers,
      prizeRemaining: getInitialPrizeRemaining(prizesData.rounds),
      winnersByPrize: {},
      allWinners: [] as string[],
    };
    saveLotteryState(state);

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
