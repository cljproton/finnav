import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function proxy(request: NextRequest) {
  const backend = process.env.BACKEND_ORIGIN || 'http://127.0.0.1:8000';

  // 代理 /api 和 /media 请求到后端
  if (request.nextUrl.pathname.startsWith('/api/') || request.nextUrl.pathname.startsWith('/media/')) {
    const url = new URL(request.url);
    url.protocol = new URL(backend).protocol;
    url.host = new URL(backend).host;
    
    // 确保 API 路径以 / 结尾，避免 Django 重定向
    let pathname = request.nextUrl.pathname;
    if (!pathname.endsWith('/')) {
      pathname += '/';
    }
    url.pathname = pathname;

    // 保留查询参数
    url.search = request.nextUrl.search;

    const response = NextResponse.rewrite(url);
    
    // 添加必要的头部
    response.headers.set('x-forwarded-host', request.headers.get('host') || '');
    response.headers.set('x-forwarded-proto', request.headers.get('x-forwarded-proto') || 'http');
    
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/media/:path*'],
};