import type { MetadataRoute } from 'next'
import { fetchSettings, serverFetchJSON } from '@/lib/serverFetch'

interface SitemapSite {
  id: number
  updated_at: string | null
}

interface SitemapResponse {
  sites: SitemapSite[]
}

/**
 * 站点地图。
 *
 * 约定：
 * - 只收录可索引的主页面（首页、全部站点索引、站点详情页）。
 * - 不收录 /search（站内结果页为无限 URL 变体，已设 noindex）与
 *   /sites?page=N（分页 URL 靠站内链接发现即可，重复内容价值低）。
 * - lastmod 只用站点真实更新时间；没有真实时间就不写，避免「全站同一天」
 *   的批量生成痕迹让搜索引擎降低对 sitemap 的信任。
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await fetchSettings()
  const base = settings?.share_base_url || process.env.NEXT_PUBLIC_DEFAULT_DOMAIN || 'https://fn.9418666.xyz'

  const urls: MetadataRoute.Sitemap = [
    { url: base, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/sites`, changeFrequency: 'weekly', priority: 0.7 },
  ]

  try {
    const data = await serverFetchJSON<SitemapResponse>('/sites/sitemap/')
    for (const site of data.sites) {
      const lastmod = site.updated_at?.split('T')[0]
      urls.push({
        url: `${base}/site/${site.id}`,
        ...(lastmod ? { lastModified: lastmod } : {}),
        changeFrequency: 'weekly',
        priority: 0.6,
      })
    }
  } catch {
    // 静默失败：至少保留首页与站点索引
  }

  return urls
}

// 每次请求实时生成：构建阶段（镜像构建容器）无法访问后端，
// 若在构建期静态生成会长期输出「只有 2 条」的错误 sitemap。
export const dynamic = 'force-dynamic'
