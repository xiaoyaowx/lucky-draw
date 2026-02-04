const path = require('path');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: false,
  output: 'standalone',
  images: {
    unoptimized: true,
  },
  devIndicators: false,
  // Next.js 16 默认使用 Turbopack，需要保留此配置
  turbopack: {},
  webpack: (config, { dev }) => {
    if (dev) {
      // 排除 data 目录的文件监听，避免 JSON 文件修改触发热加载
      const dataDir = path.join(__dirname, 'data');
      config.watchOptions = {
        ...config.watchOptions,
        ignored: [
          '**/node_modules/**',
          '**/.git/**',
          `${dataDir}/**`,
        ],
      };
    }
    return config;
  },
};

module.exports = nextConfig;
