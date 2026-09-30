import { NextRequest, NextResponse } from 'next/server';
import {
  addPoolMember,
  deletePoolMember,
  describeMemberOpError,
  updatePoolMember,
  MemberOpError,
} from '@/lib/pool-members';
import { getFullState } from '@/lib/full-state';
import { broadcastStateUpdate } from '@/lib/ws-manager';

/**
 * 单个成员的增 / 改 / 删。
 *
 * 单独开一个 route 而不是往 PUT /api/admin/user-pools/[id] 上挂参数：
 * 池级接口的语义是「整体替换 members」，而这里是对单个人的定点操作，
 * 两者混在一起会让「传了 members 但只想改一个人」这种调用变得含糊。
 */

function errorStatus(error: MemberOpError): number {
  return error.kind === 'poolNotFound' || error.kind === 'memberNotFound' ? 404 : 400;
}

// 新增成员
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const result = addPoolMember(id, body?.values || {});

    if (!result.ok) {
      return NextResponse.json(describeMemberOpError(result.error), {
        status: errorStatus(result.error),
      });
    }

    broadcastStateUpdate(getFullState());
    return NextResponse.json({ pool: result.data.pool, member: result.data.member });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ code: 'error', error: 'Failed to add member' }, { status: 500 });
  }
}

// 修改成员信息（唯一字段改动会级联改名）
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const memberId = typeof body?.memberId === 'string' ? body.memberId : '';
    if (!memberId) {
      return NextResponse.json({ code: 'memberNotFound' }, { status: 400 });
    }

    const result = updatePoolMember(id, memberId, body?.values || {});
    if (!result.ok) {
      return NextResponse.json(describeMemberOpError(result.error), {
        status: errorStatus(result.error),
      });
    }

    broadcastStateUpdate(getFullState());
    return NextResponse.json({
      pool: result.data.pool,
      member: result.data.member,
      renamed: result.data.renamed,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ code: 'error', error: 'Failed to update member' }, { status: 500 });
  }
}

// 删除成员
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const memberId = request.nextUrl.searchParams.get('memberId') || '';
    if (!memberId) {
      return NextResponse.json({ code: 'memberNotFound' }, { status: 400 });
    }

    const result = deletePoolMember(id, memberId);
    if (!result.ok) {
      return NextResponse.json(describeMemberOpError(result.error), {
        status: errorStatus(result.error),
      });
    }

    broadcastStateUpdate(getFullState());
    return NextResponse.json({
      pool: result.data.pool,
      removedCheckIn: result.data.removedCheckIn,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ code: 'error', error: 'Failed to delete member' }, { status: 500 });
  }
}
