<div align="center">

# Lucky Draw

**一个现代化、高颜值的实时抽奖系统**

[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://reactjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-24_LTS-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org/)
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
- **中英文双语** - 全站支持中英文切换，且**前台与后台各自独立记忆**（大屏给外籍客户看英文，后台仍是中文，互不影响）
- **高度可配置** - 支持自定义字体大小、颜色、号码池规则、中奖算法等
- **多轮次支持** - 可配置多轮抽奖，每轮包含多个奖项
- **双号码池模式** - 每个轮次可独立选择预设号码池或实时签到池
- **扫码签到** - 控制台一键展示签到二维码，参与者扫码登记工号进入签到池
- **Excel 名单导入** - 直接上传 `.xlsx` / `.csv`，并提供随参与者字段实时生成的填写模板；无需手工转 CSV
- **名单无损导入** - 导入名单可选「合并追加」或「替换名单」，两种模式都不会误清已签到状态；现场临时加人不再需要重建名单
- **成员可维护** - 导入后仍可逐个新增 / 修改 / 删除成员，改名会同步更新签到状态与中奖记录
- **签到名单导出** - 已签到名单一键导出为 CSV（带 BOM，Excel 直接打开不乱码）
- **智能去重** - 支持同奖项去重和跨奖品去重两种模式，已中奖者自动排除
- **可用号码实时提示** - 控制台实时显示当前池的可用号码数，自动限制抽取数量
- **号码池管理** - 灵活的号码生成规则，支持排除特定数字（如 4、13），支持 CSV 导入
- **一键启停** - Windows 下双击 `start.bat` / `stop.bat` 即可后台启停，不需要留一个 cmd 窗口挂着
- **数据持久化** - JSON 文件存储，原子写入防损坏，易于备份和迁移
- **一键部署** - 支持打包为 Windows 独立可执行文件

---

## 快速开始

### 环境要求

- **Node.js** 24 LTS 推荐（最低 20.9.0）
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

### 一键启停（Windows）

不想每次开命令行，可以直接双击根目录下的批处理文件。服务以**独立后台进程**运行，
关掉启动窗口不影响它，不需要留一个 cmd 挂在那里。

| 文件 | 作用 |
|------|------|
| `start.bat` | 启动（生产模式；首次运行会自动执行构建） |
| `start-dev.bat` | 启动（开发模式，改代码即时生效） |
| `stop.bat` | 停止 |
| `restart.bat` | 重启（沿用上一次的模式） |
| `status.bat` | 查看运行状态、端口、PID、已运行时长 |

运行日志写在 `logs/` 目录（`server.log` / `server.err.log`），该目录已在 `.gitignore` 中忽略。

> 命令行等价写法：
> ```powershell
> powershell -ExecutionPolicy Bypass -File scripts\service.ps1 start -Mode prod
> powershell -ExecutionPolicy Bypass -File scripts\service.ps1 stop
> ```
> 支持 `-Port 8080` 指定端口、`-Rebuild` 强制重新构建。

---

## 使用指南

### 1. 初始化配置

首次使用请先访问管理后台 (`/admin`) 进行配置：

1. **轮次管理** - 创建抽奖轮次（如：第一轮、第二轮），选择号码池类型（预设池 / 签到池）
2. **奖品管理** - 为每个轮次添加奖品，设置名称、数量、颜色、赞助商
3. **用户池** - 配置抽奖名单，支持自动生成、批量导入，并可逐个维护成员
4. **系统设置** - 调整参与者字段、字体大小、显示元素等

### 1.1 中英文切换

每个页面的右上角都有「中文 | English」切换开关。**前台和后台的语言是分开保存的**：

| 作用域 | 包含页面 | 存储位置 |
|--------|----------|----------|
| 前台 | 展示屏 `/`、签到页 `/register`、嘉宾抽奖页 `/guest` | 浏览器 `localStorage` 的 `lucky-draw-lang-front` |
| 后台 | 控制台 `/control`、管理后台 `/admin` | 浏览器 `localStorage` 的 `lucky-draw-lang-admin` |

也就是说：把大屏切成英文给外籍客户看，管理后台仍然是中文，反之亦然。

> 说明：参与者字段的名称（如「工号」「First Name」）、轮次名、奖品名、用户池名都属于**你录入的数据**，
> 不随界面语言变化，需要英文就直接在「系统设置 → 参与者字段」里填英文。
> 只有出厂自带的号码字段（`number`）会跟随界面语言显示。

### 2. 名单导入与维护

在「用户池 → 预设池 → 批量导入」里，可以**上传文件**（`.xlsx` / `.csv` / `.txt`），也可以**直接粘贴**文本。

**推荐流程：下载模板 → 填写 → 上传。**

「下载模板」按钮会按当前「参与者字段」配置**实时**生成一个 `.xlsx`：

- 第 1 页「名单」是待填写的表格，只有一行列名，**不带示例数据**（避免示例被当成真人一起导进去）
- 第 2 页「填写说明」列出每个字段的类型、是否必填、是否唯一、可选值等
- 所有单元格预设为**文本格式** —— 否则 Excel 会把工号 `0001` 存成数字 `1`，前导零当场消失

> 模板跟着字段配置走：在「系统设置 → 参与者字段」里加一列、改个名字，重新下载就是新模板。

**文件导入的几个细节：**

| 情况 | 处理 |
|------|------|
| 工作簿有多个工作表 | 解析后会显示页签，可切换读取哪一页（HR 导出的表格常有封面页/说明页） |
| CSV 是 GBK 编码 | 自动识别（中文 Windows 上 Excel 存 CSV 默认就是 GBK） |
| Excel 的「文本（制表符分隔）」导出（UTF-16 + Tab） | 支持 |
| `.xls` 老格式 | 不支持，会提示「另存为 .xlsx」 |
| 单元格里有逗号、引号、换行 | 按 RFC 4180 正确解析，公司名写 `Acme, Inc.` 不会被拆列 |

导入前会显示**解析结果的原始行预览**（前 6 行）。串列是文件导入最典型的失败方式，看一眼就能发现。

选定文件或粘贴内容后，选择导入方式：

| 导入方式 | 行为 | 适用场景 |
|----------|------|----------|
| **合并追加**（默认） | 按唯一字段（工号）比对：已存在则**补全/更新信息**，不存在则追加。**不动任何人的签到状态，也不清空抽奖记录** | 现场临时加入客户、分批次补名单 |
| **替换名单** | 以本次导入的名单为准，名单外的成员会被移除；仍在名单内的已签到人员**保留签到状态** | 名单整体改版 |

两种方式都**不会**清空抽奖记录。需要清空请走「重置全部」或「清空」，这些入口的破坏性是明示的。

> 合并模式下只覆盖导入文件中出现的字段：如果只导入了一列工号，原有成员的姓名、电话不会被抹掉。

导入之后，成员仍然可以逐个维护：

- **新增成员** - 成员预览区右上角的「新增成员」
- **修改信息** - 每行的「编辑」。修改唯一字段（工号）等于改名，系统会**自动同步签到状态和中奖记录**（大屏上的中奖号码也会跟着更新）
- **删除成员** - 每行的「删除」。已中奖的记录不会被抹掉（奖已发出，不该改写历史）

在「用户池 → 签到登记」里，对已签到人员还可以：

- **取消签到** - 只把人移出签到池，仍保留在用户池中（适用于扫错人、重复扫）
- **删除人员** - 从用户池中彻底删除，签到状态一并消失
- **导出签到名单** - 导出为 CSV，含各字段与签到时间；表头跟随当前界面语言，文件带 BOM，Excel 直接打开不乱码

### 3. 号码池模式

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

### 3.1 展示屏的版面规则

展示屏的号码卡片会**自动适配当前屏幕和本次中奖人数**，不会溢出压住奖品信息。

- **「每行显示数量」是理想形状**：只要按它排出来的字号还够看（达到配置字号的 60%），就完全照办。
- 人数多到这个形状装不下时（例如配了每行 1 个、却要一次抽 30 人），会**自动改成铺满屏幕的网格**，
  取放得下的最大字号。你配的字号始终是**上限**，不会被放大。
- 奖品信息区在号码需要空间时会自动缩小（最多缩到 40%），把纵向空间让给号码。

所以现场想让字更大，最直接的办法是**把「每行显示数量」调小**（比如从 10 调到 5）。

### 4. 抽奖流程

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

### 5. 数据管理

所有数据存储在 `data/` 目录：

| 文件 | 说明 |
|------|------|
| `config.json` | 系统配置（参与者字段、字体、颜色、规则等） |
| `prizes.json` | 奖品数据（轮次、奖项、号码池绑定） |
| `lottery-state.json` | 抽奖状态（中奖记录、可用号码） |
| `user-pools.json` | 预设用户池及成员名单 |
| `live-pool.json` | 签到池数据（签到开关、已签到人员） |

> 提示：定期备份 `data/` 目录可防止数据丢失。控制台支持导出中奖记录为文本文件，
> 签到登记支持导出已签到名单为 CSV。

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
| 运行时 | Node.js | 24.x LTS（最低 20.9.0） |

### 目录结构

```
lucky-draw/
├── app/                      # Next.js 应用
│   ├── admin/                # 管理后台
│   │   ├── page.tsx
│   │   └── components/       # RoundManager / PrizeManager / PoolManager
│   │                         # LivePoolManager / MemberEditor / ConfigPanel
│   ├── api/                  # API 路由
│   │   ├── admin/            # 管理接口（config / rounds / prizes / pool / user-pools / checkin）
│   │   │   └── pool/         # 名单：import（合并/替换导入）、parse（xlsx/csv 解析）
│   │   ├── control/          # 控制接口（state / start / stop / qrcode）
│   │   ├── draw/             # 抽奖接口
│   │   ├── register/         # 签到接口
│   │   └── reset/            # 重置接口
│   ├── components/           # 跨页面组件（LanguageSwitch）
│   ├── control/              # 控制台
│   ├── guest/                # 嘉宾抽奖页
│   ├── register/             # 签到页
│   ├── page.tsx              # 展示屏
│   ├── layout.tsx
│   └── globals.css
├── lib/                      # 核心模块
│   ├── lottery.ts            # 抽奖逻辑与号码池
│   ├── participants.ts       # 参与者字段规范与解析
│   ├── user-pools.ts         # 用户池读写
│   ├── pool-members.ts       # 成员级操作（合并/替换导入、增删改、改名级联）
│   ├── live-pool.ts          # 签到池管理
│   ├── pool-selection.ts     # 轮次-用户池绑定与概率
│   ├── display-layout.ts     # 展示屏号码区版面计算（不溢出保证）
│   ├── display-state.ts      # 展示屏状态管理
│   ├── full-state.ts         # 完整状态组装
│   ├── csv.ts                # CSV 生成/解析、上传文件编码识别（UTF-8/GBK/UTF-16）
│   ├── xlsx-read.ts          # xlsx 解析（服务端，Node zlib）
│   ├── xlsx-write.ts         # xlsx 生成（同构，浏览器里出模板）
│   ├── import-template.ts    # 按参与者字段生成导入模板
│   ├── download.ts           # 浏览器下载（文本 / 二进制）
│   ├── i18n/                 # 中英文文案与语言偏好
│   └── ws-manager.ts         # WebSocket 广播
├── scripts/                  # 构建与服务脚本
│   ├── service.ps1           # 后台启停/重启/状态
│   └── build-exe.js          # 打包为独立可执行文件
├── start.bat / stop.bat / restart.bat / status.bat / start-dev.bat
├── types/                    # 类型定义
├── data/                     # 数据存储（JSON 文件）
├── logs/                     # 运行日志（已 gitignore）
├── public/                   # 静态资源（背景图等）
├── server.ts                 # 自定义服务器（集成 WebSocket）
└── package.json
```

### 验证展示屏版面

`lib/display-layout.ts` 是纯数学，改一个系数就可能让卡片在某个分辨率下溢出去压住奖品信息 ——
而那只有在现场投影仪上才会被发现。自检脚本把「不能溢出」「不能漏人」两条硬约束固化下来，
在常用分辨率和人数上跑一遍：

```bash
node --import tsx scripts/layout-selftest.ts
```

### 验证 xlsx 读写

`lib/xlsx-read.ts` / `lib/xlsx-write.ts` 是手写的 xlsx 解析与生成（不依赖第三方表格库），
也是整个项目里最容易「静默出错」的地方 —— 读错一列就是现场一串错号，而且没人会发现。
所以配了一套可复跑的交叉验证，用**独立的第三方实现 openpyxl 当裁判**：

```bash
# 1. 用 openpyxl 生成各种刁钻的夹具（中文/前导零/稀疏列/多工作表/引号逗号换行/尾部空行）
uv run --with openpyxl python scripts/xlsx-fixtures.py gen .tmp-xlsx

# 2. 我们的解析器读这些文件，逐条断言
node --import tsx scripts/xlsx-selftest.ts .tmp-xlsx .tmp-xlsx-out

# 3. 反向验证：用 openpyxl 读我们自己生成的模板，确认产出的文件合法
uv run --with openpyxl python scripts/xlsx-fixtures.py verify .tmp-xlsx-out/template.xlsx
```

第 3 步不能省：自己读自己写的东西，证明不了写出来的文件别人（以及 Excel）认得。

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

无需目标机器安装 Node.js，打包会内置 Node.js 24.16.0 便携版，生成后双击即可运行：

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

<details>
<summary><b>现场临时加人，重新导入名单会不会把已签到的人清掉？</b></summary>

不会。导入时选「合并追加」即可：已存在的人按工号更新信息，新的人追加进来，
**任何人的签到状态都不会受影响，抽奖记录也不会被清空**。这也是导入的默认方式。

如果名单是整体换了一版，可以选「替换名单」：名单外的人会被移出，但仍在名单里的
已签到人员依旧保留签到状态。

</details>

<details>
<summary><b>中文界面下导入的名单，切到英文后字段名还是中文？</b></summary>

界面文案会切换，但**字段名称属于你录入的数据**，不会自动翻译。
如需英文表头，请在「系统设置 → 参与者字段」里把显示名称改成英文
（例如把「工号」改成 `Employee ID`）。签到页、导出 CSV 的表头都会跟着变。

</details>

<details>
<summary><b>双击 start.bat 后窗口一闪而过 / 提示端口被占用？</b></summary>

- `start.bat` 结束时会等待按键，正常情况下能看到启动成功的地址和 PID。
- 如果提示「服务已在运行」，用 `status.bat` 查看详情，或 `restart.bat` 重启。
- 如果 3000 端口被其他程序占用，服务会自动顺延到下一个可用端口，
  `start.bat` 输出的就是真实端口，不会误报。

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
