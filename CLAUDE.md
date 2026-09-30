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

一键启停（Windows，后台独立进程，不需要留着 cmd 窗口）：

```powershell
powershell -ExecutionPolicy Bypass -File scripts\service.ps1 start|stop|restart|status [-Mode prod|dev] [-Port 3000] [-Rebuild]
```

根目录的 `start.bat` / `start-dev.bat` / `stop.bat` / `restart.bat` / `status.bat` 是它的批处理壳。
`service.ps1` 用 `taskkill /T` 杀整棵进程树（npm → cross-env → tsx → server），
只杀链头会留下占着端口的孤儿进程。

注意：**没有测试框架和 lint 工具**，项目依赖 TypeScript 严格模式进行类型检查。
改完代码至少跑一遍：

```bash
node node_modules/typescript/bin/tsc --noEmit
```

注意项目根目录名不含 `&`，这里可以直接写 `tsc`；但**不要用 `npx tsc`**，理由同另一个项目
（cmd shim 会截断路径）。稳妥起见仍推荐上面的完整 node 调用。

**编码约定（都是会静默出错、必须记住的）**：

- `scripts/service.ps1` **必须保存为带 BOM 的 UTF-8**。Windows PowerShell 5.1 读无 BOM 的
  UTF-8 会按 ANSI 解释，脚本里的中文全部变成「?」。用 Edit 工具改完这个文件后要复查 BOM。
- 根目录的 `.bat` 文件保持 **纯 ASCII**：cmd.exe 按控制台代码页解析批处理，
  UTF-8 中文会乱码。中文提示一律放在 `service.ps1` 里输出。
- 用 PowerShell 读日志/JSON 时显式写 `-Encoding UTF8`，否则中文乱码。

## 架构概览

### 双屏设计

系统采用多界面分离架构：
- **展示屏** (`/`) — 大屏幕显示抽奖动画和中奖号码，通过 WebSocket 接收实时更新
- **控制台** (`/control`) — 管理员操作界面，通过 HTTP API 控制抽奖流程
- **管理后台** (`/admin`) — 配置奖品、用户池、轮次等，tab 式布局（RoundManager / PrizeManager / PoolManager / ConfigPanel）
- **签到页** (`/register`) — 参与者扫码登记
- **嘉宾抽奖页** (`/guest`) — 由嘉宾自己按按钮启动/停止抽奖

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
- `config.json` — 系统配置（参与者字段 schema、号码池规则、字体、颜色、签到设置等）
- `prizes.json` — 轮次、奖品定义与用户池绑定
- `lottery-state.json` — 抽奖运行状态（可用号码、中奖快照、剩余数量）
- `user-pools.json` — 预设用户池及成员名单
- `live-pool.json` — 签到池（开关、已签到人员）

**运行时状态**（`lib/display-state.ts`，Node.js 全局变量）：
- 存储当前展示屏显示状态（当前奖品、是否滚动、中奖号码等）
- 使用深拷贝隔离，防止外部引用意外修改
- **设计原因**：避免文件写入触发 webpack 的 HMR（`next.config.js` 已排除 `data/` 目录的 watch，但运行时状态完全不走文件系统更安全）

### 核心模块

- `lib/lottery.ts` — 抽奖核心逻辑：号码池生成（Fisher-Yates 洗牌）、JSON 文件原子读写、配置管理。Prize / Round / Config 等类型也在此
- `lib/participants.ts` — 参与者字段规范（schema）、成员归一化、文本/CSV 解析、展示文案渲染
- `lib/user-pools.ts` — 预设用户池的读写与归一化
- `lib/pool-members.ts` — **成员级操作**：合并/替换导入、单个成员增删改、改名级联。放在依赖链下游是因为改名要同时改 `live-pool.json` 和 `lottery-state.json`
- `lib/live-pool.ts` — 签到池管理（注册/清空/开关/撤销签到）
- `lib/pool-selection.ts` — 轮次与用户池的绑定关系、概率、可用号码求并集
- `lib/display-state.ts` — 展示屏显示状态管理（内存存储，全局变量 + 深拷贝）
- `lib/display-layout.ts` — 展示屏号码区的版面计算（纯函数，详见下节）
- `lib/csv.ts` — CSV 生成/解析，以及上传文件的编码识别（UTF-8 / GBK / UTF-16）
- `lib/xlsx-read.ts` — xlsx 解析，**仅服务端**（依赖 Node `zlib` 解 deflate）
- `lib/xlsx-write.ts` — xlsx 生成，同构（不依赖 zlib，条目用 stored），浏览器里出模板
- `lib/import-template.ts` — 按参与者字段实时生成导入模板
- `lib/download.ts` — 浏览器下载（文本 / 二进制）。**只碰 DOM**，API 路由不要 import
- `lib/i18n/` — 中英文文案与语言偏好（详见下节）

