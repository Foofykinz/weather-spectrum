mport React, { useState, useEffect } from 'react';
import { Cloud, CloudRain, Sun, Wind, Calendar, Play, ChevronRight, MapPin, Zap, Loader, Search } from 'lucide-react';

export default function WeatherSpectrum() {
  const [currentTemp, setCurrentTemp] = useState(null);
  const [location, setLocation] = useState('Loading...');
  const [weatherCondition, setWeatherCondition] = useState('');
  const [forecast, setForecast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zipInput, setZipInput] = useState('');

  // Get weather icon based on condition
  const getWeatherIcon = (condition) => {
    const lower = condition.toLowerCase();
    if (lower.includes('rain') || lower.includes('shower')) return CloudRain;
    if (lower.includes('cloud')) return Cloud;
    if (lower.includes('clear') || lower.includes('sunny')) return Sun;
    if (lower.includes('wind')) return Wind;
    return Cloud;
  };

  // Convert zip code to coordinates using free geocoding API
  const zipToCoords = async (zip) => {
    try {
      const response = await fetch(`https://api.zippopotam.us/us/${zip}`);
      if (!response.ok) throw new Error('Invalid zip code');
      const data = await response.json();
      return {
        lat: parseFloat(data.places[0].latitude),
        lon: parseFloat(data.places[0].longitude),
        city: data.places[0]['place name'],
        state: data.places[0]['state abbreviation']
      };
    } catch (err) {
      throw new Error('Could not find zip code');
    }
  };

  // Fetch weather from NWS API
  const fetchWeather = async (lat, lon, cityName = null) => {
    try {
      setLoading(true);
      setError(null);

      // Get the forecast office and grid points
      const pointsResponse = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
      if (!pointsResponse.ok) throw new Error('Location not supported by NWS');
      
      const pointsData = await pointsResponse.json();
      
      // Get current conditions from observations (more accurate)
      const stationsUrl = pointsData.properties.observationStations;
      const stationsResponse = await fetch(stationsUrl);
      const stationsData = await stationsResponse.json();
      
      // Get the closest station
      const closestStation = stationsData.features[0].id;
      const obsResponse = await fetch(`${closestStation}/observations/latest`);
      const obsData = await obsResponse.json();
      
      // Get current temp from observations
      const currentTempC = obsData.properties.temperature.value;
      const currentTempF = currentTempC ? Math.round((currentTempC * 9/5) + 32) : null;
      
      // Get forecast for conditions description
      const forecastUrl = pointsData.properties.forecast;
      const forecastResponse = await fetch(forecastUrl);
      const forecastData = await forecastResponse.json();
      
      // Find the current daytime period for conditions
      const currentPeriod = forecastData.properties.periods.find(p => p.isDaytime) || forecastData.properties.periods[0];
      
      setCurrentTemp(currentTempF || currentPeriod.temperature);
      setWeatherCondition(obsData.properties.textDescription || currentPeriod.shortForecast);
      setLocation(cityName || `${pointsData.properties.relativeLocation.properties.city}, ${pointsData.properties.relativeLocation.properties.state}`);

      // Parse 5-day forecast (take every other period to get one per day)
      const forecastPeriods = forecastData.properties.periods.slice(0, 10);
      const dailyForecast = [];
      
      for (let i = 0; i < Math.min(10, forecastPeriods.length); i += 2) {
        const dayPeriod = forecastPeriods[i];
        const nightPeriod = forecastPeriods[i + 1] || dayPeriod;
        
        // Make sure we get high and low correctly regardless of day/night order
        const temp1 = dayPeriod.temperature;
        const temp2 = nightPeriod.temperature;
        const high = Math.max(temp1, temp2);
        const low = Math.min(temp1, temp2);
        
        dailyForecast.push({
          day: i === 0 ? 'Today' : dayPeriod.name.split(' ')[0],
          high: high,
          low: low,
          condition: dayPeriod.shortForecast,
          icon: getWeatherIcon(dayPeriod.shortForecast)
        });
        
        if (dailyForecast.length >= 5) break;
      }
      
      setForecast(dailyForecast);
      setLoading(false);
    } catch (err) {
      console.error('Weather fetch error:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  // Get user's location on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          fetchWeather(position.coords.latitude, position.coords.longitude);
        },
        (err) => {
          console.error('Geolocation error:', err);
          // Default to Fort Worth if geolocation fails
          fetchWeather(32.7555, -97.3308, 'Fort Worth, TX');
        }
      );
    } else {
      // Default to Fort Worth if geolocation not supported
      fetchWeather(32.7555, -97.3308, 'Fort Worth, TX');
    }
  }, []);

  // Handle zip code search
  const handleZipSearch = async (e) => {
    e.preventDefault();
    if (zipInput.length !== 5) {
      setError('Please enter a valid 5-digit zip code');
      return;
    }
    
    try {
      const coords = await zipToCoords(zipInput);
      await fetchWeather(coords.lat, coords.lon, `${coords.city}, ${coords.state}`);
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      {/* Subtle texture overlay */}
      <div className="fixed inset-0 opacity-[0.03] pointer-events-none" style={{
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 200 200\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'4\' numOctaves=\'3\' /%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\' /%3E%3C/svg%3E")',
      }} />

      <div className="relative z-10">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-lg border-b border-stone-200 sticky top-0 z-50 shadow-sm">
          <div className="max-w-7xl mx-auto px-6 py-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-amber-600 rounded-lg flex items-center justify-center shadow-md">
                <Zap className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold tracking-tight text-stone-900">
                  The Weather Spectrum
                </h1>
                <p className="text-xs text-stone-500 italic">Where meteorology meets music</p>
              </div>
            </div>
            <nav className="hidden md:flex gap-8 text-sm font-semibold text-stone-600">
              <a href="#forecasts" className="hover:text-orange-600 transition-colors">Forecasts</a>
              <a href="#serenader" className="hover:text-orange-600 transition-colors">Serenader</a>
              <a href="#history" className="hover:text-orange-600 transition-colors">History</a>
              <a href="#blog" className="hover:text-orange-600 transition-colors">Blog</a>
              <a href="#gallery" className="hover:text-orange-600 transition-colors">Gallery</a>
            </nav>
          </div>
        </header>

        {/* Hero Section */}
        <section className="max-w-7xl mx-auto px-6 py-20">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <div className="flex items-center gap-4 mb-8">
                <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-semibold">
                  <MapPin className="w-4 h-4" />
                  {location}
                </div>
                
                {/* Zip Code Search */}
                <form onSubmit={handleZipSearch} className="flex gap-2">
                  <input
                    type="text"
                    value={zipInput}
                    onChange={(e) => setZipInput(e.target.value)}
                    placeholder="Zip code"
                    maxLength="5"
                    className="w-24 px-3 py-2 rounded-lg border border-stone-300 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                  <button
                    type="submit"
                    className="p-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                  >
                    <Search className="w-4 h-4" />
                  </button>
                </form>
              </div>
              
              <div className="mb-8">
                {loading ? (
                  <div className="flex items-center gap-4">
                    <Loader className="w-16 h-16 text-orange-600 animate-spin" />
                    <span className="text-2xl text-stone-600">Loading weather...</span>
                  </div>
                ) : error ? (
                  <div className="text-red-600 text-xl">{error}</div>
                ) : (
                  <>
                    <h2 className="text-8xl md:text-9xl font-bold mb-2 tracking-tight" style={{
                      background: 'linear-gradient(135deg, #ea580c 0%, #f59e0b 50%, #eab308 100%)',
                      WebkitBackgroundClip: 'text',
                      WebkitTextFillColor: 'transparent',
                      backgroundClip: 'text'
                    }}>
                      {currentTemp}°
                    </h2>
                    <p className="text-2xl text-stone-600 font-medium">{weatherCondition}</p>
                  </>
                )}
              </div>

              <p className="text-xl text-stone-600 mb-10 leading-relaxed max-w-xl">
                Expert forecasts meet artistic expression. Experience weather through the lens of storm chasing and live musical performance.
              </p>
              
              <button className="group bg-gradient-to-r from-orange-600 to-amber-600 text-white px-8 py-4 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02]">
                View Full Forecast
                <ChevronRight className="inline-block ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
            
            {/* Featured Video */}
            <div className="relative group cursor-pointer">
              <div className="absolute inset-0 bg-gradient-to-br from-orange-400 to-amber-500 rounded-3xl blur-2xl opacity-20 group-hover:opacity-30 transition-opacity" />
              <div className="relative aspect-video bg-gradient-to-br from-stone-800 to-stone-900 rounded-3xl overflow-hidden shadow-2xl border border-stone-200">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-20 h-20 bg-white/10 backdrop-blur-sm rounded-full flex items-center justify-center mb-6 mx-auto group-hover:bg-white/20 transition-all group-hover:scale-110 border border-white/20">
                      <Play className="w-10 h-10 text-white" />
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">The Storm Serenader</h3>
                    <p className="text-orange-300 font-medium">Latest: Trumpet at a Supercell</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 5-Day Forecast */}
        <section className="max-w-7xl mx-auto px-6 py-16">
          <h3 className="text-4xl font-bold mb-10 text-stone-900">5-Day Forecast</h3>
          {loading ? (
            <div className="text-center py-12">
              <Loader className="w-12 h-12 text-orange-600 animate-spin mx-auto" />
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {forecast.map((day, idx) => {
                const Icon = day.icon;
                const gradients = [
                  'from-orange-500 to-amber-500',
                  'from-amber-500 to-yellow-500',
                  'from-orange-600 to-red-500',
                  'from-yellow-500 to-orange-500',
                  'from-amber-600 to-orange-600'
                ];
                return (
                  <div key={idx} className="group relative">
                    <div className={`absolute -inset-0.5 bg-gradient-to-br ${gradients[idx]} rounded-2xl opacity-0 group-hover:opacity-100 blur transition-opacity`} />
                    <div className="relative bg-white rounded-2xl p-6 shadow-md hover:shadow-xl transition-all border border-stone-200">
                      <p className="text-xs text-stone-500 mb-3 font-semibold uppercase tracking-wider">{day.day}</p>
                      <Icon className={`w-10 h-10 text-orange-600 mb-3`} />
                      <div className="flex gap-3 items-baseline mb-2">
                        <span className="text-3xl font-bold text-stone-900">{day.high}°</span>
                        <span className="text-lg text-stone-500 font-medium">{day.low}°</span>
                      </div>
                      <p className="text-xs text-stone-600 font-medium">{day.condition}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Storm Serenader Feature */}
        <section className="max-w-7xl mx-auto px-6 py-16">
          <div className="relative overflow-hidden rounded-3xl">
            <div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 opacity-10" />
            <div className="relative bg-white/60 backdrop-blur-xl border border-stone-200 rounded-3xl p-12 shadow-xl">
              <div className="flex flex-col md:flex-row items-center justify-between gap-12">
                <div className="flex-1">
                  <h3 className="text-5xl font-bold mb-6 tracking-tight" style={{
                    background: 'linear-gradient(135deg, #ea580c 0%, #f59e0b 50%, #eab308 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}>
                    The Storm Serenader
                  </h3>
                  <p className="text-stone-700 text-xl mb-8 leading-relaxed">
                    Experience severe weather through a unique artistic lens. Watch our meteorologist perform live trumpet serenades to supercells, tornadoes, and storms in the field.
                  </p>
                  <button className="group inline-flex items-center gap-2 text-orange-600 font-semibold text-lg hover:gap-4 transition-all">
                    Watch All Videos 
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
                
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-br from-orange-500 to-amber-600 rounded-full blur-3xl opacity-30" />
                  <div className="relative w-48 h-48 bg-gradient-to-br from-orange-500 to-amber-600 rounded-full flex items-center justify-center shadow-2xl">
                    <Play className="w-24 h-24 text-white" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* This Day in History */}
        <section className="max-w-7xl mx-auto px-6 py-16">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-gradient-to-br from-orange-500 to-amber-600 rounded-xl flex items-center justify-center shadow-md">
              <Calendar className="w-6 h-6 text-white" />
            </div>
            <h3 className="text-4xl font-bold text-stone-900">This Day in Weather History</h3>
          </div>
          
          <div className="bg-white rounded-3xl p-10 shadow-xl border border-stone-200 hover:shadow-2xl transition-shadow">
            <div className="inline-block bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-semibold mb-4">
              January 10, 2026
            </div>
            <h4 className="text-3xl font-bold mb-6 text-stone-900">Historic Weather Events</h4>
            <p className="text-stone-600 leading-relaxed text-lg mb-6">
              Check back daily for fascinating weather history from this day throughout the years. From record-breaking temperatures to historic storms, we'll explore the meteorological moments that shaped our understanding of weather.
            </p>
            <button className="group inline-flex items-center gap-2 text-orange-600 font-semibold hover:gap-3 transition-all">
              Explore Weather History <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </section>

        {/* Newsletter Signup */}
        <section className="max-w-7xl mx-auto px-6 py-20">
          <div className="relative overflow-hidden rounded-3xl">
            <div className="absolute inset-0 bg-gradient-to-r from-orange-600 via-amber-600 to-yellow-600" />
            <div className="relative px-12 py-16 text-center">
              <h3 className="text-5xl font-bold mb-6 text-white">Never Miss a Storm</h3>
              <p className="text-xl mb-10 text-orange-100 max-w-2xl mx-auto">
                Get severe weather alerts, forecasts, and Storm Serenader updates delivered to your inbox.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 max-w-xl mx-auto">
                <input 
                  type="email" 
                  placeholder="your@email.com" 
                  className="flex-1 px-6 py-4 rounded-xl bg-white/20 backdrop-blur-sm border border-white/30 text-white placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/50 font-medium"
                />
                <button className="px-8 py-4 bg-white text-orange-600 rounded-xl font-semibold hover:bg-orange-50 transition-all shadow-lg hover:shadow-xl">
                  Subscribe
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-stone-900 border-t border-stone-800 mt-20">
          <div className="max-w-7xl mx-auto px-6 py-12">
            <div className="grid md:grid-cols-4 gap-8 mb-8">
              <div>
                <h4 className="font-bold mb-4 text-orange-400 text-sm tracking-wider uppercase">Forecasts</h4>
                <ul className="space-y-2 text-sm text-stone-400">
                  <li><a href="#" className="hover:text-orange-400 transition-colors">Current Conditions</a></li>
                  <li><a href="#" className="hover:text-orange-400 transition-colors">7-Day Forecast</a></li>
                  <li><a href="#" className="hover:text-orange-400 transition-colors">Radar</a></li>
                  <li><a href="#" className="hover:text-orange-400 transition-colors">Severe Weather</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold mb-4 text-orange-400 text-sm tracking-wider uppercase">Content</h4>
                <ul className="space-y-2 text-sm text-stone-400">
                  <li><a href="#" className="hover:text-orange-400 transition-colors">Storm Serenader</a></li>
                  <li><a href="#" className="hover:text-orange-400 transition-colors">Weather History</a></li>
                  <li><a href="#" className="hover:text-orange-400 transition-colors">Blog</a></li>
                  <li><a href="#" className="hover:text-orange-400 transition-colors">Guest Gallery</a></li>
                </ul>
              </div>
              <div>
                <h4 className="font-bold mb-4 text-orange-400 text-sm tracking-wider uppercase">Learn</h4>
                <ul className="space-y-2 text-sm text-stone-400">
                  <li><a href="#" className="hover:text-orange-400 transition-colors">Meteorology 101</a></li>
                  <li><a href="#" className="hover:text-orange-400 transition-colors">Tornado Safety</a></li>
                  <li><a href="#" className="hover:text-orange-400 transition-colors">Storm Chasing</a></li>
                  <li><a href="#" className="hover:text-orange-400 transition-colors">Weather Glossary</a></li>
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
              <p>© 2026 The Weather Spectrum • Where meteorology meets music</p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}