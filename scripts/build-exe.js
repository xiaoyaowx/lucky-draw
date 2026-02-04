/**
 * 打包脚本 - 将应用打包为可分发的目录（含 Node.js 便携版）
 * 运行方式: node scripts/build-exe.js
 *
 * 输出结构:
 * dist/lottery/
 *   ├── lottery.exe        # 启动器
 *   ├── data/              # 数据目录（可修改）
 *   ├── public/            # 静态资源（可修改背景图等）
 *   └── runtime/           # 运行时文件（不要修改）
 *       ├── node/          # Node.js 便携版
 *       ├── .next/         # Next.js 构建产物
 *       ├── app/           # 应用源码
 *       └── ...
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const https = require('https');

const ROOT_DIR = path.join(__dirname, '..');
const DIST_DIR = path.join(ROOT_DIR, 'dist');
const APP_DIR = path.join(DIST_DIR, 'lucky-draw');
const RUNTIME_DIR = path.join(APP_DIR, 'runtime');
const NODE_DIR = path.join(RUNTIME_DIR, 'node');

// Node.js 便携版配置
const NODE_VERSION = '20.11.1';
const NODE_FILENAME = `node-v${NODE_VERSION}-win-x64`;
const NODE_URL = `https://nodejs.org/dist/v${NODE_VERSION}/${NODE_FILENAME}.zip`;
const NODE_ZIP = path.join(DIST_DIR, `${NODE_FILENAME}.zip`);

console.log('========================================');
console.log('  打包 Lucky Draw 抽奖系统');
console.log('========================================\n');

// 清理并创建目录
function setupDirs() {
  console.log('[1/6] 准备目录...');
  if (fs.existsSync(APP_DIR)) {
    fs.rmSync(APP_DIR, { recursive: true });
  }
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
}

// 下载文件
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlinkSync(dest);
        downloadFile(response.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      const total = parseInt(response.headers['content-length'], 10);
      let downloaded = 0;
      response.on('data', (chunk) => {
        downloaded += chunk.length;
        const percent = ((downloaded / total) * 100).toFixed(1);
        process.stdout.write(`\r    下载进度: ${percent}%`);
      });
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        console.log('');
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

// 下载并解压 Node.js
async function downloadNode() {
  console.log('[2/6] 准备 Node.js 便携版...');
  console.log(`    版本: v${NODE_VERSION}`);

  if (!fs.existsSync(NODE_ZIP)) {
    console.log('    下载中...');
    await downloadFile(NODE_URL, NODE_ZIP);
  } else {
    console.log('    使用缓存的压缩包');
  }

  console.log('    解压中...');
  execSync(`powershell -Command "Expand-Archive -Path '${NODE_ZIP}' -DestinationPath '${RUNTIME_DIR}' -Force"`, {
    stdio: 'pipe'
  });

  const extractedDir = path.join(RUNTIME_DIR, NODE_FILENAME);
  if (fs.existsSync(NODE_DIR)) {
    fs.rmSync(NODE_DIR, { recursive: true });
  }
  fs.renameSync(extractedDir, NODE_DIR);
}

// 构建项目
function buildProject() {
  console.log('[3/6] 构建 Next.js 项目...');
  execSync('npm run build', { cwd: ROOT_DIR, stdio: 'inherit' });
}

// 编译服务器文件
function compileServer() {
  console.log('[4/6] 编译服务器文件...');
  // 使用 esbuild 编译生产服务器，ws 设置为 external
  execSync('npx esbuild server.prod.js --bundle --platform=node --target=node18 --outfile=dist/lottery/runtime/server.js --external:next --external:react --external:react-dom --external:ws', {
    cwd: ROOT_DIR,
    stdio: 'inherit'
  });
}

// 复制文件
function copyFiles() {
  console.log('[5/6] 复制文件...');

  const copyDir = (src, dest) => {
    if (!fs.existsSync(src)) return;
    fs.cpSync(src, dest, { recursive: true });
  };

  const copyFile = (src, dest) => {
    if (!fs.existsSync(src)) return;
    fs.copyFileSync(src, dest);
  };

  // 使用 standalone 输出（更小更快）
  const standaloneDir = path.join(ROOT_DIR, '.next', 'standalone');
  if (!fs.existsSync(standaloneDir)) {
    throw new Error('Next.js standalone 构建失败，请检查 next.config.js 中的 output: "standalone" 配置');
  }

  // 复制 standalone 目录内容到 runtime
  copyDir(standaloneDir, RUNTIME_DIR);

  // 复制静态文件（standalone 不包含这些）
  copyDir(path.join(ROOT_DIR, '.next', 'static'), path.join(RUNTIME_DIR, '.next', 'static'));

  // 删除 runtime 下不需要的目录（使用外层的 data 和 public）
  const runtimePublic = path.join(RUNTIME_DIR, 'public');
  const runtimeData = path.join(RUNTIME_DIR, 'data');
  if (fs.existsSync(runtimePublic)) {
    fs.rmSync(runtimePublic, { recursive: true });
    console.log('    已删除 runtime/public（使用外层目录）');
  }
  if (fs.existsSync(runtimeData)) {
    fs.rmSync(runtimeData, { recursive: true });
    console.log('    已删除 runtime/data（使用外层目录）');
  }

  // 复制 ws 模块（WebSocket 支持）
  const wsModuleSrc = path.join(ROOT_DIR, 'node_modules', 'ws');
  const wsModuleDest = path.join(RUNTIME_DIR, 'node_modules', 'ws');
  if (fs.existsSync(wsModuleSrc)) {
    copyDir(wsModuleSrc, wsModuleDest);
    console.log('    已复制 ws 模块');
  }

  // 用户可修改的文件（放在根目录）
  copyDir(path.join(ROOT_DIR, 'data'), path.join(APP_DIR, 'data'));
  copyDir(path.join(ROOT_DIR, 'public'), path.join(APP_DIR, 'public'));
}

// 创建启动脚本
function createLauncher() {
  console.log('[6/6] 创建启动脚本...');

  const batContent = [
    '@echo off',
    'chcp 65001 >nul',
    'title Lucky Draw',
    'cd /d "%~dp0runtime"',
    'set NODE_ENV=production',
    'set DATA_DIR=%~dp0data',
    'set PUBLIC_DIR=%~dp0public',
    'echo ========================================',
    'echo   Lucky Draw',
    'echo ========================================',
    'echo.',
    'echo Starting server...',
    'echo Display: http://localhost:3000',
    'echo Control: http://localhost:3000/control',
    'echo Admin:   http://localhost:3000/admin',
    'echo.',
    '".\\node\\node.exe" "server.js"',
    'pause'
  ].join('\r\n');
  fs.writeFileSync(path.join(APP_DIR, 'lucky-draw.bat'), batContent);
}

// 主流程
async function main() {
  try {
    setupDirs();
    await downloadNode();
    buildProject();
    copyFiles();       // 先复制 standalone 目录
    compileServer();   // 再编译我们的 server.js 覆盖 standalone 的
    createLauncher();

    console.log('\n========================================');
    console.log('  打包完成!');
    console.log('========================================');
    console.log('输出目录:', APP_DIR);
    console.log('\n目录结构:');
    console.log('  lucky-draw/');
    console.log('    ├── lucky-draw.bat # 双击启动');
    console.log('    ├── data/          # 数据文件(可修改)');
    console.log('    ├── public/        # 静态资源(可修改)');
    console.log('    └── runtime/       # 运行时(勿修改)');
  } catch (err) {
    console.error('\n打包失败:', err.message);
    process.exit(1);
  }
}

main();
