import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate } from 'react-router-dom';
import { Radar } from 'lucide-react';
import Admin from './pages/Admin';
import Home from './pages/home';
import RadarPage from './pages/RadarPage';
import CookieConsent from './components/CookieConsent';
import { initOneSignal } from './utils/oneSignalConfig';

// Placeholder pages that already existed; kept reachable by URL until their
// dedicated versions are built, but no longer linked from navigation.
const comingSoon = (title) => (
  <div className="max-w-7xl mx-auto px-6 py-24 text-center">
    <h1 className="text-3xl font-bold text-white">{title}</h1>
    <p className="mt-3 text-slate-400">Coming soon.</p>
  </div>
);

const legalPage = (src, title) => (
  <div className="max-w-4xl mx-auto px-6 py-16">
    <iframe src={src} className="w-full h-screen border-0 rounded-xl bg-white" title={title} />
  </div>
);

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
          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-slate-300">
            <Link to="/radar" className="hover:text-white transition-colors">Live Radar</Link>
            <Link to="/about" className="hover:text-white transition-colors">About</Link>
            <Link to="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link to="/terms-of-service" className="hover:text-white transition-colors">Terms of Service</Link>
          </nav>
        </div>
        <p className="mt-8 text-xs leading-relaxed text-slate-500">
          Radar and lightning data: NOAA / National Weather Service, NOAA NEXRAD Level III (NODD, Unidata), NOAA nowCOAST,
          Iowa Environmental Mesonet. Basemap: OpenFreeMap, OpenMapTiles, OpenStreetMap contributors.
        </p>
        <p className="mt-2 text-xs text-slate-500">© {new Date().getFullYear()} Weather Spectrum</p>
      </div>
    </footer>
  );
}

export default function App() {
  useEffect(() => {
    initOneSignal();
  }, []);

  return (
    <Router>
      <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
        <Header />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/radar" element={<RadarPage />} />
            <Route path="/forecast" element={comingSoon('Forecasts')} />
            <Route path="/serenader" element={comingSoon('Storm Serenader')} />
            <Route path="/history" element={comingSoon('Weather History')} />
            <Route path="/gallery" element={comingSoon('Gallery')} />
            <Route path="/about" element={legalPage('/about.html', 'About')} />
            <Route path="/privacy-policy" element={legalPage('/privacy-policy.html', 'Privacy Policy')} />
            <Route path="/terms-of-service" element={legalPage('/terms-of-service.html', 'Terms of Service')} />
            <Route path="/admin" element={<Admin />} />
            {/* Removed or unknown addresses go home instead of a blank page */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
        <Footer />
        <CookieConsent />
      </div>
    </Router>
  );
}
