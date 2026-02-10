import { NextRequest, NextResponse } from 'next/server';
import { getConfig, saveConfig } from '@/lib/lottery';
import { getFullState } from '@/lib/full-state';
import { broadcastStateUpdate } from '@/lib/ws-manager';

// 获取配置
export async function GET() {
  try {
    const config = getConfig();
    return NextResponse.json({ config });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Failed to get config' },
      { status: 500 }
    );
  }
}

// 更新配置
export async function PUT(request: NextRequest) {
  try {
    const updates = await request.json();
    const config = getConfig();

    // 更新允许重复中奖设置
    if (updates.allowRepeatWin !== undefined) {
      config.allowRepeatWin = updates.allowRepeatWin;
    }

    // 更新每行显示数量
    if (updates.numbersPerRow !== undefined) {
      config.numbersPerRow = updates.numbersPerRow;
    }

    // 更新号码池配置
    if (updates.numberPoolConfig) {
      config.numberPoolConfig = {
        ...config.numberPoolConfig,
        ...updates.numberPoolConfig,
      };
    }

    // 更新字体大小配置
    if (updates.fontSizes) {
      config.fontSizes = {
        ...config.fontSizes,
        ...updates.fontSizes,
      };
    }

    // 更新显示设置
    if (updates.displaySettings) {
      config.displaySettings = {
        ...config.displaySettings,
        ...updates.displaySettings,
      };
    }

    // 更新字体颜色配置
    if (updates.fontColors) {
      config.fontColors = {
        ...config.fontColors,
        ...updates.fontColors,
      };
    }

    // 更新登记设置
    if (updates.registerSettings) {
      const nextSettings = { ...config.registerSettings! };

      if (updates.registerSettings.length !== undefined) {
        const length = Number(updates.registerSettings.length);
        if (!Number.isNaN(length)) {
          nextSettings.length = Math.min(Math.max(length, 1), 20);
        }
      }

      if (updates.registerSettings.allowLetters !== undefined) {
        nextSettings.allowLetters = !!updates.registerSettings.allowLetters;
      }

      config.registerSettings = nextSettings;
    }

    // 更新校准配置
    if (updates.calibration !== undefined) {
      config.calibration = updates.calibration;
    }

    saveConfig(config);
    broadcastStateUpdate(getFullState());
    return NextResponse.json({ config });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Failed to update config' },
      { status: 500 }
    );
  }
}
