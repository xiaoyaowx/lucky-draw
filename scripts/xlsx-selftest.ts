/**
 * xlsx 读写的自检脚本。
 *
 * 为什么单独有这个文件：`lib/xlsx-read.ts` / `lib/xlsx-write.ts` 是手写的二进制格式解析，
 * 是整个仓库里最容易「静默出错」的地方（读错一列 = 现场一串错号，而且没人会发现）。
 * 项目没有测试框架，所以把验证做成一个可复跑的脚本。
 *
 * 前置：先跑 `scripts/xlsx-fixtures.py gen <目录>` 生成夹具。
 *
 * 用法::
 *
 *     uv run --with openpyxl python scripts/xlsx-fixtures.py gen .tmp-xlsx
 *     node --import tsx scripts/xlsx-selftest.ts .tmp-xlsx .tmp-xlsx-out
 *     uv run --with openpyxl python scripts/xlsx-fixtures.py verify .tmp-xlsx-out/template.xlsx
 *
 * 最后一步是**反向**验证：用第三方库（openpyxl）读我们自己生成的模板，
 * 确认产出的文件是合法 xlsx —— 自己读自己写的东西是证明不了这一点的。
 */

import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { readXlsx } from '../lib/xlsx-read';
import { buildXlsx } from '../lib/xlsx-write';
import { buildImportTemplate } from '../lib/import-template';
import { buildMembersFromTable } from '../lib/participants';
import type { ParticipantSchema } from '../lib/participants';
import { translate } from '../lib/i18n';

const fixtureDir = process.argv[2];
const outDir = process.argv[3] ?? fixtureDir;

if (!fixtureDir) {
  console.error('用法: node --import tsx scripts/xlsx-selftest.ts <夹具目录> [输出目录]');
  console.error('夹具请先用 scripts/xlsx-fixtures.py gen 生成。');
  process.exit(1);
}

const read = (name: string) => readXlsx(fs.readFileSync(path.join(fixtureDir, name)));
const t = (key: Parameters<typeof translate>[0], params?: Record<string, string | number>) =>
  translate(key, 'zh', params);

// 1) 常规：中文、前导零、带逗号的公司名
{
  const sheet = read('basic.xlsx');
  assert.strictEqual(sheet.name, '名单');
  assert.deepStrictEqual(sheet.rows[0], [
    'number', 'firstname', 'lastname', 'phonenumber', 'email', 'title', 'companyname',
  ]);
  assert.strictEqual(sheet.rows[1][0], '0001', '前导零必须保留');
  assert.strictEqual(sheet.rows[1][1], '张三');
  assert.strictEqual(sheet.rows[3][6], 'Acme, Inc.');
  assert.strictEqual(sheet.rows[4][6], 'He said "hi"');
  assert.strictEqual(sheet.rows.length, 5);
  console.log('✓ basic.xlsx  表头 / 中文 / 前导零 / 逗号引号');
}

// 2) 稀疏单元格：必须按 r="E2" 定位到第 5 列，不能按出现顺序累加
{
  const sheet = read('sparse.xlsx');
  assert.deepStrictEqual(sheet.rows[0], ['number', '', '', '', 'companyname']);
  assert.strictEqual(sheet.rows[1][0], '0001');
  assert.strictEqual(sheet.rows[1][4], '只填了第一列和第五列');
  assert.strictEqual(sheet.rows[1][8], '第九列');
  console.log('✓ sparse.xlsx 稀疏列按单元格引用定位');
}

// 3) 工作表顺序按 workbook.xml 的关系表解析，而不是写死 sheet1.xml
{
  const file = fs.readFileSync(path.join(fixtureDir, 'second-sheet.xlsx'));
  const first = readXlsx(file, { sheetIndex: 0 });
  const second = readXlsx(file, { sheetIndex: 1 });
  assert.strictEqual(first.name, '说明');
  assert.strictEqual(second.name, '名单');
  assert.strictEqual(second.rows[2][1], '李四');
  assert.deepStrictEqual(second.sheetNames, ['说明', '名单']);
  console.log('✓ second-sheet.xlsx 工作表顺序与页名');
}

// 4) 数值单元格（Excel 已经把前导零吃掉，这是数据本身的问题，不是解析器的）
{
  const sheet = read('numeric.xlsx');
  assert.strictEqual(sheet.rows[1][0], '1');
  assert.strictEqual(sheet.rows[1][1], '数字工号');
  console.log('✓ numeric.xlsx 数值单元格');
}

// 5) 字段内容里的逗号 / 引号 / 换行不被破坏，且换行归一成 \n（XML 规范要求）
{
  const sheet = read('tricky.xlsx');
  assert.strictEqual(sheet.rows[1][1], 'Acme, Inc.');
  assert.strictEqual(sheet.rows[2][1], 'He said "hi"');
  assert.strictEqual(sheet.rows[3][1], '第一行\n第二行', '字面 CRLF 应归一成 LF');
  console.log('✓ tricky.xlsx 逗号 / 引号 / 换行归一');
}

// 6) 尾部空行被裁掉
{
  const sheet = read('trailing.xlsx');
  assert.strictEqual(sheet.rows.length, 2, `尾部空行应被裁掉，实际 ${sheet.rows.length} 行`);
  console.log('✓ trailing.xlsx 尾部空行裁剪');
}

