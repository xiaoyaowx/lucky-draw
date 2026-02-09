import { NextRequest, NextResponse } from 'next/server';
import { getLivePool, registerEmployee, setLivePoolOpen, clearLivePool } from '@/lib/live-pool';
import { getConfig } from '@/lib/lottery';

// GET: 获取登记状态和列表
export async function GET() {
  try {
    const pool = getLivePool();
    const config = getConfig();
    const registerSettings = config.registerSettings || { length: 6, allowLetters: false };
    return NextResponse.json({
      isOpen: pool.isOpen,
      registrations: pool.registrations,
      count: pool.registrations.length,
      registerSettings,
      version: pool.clearedAt || 0,
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: '获取登记池失败' }, { status: 500 });
  }
}

// POST: 提交工号登记
export async function POST(request: NextRequest) {
  try {
    const { employeeId } = await request.json();
    if (typeof employeeId !== 'string') {
      return NextResponse.json({ success: false, message: '工号格式错误' }, { status: 400 });
    }

    const config = getConfig();
    const registerSettings = config.registerSettings || { length: 6, allowLetters: false };
    const trimmedId = employeeId.trim();
    if (!trimmedId) {
      return NextResponse.json({ success: false, message: '工号不能为空' }, { status: 400 });
    }

    const normalized = registerSettings.allowLetters
      ? trimmedId.toUpperCase()
      : trimmedId;

    const allowedPattern = registerSettings.allowLetters ? /^[A-Z0-9]+$/ : /^[0-9]+$/;
    if (!allowedPattern.test(normalized)) {
      return NextResponse.json(
        {
          success: false,
          message: registerSettings.allowLetters ? '工号只能包含字母和数字' : '工号只能包含数字',
        },
        { status: 400 }
      );
    }

    if (normalized.length !== registerSettings.length) {
      return NextResponse.json(
        {
          success: false,
          message: registerSettings.allowLetters
            ? `工号应为 ${registerSettings.length} 位字母或数字`
            : `工号应为 ${registerSettings.length} 位数字`,
        },
        { status: 400 }
      );
    }

    const result = registerEmployee(normalized);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ success: false, message: '登记失败' }, { status: 500 });
  }
}

// PUT: 开启/关闭登记
export async function PUT(request: NextRequest) {
  try {
    const { isOpen } = await request.json();
    if (typeof isOpen !== 'boolean') {
      return NextResponse.json({ error: '参数错误' }, { status: 400 });
    }

    setLivePoolOpen(isOpen);
    return NextResponse.json({ success: true, isOpen });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: '操作失败' }, { status: 500 });
  }
}

// DELETE: 清空登记池
export async function DELETE() {
  try {
    clearLivePool();
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: '清空失败' }, { status: 500 });
  }
}
