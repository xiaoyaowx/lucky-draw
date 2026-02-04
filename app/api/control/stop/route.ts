import { NextRequest, NextResponse } from 'next/server';
import { updateDisplayState, getDisplayState } from '@/lib/display-state';
import {
  getPrizesData,
  getLotteryState,
  saveLotteryState,
  getConfig,
} from '@/lib/lottery';
import { broadcastRollingStop, broadcastStateUpdate } from '@/lib/ws-manager';

export async function POST(request: NextRequest) {
  try {
    const state = getDisplayState();

    if (!state.isRolling || !state.currentPrizeId) {
      return NextResponse.json({ error: 'Not rolling' }, { status: 400 });
    }

    const prizeId = state.currentPrizeId;
    const count = state.drawCount;

    const prizesData = getPrizesData();
    const lotteryState = getLotteryState();
    const config = getConfig();

    // 初始化 allWinners
    if (!lotteryState.allWinners) {
      lotteryState.allWinners = [];
    }

    // 找到奖品信息
    let prize = null;
    for (const round of prizesData.rounds) {
      prize = round.prizes.find(p => p.id === prizeId);
      if (prize) break;
    }

    if (!prize) {
      return NextResponse.json({ error: 'Prize not found' }, { status: 404 });
    }

    // 计算实际抽取数量
    const remaining = lotteryState.prizeRemaining[prizeId] || 0;

    // 构建可用号码池
    let availablePool = [...lotteryState.numberPool];

    // 获取当前奖品已中奖的号码（同一奖品内不能重复中奖）
    const currentPrizeWinners = lotteryState.winnersByPrize[prizeId]?.numbers || [];
    if (currentPrizeWinners.length > 0) {
      availablePool = availablePool.filter(n => !currentPrizeWinners.includes(n));
    }

    // 如果不允许跨奖品重复中奖，排除所有已中奖号码
    if (!config.allowRepeatWin && lotteryState.allWinners.length > 0) {
      availablePool = availablePool.filter(
        n => !lotteryState.allWinners!.includes(n)
      );
    }

    const actualCount = Math.min(count, remaining, availablePool.length);

    if (actualCount === 0) {
      updateDisplayState({ isRolling: false });
      return NextResponse.json({ error: 'No numbers available' }, { status: 400 });
    }

    // 随机抽取号码
    const poolCopy = [...availablePool];
    const winningNumbers: string[] = [];

    for (let i = 0; i < actualCount; i++) {
      const idx = Math.floor(Math.random() * poolCopy.length);
      winningNumbers.push(poolCopy[idx]);
      poolCopy.splice(idx, 1);
    }

    // 如果不允许跨奖品重复中奖，从号码池中移除中奖号码
    if (!config.allowRepeatWin) {
      lotteryState.numberPool = lotteryState.numberPool.filter(
        n => !winningNumbers.includes(n)
      );
    }

    // 更新中奖记录
    if (!lotteryState.winnersByPrize[prizeId]) {
      lotteryState.winnersByPrize[prizeId] = {
        level: prize.level,
        name: prize.name,
        numbers: [],
      };
    }
    lotteryState.winnersByPrize[prizeId].numbers.push(...winningNumbers);

    // 更新全局中奖记录
    lotteryState.allWinners.push(...winningNumbers);

    // 更新剩余数量
    lotteryState.prizeRemaining[prizeId] = remaining - actualCount;

    saveLotteryState(lotteryState);

    // 更新显示状态
    const newDisplayState = updateDisplayState({
      isRolling: false,
      winners: winningNumbers,
    });

    // 广播停止消息
    broadcastRollingStop(winningNumbers);

    // 广播完整状态
    const fullState = {
      ...newDisplayState,
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

    return NextResponse.json({
      winners: winningNumbers,
      prizeRemaining: lotteryState.prizeRemaining,
      winnersByPrize: lotteryState.winnersByPrize,
      numberPool: lotteryState.numberPool,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to stop' }, { status: 500 });
  }
}
