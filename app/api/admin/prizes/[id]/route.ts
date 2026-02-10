import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import {
  getPrizesData,
  savePrizesData,
  getLotteryState,
  saveLotteryState,
} from '@/lib/lottery';
import { getFullState } from '@/lib/full-state';
import { broadcastStateUpdate } from '@/lib/ws-manager';

function getPublicDir(): string {
  return process.env.PUBLIC_DIR || path.join(process.cwd(), 'public');
}

// 删除图片文件（如果存在）
function deletePrizeImage(imagePath: string | undefined) {
  if (!imagePath) return;
  try {
    // 防止路径穿越（例如 imagePath = ../../something）
    const publicRoot = path.resolve(getPublicDir());
    const relativePath = imagePath.replace(/^[\\/]+/, '');
    const fullPath = path.resolve(publicRoot, relativePath);

    if (!fullPath.startsWith(publicRoot + path.sep)) {
      return;
    }
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch {
    // ignore deletion errors
  }
}

// 修改奖品
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { level, name, quantity, color, sponsor, image } = await request.json();

    const data = getPrizesData();
    let found = false;
    let updatedPrize = null;

    for (const round of data.rounds) {
      const prizeIndex = round.prizes.findIndex(p => p.id === id);
      if (prizeIndex !== -1) {
        if (level) round.prizes[prizeIndex].level = level;
        if (name) round.prizes[prizeIndex].name = name;
        if (quantity !== undefined) round.prizes[prizeIndex].quantity = quantity;
        if (color) round.prizes[prizeIndex].color = color;
        if (sponsor !== undefined) round.prizes[prizeIndex].sponsor = sponsor;
        if (image !== undefined) {
          // 如果图片被更换或清除，删除旧图片
          const oldImage = round.prizes[prizeIndex].image;
          if (oldImage && oldImage !== image) {
            deletePrizeImage(oldImage);
          }
          if (image) {
            round.prizes[prizeIndex].image = image;
          } else {
            delete round.prizes[prizeIndex].image;
          }
        }
        updatedPrize = round.prizes[prizeIndex];
        found = true;
        break;
      }
    }

    if (!found) {
      return NextResponse.json({ error: 'Prize not found' }, { status: 404 });
    }

    savePrizesData(data);
    broadcastStateUpdate(getFullState());
    return NextResponse.json({ prize: updatedPrize });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to update prize' }, { status: 500 });
  }
}

// 删除奖品
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const data = getPrizesData();
    let found = false;

    for (const round of data.rounds) {
      const prizeIndex = round.prizes.findIndex(p => p.id === id);
      if (prizeIndex !== -1) {
        // 删除关联的图片文件
        deletePrizeImage(round.prizes[prizeIndex].image);
        round.prizes.splice(prizeIndex, 1);
        found = true;
        break;
      }
    }

    if (!found) {
      return NextResponse.json({ error: 'Prize not found' }, { status: 404 });
    }

    savePrizesData(data);

    // 从抽奖状态中移除
    const state = getLotteryState();
    const removed = state.winnersByPrize[id]?.numbers || [];
    delete state.prizeRemaining[id];
    delete state.winnersByPrize[id];
    if (state.allWinners && removed.length > 0) {
      state.allWinners = state.allWinners.filter(n => !removed.includes(n));
    }
    saveLotteryState(state);

    broadcastStateUpdate(getFullState());

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to delete prize' }, { status: 500 });
  }
}