### Excel 导入（自己实现，没有引第三方表格库）

`xlsx` 的读写是自己写的，理由和取舍写在 `lib/xlsx-write.ts` 顶部：
项目运行时依赖只有 Next / React / ws / typescript，为「导入一份 Excel」引一个 1MB 级、
带一串传递依赖的表格库不划算。**如果你要动这块，先读那两个文件的头部注释，并跑一遍交叉验证**（见 README「验证 xlsx 读写」）：

```bash
uv run --with openpyxl python scripts/xlsx-fixtures.py gen .tmp-xlsx
node --import tsx scripts/xlsx-selftest.ts .tmp-xlsx .tmp-xlsx-out
uv run --with openpyxl python scripts/xlsx-fixtures.py verify .tmp-xlsx-out/template.xlsx
```

三步缺一不可。第三步是拿 openpyxl 反读我们生成的文件 —— **自己读自己写的东西证明不了文件合法**。

几个必须知道的点：

- **读只能跑在服务端**（`lib/xlsx-read.ts` import 了 `zlib`）。Excel 存的条目是 deflate 压缩的，
  自己实现解压不现实；而写模板用的 stored 条目不需要压缩，所以写可以是同构的。
- **解析原则是「宁可报错，不要静默返回半张表」**。遇到 zip64、加密、找不到工作表一律抛
  `XlsxParseError`。名单读错一列是静默事故，现场没人会发现。
- **列必须按单元格引用 `r="E2"` 定位**，不能按出现顺序累加 —— Excel 会省略空单元格。
- **换行要先归一、再解实体**（`decodeXmlText`）。XML 规范要求解析器把文本里的字面 CRLF/CR
  折成 LF；我们用正则绕过了解析器，得自己补。顺序反了会把作者显式写的 `&#13;` 也吃掉。
- **模板的单元格必须套文本格式**（numFmtId 49），否则 Excel 把工号 `0001` 存成数字 `1`。
- `readXlsx` 按 `workbook.xml` 的关系表找工作表，**不能写死 `sheet1.xml`** ——
  文件名编号是创建顺序，拖拽调整过顺序的工作簿会对不上。

CSV 那侧的两个坑：

- 中文 Windows 上 Excel 存 CSV 默认是 **GBK**，按 UTF-8 解会得到一堆问号且**不报错**。
  `decodeTextFile` 的顺序是 BOM → 严格 UTF-8 → GBK 兜底。
- 上传的 CSV 走 `parseDelimitedRows`（RFC 4180，认引号），**粘贴框仍走 `parseMembersFromText`**。
  两者不能合并：粘贴路径要支持「单字段下一行写多个号码、空格分隔」这种手输写法，
  用引号解析会把 `0001 0002` 当成一个单元格。
- `lib/ws-manager.ts` — WebSocket 广播工具函数集合，封装了所有消息类型的发送
- `types/index.ts` — 共享 TypeScript 类型定义

### 展示屏版面（容易被改坏，先读这段）

`lib/display-layout.ts` 决定号码卡片的行列数与字号。**它存在的唯一理由是：
版面绝不允许溢出。** 溢出必然重叠 —— 而 `.main-display` 是 `justify-content:center`，
溢出是上下同时发生的，看起来就是号码糊在奖品信息上。

两个必须理解的约束：

- **卡片宽度由最长展示文本决定**。多字段模板（`{firstname} {companyname} {number}`）
  在字号 38 下要 350px 宽，于是「每行显示数量」配的 10 个根本排不下，行数暴涨。
  所以卡片宽度要换算成「每字号占多少像素」（`getMaxTextVisualWidth(text, 1)`），
  缩放时直接乘，而不是重新量。
