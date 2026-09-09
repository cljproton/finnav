# ---- 构建阶段：导出 Expo Web 静态站 ----
FROM node:22-alpine AS build

WORKDIR /src

COPY frontend/package.json frontend/package-lock.json ./
COPY frontend/.npmrc ./
RUN npm ci

COPY frontend/ .
# 置空 EXPO_PUBLIC_API_BASE_URL：Web 生产构建下 API_BASE_URL 保持空串，以相对路径 /api
# 同源请求，经 nginx 反代到后端（同源单端口，外层 nginx 可接入域名/HTTPS，不再硬拼 :8000）。
# 本地开发（expo start）未设置时仍走主机名 :8000。
ENV EXPO_PUBLIC_API_BASE_URL=""
RUN npx expo export --platform web

# 构建期注入基础 SEO 兜底标签：正式环境的精确 SEO 由后端预渲染页面
# (/seo-generated) 提供，这里的 title/description/canonical 仅作 SPA 壳兜底。
ARG SEO_TITLE="FinNav"
ARG SEO_DESCRIPTION="FinNav一个金融导航应用"
ARG SEO_ORIGIN="https://finnav.app"
RUN if ! grep -q "meta name=\"robots\"" dist/index.html; then \
      sed -i "s|<head>|<head>\\n  <meta name=\"robots\" content=\"index,follow\" />\\n  <meta name=\"description\" content=\"$SEO_DESCRIPTION\" />\\n  <link rel=\"canonical\" href=\"$SEO_ORIGIN/\" />|" dist/index.html; \
      sed -i "s|<title>FinNav[^<]*</title>|<title>$SEO_TITLE</title>|" dist/index.html; \
    fi

# ---- 运行阶段：Nginx 托管静态站 ----
FROM nginx:1.27-alpine
# envsubst 仅替换 BACKEND_URL（避免误替换 $host/$uri 等 nginx 变量）
ENV NGINX_ENVSUBST_FILTER="BACKEND_URL" \
    BACKEND_URL="http://backend:8000"
COPY docker/frontend/nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /src/dist /usr/share/nginx/html
EXPOSE 80