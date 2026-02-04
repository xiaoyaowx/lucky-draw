import { NextRequest, NextResponse } from 'next/server';
import { getLotteryState, saveLotteryState } from '@/lib/lottery';

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
      .filter(n => n && /^\d+$/.test(n))
      .map(n => n.padStart(3, '0'));

    if (numbers.length === 0) {
      return NextResponse.json(
        { error: 'No valid numbers found' },
        { status: 400 }
      );
    }

    // 去重
    const uniqueNumbers = [...new Set(numbers)];

    const state = getLotteryState();
    state.numberPool = uniqueNumbers;
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
