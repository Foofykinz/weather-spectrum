import React from 'react';
import { Link } from 'react-router-dom';
import { CITIES, RADARS, STATION_PAGES } from '../seo/places';
import { cityPath, stationPath } from '../seo/meta';

const PRODUCTS = [
  'Super-resolution reflectivity',
  'Base and storm-relative velocity',
  'Correlation coefficient',
  'Differential reflectivity',
  'Specific differential phase',
  'Hydrometeor classification',
  'Echo tops and VIL',
  'Satellite lightning',
];

const SOURCES = [
  {
    name: 'NOAA / National Weather Service',
    use: 'Single-radar velocity and hydrometeor classification imagery, and national composite reflectivity and echo tops (MRMS), from the radar.weather.gov map service.',
    href: 'https://radar.weather.gov/',
  },
  {
    name: 'NOAA NEXRAD Level III',
    use: 'Correlation coefficient, differential reflectivity, specific differential phase, enhanced echo tops and digital VIL, decoded from radar data published through the NOAA Open Data Dissemination program (Unidata, AWS).',
    href: 'https://registry.opendata.aws/noaa-nexrad/',
  },
  {
    name: 'Iowa Environmental Mesonet',
    use: 'National base reflectivity mosaic, super-resolution base reflectivity and storm-relative velocity imagery. Iowa State University.',
    href: 'https://mesonet.agron.iastate.edu/',
  },
  {
    name: 'NOAA GOES-19 and GOES-18 GLM',
    use: 'Satellite-detected lightning flashes from the Geostationary Lightning Mapper, published through the NOAA Open Data Dissemination program (AWS) and processed by Weather Spectrum.',
    href: 'https://www.goes-r.gov/spacesegment/glm.html',
  },
  {
    name: 'OpenFreeMap',
    use: 'Basemap. Map data from OpenMapTiles and OpenStreetMap contributors.',
    href: 'https://openfreemap.org/',
  },
];

// Real pictures from the site for each feature (dates in the captions).
const SHOTS = {
  radar: [
    {
      src: '/examples/live-radar-terrain.jpg',
      w: 1400,
      h: 900,
      alt: 'Weather Spectrum live radar on the terrain map: national reflectivity with rain across the Southeast, and National Weather Service warnings and alerts outlined across the country.',
      caption: 'The live radar on the terrain map with NWS warnings and alerts, November 25, 2026.',
    },
  ],
  graphics: [
    {
      src: '/examples/tornado-risk-december-post.jpg',
      w: 1080,
      h: 1080,
      alt: 'Weather graphic made with Weather Spectrum: the average December tornado risk area over the Gulf Coast states, with Typical and Greater areas.',
      caption: 'Tornado season post: the average December tornado risk area, from NOAA storm records 1996 to 2025.',
    },
    {
      src: '/examples/high-wind-warning-post.jpg',
      w: 1080,
      h: 1080,
      alt: 'Weather graphic made with Weather Spectrum: national radar over the Mid-Atlantic with High Wind Warning areas shaded in gold and a list of active warnings.',
      caption: 'Radar post: High Wind Warnings across the Mid-Atlantic, November 25, 2026.',
    },
  ],
  replays: [
    {
      src: '/examples/moore-2013-replay.jpg',
      w: 974,
      h: 558,
      alt: 'Weather Spectrum tornado replay: KTLX reflectivity of the Moore, Oklahoma tornado on May 20, 2013, with the hook echo near Moore inside the tornado warnings.',
      caption: 'Replay of the Moore, Oklahoma tornado on May 20, 2013: KTLX reflectivity at 3:08 PM CDT with the tornado warnings in effect.',
    },
  ],
};

const FEATURES = [
  {
    shots: 'radar',
    title: 'Advanced NEXRAD radar',
    text: 'The products storm chasers and weather enthusiasts rely on: single-radar reflectivity and velocity, correlation coefficient, differential reflectivity, hydrometeor classification, echo tops and VIL, plus the national mosaic. Tap the map to read exact values, compare up to four products side by side, and turn on warnings, watches, storm markers, satellite lightning and station temperatures or wind.',
    to: '/radar',
    link: 'Open the advanced radar',
  },
  {
    shots: 'graphics',
    title: 'Weather graphics and radar videos',
    text: 'Turn the radar view into a post: a headline header with ready-made looks, warning lists, labels and arrows pinned to the map, your own logo and colors, and a caption written from the NWS alerts. Save it as an image or a short radar video sized for social media, whether you run a weather page or are posting from a chase.',
    to: '/weather-graphics',
    link: 'See the weather graphics',
  },
  {
    shots: 'replays',
    title: 'Historic tornado radar replays',
    text: 'Replay the real archived radar scans from tornadoes such as Bridge Creek-Moore in 1999, Greensburg, Joplin, El Reno, Rolling Fork and Enderlin, with the National Weather Service warnings as they were issued and the official facts from each storm survey.',
    to: '/events',
    link: 'See the tornado replays',
  },
];

