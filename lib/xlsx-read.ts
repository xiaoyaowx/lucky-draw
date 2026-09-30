/**
 * 极简 xlsx 读取器（**仅服务端**：依赖 Node 的 zlib）。
 *
 * 只做一件事：把一个 .xlsx 的某个工作表读成字符串网格 `string[][]`。
 * 解析出来的网格随后交给 lib/participants.ts 的 buildMembersFromTable 处理。
 *
 * 为什么不用第三方表格库见 lib/xlsx-write.ts 顶部说明。这里额外多一条：
 * 读取端必须支持 deflate —— Excel 保存的 xlsx 条目是压缩的，而 Node 自带 zlib，
 * 所以这个文件只能在服务端跑，不要 import 进客户端组件。
 *
 * 设计原则：**宁可报错，不要静默返回半张表**。
 * 导入名单读错一列，现场就是一串错号，而且没人会发现。所以凡是遇到
 * 解释不了的结构（zip64、加密、找不到工作表），一律抛出带原因的异常。
 */

import { inflateRawSync } from 'zlib';

export class XlsxParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'XlsxParseError';
  }
}

// ── ZIP ───────────────────────────────────────────────────────────────

interface ZipEntryMeta {
  name: string;
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;

/**
 * 定位中央目录结束记录（EOCD）。
 *
 * 从文件尾部往前找：EOCD 后面只可能跟着一段长度不超过 65535 的注释，
 * 所以搜索窗口是「末尾 22 字节」到「末尾 22 + 65535 字节」。
 * 从后往前找而不是从前往后，是为了跳过数据里恰好出现同样字节序列的巧合。
 */
function findEocd(view: DataView): number {
  const minOffset = Math.max(0, view.byteLength - 22 - 0xffff);
  for (let offset = view.byteLength - 22; offset >= minOffset; offset -= 1) {
    if (view.getUint32(offset, true) === EOCD_SIGNATURE) return offset;
  }
  throw new XlsxParseError('not a zip archive (EOCD not found)');
}

function readCentralDirectory(buffer: Buffer): Map<string, ZipEntryMeta> {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const eocd = findEocd(view);

  const entryCount = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);

  const entries = new Map<string, ZipEntryMeta>();
  const decoder = new TextDecoder('utf-8');

  for (let i = 0; i < entryCount; i += 1) {
    if (offset + 46 > buffer.length || view.getUint32(offset, true) !== CENTRAL_SIGNATURE) {
      throw new XlsxParseError('corrupted zip central directory');
    }

    const method = view.getUint16(offset + 10, true);
    // 压缩后大小为 0xFFFFFFFF 表示真正的长度放在 zip64 扩展字段里。
    // Excel 存几百行的名单远达不到 4GB，遇到就说明文件不正常，直接报错。
    const compressedSize = view.getUint32(offset + 20, true);
    if (compressedSize === 0xffffffff) {
      throw new XlsxParseError('zip64 archives are not supported');
    }

    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);

    const name = decoder.decode(buffer.subarray(offset + 46, offset + 46 + nameLength));
    entries.set(name, { name, method, compressedSize, localHeaderOffset });

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * 取出条目的内容。
 *
 * 数据起始位置必须重新读一遍**本地**文件头，而不是复用中央目录里的长度：
 * 本地头的「文件名长度 / 扩展字段长度」和中央目录里的未必相同，
 * Excel 就经常在本地头里多塞一段扩展字段。
 */
function readEntry(buffer: Buffer, meta: ZipEntryMeta): Buffer {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const offset = meta.localHeaderOffset;

  if (offset + 30 > buffer.length || view.getUint32(offset, true) !== LOCAL_SIGNATURE) {
    throw new XlsxParseError(`corrupted local header for ${meta.name}`);
  }

  const nameLength = view.getUint16(offset + 26, true);
  const extraLength = view.getUint16(offset + 28, true);
  const start = offset + 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + meta.compressedSize);

  if (meta.method === 0) return data;
  if (meta.method === 8) return inflateRawSync(data);
  throw new XlsxParseError(`unsupported zip compression method ${meta.method} in ${meta.name}`);
}

// ── XML ───────────────────────────────────────────────────────────────

