/** @type {import('next').NextConfig} */
const isProduction = process.env.NODE_ENV === 'production';
const defaultBackendOrigin = isProduction ? 'http://backend:8000' : 'http://127.0.0.1:8000';
const BACKEND_ORIGIN = process.env.BACKEND_ORIGIN || defaultBackendOrigin;
const BACKEND_API_URL = process.env.BACKEND_API_URL || (isProduction ? 'http://backend:8000/api' : 'http://127.0.0.1:8000/api');

const nextConfig = {
  output: 'standalone',
  // Django API 统一以尾斜杠结尾，Next 默认会把 /api/x/ 重定向为 /api/x，
  // 再触发 Django 的 APPEND_SLASH 301，导致代理 500。关闭尾斜杠重定向，
  // 让 /api、/media 原样交给 rewrites 转发。
  skipTrailingSlashRedirect: true,
  devIndicators: false,
  rewrites: () => [
    // 带尾斜杠的优先，保证 Django 接收到标准路径
    {
      source: "/api/:path*/",
      destination: `${BACKEND_ORIGIN}/api/:path*/`,
    },
    {
      source: "/api/:path*",
      destination: `${BACKEND_ORIGIN}/api/:path*`,
    },
    {
      source: "/media/:path*/",
      destination: `${BACKEND_ORIGIN}/media/:path*/`,
    },
    {
      source: "/media/:path*",
      destination: `${BACKEND_ORIGIN}/media/:path*`,
    },
    // Django admin 后台代理
    {
      source: "/admin/:path*/",
      destination: `${BACKEND_ORIGIN}/admin/:path*/`,
    },
    {
      source: "/admin/:path*",
      destination: `${BACKEND_ORIGIN}/admin/:path*`,
    },
    // Django admin 静态资源代理（登录后 dashboard 需要加载 CSS/JS）
    {
      source: "/static/:path*/",
      destination: `${BACKEND_ORIGIN}/static/:path*/`,
    },
    {
      source: "/static/:path*",
      destination: `${BACKEND_ORIGIN}/static/:path*`,
    },
  ],
  env: {
    BACKEND_API_URL,
  },
};

export default nextConfig;