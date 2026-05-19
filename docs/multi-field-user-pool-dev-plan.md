# 多字段用户池二期开发方案

## 1. 背景

当前系统的抽奖对象是一个字符串号码。预设池、签到池、抽奖候选池、中奖记录、大屏滚动、控制台导出都围绕 `string[]` 运转。

现有关键结构：

- `lib/user-pools.ts`：`UserPool.numbers: string[]`
- `lib/live-pool.ts`：`LivePool.registrations: string[]`
- `lib/pool-selection.ts`：`ResolvedPool.numbers: string[]`
- `lib/lottery.ts`：`WinnerInfo.numbers: string[]`、`LotteryState.allWinners?: string[]`
- `lib/display-state.ts`：`winners: string[]`、`rollingPool?: string[]`
- `app/page.tsx`：大屏按字符串渲染号码卡片
- `app/control/page.tsx`：控制台按字符串展示和导出中奖记录

如果直接把字符串拼成 `姓名-号码`，会导致以下问题：

- 去重无法可靠执行。姓名可能重复，展示文本也可能变化。
- 保底名单、已中奖名单、重置奖品等逻辑会和展示格式强耦合。
- 后续增加部门、手机号、公司、桌号等字段时需要再次重构。
- 中奖历史会受用户池字段修改影响，无法保证历史快照稳定。

因此二期的核心目标是把“抽奖唯一身份”和“展示字段”分离。

## 2. 目标

二期完成后，系统支持自定义多字段用户池。最小可用场景仍然是当前的 `号码`，在不配置额外字段时系统行为应与现在保持一致；底层模型同时支持扩展到 `姓名 + 号码`、部门、手机号等更多字段。

必须支持：

- 系统全局配置参与者字段规范，例如：号码、姓名、部门、手机号、公司、桌号。
- 所有预设池、签到池、中奖记录、导入导出都使用同一套全局字段规范。
- 全局可配置唯一字段和展示模板。
- 抽奖去重始终基于稳定唯一键，不基于展示文本。
- 大屏滚动和中奖展示默认显示 `号码`，配置全局展示模板后可显示 `姓名 + 号码` 或其他字段组合。
- 控制台中奖记录和导出包含完整字段快照。
- 签到池按全局字段规范动态登记，不再只支持固定长度工号。
- 旧数据 `numbers: string[]`、`registrations: string[]`、`winnersByPrize.numbers` 可自动兼容读取。
- 当前多用户池、轮次绑定、概率抽取、允许重复中奖、保底名单能力保持可用。

暂不纳入：

- 权限系统。
- 数据库存储。
- 字段级复杂校验表达式。
- 用户池之间的可视化字段映射合并。
- 手机号短信验证或外部身份认证。

## 3. 设计原则

1. 抽奖核心只认 `participantId`。
2. 展示、导出、搜索使用字段快照。
3. 旧数据读入时迁移为新结构，不能破坏现有 JSON 文件。
4. 中奖记录保存当时的字段快照，避免用户池后续修改影响历史结果。
5. API 对外尽量保留旧字段一段时间，降低前端和历史接口一次性改造风险。
6. 字段定义属于全局系统配置，不属于单个用户池。所有池只保存成员数据，并按全局 Schema 校验。
7. 默认唯一字段为 `number`。旧号码池迁移后等价于使用全局 `number` 字段的成员池。
8. 修改全局字段定义属于高影响操作，后台必须提示对所有用户池、签到池、中奖导出和大屏展示同时生效。

## 4. 核心概念

### 4.1 字段定义

```ts
export type PoolFieldType = 'text' | 'number' | 'phone' | 'email' | 'select';

export interface PoolFieldDefinition {
  key: string;
  label: string;
  type: PoolFieldType;
  required: boolean;
  unique?: boolean;
  visible?: boolean;
  searchable?: boolean;
  mask?: 'none' | 'phone';
  options?: string[];
}
```

字段约束：

- `key` 只能使用字母、数字、下划线，建议小写，例如 `number`、`name`、`department`。
- `label` 用于后台表格、签到页表单、导出表头。
- `required` 决定导入和签到时是否必填。
- `unique` 用于提示字段是否可作为唯一字段。实际唯一字段由 `uniqueField` 指定。
- `visible` 决定后台预览和导出默认是否显示。
- `mask` 决定大屏和公开展示时是否脱敏。

默认字段：

