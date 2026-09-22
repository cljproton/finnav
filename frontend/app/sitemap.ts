import type { MetadataRoute } from 'next'
import { fetchSettings, serverFetchJSON } from '@/lib/serverFetch'

interface SitemapSite {
  id: number
  updated_at: string
}

interface SitemapResponse {
  sites: SitemapSite[]
}

interface SitePage {
  count: number
  results: unknown[]
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await fetchSettings()
  const base = settings?.share_base_url || process.env.NEXT_PUBLIC_DEFAULT_DOMAIN || 'https://fn.9418666.xyz'

  const now = new Date().toISOString().split('T')[0]

  const urls: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/search`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: `${base}/sites`, lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
  ]

  try {
    const data = await serverFetchJSON<SitemapResponse>('/sites/sitemap/')
    data.sites.forEach((site) => {
      const lastmod = site.updated_at?.split('T')[0] || now
      urls.push({
        url: `${base}/site/${site.id}`,
        lastModified: lastmod,
        changeFrequency: 'weekly',
        priority: 0.6,
      })
    })
  } catch {
    // 静默失败：至少保留首页和搜索页
  }

  // 站点索引页分页 URL（每页行数来自全局设置，缺少时用结果长度/默认 20 兜底）。
  try {
    const data = await serverFetchJSON<SitePage>('/sites/')
    const count = data.count ?? 0
    if (count > 0) {
      const perPage = settings?.sites_per_page || 20
      const total = Math.ceil(count / Math.max(perPage, 1))
      for (let p = 2; p <= total; p++) {
        urls.push({
          url: `${base}/sites?page=${p}`,
          lastModified: now,
          changeFrequency: 'weekly',
          priority: 0.5,
        })
      }
    }
  } catch {
    // 静默失败：不追加分页 URL
  }

  return urls
}

export const revalidate = 3600