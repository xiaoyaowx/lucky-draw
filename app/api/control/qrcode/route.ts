import { NextRequest, NextResponse } from 'next/server';
import { getDisplayState, updateDisplayState } from '@/lib/display-state';
import { broadcastShowQRCode } from '@/lib/ws-manager';

// GET: 获取二维码显示状态
export async function GET() {
  const state = getDisplayState();
  return NextResponse.json({
    showQRCode: state.showQRCode || false,
    qrCodeMessage: state.qrCodeMessage || '',
  });
}

// POST: 切换二维码显示
export async function POST(request: NextRequest) {
  try {
    const { show, message } = await request.json();
    const currentState = getDisplayState();
    const showQRCode = typeof show === 'boolean' ? show : !currentState.showQRCode;
    const qrCodeMessage = typeof message === 'string' ? message.trim() : (currentState.qrCodeMessage || '');

    updateDisplayState({ showQRCode, qrCodeMessage });

    // 构建登记页面 URL
    const host = request.headers.get('host') || 'localhost:3000';
    const protocol = request.headers.get('x-forwarded-proto') || 'http';
    const registerUrl = `${protocol}://${host}/register`;

    // 广播给大屏
    broadcastShowQRCode(showQRCode, registerUrl, qrCodeMessage);

    return NextResponse.json({ success: true, showQRCode, registerUrl, qrCodeMessage });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to toggle QR code' }, { status: 500 });
  }
}