```ts
const DEFAULT_PARTICIPANT_FIELDS: PoolFieldDefinition[] = [
  {
    key: 'number',
    label: '号码',
    type: 'text',
    required: true,
    unique: true,
    visible: true,
    searchable: true,
    mask: 'none',
  },
];
```

默认只包含 `number` 字段，确保不做任何配置时仍然是现有的号码抽奖。`name`、`department`、`phone` 等字段由管理员在全局设置中按需添加。

### 4.2 全局参与者字段规范

字段定义、唯一字段、展示模板放在全局配置中。所有用户池和签到池都引用这套规范。

```ts
export interface ParticipantSchema {
  schemaVersion: 2;
  fields: PoolFieldDefinition[];
  uniqueField: string;
  displayTemplate: string;
}

export interface Config {
  allowRepeatWin: boolean;
  numbersPerRow: number;
  numberPoolConfig: NumberPoolConfig;
  participantSchema: ParticipantSchema;

  // 旧签到配置，仅用于兼容旧单字段工号登记。
  registerSettings?: RegisterSettings;
}
```

默认全局规范：

```ts
const DEFAULT_PARTICIPANT_SCHEMA: ParticipantSchema = {
  schemaVersion: 2,
  fields: DEFAULT_PARTICIPANT_FIELDS,
  uniqueField: 'number',
  displayTemplate: '{number}',
};
```

配置约束：

- `uniqueField` 必须存在于 `fields` 中。
- `uniqueField` 对应字段必须 `required: true`。
- 所有池内成员的 `id` 都由 `values[uniqueField]` 归一化生成。
- `displayTemplate` 是全局展示模板，影响大屏、控制台中奖记录和默认导出展示文本。
- 管理员删除字段前必须检查所有池是否存在该字段数据，并给出影响提示。
- 修改 `uniqueField` 前必须检查所有预设池和签到池是否会出现重复 id。

模板示例：

- 默认号码：`{number}`
- 姓名 + 号码：`{name}（{number}）`
- 部门 + 姓名 + 号码：`{department} - {name}（{number}）`

模板规则：

- 只支持 `{fieldKey}` 占位。
- 未命中的字段输出空字符串。
- 模板结果为空时回退到 `id`。
- 公开展示前根据字段 `mask` 执行脱敏。

### 4.3 参与者

```ts
export interface PoolMember {
  id: string;
  values: Record<string, string>;
  createdAt?: number;
  updatedAt?: number;
  source?: 'manual' | 'import' | 'generate' | 'register' | 'migration';
}
```

字段说明：

- `id` 是抽奖唯一键，取全局 `participantSchema.uniqueField` 对应值归一化后的结果。
- `values` 保存用户字段值，所有值统一存字符串。
- `source` 便于后台排查数据来源，不参与抽奖逻辑。

### 4.4 用户池

用户池只保存池身份和成员数据，不保存字段定义。

```ts
export interface UserPool {
  id: string;
  name: string;
  schemaVersion: 2;
  members: PoolMember[];
  createdAt?: number;
  updatedAt?: number;

  // 兼容旧数据，只读归一化时使用，不作为新写入结构。
  numbers?: string[];
}
```

所有池共享全局字段规范的收益：

- 轮次绑定多个池时，字段列天然一致。
- 控制台导出不需要处理不同池字段合并。
- 签到池和预设池可以无缝参与同一轮抽奖。
- 大屏展示模板只配置一次。

### 4.5 抽奖候选项

抽奖时不直接传 `PoolMember`，而是解析为候选项。

```ts
export interface DrawCandidate {
  id: string;
  poolId: string;
  poolName: string;
  probability: number;
  values: Record<string, string>;
  displayText: string;
}
```

`displayText` 由全局 `participantSchema.displayTemplate` 渲染，是大屏滚动和中奖卡片的默认展示文本。

### 4.6 中奖快照

```ts
export interface WinnerSnapshot {
  id: string;
  poolId?: string;
  poolName?: string;
  displayText: string;
  values: Record<string, string>;
  wonAt: number;
}

export interface WinnerInfo {
  level: string;
  name: string;
  winners: WinnerSnapshot[];

  // 兼容旧前端和旧状态文件。新代码读取时应优先使用 winners。
  numbers?: string[];
}
```

中奖记录必须保存 `values` 快照，而不是只保存 `id`。这样即使后台后来把张三改名为张三丰，历史中奖记录仍然显示开奖时的数据。

## 5. 存储格式

### 5.1 `data/config.json`

全局参与者字段规范放在系统配置中。

默认配置示例：

