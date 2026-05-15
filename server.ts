import { createServer } from 'http';
import { createServer as createNetServer } from 'net';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import fs from 'fs';
import path from 'path';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const requestedPort = parsePort(process.env.PORT, 3000);

// 外部 public 目录（打包后使用）
const PUBLIC_DIR = process.env.PUBLIC_DIR || path.join(process.cwd(), 'public');

function parsePort(value: string | undefined, fallback: number): number {
  const port = Number.parseInt(value || `${fallback}`, 10);
  return Number.isInteger(port) && port > 0 && port <= 65535 ? port : fallback;
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = createNetServer();

    tester.once('error', () => {
      resolve(false);
    });

    tester.once('listening', () => {
      tester.close(() => resolve(true));
    });

    tester.listen(port);
  });
}

async function findAvailablePort(startPort: number): Promise<number> {
  for (let port = startPort; port <= 65535; port += 1) {
    if (await isPortAvailable(port)) {
      if (port !== startPort) {
        console.warn(`> Port ${startPort} is in use, using ${port} instead`);
      }
      return port;
    }

    console.warn(`> Port ${port} is in use, trying ${port + 1}`);
  }

  throw new Error(`No available port found from ${startPort} to 65535`);
}

// WebSocket 连接存储
const clients = new Set<WebSocket>();

// 广播消息给所有客户端
export function broadcast(message: object) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

// 导出给 API 路由使用
declare global {
  var wsBroadcast: typeof broadcast;
}
global.wsBroadcast = broadcast;

async function start() {
  const port = await findAvailablePort(requestedPort);
  process.env.PORT = String(port);

  // 禁用 turbopack，使用 webpack 以确保兼容性
  const app = next({ dev, hostname, port, turbo: false });
  const handle = app.getRequestHandler();

  await app.prepare();

  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      const pathname = parsedUrl.pathname || '/';

      // 内部广播端点
      if (pathname === '/_internal/broadcast' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            const message = JSON.parse(body);
            broadcast(message);
            res.statusCode = 200;
            res.end('OK');
          } catch (e) {
            res.statusCode = 400;
            res.end('Invalid JSON');
          }
        });
        return;
      }

      // 处理外部 public 目录的静态文件（排除 _next 和 api 路径）
      // 注意：这里必须防止路径穿越（例如 /../secret.txt）。
      if (PUBLIC_DIR && !pathname.startsWith('/_next') && !pathname.startsWith('/api') && pathname !== '/') {
        const publicRoot = path.resolve(PUBLIC_DIR);
        const safePath = path.resolve(publicRoot, `.${pathname}`);

        // 若不在 publicRoot 下，则拒绝（防止读取任意文件）
        if (!safePath.startsWith(publicRoot + path.sep)) {
          res.statusCode = 400;
          res.end('Bad Request');
          return;
        }

        try {
          if (fs.existsSync(safePath) && fs.statSync(safePath).isFile()) {
            const ext = path.extname(safePath).toLowerCase();
            const mimeTypes: Record<string, string> = {
              '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
              '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
              '.css': 'text/css', '.js': 'application/javascript', '.json': 'application/json',
              '.webp': 'image/webp', '.woff': 'font/woff', '.woff2': 'font/woff2',
            };
            res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
            fs.createReadStream(safePath).pipe(res);
            return;
          }
        } catch {
          // 文件不存在，继续交给 Next.js 处理
        }
      }

      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error handling request:', err);
      res.statusCode = 500;
      res.end('Internal Server Error');
    }
  });

  // 创建 WebSocket 服务器
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('WebSocket client connected, total:', clients.size);

    ws.on('close', () => {
      clients.delete(ws);
      console.log('WebSocket client disconnected, total:', clients.size);
    });

    ws.on('error', (err) => {
      console.error('WebSocket error:', err);
      clients.delete(ws);
    });
  });

  // 处理 WebSocket 升级请求
  server.on('upgrade', (req, socket, head) => {
    const { pathname } = parse(req.url!, true);
    if (pathname === '/ws') {
      // 自定义 WebSocket 连接
      wss.handleUpgrade(req, socket, head, (ws) => {
        wss.emit('connection', ws, req);
      });
    } else if (pathname === '/_next/webpack-hmr') {
      // HMR WebSocket 连接 - 不做任何处理，让 Next.js 内部处理
      // 注意：不能调用 socket.destroy()，否则会破坏 HMR
    } else {
      // 其他未知的升级请求，关闭连接
      socket.destroy();
    }
  });

  server.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
    console.log(`> WebSocket on ws://${hostname}:${port}/ws`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