- **「每行显示数量」是理想形状，不是硬约束**。线上配的就是 1，抽 30 个人 = 30 行。
  规则是：按它排出来的字号达到配置字号的 `READABLE_RATIO` 就照办；达不到就换成
  「铺满屏幕」的自动网格（扫出放得下的最大字号）。抽 1 人时仍是 1 列 1 行满字号。

改动时的雷区：

- `globals.css` 里 `.main-display` 的 `gap: 30px` 必须和 `display-layout.ts` 的
  `SECTION_GAP` 一致，否则总高算不准。
- `.number-display` 的 `flex: 1 1 auto; min-height: 0` 不能删 —— 默认的
  `min-height: auto` 会让它拒绝收缩到内容以下，溢出就是这么来的。
- 卡片区用 **CSS grid + 算好的列数**，不要改回 `flex-wrap`：一旦让浏览器自己换行，
  多一行少一行都不受控。
- 奖品区缩放用的是 **transform**，靠外层 `.prize-slot` 占位。测量必须用 `offsetHeight`
  （不受 transform 影响），**不要换成 `getBoundingClientRect`** —— 那会让「缩放改变测量值、
  测量值又改变缩放」来回抖。
- `.number-card` 依赖全局 `box-sizing: border-box`，边框才不会撑破算好的卡片尺寸。

改完务必跑：`node --import tsx scripts/layout-selftest.ts`
（覆盖常用分辨率与人数，断言「不溢出」「不漏人」两条硬约束）。

### 国际化（i18n）

没有引入第三方库：文案量在几百条量级，一个扁平字典 + 一个 hook 足够。

- `lib/i18n/dictionary.ts` — `zh` 是母本，`en` 用 `Record<TranslationKey, string>` 声明，**少翻一条就编译报错**
- `lib/i18n/index.ts` — `translate()`、语言偏好读写、`isShippedFieldLabel()`；不依赖 React
- `lib/i18n/useI18n.ts` — `useI18n(scope)` hook，用自定义事件广播语言变化，不用 Context

**两个作用域各自独立持久化**（需求明确要求前后台互不影响）：

| scope | 页面 | localStorage key |
|---|---|---|
| `front` | `/`、`/register`、`/guest` | `lucky-draw-lang-front` |
| `admin` | `/control`、`/admin` | `lucky-draw-lang-admin` |

约定：

- **服务端保持中文**。接口只返回结果码（如 `code: 'duplicate'`），前端按当前语言渲染提示。
  这样后台文案与界面语言解耦。新增接口报错时请沿用这个模式，不要把中文文案硬塞给前端。
- **用户数据不翻译**：参与者字段标签、轮次名、奖品名、用户池名都不进字典。
  唯一例外是出厂自带的 `number` 字段（标签写死为「号码」），由 `isShippedFieldLabel()` 识别后跟随语言。
- 错误提示优先存**文案 key** 而不是翻译好的字符串，这样切换语言时提示会跟着变。
  例：`useState<{ key?: TranslationKey; text?: string } | null>`。
- 不要在 `useCallback` 依赖稳定的地方（如 WebSocket 处理函数）引入 `t`，
  否则切语言会触发重连。把 `t` 用在 JSX 里，或改存 key 到渲染时再翻译。

### API 路由结构