```json
{
  "allowRepeatWin": false,
  "numbersPerRow": 10,
  "participantSchema": {
    "schemaVersion": 2,
    "uniqueField": "number",
    "displayTemplate": "{number}",
    "fields": [
      {
        "key": "number",
        "label": "号码",
        "type": "text",
        "required": true,
        "unique": true,
        "visible": true,
        "searchable": true,
        "mask": "none"
      }
    ]
  }
}
```

扩展到姓名、部门等字段时，在全局设置中追加字段并把展示模板改为 `{name}（{number}）` 等格式。

兼容策略：

- 旧配置没有 `participantSchema` 时，运行时使用默认规范。
- 如果旧配置只有 `registerSettings`，把它解释为 `number` 字段的旧校验设置。
- 新写入配置时保留其他已有配置项，不覆盖奖品、字体、颜色、号码生成规则等设置。

### 5.2 `data/user-pools.json`

默认号码池新格式示例：

```json
{
  "pools": [
    {
      "id": "default",
      "name": "默认预设池",
      "schemaVersion": 2,
      "members": [
        {
          "id": "001",
          "values": {
            "number": "001"
          },
          "source": "import"
        }
      ],
      "createdAt": 1770000000000,
      "updatedAt": 1770000000000
    }
  ]
}
```

说明：

- 用户池不保存字段定义。
- `members[].values` 的 key 必须来自全局 `participantSchema.fields`。
- 如果全局 Schema 新增非必填字段，旧成员可以没有该字段值。
- 如果全局 Schema 新增必填字段，后台保存池成员时必须提示补齐。
- 如果全局 Schema 增加了 `name`、`department`，成员可以扩展为 `{ "number": "001", "name": "张三", "department": "研发部" }`。

### 5.3 `data/live-pool.json`

签到池改为成员对象，同时兼容旧 `registrations`。

```ts
export interface LivePool {
  isOpen: boolean;
  schemaVersion: 2;
  members: PoolMember[];
  clearedAt: number;

  // 兼容旧数据
  registrations?: string[];
}
```

说明：

- 签到池同样不保存字段定义。
- 签到表单从全局 `participantSchema.fields` 生成。
- 清空签到池只清空 `members`，不影响全局字段规范。
- 开启/关闭签到只修改 `isOpen`。

### 5.4 `data/lottery-state.json`

```ts
export interface LotteryState {
  numberPool: string[]; // 兼容旧接口，保存默认池 id 列表
  prizeRemaining: Record<string, number>;
  winnersByPrize: Record<string, WinnerInfo>;
  allWinners?: string[]; // 兼容旧字段
  allWinnerIds?: string[];
}
```

迁移策略：

- 读取状态时，如果只有 `allWinners`，同步视为 `allWinnerIds`。
- 新写入时同时写 `allWinnerIds`。
- `allWinners` 可暂时保留为 `allWinnerIds` 的镜像，等全部前端和接口完成后再删除。

## 6. 兼容和迁移策略

### 6.1 用户池兼容

旧格式：

```json
{
  "id": "default",
  "name": "默认预设池",
  "numbers": ["001", "002"]
}
```

读取时归一化为：

```json
{
  "schemaVersion": 2,
  "members": [
    {
      "id": "001",
      "values": { "number": "001" },
      "source": "migration"
    }
  ]
}
```

### 6.2 签到池兼容

旧格式：

```json
{
  "isOpen": true,
  "registrations": ["G123", "3443"],
  "clearedAt": 1770696712225
}
```

读取时归一化为：

```json
{
  "isOpen": true,
  "schemaVersion": 2,
  "members": [
    {
      "id": "G123",
      "values": { "number": "G123" },
      "source": "migration"
    }
  ],
  "clearedAt": 1770696712225
}
```

这两个兼容转换都依赖全局 `participantSchema`。旧数据的字符串值会写入全局唯一字段，默认是 `number`。

### 6.3 中奖记录兼容

旧格式：

```json
{
  "level": "一等奖",
  "name": "iPhone",
  "numbers": ["001"]
}
```

读取时归一化为：

```json
{
  "level": "一等奖",
  "name": "iPhone",
  "numbers": ["001"],
  "winners": [
    {
      "id": "001",
      "displayText": "001",
      "values": { "number": "001" },
      "wonAt": 0
    }
  ]
}
```

### 6.4 是否需要一次性迁移脚本

建议同时实现两种能力：

1. 运行时归一化：所有读取函数自动兼容旧数据。
2. 管理端保存后写新格式：只要用户池被编辑或导入，就落盘为新格式。

