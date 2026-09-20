import type { MetadataRoute } from 'next'
import { fetchSettings } from '@/lib/serverFetch'

export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await fetchSettings()
  const base = settings?.share_base_url || process.env.NEXT_PUBLIC_DEFAULT_DOMAIN || 'https://fn.9418666.xyz'

  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/', '/admin/'] },
    sitemap: `${base}/sitemap.xml`,
  }
}