import { NextRequest, NextResponse } from 'next/server';
import { updateDisplayState, getDisplayState } from '@/lib/display-state';
import {
  getPrizesData,
  getLotteryState,
  saveLotteryState,
  getConfig,
  saveConfig,
} from '@/lib/lottery';
import {
  drawWeightedNumbers,
  getAvailablePoolsForRound,
  getAvailableUnion,
  takeCalibrationNumbers,
} from '@/lib/pool-selection';
import { broadcastRollingStop, broadcastStateUpdate } from '@/lib/ws-manager';
import { getFullState } from '@/lib/full-state';

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

    const availablePools = getAvailablePoolsForRound(targetRound, lotteryState, config, prizeId);
    const availablePool = getAvailableUnion(availablePools);

    const actualCount = Math.min(count, remaining, availablePool.length);

    if (actualCount === 0) {
      const newDisplayState = updateDisplayState({ isRolling: false, winners: [], rollingPool: undefined });
      broadcastRollingStop([]);
      broadcastStateUpdate(getFullState(newDisplayState));
      return NextResponse.json({ error: 'No numbers available' }, { status: 400 });
    }

    const winningNumbers: string[] = [];

    // 校准号码：优先放入保底名单中在可用池里的号码
    const calibrationList = config.calibration?.[prizeId] || [];
    if (calibrationList.length > 0) {
      console.log('[calibration] prizeId:', prizeId, 'list:', calibrationList, 'poolSize:', availablePool.length, 'poolSample:', availablePool.slice(0, 5));
    }
    const { numbers: calibrationNumbers, usedCalibration } = takeCalibrationNumbers(
      availablePools,
      calibrationList,
      actualCount,
    );
    winningNumbers.push(...calibrationNumbers);

    // 剩余名额按轮次绑定的用户池概率抽取
    const randomCount = actualCount - winningNumbers.length;
    winningNumbers.push(...drawWeightedNumbers(availablePools, randomCount));

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
      rollingPool: undefined,
    });

    // 广播停止消息
    broadcastRollingStop(winningNumbers);

    // 广播完整状态
    const fullState = getFullState(newDisplayState);
    broadcastStateUpdate(fullState);

    return NextResponse.json({
      winners: winningNumbers,
      prizeRemaining: lotteryState.prizeRemaining,
      winnersByPrize: lotteryState.winnersByPrize,
      numberPool: lotteryState.numberPool,
      availablePoolSize: fullState.availablePoolSize,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to stop' }, { status: 500 });
  }
}
