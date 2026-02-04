import { NextRequest, NextResponse } from 'next/server';
import {
  getPrizesData,
  savePrizesData,
  getLotteryState,
  saveLotteryState,
} from '@/lib/lottery';

// 修改奖品
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { level, name, quantity, color, sponsor } = await request.json();

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
        updatedPrize = round.prizes[prizeIndex];
        found = true;
        break;
      }
    }

    if (!found) {
      return NextResponse.json({ error: 'Prize not found' }, { status: 404 });
    }

    savePrizesData(data);
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
    delete state.prizeRemaining[id];
    delete state.winnersByPrize[id];
    saveLotteryState(state);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to delete prize' }, { status: 500 });
  }
}
