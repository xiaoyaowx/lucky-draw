<div align="center">

# Lucky Draw

**一个现代化、高颜值的实时抽奖系统**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![WebSocket](https://img.shields.io/badge/WebSocket-Realtime-green?style=flat-square)](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
[![License](https://img.shields.io/badge/License-MIT-yellow?style=flat-square)](LICENSE)

*适用于年会、活动、会议、直播等各类抽奖场景*

[功能特性](#-功能特性) · [快速开始](#-快速开始) · [使用指南](#-使用指南) · [配置说明](#-配置说明) · [技术架构](#-技术架构)

![演示截图](public/demo-screenshot.png)

*双屏设计：左侧展示屏显示抽奖动画和中奖号码，右侧控制台用于管理员操作*

</div>

---

## 功能特性

### 双屏互动架构

| 展示屏 `/` | 控制台 `/control` | 管理后台 `/admin` |
|:---:|:---:|:---:|
| 大屏幕沉浸式抽奖动画 | 管理员操作界面 | 系统配置管理 |
| 实时滚动号码效果 | 控制抽奖流程 | 奖品/轮次/号码池 |
| 中奖庆祝动画 | 查看中奖记录 | 显示样式定制 |

### 核心亮点

- **实时同步** - 基于 WebSocket 的毫秒级状态同步，多端显示完全一致
- **高度可配置** - 支持自定义字体大小、颜色、号码池规则、中奖算法等
- **多轮次支持** - 可配置多轮抽奖，每轮包含多个奖项
- **智能去重** - 支持同奖项去重和跨奖品去重两种模式
- **号码池管理** - 灵活的号码生成规则，支持排除特定数字（如 4、13）
- **数据持久化** - JSON 文件存储，易于备份和迁移
- **一键部署** - 支持打包为独立可执行文件

---

## 快速开始

### 环境要求

- **Node.js** 18.0 或更高版本
- **npm** 或 **pnpm**

### 安装

```bash
# 克隆仓库
git clone https://github.com/xiaoyaowx/lucky-draw.git
cd lucky-draw

# 安装依赖
npm install
```

### 启动

```bash
# 开发模式
npm run dev

# 生产模式
npm run build && npm run start
```

启动后访问：
- **展示屏**: http://localhost:3000
- **控制台**: http://localhost:3000/control
- **管理后台**: http://localhost:3000/admin

---

## 使用指南

### 1. 初始化配置

首次使用请先访问管理后台 (`/admin`) 进行配置：

1. **轮次管理** - 创建抽奖轮次（如：第一轮、第二轮）
2. **奖品管理** - 为每个轮次添加奖品，设置名称、数量、颜色、赞助商
3. **号码池** - 配置抽奖号码范围，排除不吉利数字
4. **系统设置** - 调整字体大小、显示元素等

### 2. 抽奖流程

```
准备阶段
├── 展示屏: 打开 http://localhost:3000 并投放到大屏幕
└── 控制台: 打开 http://localhost:3000/control 用于操作

抽奖阶段
├── 1. 在控制台选择轮次和奖项
├── 2. 设置本次抽取数量
├── 3. 点击「开始抽奖」- 展示屏进入滚动模式
└── 4. 点击「停止」- 展示屏定格中奖号码，播放庆祝动画
```

### 3. 数据管理

所有数据存储在 `data/` 目录：

| 文件 | 说明 |
|------|------|
| `config.json` | 系统配置（字体、颜色、规则等） |
| `prizes.json` | 奖品数据（轮次、奖项信息） |
| `lottery-state.json` | 抽奖状态（中奖记录、号码池） |

> 提示：定期备份 `data/` 目录可防止数据丢失

---

## 配置说明

### 号码池配置

```json
{
  "numberPoolConfig": {
    "start": 1,
    "end": 300,
    "excludeContains": ["4"],
    "excludeExact": ["13", "250"]
  }
}
```

| 字段 | 说明 | 示例 |
|------|------|------|
| `start` | 起始号码 | `1` |
| `end` | 结束号码 | `300` |
| `excludeContains` | 排除包含指定数字的号码 | `["4"]` 排除 4, 14, 24, 40-49... |
| `excludeExact` | 排除精确匹配的号码 | `["13", "250"]` |

### 显示配置

```json
{
  "fontSizes": {
    "prizeLevel": 56,
    "prizeName": 55,
    "sponsor": 53,
    "numberCard": 43
  },
  "fontColors": {
    "prizeName": "#ffffff",
    "sponsor": "#ffffff",
    "numberCard": "#ffffff"
  },
  "displaySettings": {
    "showQuantity": false,
    "showSponsor": true
  }
}
```

### 中奖规则

```json
{
  "allowRepeatWin": false
}
```

- `true`: 允许同一号码在不同奖项中重复中奖
- `false`: 已中奖号码不能再次中奖

---

## 技术架构

### 技术栈

| 层级 | 技术 | 版本 |
|------|------|------|
| 框架 | Next.js (App Router) | 16.x |
| UI | React | 19.x |
| 语言 | TypeScript | 5.9 |
| 通信 | WebSocket (ws) | 8.x |
| 运行时 | Node.js | 18+ |

### 目录结构

```
lucky-draw/
├── app/                      # Next.js 应用
│   ├── admin/                # 管理后台
│   │   ├── page.tsx
│   │   └── components/       # 管理组件
│   ├── api/                  # API 路由
│   │   ├── admin/            # 管理接口
│   │   └── control/          # 控制接口
│   ├── control/              # 控制台
│   │   └── page.tsx
│   ├── page.tsx              # 展示屏
│   ├── layout.tsx
│   └── globals.css
├── lib/                      # 核心模块
│   ├── lottery.ts            # 抽奖逻辑
│   ├── display-state.ts      # 状态管理
│   └── ws-manager.ts         # WebSocket
├── types/                    # 类型定义
├── data/                     # 数据存储
├── public/                   # 静态资源
├── server.ts                 # 自定义服务器
└── package.json
```

### 数据流

```
┌─────────────┐     WebSocket      ┌─────────────┐
│   展示屏     │ ◄─────────────────► │   服务器     │
│     /       │                    │  server.ts  │
└─────────────┘                    └──────┬──────┘
                                          │
┌─────────────┐     HTTP API       ┌──────▼──────┐
│   控制台     │ ──────────────────► │  API 路由   │
│  /control   │                    │   /api/*    │
└─────────────┘                    └──────┬──────┘
                                          │
┌─────────────┐     HTTP API       ┌──────▼──────┐
│  管理后台    │ ──────────────────► │  核心逻辑   │
│   /admin    │                    │  lib/*.ts   │
└─────────────┘                    └──────┬──────┘
                                          │
                                   ┌──────▼──────┐
                                   │  数据存储   │
                                   │   data/     │
                                   └─────────────┘
```

---

## 部署

### 标准部署

```bash
# 构建
npm run build

# 启动（默认端口 3000）
npm run start

# 指定端口
PORT=8080 npm run start
```

### 打包为独立可执行程序（Windows）

无需目标机器安装 Node.js，打包后双击即可运行：

```bash
npm run pack
```

打包产物位于 `dist/lucky-draw/` 目录：

```
dist/lucky-draw/
├── lucky-draw.bat     # 双击启动
├── data/              # 数据文件（可修改）
├── public/            # 静态资源（可替换背景图等）
└── runtime/           # 运行时（请勿修改）
    ├── node/          # 内置 Node.js 便携版
    ├── .next/         # Next.js 构建产物
    └── server.js      # 生产服务器
```

> 整个 `dist/lucky-draw/` 目录可以直接拷贝到任意 Windows 电脑上使用。


---

## 常见问题

<details>
<summary><b>展示屏和控制台不同步？</b></summary>

检查 WebSocket 连接状态：
1. 确保展示屏页面已正常加载
2. 查看浏览器控制台是否有连接错误
3. 尝试刷新展示屏页面重新建立连接

</details>

<details>
<summary><b>如何修改背景图片？</b></summary>

将新的背景图片放入 `public/` 目录，命名为 `bg.jpg`，然后刷新页面。

</details>

<details>
<summary><b>数据如何备份和恢复？</b></summary>

备份：复制整个 `data/` 目录

恢复：将备份的 `data/` 目录覆盖到项目根目录

</details>

<details>
<summary><b>如何重置所有抽奖数据？</b></summary>

在控制台页面点击「重置」按钮，或删除 `data/lottery-state.json` 文件后重启服务。

</details>

---

## 贡献指南

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送分支 (`git push origin feature/AmazingFeature`)
5. 提交 Pull Request

---

## 开源协议

本项目基于 [MIT License](LICENSE) 开源。

---

<div align="center">

**如果这个项目对你有帮助，欢迎 Star 支持！**



</div>
