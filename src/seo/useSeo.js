import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { metaFor, SITE } from './meta';

function setMeta(selector, attr, value, create) {
  let el = document.head.querySelector(selector);
  if (!el && create) {
    el = create();
    document.head.appendChild(el);
  }
  if (el) el.setAttribute(attr, value);
}

// Keeps <title>, description, canonical and social tags right when navigating
// inside the app (the first page load already has them from prerendering).
// Query strings (e.g. radar settings) never change the canonical URL.
export function useSeo() {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname === '/radar') return; // the radar page manages its own title
    const m = metaFor(pathname);
    const clean = pathname.replace(/\/+$/, '') || '/';
    const canonical = SITE + (clean === '/' ? '/' : clean);
    document.title = m.title;
    setMeta('meta[name="description"]', 'content', m.description, () => Object.assign(document.createElement('meta'), { name: 'description' }));
    setMeta('meta[property="og:title"]', 'content', m.title);
    setMeta('meta[property="og:description"]', 'content', m.description);
    setMeta('meta[property="og:url"]', 'content', canonical);
    setMeta('link[rel="canonical"]', 'href', canonical);
  }, [pathname]);
}
