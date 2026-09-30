/**
 * 极简 xlsx 生成器（同构：浏览器和 Node 都能跑）。
 *
 * 为什么不用第三方表格库：本项目运行时依赖只有 Next / React / ws / typescript，
 * 为了「导出一个模板」引一个 1MB 级、带一长串传递依赖的表格库不划算。
 * 这里只覆盖真正用得到的子集 —— 若干行纯文本单元格。
 *
 * 几个刻意的选择：
 *
 * * **单元格一律用内联字符串**（`t="inlineStr"`）而不是共享字符串表。
 *   省掉 sharedStrings.xml 这一整个部件，而模板本身行数很少，共享字符串带来的
 *   体积收益为零。
 *
 * * **所有单元格套用文本格式**（numFmtId=49，即 "@"）。
 *   这是刚需：工号 `0001` 如果是「常规」格式，Excel 会把它存成数字 1，
 *   前导零当场消失，导入进来就是一串错号。宁可让用户看到单元格左上角的绿色小三角。
 *
 * * **ZIP 条目用 stored（不压缩）**。
 *   压缩要在浏览器里实现 deflate，得不偿失；模板撑死几十 KB，压不压无所谓，
 *   而 stored 的 ZIP 结构简单到不会写错。代价是读的时候必须支持 deflate ——
 *   见 lib/xlsx-read.ts（那边跑在 Node，直接用 zlib）。
 *
 * * **时间戳写死**。生成结果因此是确定性的，便于比对和测试。
 */

// ── CRC32 ─────────────────────────────────────────────────────────────

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < data.length; i += 1) {
    c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

// ── XML 工具 ──────────────────────────────────────────────────────────

/** XML 文本节点转义。& 必须第一个换，否则后面替换出的 & 会被二次转义。 */
export function escapeXml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
    // xlsx 的 XML 不允许这些控制字符，混进去会让 Excel 直接报「文件损坏」
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');
}

