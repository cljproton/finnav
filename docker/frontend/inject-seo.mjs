// 构建期向 Expo Web 导出的 SPA 壳注入兜底 SEO 标签（title/description/canonical/robots）。
//
// 为什么不用 sed：SEO_TITLE/DESCRIPTION 为用户输入，可能包含 sed 分隔符、& 等
// 特殊字符（如 `金融与 Web3 站点导航 | FinNav` 里的 `|` 会让 `s|...|...|` 解析错乱，
// 触发 "bad option in substitution expression"）。改用 Node字符串替换从根本上规避。
// if 检查保留原语义：若 dist/index.html 已含 robots 标签则跳过，幂等。
import fs from 'node:fs';

const target = process.argv[2] ?? 'dist/index.html';
const title = process.env.SEO_TITLE || 'FinNav';
const description = process.env.SEO_DESCRIPTION || '';
const origin = (process.env.SEO_ORIGIN || '').replace(/\/+$/, '');

let html = fs.readFileSync(target, 'utf8');
if (/meta\s+name=["']robots["']/i.test(html)) {
  console.log('[inject-seo] 已存在 robots 标签，跳过注入');
  process.exit(0);
}

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inject =
  `\n  <meta name="robots" content="index,follow" />` +
  `\n  <meta name="description" content="${esc(description)}" />` +
  `\n  <link rel="canonical" href="${esc(origin)}/" />`;

html = html.replace(/<head>/i, (m) => m + inject);
html = html.replace(/<title>FinNav[^<]*<\/title>/i, `<title>${esc(title)}</title>`);

fs.writeFileSync(target, html);
console.log(`[inject-seo] SPA 壳兜底 SEO 已注入: title=${title} canonical=${origin}/`);
