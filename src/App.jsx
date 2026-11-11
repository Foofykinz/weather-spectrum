import React, { Suspense, lazy, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { Radar } from 'lucide-react';
import Home from './pages/home';
import About from './pages/About';
import CityRadar from './pages/CityRadar';
import StationPage from './pages/StationPage';
import NotFound from './pages/NotFound';
import CookieConsent from './components/CookieConsent';
import { initOneSignal } from './utils/oneSignalConfig';
import { useSeo } from './seo/useSeo';
import { CITIES } from './seo/places';
import { cityPath } from './seo/meta';

// The radar application and admin page load on demand, so content pages
// (home, about, city and station pages) stay light.
const RadarPage = lazy(() => import('./pages/RadarPage'));
const Admin = lazy(() => import('./pages/Admin'));

const loading = <div className="fixed inset-0 z-[55] bg-[#0b0f17]" aria-label="Loading radar" />;

function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-gradient-to-r from-slate-900 to-blue-950/95 backdrop-blur">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <span className="w-9 h-9 rounded-full bg-gradient-to-br from-orange-400 to-yellow-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Radar className="w-5 h-5 text-slate-900" aria-hidden />
          </span>
          <span className="text-base sm:text-lg font-bold tracking-tight text-white">Weather Spectrum</span>
        </Link>
        <nav className="flex items-center gap-4 sm:gap-7 text-sm font-semibold whitespace-nowrap">
          <Link to="/radar" className="flex items-center gap-2 text-gray-300 hover:text-white transition-colors">
            <span className="w-2 h-2 rounded-full bg-red-500" aria-hidden />
            Live Radar
          </Link>
          <Link to="/about" className="text-gray-300 hover:text-white transition-colors">
            About
          </Link>
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/10 bg-slate-950">
      <div className="max-w-7xl mx-auto px-5 sm:px-6 py-10 text-sm">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="font-semibold text-white">Weather Spectrum</p>
            <p className="mt-1 text-slate-400 max-w-md">
              Independent radar viewer. Not affiliated with NOAA, the National Weather Service or the other data providers listed.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <nav aria-label="Site" className="flex flex-wrap gap-x-6 gap-y-2 text-slate-300">
              <Link to="/radar" className="hover:text-white transition-colors">Live Radar</Link>
              <Link to="/about" className="hover:text-white transition-colors">About</Link>
              {/* Legal pages are standalone documents served directly by the host. */}
              <a href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</a>
              <a href="/terms-of-service" className="hover:text-white transition-colors">Terms of Service</a>
            </nav>
            <nav aria-label="Radar by city" className="flex flex-wrap gap-x-6 gap-y-2 text-slate-400">
              {CITIES.map((c) => (
                <Link key={c.slug} to={cityPath(c)} className="hover:text-white transition-colors">{c.name} radar</Link>
              ))}
            </nav>
          </div>
        </div>
        <p className="mt-8 text-xs leading-relaxed text-slate-500">
          Radar and lightning data: NOAA / National Weather Service, NOAA NEXRAD Level III (NODD, Unidata), NOAA GOES-19/18 GLM,
          Iowa Environmental Mesonet. Basemap: OpenFreeMap, OpenMapTiles, OpenStreetMap contributors.
        </p>
        <p className="mt-2 text-xs text-slate-500">© {new Date().getFullYear()} Weather Spectrum</p>
      </div>
    </footer>
  );
}

// Everything inside the router. Shared by the browser (BrowserRouter) and the
// prerender step (StaticRouter, see entry-server.jsx).
export function AppShell() {
  useSeo();
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Header />
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/radar" element={<Suspense fallback={loading}><RadarPage /></Suspense>} />
          <Route path="/radar/:slug" element={<CityRadar />} />
          <Route path="/stations/:icao" element={<StationPage />} />
          <Route path="/about" element={<About />} />
          <Route path="/admin" element={<Suspense fallback={null}><Admin /></Suspense>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
      <CookieConsent />
    </div>
  );
}

export default function App() {
  useEffect(() => {
    initOneSignal();
  }, []);
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
