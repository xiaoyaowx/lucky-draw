/**
 * 展示屏号码区布局的自检脚本。
 *
 * 为什么需要：`lib/display-layout.ts` 是纯数学，改一个系数就可能让卡片在某个分辨率下
 * 溢出去压住奖品信息 —— 而那只有在现场投影仪上才会被发现。这里把「不能溢出」
 * 「不能漏人」这两条硬约束固化成断言，在常用分辨率上跑一遍。
 *
 * 用法::
 *
 *     node --import tsx scripts/layout-selftest.ts
 */

import assert from 'node:assert';
import { computeDisplayLayout } from '../lib/display-layout';

/** 必须与 globals.css 里 .main-display 的 gap 一致 */
const SECTION_GAP = 30;

interface Scene {
  name: string;
  count: number;
  numbersPerRow: number;
  /** 内容区宽高（已扣掉 .main-display 的 padding） */
  width: number;
  height: number;
  /** 配置的号码字号 */
  font: number;
  /** 最长展示文本在字号 1 时的视觉宽度 */
  units: number;
  /** 奖品区自然高度（未缩放） */
  prize: number;
  /** 期望保留用户配的每行个数（即没走自动网格） */
  keepShape?: boolean;
  /** 期望的列数 */
  expectColumns?: number;
}

/** 中文姓名 + 工号，例如「张三 0001」 */
const UNITS_SHORT = 5;
/** 多字段模板 {firstname} {companyname} {number}，例如「LEO3 SEG2 9979」 */
const UNITS_LONG = 8.4;

const SCENES: Scene[] = [
  { name: '单人 1080p', count: 1, numbersPerRow: 10, width: 1840, height: 1000, font: 38, units: UNITS_SHORT, prize: 300, keepShape: true, expectColumns: 1 },
  { name: '3 人 1080p', count: 3, numbersPerRow: 10, width: 1840, height: 1000, font: 38, units: UNITS_SHORT, prize: 300, keepShape: true, expectColumns: 3 },
  { name: '10 人短文本 1080p', count: 10, numbersPerRow: 10, width: 1840, height: 1000, font: 38, units: UNITS_SHORT, prize: 300, keepShape: true, expectColumns: 10 },
  { name: '30 人短文本 1080p', count: 30, numbersPerRow: 10, width: 1840, height: 1000, font: 38, units: UNITS_SHORT, prize: 300, keepShape: true, expectColumns: 10 },
  { name: '30 人长文本 1080p', count: 30, numbersPerRow: 10, width: 1840, height: 1000, font: 38, units: UNITS_LONG, prize: 300 },
  { name: '30 人长文本 + 大图 1080p', count: 30, numbersPerRow: 10, width: 1840, height: 1000, font: 38, units: UNITS_LONG, prize: 560 },
  { name: '50 人长文本 1080p', count: 50, numbersPerRow: 10, width: 1840, height: 1000, font: 38, units: UNITS_LONG, prize: 400 },
  { name: '100 人长文本 1080p', count: 100, numbersPerRow: 10, width: 1840, height: 1000, font: 38, units: UNITS_LONG, prize: 600 },
  { name: '30 人 1366x768', count: 30, numbersPerRow: 10, width: 1286, height: 688, font: 38, units: UNITS_LONG, prize: 320 },
  { name: '30 人 1280x720', count: 30, numbersPerRow: 8, width: 1200, height: 640, font: 38, units: UNITS_LONG, prize: 320 },
  { name: '50 人 4K 投影', count: 50, numbersPerRow: 10, width: 3760, height: 2080, font: 38, units: UNITS_LONG, prize: 600, keepShape: true, expectColumns: 10 },

  // 线上真实配置：每行 1 个 + 长模板。抽 30 个人 = 30 行，必须走自动网格
  { name: '线上配置 每行1个 抽30人', count: 30, numbersPerRow: 1, width: 1840, height: 1000, font: 43, units: UNITS_LONG, prize: 300 },
  { name: '线上配置 每行1个 抽1人', count: 1, numbersPerRow: 1, width: 1840, height: 1000, font: 43, units: UNITS_LONG, prize: 300, keepShape: true, expectColumns: 1 },

  // 用户把「每行显示数量」调小就应该拿到满字号 —— 这是留给现场的主要旋钮
  { name: '30 人每行 5 个（旋钮生效）', count: 30, numbersPerRow: 5, width: 1840, height: 1000, font: 38, units: UNITS_LONG, prize: 300, keepShape: true, expectColumns: 5 },

  // 极端情况
  { name: '60 人超长文本', count: 60, numbersPerRow: 12, width: 1840, height: 1000, font: 48, units: 14, prize: 500 },
  { name: '20 人窄屏 800x600', count: 20, numbersPerRow: 10, width: 720, height: 520, font: 38, units: UNITS_LONG, prize: 260 },
  { name: '200 人 1080p', count: 200, numbersPerRow: 20, width: 1840, height: 1000, font: 38, units: UNITS_LONG, prize: 300 },
];

