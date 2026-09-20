import type { MetadataRoute } from 'next'
import { fetchSettings, serverFetchJSON } from '@/lib/serverFetch'

interface SitemapSite {
  id: number
  updated_at: string
}

interface SitemapResponse {
  sites: SitemapSite[]
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await fetchSettings()
  const base = settings?.share_base_url || process.env.NEXT_PUBLIC_DEFAULT_DOMAIN || 'https://fn.9418666.xyz'

  const now = new Date().toISOString().split('T')[0]

  const urls: MetadataRoute.Sitemap = [
    { url: base, lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: `${base}/search`, lastModified: now, changeFrequency: 'daily', priority: 0.8 },
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

  return urls
}

export const revalidate = 3600