```
/api/admin/config                  - GET/PUT 系统配置
/api/admin/rounds                  - GET/POST 轮次管理
/api/admin/prizes                  - GET/POST 奖品管理
/api/admin/pool                    - GET/POST 号码池（手动设置）
/api/admin/pool/generate           - POST 自动生成号码池
/api/admin/pool/import             - POST 名单导入，body: { csv } 或 { rows }，另有 mode/poolId
/api/admin/pool/parse              - POST 上传 .xlsx/.csv 解析成 rows，form-data: file, sheetIndex
/api/admin/user-pools              - GET/POST 用户池
/api/admin/user-pools/[id]         - PUT/DELETE 用户池（整体替换 members / 改名 / 删除）
/api/admin/user-pools/[id]/members - POST/PUT/DELETE 单个成员（PUT 改唯一字段会级联改名）
/api/admin/checkin                 - DELETE 撤销签到，body: { memberIds }
/api/control/state                 - GET/POST 显示状态（读取/更新+广播）
/api/control/start                 - POST 开始滚动（广播 rolling_start）
/api/control/stop                  - POST 停止并抽取中奖者（核心抽奖逻辑）
/api/control/qrcode                - GET/POST 二维码展示控制
/api/draw                          - POST 执行抽奖（支持 live/preset 两种池）
/api/reset                         - POST 重置状态（全部或单个奖品）
/api/register                      - GET/POST/PUT/DELETE 员工注册（POST 返回 code + 中文 message）
/api/lottery                       - GET 抽奖状态查询
```

### 名单导入与成员维护（易踩坑处）

- 导入的两种模式都**不清空抽奖记录**。旧版「导入即覆盖 + `resetLotteryRecords()`」的行为已移除；
  破坏性操作只保留在「清空用户池」和「重置全部」这两个明示入口。
- 合并模式是**逐字段合并**，只覆盖导入文件中出现的字段。只导入一列工号不会抹掉已有的姓名/电话。
- 导入有两条入口，最终都收敛到 `lib/participants.ts` 的 `buildMembersFromTable`：
  文件走 `rows`（二维数组），粘贴走 `csv`（文本）。**不要为了省事把文件先转成 CSV 文本**，
  那会绕回「单元格里有逗号/换行」的转义问题。
- 「清空用户池」和「删除用户池」都会调用 `resetLotteryRecords()` 清空中奖记录 ——
  这是既有行为，用户在现场误点会丢中奖名单。改动这两个入口前想清楚。
- **改成员的唯一字段 = 改名，必须走级联**（`lib/pool-members.ts`）：
  1. 先写用户池，再 `renameCheckedInMember()` 同步 `live-pool.json`
  2. 最后 `cascadeRenameInLotteryState()` 更新中奖快照的 id / values / displayText

  三处缺一不可。特别是第 1 步的顺序：`getLivePool()` 每次都会用「成员是否还在用户池里」
  过滤签到记录，用常规读写接口做改名会把那条签到**静默丢掉**，
  所以 `renameCheckedInMember()` 直接读写原始文件、不做交叉校验。
- 中奖快照里存了渲染好的 `displayText`，大屏和导出直接用这个字段。
  改名时只改 id 不改 displayText，大屏上会继续显示旧号码。
- 删除成员时**故意不删中奖记录**：奖已经发出去了，删名单不该改写历史。
  副作用是同一 id 之后再加回来仍受 `allWinnerIds` 限制，需要发放就去重置对应奖项。

### 号码池双模式

每个轮次可选择不同的号码池类型（`Round.poolType`）：
- **preset** — 预设号码池，由管理后台生成/导入，存储在 `lottery-state.json`
- **live** — 实时注册池，员工通过 `/register` 页面扫码注册，存储在 `live-pool.json`

## 技术要点

- React 严格模式已禁用 (`reactStrictMode: false`)，避免开发模式下的双重渲染问题
- 使用 `tsx` 运行 TypeScript 服务器，生产模式使用 `server.prod.js`
- 号码池默认排除含 "4" 和 "13" 的数字（文化习俗）
- JSON 文件写入使用**原子操作**（先写 `.tmp` 再 rename），防止进程崩溃导致数据损坏
- 导出的 CSV 必须带 **UTF-8 BOM** 且用 CRLF：否则 Excel 按本地代码页解析，中文姓名和表头全是乱码
- 签到接口返回 `code` + 中文 `message` 两个字段；前端按 `code` 渲染本地化提示，`message` 只作兜底和日志
- `next.config.js` 中 webpack watchOptions 排除了 `data/` 目录，防止 JSON 文件修改触发 HMR
- 输出模式为 `standalone`，支持打包部署
- 环境变量：`PORT`（默认 3000）、`DATA_DIR`（数据目录）、`PUBLIC_DIR`（静态资源目录）
- 背景图片替换：将图片放入 `public/` 目录并命名为 `bg.jpg`