let failures = 0;

for (const s of SCENES) {
  const layout = computeDisplayLayout({
    count: s.count,
    numbersPerRow: s.numbersPerRow,
    availableWidth: s.width,
    availableHeight: s.height,
    configuredFontSize: s.font,
    maxTextUnits: s.units,
    prizeNaturalHeight: s.prize,
  });

  const numbersHeight = s.height - SECTION_GAP - layout.prizeHeight;
  const gridHeight = layout.rows * layout.cardHeight + (layout.rows - 1) * layout.gap;
  const gridWidth = layout.columns * layout.cardWidth + (layout.columns - 1) * layout.gap;

  const problems: string[] = [];
  // 硬约束一：所有人都要看得见
  if (layout.columns * layout.rows < s.count) {
    problems.push(`装不下 ${layout.columns}x${layout.rows} < ${s.count}`);
  }
  // 硬约束二：绝不溢出（溢出必然重叠）
  if (gridHeight > numbersHeight + 0.5) {
    problems.push(`纵向溢出 ${gridHeight.toFixed(1)} > ${numbersHeight.toFixed(1)}`);
  }
  if (gridWidth > s.width + 0.5) {
    problems.push(`横向溢出 ${gridWidth.toFixed(1)} > ${s.width}`);
  }
  if (layout.prizeHeight + SECTION_GAP + numbersHeight > s.height + 0.5) {
    problems.push('总高超出可用空间');
  }
  // 配置的字号是上限，不能放大
  if (layout.fontSize > s.font + 0.001) {
    problems.push(`字号超过配置 ${layout.fontSize.toFixed(1)} > ${s.font}`);
  }
  if (layout.fontSize < 12 - 0.001) {
    problems.push(`字号跌破下限 ${layout.fontSize.toFixed(1)}`);
  }
  if (layout.prizeScale < 0.4 - 0.001 || layout.prizeScale > 1 + 0.001) {
    problems.push(`奖品缩放越界 ${layout.prizeScale}`);
  }
  if (s.keepShape !== undefined && layout.autoFitted === s.keepShape) {
    problems.push(s.keepShape ? '不该走自动网格' : '应该走自动网格');
  }
  if (s.expectColumns !== undefined && layout.columns !== s.expectColumns) {
    problems.push(`列数应为 ${s.expectColumns}，实际 ${layout.columns}`);
  }

  if (problems.length) failures += 1;
  console.log(
    `${problems.length ? '✗' : '✓'} ${s.name.padEnd(26)}`
    + `${String(layout.columns).padStart(3)}列x${String(layout.rows).padStart(3)}行  `
    + `字号 ${layout.fontSize.toFixed(1).padStart(5)}  卡片 ${layout.cardWidth.toFixed(0)}x${layout.cardHeight.toFixed(0)}  `
    + `奖品x${layout.prizeScale.toFixed(2)}  ${layout.autoFitted ? '自动网格' : '按配置'}`.padEnd(10)
    + (problems.length ? `  <<< ${problems.join('; ')}` : ''),
  );
}

// 首帧还没量到尺寸时不能乱缩（SSR 到 hydrate 之间）
{
  const layout = computeDisplayLayout({
    count: 30, numbersPerRow: 10, availableWidth: 0, availableHeight: 0,
    configuredFontSize: 38, maxTextUnits: UNITS_LONG, prizeNaturalHeight: 0,
  });
  assert.strictEqual(layout.fontSize, 38, '未测量时应保持配置字号');
  assert.strictEqual(layout.prizeScale, 1);
  assert.strictEqual(layout.autoFitted, false);
  console.log('✓ 未测量时保持配置尺寸');
}

// 边界：0 人、单人单列
{
  const zero = computeDisplayLayout({
    count: 0, numbersPerRow: 10, availableWidth: 1840, availableHeight: 1000,
    configuredFontSize: 38, maxTextUnits: 0, prizeNaturalHeight: 300,
  });
  assert.ok(zero.columns >= 1 && zero.fontSize > 0, '0 人不应产生非法布局');

  const one = computeDisplayLayout({
    count: 1, numbersPerRow: 1, availableWidth: 1840, availableHeight: 1000,
    configuredFontSize: 38, maxTextUnits: UNITS_LONG, prizeNaturalHeight: 300,
  });
  assert.strictEqual(one.columns, 1);
  assert.strictEqual(one.rows, 1);
  assert.strictEqual(one.fontSize, 38, '单人单列应该拿满配置字号');
  console.log('✓ 边界：0 人 / 单人单列');
}

console.log(failures === 0 ? '\n全部场景通过。' : `\n有 ${failures} 个场景不通过。`);
process.exit(failures === 0 ? 0 : 1);
