// Server-side rendering entry, used only by scripts/prerender.mjs at build
// time to write static HTML for each public page (so search engines and
// link previews see real content and metadata). Not shipped to browsers.
import React from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { AppShell } from './App';

export { allPages, headTags } from './seo/meta';

export function render(url) {
  return renderToString(
    <StaticRouter location={url}>
      <AppShell />
    </StaticRouter>
  );
}