可选增加脚本：

```bash
npx tsx scripts/migrate-participants-v2.ts
```

脚本职责：

- 备份 `data/user-pools.json`、`data/live-pool.json`、`data/lottery-state.json`。
- 将旧格式一次性转为新格式。
- 输出迁移报告：池数量、参与者数量、重复 id 数量、失败记录。

## 7. 抽奖逻辑改造

### 7.1 `lib/pool-selection.ts`

现状：

- `ResolvedPool.numbers: string[]`
- `drawWeightedNumbers()` 返回 `string[]`
- 去重基于号码字符串。

目标：

```ts
export interface ResolvedPool {
  poolId: string;
  name: string;
  probability: number;
  members: DrawCandidate[];
  isLive?: boolean;
}
```

需要改造的函数：

- `resolveRoundPools()`：把用户池和签到池解析为 `DrawCandidate[]`。
- `getAvailablePoolsForRound()`：根据 `winner.id` / `allWinnerIds` 排除已中奖者。
- `getAvailableUnion()`：返回唯一 `DrawCandidate[]`，按 `id` 去重。
- `takeCalibrationNumbers()`：保底名单仍接收唯一字段值，返回 `DrawCandidate[]`。
- `drawWeightedNumbers()`：返回 `DrawCandidate[]`。

重复成员处理：

- 同一轮次绑定多个池时，如果同一 `id` 出现在多个池，默认沿用当前语义：该成员在多个池中出现会获得多个池的抽取机会。
- 一旦该 `id` 中奖，需要从所有池移除该 `id`。
- 后台应在池绑定或导入时给出重复提示，但不强制阻止。

### 7.2 保底名单

当前 `config.calibration?: Record<string, string[]>` 不需要改字段名。

新规则：

- 列表值仍然是唯一字段值，例如号码。
- 匹配时同时尝试原值和兼容补零值，例如 `1` 可匹配 `001`。
- 匹配成功后返回完整 `DrawCandidate`。
- 保存中奖快照时保留全部字段。

### 7.3 允许重复中奖

当前逻辑：

- 当前奖品永远不重复。
- `allowRepeatWin=false` 时跨奖品不重复。

新逻辑：

- 当前奖品排除 `winnersByPrize[prizeId].winners[].id`。
- `allowRepeatWin=false` 时排除 `allWinnerIds`。
- 如果读到旧数据，先从 `numbers` 填充 `winners[].id`。

## 8. API 改造

### 8.1 全局配置接口

#### `GET /api/admin/config`

返回现有配置，并新增：

```ts
{
  config: {
    participantSchema: ParticipantSchema;
  }
}
```

兼容：

- 旧配置没有 `participantSchema` 时，接口返回默认单字段号码规范。
- 默认规范为 `fields=[number]`、`uniqueField=number`、`displayTemplate={number}`。

#### `PUT /api/admin/config`

支持更新全局参与者字段规范：

```ts
{
  participantSchema: ParticipantSchema;
}
```

后端保存前必须校验：

- 字段 key 合法且不重复。
- `uniqueField` 存在且必填。
- `displayTemplate` 中的占位字段存在。
- 切换 `uniqueField` 时，所有用户池和签到池不会产生重复 id。
- 删除字段时，如果已有成员包含该字段值，需要返回影响统计或要求显式确认。

### 8.2 用户池接口

#### `GET /api/admin/user-pools`

返回：

```ts
{
  pools: UserPool[];
  options: Array<{
    id: string;
    name: string;
    count: number;
    isLive?: boolean;
  }>;
}
```

`count` 改为 `members.length`。

#### `POST /api/admin/user-pools`

请求：

```ts
{
  name: string;
  members?: PoolMember[];
}
```

兼容：

```ts
{
  name: string;
  numbers: string[];
}
```

#### `PUT /api/admin/user-pools/:id`

支持：

- 重命名。
- 批量覆盖成员。
- 自动生成号码成员。
- 清空成员。

请求示例：

```ts
{
  members: PoolMember[];
}
```

兼容：

```ts
{
  numbers: string[];
}
```

字段定义、唯一字段、展示模板不在用户池接口中更新，统一通过 `/api/admin/config` 更新全局 `participantSchema`。

### 8.3 旧默认池接口

以下接口应暂时保留：

- `GET /api/admin/pool`
- `POST /api/admin/pool`
- `POST /api/admin/pool/generate`
- `POST /api/admin/pool/import`

兼容行为：

