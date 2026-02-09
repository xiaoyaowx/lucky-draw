# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Lucky Draw 是一个现代化的抽奖系统，基于 Next.js 16 (App Router) + React 19 + TypeScript 构建，支持 WebSocket 实时通信。适用于年会、活动、会议等场景。

## 常用命令

```bash
npm run dev      # 启动开发服务器 (tsx server.ts)
npm run build    # 构建生产版本 (next build)
npm run start    # 启动生产服务器 (cross-env NODE_ENV=production tsx server.ts)
npm run pack     # 打包为 Windows 独立可执行程序 (scripts/build-exe.js)
```

注意：**没有测试框架和 lint 工具**，项目依赖 TypeScript 严格模式进行类型检查。

## 架构概览

### 双屏设计

系统采用三界面分离架构：
- **展示屏** (`/`) — 大屏幕显示抽奖动画和中奖号码，通过 WebSocket 接收实时更新
- **控制台** (`/control`) — 管理员操作界面，通过 HTTP API 控制抽奖流程
- **管理后台** (`/admin`) — 配置奖品、号码池、轮次等，tab 式布局（RoundManager / PrizeManager / PoolManager / ConfigPanel）

### 自定义服务器与实时通信

项目使用自定义 HTTP 服务器 (`server.ts`) 而非 Next.js 默认 dev server，以集成 WebSocket。**开发时 Turbopack 被禁用** (`turbo: false` in server.ts)，使用 webpack。

通信链路：
1. API 路由处理业务逻辑
2. API 路由调用 `lib/ws-manager.ts` 的广播函数
3. `ws-manager.ts` 通过 HTTP POST 发送到 `http://localhost:{PORT}/_internal/broadcast`
4. `server.ts` 收到内部广播请求后，通过 WebSocket 推送给所有展示屏客户端

关键端点：
- `/ws` — WebSocket 连接端点（展示屏客户端连接）
- `/_internal/broadcast` — 内部 HTTP 广播端点（仅 API 路由调用）

消息类型：`state_update` | `rolling_start` | `rolling_stop` | `reset` | `show_qrcode`

### 状态管理（双层设计）

**持久化状态**（`data/` 目录，JSON 文件 + 原子写入）：
- `config.json` — 系统配置（号码池规则、字体、颜色、注册设置等）
- `prizes.json` — 轮次和奖品定义
- `lottery-state.json` — 抽奖运行状态（号码池、已中奖记录、剩余数量）
- `live-pool.json` — 员工实时注册号码池

**运行时状态**（`lib/display-state.ts`，Node.js 全局变量）：
- 存储当前展示屏显示状态（当前奖品、是否滚动、中奖号码等）
- 使用深拷贝隔离，防止外部引用意外修改
- **设计原因**：避免文件写入触发 webpack 的 HMR（`next.config.js` 已排除 `data/` 目录的 watch，但运行时状态完全不走文件系统更安全）

### 核心模块

- `lib/lottery.ts` — 抽奖核心逻辑：号码池生成（Fisher-Yates 洗牌）、JSON 文件原子读写、配置管理。所有类型定义（Prize, Round, Config 等）也在此文件
- `lib/display-state.ts` — 展示屏显示状态管理（内存存储，全局变量 + 深拷贝）
- `lib/ws-manager.ts` — WebSocket 广播工具函数集合，封装了所有消息类型的发送
- `lib/live-pool.ts` — 员工实时注册池管理（注册/清空/开关/移除中奖者）
- `types/index.ts` — 共享 TypeScript 类型定义

### API 路由结构

```
/api/admin/config          - GET/PUT 系统配置
/api/admin/rounds          - GET/POST 轮次管理
/api/admin/prizes          - GET/POST 奖品管理
/api/admin/pool            - GET/POST 号码池（手动设置）
/api/admin/pool/generate   - POST 自动生成号码池
/api/admin/pool/import     - POST CSV 导入号码池
/api/control/state         - GET/POST 显示状态（读取/更新+广播）
/api/control/start         - POST 开始滚动（广播 rolling_start）
/api/control/stop          - POST 停止并抽取中奖者（核心抽奖逻辑）
/api/control/qrcode        - GET/POST 二维码展示控制
/api/draw                  - POST 执行抽奖（支持 live/preset 两种池）
/api/reset                 - POST 重置状态（全部或单个奖品）
/api/register              - GET/POST/PUT/DELETE 员工注册
/api/lottery               - GET 抽奖状态查询
```

### 号码池双模式

每个轮次可选择不同的号码池类型（`Round.poolType`）：
- **preset** — 预设号码池，由管理后台生成/导入，存储在 `lottery-state.json`
- **live** — 实时注册池，员工通过 `/register` 页面扫码注册，存储在 `live-pool.json`

## 技术要点

- React 严格模式已禁用 (`reactStrictMode: false`)，避免开发模式下的双重渲染问题
- 使用 `tsx` 运行 TypeScript 服务器，生产模式使用 `server.prod.js`
- 号码池默认排除含 "4" 和 "13" 的数字（文化习俗）
- JSON 文件写入使用**原子操作**（先写 `.tmp` 再 rename），防止进程崩溃导致数据损坏
- `next.config.js` 中 webpack watchOptions 排除了 `data/` 目录，防止 JSON 文件修改触发 HMR
- 输出模式为 `standalone`，支持打包部署
- 环境变量：`PORT`（默认 3000）、`DATA_DIR`（数据目录）、`PUBLIC_DIR`（静态资源目录）
- 背景图片替换：将图片放入 `public/` 目录并命名为 `bg.jpg`
