# ---- 构建阶段 ----
# 固定补丁版本，构建可复现；升级时同步改两处 FROM
FROM node:22.23.4-alpine3.24 AS build

WORKDIR /src

COPY frontend/package.json frontend/package-lock.json ./
COPY frontend/.npmrc ./
RUN npm ci

COPY frontend/ .
# 设置 EXPO_PUBLIC_API_BASE_URL 为空字符串：Web 生产构建下 API_BASE_URL 保持空串，以相对路径 /api
# 同源请求，经 Next 反代到后端（同源单端口，外层 nginx 可接入域名/HTTPS，不再硬拼 :8000）。
# 本地开发（next dev）未设置时仍走主机名 :8000。
ENV EXPO_PUBLIC_API_BASE_URL="" \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- 运行阶段：Next.js 服务器（非 root） ----
FROM node:22.23.4-alpine3.24 AS runner
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    NEXT_TELEMETRY_DISABLED=1

# 复制构建产物（属主交给 node，运行期无需 root）
COPY --from=build --chown=node:node /src/public ./public
COPY --from=build --chown=node:node /src/.next/standalone ./
COPY --from=build --chown=node:node /src/.next/static ./.next/static

# Next 运行期缓存目录（compose 挂命名卷覆盖），属主 node
RUN mkdir -p /app/.next/cache && chown -R node:node /app/.next

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD node -e "fetch('http://127.0.0.1:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
