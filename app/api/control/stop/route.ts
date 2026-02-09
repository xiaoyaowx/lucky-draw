import { NextRequest, NextResponse } from 'next/server';
import { updateDisplayState, getDisplayState } from '@/lib/display-state';
import {
  getPrizesData,
  getLotteryState,
  saveLotteryState,
  getConfig,
  saveConfig,
} from '@/lib/lottery';
import { getLivePool, removeFromLivePool } from '@/lib/live-pool';
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

    // 找到奖品信息及所属轮次
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
    const remaining = lotteryState.prizeRemaining[prizeId] || 0;

    // 根据 poolType 构建可用号码池
    const isLivePool = targetRound?.poolType === 'live';
    let availablePool: string[];
    if (isLivePool) {
      const livePool = getLivePool();
      availablePool = [...livePool.registrations];
    } else {
      availablePool = [...lotteryState.numberPool];
    }

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

    // 校准号码：优先放入保底名单中在可用池里的号码
    const calibrationList = config.calibration?.[prizeId] || [];
    const usedCalibration: string[] = [];
    if (calibrationList.length > 0) {
      console.log('[calibration] prizeId:', prizeId, 'list:', calibrationList, 'poolSize:', poolCopy.length, 'poolSample:', poolCopy.slice(0, 5));
    }
    for (const num of calibrationList) {
      if (winningNumbers.length >= actualCount) break;
      // 精确匹配，或对齐号码池格式后匹配
      let idx = poolCopy.indexOf(num);
      if (idx === -1) {
        const padded = num.padStart(3, '0');
        idx = poolCopy.indexOf(padded);
      }
      if (idx !== -1) {
        winningNumbers.push(poolCopy[idx]);
        poolCopy.splice(idx, 1);
        usedCalibration.push(num);
      } else {
        console.log('[calibration] number not in pool:', num);
      }
    }

    // 剩余名额随机抽取
    const randomCount = actualCount - winningNumbers.length;
    for (let i = 0; i < randomCount; i++) {
      const idx = Math.floor(Math.random() * poolCopy.length);
      winningNumbers.push(poolCopy[idx]);
      poolCopy.splice(idx, 1);
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

    // 从号码池中移除中奖号码
    if (isLivePool) {
      removeFromLivePool(winningNumbers);
    } else if (!config.allowRepeatWin) {
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
