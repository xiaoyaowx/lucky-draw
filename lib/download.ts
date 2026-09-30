/**
 * 浏览器端下载工具。
 *
 * 单独成文件是为了和 lib/csv.ts 划清界限：那边是纯文本处理（服务端也要用），
 * 这边只碰 DOM，不能被 API 路由 import。
 */

/** 触发浏览器下载一段文本。 */
export function downloadTextFile(
  filename: string,
  content: string,
  mime = 'text/csv;charset=utf-8',
): void {
  downloadBlob(filename, new Blob([content], { type: mime }));
}

/** 触发浏览器下载一段二进制（例如 xlsx）。 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  // 立刻撤销会让部分浏览器来不及取数据，放到下一轮事件循环更稳
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
