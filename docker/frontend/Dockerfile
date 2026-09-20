# ---- 构建阶段 ----
FROM node:22-alpine AS build

WORKDIR /src

COPY frontend/package.json frontend/package-lock.json ./
COPY frontend/.npmrc ./
RUN npm ci

COPY frontend/ .
# 设置 EXPO_PUBLIC_API_BASE_URL 为空字符串：Web 生产构建下 API_BASE_URL 保持空串，以相对路径 /api
# 同源请求，经 nginx 反代到后端（同源单端口，外层 nginx 可接入域名/HTTPS，不再硬拼 :8000）。
# 本地开发（next dev）未设置时仍走主机名 :8000。
ENV EXPO_PUBLIC_API_BASE_URL=""
RUN npm run build

# ---- 运行阶段：Next.js 服务器 ----
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# 复制构建产物
COPY --from=build /src/public ./public
COPY --from=build /src/.next/standalone ./
COPY --from=build /src/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]