import { NextRequest, NextResponse } from 'next/server';
import { readXlsx, XlsxParseError } from '@/lib/xlsx-read';
import { decodeTextFile, parseDelimitedRows } from '@/lib/csv';

/** 上传文件大小上限。几百人的名单撑死几百 KB，10MB 是防呆而非真实需求。 */
const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * 把上传的名单文件解析成二维字符串数组。
 *
 * 只做「文件 → 行」这一步，不碰参与者字段规范（那是 /api/admin/pool/import 的事）。
 * 拆成两步是为了让前端能先把解析结果摆出来给人看一眼再导入 ——
 * 名单读错一列是静默事故，必须留一个肉眼检查的环节。
 */
export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'file is required', code: 'noFile' }, { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json({ error: 'empty file', code: 'emptyFile' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'file too large', code: 'fileTooLarge' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const name = file.name.toLowerCase();

    if (name.endsWith('.xlsx')) {
      // 多工作表时由前端指定读哪一页。默认第一个 —— 我们的模板保证名单页在第一页，
      // 但用户自己的表格（比如带封面页的 HR 导出）需要能切换。
      const sheetIndex = Number.parseInt(String(form.get('sheetIndex') ?? '0'), 10);
      const sheet = readXlsx(buffer, {
        sheetIndex: Number.isInteger(sheetIndex) && sheetIndex >= 0 ? sheetIndex : 0,
      });
      return NextResponse.json({
        rows: sheet.rows,
        sheetName: sheet.name,
        sheetNames: sheet.sheetNames,
        kind: 'xlsx',
      });
    }

    if (name.endsWith('.csv') || name.endsWith('.txt')) {
      const rows = parseDelimitedRows(decodeTextFile(buffer));
      return NextResponse.json({ rows, kind: 'text' });
    }

    if (name.endsWith('.xls')) {
      // 老的二进制 xls 是另一套格式（OLE 复合文档），不打算支持。
      // 单独给个错误码，让前端提示「另存为 xlsx」而不是笼统一句解析失败。
      return NextResponse.json({ error: 'legacy xls is not supported', code: 'legacyXls' }, { status: 400 });
    }

    return NextResponse.json({ error: 'unsupported file type', code: 'badType' }, { status: 400 });
  } catch (error) {
    if (error instanceof XlsxParseError) {
      console.error('xlsx parse failed:', error.message);
      return NextResponse.json(
        { error: error.message, code: 'parseFailed' },
        { status: 400 },
      );
    }
    console.error('Error:', error);
    return NextResponse.json({ error: 'Failed to parse file', code: 'error' }, { status: 500 });
  }
}
