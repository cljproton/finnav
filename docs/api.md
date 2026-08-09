# API 契约 (v1)

前端（Expo）与后端（Django + DRF）之间的数据接口约定。

## 基本信息

- Base URL: `{API_BASE_URL}/api/`
- 开发默认地址: `http://localhost:8000`
- 格式: JSON, UTF-8

## 端点

### GET /api/health/

健康检查

```json
{ "status": "ok" }
```

### 认证（JWT，邮箱注册 + 邮箱验证码）

- `POST /api/auth/register/`  body `{ "email", "password" }` → `200 { "detail": "验证码已发送..." }`（先发验证码，未创建用户/不发 token）
- `POST /api/auth/verify/`    body `{ "email", "code", "password" }` → `201 { "access", "refresh" }`（验证码通过后才创建用户并签发 token）
- `POST /api/auth/password-reset/request/` body `{ "email" }` → `200 { "detail" }`（向已注册邮箱发重置验证码；未注册邮箱也返回同一提示，防枚举）
- `POST /api/auth/password-reset/confirm/` body `{ "email", "code", "password" }` → `200 { "detail": "密码已重置" }`
- `POST /api/auth/token/`      body `{ "email", "password" }` → `200 { "access", "refresh" }`（登录/获取 token）
- `POST /api/auth/token/refresh/` body `{ "refresh" }` → `200 { "access" }`

验证码 TTL 10 分钟、最多尝试 5 次；数据库仅存 SHA-256 哈希；未设置 `RESEND_API_KEY` 时邮件通过 console backend 打印到控制台（本地/测试用）。

打星/评论/个人化接口需在 `Authorization: Bearer <access>` 携带 access token。

### 个人化同步（需登录）

- `GET /api/me/` → `200 { "id", "email", "favorites": [SiteObject...], "favorite_ids": [...], "search_history": ["词", ...] }`
  - `favorites` 返回完整站点对象，便于新设备直接渲染收藏列表；`search_history` 最近在前。
- `PUT /api/me/favorites/` body `{ "site_ids": [1, 2] }` → `200 { "site_ids": [...] }`
  - 整体替换该用户收藏（必须先存在且启用）；站点不存在/未启用 → `400`。
- `PUT /api/me/search-history/` body `{ "terms": ["钱包", "交易所"] }` → `200 { "terms": [...] }`
  - 整体替换搜索历史，自动去重、最多保留 30 条（最近在前）。
- `DELETE /api/me/search-history/` → `200 { "terms": [] }`（清空搜索历史）。

同步策略：登录后前端将服务器数据与本地合并（服务器为权威），再把合并结果推回服务器，实现跨设备保持一致。

### GET /api/categories/

返回全部分类（含嵌套站点列表），按 sort_order 排序。

```json
[
  {
    "id": 1,
    "name": "DeFi",
    "slug": "defi",
    "icon": "🦄",
    "sort_order": 1,
    "sites": [
      { "SiteObject" }
    ]
  }
]
```

### GET /api/sites/

站点列表。查询参数:

- `q`: 按名称/描述/标签模糊搜索
- `category`: 按分类 slug 过滤
- `ordering`: `sort_order`（默认）/ `-sort_order` / `name` / `-name`

返回: `[ { "SiteObject" } ]`

### GET /api/sites/{id}/

单个站点详情。返回 `{ "SiteObject" }`

### POST /api/sites/{id}/visit/

记录一次站点访问（前端在打开详情页时调用一次）。无需登录。

```json
{ "id": 1, "visit_count": 12 }
```

### POST /api/sites/{id}/rate/

创建/更新当前登录用户对该站点的打分。**需 Bearer JWT**。一人一票（再次提交即覆盖，不重复计人）。

body `{ "score": 8.0, "comment": "很好用（可选）" }`

- `score`: 数字，0 到 5，0.5 递进（0, 0.5, 1, ... 5）
- `comment`: 可选字符串

```json
{ "id": 1, "score": 8.0, "comment": "很好用", "rating_count": 5, "rating_avg": 7.8 }
```

