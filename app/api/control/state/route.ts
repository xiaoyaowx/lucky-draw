import { NextRequest, NextResponse } from 'next/server';
import { getDisplayState, updateDisplayState } from '@/lib/display-state';
import { getPrizesData, getLotteryState, getConfig } from '@/lib/lottery';
import { broadcastStateUpdate } from '@/lib/ws-manager';

// 获取完整状态
export async function GET() {
  try {
    const displayState = getDisplayState();
    const prizesData = getPrizesData();
    const lotteryState = getLotteryState();
    const config = getConfig();

    return NextResponse.json({
      ...displayState,
      rounds: prizesData.rounds,
      prizeRemaining: lotteryState.prizeRemaining,
      winnersByPrize: lotteryState.winnersByPrize,
      numberPool: lotteryState.numberPool,
      allowRepeatWin: config.allowRepeatWin ?? false,
      numbersPerRow: config.numbersPerRow || 10,
      fontSizes: config.fontSizes || { prizeLevel: 56, prizeName: 42, sponsor: 28, numberCard: 38 },
      displaySettings: config.displaySettings || { showQuantity: true, showSponsor: true },
      fontColors: config.fontColors || { prizeName: '#ffffff', sponsor: '#eeeeee', numberCard: '#ffd700' },
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to get state' }, { status: 500 });
  }
}

// 更新显示状态
export async function POST(request: NextRequest) {
  try {
    const updates = await request.json();
    const newState = updateDisplayState(updates);

    // 获取完整状态并广播
    const prizesData = getPrizesData();
    const lotteryState = getLotteryState();
    const config = getConfig();

    const fullState = {
      ...newState,
      rounds: prizesData.rounds,
      prizeRemaining: lotteryState.prizeRemaining,
      winnersByPrize: lotteryState.winnersByPrize,
      numberPool: lotteryState.numberPool,
      numbersPerRow: config.numbersPerRow || 10,
      fontSizes: config.fontSizes || { prizeLevel: 56, prizeName: 42, sponsor: 28, numberCard: 38 },
      displaySettings: config.displaySettings || { showQuantity: true, showSponsor: true },
      fontColors: config.fontColors || { prizeName: '#ffffff', sponsor: '#eeeeee', numberCard: '#ffd700' },
    };

    broadcastStateUpdate(fullState);
    return NextResponse.json(fullState);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to update state' }, { status: 500 });
  }
}
