import { NextRequest, NextResponse } from 'next/server';
import { removeFromLivePool } from '@/lib/live-pool';
import { getFullState } from '@/lib/full-state';
import { broadcastStateUpdate } from '@/lib/ws-manager';

/**
 * 撤销签到。
 *
 * 只把记录从签到池里拿掉，人仍然留在用户池里 —— 「取消签到」和「删除人员」
 * 是两件事：前者用于操作失误（扫错人、重复扫），后者才是不再参与抽奖。
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const memberIds: unknown = body?.memberIds;

    if (!Array.isArray(memberIds) || memberIds.length === 0) {
      return NextResponse.json({ error: 'memberIds is required', code: 'invalid' }, { status: 400 });
    }

    const ids = memberIds.map(id => String(id)).filter(Boolean);
    if (ids.length === 0) {
      return NextResponse.json({ error: 'memberIds is required', code: 'invalid' }, { status: 400 });
    }

    removeFromLivePool(ids);
    broadcastStateUpdate(getFullState());

    return NextResponse.json({ success: true, removed: ids.length });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to remove check-in', code: 'error' }, { status: 500 });
  }
}
