import Admin from './pages/Admin';
import { useEffect } from 'react';
import { initOneSignal } from './utils/oneSignalConfig';
import React from 'react';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Zap } from 'lucide-react';
import Home from './pages/home';

export default function App() {
   useEffect(() => {
    initOneSignal();
  }, []);
  return (
    <Router>
      <div className="min-h-screen bg-stone-50 text-stone-900">
        {/* Subtle texture overlay */}
        <div className="fixed inset-0 opacity-[0.03] pointer-events-none" style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'4\' numOctaves=\'3\' /%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\' /%3E%3C/svg%3E")',
        }} />

        <div className="relative z-10">
          {/* Header */}
          <header className="bg-white/80 backdrop-blur-lg border-b border-stone-200 sticky top-0 z-50 shadow-sm">
            <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
              <Link to="/" className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center shadow-md">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h1 className="text-xl font-bold tracking-tight text-stone-900">
                    The Weather Spectrum
                  </h1>
                  <p className="text-xs text-stone-500 italic">See the storms, skip the hype.</p>
                </div>
              </Link>
              <nav className="hidden md:flex gap-8 text-sm font-semibold text-stone-600">
                <Link to="/forecast" className="hover:text-orange-600 transition-colors">Forecasts</Link>
                <Link to="/serenader" className="hover:text-orange-600 transition-colors">Serenader</Link>
                <Link to="/history" className="hover:text-orange-600 transition-colors">History</Link>
                <Link to="/blog" className="hover:text-orange-600 transition-colors">Blog</Link>
                <Link to="/gallery" className="hover:text-orange-600 transition-colors">Gallery</Link>
              </nav>
            </div>
          </header>

          {/* Routes */}
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/forecast" element={<div className="max-w-7xl mx-auto px-6 py-20 text-center"><h1 className="text-4xl font-bold">Forecast Page - Coming Soon</h1></div>} />
            <Route path="/serenader" element={<div className="max-w-7xl mx-auto px-6 py-20 text-center"><h1 className="text-4xl font-bold">Storm Serenader Gallery - Coming Soon</h1></div>} />
            <Route path="/history" element={<div className="max-w-7xl mx-auto px-6 py-20 text-center"><h1 className="text-4xl font-bold">Weather History - Coming Soon</h1></div>} />
            <Route path="/blog" element={<div className="max-w-7xl mx-auto px-6 py-20 text-center"><h1 className="text-4xl font-bold">Blog - Coming Soon</h1></div>} />
            <Route path="/gallery" element={<div className="max-w-7xl mx-auto px-6 py-20 text-center"><h1 className="text-4xl font-bold">Gallery - Coming Soon</h1></div>} />
            <Route path="/admin" element={<Admin />} />
          </Routes>

          {/* Footer */}
          <footer className="bg-stone-900 border-t border-stone-800 mt-20">
            <div className="max-w-7xl mx-auto px-6 py-12">
              <div className="grid md:grid-cols-4 gap-8 mb-8">
                <div>
                  <h4 className="font-bold mb-4 text-orange-400 text-sm tracking-wider uppercase">Forecasts</h4>
                  <ul className="space-y-2 text-sm text-stone-400">
                    <li><Link to="/forecast" className="hover:text-orange-400 transition-colors">Current Conditions</Link></li>
                    <li><Link to="/forecast" className="hover:text-orange-400 transition-colors">7-Day Forecast</Link></li>
                    <li><Link to="/" className="hover:text-orange-400 transition-colors">Radar</Link></li>
                    <li><Link to="/forecast" className="hover:text-orange-400 transition-colors">Severe Weather</Link></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold mb-4 text-orange-400 text-sm tracking-wider uppercase">Content</h4>
                  <ul className="space-y-2 text-sm text-stone-400">
                    <li><Link to="/serenader" className="hover:text-orange-400 transition-colors">Storm Serenader</Link></li>
                    <li><Link to="/history" className="hover:text-orange-400 transition-colors">Weather History</Link></li>
                    <li><Link to="/blog" className="hover:text-orange-400 transition-colors">Blog</Link></li>
                    <li><Link to="/gallery" className="hover:text-orange-400 transition-colors">Guest Gallery</Link></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold mb-4 text-orange-400 text-sm tracking-wider uppercase">Learn</h4>
                  <ul className="space-y-2 text-sm text-stone-400">
                    <li><Link to="/blog" className="hover:text-orange-400 transition-colors">Meteorology 101</Link></li>
                    <li><Link to="/blog" className="hover:text-orange-400 transition-colors">Tornado Safety</Link></li>
                    <li><Link to="/blog" className="hover:text-orange-400 transition-colors">Storm Chasing</Link></li>
                    <li><Link to="/blog" className="hover:text-orange-400 transition-colors">Weather Glossary</Link></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold mb-4 text-orange-400 text-sm tracking-wider uppercase">Connect</h4>
                  <ul className="space-y-2 text-sm text-stone-400">
                    <li><a href="#" className="hover:text-orange-400 transition-colors">YouTube</a></li>
                    <li><a href="#" className="hover:text-orange-400 transition-colors">Instagram</a></li>
                    <li><a href="#" className="hover:text-orange-400 transition-colors">Facebook</a></li>
                    <li><a href="#" className="hover:text-orange-400 transition-colors">Contact Us</a></li>
                  </ul>
                </div>
              </div>
              <div className="border-t border-stone-800 pt-8 text-center text-sm text-stone-500">
                <p>© 2026 The Weather Spectrum • Accurate forecasts. Every time.</p>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </Router>
  );
}