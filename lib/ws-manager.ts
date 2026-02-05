// WebSocket 广播工具
// 通过 HTTP 调用内部广播端点

export interface WSMessage {
  type: 'state_update' | 'rolling_start' | 'rolling_stop' | 'reset' | 'show_qrcode';
  payload?: unknown;
}

function getBroadcastUrl(): string {
  const port = process.env.PORT || '3000';
  return `http://localhost:${port}/_internal/broadcast`;
}

export async function broadcast(message: WSMessage): Promise<void> {
  try {
    await fetch(getBroadcastUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });
  } catch (err) {
    console.error('Broadcast failed:', err);
  }
}

export function broadcastStateUpdate(state: unknown): void {
  broadcast({ type: 'state_update', payload: state });
}

export function broadcastRollingStart(count: number, prizeId: string): void {
  broadcast({ type: 'rolling_start', payload: { count, prizeId } });
}

export function broadcastRollingStop(winners: string[]): void {
  broadcast({ type: 'rolling_stop', payload: { winners } });
}

export function broadcastReset(): void {
  broadcast({ type: 'reset' });
}

export function broadcastShowQRCode(show: boolean, url: string, message: string): void {
  broadcast({ type: 'show_qrcode', payload: { show, url, message } });
}
