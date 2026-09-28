"""Logo 链接解析 + 安卓 APP 拉取服务。

Logo：
  无需人工配置站点图标；按需解析站点页面 <link rel="icon"> 得到图标 URL 并入库。
  本站不存放任何第三方图片文件（合规：避免商标侵权；成本：零磁盘零带宽）。

安卓 APP 拉取服务：
下载源支持 HTTP Range 时按多线程分片并行下载，显著提升大文件速度；
不支持的源自动降级为单连接流式下载。进度保存在进程内内存
（threading.Lock 保护），供后台页面轮询。
"""
import glob
import hashlib
import html
import ipaddress
import json
import os
import queue
import re
import socket
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from html.parser import HTMLParser

import requests

from django.conf import settings
from django.utils import timezone

USER_AGENT = 'finnav-cache/1.0'
CHUNK_SIZE = 256 * 1024
PROBE_TIMEOUT = 30          # 探测/分片单次读取 socket 超时（秒）
SEGMENT_TIMEOUT = 30
SEGMENT_ATTEMPTS = 5        # 每分片最大重试次数
PARALLEL_MIN_BYTES = 512 * 1024  # 小于此体积不做分片
REPORT_MIN_BYTES = 512 * 1024    # 进度上报节流（字节）

LOGO_TIMEOUT = 8            # 图标链接解析时的网络超时（秒）
LOGO_HTML_MAX_BYTES = 256 * 1024   # 站点首页只读前 256KB 用来找 <link rel="icon">
LOGO_VERIFY_TIMEOUT = 5     # 链接可用性轻量校验超时（秒）
LOGO_MAX_CANDIDATES = 3     # 页面自报图标最多尝试前 N 个（限制出网请求数）
# 浏览器可渲染的图标类型：只存这些类型的链接，其余（.html/.json 等）不采用
LOGO_RENDERABLE_EXTS = ('.png', '.svg', '.ico', '.jpg', '.jpeg', '.gif', '.webp')


class SSRFBlocked(Exception):
    """请求目标为内网/回环/保留地址等，出于 SSRF 防护拦截。"""


_PRIVATE_NETS = tuple(
    ipaddress.ip_network(net)
    for net in (
        '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8',
        '169.254.0.0/16', '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24',
        '192.168.0.0/16', '198.18.0.0/15', '198.51.100.0/24',
        '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
        '::1/128', 'fc00::/7', 'fe80::/10', 'ff00::/8',
    )
)


def _is_private_ip(ip):
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return True  # 无法解析的 IP 一律按内网拦截（fail-closed）
    if isinstance(addr, ipaddress.IPv4Address) and addr.is_loopback:
        return True
    return any(addr in net for net in _PRIVATE_NETS)


def _resolve_host_ips(host):
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return []
    ips = []
    for info in infos:
        ip = info[4][0]
        if ip not in ips:
            ips.append(ip)
    return ips


def _ensure_public_host(url):
    """校验 http/https URL 的 host 仅指向公网地址，否则抛 SSRFBlocked。

    对域名做 DNS 解析后复查，任一结果落在内网/保留网段即拦截；
    重定向目标由调用方在每一跳再次调用本函数校验。
    """
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        raise SSRFBlocked('仅支持 http/https 链接')
    host = parsed.hostname
    if not host:
        raise SSRFBlocked('链接缺少主机名')
    try:
        ip = ipaddress.ip_address(host)  # 字面量 IP（含 IPv6）
        if _is_private_ip(str(ip)):
            raise SSRFBlocked('目标为内网/保留地址，已拦截')
        return
    except ValueError:
        pass
    ips = _resolve_host_ips(host)
    if not ips:
        raise SSRFBlocked('无法解析目标主机')
    if any(_is_private_ip(ip) for ip in ips):
        raise SSRFBlocked('目标解析到内网/保留地址，已拦截')


_MAX_REDIRECTS = 5