- 返回 `numberPool` 时使用默认池成员的 `id` 列表。
- 接收 `numbers` 时写入默认池 `members`。
- 旧 CSV 导入不带表头时按单列号码处理。

### 8.4 签到接口

#### `GET /api/register`

返回：

```ts
{
  isOpen: boolean;
  count: number;
  fields: PoolFieldDefinition[];
  uniqueField: string;
  displayTemplate: string;
  version: number;

  // 兼容旧页面逻辑
  registerSettings?: {
    length: number;
    allowLetters: boolean;
  };
}
```

#### `POST /api/register`

新请求：

```ts
{
  values: Record<string, string>
}
```

兼容旧请求：

```ts
{
  employeeId: string
}
```

后端校验：

- 必填字段不能为空。
- 唯一字段不能为空。
- 同一签到池内 `id` 不能重复。
- 字段类型执行基础校验：手机号、邮箱、数字。
- 字符串统一 `trim()`，可配置大小写归一化。

### 8.5 控制台状态接口

`GET /api/control/state` 和 WebSocket 状态中新增：

```ts
{
  rollingPool?: DisplayParticipant[];
  winners?: DisplayParticipant[];
  winnersByPrize: Record<string, WinnerInfo>;
}
```

展示对象：

```ts
export interface DisplayParticipant {
  id: string;
  displayText: string;
  values?: Record<string, string>;
}
```

兼容：

- 如果前端仍读取 `numberPool: string[]`，继续返回默认池 id 列表。
- WebSocket `rolling_stop` 可以先同时返回 `winners: string[]` 和 `winnerDetails: DisplayParticipant[]`。

推荐过渡消息：

```ts
{
  type: 'rolling_stop',
  payload: {
    winners: ['001'],
    winnerDetails: [
      {
        id: '001',
        displayText: '张三（001）',
        values: {
          number: '001',
          name: '张三'
        }
      }
    ]
  }
}
```

## 9. 前端改造

### 9.1 全局设置

改造 `app/admin/components/ConfigPanel.tsx`。

需要新增能力：

- 参与者字段配置区：
  - 新增字段。
  - 修改字段 label。
  - 设置必填。
  - 设置是否可搜索。
  - 设置是否公开展示。
  - 设置脱敏类型。
  - 删除非唯一字段。
- 唯一字段选择：
  - 默认 `number`。
  - 只能选择必填字段。
  - 切换唯一字段前检查重复。
- 展示模板：
  - 默认 `{number}`。
  - 输入模板，例如 `{name}（{number}）`。
  - 实时预览示例数据效果。
  - 模板为空或字段不存在时提示。
- 影响提示：
  - 新增必填字段会影响所有用户池和签到登记。
  - 删除字段会影响所有成员数据、导出列和展示模板。
  - 修改唯一字段会重算所有成员 `id`，必须先通过重复校验。

### 9.2 管理后台用户池

改造 `app/admin/components/PoolManager.tsx`。

需要新增能力：

- 按全局字段规范展示成员表格。
- 成员预览：
  - 从号码 chip 列表升级为表格。
  - 支持按可搜索字段搜索。
  - 展示重复 id、缺失必填字段、字段过长等问题。
- 批量导入：
  - 支持 CSV 带表头。
  - 支持粘贴表格文本。
  - 没有表头时按旧单列号码导入。
  - 导入前展示解析结果和错误数量。
- 自动生成：
  - 仅在全局字段为单字段号码时可用。
  - 一旦启用多字段，用户池只能通过 CSV/批量导入维护。
  - 单字段号码场景下生成结果写成 `members`，`values.number = id`。
- 默认场景：
  - 如果全局只有 `number` 字段，界面行为应尽量接近当前号码池管理。
  - 单列号码粘贴、自动生成号码、号码搜索都保持可用。

CSV 示例：

```csv
number,name,department,phone
001,张三,研发部,13800000000
002,李四,市场部,13900000000
```

### 9.3 签到管理

改造 `app/admin/components/LivePoolManager.tsx`。

需要新增能力：

- 预览已签到成员表格。
- 清空签到池只清空成员，不影响全局字段配置。
- 开启/关闭签到时广播新状态。

旧 `registerSettings.length`、`allowLetters` 可以作为 `number` 字段的兼容设置保留一版：

- 如果只有 `number` 字段，仍可显示长度和是否允许字母配置。
- 如果全局配置了多字段，改用动态字段校验。

### 9.4 签到页

改造 `app/register/page.tsx`。

新行为：

