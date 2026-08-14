# ---- 构建阶段：导出 Expo Web 静态站 ----
FROM node:22-alpine AS build

WORKDIR /src

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ .
# 空值 + ??(config.ts) → API_BASE_URL 保持空串，Web 端以相对路径 /api 请求，
# 经 nginx 反代到后端（同源单端口 80）。不设置时默认跟随主机名 :8000（开发模式）。
ENV EXPO_PUBLIC_API_BASE_URL=""
RUN npx expo export --platform web

# ---- 运行阶段：Nginx 托管静态站 ----
FROM nginx:1.27-alpine
# envsubst 仅替换 BACKEND_URL（避免误替换 $host/$uri 等 nginx 变量）
ENV NGINX_ENVSUBST_FILTER="BACKEND_URL" \
    BACKEND_URL="http://backend:8000"
COPY docker/frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80