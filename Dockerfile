# ---- 构建阶段 ----
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci && npm cache clean --force

COPY . .
RUN npm run build

# ---- 生产阶段 ----
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# standalone 输出已包含精简后的 node_modules
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# ws 模块被 server.prod.js 直接 require，但不在 Next.js 依赖图中，需单独拷贝
COPY --from=builder /app/node_modules/ws ./node_modules/ws

# 自定义 WebSocket 服务器（入口）
COPY --from=builder /app/server.prod.js ./server.prod.js

# 默认的 public 资源（bg.jpg 等）；运行时可通过 volume 覆盖
COPY --from=builder /app/public ./public

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "server.prod.js"]