- 根据 `/api/register` 返回的 `fields` 动态生成表单。
- 必填字段显示必填状态。
- 提交 `values`。
- 登记成功后本地存储唯一字段 id 和池版本。
- 管理员清空签到池后自动解除本地锁定。

兼容行为：

- 如果服务端没有返回 `fields`，继续使用旧的分格工号输入。
- 如果只有单个 `number` 字段，允许继续使用分格输入样式。

建议二期最终形态：

- 多字段表单优先。
- 单字段号码可保留原分格输入体验。

### 9.5 大屏展示

改造 `app/page.tsx`。

当前：

- `displayNumbers: string[]`
- 卡片内容直接渲染字符串。

目标：

```ts
interface DisplayParticipant {
  id: string;
  displayText: string;
  values?: Record<string, string>;
}
```

渲染策略：

- 滚动时从 `rollingPool: DisplayParticipant[]` 随机选。
- 停止时展示 `winnerDetails`。
- 卡片主文本使用 `displayText`，默认就是号码。
- 若模板包含姓名和号码，卡片可做两行布局：
  - 主行：姓名。
  - 副行：号码。
- 如果无法拆分，直接显示 `displayText`。

尺寸策略：

- 继续保留现有动态宽度和字体缩放。
- 宽度计算基于 `displayText`。
- 字段过长时缩小字体或换行，不能撑破卡片。

### 9.6 控制台

改造 `app/control/page.tsx`。

需要调整：

- 中奖记录从 `numbers.join(', ')` 改为读取 `winners[].displayText`。
- 导出改为 CSV 或带字段表格。
- 状态中的可用数量使用唯一 `id` 数。
- 池详情展示 `pool.name probability count` 保持不变。

导出建议：

```csv
round,level,prize,pool,number,name,department,wonAt
第一轮,一等奖,iPhone,默认预设池,001,张三,研发部,2026-05-16 20:00:00
```

## 10. 新增公共模块建议

建议新增 `lib/participants.ts`，集中处理多字段相关逻辑，避免散落在 API 和页面里。

职责：

- 默认字段定义。
- 字段 key 校验。
- 字段值归一化。
- 旧 `string[]` 到 `PoolMember[]` 的迁移。
- `PoolMember` 到 `DrawCandidate` 的解析。
- 展示模板渲染。
- 脱敏。
- 成员去重。
- 导入解析。
- 中奖快照生成。

建议函数：

```ts
export function normalizeFields(fields: unknown): PoolFieldDefinition[];
export function normalizeMember(raw: unknown, options: NormalizeMemberOptions): PoolMember | null;
export function normalizeMembers(raw: unknown, options: NormalizeMembersOptions): PoolMember[];
export function createMemberFromId(id: string, source?: PoolMember['source']): PoolMember;
export function renderDisplayText(member: PoolMember, schema: ParticipantSchema): string;
export function maskValues(values: Record<string, string>, fields: PoolFieldDefinition[]): Record<string, string>;
export function createWinnerSnapshot(candidate: DrawCandidate): WinnerSnapshot;
export function getLegacyIdsFromMembers(members: PoolMember[]): string[];
```

## 11. 文件改造清单

共享类型：

- `types/index.ts`
- `lib/lottery.ts`
- 新增 `lib/participants.ts`

存储和抽奖：

- `lib/user-pools.ts`
- `lib/live-pool.ts`
- `lib/pool-selection.ts`
- `lib/display-state.ts`
- `lib/full-state.ts`

API：

- `app/api/admin/config/route.ts`
- `app/api/admin/user-pools/route.ts`
- `app/api/admin/user-pools/[id]/route.ts`
- `app/api/admin/pool/route.ts`
- `app/api/admin/pool/generate/route.ts`
- `app/api/admin/pool/import/route.ts`
- `app/api/register/route.ts`
- `app/api/control/start/route.ts`
- `app/api/control/stop/route.ts`
- `app/api/draw/route.ts`
- `app/api/control/state/route.ts`
- `app/api/reset/route.ts`
- `app/api/admin/prizes/[id]/route.ts`

前端：

- `app/admin/components/ConfigPanel.tsx`
- `app/admin/components/PoolManager.tsx`
- `app/admin/components/LivePoolManager.tsx`
- `app/register/page.tsx`
- `app/register/page.css`
- `app/page.tsx`
- `app/control/page.tsx`
- `app/globals.css`

可选脚本：

- `scripts/migrate-participants-v2.ts`
- `scripts/validate-participants-data.ts`

