/**
 * 按当前参与者字段配置生成导入模板。
 *
 * 模板是**实时**的：管理员在「系统设置 → 参与者字段」里加一列、改个名字，
 * 下载下来的模板立刻跟着变，现场不会出现「照着旧模板填、结果导不进去」。
 *
 * 生成在浏览器端完成（lib/xlsx-write.ts 不依赖 Node），
 * 所以文案直接跟随界面语言，不需要为了一个模板把语言状态传给服务端。
 */

import type { ParticipantSchema, PoolFieldDefinition } from './participants';
import type { XlsxSheet } from './xlsx-write';
import type { TranslationKey } from './i18n/dictionary';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

export interface ImportTemplate {
  sheets: XlsxSheet[];
  /** 名单页用的列名，界面上顺手提示一下用户会看到什么 */
  headers: string[];
  /** 因为列名有歧义而退回了字段标识 */
  usedKeys: boolean;
}

/**
 * 决定模板第一行写什么。
 *
 * 优先用「显示名称」，因为对填表的人友好；但它必须能唯一对应回字段 ——
 * 只要出现「两个字段同名」或「某个字段的名字正好等于另一个字段的 key」，
 * 表头就有歧义，会静默映射到错误的列。这种情况整体退回用字段 key（key 天然唯一）。
 */
function pickHeaderTokens(schema: ParticipantSchema): { tokens: string[]; usedKeys: boolean } {
  const keys = new Set(schema.fields.map(field => field.key.toLowerCase()));
  const labelCount = new Map<string, number>();
  let ambiguous = false;

  schema.fields.forEach((field) => {
    const label = field.label.toLowerCase();
    if (keys.has(label) && label !== field.key.toLowerCase()) ambiguous = true;
    const count = (labelCount.get(label) ?? 0) + 1;
    labelCount.set(label, count);
    if (count > 1) ambiguous = true;
  });

  return ambiguous
    ? { tokens: schema.fields.map(field => field.key), usedKeys: true }
    : { tokens: schema.fields.map(field => field.label), usedKeys: false };
}

const TYPE_KEYS: Record<PoolFieldDefinition['type'], TranslationKey> = {
  text: 'config.typeText',
  number: 'config.typeNumber',
  phone: 'config.typePhone',
  email: 'config.typeEmail',
  select: 'config.typeSelect',
};

function describeField(field: PoolFieldDefinition, t: Translate): string {
  const notes: string[] = [];
  if (field.type === 'select' && field.options && field.options.length > 0) {
    notes.push(t('template.noteOptions', { options: field.options.join(' / ') }));
  }
  if (field.mask === 'phone') {
    notes.push(t('template.noteMask'));
  }
  return notes.join(' · ');
}

/**
 * 字段顺序：唯一字段排第一，其余保持配置顺序。
 *
 * 和导入解析里 `buildDefaultHeaders` 的顺序一致 —— 万一用户把表头行删了，
 * 按位置解析出来的结果也还是对的。
 */
function orderFields(schema: ParticipantSchema): PoolFieldDefinition[] {
  return [
    ...schema.fields.filter(field => field.key === schema.uniqueField),
    ...schema.fields.filter(field => field.key !== schema.uniqueField),
  ];
}

export function buildImportTemplate(schema: ParticipantSchema, t: Translate): ImportTemplate {
  const fields = orderFields(schema);
  const { tokens, usedKeys } = pickHeaderTokens({ ...schema, fields });
  const uniqueLabel = fields.find(field => field.key === schema.uniqueField)?.label ?? schema.uniqueField;

  // 名单页只放表头。刻意不放示例行：示例行极容易被当成真数据一起导进去，
  // 而「多了一个叫 张三 的人」在现场是很难当场发现的。
  const dataSheet: XlsxSheet = {
    name: t('template.sheetData'),
    rows: [tokens],
  };

  const helpRows: string[][] = [
    [
      t('template.colField'),
      t('template.colLabel'),
      t('template.colType'),
      t('template.colRequired'),
      t('template.colUnique'),
      t('template.colNotes'),
    ],
    ...fields.map(field => [
      field.key,
      field.label,
      t(TYPE_KEYS[field.type] ?? 'config.typeText'),
      field.required ? t('template.yes') : t('template.no'),
      field.key === schema.uniqueField ? t('template.yes') : t('template.no'),
      describeField(field, t),
    ]),
    [],
    [t('template.noteHeaderRow')],
    [t('template.noteRequired')],
    [t('template.noteUnique', { field: uniqueLabel })],
    [t('template.noteTextFormat')],
    ...(usedKeys ? [[t('template.noteUsedKeys')]] : []),
    [t('template.noteHelpSheet')],
  ];

  return {
    sheets: [
      dataSheet,
      { name: t('template.sheetHelp'), rows: helpRows },
    ],
    headers: tokens,
    usedKeys,
  };
}
