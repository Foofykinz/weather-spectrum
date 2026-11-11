// Per-page metadata: title, description, canonical URL, social sharing and
// structured data. Used by the prerender step (static HTML for search
// engines) and by useSeo() during in-app navigation.

import { CITIES, RADARS, STATION_PAGES, WFO_NAMES, stateName } from './places';

export const SITE = 'https://theweatherspectrum.com';
export const SITE_NAME = 'Weather Spectrum';
export const OG_IMAGE = `${SITE}/og-image.png`;

const ORG = { '@type': 'Organization', name: SITE_NAME, url: SITE, logo: `${SITE}/apple-touch-icon.png` };

function breadcrumbs(items) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, path], i) => ({ '@type': 'ListItem', position: i + 1, name, item: SITE + path })),
  };
}

export const cityPath = (c) => `/radar/${c.slug}`;
export const stationPath = (r) => `/stations/${r.icao.toLowerCase()}`;

const STATIC = {
  '/': {
    title: 'Weather Spectrum | Live NEXRAD Weather Radar',
    description:
      'Live NEXRAD weather radar: super-resolution reflectivity and velocity, dual-polarization products, echo tops and GOES satellite lightning from NOAA data.',
    jsonLd: [
      { '@type': 'WebSite', name: SITE_NAME, url: SITE },
      ORG,
    ],
  },
  '/radar': {
    title: 'Live Radar | Weather Spectrum',
    description:
      'Full-screen NEXRAD radar with reflectivity, velocity, correlation coefficient, ZDR, KDP, echo tops, VIL, multi-panel views, loops and GOES lightning.',
    jsonLd: [{ '@type': 'WebApplication', name: `${SITE_NAME} Radar`, url: `${SITE}/radar`, applicationCategory: 'WeatherApplication', operatingSystem: 'Any', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' } }],
  },
  '/about': {
    title: 'About | Weather Spectrum',
    description: 'What Weather Spectrum is, where its radar and lightning data come from, and how it should and should not be used.',
    jsonLd: [{ '@type': 'AboutPage', name: 'About Weather Spectrum', url: `${SITE}/about` }, ORG],
  },
  '/admin': { title: 'Admin | Weather Spectrum', description: 'Administration.', noindex: true },
  '/404': { title: 'Page not found | Weather Spectrum', description: 'This page does not exist.', noindex: true },
};

function cityMeta(c) {
  const r = RADARS[c.primary];
  return {
    title: `${c.name} Weather Radar | Live ${r.icao} NEXRAD | Weather Spectrum`,
    description: `Live NEXRAD radar for ${c.name}, ${stateName(c.state)}: ${r.icao} reflectivity, velocity and dual-pol products, the radars that cover the city, and how high their beams are over it.`,
    jsonLd: [
      {
        '@type': 'WebPage',
        name: `${c.name} Weather Radar`,
        url: SITE + cityPath(c),
        about: { '@type': 'City', name: `${c.name}, ${stateName(c.state)}`, geo: { '@type': 'GeoCoordinates', latitude: c.lat, longitude: c.lon } },
      },
      breadcrumbs([['Home', '/'], ['Radar', '/radar'], [`${c.name} radar`, cityPath(c)]]),
    ],
  };
}

function stationMeta(r) {
  return {
    title: `${r.icao} NEXRAD Radar, ${r.name}, ${stateName(r.state)} | Weather Spectrum`,
    description: `${r.icao} (${r.name}, ${r.state}) WSR-88D radar: location, elevation, NWS ${WFO_NAMES[r.wfo]} office, current scan and available elevation tilts, with live products.`,
    jsonLd: [
      {
        '@type': 'WebPage',
        name: `${r.icao} NEXRAD radar`,
        url: SITE + stationPath(r),
        about: { '@type': 'Place', name: `${r.icao} WSR-88D weather radar`, geo: { '@type': 'GeoCoordinates', latitude: r.lat, longitude: r.lon, elevation: r.elevationM } },
      },
      breadcrumbs([['Home', '/'], ['Radar', '/radar'], [r.icao, stationPath(r)]]),
    ],
  };
}

// All prerendered pages (path -> meta). Order is used for the sitemap.
export function allPages() {
  const pages = { ...STATIC };
  for (const c of CITIES) pages[cityPath(c)] = cityMeta(c);
  for (const id of STATION_PAGES) pages[stationPath(RADARS[id])] = stationMeta(RADARS[id]);
  return pages;
}

export function metaFor(path) {
  const pages = allPages();
  const clean = path.replace(/\/+$/, '') || '/';
  return pages[clean] || pages['/404'];
}

// <head> tags for a page, as HTML (used by the prerender step).
export function headTags(path) {
  const m = metaFor(path);
  const clean = path.replace(/\/+$/, '') || '/';
  const canonical = SITE + (clean === '/' ? '/' : clean);
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const tags = [
    `<title>${esc(m.title)}</title>`,
    `<meta name="description" content="${esc(m.description)}" />`,
    m.noindex ? '<meta name="robots" content="noindex" />' : `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${esc(m.title)}" />`,
    `<meta property="og:description" content="${esc(m.description)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
    `<meta property="og:image" content="${OG_IMAGE}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(m.title)}" />`,
    `<meta name="twitter:description" content="${esc(m.description)}" />`,
    `<meta name="twitter:image" content="${OG_IMAGE}" />`,
  ];
  if (m.jsonLd && !m.noindex) {
    const graph = { '@context': 'https://schema.org', '@graph': m.jsonLd };
    tags.push(`<script type="application/ld+json">${JSON.stringify(graph).replace(/</g, '\\u003c')}</script>`);
  }
  return tags.join('\n    ');
}
