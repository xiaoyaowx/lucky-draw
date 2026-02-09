/**
 * 生产环境服务器 - 用于打包
 * 基于 Next.js standalone 输出，添加 WebSocket 支持
 */

const { createServer } = require('http');
const { parse } = require('url');
const path = require('path');
const fs = require('fs');
const ws = require('ws');
const { WebSocketServer } = ws;

// 环境配置
const PORT = parseInt(process.env.PORT || '3000', 10);
const HOSTNAME = process.env.HOSTNAME || '0.0.0.0';

// 解析目录：环境变量 > 上层目录（打包模式） > 当前目录
// 打包模式下 cwd 为 runtime/，数据和资源在上层 lucky-draw/ 目录
function resolveDir(envKey, dirName) {
  if (process.env[envKey]) return process.env[envKey];
  const parentDir = path.resolve(process.cwd(), '..', dirName);
  if (fs.existsSync(parentDir)) return parentDir;
  return path.join(process.cwd(), dirName);
}

const DATA_DIR = resolveDir('DATA_DIR', 'data');
const PUBLIC_DIR = resolveDir('PUBLIC_DIR', 'public');
// standalone 模式下的静态文件目录
const STATIC_DIR = path.join(process.cwd(), '.next', 'static');

// 设置环境变量，供 API 路由中的 lib/lottery.ts 使用
process.env.DATA_DIR = DATA_DIR;

console.log('启动配置:');
console.log(`  端口: ${PORT}`);
console.log(`  数据目录: ${DATA_DIR}`);
console.log(`  资源目录: ${PUBLIC_DIR}`);
console.log(`  静态文件: ${STATIC_DIR}`);

// WebSocket 连接存储
const clients = new Set();

// 广播消息
function broadcast(message) {
  const data = JSON.stringify(message);
  clients.forEach(client => {
    if (client.readyState === ws.OPEN) {
      client.send(data);
    }
  });
}

// 导出给 API 路由使用
global.wsBroadcast = broadcast;

// MIME 类型映射
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  '.map': 'application/json',
  '.txt': 'text/plain',
};

// 读取 Next.js 配置
const nextDir = process.cwd();
const nextConfigPath = path.join(nextDir, '.next', 'required-server-files.json');
let nextConfig = {};

if (fs.existsSync(nextConfigPath)) {
  try {
    const requiredFiles = JSON.parse(fs.readFileSync(nextConfigPath, 'utf-8'));
    nextConfig = requiredFiles.config || {};
    console.log('  Next.js 配置已加载');
  } catch (e) {
    console.warn('  警告: 无法解析 Next.js 配置文件');
  }
} else {
  console.warn('  警告: 未找到 required-server-files.json');
}

// 检查静态文件目录
if (fs.existsSync(STATIC_DIR)) {
  console.log('  静态文件目录存在');
} else {
  console.warn('  警告: 静态文件目录不存在:', STATIC_DIR);
}

process.env.__NEXT_PRIVATE_STANDALONE_CONFIG = JSON.stringify(nextConfig);

// 加载 Next.js Server
const NextServer = require('next/dist/server/next-server').default;

const nextServer = new NextServer({
  hostname: HOSTNAME,
  port: PORT,
  dir: nextDir,
  dev: false,
  customServer: true,
  conf: nextConfig,
});

const nextHandler = nextServer.getRequestHandler();

// 创建 HTTP 服务器
const server = createServer(async (req, res) => {
  try {
    const parsedUrl = parse(req.url, true);
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

    // 处理 _next/static 静态资源（standalone 模式需要手动处理）
    if (pathname.startsWith('/_next/static/')) {
      const staticPath = pathname.replace('/_next/static/', '');
      const filePath = path.join(STATIC_DIR, staticPath);
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          // 设置缓存头
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      } catch (e) {
        console.error('Static file error:', e);
      }
    }

    // 处理 public 目录的静态文件（非 _next 和 api 路径）
    if (pathname !== '/' && !pathname.startsWith('/_next') && !pathname.startsWith('/api')) {
      const filePath = path.join(PUBLIC_DIR, pathname);
      try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
          const ext = path.extname(filePath).toLowerCase();
          res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
          fs.createReadStream(filePath).pipe(res);
          return;
        }
      } catch (e) {
        // 文件不存在，交给 Next.js 处理
      }
    }

    // 交给 Next.js 处理
    await nextHandler(req, res, parsedUrl);
  } catch (err) {
    console.error('Error handling request:', err);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
});

// WebSocket 服务器
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
  const { pathname } = parse(req.url, true);
  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

// 启动服务器
nextServer.prepare().then(() => {
  server.listen(PORT, HOSTNAME, () => {
    console.log(`> Ready on http://localhost:${PORT}`);
    console.log(`> WebSocket on ws://localhost:${PORT}/ws`);
  });
});
