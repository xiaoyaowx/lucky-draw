import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const runtime = 'nodejs';

function getPublicDir(): string {
  return process.env.PUBLIC_DIR || path.join(process.cwd(), 'public');
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const ext = MIME_TO_EXT[file.type];
    if (!ext) {
      return NextResponse.json(
        { error: 'Invalid file type. Only jpg/png/gif/webp allowed.' },
        { status: 400 }
      );
    }

    // 5MB
    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: 'File too large. Max 5MB.' }, { status: 400 });
    }

    // 确保 prizes 目录存在（并防止 PUBLIC_DIR 被设置为奇怪路径时的穿越）
    const publicRoot = path.resolve(getPublicDir());
    const prizesDir = path.resolve(publicRoot, 'prizes');
    if (!prizesDir.startsWith(publicRoot + path.sep)) {
      return NextResponse.json({ error: 'Invalid public dir' }, { status: 500 });
    }
    if (!fs.existsSync(prizesDir)) {
      fs.mkdirSync(prizesDir, { recursive: true });
    }

    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
    const filePath = path.join(prizesDir, filename);

    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(filePath, buffer);

    return NextResponse.json({ url: `/prizes/${filename}` });
  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
  }
}
