"""Logo 自动获取 + 安卓 APP 拉取服务。

Logo：
  无需人工配置站点图标；按需发现并下载站点 favicon 后缓存在本站。

安卓 APP 拉取服务：
下载源支持 HTTP Range 时按多线程分片并行下载，显著提升大文件速度；
不支持的源自动降级为单连接流式下载。进度保存在进程内内存
（threading.Lock 保护），供后台页面轮询。
"""
import glob
import hashlib
import json
import os
import queue
import re
import threading
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

from django.conf import settings
from django.utils import timezone

USER_AGENT = 'finnav-cache/1.0'
CHUNK_SIZE = 256 * 1024
PROBE_TIMEOUT = 30          # 探测/分片单次读取 socket 超时（秒）
SEGMENT_TIMEOUT = 30
SEGMENT_ATTEMPTS = 5        # 每分片最大重试次数
PARALLEL_MIN_BYTES = 512 * 1024  # 小于此体积不做分片
REPORT_MIN_BYTES = 512 * 1024    # 进度上报节流（字节）

LOGO_TIMEOUT = 8            # logo 下载超时（秒）
LOGO_MAX_BYTES = 1024 * 1024     # logo 大小上限（1MB）
LOGO_CONTENT_TYPES = {
    'image/png',
    'image/jpeg',
    'image/gif',
    'image/webp',
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'image/svg+xml',
}


class LogoFetchError(Exception):
    """logo 获取失败（网络错误、非图片、超限等）。"""


_logo_locks = {}
_logo_lock_guard = threading.Lock()


def _logo_lock(site_id):
    with _logo_lock_guard:
        return _logo_locks.setdefault(site_id, threading.Lock())


def _origin_of(url):
    """从站点 URL 提取源，如 https://uniswap.org → https://uniswap.org。"""
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ('http', 'https') or not parsed.netloc:
        raise LogoFetchError('站点网址无效')
    return f'{parsed.scheme}://{parsed.netloc}'


