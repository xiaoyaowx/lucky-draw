# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

Lucky Draw 是一个现代化的抽奖系统，基于 Next.js 16 + React 19 + TypeScript 构建，支持 WebSocket 实时通信。适用于年会、活动、会议等场景。

## 常用命令

```bash
npm run dev      # 启动开发服务器 (tsx server.ts)
npm run build    # 构建生产版本
npm run start    # 启动生产服务器
```

## 架构概览

### 双屏设计

系统采用双屏分离架构：
- **展示屏** (`/`) - 大屏幕显示抽奖动画和中奖号码
- **控制台** (`/control`) - 管理员操作界面，控制抽奖流程
- **管理后台** (`/admin`) - 配置奖品、号码池、轮次等

### 实时通信

使用自定义 HTTP 服务器 (`server.ts`) 集成 WebSocket：
- WebSocket 端点: `/ws`
- 内部广播端点: `/_internal/broadcast`
- `lib/ws-manager.ts` 提供广播工具函数，通过 HTTP 调用内部端点实现消息分发

消息类型：`state_update` | `rolling_start` | `rolling_stop` | `reset`

### 状态管理

- **持久化状态** (`data/` 目录): `config.json`, `prizes.json`, `lottery-state.json` - 使用文件系统存储
- **运行时状态** (`lib/display-state.ts`): 使用 Node.js 全局变量存储显示状态，避免文件写入触发 HMR

### 核心模块

- `lib/lottery.ts` - 抽奖核心逻辑：号码池生成、奖品配置读写、状态管理
- `lib/display-state.ts` - 显示状态管理（内存存储）
- `lib/ws-manager.ts` - WebSocket 广播工具

### API 路由结构

```
/api/admin/*     - 管理接口 (config, pool, prizes, rounds)
/api/control/*   - 控制接口 (start, stop, state)
/api/draw        - 执行抽奖
/api/reset       - 重置状态
```

## 技术要点

- React 严格模式已禁用 (`reactStrictMode: false`)
- 使用 `tsx` 运行 TypeScript 服务器
- 号码池默认排除含 "4" 和 "13" 的数字