function Shot({ shot, eager = false }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/60">
      <img src={shot.src} alt={shot.alt} width={shot.w} height={shot.h} loading={eager ? 'eager' : 'lazy'} className="h-auto w-full" />
      <figcaption className="px-4 py-3 text-sm leading-relaxed text-slate-400">{shot.caption}</figcaption>
    </figure>
  );
}

export default function Home() {
  return (
    <div className="bg-gradient-to-b from-slate-900 to-slate-950">
      {/* Hero */}
      <section>
        <div className="max-w-5xl mx-auto px-5 sm:px-6 pt-14 pb-12 sm:pt-20 sm:pb-16">
          <h1 className="text-4xl sm:text-6xl font-bold leading-[1.05] tracking-tight text-white">
            Free live weather radar
            <span className="block">across the United States</span>
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-slate-300 max-w-3xl">
            Track storms with live NOAA NEXRAD Doppler radar, severe weather warnings, satellite lightning and detailed
            radar products, updated as each scan arrives. Replay historic tornadoes, and turn the radar into weather graphics
            and videos you can share.
          </p>

          <div className="mt-8">
            <Link to="/radar" className="inline-block rounded-xl ws-spectrum px-8 py-3.5 text-lg font-bold text-slate-950">
              Live Radar
            </Link>
          </div>

          <ul className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-400 max-w-3xl">
            {PRODUCTS.map((p) => (
              <li key={p} className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-sky-400/70" aria-hidden />
                {p === 'Satellite lightning' ? (
                  <Link to="/lightning" className="underline decoration-white/20 underline-offset-4 hover:text-white">{p}</Link>
                ) : (
                  p
                )}
              </li>
            ))}
          </ul>

          <div className="mt-10">
            <Shot shot={SHOTS.radar[0]} eager />
          </div>
        </div>
      </section>

      {/* What the site does */}
      <section className="border-t border-white/5">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 py-14 sm:py-16">
          <h2 className="text-2xl sm:text-3xl font-bold text-white">More than a radar map</h2>
          <p className="mt-3 max-w-3xl leading-relaxed text-slate-400">
            Weather Spectrum is a free interactive weather radar built on real NOAA NEXRAD Doppler data. No account or app is
            needed: open the radar in your browser and it shows every scan as it comes in.
          </p>
          <div className="mt-10 space-y-14">
            {FEATURES.map(({ title, text, to, link, shots }, i) => {
              // The radar picture is already at the top of the page.
              const pics = shots === 'radar' ? [] : SHOTS[shots];
              return (
                <div key={title} className={`grid items-center gap-6 md:gap-10 ${pics.length ? 'md:grid-cols-2' : ''}`}>
                  <div className={pics.length && i % 2 === 0 ? 'md:order-2' : ''}>
                    <h3 className="text-2xl font-semibold text-white">{title}</h3>
                    <p className="mt-3 max-w-3xl leading-relaxed text-slate-400">{text}</p>
                    <Link
                      to={to}
                      className="mt-5 inline-block rounded-xl border border-white/15 px-5 py-2.5 font-semibold text-slate-100 hover:bg-white/5"
                    >
                      {link}
                    </Link>
                  </div>
                  {pics.length > 0 && (
                    <div className={`grid gap-4 ${pics.length > 1 ? 'sm:grid-cols-2' : ''}`}>
                      {pics.map((shot) => (
                        <Shot key={shot.src} shot={shot} />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Local radar pages */}
      <section className="border-t border-white/5">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 py-14">
          <h2 className="text-2xl font-bold text-white">Local radar</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <ul className="space-y-2 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
              {CITIES.map((c) => (
                <li key={c.slug}>
                  <Link to={cityPath(c)} className="text-sky-300 hover:text-sky-200 font-medium">
                    {c.name} weather radar
                  </Link>
                  <span className="text-sm text-slate-400"> · {RADARS[c.primary].icao}</span>
                </li>
              ))}
            </ul>
            <ul className="space-y-2 rounded-2xl border border-white/10 bg-slate-900/60 p-5">
              {STATION_PAGES.map((id) => (
                <li key={id}>
                  <Link to={stationPath(RADARS[id])} className="text-sky-300 hover:text-sky-200 font-medium">
                    {RADARS[id].icao} NEXRAD radar
                  </Link>
                  <span className="text-sm text-slate-400"> · {RADARS[id].name}, {RADARS[id].state}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Data sources and attribution */}
      <section className="border-t border-white/5">
        <div className="max-w-5xl mx-auto px-5 sm:px-6 py-16 sm:py-20">
          <h2 className="text-2xl font-bold text-white">Data sources</h2>
          <p className="mt-3 text-slate-400 max-w-3xl leading-relaxed">
            Weather Spectrum displays real observations published by the organizations below. It is an independent project
            and is not affiliated with or endorsed by any of them. Data can be delayed or unavailable; follow official
            National Weather Service warnings for safety decisions.
          </p>
          <dl className="mt-10 grid gap-4 sm:grid-cols-2">
            {SOURCES.map((s) => (
              <div key={s.name} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5">
                <dt>
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-white hover:text-sky-300 transition-colors">
                    {s.name}
                  </a>
                </dt>
                <dd className="mt-2 text-sm leading-relaxed text-slate-400">{s.use}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