## 12. 实施步骤

### 阶段 1：类型和归一化

目标：

- 新增参与者、字段、中奖快照类型。
- 新增 `lib/participants.ts`。
- `getConfig()` 读取旧配置后补齐默认 `participantSchema`，默认只有 `number` 字段。
- `getUserPools()` 读取旧数据后返回新结构。
- `getLivePool()` 读取旧数据后返回新结构。
- 不改前端页面，保证编译通过。

验收：

- 旧 `data/user-pools.json` 能读。
- 旧 `data/live-pool.json` 能读。
- 旧 `data/config.json` 没有 `participantSchema` 时，默认展示仍为号码。
- 默认池数量不变。
- 没有数据文件被意外清空。

### 阶段 2：抽奖核心

目标：

- `pool-selection` 改为候选对象。
- `control/start` 使用候选对象生成滚动池。
- `control/stop` 和 `draw` 返回中奖快照。
- `lottery-state` 写入 `allWinnerIds` 和 `winnersByPrize[].winners`。
- 兼容旧 `numbers`。

验收：

- 单字段旧号码池能正常抽奖。
- 新增全局 `name` 字段并设置模板后，姓名 + 号码用户池能正常抽奖。
- 不允许重复中奖时，同一 `id` 不会跨奖品再次中奖。
- 重置单个奖品能正确移除中奖 id。
- 保底名单按号码命中；如果全局配置了姓名字段，中奖快照应包含姓名字段。

### 阶段 3：全局字段设置和后台用户池

目标：

- 全局设置 UI 支持字段配置、唯一字段和展示模板。
- 用户池 UI 按全局字段规范展示和编辑成员。
- 成员预览从 chip 改表格。
- CSV 带表头导入。
- 单字段号码场景下，自动生成号码写入成员对象。

验收：

- 默认只有号码字段时，号码池管理体验与当前一致。
- 可以在全局设置新增姓名、部门字段，并设置展示模板。
- 可以创建包含号码、姓名、部门数据的用户池。
- 可以导入 CSV。
- 重复号码会被提示或去重。
- 展示模板预览正确。
- 保存后刷新页面数据不丢失。

### 阶段 4：签到池

目标：

- 签到池按全局字段规范登记和预览。
- 签到页支持动态表单。
- `employeeId` 旧请求仍可用。

验收：

- 只配置号码时，旧登记体验可用。
- 全局配置姓名 + 号码时，用户可以填写两项并登记。
- 重复号码无法登记。
- 清空签到池后用户本地锁定解除。
- 大屏/控制台可实时看到签到人数变化。

### 阶段 5：大屏和控制台展示

目标：

- 大屏滚动展示 `displayText`。
- 中奖停止展示 `displayText`，默认是号码，配置模板后可展示姓名 + 号码。
- 控制台中奖记录展示 `displayText`。
- 导出中奖记录包含字段快照。

验收：

- 滚动期间不卡死、不显示 `[object Object]`。
- 默认配置下中奖后大屏仍显示号码。
- 配置姓名、部门等字段后，控制台导出包含这些字段。
- 手机号字段如配置脱敏，公开展示脱敏，导出按后台策略决定是否脱敏。

### 阶段 6：清理和文档

目标：

- 更新 README 中用户池说明。
- 增加迁移说明。
- 清理已经不用的旧字段依赖。

验收：

- `rg "numbers: string\\[\\]"` 只剩兼容层或明确的 legacy 命名。
- `rg "registrations: string\\[\\]"` 只剩兼容层或明确的 legacy 命名。
- 构建通过。

## 13. 验证清单

### 13.1 数据兼容

- 旧 `config.json` 没有 `participantSchema` 时，系统默认只有号码字段。
- 使用旧 `user-pools.json` 启动，默认池数量正确。
- 使用旧 `live-pool.json` 启动，签到人数正确。
- 使用旧 `lottery-state.json` 启动，中奖记录正确展示。
- 编辑旧默认池并保存后，文件转为新结构。
- 重启服务后新结构仍可读取。

### 13.2 抽奖行为

- 默认单字段号码池抽奖。
- 全局新增姓名字段后的姓名 + 号码池抽奖。
- 多字段池抽奖。
- 多池概率绑定抽奖。
- 同一个 `id` 出现在多个池，中奖后从所有池排除。
- `allowRepeatWin=false` 时跨奖品排除。
- `allowRepeatWin=true` 时不同奖品允许重复，但同一奖品不重复。
- 当前奖品剩余数量正确减少。
- 可用池数量正确。

