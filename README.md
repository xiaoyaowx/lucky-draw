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

*多屏设计：展示屏显示抽奖动画和中奖号码，控制台用于管理员操作，签到页供参与者扫码登记*

</div>

---

## 功能特性

### 多屏互动架构

| 展示屏 `/` | 控制台 `/control` | 管理后台 `/admin` | 签到页 `/register` |
|:---:|:---:|:---:|:---:|
| 大屏幕沉浸式抽奖动画 | 管理员操作界面 | 系统配置管理 | 参与者扫码签到 |
| 实时滚动号码效果 | 控制抽奖流程 | 奖品/轮次/号码池 | 输入工号即可登记 |
| 中奖庆祝动画 | 查看中奖记录与导出 | 显示样式定制 | 移动端友好 |

### 核心亮点

- **实时同步** - 基于 WebSocket 的毫秒级状态同步，多端显示完全一致
- **高度可配置** - 支持自定义字体大小、颜色、号码池规则、中奖算法等
- **多轮次支持** - 可配置多轮抽奖，每轮包含多个奖项
- **双号码池模式** - 每个轮次可独立选择预设号码池或实时签到池
- **扫码签到** - 控制台一键展示签到二维码，参与者扫码登记工号进入签到池
- **智能去重** - 支持同奖项去重和跨奖品去重两种模式，已中奖者自动排除
- **可用号码实时提示** - 控制台实时显示当前池的可用号码数，自动限制抽取数量
- **号码池管理** - 灵活的号码生成规则，支持排除特定数字（如 4、13），支持 CSV 导入
- **数据持久化** - JSON 文件存储，原子写入防损坏，易于备份和迁移
- **一键部署** - 支持打包为 Windows 独立可执行文件

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
- **签到页**: http://localhost:3000/register

---

## 使用指南

### 1. 初始化配置

首次使用请先访问管理后台 (`/admin`) 进行配置：

1. **轮次管理** - 创建抽奖轮次（如：第一轮、第二轮），选择号码池类型（预设池 / 签到池）
2. **奖品管理** - 为每个轮次添加奖品，设置名称、数量、颜色、赞助商
3. **号码池** - 配置抽奖号码范围，排除不吉利数字，支持 CSV 导入
4. **系统设置** - 调整字体大小、显示元素等

### 2. 号码池模式

每个轮次可独立选择号码池类型：

| 模式 | 说明 | 适用场景 |
|------|------|----------|
| **预设池** | 管理后台预先生成/导入号码范围 | 已知参与人员名单 |
| **签到池** | 参与者现场扫码登记工号 | 现场签到、灵活参与 |

使用签到池时的流程：
1. 在控制台点击「显示签到二维码」，展示屏会显示二维码
2. 参与者用手机扫码，进入签到页输入工号完成登记
3. 关闭二维码后，从签到池中抽取中奖者

> 两种池的中奖去重机制一致：已中奖号码通过全局记录自动排除，不会从池中物理删除。

### 3. 抽奖流程

```
准备阶段
├── 展示屏: 打开 http://localhost:3000 并投放到大屏幕
└── 控制台: 打开 http://localhost:3000/control 用于操作

抽奖阶段
├── 1. 在控制台选择轮次和奖项
├── 2. 设置本次抽取数量（自动限制为可用号码数以内）
├── 3. 点击「开始抽奖」- 展示屏进入滚动模式
└── 4. 点击「停止」- 展示屏定格中奖号码，播放庆祝动画
```

### 4. 数据管理

所有数据存储在 `data/` 目录：

| 文件 | 说明 |
|------|------|
| `config.json` | 系统配置（字体、颜色、规则等） |
| `prizes.json` | 奖品数据（轮次、奖项、号码池类型） |
| `lottery-state.json` | 抽奖状态（中奖记录、号码池） |
| `live-pool.json` | 签到池数据（签到开关、已登记工号） |

> 提示：定期备份 `data/` 目录可防止数据丢失。控制台支持导出中奖记录为文本文件。

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
│   │   └── components/       # 管理组件（RoundManager / PrizeManager / PoolManager / ConfigPanel）
│   ├── api/                  # API 路由
│   │   ├── admin/            # 管理接口（config / rounds / prizes / pool）
│   │   ├── control/          # 控制接口（state / start / stop / qrcode）
│   │   ├── draw/             # 抽奖接口
│   │   ├── register/         # 签到接口
│   │   └── reset/            # 重置接口
│   ├── control/              # 控制台
│   │   └── page.tsx
│   ├── register/             # 签到页
│   │   └── page.tsx
│   ├── page.tsx              # 展示屏
│   ├── layout.tsx
│   └── globals.css
├── lib/                      # 核心模块
│   ├── lottery.ts            # 抽奖逻辑与号码池
│   ├── display-state.ts      # 展示屏状态管理
│   ├── full-state.ts         # 完整状态组装
│   ├── live-pool.ts          # 签到池管理
│   └── ws-manager.ts         # WebSocket 广播
├── types/                    # 类型定义
├── data/                     # 数据存储（JSON 文件）
├── public/                   # 静态资源（背景图等）
├── server.ts                 # 自定义服务器（集成 WebSocket）
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
┌─────────────┐     HTTP API       ┌──────▼──────┐
│   签到页     │ ──────────────────► │  数据存储   │
│  /register  │                    │   data/     │
└─────────────┘                    └─────────────┘
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

<details>
<summary><b>签到池和预设池有什么区别？</b></summary>

- **预设池**：在管理后台预先生成或导入号码，适合已知参与者名单的场景
- **签到池**：参与者现场扫码登记工号，适合需要实时签到的场景

两种池的中奖去重机制完全一致，已中奖号码不会被从池中删除，而是通过全局记录自动排除。每个轮次可以独立选择使用哪种池。

</details>

<details>
<summary><b>控制台显示可用号码为 0？</b></summary>

可能的原因：
1. 号码池尚未生成/导入（预设池），或尚无人签到（签到池）
2. 所有号码都已中奖且未开启"允许重复中奖"
3. 可在管理后台重新生成号码池，或在控制台重置对应奖品

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
