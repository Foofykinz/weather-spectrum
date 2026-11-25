import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

// Landing page for the post maker (radar posts and tornado warning posts).
// Everything described here is a feature the post makers have today; the
// example images were made with them from real data (dates in the captions).

const EXAMPLES = [
  {
    src: '/examples/high-wind-warning-post.jpg',
    alt: 'Weather graphic made with Weather Spectrum: national radar over the Mid-Atlantic with High Wind Warning areas shaded in gold, a High Wind Warning header, a list of active warnings with end times and the counties in the banner.',
    caption: 'Radar post, Alert style: the High Wind Warnings across the Mid-Atlantic on November 25, 2026, with end times and counties from the NWS alerts.',
  },
  {
    src: '/examples/tornado-warnings-may-2024-post.jpg',
    alt: 'Weather graphic made with Weather Spectrum: map of every tornado warning polygon issued in May 2024, with a count of 983 warnings, the busiest day and states, and a bar chart by day.',
    caption: 'Tornado warning post: every tornado warning issued in May 2024, with the total, busiest day, top states and a chart by day.',
  },
];

const STEPS = [
  ['Frame the radar', 'Open the live radar, pick a product such as national reflectivity, single-radar reflectivity or velocity, turn on the overlays you want, and move the map to the area you are covering.'],
  ['Press Post', 'The post maker copies the map exactly as it is on screen and fills in a headline, the active alerts in view and a caption from the National Weather Service alerts.'],
  ['Make it yours', 'Pick a size and style, restyle the header, add labels and arrows, and add your logo and colors. Tap anything on the picture to edit it.'],
  ['Save or share', 'Save the image, copy the caption, share straight from your phone, or save every size at once. For video, record the radar loop as a vertical video.'],
];

const FEATURES = [
  {
    title: 'Sizes for every platform',
    text: 'Square (1080 x 1080), wide (1200 x 630) and tall (1080 x 1350) images, plus vertical 1080 x 1920 radar videos for Reels, Shorts and TikTok. "Save all sizes" makes every image size in one go.',
  },
  {
    title: 'Headers with ready-made looks',
    text: 'Standard, warning color, breaking news, minimal, lower third, caution tape and glass looks, or build your own: fonts, colors, a tag with an icon, background, accent stripe, position and size.',
  },
  {
    title: 'Labels, arrows and circles pinned to the map',
    text: 'Labels stay on the town they point at, even if the picture size changes. Style text with fonts, colors, boxes, pills, highlights, outlines, shadows and glow, and pick from curved, double, open and block arrows. Undo and redo included.',
  },
  {
    title: 'Captions from the NWS alerts',
    text: 'The caption is written from the alerts in view: the warning, the areas it covers and when it ends, in the time zone you choose. Edit it or copy it as is.',
  },
  {
    title: 'Your branding',
    text: 'Add your page name, link, logo and colors, and place your logo on the map like any other mark. Every post keeps a small data credit for NOAA/NWS and the map.',
  },
  {
    title: 'Warnings drawn the way you want',
    text: 'Warnings, watches and wind and winter alerts in view are drawn on the picture. Set how solid the fill is, from barely visible to solid, and change their colors.',
  },
  {
    title: 'Templates and autosave',
    text: 'Save a look as a template to reuse on the next post. Your work in progress is saved in your browser as you go, and older drafts come back without their old alert text so expired details stay out of new posts.',
  },
  {
    title: 'Tornado warning recaps',
    text: 'On the tornado warnings page, turn any year, month or week into a recap graphic: every warning polygon on the map, the total, the busiest day, the top states and a chart by day.',
  },
];

export default function WeatherGraphics() {
  return (
    <div className="bg-gradient-to-b from-slate-900 to-slate-950">
      <div className="max-w-5xl mx-auto px-5 sm:px-6 py-10 sm:py-14">
        <nav aria-label="Breadcrumb" className="text-xs text-slate-400">
          <Link to="/" className="hover:text-white">Home</Link> <span aria-hidden>/</span> Weather graphics
        </nav>
        <h1 className="mt-4 text-3xl sm:text-5xl font-bold tracking-tight text-white">
          Weather graphics and radar videos <span className="ws-spectrum-text">from real NEXRAD data</span>
        </h1>
        <p className="mt-4 text-lg text-slate-300 leading-relaxed max-w-3xl">
          Turn the live radar and National Weather Service alerts into a finished post in a couple of minutes: a clear headline,
          the warnings on the map, your labels and branding, and a caption ready to paste. Free, in your browser, no design
          software needed.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            to="/radar?post=1"
            className="inline-flex items-center gap-2 rounded-xl ws-spectrum px-6 py-3 font-semibold text-slate-950 shadow-lg shadow-sky-400/20"
          >
            Make a weather graphic <ArrowRight className="h-5 w-5" aria-hidden />
          </Link>
          <Link to="/tornado-warnings" className="inline-flex items-center rounded-xl border border-white/15 px-6 py-3 font-semibold text-slate-100 hover:bg-white/5">
            Make a tornado warning recap
          </Link>
        </div>

        <section className="mt-12">
          <h2 className="sr-only">Examples</h2>
          <div className="grid gap-6 md:grid-cols-2">
            {EXAMPLES.map((e) => (
              <figure key={e.src} className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60">
                <img src={e.src} alt={e.alt} width="1080" height="1080" loading="lazy" className="h-auto w-full" />
                <figcaption className="px-4 py-3 text-sm leading-relaxed text-slate-400">{e.caption}</figcaption>
              </figure>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Both examples were made with Weather Spectrum&apos;s post makers from real NWS data, without edits.</p>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold text-white">How it works</h2>
          <ol className="mt-6 grid gap-4 sm:grid-cols-2">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                <div className="text-sm font-semibold text-sky-300">Step {i + 1}</div>
                <h3 className="mt-1 text-lg font-semibold text-white">{t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold text-white">What you can make</h2>
          <dl className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title}>
                <dt className="font-semibold text-white">{f.title}</dt>
                <dd className="mt-1.5 text-sm leading-relaxed text-slate-400">{f.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mt-14">
          <h2 className="text-2xl font-semibold text-white">Made for people who post about the weather</h2>
          <p className="mt-3 text-slate-300 leading-relaxed max-w-3xl">
            Local weather pages, storm chasers posting from the road, emergency managers, schools and newsrooms all need the same
            thing when weather hits: a clear, accurate graphic, fast. Because every post starts from the real radar scan and the
            official alerts, the times, areas and warning types come from the source instead of being typed by hand.
          </p>
          <p className="mt-3 text-slate-300 leading-relaxed max-w-3xl">
            Graphics show what the radar and the National Weather Service showed at that moment. Always point your followers to
            official warnings at <a href="https://www.weather.gov" className="text-sky-300 hover:text-sky-200" target="_blank" rel="noopener noreferrer">weather.gov</a> for
            safety decisions.
          </p>
        </section>

        <section className="mt-12 border-t border-white/10 pt-8">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400">More from Weather Spectrum</h2>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            <li><Link to="/radar" className="text-sky-300 hover:text-sky-200">Live NEXRAD radar</Link></li>
            <li><Link to="/lightning" className="text-sky-300 hover:text-sky-200">Weather radar with lightning</Link></li>
            <li><Link to="/events" className="text-sky-300 hover:text-sky-200">Tornado radar replays</Link></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
