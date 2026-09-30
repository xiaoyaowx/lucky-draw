/**
 * CSV / 分隔文本处理。
 *
 * 这个文件是纯逻辑，服务端（解析上传的文件）和浏览器（导出）都会用，
 * 所以**不要**在这里 import 任何 DOM 或 Node 专有 API。
 * 浏览器下载请用 lib/download.ts。
 */

/**
 * 生成 CSV 文本（带 UTF-8 BOM）。
 *
 * BOM 不是可选项：Excel 打开不带 BOM 的 UTF-8 CSV 时会按系统本地代码页解析，
 * 中文姓名和表头直接变成乱码。这是导出功能最常见的投诉来源。
 *
 * 行尾用 CRLF，同样是迁就 Excel。
 */
export function buildCsv(rows: string[][]): string {
  const escapeCell = (cell: string) => {
    const value = cell ?? '';
    return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  };

  return '﻿' + rows.map(row => row.map(escapeCell).join(',')).join('\r\n');
}

/**
 * 解析分隔文本为二维数组，遵循 RFC 4180 的引号规则。
 *
 * 分隔符自动判别：Excel 的「CSV（逗号分隔）」用逗号，「文本（制表符分隔）」
 * 用 Tab，用户不一定分得清自己导出的是哪种，与其让他猜，不如自己看一眼。
 * 判据取第一行里出现次数更多的那个。
 *
 * 支持双引号包裹、字段内的逗号与换行、以及 `""` 转义出来的单个引号 ——
 * 这些都不是理论问题：公司名里带逗号（`Acme, Inc.`）非常常见。
 */
export function parseDelimitedRows(input: string): string[][] {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;

  const firstLine = text.split(/\r\n|\r|\n/, 1)[0] ?? '';
  const delimiter = (firstLine.match(/\t/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0)
    ? '\t'
    : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  let index = 0;

  const endCell = () => { row.push(cell); cell = ''; };
  const endRow = () => { endCell(); rows.push(row); row = []; };

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      cell += char;
      index += 1;
      continue;
    }

    if (char === '"' && cell === '') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === delimiter) {
      endCell();
      index += 1;
      continue;
    }
    if (char === '\r') {
      endRow();
      index += text[index + 1] === '\n' ? 2 : 1;
      continue;
    }
    if (char === '\n') {
      endRow();
      index += 1;
      continue;
    }

    cell += char;
    index += 1;
  }

  // 收尾：最后一行没有换行符时也要落袋
  if (cell !== '' || row.length > 0) endRow();

  return rows;
}

/**
 * 把上传文件的字节解成文本。
 *
 * 中文 Windows 上的 Excel 存 CSV 默认用 GBK，直接按 UTF-8 解会得到一堆乱码 ——
 * 而且**不会报错**，用户看到的是一份「读进来了但全是问号」的名单。
 * 所以这里的顺序是：先看 BOM，再严格按 UTF-8 试，失败才退回 GBK。
 */
export function decodeTextFile(buffer: Buffer): string {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf-8');
  }
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(2));
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return new TextDecoder('utf-16be').decode(buffer.subarray(2));
  }

  try {
    // fatal 让非法字节直接抛错，而不是静默替换成 U+FFFD
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder('gbk').decode(buffer);
    } catch {
      // 运行时的 ICU 数据里没有 gbk 时只能有损解码，至少把内容交出去
      return buffer.toString('utf-8');
    }
  }
}
