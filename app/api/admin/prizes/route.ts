import { NextRequest, NextResponse } from 'next/server';
import {
  getPrizesData,
  savePrizesData,
  getLotteryState,
  saveLotteryState,
  Prize,
} from '@/lib/lottery';

// 获取奖品列表（可按轮次筛选）
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const roundId = searchParams.get('roundId');

    const data = getPrizesData();

    if (roundId) {
      const round = data.rounds.find(r => r.id === parseInt(roundId));
      if (!round) {
        return NextResponse.json({ error: 'Round not found' }, { status: 404 });
      }
      return NextResponse.json({ prizes: round.prizes });
    }

    // 返回所有奖品
    const allPrizes = data.rounds.flatMap(r =>
      r.prizes.map(p => ({ ...p, roundId: r.id, roundName: r.name }))
    );
    return NextResponse.json({ prizes: allPrizes });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to get prizes' }, { status: 500 });
  }
}

// 新增奖品
export async function POST(request: NextRequest) {
  try {
    const { roundId, level, name, quantity, color, sponsor } = await request.json();

    if (!roundId || !level || !name || quantity === undefined) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const data = getPrizesData();
    const roundIndex = data.rounds.findIndex(r => r.id === roundId);

    if (roundIndex === -1) {
      return NextResponse.json({ error: 'Round not found' }, { status: 404 });
    }

    // 生成新的奖品 ID
    const existingIds = data.rounds.flatMap(r => r.prizes.map(p => p.id));
    const newId = `${roundId}-${data.rounds[roundIndex].prizes.length + 1}`;

    const newPrize: Prize = {
      id: newId,
      level,
      name,
      quantity,
      color: color || '#FFD700',
      sponsor: sponsor || '',
    };

    data.rounds[roundIndex].prizes.push(newPrize);
    savePrizesData(data);

    // 更新抽奖状态中的剩余数量
    const state = getLotteryState();
    state.prizeRemaining[newId] = quantity;
    saveLotteryState(state);

    return NextResponse.json({ prize: newPrize });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to create prize' }, { status: 500 });
  }
}
