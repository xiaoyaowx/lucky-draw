/**
 * 展示屏号码区的布局计算。
 *
 * 要解决的问题：号码卡片的宽度由**最长展示文本**决定（多字段名单下
 * 「LEO3 SEG2 9979」这类文本在 38px 字号下要 350px 宽），而「每行显示数量」
 * 是用户拍脑袋配的（线上配的是 1）。两者一叠加，抽 30 个人就是 30 行，
 * 高度直接爆炸 —— 又因为 .main-display 是 justify-content:center，
 * 溢出是**上下同时**发生的，看起来就是号码和奖品信息糊在一起。
 *
 * 所以这里反过来做：先定行列，再**反解出能塞进剩余空间的最大字号**。
 * 字号可以有下限，但版面绝不允许溢出 —— 溢出必然重叠，缩放只是变丑。
 *
 * 两条规则：
 * 1. 「每行显示数量」是**理想形状**。只要按它排出来的字号还够看（达到配置字号的
 *    READABLE_RATIO），就完全照办，用户配的形状优先。
 * 2. 达不到就放弃这个形状，改成「铺满屏幕」的自动网格：在不超过配置字号的前提下，
 *    每一行塞尽可能多的卡片，取放得下的最大字号。人多的时候这才是能看的版面。
 *
 * 整个模块是纯函数，不碰 DOM，验证脚本见 scripts/layout-selftest.ts。
 */

/** 卡片高 / 字号 */
const CARD_ASPECT = 1.8;
/** 卡片最小宽 / 字号 */
const CARD_MIN_WIDTH = 2.8;
/** 卡片左右内边距 / 字号（与 .number-card 的 padding: 0 0.4em 对应） */
const CARD_PADDING = 0.8;
/** 卡片间距 / 字号。字号 38 时约 15px，与改动前的视觉一致。 */
const GAP_RATIO = 0.4;
/** 字号下限，再小观众就看不清了 */
const MIN_FONT_SIZE = 12;
/** 奖品信息区最多被压缩到这个比例，再小就没有可读性可言 */
const MIN_PRIZE_SCALE = 0.4;
/** 号码占多行时，奖品信息区最多占的高度比例 —— 主角是号码，奖品是配角 */
const PRIZE_HEIGHT_SHARE = 0.38;
/**
 * 按「每行显示数量」排出来的字号，至少要达到配置字号的这个比例，
 * 才值得保留用户配的形状；否则换成铺满屏幕的自动网格。
 */
const READABLE_RATIO = 0.6;
/**
 * 奖品区与号码区之间的间距。
 * 必须与 globals.css 里 .main-display 的 gap 一致（那边是 30px）。
 */
const SECTION_GAP = 30;

export interface DisplayLayoutInput {
  /** 本次要展示的人数 */
  count: number;
  /** 每行显示数量（用户配置，视为理想形状而非硬约束） */
  numbersPerRow: number;
  /** 内容区可用宽高（已扣掉 .main-display 的 padding） */
  availableWidth: number;
  availableHeight: number;
  /** 用户配置的号码字号，作为缩放的**上限** */
  configuredFontSize: number;
  /** 最长展示文本在「字号 1」时的视觉宽度，由 getTextVisualWidth 换算 */
  maxTextUnits: number;
  /** 奖品信息区的自然高度（未缩放时），用于决定要不要压缩它 */
  prizeNaturalHeight: number;
}