def _safe_requests_get(url, **kwargs):
    """带 SSRF 校验的 requests.get：逐跳校验重定向目标，不自动跟随。"""
    for _ in range(_MAX_REDIRECTS + 1):
        _ensure_public_host(url)
        resp = requests.get(url, allow_redirects=False, **kwargs)
        if resp.status_code in (301, 302, 303, 307, 308):
            loc = resp.headers.get('Location')
            resp.close()
            if not loc:
                raise SSRFBlocked('重定向缺少 Location')
            url = urllib.parse.urljoin(url, loc)
            continue
        return resp
    raise SSRFBlocked('重定向次数过多')


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """urllib 重定向钩子：重定向到内网目标时拦截。"""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        _ensure_public_host(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_safe_opener = urllib.request.build_opener(_SafeRedirectHandler)


class LogoResolveError(Exception):
    """Logo 链接解析失败（网络错误、页面无图标声明、链接不可用等）。"""


TITLE_TIMEOUT = 8            # 教程标题抓取超时（秒）
TITLE_MAX_BYTES = 256 * 1024  # 标题抓取读取上限
TITLE_MAX_LEN = 200          # 标题最大长度

# 浏览器级 UA，避免被常见站点以爬虫拦截
BROWSER_UA = (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
)


def _decode_bytes(raw, declared_charset=None):
    """按 utf-8 -> 声明的编码 -> gb18030 逐级解码，避免中文站点乱码。"""
    candidates = []
    if declared_charset:
        candidates.append(declared_charset)
    for enc in ['utf-8'] + candidates + ['gb18030']:
        try:
            return raw.decode(enc)
        except (UnicodeDecodeError, LookupError):
            continue
    return raw.decode('utf-8', errors='ignore')


class _MetaParser(HTMLParser):
    """收集页面 <meta> 标签，属性顺序无关，供 og:title 等回退使用。"""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.meta = []

    def handle_starttag(self, tag, attrs):
        if tag == 'meta':
            self.meta.append({k.lower(): (v or '') for k, v in attrs})


def _meta_content(meta_list, keys):
    for tag in meta_list:
        key = (tag.get('property') or tag.get('name') or '').strip().lower()
        if key in keys:
            content = (tag.get('content') or '').strip()
            if content:
                return content
    return ''


def fetch_page_title_info(url):
    """抓取链接标题，返回 (标题, 是否兜底)。

    优先级：<title> -> og:title/twitter:title -> <h1> -> 域名兜底。
    只读取页面头部最多 TITLE_MAX_BYTES 字节；失败时不抛异常。
    """
    def _clean(raw):
        text = re.sub(r'<[^>]+>', '', raw or '')
        text = html.unescape(text)
        text = ' '.join(text.split())
        return text.strip()[:TITLE_MAX_LEN]

    def _fallback():
        parsed = urllib.parse.urlparse(url)
        if parsed.netloc:
            return parsed.netloc, True
        return url, True

    try:
        parsed = urllib.parse.urlparse(url)
        if parsed.scheme not in ('http', 'https') or not parsed.netloc:
            return _fallback()
        resp = _safe_requests_get(
            parsed.geturl(),
            timeout=TITLE_TIMEOUT,
            headers={
                'User-Agent': BROWSER_UA,
                'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
            stream=True,
        )
        try:
            if resp.status_code >= 400:
                return _fallback()
            raw = b''
            for chunk in resp.iter_content(TITLE_MAX_BYTES):
                raw += chunk
                if len(raw) > TITLE_MAX_BYTES:
                    raw = raw[:TITLE_MAX_BYTES]
                    break
        finally:
            resp.close()

        declared_charset = None
        m = re.search(
            r'charset=["\']?([\w-]+)',
            resp.headers.get('Content-Type', ''),
            re.IGNORECASE,
        )
        if m:
            declared_charset = m.group(1)
        text = _decode_bytes(raw, declared_charset)

        # 响应头未声明编码时，尝试 <meta charset> 再次解码
        m = re.search(
            r'<meta[^>]+charset=["\']?([\w-]+)["\']?', text, re.IGNORECASE
        )
        if m and declared_charset is None:
            text = _decode_bytes(raw, m.group(1))

        m = re.search(r'<title[^>]*>(.*?)</title>', text, re.IGNORECASE | re.DOTALL)
        if m:
            title = _clean(m.group(1))
            if title:
                return title, False

        parser = _MetaParser()
        try:
            parser.feed(text)
        except Exception:
            pass
        og = _meta_content(
            parser.meta, {'og:title', 'twitter:title', 'og:site_name'}
        )
        if og:
            return og[:TITLE_MAX_LEN], False

        m = re.search(r'<h1[^>]*>(.*?)</h1>', text, re.IGNORECASE | re.DOTALL)
        if m:
            title = _clean(m.group(1))
            if title:
                return title, False
    except Exception:
        pass
    return _fallback()


def fetch_page_title(url):
    """抓取网页标题作为分享教程标题；失败时兜底返回域名，不抛异常。"""
    title, _ = fetch_page_title_info(url)
    return title


# ---------------------------------------------------------------------------
# 站点 Logo 链接解析（只解析链接，本站不存放任何图片文件）
#
# 合规：第三方站点 Logo 属其商标资产，在本站存储/再分发存在侵权风险，
#       因此本站只保存图标 URL，由浏览器直接热链渲染。
# 成本：图片走对方 CDN，本站零磁盘、零带宽。
# 样式：前端盒子尺寸/圆角/裁剪全由 Logo.tsx 的 CSS 决定，与图片来源无关，
#       改用外链后显示效果与原来一致（详见 frontend/components/Logo.tsx）。
# ---------------------------------------------------------------------------

# 明确不可渲染的扩展名（页面/接口/文档地址），其余（如无扩展名的 s2 favicons）均可采用
LOGO_BAD_EXTS = (
    '.html', '.htm', '.php', '.aspx', '.jsp', '.json', '.txt', '.pdf', '.xml',
)

_logo_locks = {}
_logo_lock_guard = threading.Lock()


def _logo_lock(site_id):
    with _logo_lock_guard:
        return _logo_locks.setdefault(site_id, threading.Lock())


def _origin_of(url):
    """从站点 URL 提取源，如 https://uniswap.org → https://uniswap.org。"""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        raise LogoResolveError('站点网址无效')
    return f'{parsed.scheme}://{parsed.netloc}'


def normalize_icon_url(url):
    """校验并规范化图标链接，返回可入库的 URL 或 None。

    只接受 http/https，且主机名不得是内网/回环/保留地址字面量 IP 或 localhost。
    该检查纯字面量、不做 DNS 解析，可在遍历多个候选时零成本调用；
    完整 DNS 复查（_ensure_public_host）只对最终入选的链接执行。
    """
    if not url:
        return None
    url = url.strip()
    if not url or len(url) > 500:
        return None
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.hostname:
        return None
    host = parsed.hostname.lower()
    if host == 'localhost' or host.endswith(('.localhost', '.local', '.internal')):
        return None
    try:
        ipaddress.ip_address(host)
    except ValueError:
        return url  # 普通域名，字面量检查通过
    except Exception:
        return None
    # 字面量 IP 必须是公网地址，避免把内网探针地址存进库里
    return None if _is_private_ip(host) else url


def _is_renderable_icon(url):
    """排除明显不是图片的地址（页面/接口/文档）。"""
    ext = os.path.splitext(urllib.parse.urlparse(url).path)[1].lower()
    return ext not in LOGO_BAD_EXTS


def _fetch_homepage_html(url):
    """读取站点首页 HTML（截断到 LOGO_HTML_MAX_BYTES），用于找 <link rel="icon">。"""
    _ensure_public_host(url)
    req = urllib.request.Request(url, headers={'User-Agent': BROWSER_UA})
    with _safe_opener.open(req, timeout=LOGO_TIMEOUT) as resp:
        data = resp.read(LOGO_HTML_MAX_BYTES)
    return data.decode('utf-8', errors='ignore')


def _icon_candidates(site, html=None):
    """返回优先尝试的图标链接候选（只解析，不下载）。

    顺序：站点自身 <link rel="icon">（最多前 LOGO_MAX_CANDIDATES 个）→ /favicon.ico →
    第三方公共图标服务兜底（SITE_LOGO_PROVIDERS，{domain} 替换为站点域名）。
    相对/协议相对地址按 RFC 3986 以站点 URL 为基准补全。
    """
    _origin_of(site.url)  # 校验站点 URL 合法（否则 urljoin 结果不可用）
    declared = []
    if html:
        # 逐个 <link> 标签取 rel 与 href，兼容 rel/href 顺序与大小写
        for tag in re.findall(r'<link[^>]*>', html, re.IGNORECASE):
            rel_m = re.search(r'rel\s*=\s*["\']([^"\']*)["\']', tag, re.IGNORECASE)
            if not rel_m or 'icon' not in rel_m.group(1).lower():
                continue
            href_m = re.search(r'href\s*=\s*["\']([^"\']+)["\']', tag, re.IGNORECASE)
            if href_m:
                declared.append(href_m.group(1).strip())
    declared = declared[:LOGO_MAX_CANDIDATES]
    declared.append('/favicon.ico')

    resolved = [urllib.parse.urljoin(site.url, href) for href in declared]

    site_parsed = urllib.parse.urlparse(site.url)
    providers = getattr(settings, 'SITE_LOGO_PROVIDERS', None) or []
    for tmpl in providers:
        try:
            resolved.append(tmpl.format(domain=site_parsed.netloc))
        except (KeyError, IndexError, ValueError):
            continue
    return list(dict.fromkeys(resolved))


def _verify_icon_link(url):
    """轻量校验链接可访问且返回的是图片：只发 Range 请求，读完即弃，不落盘。"""
    req = urllib.request.Request(
        url, headers={'User-Agent': BROWSER_UA, 'Range': 'bytes=0-0'}
    )
    try:
        with _safe_opener.open(req, timeout=LOGO_VERIFY_TIMEOUT) as resp:
            status = getattr(resp, 'status', None) or resp.getcode()
            if status not in (200, 206):
                return False
            ctype = (resp.headers.get('Content-Type') or '').split(';')[0].strip().lower()
    except Exception:
        return False
    # 部分站点不返回 Content-Type，放行空值与 octet-stream；明确返回 html 则判为无效
    return not ctype or ctype.startswith('image/') or ctype == 'application/octet-stream'


def should_retry_logo(site):
    """是否值得再次出网解析图标链接：从未成功过，或距上次尝试已超过重试窗口。"""
    if site.logo_url:
        return False
    if not getattr(settings, 'SITE_LOGO_RESOLVE_ENABLED', True):
        return False
    if site.logo_resolved_at is None:
        return True
    window = getattr(settings, 'SITE_LOGO_RETRY_SECONDS', 86400)
    return (timezone.now() - site.logo_resolved_at).total_seconds() > window


def resolve_site_logo_url(site, force=False):
    """解析站点图标链接并写入 site.logo_url（只存链接，不下载图片）。

    - 并发保护：同一站点同时只允许一个线程解析。
    - 优先解析页面 <link rel="icon">，兜底 /favicon.ico 与第三方公共图标服务。
    - 成功写 logo_url 与 logo_resolved_at；自动路径失败时也写 logo_resolved_at，
      以便按 SITE_LOGO_RETRY_SECONDS 节流，不在每次访问时重复出网。
    """
    if not getattr(settings, 'SITE_LOGO_RESOLVE_ENABLED', True):
        return site.logo_url
    if site.logo_url and not force:
        return site.logo_url
    with _logo_lock(site.pk):
        if site.logo_url and not force:
            return site.logo_url
        site.refresh_from_db(fields=['logo_url', 'logo_resolved_at'])
        if site.logo_url and not force:
            return site.logo_url
        try:
            html = None
            try:
                html = _fetch_homepage_html(_origin_of(site.url))
            except Exception:
                html = None
            picked = None
            for candidate in _icon_candidates(site, html):
                url = normalize_icon_url(candidate)
                if not url or not _is_renderable_icon(url):
                    continue
                try:
                    _ensure_public_host(url)  # 完整 DNS 复查（内网/保留地址拦截）
                except Exception:
                    continue
                if getattr(settings, 'SITE_LOGO_VERIFY', True) and not _verify_icon_link(url):
                    continue
                picked = url
                break
            if not picked:
                raise LogoResolveError('未找到可用的站点图标链接')
            site.logo_url = picked
            site.logo_resolved_at = timezone.now()
            site.save(update_fields=['logo_url', 'logo_resolved_at', 'updated_at'])
            return picked
        except Exception as exc:
            if not force:
                # 自动路径失败也记时间，避免每次访问都出网重试；
                # 手动/批量路径（force）不记，保证下次仍会重试。
                site.logo_resolved_at = timezone.now()
                site.save(update_fields=['logo_resolved_at'])
            if not isinstance(exc, LogoResolveError):
                exc = LogoResolveError(str(exc))
            raise exc


# ------------------- 后台异步解析图标链接 -------------------

_logo_inflight = set()


def ensure_logo_url_async(site_id):
    """后台异步解析站点图标链接，立即返回，不阻塞请求。

    - 同一站点同时只允许一个后台线程（防并发详情访问线程堆积）。
    - 失败按 SITE_LOGO_RETRY_SECONDS 节流，下次访问再试。
    """
    with _logo_lock_guard:
        if site_id in _logo_inflight:
            return
        _logo_inflight.add(site_id)
    threading.Thread(target=_logo_worker, args=(site_id,), daemon=True).start()


def _logo_worker(site_id):
    from django.db import close_old_connections

    from .models import Site

    try:
        close_old_connections()
        site = Site.objects.get(pk=site_id)
        if not should_retry_logo(site):
            return
        resolve_site_logo_url(site)
    except Exception:
        pass
    finally:
        close_old_connections()
        with _logo_lock_guard:
            _logo_inflight.discard(site_id)




class CancelRequested(Exception):
    """下载被用户取消。"""


class AppPullError(Exception):
    """拉取失败（参数非法、超限、网络错误等）。"""


class _Abort(Exception):
    """分片线程内部终止信号，携带真正的异常。"""


def _segments():
    return max(1, int(getattr(settings, 'APP_CACHE_PARALLEL', 6)))


def _block_size():
    return max(256 * 1024, int(getattr(settings, 'APP_CACHE_BLOCK_SIZE', 1024 * 1024)))


def _max_bytes():
    return int(getattr(settings, 'APP_CACHE_MAX_BYTES', 0))


def _download_headers(referer=None):
    """构造模拟真实浏览器的下载请求头，缓解 CDN 对非浏览器 UA 的限速/防盗链。

    必须禁用压缩（Accept-Encoding: identity），否则源返回 gzip 会污染二进制 APK。
    """
    headers = {
        'User-Agent': str(getattr(settings, 'APP_CACHE_USER_AGENT', 'finnav-cache/1.0')),
        'Accept': '*/*',
        'Accept-Encoding': 'identity',
    }
    if referer and getattr(settings, 'APP_CACHE_ENABLE_REFERER', True):
        headers['Referer'] = referer
    return headers


# ------------------- 低层下载（同步调用与后台任务复用） -------------------

def _resolve_cache_target(site, parsed):
    cache_root = os.path.join(
        settings.MEDIA_ROOT, 'app_cache', str(site.pk), 'android'
    )
    os.makedirs(cache_root, exist_ok=True)
    orig_name = os.path.basename(urllib.parse.unquote(parsed.path)) or ''
    safe_name = os.path.basename(orig_name.replace('..', '_'))
    if not safe_name or not os.path.splitext(safe_name)[1]:
        safe_name = f'app-{site.pk}.apk'
    return (
        os.path.join(cache_root, safe_name),
        f'app_cache/{site.pk}/android/{safe_name}',
    )


def _cleanup(dest):
    for pattern in (dest + '.final', dest + '.part*'):
        for path in glob.glob(pattern):
            try:
                os.remove(path)
            except OSError:
                pass


def _probe(url, headers):
    """探测文件大小与 Range 支持，返回 (total, supports_ranges)。"""
    _ensure_public_host(url)
    req = urllib.request.Request(url, headers=dict(headers, Range='bytes=0-0'))
    try:
        with _safe_opener.open(req, timeout=PROBE_TIMEOUT) as resp:
            status = int(getattr(resp, 'status', 200))
            resp_headers = getattr(resp, 'headers', None)
            total = 0
            if resp_headers is not None:
                cr = resp_headers.get('Content-Range')
                m = re.search(r'/(\d+)\s*$', cr) if cr else None
                if m:
                    total = int(m.group(1))
                else:
                    cl = resp_headers.get('Content-Length')
                    if cl:
                        total = int(cl)
            return total, status == 206
    except Exception:
        return 0, False


def _manifest_path_for(dest):
    return dest + '.resume.json'


def _load_manifest(dest):
    path = _manifest_path_for(dest)
    if not os.path.exists(path):
        return None
    try:
        with open(path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception:
        return None


def _save_manifest(dest, manifest):
    path = _manifest_path_for(dest)
    tmp = path + '.tmp'
    try:
        with open(tmp, 'w', encoding='utf-8') as f:
            json.dump(manifest, f, ensure_ascii=False)
        os.replace(tmp, path)
    except OSError:
        pass


def _remove_manifest(dest):
    try:
        os.remove(_manifest_path_for(dest))
    except OSError:
        pass


def _block_ranges(total, block_size):
    blocks = []
    start = 0
    while start < total:
        end = total if start + block_size >= total else start + block_size
        blocks.append({'start': start, 'end': end, 'done': 0})
        start = end
    return blocks


def _resume_blocks(dest, url, total, block_size):
    """读取断点清单并归一化；来源或大小变化则视为全新下载。"""
    manifest = _load_manifest(dest)
    if (
        manifest
        and manifest.get('url') == url
        and manifest.get('total') == total
        and isinstance(manifest.get('blocks'), list)
    ):
        return [dict(b) for b in manifest['blocks']]
    return _block_ranges(total, block_size)


def _download_block(url, headers, fh, guard, block, shared, report, should_cancel):
    """下载 [start, end) 区块并 seek 写入共享文件句柄的正确偏移。

    block['done'] 记录该区块已写字节，网络抖动时从此断点续传重试。
    """
    start = block['start']
    need = block['end'] - block['start']
    done = block.get('done', 0) or 0
    attempts = 0
    _ensure_public_host(url)
    while done < need:
        if shared.get('error'):
            raise _Abort(shared['error'])
        if should_cancel and should_cancel():
            raise _Abort(CancelRequested())
        attempts += 1
        if attempts > SEGMENT_ATTEMPTS:
            raise _Abort(AppPullError('下载分片多次失败，请稍后重试'))
        req = urllib.request.Request(
            url,
            headers=dict(headers, Range=f'bytes={start + done}-{start + need - 1}'),
        )
        try:
            with _safe_opener.open(req, timeout=SEGMENT_TIMEOUT) as resp:
                while done < need:
                    if shared.get('error'):
                        raise _Abort(shared['error'])
                    if should_cancel and should_cancel():
                        raise _Abort(CancelRequested())
                    chunk = resp.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    if done + len(chunk) > need:
                        chunk = chunk[: need - done]
                    with guard:
                        fh.seek(start + done)
                        fh.write(chunk)
                    done += len(chunk)
                    block['done'] = done
                    report(len(chunk))
        except _Abort:
            raise
        except Exception:
            continue  # 网络抖动/超时，重新发起剩余区间


def _download_ranges(url, headers, dest, total, on_progress, should_cancel):
    """动态 Range 队列并行下载（写 final 路径正确偏移）+ 跨次断点续传。

    - 文件按 block_size 切成小块入队，worker 谁空闲谁取块 → 空片自动补位，无尾巴效应。
    - 断点清单（.resume.json）持久化各区块进度；失败/取消保留清单与已写文件，下次续传。
    """
    block_size = _block_size()
    n = _segments()
    blocks = _resume_blocks(dest, url, total, block_size)
    base = sum(b.get('done', 0) or 0 for b in blocks)

    shared = {'downloaded': base, 'error': None}
    lock = threading.Lock()
    guard = threading.Lock()  # 保护共享文件句柄的写入指针
    reported = [0]
    last_save = [0.0]

    def report(delta):
        with lock:
            shared['downloaded'] += delta
            if (
                on_progress
                and shared['downloaded'] - reported[0] >= REPORT_MIN_BYTES
            ):
                reported[0] = shared['downloaded']
                on_progress(shared['downloaded'], total)
            if _max_bytes() and shared['downloaded'] > _max_bytes():
                shared['error'] = AppPullError('APP 包超过大小限制')
        if shared.get('error'):
            raise _Abort(shared['error'])

    def persist(force=False):
        now = time.monotonic()
        with lock:
            snapshot = [dict(b) for b in blocks]
            if force or now - last_save[0] >= 1.0:
                last_save[0] = now
        if force or now - last_save[0] >= 1.0:
            _save_manifest(dest, {'url': url, 'total': total, 'blocks': snapshot})

    pending = queue.Queue()
    for b in blocks:
        if b['done'] < b['end'] - b['start']:
            pending.put(b)

    def run():
        while True:
            if shared.get('error'):
                return
            try:
                block = pending.get_nowait()
            except queue.Empty:
                return
            try:
                _download_block(
                    url, headers, fh, guard, block, shared, report, should_cancel
                )
            except _Abort as exc:
                with lock:
                    if not shared.get('error'):
                        shared['error'] = exc.args[0]
                persist(force=True)
                return
            persist()

    exists = os.path.exists(dest)
    with open(dest, 'r+b' if exists else 'wb') as fh:
        if os.path.getsize(dest) < total:
            fh.truncate(total)
        if not pending.empty():
            with ThreadPoolExecutor(max_workers=n) as ex:
                futures = [ex.submit(run) for _ in range(n)]
                for fut in futures:
                    fut.result()
        persist(force=True)

    if shared.get('error'):
        raise shared['error']


def _stream_single(url, headers, dest, total, on_progress, should_cancel):
    """不支持 Range/未知大小的降级路径：单连接流式写入。失败/取消自动清理临时文件。"""
    _ensure_public_host(url)
    req = urllib.request.Request(url, headers=headers)
    tmp = dest + '.part'
    size = 0
    try:
        with _safe_opener.open(req, timeout=60) as resp:
            if not total:
                resp_headers = getattr(resp, 'headers', None)
                if resp_headers is not None:
                    try:
                        total = int(resp_headers.get('Content-Length') or 0)
                    except (TypeError, ValueError):
                        total = 0
            with open(tmp, 'wb') as f:
                while True:
                    if should_cancel and should_cancel():
                        raise CancelRequested()
                    chunk = resp.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    size += len(chunk)
                    if _max_bytes() and size > _max_bytes():
                        raise AppPullError('APP 包超过大小限制')
                    f.write(chunk)
                    if on_progress:
                        on_progress(size, total)
        os.replace(tmp, dest)
        return size
    except CancelRequested:
        _cleanup(dest)
        raise
    except AppPullError:
        _cleanup(dest)
        raise
    except Exception:
        _cleanup(dest)
        raise AppPullError('下载失败，请稍后重试') from None


def _sha256_file(path):
    """流式读取文件并返回 SHA-256 十六进制摘要（不一次性载入内存）。"""
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def stream_app_to_site(site, on_progress=None, should_cancel=None):
    """从 site.app_android_url 下载到专用目录并更新模型元数据。

    - on_progress(downloaded, total)：定期回调，total 为探测到的文件大小。
    - should_cancel()：返回 True 时中止，抛出 CancelRequested。

    支持 Range 的源：动态区块并行 + 断点续传（失败/取消保留清单，下次续传）；
    不支持的源：降级为单连接流式（失败自动清理临时文件）。
    """
    if not site.app_android_url:
        raise AppPullError('未配置安卓 APP 原始下载链接')
    parsed = urllib.parse.urlparse(site.app_android_url)
    if parsed.scheme not in ('http', 'https'):
        raise AppPullError('仅支持 http/https 下载链接')
    try:
        _ensure_public_host(site.app_android_url)
    except SSRFBlocked as exc:
        raise AppPullError(str(exc)) from None
    dest, target_name = _resolve_cache_target(site, parsed)

    referer = None
    try:
        referer = _origin_of(site.url)
    except Exception:
        referer = None
    headers = _download_headers(referer=referer)

    try:
        total, supports_ranges = _probe(site.app_android_url, headers)
        if _max_bytes() and total and total > _max_bytes():
            raise AppPullError('APP 包超过大小限制')
        if supports_ranges and total >= PARALLEL_MIN_BYTES:
            _download_ranges(
                site.app_android_url, headers, dest, total, on_progress, should_cancel
            )
            size = total
        else:
            size = _stream_single(
                site.app_android_url, headers, dest, total, on_progress, should_cancel
            )
    except CancelRequested:
        # 并行续传路径：保留清单与已写文件，供下次续传
        raise
    except AppPullError:
        raise
    except SSRFBlocked as exc:
        raise AppPullError(str(exc)) from None
    except Exception:
        raise AppPullError('下载失败，请稍后重试') from None

    _remove_manifest(dest)

    # 文件完整落盘后计算 SHA-256 指纹，作为真实性校验基准（此刻与磁盘内容必然一致）
    sha256_hex = _sha256_file(dest)

    if site.app_android_file and site.app_android_file.name != target_name:
        site.app_android_file.delete(save=False)
    site.app_android_file.name = target_name
    site.app_android_size = size
    site.app_android_cached_at = timezone.now()
    site.app_android_sha256 = sha256_hex
    site.app_android_verified_at = timezone.now()
    site.app_android_integrity_ok = True
    site.save(
        update_fields=[
            'app_android_file',
            'app_android_size',
            'app_android_cached_at',
            'app_android_sha256',
            'app_android_verified_at',
            'app_android_integrity_ok',
            'updated_at',
        ]
    )
    return site.app_android_file.url


# ------------------- 后台任务（进度 + 取消） -------------------

_pull_lock = threading.Lock()
_pull_states = {}
_pull_epoch = 0


def reset_pull_states():
    """清空拉取状态并使所有在途旧线程失效（测试隔离用）。"""
    global _pull_epoch
    with _pull_lock:
        _pull_epoch += 1
        _pull_states.clear()


def _update_state(site_id, patch):
    with _pull_lock:
        state = _pull_states.setdefault(site_id, {})
        state.update(patch)
        return dict(state)


def get_pull_state(site_id):
    """当前拉取进度状态（无记录时返回空 dict）。"""
    with _pull_lock:
        return dict(_pull_states.get(site_id) or {})


def clear_pull_state(site_id):
    """清除某站点的拉取记录（终态读一次后由页面清除，避免重复刷新）。"""
    with _pull_lock:
        _pull_states.pop(site_id, None)


def start_pull(site_id):
    """启动后台拉取；已在运行则直接返回当前状态。"""
    with _pull_lock:
        if _pull_states.get(site_id, {}).get('status') == 'running':
            return dict(_pull_states[site_id])
        _pull_states[site_id] = {
            'status': 'queued',
            'total': 0,
            'downloaded': 0,
            'percent': 0,
            'message': '准备开始',
        }
    threading.Thread(target=_runner, args=(site_id,), daemon=True).start()
    return get_pull_state(site_id)


def cancel_pull(site_id):
    """请求中断；仅在 running 时生效，返回是否已请求。"""
    with _pull_lock:
        state = _pull_states.setdefault(site_id, {})
        if state.get('status') == 'running':
            state['cancel_requested'] = True
            return True
        return False


def _runner(site_id):
    from .models import Site  # 避免顶层循环导入

    with _pull_lock:
        epoch = _pull_epoch

    def alive():
        """记录状态过期（如服务重置/测试隔离）时，旧线程应停止写状态。"""
        with _pull_lock:
            return _pull_epoch == epoch

    def on_progress(downloaded, total):
        if not alive():
            return
        percent = int(downloaded * 100 / total) if total else 0
        if total:
            message = f'{downloaded / 1048576:.1f} / {total / 1048576:.1f} MB'
        else:
            message = f'{downloaded / 1048576:.1f} MB'
        _update_state(
            site_id,
            {
                'status': 'running',
                'downloaded': downloaded,
                'total': total,
                'percent': percent,
                'message': message,
            },
        )

    def should_cancel():
        with _pull_lock:
            if _pull_epoch != epoch:
                return True
            return bool(_pull_states.get(site_id, {}).get('cancel_requested'))

    try:
        if not alive():
            return
        site = Site.objects.get(pk=site_id)
        stream_app_to_site(site, on_progress=on_progress, should_cancel=should_cancel)
        if not alive():
            return
        _update_state(
            site_id, {'status': 'done', 'percent': 100, 'message': '完成，已保存到本站'}
        )
    except CancelRequested:
        if alive():
            _update_state(site_id, {'status': 'cancelled', 'message': '已取消'})
    except Exception as exc:
        if alive():
            _update_state(site_id, {'status': 'error', 'message': str(exc)})


def normalize_experience_image(file, max_edge=1080):
    """统一经验配图规格：最长边 ≤ max_edge、烘焙 EXIF 方向、转 WebP。

    动画 GIF 原样保留（不转码，避免丢动画）。

    返回 ContentFile（可直接写入 ExperienceImage.image）。
    无效 / 超大图片抛 ValueError（带中文错误信息）。
    """
    import uuid
    from io import BytesIO

    from django.core.files.base import ContentFile
    from PIL import Image, ImageOps

    data = file.read()
    try:
        img = Image.open(BytesIO(data))
        img.load()
    except Image.DecompressionBombError:
        raise ValueError('图片文件无效或过大。')
    except Exception:
        raise ValueError('图片文件无效。')

    if img.format == 'GIF':
        return ContentFile(data, name=f'exp-{uuid.uuid4().hex[:12]}.gif')

    img = ImageOps.exif_transpose(img)

    width, height = img.size
    longest = max(width, height)
    if longest > max_edge:
        scale = max_edge / longest
        new_size = (max(1, int(width * scale)), max(1, int(height * scale)))
        img = img.resize(new_size, Image.LANCZOS)

    if img.mode == 'P':
        img = img.convert('RGBA' if 'transparency' in img.info else 'RGB')
    elif img.mode in ('LA', 'PA'):
        img = img.convert('RGBA')
    elif img.mode not in ('RGB', 'RGBA'):
        img = img.convert('RGB')

    has_alpha = img.mode == 'RGBA'
    buffer = BytesIO()
    if has_alpha:
        img.save(buffer, format='WEBP', lossless=True)
    else:
        img.save(buffer, format='WEBP', quality=82)

    return ContentFile(
        buffer.getvalue(), name=f'exp-{uuid.uuid4().hex[:12]}.webp'
    )
