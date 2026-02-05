import { NextRequest, NextResponse } from 'next/server';
import { getPrizesData, savePrizesData, Round } from '@/lib/lottery';

// 获取所有轮次
export async function GET() {
  try {
    const data = getPrizesData();
    return NextResponse.json({ rounds: data.rounds });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to get rounds' }, { status: 500 });
  }
}

// 新增轮次
export async function POST(request: NextRequest) {
  try {
    const { name, poolType } = await request.json();
    if (!name) {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 });
    }

    const data = getPrizesData();
    const newId = data.rounds.length > 0
      ? Math.max(...data.rounds.map(r => r.id)) + 1
      : 1;

    const newRound: Round = {
      id: newId,
      name,
      poolType: poolType || 'preset',
      prizes: [],
    };

    data.rounds.push(newRound);
    savePrizesData(data);

    return NextResponse.json({ round: newRound });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to create round' }, { status: 500 });
  }
}