def _fetch_bytes(url):
    req = urllib.request.Request(
        url,
        headers={'User-Agent': USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=LOGO_TIMEOUT) as resp:
        content_type = resp.headers.get('Content-Type', '').split(';')[0].strip().lower()
        size = int(resp.headers.get('Content-Length') or 0)
        if size > LOGO_MAX_BYTES:
            raise LogoFetchError('图标超过大小上限')
        data = resp.read(LOGO_MAX_BYTES + 1)
        if len(data) > LOGO_MAX_BYTES:
            raise LogoFetchError('图标超过大小上限')
        return data, content_type


def _is_icon_content(data, content_type):
    """校验下载内容确为图标/图片。"""
    if content_type in LOGO_CONTENT_TYPES:
        return True
    if data[:4] in (b'\x89PNG', b'\xff\xd8\xff', b'GIF8') or data[:2] == b'\x00\x00':
        return True  # PNG/JPEG/GIF 魔数，以及 .ico 常见头部
    if b'<svg' in data[:2048].lower():
        return True
    return False


def _icon_candidates(site, html=None):
    """返回优先尝试的图标候选 URL 列表。

    顺序：站点自身 <link rel="icon"> → /favicon.ico →
    第三方公共图标服务兜底（SITE_LOGO_PROVIDERS，{domain} 替换为站点域名）。
    """
    origin = _origin_of(site.url)
    candidates = []
    if html:
        # 解析 <link rel="icon|shortcut icon|apple-touch-icon" href="...">
        for href in re.findall(r'<link[^>]+rel=["\'][^"\']*icon[^"\']*["\'][^>]*>', html):
            m = re.search(r'href=["\']([^"\']+)["\']', href)
            if not m:
                continue
            candidates.append(m.group(1))
    candidates.append('/favicon.ico')
    resolved = []
    for c in candidates:
        if c.startswith('http://') or c.startswith('https://'):
            resolved.append(c)
        elif c.startswith('//'):
            parsed = urllib.parse.urlparse(site.url)
            resolved.append(f'{parsed.scheme}:{c}')
        else:
            resolved.append(origin + (c if c.startswith('/') else '/' + c))

    domain = urllib.parse.urlparse(site.url).netloc
    providers = getattr(settings, 'SITE_LOGO_PROVIDERS', None) or []
    for tmpl in providers:
        try:
            resolved.append(tmpl.format(domain=domain))
        except (KeyError, IndexError, ValueError):
            continue
    # 去重（保持顺序）
    return list(dict.fromkeys(resolved))


def _validate_and_save(site, data, content_type):
    """用 PIL 验证图片有效性，规范化后写入 site.logo 并返回。"""
    from io import BytesIO

    from django.core.files.base import ContentFile

    from PIL import Image

    img = Image.open(BytesIO(data))
    img.load()

    ext_map = {
        'image/png': 'PNG',
        'image/jpeg': 'JPEG',
        'image/gif': 'GIF',
        'image/webp': 'WEBP',
        'image/x-icon': 'PNG',
        'image/vnd.microsoft.icon': 'PNG',
        'image/svg+xml': 'SVG',
    }
    fmt = ext_map.get(content_type, img.format or 'PNG')
    safe_fmt = fmt if fmt in ('PNG', 'JPEG', 'GIF', 'WEBP', 'SVG') else 'PNG'

    if safe_fmt == 'SVG':
        site.logo.save(
            f'logo-{site.pk}.svg',
            ContentFile(data),
            save=False,
        )
        site.logo_fetched_at = timezone.now()
        site.save(update_fields=['logo', 'logo_fetched_at', 'updated_at'])
        return site.logo.url

    buffer = BytesIO()
    if img.mode not in ('RGB', 'RGBA'):
        img = img.convert('RGBA' if img.mode == 'P' and 'transparency' in img.info else 'RGB')
    img.save(buffer, format='PNG')
    site.logo.save(
        f'logo-{site.pk}.png',
        ContentFile(buffer.getvalue()),
        save=False,
    )
    site.logo_fetched_at = timezone.now()
    site.save(update_fields=['logo', 'logo_fetched_at', 'updated_at'])
    return site.logo.url


def fetch_and_cache_logo(site):
    """按需发现并缓存站点 favicon 到本站 media。

    - 并发保护：同一站点同时只允许一个线程拉取。
    - 优先解析页面 <link rel="icon">，兜底 /favicon.ico 与第三方公共图标服务。
    - 校验图片有效性，统一转 PNG 缓存。
    - 成功才记录 logo_fetched_at；失败不写，下次访问自动重试。
    """
    if site.logo:
        return site.logo.url
    with _logo_lock(site.pk):
        if site.logo:
            return site.logo.url
        site.refresh_from_db(fields=['logo', 'logo_fetched_at'])
        if site.logo:
            return site.logo.url
        try:
            html = None
            try:
                origin = _origin_of(site.url)
                page, _ = _fetch_bytes(origin)
                if len(page) > 256 * 1024:
                    page = page[:256 * 1024]
                html = page.decode('utf-8', errors='ignore')
            except Exception:
                html = None
            candidates = _icon_candidates(site, html)
            data, content_type = None, ''
            last_error = None
            for url in candidates:
                try:
                    data, content_type = _fetch_bytes(url)
                    if _is_icon_content(data, content_type):
                        break
                except Exception as exc:
                    last_error = exc
                    data, content_type = None, ''
            if not data:
                raise LogoFetchError(
                    f'未能获取到站点图标{": " + str(last_error) if last_error else ""}'
                )
            return _validate_and_save(site, data, content_type)
        except Exception as exc:
            if not isinstance(exc, LogoFetchError):
                exc = LogoFetchError(str(exc))
            raise exc


# ------------------- 后台异步拉取图标 -------------------

_logo_inflight = set()


def ensure_logo_async(site_id):
    """后台异步拉取站点图标，立即返回，不阻塞请求。

    - 同一站点同时只允许一个后台线程（防并发详情访问线程堆积）。
    - 失败不写 logo_fetched_at，下次访问自动重试（与同步逻辑一致）。
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
        if site.logo or site.logo_fetched_at:
            return
        fetch_and_cache_logo(site)
    except Exception:
        # 失败不写 logo_fetched_at，下次访问自动重试
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
    req = urllib.request.Request(url, headers=dict(headers, Range='bytes=0-0'))
    try:
        with urllib.request.urlopen(req, timeout=PROBE_TIMEOUT) as resp:
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
            with urllib.request.urlopen(req, timeout=SEGMENT_TIMEOUT) as resp:
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
    req = urllib.request.Request(url, headers=headers)
    tmp = dest + '.part'
    size = 0
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
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
