import PushNotificationButton from "../components/PushNotificationButton";
import AlertTypesSection from "../components/AlertTypesSection";
import AllWebcams from '../components/AllWebcams';
import WeatherAlerts from '../components/weatheralerts';
import React, { useState, useEffect } from 'react';
import { Cloud, CloudRain, Sun, Wind, Calendar, Play, ChevronRight, MapPin, Zap, Loader, Search } from 'lucide-react';

export default function Home() {
  const [coords, setCoords] = useState(null);
  const [currentTemp, setCurrentTemp] = useState(null);
  const [location, setLocation] = useState('Loading...');
  const [weatherCondition, setWeatherCondition] = useState('');
  const [forecast, setForecast] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [zipInput, setZipInput] = useState('');

  const getWeatherIcon = (condition) => {
    const lower = condition.toLowerCase();
    if (lower.includes('rain') || lower.includes('shower')) return CloudRain;
    if (lower.includes('cloud')) return Cloud;
    if (lower.includes('clear') || lower.includes('sunny')) return Sun;
    if (lower.includes('wind')) return Wind;
    return Cloud;
  };

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

  const fetchWeather = async (lat, lon, cityName = null) => {
    try {
      setLoading(true);
      setError(null);

      const pointsResponse = await fetch(`https://api.weather.gov/points/${lat.toFixed(4)},${lon.toFixed(4)}`);
      if (!pointsResponse.ok) throw new Error('Location not supported by NWS');
      
      const pointsData = await pointsResponse.json();
      
      const stationsUrl = pointsData.properties.observationStations;
      const stationsResponse = await fetch(stationsUrl);
      const stationsData = await stationsResponse.json();
      
      const closestStation = stationsData.features[0].id;
      const obsResponse = await fetch(`${closestStation}/observations/latest`);
      const obsData = await obsResponse.json();
      
      const currentTempC = obsData.properties.temperature.value;
      const currentTempF = currentTempC ? Math.round((currentTempC * 9/5) + 32) : null;
      
      const forecastUrl = pointsData.properties.forecast;
      const forecastResponse = await fetch(forecastUrl);
      const forecastData = await forecastResponse.json();
      
      const currentPeriod = forecastData.properties.periods.find(p => p.isDaytime) || forecastData.properties.periods[0];
      
      setCurrentTemp(currentTempF || currentPeriod.temperature);
      setWeatherCondition(obsData.properties.textDescription || currentPeriod.shortForecast);
      setLocation(cityName || `${pointsData.properties.relativeLocation.properties.city}, ${pointsData.properties.relativeLocation.properties.state}`);
      setCoords({ lat, lon });

      const forecastPeriods = forecastData.properties.periods;
      const dailyForecast = [];
      
      for (let i = 0; i < Math.min(10, forecastPeriods.length); i++) {
        const period = forecastPeriods[i];
        const nextPeriod = forecastPeriods[i + 1];
        
        if (dailyForecast.length >= 5) break;
        
        if (period.isDaytime) {
          dailyForecast.push({
            day: i === 0 || i === 1 ? 'Today' : period.name.split(' ')[0],
            high: period.temperature,
            low: nextPeriod ? nextPeriod.temperature : period.temperature,
            condition: period.shortForecast,
            icon: getWeatherIcon(period.shortForecast)
          });
          i++;
        }
      }
      
      setForecast(dailyForecast);
      setLoading(false);
    } catch (err) {
      console.error('Weather fetch error:', err);
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          fetchWeather(position.coords.latitude, position.coords.longitude);
        },
        (err) => {
          console.error('Geolocation error:', err);
          fetchWeather(32.7555, -97.3308, 'Fort Worth, TX');
        }
      );
    } else {
      fetchWeather(32.7555, -97.3308, 'Fort Worth, TX');
    }
  }, []);

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
  
  console.log('Coords:', coords);

  return (
    <>
    {coords && <WeatherAlerts lat={coords.lat} lon={coords.lon} />}
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-6 py-20">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <div className="flex items-center gap-4 mb-8">
              <div className="inline-flex items-center gap-2 bg-orange-100 text-orange-700 px-4 py-2 rounded-full text-sm font-semibold">
                <MapPin className="w-4 h-4" />
                {location}
              </div>
              
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
              Accurate hype-free forcasts from expert meteorologists and seasoned storm chasers.
            </p>
            
            <a href="/forecast" className="group bg-gradient-to-r from-orange-600 to-amber-600 text-white px-8 py-4 rounded-xl font-semibold text-lg shadow-lg hover:shadow-xl transition-all transform hover:scale-[1.02] inline-block">
              View Full Forecast
              <ChevronRight className="inline-block ml-2 w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
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
      {/* Radar Map Section */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <h3 className="text-4xl font-bold mb-10 text-stone-900">Live Radar</h3>
        <div className="relative overflow-hidden rounded-3xl shadow-2xl border border-stone-200">
          <iframe
            src="https://embed.windy.com/embed2.html?lat=32.755&lon=-97.331&detailLat=32.755&detailLon=-97.331&width=650&height=450&zoom=8&level=surface&overlay=radar&product=radar&menu=&message=&marker=&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1"
            width="100%"
            height="500"
            frameBorder="0"
            className="w-full"
          />
        </div>
      </section>

      {/* Push Notification Alerts - replaces newsletter */}
<AlertTypesSection />

      {/* Nearby Webcams */}
     {coords && <AllWebcams lat={coords.lat} lon={coords.lon} maxDistance={100} />}

      

      {/* Storm Serenader Feature */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <div className="relative overflow-hidden rounded-3xl">
          <div className="absolute inset-0 bg-gradient-to-br from-orange-500 via-amber-500 to-yellow-500 opacity-10" />
          <div className="relative bg-white/60 backdrop-blur-xl border border-stone-200 rounded-3xl p-12 shadow-xl">
            <div className="flex flex-col gap-8">
              <div className="text-center">
                <h3 className="text-5xl font-bold mb-6 tracking-tight" style={{
                  background: 'linear-gradient(135deg, #ea580c 0%, #f59e0b 50%, #eab308 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text'
                }}>
                  The Storm Serenader
                </h3>
                <p className="text-stone-700 text-xl leading-relaxed max-w-3xl mx-auto">
                  Do storms love to be serenaded by wind instruments? We think so!
                </p>
              </div>
              
              <div className="relative aspect-video rounded-2xl overflow-hidden shadow-2xl">
                <iframe 
                  width="100%" 
                  height="100%" 
                  src="https://www.youtube.com/embed/zthzgcGwJ6U?si=LPcL3RSbav6sj64o" 
                  title="YouTube video player" 
                  frameBorder="0" 
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
                  referrerPolicy="strict-origin-when-cross-origin" 
                  allowFullScreen
                  className="absolute inset-0"
                />
              </div>
              
              <div className="text-center">
                <a href="/serenader" className="group inline-flex items-center gap-2 text-orange-600 font-semibold text-lg hover:gap-4 transition-all">
                  Watch All Videos 
                  <ChevronRight className="w-5 h-5" />
                </a>
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
          <a href="/history" className="group inline-flex items-center gap-2 text-orange-600 font-semibold hover:gap-3 transition-all">
            Explore Weather History <ChevronRight className="w-5 h-5" />
          </a>
        </div>
      </section>

      
    </>
  );
}