/** @type {import('next').NextConfig} */
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
      destination: process.env.BACKEND_ORIGIN || "http://127.0.0.1:8000/api/:path*/",
    },
    {
      source: "/api/:path*",
      destination: process.env.BACKEND_ORIGIN || "http://127.0.0.1:8000/api/:path*",
    },
    {
      source: "/media/:path*/",
      destination: process.env.BACKEND_ORIGIN || "http://127.0.0.1:8000/media/:path*/",
    },
    {
      source: "/media/:path*",
      destination: process.env.BACKEND_ORIGIN || "http://127.0.0.1:8000/media/:path*",
    },
  ],
  env: {
    BACKEND_API_URL: process.env.BACKEND_API_URL || "http://127.0.0.1:8000/api",
  },
};

export default nextConfig;