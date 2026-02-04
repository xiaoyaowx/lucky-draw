import { NextRequest, NextResponse } from 'next/server';
import {
  getLotteryState,
  saveLotteryState,
  generateNumberPoolFromConfig,
  getConfig,
  saveConfig,
} from '@/lib/lottery';

// 自动生成号码池
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { start, end, excludePatterns, excludeContains, excludeExact } = body;

    const config = getConfig();

    // 如果提供了参数，更新配置
    if (start !== undefined) config.numberPoolConfig.start = start;
    if (end !== undefined) config.numberPoolConfig.end = end;

    // 支持新的排除模式
    if (excludeContains) {
      config.numberPoolConfig.excludeContains = excludeContains;
      delete config.numberPoolConfig.excludePatterns; // 清除旧配置
    }
    if (excludeExact) {
      config.numberPoolConfig.excludeExact = excludeExact;
    }
    // 兼容旧的 excludePatterns 参数
    if (excludePatterns && !excludeContains) {
      config.numberPoolConfig.excludePatterns = excludePatterns;
    }

    config.numberPoolConfig.type = 'auto';
    saveConfig(config);

    // 生成号码池
    const numberPool = generateNumberPoolFromConfig(config.numberPoolConfig);

    const state = getLotteryState();
    state.numberPool = numberPool;
    saveLotteryState(state);

    return NextResponse.json({
      numberPool,
      count: numberPool.length,
      config: config.numberPoolConfig,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to generate pool' }, { status: 500 });
  }
}
