import { getDisplayState, DisplayState } from './display-state';
import { getConfig, getLotteryState, getPrizesData } from './lottery';
import { getLivePool } from './live-pool';
import { getAvailablePoolsForRound, getAvailableUnion, getRoundPoolBindings } from './pool-selection';

const DEFAULT_FONT_SIZES = { prizeLevel: 56, prizeName: 42, sponsor: 28, numberCard: 38 };
const DEFAULT_DISPLAY_SETTINGS = {
  showQuantity: true,
  showSponsor: true,
  showNumberBorder: true,
  maskPhone: false,
};
const DEFAULT_FONT_COLORS = { prizeName: '#ffffff', sponsor: '#eeeeee', numberCard: '#ffd700' };

export function getFullState(displayStateOverride?: DisplayState) {
  const displayState = displayStateOverride ?? getDisplayState();
  const prizesData = getPrizesData();
  const lotteryState = getLotteryState();
  const config = getConfig();
  const livePool = getLivePool();

  // 计算当前轮次的实际可用号码数
  const currentRound = prizesData.rounds.find(r => r.id === displayState.currentRoundId);
  const availablePools = getAvailablePoolsForRound(
    currentRound,
    lotteryState,
    config,
    displayState.currentPrizeId || undefined,
  );
  const availablePool = getAvailableUnion(availablePools);

  return {
    ...displayState,
    rounds: prizesData.rounds,
    prizeRemaining: lotteryState.prizeRemaining,
    winnersByPrize: lotteryState.winnersByPrize,
    numberPool: lotteryState.numberPool,
    livePoolCount: livePool.registrations.length,
    availablePoolSize: availablePool.length,
    currentRoundPoolBindings: getRoundPoolBindings(currentRound),
    availablePools: availablePools.map(pool => ({
      poolId: pool.poolId,
      name: pool.name,
      probability: pool.probability,
      count: pool.numbers.length,
      isLive: pool.isLive || false,
    })),

    allowRepeatWin: config.allowRepeatWin ?? false,
    numbersPerRow: config.numbersPerRow || 10,
    fontSizes: config.fontSizes || DEFAULT_FONT_SIZES,
    displaySettings: config.displaySettings || DEFAULT_DISPLAY_SETTINGS,
    fontColors: config.fontColors || DEFAULT_FONT_COLORS,
  };
}