// 7) 自家 writer → 自家 reader 往返一致（含 XML 转义与换行）
{
  const rows = [
    ['号码', '姓名', '公司'],
    ['0001', '张三', 'A & B <测试>'],
    ['0002', "O'Brien", '第一行\n第二行'],
  ];
  const bytes = buildXlsx([{ name: '名单', rows }]);
  const back = readXlsx(Buffer.from(bytes));
  assert.strictEqual(back.name, '名单');
  assert.deepStrictEqual(back.rows, rows);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'roundtrip.xlsx'), bytes);
  console.log('✓ writer → reader 往返一致');
}

// 8) 模板：按 schema 生成，并落盘交给 openpyxl 反向验证
{
  const schema: ParticipantSchema = {
    schemaVersion: 2,
    uniqueField: 'number',
    displayTemplate: '{firstname} {companyname} {number}',
    fields: [
      { key: 'number', label: '号码', type: 'text', required: true, unique: true, visible: true, searchable: true, mask: 'none' },
      { key: 'firstname', label: '姓名', type: 'text', required: true },
      { key: 'companyname', label: '公司', type: 'text', required: false },
      { key: 'phonenumber', label: '手机号', type: 'phone', required: false, mask: 'phone' },
      { key: 'level', label: '等级', type: 'select', required: false, options: ['VIP', '普通'] },
    ],
  };
  const template = buildImportTemplate(schema, t);
  assert.deepStrictEqual(template.headers, ['号码', '姓名', '公司', '手机号', '等级']);
  assert.strictEqual(template.usedKeys, false);
  assert.strictEqual(template.sheets[0].rows.length, 1, '名单页只能有表头行，不能带示例数据');

  // 唯一字段排第一：万一用户把表头行删了，按位置解析也还是对的
  assert.deepStrictEqual(template.sheets[1].rows.slice(1, 6).map(r => r[0]),
    ['number', 'firstname', 'companyname', 'phonenumber', 'level']);
  assert.strictEqual(template.sheets[1].rows[4][5], '展示时会脱敏隐藏中间四位');
  assert.strictEqual(template.sheets[1].rows[5][5], '可选值：VIP / 普通');

  const bytes = buildXlsx(template.sheets);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'template.xlsx'), bytes);

  const back = readXlsx(Buffer.from(bytes));
  assert.deepStrictEqual(back.rows[0], ['号码', '姓名', '公司', '手机号', '等级']);
  console.log('✓ 模板生成（名单页只有表头、说明页含字段明细）');
}

// 9) 列名有歧义（重名 / 与别的字段 key 冲突）时退回用字段 key
{
  const schema: ParticipantSchema = {
    schemaVersion: 2,
    uniqueField: 'number',
    displayTemplate: '{number}',
    fields: [
      { key: 'number', label: '姓名', type: 'text', required: true },
      { key: 'name', label: '姓名', type: 'text', required: false },
    ],
  };
  const template = buildImportTemplate(schema, t);
  assert.strictEqual(template.usedKeys, true);
  assert.deepStrictEqual(template.headers, ['number', 'name']);
  console.log('✓ 列名有歧义时退回字段 key');
}

// 10) 行式解析：表头大小写不敏感 + 唯一字段去重
{
  const schema: ParticipantSchema = {
    schemaVersion: 2,
    uniqueField: 'number',
    displayTemplate: '{number}',
    fields: [
      { key: 'number', label: '号码', type: 'text', required: true },
      { key: 'firstname', label: '姓名', type: 'text', required: true },
    ],
  };
  const members = buildMembersFromTable(
    [['Number', '姓名'], ['0001', '张三'], ['0001', '重复的'], ['0002', '李四']],
    schema,
    'import',
  );
  assert.strictEqual(members.length, 2, '重复唯一字段应去重');
  assert.strictEqual(members[0].values.firstname, '张三');
  assert.strictEqual(members[1].id, '0002');
  console.log('✓ 行式解析：表头大小写不敏感 + 唯一字段去重');
}

// 11) 单字段 schema 下「一行多个号码」拆成多条（与粘贴文本路径行为一致）
{
  const schema: ParticipantSchema = {
    schemaVersion: 2,
    uniqueField: 'number',
    displayTemplate: '{number}',
    fields: [{ key: 'number', label: '号码', type: 'text', required: true }],
  };
  const members = buildMembersFromTable([['0001', '0002', '0003']], schema, 'import');
  assert.deepStrictEqual(members.map(m => m.id), ['0001', '0002', '0003']);
  console.log('✓ 单字段 schema 下一行多个号码被拆开');
}

// 12) 坏文件必须报错，不能静默返回空表
{
  assert.throws(
    () => readXlsx(Buffer.from('this is definitely not a zip file at all')),
    /not a zip archive/,
  );
  assert.throws(() => readXlsx(Buffer.from([1, 2, 3])), /too small/);
  console.log('✓ 非法输入抛出明确错误');
}

console.log('\n全部通过。');
console.log(`产生的文件在 ${outDir}，可用 openpyxl 反向校验：`);
console.log(`  uv run --with openpyxl python scripts/xlsx-fixtures.py verify ${path.join(outDir, 'template.xlsx')}`);
