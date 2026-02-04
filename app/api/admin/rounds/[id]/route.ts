import { NextRequest, NextResponse } from 'next/server';
import { getPrizesData, savePrizesData } from '@/lib/lottery';

// 修改轮次
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const roundId = parseInt(id);
    const { name } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 });
    }

    const data = getPrizesData();
    const roundIndex = data.rounds.findIndex(r => r.id === roundId);

    if (roundIndex === -1) {
      return NextResponse.json({ error: 'Round not found' }, { status: 404 });
    }

    data.rounds[roundIndex].name = name;
    savePrizesData(data);

    return NextResponse.json({ round: data.rounds[roundIndex] });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to update round' }, { status: 500 });
  }
}

// 删除轮次
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const roundId = parseInt(id);

    const data = getPrizesData();
    const roundIndex = data.rounds.findIndex(r => r.id === roundId);

    if (roundIndex === -1) {
      return NextResponse.json({ error: 'Round not found' }, { status: 404 });
    }

    data.rounds.splice(roundIndex, 1);
    savePrizesData(data);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to delete round' }, { status: 500 });
  }
}
