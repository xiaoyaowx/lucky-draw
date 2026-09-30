import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_USER_POOL_ID } from '@/lib/user-pools';
import { getConfig } from '@/lib/lottery';
import { buildMembersFromTable, parseMembersFromText } from '@/lib/participants';
import { getLivePool } from '@/lib/live-pool';
import { importIntoPool, describeMemberOpError, ImportMode } from '@/lib/pool-members';
import { getFullState } from '@/lib/full-state';
import { broadcastStateUpdate } from '@/lib/ws-manager';

/**
 * 批量导入成员（CSV / 纯号码文本）。
 *
 * 与旧版的区别：不再「导入即覆盖 + 重置抽奖记录」。
 * - merge（默认）：按唯一字段比对，已存在则补全信息、不存在则追加。
 *   签到状态和抽奖记录一律不动 —— 现场临时加客户用的就是这个模式。
 * - replace：以本次名单为准，名单外的人被移出；仍在名单里的签到依然保留。
 *
 * 需要清空抽奖记录请走「重置全部」或「清空用户池」，破坏性操作不和导入绑在一起。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { csv, rows } = body;

    // 两种来源：粘贴的文本（csv），或经 /api/admin/pool/parse 解析好的表格（rows）。
    // 文件走 rows 而不是先转成 CSV 文本，是为了绕开「单元格里带逗号/换行」的转义问题。
    const hasRows = Array.isArray(rows) && rows.length > 0;
    if (!hasRows && (!csv || typeof csv !== 'string')) {
      return NextResponse.json({ error: 'Invalid import payload', code: 'invalid' }, { status: 400 });
    }

    const mode: ImportMode = body.mode === 'replace' ? 'replace' : 'merge';
    const poolId: string = typeof body.poolId === 'string' && body.poolId.trim()
      ? body.poolId.trim()
      : DEFAULT_USER_POOL_ID;

    const schema = getConfig().participantSchema;
    const members = hasRows
      ? buildMembersFromTable(rows as string[][], schema, 'import')
      : parseMembersFromText(csv, schema, 'import');

    if (members.length === 0) {
      return NextResponse.json(
        { error: 'No valid numbers found', code: 'noMembers' },
        { status: 400 },
      );
    }

    // 必填校验在这里做而不是复用 getRequiredMemberError：需要把「缺哪个字段、
    // 哪个人缺」作为结构化信息回给前端，才能按当前语言渲染提示。
    for (const member of members) {
      const missing = schema.fields.find(field => field.required && !member.values[field.key]);
      if (missing) {
        return NextResponse.json(
          {
            error: `${member.id} 缺少必填字段：${missing.label}`,
            code: 'required',
            field: missing.label,
            id: member.id,
          },
          { status: 400 },
        );
      }
    }

    const checkInIds = getLivePool().members.map(member => member.id);
    const result = importIntoPool(poolId, members, mode, checkInIds);
    if (!result.ok) {
      return NextResponse.json(
        { error: 'User pool not found', ...describeMemberOpError(result.error) },
        { status: 404 },
      );
    }

    broadcastStateUpdate(getFullState());

    return NextResponse.json({
      pool: result.data.pool,
      stats: result.data.stats,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to import', code: 'error' }, { status: 500 });
  }
}