### DELETE /api/sites/{id}/rate/

删除当前登录用户对该站点的打分。**需 Bearer JWT**。返回 `204`。

### GET /api/settings/

站点全局设置（首页大标题/副标题，管理后台可改）。无需登录。

```json
{ "home_title": "探索好站", "home_subtitle": "发现优质的金融与 Web3 工具" }
```

## SiteObject

```json
{
  "id": 1,
  "name": "Uniswap",
  "description": "去中心化交易所",
  "url": "https://uniswap.org",
  "logo": "http://localhost:8000/media/logos/uniswap.png",
  "category": 1,
  "category_name": "DeFi",
  "tags": ["swap", "dex"],
  "sort_order": 1,
  "text_tutorials": [
    { "name": "新手指南", "url": "https://docs.uniswap.org" }
  ],
  "video_tutorials": [
    { "name": "教学视频", "url": "https://youtube.com/watch?v=xxx" }
  ],
  "agent_links": [
    { "name": "闲鱼代申请", "url": "https://2.taobao.com/item/xxx" }
  ],
  "app_android_url": "https://example.com/finnav.apk",
  "app_android_cache_url": "http://localhost:8000/media/app_cache/1/android/finnav.apk",
  "app_android_size": 52428800,
  "app_android_cached_at": "2026-08-05T12:00:00Z",
  "app_ios_url": "https://apps.apple.com/app/id123",
  "visit_count": 12,
  "rating_count": 5,
  "rating_avg": 7.8
}
```

字段说明：

- `logo`: 图片绝对 URL；未上传时为 `null`
- `tags`: 字符串数组
- `text_tutorials` / `video_tutorials` / `agent_links`: 链接数组，每项为 `{ "name": "展示名", "url": "链接" }`；无内容时为空数组 `[]`。三种链接均可有多个
- `app_android_url`: 后台配置的安卓 APP 原始下载链接；未配置时为空字符串 `""`
- `app_android_cache_url`: 安卓 APP 本地缓存（专用目录 `MEDIA/app_cache/{站点id}/android/`）下载绝对 URL；**仅后台「拉取并保存到本站」后才有**，未缓存时为 `null`
- `app_android_size`: 安卓缓存包大小（字节）；未缓存时为 `null`
- `app_android_cached_at`: 安卓缓存时间（ISO 8601）；未缓存时为 `null`
- `app_ios_url`: iOS App Store 链接（仅外链，不缓存）；未配置时为空字符串 `""`
- `visit_count`: 站点累计访问次数（打开详情页即计一次）
- `rating_count`: 参与打星的用户数（一人一票）
- `rating_avg`: 平均星级（0-5，保留 1 位）

前端约定：

- 视频教程链接通常为 YouTube/B站等视频地址，点击用系统浏览器打开
- 安卓：`app_android_cache_url` 存在时主按钮「下载安卓版（本站）」直接下载本地缓存；未缓存时仅显示「安卓版 原始下载」跳转原始链接
- iOS：仅显示「App Store 下载」按钮，直接打开 `app_ios_url`
- `agent_links` 为代办/辅助申请类链接（如闲鱼商品页），逐条展示

## 说明

- 收藏功能为前端本地实现（AsyncStorage），后端不存储用户数据。
- 注册用户（邮箱）可对站点打星（0-5、半星递进）+ 可选评论；每个站点汇总展示平均星级与评分人数。
- 后台「拉取安卓 APP」为**异步任务**：变更页点击后由前端轮询进度（`/admin/navigation/site/{id}/app-pull/{status|start|cancel}/`，仅登录管理员可用），可随时「取消」中断；中断或出错不会残留 `.part` 文件。
- 站点详情页支持一键转发（分享站点名称/描述/链接）。
- 管理后台: Django admin (AdminLTE 主题) `{API_BASE_URL}/admin/`。概览页分类统计各站点访问情况，并按「访问量 + 平均星级 + 评分数」综合排序 TOP10；管理员可自由添加/编辑分类与站点、上传 logo、上传 APP 安装包、维护教程/视频教程与代办链接。
