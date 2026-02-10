import { NextRequest, NextResponse } from 'next/server';
import { updateDisplayState } from '@/lib/display-state';
import { getFullState } from '@/lib/full-state';
import { broadcastStateUpdate } from '@/lib/ws-manager';

// 获取完整状态
export async function GET() {
  try {
    return NextResponse.json(getFullState());
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to get state' }, { status: 500 });
  }
}

// 更新显示状态
export async function POST(request: NextRequest) {
  try {
    const updates = await request.json();
    const newState = updateDisplayState(updates);

    const fullState = getFullState(newState);
    broadcastStateUpdate(fullState);
    return NextResponse.json(fullState);
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to update state' }, { status: 500 });
  }
}