const XML_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeXmlEntities(value: string): string {
  return value.replace(/&(#x?[0-9a-fA-F]+|\w+);/g, (match, entity: string) => {
    if (entity.startsWith('#x') || entity.startsWith('#X')) {
      const code = Number.parseInt(entity.slice(2), 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    if (entity.startsWith('#')) {
      const code = Number.parseInt(entity.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : match;
    }
    return XML_ENTITIES[entity] ?? match;
  });
}

/**
 * 解开一段 XML 文本节点的内容。
 *
 * 顺序有讲究：**先做换行归一，再解实体**。
 * XML 规范要求解析器把文本里的字面 CRLF / CR 统一成 LF —— 这是解析器的职责，
 * 而我们用正则绕过了解析器，得自己补上，否则单元格里的换行会带着 `\r` 进来。
 * 归一必须在解实体之前做：`&#13;` 是作者显式写下的回车，解出来之后应原样保留，
 * 不能被当成字面 CRLF 一起折叠掉。
 */
function decodeXmlText(raw: string): string {
  return decodeXmlEntities(raw.replace(/\r\n?/g, '\n'));
}

/** 取出片段里所有 <t> 文本并拼接（富文本会拆成多个 run）。 */
function extractTextRuns(fragment: string): string {
  let text = '';
  const runRe = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
  let match: RegExpExecArray | null;
  while ((match = runRe.exec(fragment))) {
    text += decodeXmlText(match[1]);
  }
  return text;
}

function extractTag(fragment: string, tag: string): string | null {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`).exec(fragment);
  return match ? match[1] : null;
}

/**
 * 共享字符串表。
 *
 * `<rPh>` 是日文的注音提示，不是单元格内容，必须先剔掉再取 `<t>`，
 * 否则会在姓名里混进读音。
 */
function parseSharedStrings(xml: string): string[] {
  const strings: string[] = [];
  const siRe = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let match: RegExpExecArray | null;
  while ((match = siRe.exec(xml))) {
    const body = match[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
    strings.push(extractTextRuns(body));
  }
  return strings;
}

/** "AB12" → 列号 27（0 基）。 */
function columnIndexFromRef(ref: string): number {
  const letters = /^([A-Z]+)/.exec(ref)?.[1];
  if (!letters) return -1;
  let index = 0;
  for (const char of letters) {
    index = index * 26 + (char.charCodeAt(0) - 64);
  }
  return index - 1;
}

function readCellValue(type: string | undefined, body: string, sharedStrings: string[]): string {
  if (type === 's') {
    const raw = extractTag(body, 'v');
    if (raw === null) return '';
    const index = Number.parseInt(raw, 10);
    return Number.isInteger(index) ? (sharedStrings[index] ?? '') : '';
  }

  if (type === 'inlineStr') {
    const inline = extractTag(body, 'is');
    return inline === null ? '' : extractTextRuns(inline);
  }

  if (type === 'b') {
    return extractTag(body, 'v') === '1' ? 'TRUE' : 'FALSE';
  }

  // 公式错误值（#N/A 之类）当空处理，免得把错误码当成数据导进去
  if (type === 'e') return '';

  // t 缺省或 "n"（数字）/ "str"（公式的字符串结果）：直接取 <v>
  const raw = extractTag(body, 'v');
  return raw === null ? '' : decodeXmlText(raw);
}

// ── 工作表 ────────────────────────────────────────────────────────────

export interface XlsxSheetData {
  name: string;
  rows: string[][];
  /** 工作簿里所有工作表的名字，按显示顺序。前端据此让用户选读哪一页。 */
  sheetNames: string[];
}

/**
 * 按工作簿里声明的顺序列出工作表。
 *
 * 不能想当然地用 `xl/worksheets/sheet1.xml`：`sheetN.xml` 的编号是**创建顺序**，
 * 而工作簿里第一个工作表未必是第一个创建的（拖拽调整顺序就会出现这种情况）。
 */
function resolveSheets(
  entries: Map<string, ZipEntryMeta>,
  workbookXml: string,
  readText: (name: string) => string,
): { path: string; name: string }[] {
  const relTargets = new Map<string, string>();
  if (entries.has('xl/_rels/workbook.xml.rels')) {
    const relsXml = readText('xl/_rels/workbook.xml.rels');
    const relRe = /<Relationship\b([^>]*)\/?>/g;
    let relMatch: RegExpExecArray | null;
    while ((relMatch = relRe.exec(relsXml))) {
      const attrs = relMatch[1];
      const id = /\bId="([^"]+)"/.exec(attrs)?.[1];
      const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
      if (id && target) {
        // Target 可能是 "worksheets/sheet1.xml"，也可能是 "/xl/worksheets/sheet1.xml"
        relTargets.set(id, target.replace(/^\//, '').replace(/^xl\//, ''));
      }
    }
  }

  const sheets: { path: string; name: string }[] = [];
  const sheetRe = /<sheet\b([^>]*)\/?>/g;
  let sheetMatch: RegExpExecArray | null;
  while ((sheetMatch = sheetRe.exec(workbookXml))) {
    const attrs = sheetMatch[1];
    const relId = /\br:id="([^"]+)"/.exec(attrs)?.[1];
    const name = /\bname="([^"]*)"/.exec(attrs)?.[1];
    const target = relId ? relTargets.get(relId) : undefined;
    if (target) {
      sheets.push({ path: `xl/${target}`, name: decodeXmlEntities(name ?? '') });
    }
  }

  if (sheets.length === 0) {
    // 兜底：关系表缺失时按文件名排序取，名字只能靠猜
    [...entries.keys()]
      .filter(name => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))
      .sort()
      .forEach((path, index) => sheets.push({ path, name: `Sheet${index + 1}` }));
  }

  return sheets;
}

function parseSheetXml(xml: string, sharedStrings: string[]): string[][] {
  const rows: string[][] = [];
  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRe.exec(xml))) {
    const body = rowMatch[2] ?? '';
    const cells: string[] = [];
    let cursor = 0;

    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(body))) {
      const attrs = cellMatch[1] ?? '';
      const cellBody = cellMatch[2] ?? '';

      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      if (ref) {
        const index = columnIndexFromRef(ref);
        if (index >= 0) cursor = index;
      }

      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      cells[cursor] = readCellValue(type, cellBody, sharedStrings);
      cursor += 1;
    }

    rows.push(Array.from({ length: cells.length }, (_, index) => cells[index] ?? ''));
  }

  return rows;
}

// ── 对外接口 ──────────────────────────────────────────────────────────

export interface ReadXlsxOptions {
  /** 取第几个工作表，默认 0（工作簿里的第一个） */
  sheetIndex?: number;
}

/**
 * 读取 xlsx，返回 `[行][列]` 的字符串网格。
 *
 * 尾部整行为空的行会被去掉 —— Excel 经常在数据下面留一堆空行，
 * 留着会让「共 N 行」的提示虚高。
 */
export function readXlsx(buffer: Buffer, options: ReadXlsxOptions = {}): XlsxSheetData {
  if (buffer.length < 22) {
    throw new XlsxParseError('file is too small to be an xlsx');
  }

  const entries = readCentralDirectory(buffer);

  const readText = (name: string): string => {
    const meta = entries.get(name);
    if (!meta) throw new XlsxParseError(`missing part: ${name}`);
    return readEntry(buffer, meta).toString('utf-8');
  };

  const workbookXml = readText('xl/workbook.xml');
  const sheets = resolveSheets(entries, workbookXml, readText);

  const index = options.sheetIndex ?? 0;
  if (sheets.length === 0) {
    throw new XlsxParseError('no worksheet found in workbook');
  }
  if (index >= sheets.length) {
    throw new XlsxParseError(`worksheet index ${index} out of range (found ${sheets.length})`);
  }

  const sheetXml = readText(sheets[index].path);
  const sharedStrings = entries.has('xl/sharedStrings.xml')
    ? parseSharedStrings(readText('xl/sharedStrings.xml'))
    : [];

  const rows = parseSheetXml(sheetXml, sharedStrings);

  // Excel 常在数据下面留一堆空行，留着会让「共 N 行」虚高
  let end = rows.length;
  while (end > 0 && rows[end - 1].every(cell => cell === '')) end -= 1;

  return {
    name: sheets[index].name,
    rows: rows.slice(0, end),
    sheetNames: sheets.map(sheet => sheet.name),
  };
}
