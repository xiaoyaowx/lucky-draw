import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Lucky Draw',
  description: '现代化实时抽奖系统',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