export interface DisplayLayout {
  columns: number;
  rows: number;
  fontSize: number;
  cardWidth: number;
  cardHeight: number;
  gap: number;
  /** 缩放后奖品区实际占用的高度 */
  prizeHeight: number;
  /** 奖品区的缩放比例，1 表示不缩 */
  prizeScale: number;
  /** 是否放弃了「每行显示数量」改用自动网格（自检脚本据此断言分支走向） */
  autoFitted: boolean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** 给定列数，算这套版面能用的最大字号（同时受宽高约束，且不超过配置值）。 */
function fontSizeFor(
  columns: number,
  count: number,
  availableWidth: number,
  numbersHeight: number,
  widthUnits: number,
  configured: number,
): number {
  const rows = Math.ceil(count / columns);
  const byHeight = numbersHeight / (CARD_ASPECT * rows + GAP_RATIO * (rows - 1));
  const byWidth = availableWidth / (widthUnits * columns + GAP_RATIO * (columns - 1));
  return Math.min(configured, byHeight, byWidth);
}

/** 一行最多放得下几个卡片（字号为 fontSize 时）。 */
function maxColumnsAt(
  fontSize: number,
  count: number,
  availableWidth: number,
  widthUnits: number,
): number {
  const gap = fontSize * GAP_RATIO;
  const cardWidth = fontSize * widthUnits;
  return Math.max(1, Math.min(count, Math.floor((availableWidth + gap) / (cardWidth + gap))));
}

/**
 * 铺满屏幕的自动网格：取「放得下的最大字号」，行数由它决定。
 *
 * 之所以从配置字号往下扫而不是解析求解：可行性对字号是单调的（字号变小 →
 * 卡片变小 → 一行塞得下更多 → 行数变少 → 一定也放得下），扫到第一个可行解
 * 就是最大字号，逻辑简单且不会算错。
 */
function autoFit(
  count: number,
  availableWidth: number,
  numbersHeight: number,
  widthUnits: number,
  configured: number,
): { columns: number; rows: number; fontSize: number } {
  for (let fontSize = configured; fontSize >= MIN_FONT_SIZE; fontSize -= 0.5) {
    const columnsAtMax = maxColumnsAt(fontSize, count, availableWidth, widthUnits);
    const rows = Math.ceil(count / columnsAtMax);
    // 按行数反推列数，把最后一行摊匀（否则 10 个人排成 7+3 很难看）
    const columns = Math.ceil(count / rows);
    const gap = fontSize * GAP_RATIO;
    const gridHeight = rows * fontSize * CARD_ASPECT + (rows - 1) * gap;
    if (gridHeight <= numbersHeight + 0.5) {
      return { columns, rows, fontSize };
    }
  }

  // 连下限字号都放不下（人数极端多）：用下限字号 + 最多列数，
  // 剩下的交给 .number-display 的 overflow:hidden 兜底，至少不会压到奖品信息
  const columns = maxColumnsAt(MIN_FONT_SIZE, count, availableWidth, widthUnits);
  return { columns, rows: Math.ceil(count / columns), fontSize: MIN_FONT_SIZE };
}

export function computeDisplayLayout(input: DisplayLayoutInput): DisplayLayout {
  const count = Math.max(0, Math.floor(input.count) || 0);
  const configured = Math.max(1, input.configuredFontSize);
  const perRow = Math.max(1, Math.floor(input.numbersPerRow) || 1);
  const prizeNatural = Math.max(0, input.prizeNaturalHeight);
  const availableWidth = input.availableWidth;
  const availableHeight = input.availableHeight;

  // 卡片宽相对于字号的比例：既要保证最小宽度，也要装得下最长的文本
  const widthUnits = Math.max(CARD_MIN_WIDTH, Math.max(0, input.maxTextUnits) + CARD_PADDING);

  // 首帧还没量到容器尺寸时不乱缩，保持用户配置的原始尺寸
  if (count === 0 || availableWidth <= 0 || availableHeight <= 0) {
    return {
      columns: Math.max(1, Math.min(perRow, count || 1)),
      rows: 1,
      fontSize: configured,
      cardWidth: configured * widthUnits,
      cardHeight: configured * CARD_ASPECT,
      gap: configured * GAP_RATIO,
      prizeHeight: prizeNatural,
      prizeScale: 1,
      autoFitted: false,
    };
  }

  // 先按用户配的形状估个行数，用来决定奖品区要让多少高度。
  // 用「配置形状的行数」而不是「最终行数」是为了打断循环依赖：
  // 最终行数取决于字号，字号又取决于奖品让出多少高度。
  const referenceRows = Math.ceil(count / Math.min(perRow, count));
  const budgetByShare = referenceRows > 1
    ? (availableHeight - SECTION_GAP) * PRIZE_HEIGHT_SHARE
    : prizeNatural;
  // 同时保证号码区至少放得下 referenceRows 行「下限字号」的卡片
  const minNumbersHeight = CARD_ASPECT * MIN_FONT_SIZE * referenceRows
    + GAP_RATIO * MIN_FONT_SIZE * (referenceRows - 1);
  const budgetByNumbers = availableHeight - SECTION_GAP - minNumbersHeight;

  const prizeBudget = Math.max(0, Math.min(budgetByShare, budgetByNumbers, prizeNatural));
  const prizeScale = prizeNatural > 0 ? clamp(prizeBudget / prizeNatural, MIN_PRIZE_SCALE, 1) : 1;
  const prizeHeight = prizeNatural * prizeScale;

  const numbersHeight = Math.max(0, availableHeight - SECTION_GAP - prizeHeight);

  // 规则一：按用户配的每行个数排，字号还够看就照办
  const configuredColumns = Math.max(1, Math.min(perRow, count));
  const configuredFontSize = fontSizeFor(
    configuredColumns, count, availableWidth, numbersHeight, widthUnits, configured,
  );
  const keepConfiguredShape = configuredFontSize >= configured * READABLE_RATIO
    && configuredFontSize >= MIN_FONT_SIZE;

  // 规则二：不够看就换成铺满屏幕的自动网格
  const solved = keepConfiguredShape
    ? {
      columns: configuredColumns,
      rows: Math.ceil(count / configuredColumns),
      fontSize: configuredFontSize,
    }
    : autoFit(count, availableWidth, numbersHeight, widthUnits, configured);

  const fontSize = Math.max(solved.fontSize, MIN_FONT_SIZE);
  const gap = fontSize * GAP_RATIO;
  const cardHeight = fontSize * CARD_ASPECT;
  // 字号被下限卡住时仍可能超宽，这里按实际可用宽度收一次 ——
  // 宁可卡片挤一点、卡片内文字自动缩小，也绝不允许横向溢出
  const maxCardWidth = (availableWidth - gap * (solved.columns - 1)) / solved.columns;
  const cardWidth = Math.max(1, Math.min(fontSize * widthUnits, maxCardWidth));

  return {
    columns: solved.columns,
    rows: solved.rows,
    fontSize,
    cardWidth,
    cardHeight,
    gap,
    prizeHeight,
    prizeScale,
    autoFitted: !keepConfiguredShape,
  };
}

/** 卡片内文字超宽时按比例缩小（配合上面「被下限卡住」的情况）。 */
export function fitTextFontSize(
  textUnits: number,
  cardWidth: number,
  fontSize: number,
): number {
  const available = cardWidth - fontSize * CARD_PADDING;
  const textWidth = textUnits * fontSize;
  if (available <= 0 || textWidth <= available) return fontSize;
  return fontSize * (available / textWidth);
}
