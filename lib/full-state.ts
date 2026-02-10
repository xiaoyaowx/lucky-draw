import { getDisplayState, DisplayState } from './display-state';
import { getConfig, getLotteryState, getPrizesData } from './lottery';

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

  return {
    ...displayState,
    rounds: prizesData.rounds,
    prizeRemaining: lotteryState.prizeRemaining,
    winnersByPrize: lotteryState.winnersByPrize,
    numberPool: lotteryState.numberPool,

    allowRepeatWin: config.allowRepeatWin ?? false,
    numbersPerRow: config.numbersPerRow || 10,
    fontSizes: config.fontSizes || DEFAULT_FONT_SIZES,
    displaySettings: config.displaySettings || DEFAULT_DISPLAY_SETTINGS,
    fontColors: config.fontColors || DEFAULT_FONT_COLORS,
  };
}

