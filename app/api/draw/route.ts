import { NextRequest, NextResponse } from 'next/server';
import {
  getPrizesData,
  getLotteryState,
  saveLotteryState,
  getConfig,
} from '@/lib/lottery';

interface DrawRequest {
  prizeId: string;
  count: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as DrawRequest;
    const { prizeId, count } = body;

    // 参数验证
    if (typeof prizeId !== 'string' || !prizeId) {
      return NextResponse.json({ error: 'Invalid prizeId' }, { status: 400 });
    }
    if (typeof count !== 'number' || count < 1) {
      return NextResponse.json({ error: 'Invalid count' }, { status: 400 });
    }

    const prizesData = getPrizesData();
    const state = getLotteryState();
    const config = getConfig();

    // 初始化 allWinners
    if (!state.allWinners) {
      state.allWinners = [];
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
    const remaining = state.prizeRemaining[prizeId] || 0;

    // 构建可用号码池（根据配置排除已中奖号码）
    let availablePool = [...state.numberPool];
    if (!config.allowRepeatWin && state.allWinners && state.allWinners.length > 0) {
      availablePool = availablePool.filter(n => !state.allWinners!.includes(n));
    }

    const actualCount = Math.min(count, remaining, availablePool.length);

    if (actualCount === 0) {
      return NextResponse.json({ error: 'No numbers available' }, { status: 400 });
    }

    // 随机抽取号码（从可用池中抽取）
    const availablePoolCopy = [...availablePool];
    const winningNumbers: string[] = [];

    for (let i = 0; i < actualCount; i++) {
      const idx = Math.floor(Math.random() * availablePoolCopy.length);
      winningNumbers.push(availablePoolCopy[idx]);
      availablePoolCopy.splice(idx, 1);
    }

    // 从原始号码池中移除中奖号码
    state.numberPool = state.numberPool.filter(n => !winningNumbers.includes(n));

    // 更新中奖记录
    if (!state.winnersByPrize[prizeId]) {
      state.winnersByPrize[prizeId] = {
        level: prize.level,
        name: prize.name,
        numbers: [],
      };
    }
    state.winnersByPrize[prizeId].numbers.push(...winningNumbers);

    // 更新全局中奖记录（用于跨奖项去重）
    state.allWinners.push(...winningNumbers);

    // 更新剩余数量
    state.prizeRemaining[prizeId] = remaining - actualCount;

    saveLotteryState(state);

    return NextResponse.json({
      winners: winningNumbers,
      numberPool: state.numberPool,
      prizeRemaining: state.prizeRemaining,
      winnersByPrize: state.winnersByPrize,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Draw failed' }, { status: 500 });
  }
}
