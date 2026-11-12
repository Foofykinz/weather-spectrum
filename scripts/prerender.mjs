// Build step: write static HTML for every public page.
//
// Runs after `vite build` (browser bundle) and `vite build --ssr` (render
// function). For each page it renders the React output and inserts that page's
// own <head> tags (title, description, canonical, Open Graph, structured data),
// so search engines and link previews get real content without running
// JavaScript. Also writes sitemap.xml and 404.html.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.cwd();
const dist = join(root, 'dist');
const { render, allPages, headTags } = await import(pathToFileURL(join(root, 'dist-ssr', 'entry-server.js')).href);

const template = readFileSync(join(dist, 'index.html'), 'utf8')
  .replace(/\s*<title>[\s\S]*?<\/title>/, '')
  .replace(/\s*<meta name="description"[^>]*>/, '');
if (!template.includes('<div id="root"></div>')) throw new Error('index.html has no empty #root to fill.');

const pages = allPages();
const written = [];
for (const path of Object.keys(pages)) {
  const url = path === '/404' ? '/this-page-does-not-exist' : path;
  const body = render(url);
  const html = template
    .replace('</head>', `    ${headTags(path)}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${body}</div>`);
  const out = path === '/' ? join(dist, 'index.html') : path === '/404' ? join(dist, '404.html') : join(dist, `${path.slice(1)}.html`);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  written.push(`${path} -> ${out.slice(root.length + 1)} (${Math.round(html.length / 1024)} KB)`);
}

// Sitemap: indexable pages plus the standalone legal documents.
const SITE = 'https://theweatherspectrum.com';
const today = new Date().toISOString().slice(0, 10);
const urls = Object.entries(pages)
  .filter(([, m]) => !m.noindex)
  .map(([p]) => p)
  .concat(['/privacy-policy', '/terms-of-service']);
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((p) => `  <url><loc>${SITE}${p === '/' ? '/' : p}</loc><lastmod>${today}</lastmod></url>`).join('\n')}
</urlset>
`;
writeFileSync(join(dist, 'sitemap.xml'), sitemap);

console.log(`Prerendered ${written.length} pages:\n  ${written.join('\n  ')}\nsitemap.xml: ${urls.length} URLs`);
