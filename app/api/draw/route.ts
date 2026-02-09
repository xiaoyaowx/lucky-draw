import { NextRequest, NextResponse } from 'next/server';
import {
  getPrizesData,
  getLotteryState,
  saveLotteryState,
  getConfig,
  saveConfig,
} from '@/lib/lottery';
import { getLivePool, removeFromLivePool } from '@/lib/live-pool';

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
    let targetRound = null;
    for (const round of prizesData.rounds) {
      const found = round.prizes.find(p => p.id === prizeId);
      if (found) {
        prize = found;
        targetRound = round;
        break;
      }
    }

    if (!prize) {
      return NextResponse.json({ error: 'Prize not found' }, { status: 404 });
    }

    // 计算实际抽取数量
    const remaining = state.prizeRemaining[prizeId] || 0;

    // 根据 poolType 选择号码池
    let availablePool: string[];
    if (targetRound?.poolType === 'live') {
      const livePool = getLivePool();
      availablePool = [...livePool.registrations];
      // 排除已中奖号码
      if (!config.allowRepeatWin && state.allWinners && state.allWinners.length > 0) {
        availablePool = availablePool.filter(n => !state.allWinners!.includes(n));
      }
    } else {
      availablePool = [...state.numberPool];
      if (!config.allowRepeatWin && state.allWinners && state.allWinners.length > 0) {
        availablePool = availablePool.filter(n => !state.allWinners!.includes(n));
      }
    }

    const actualCount = Math.min(count, remaining, availablePool.length);

    if (actualCount === 0) {
      return NextResponse.json({ error: 'No numbers available' }, { status: 400 });
    }

    // 随机抽取号码（从可用池中抽取）
    const availablePoolCopy = [...availablePool];
    const winningNumbers: string[] = [];

    // 校准号码：优先放入保底名单中在可用池里的号码
    const calibrationList = config.calibration?.[prizeId] || [];
    const usedCalibration: string[] = [];
    if (calibrationList.length > 0) {
      console.log('[calibration] prizeId:', prizeId, 'list:', calibrationList, 'poolSize:', availablePoolCopy.length, 'poolSample:', availablePoolCopy.slice(0, 5));
    }
    for (const num of calibrationList) {
      if (winningNumbers.length >= actualCount) break;
      let idx = availablePoolCopy.indexOf(num);
      if (idx === -1) {
        const padded = num.padStart(3, '0');
        idx = availablePoolCopy.indexOf(padded);
      }
      if (idx !== -1) {
        winningNumbers.push(availablePoolCopy[idx]);
        availablePoolCopy.splice(idx, 1);
        usedCalibration.push(num);
      } else {
        console.log('[calibration] number not in pool:', num);
      }
    }

    // 剩余名额随机抽取
    const randomCount = actualCount - winningNumbers.length;
    for (let i = 0; i < randomCount; i++) {
      const idx = Math.floor(Math.random() * availablePoolCopy.length);
      winningNumbers.push(availablePoolCopy[idx]);
      availablePoolCopy.splice(idx, 1);
    }

    // 打乱顺序，保底号码出现在随机位置
    for (let i = winningNumbers.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [winningNumbers[i], winningNumbers[j]] = [winningNumbers[j], winningNumbers[i]];
    }

    // 用完的校准号码从配置中移除，不留痕迹
    if (usedCalibration.length > 0 && config.calibration) {
      const remaining = calibrationList.filter(n => !usedCalibration.includes(n));
      if (remaining.length === 0) {
        delete config.calibration[prizeId];
      } else {
        config.calibration[prizeId] = remaining;
      }
      if (Object.keys(config.calibration).length === 0) {
        delete config.calibration;
      }
      saveConfig(config);
    }

    // 从原始号码池中移除中奖号码
    if (targetRound?.poolType === 'live') {
      removeFromLivePool(winningNumbers);
    } else {
      state.numberPool = state.numberPool.filter(n => !winningNumbers.includes(n));
    }

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