### 13.3 保底名单

- 保底号码存在时优先命中。
- 保底号码不存在时跳过并继续随机。
- `1` 可兼容命中 `001`。
- 命中后从 `config.calibration` 移除。
- 默认配置下保底中奖快照包含号码；配置扩展字段后包含姓名和其他字段。

### 13.4 后台管理

- 全局设置中默认只有号码字段。
- 全局设置中添加字段。
- 全局设置中删除字段。
- 全局设置中修改唯一字段。
- 全局设置中设置展示模板。
- 创建用户池。
- 修改用户池名称。
- 导入带表头 CSV。
- 导入旧单列号码。
- 单字段号码场景可自动生成号码，多字段场景禁用自动生成。
- 清空用户池。
- 删除非默认用户池。
- 轮次池绑定仍可选择所有预设池和签到池。

### 13.5 签到

- 开启/关闭签到。
- 单字段号码登记。
- 全局新增姓名字段后的姓名 + 号码登记。
- 必填校验。
- 重复唯一字段校验。
- 清空后可重新登记。
- 手机端布局可用。

### 13.6 大屏和控制台

- 未选择奖品时不报错。
- 默认配置下开始抽奖后滚动池显示号码。
- 全局设置展示模板后，滚动池显示模板结果，例如姓名 + 号码。
- 停止后中奖结果显示正确。
- 中奖记录按轮次、奖品展示。
- 导出内容包含字段。
- 字段过长时卡片不溢出。

## 14. 风险和处理

### 14.1 类型改造面广

影响面覆盖核心抽奖、状态广播、后台、签到页和大屏。需要分阶段提交，每个阶段保持旧号码池可用。

处理：

- 先实现归一化兼容层。
- API 返回双字段过渡：旧 `winners` 字符串 + 新 `winnerDetails` 对象。
- 前端逐个页面切换到新结构。

### 14.2 数据文件被自动重写

当前读取函数可能在归一化后自动保存。多字段迁移期间如果立即保存，可能把旧数据转成新格式。

处理：

- 第一阶段读取只归一化内存对象，不自动写盘。
- 只有用户主动保存、导入、清空、迁移脚本执行时才写新结构。
- 迁移脚本先备份。

### 14.3 展示模板错误

用户可能配置 `{姓名}` 或不存在字段。

处理：

- 后台模板编辑时校验占位字段。
- 渲染时空结果回退到 `id`。
- 保存前给出预览。

### 14.4 多池重复成员概率

同一成员可能存在多个池。当前语义下，该成员会拥有多个池的抽取机会。

处理：

- 保持现有语义，避免概率逻辑同时重构。
- 后台给出重复提示。
- 如需强制唯一，可后续增加轮次级策略：`dedupeBeforeWeighting`。

### 14.5 公开展示敏感字段

多字段后可能包含手机号。

处理：

- 字段定义增加 `mask` 和 `visible`。
- 大屏和二维码登记成功页只使用脱敏后的展示值。
- 导出是否脱敏单独由后台导出逻辑控制。

## 15. 推荐提交边界

建议拆成 5 个提交：

1. `feat: add global participant schema and storage normalization`
2. `feat: draw winners as participant snapshots`
3. `feat: support global-schema preset pools`
4. `feat: support global-schema live registration`
5. `feat: render and export participant winner details`

每个提交都需要保证：

- 旧号码池能继续抽奖。
- `npm run build` 通过。
- 不回滚用户已有 data 文件。

## 16. 最终验收标准

功能验收：

- 默认不配置额外字段时，系统仍按当前 `号码` 抽奖完整可用。
- 后台全局设置可新增 `姓名`、`部门` 字段，并设置展示模板。
- 后台可创建包含号码、姓名、部门数据的用户池。
- CSV 导入后能在后台表格预览。
- 轮次可绑定该用户池并抽奖。
- 默认大屏滚动和中奖结果显示号码。
- 配置展示模板后，大屏滚动和中奖结果可显示 `姓名（号码）`。
- 默认导出包含号码，配置扩展字段后导出包含号码、姓名、部门。
- 签到池按全局字段登记；默认只填号码，配置姓名字段后可填写姓名 + 号码。
- 旧号码池数据无需人工迁移即可继续使用。

技术验收：

- 抽奖去重基于 `id`。
- 中奖记录保存字段快照。
- 保底名单兼容唯一号码。
- 旧接口的 `numberPool`、`winners`、`numbers` 在过渡期不失效。
- 构建通过。