/** 0 → A、25 → Z、26 → AA */
export function columnName(index: number): string {
  let name = '';
  let n = index;
  do {
    name = String.fromCharCode(65 + (n % 26)) + name;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return name;
}

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

// ── ZIP（stored） ─────────────────────────────────────────────────────

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

// 2020-01-01 00:00，写死以保证输出可复现
const DOS_DATE = ((2020 - 1980) << 9) | (1 << 5) | 1;
const DOS_TIME = 0;
// bit 11 = 文件名按 UTF-8 编码（模板里会有中文列名）
const FLAG_UTF8 = 0x0800;

// 返回类型写成 Uint8Array<ArrayBuffer> 而不是裸 Uint8Array：
// 后者在 TS 5.7+ 里是 Uint8Array<ArrayBufferLike>，无法直接丢给 Blob 构造函数。
function buildZip(entries: ZipEntry[]): Uint8Array<ArrayBuffer> {
  const encoder = new TextEncoder();

  const encoded = entries.map(entry => ({
    nameBytes: encoder.encode(entry.name),
    data: entry.data,
    crc: crc32(entry.data),
  }));

  const localSize = encoded.reduce(
    (sum, item) => sum + 30 + item.nameBytes.length + item.data.length,
    0,
  );
  const centralSize = encoded.reduce(
    (sum, item) => sum + 46 + item.nameBytes.length,
    0,
  );
  const total = localSize + centralSize + 22;

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let offset = 0;

  // 本地文件头 + 数据
  const localOffsets: number[] = [];
  encoded.forEach((item) => {
    localOffsets.push(offset);
    view.setUint32(offset, 0x04034b50, true);
    view.setUint16(offset + 4, 20, true);            // version needed
    view.setUint16(offset + 6, FLAG_UTF8, true);
    view.setUint16(offset + 8, 0, true);             // method = stored
    view.setUint16(offset + 10, DOS_TIME, true);
    view.setUint16(offset + 12, DOS_DATE, true);
    view.setUint32(offset + 14, item.crc, true);
    view.setUint32(offset + 18, item.data.length, true);
    view.setUint32(offset + 22, item.data.length, true);
    view.setUint16(offset + 26, item.nameBytes.length, true);
    view.setUint16(offset + 28, 0, true);            // extra length
    offset += 30;
    out.set(item.nameBytes, offset);
    offset += item.nameBytes.length;
    out.set(item.data, offset);
    offset += item.data.length;
  });

  // 中央目录
  const centralOffset = offset;
  encoded.forEach((item, index) => {
    view.setUint32(offset, 0x02014b50, true);
    view.setUint16(offset + 4, 20, true);            // version made by
    view.setUint16(offset + 6, 20, true);            // version needed
    view.setUint16(offset + 8, FLAG_UTF8, true);
    view.setUint16(offset + 10, 0, true);            // method
    view.setUint16(offset + 12, DOS_TIME, true);
    view.setUint16(offset + 14, DOS_DATE, true);
    view.setUint32(offset + 16, item.crc, true);
    view.setUint32(offset + 20, item.data.length, true);
    view.setUint32(offset + 24, item.data.length, true);
    view.setUint16(offset + 28, item.nameBytes.length, true);
    view.setUint16(offset + 30, 0, true);            // extra
    view.setUint16(offset + 32, 0, true);            // comment
    view.setUint16(offset + 34, 0, true);            // disk number
    view.setUint16(offset + 36, 0, true);            // internal attrs
    view.setUint32(offset + 38, 0, true);            // external attrs
    view.setUint32(offset + 42, localOffsets[index], true);
    offset += 46;
    out.set(item.nameBytes, offset);
    offset += item.nameBytes.length;
  });

  // 中央目录结束记录
  view.setUint32(offset, 0x06054b50, true);
  view.setUint16(offset + 4, 0, true);
  view.setUint16(offset + 6, 0, true);
  view.setUint16(offset + 8, encoded.length, true);
  view.setUint16(offset + 10, encoded.length, true);
  view.setUint32(offset + 12, centralSize, true);
  view.setUint32(offset + 16, centralOffset, true);
  view.setUint16(offset + 20, 0, true);

  return out;
}

// ── xlsx ──────────────────────────────────────────────────────────────

export interface XlsxSheet {
  name: string;
  rows: string[][];
}

/** Excel 对工作表名的限制：最长 31 字符，且不能包含这些符号。 */
function sanitizeSheetName(name: string, fallback: string): string {
  const cleaned = String(name || '')
    .replace(/[[\]:*?/\\]/g, ' ')
    .trim()
    .slice(0, 31);
  return cleaned || fallback;
}

/** 估算列宽：中文按 2 个字符宽度算，再留点余量。 */
function estimateColumnWidth(rows: string[][], columnIndex: number): number {
  let widest = 0;
  rows.forEach((row) => {
    const cell = row[columnIndex] ?? '';
    let width = 0;
    for (const char of cell) {
      width += char.charCodeAt(0) > 0x2e7f ? 2 : 1;
    }
    widest = Math.max(widest, width);
  });
  return Math.min(60, Math.max(8, widest + 2));
}

function buildSheetXml(rows: string[][]): string {
  const columnCount = rows.reduce((max, row) => Math.max(max, row.length), 0);

  const cols = columnCount > 0
    ? `<cols>${Array.from({ length: columnCount }, (_, index) =>
      `<col min="${index + 1}" max="${index + 1}" width="${estimateColumnWidth(rows, index)}" customWidth="1"/>`,
    ).join('')}</cols>`
    : '';

  const sheetData = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      // 空单元格直接省略，Excel 会当成空串
      if (value === '') return '';
      return `<c r="${ref}" s="1" t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  return `${XML_HEADER}<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${sheetData}</sheetData></worksheet>`;
}

function buildStylesXml(): string {
  // s="0" 常规、s="1" 文本（numFmtId 49 是内置的 "@"）
  //
  // cellStyles / dxfs / tableStyles 这三段对渲染没有影响，但缺了它们
  // 部分读取器（openpyxl 就会）会报「没有默认样式」。
  // 既然 Excel 自己写出来的 styleSheet 都带这些，照着补齐最省事。
  return `${XML_HEADER}<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`
    + '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>'
    + '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>'
    + '<borders count="1"><border/></borders>'
    + '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
    + '<cellXfs count="2">'
    + '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
    + '<xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>'
    + '</cellXfs>'
    + '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
    + '<dxfs count="0"/>'
    + '<tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>'
    + '</styleSheet>';
}

/**
 * 生成一个 .xlsx 文件。
 *
 * @returns 文件字节，可直接丢给 Blob 或写盘
 */
export function buildXlsx(sheets: XlsxSheet[]): Uint8Array<ArrayBuffer> {
  if (sheets.length === 0) {
    throw new Error('buildXlsx: at least one sheet is required');
  }

  const names = sheets.map((sheet, index) =>
    sanitizeSheetName(sheet.name, `Sheet${index + 1}`),
  );

  const contentTypes = `${XML_HEADER}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">`
    + '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    + '<Default Extension="xml" ContentType="application/xml"/>'
    + '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
    + sheets.map((_, index) =>
      `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    ).join('')
    + '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
    + '</Types>';

  const rootRels = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
    + '</Relationships>';

  // 工作表的 rId 从 1 开始，样式表接在最后，避免 id 撞车
  const stylesRelId = `rId${sheets.length + 1}`;
  const workbook = `${XML_HEADER}<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">`
    + `<sheets>${sheets.map((_, index) =>
      `<sheet name="${escapeXml(names[index])}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`,
    ).join('')}</sheets>`
    + '</workbook>';

  const workbookRels = `${XML_HEADER}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`
    + sheets.map((_, index) =>
      `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`,
    ).join('')
    + `<Relationship Id="${stylesRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>`
    + '</Relationships>';

  // 条目顺序不影响正确性，但按惯例把 [Content_Types].xml 放最前
  const entries: ZipEntry[] = [
    { name: '[Content_Types].xml', data: new TextEncoder().encode(contentTypes) },
    { name: '_rels/.rels', data: new TextEncoder().encode(rootRels) },
    { name: 'xl/workbook.xml', data: new TextEncoder().encode(workbook) },
    { name: 'xl/_rels/workbook.xml.rels', data: new TextEncoder().encode(workbookRels) },
    { name: 'xl/styles.xml', data: new TextEncoder().encode(buildStylesXml()) },
    ...sheets.map((sheet, index) => ({
      name: `xl/worksheets/sheet${index + 1}.xml`,
      data: new TextEncoder().encode(buildSheetXml(sheet.rows)),
    })),
  ];

  return buildZip(entries);
}
