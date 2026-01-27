import React, { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap, Circle } from 'react-leaflet';
import L from 'leaflet';
import { Calendar, Ruler, Search, Filter, AlertCircle, X, Users, MapPin as MapPinIcon, Loader } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Enhanced custom marker with size label
const createHailIcon = (size) => {
  let color;
  if (size >= 2) color = '#ef4444';
  else if (size >= 1.75) color = '#f97316';
  else if (size >= 1) color = '#eab308';
  else color = '#22c55e';

  return L.divIcon({
    className: 'custom-hail-marker',
    html: `
      <div style="position: relative; width: 36px; height: 46px;">
        <svg width="36" height="46" viewBox="0 0 36 46" xmlns="http://www.w3.org/2000/svg">
          <path d="M18 0C8.059 0 0 8.059 0 18c0 13.5 18 28 18 28s18-14.5 18-28C36 8.059 27.941 0 18 0z" 
                fill="${color}" 
                stroke="white" 
                stroke-width="2"/>
        </svg>
        <div style="
          position: absolute;
          top: 8px;
          left: 50%;
          transform: translateX(-50%);
          background: white;
          border-radius: 10px;
          padding: 2px 6px;
          font-size: 10px;
          font-weight: bold;
          color: ${color};
          white-space: nowrap;
          box-shadow: 0 1px 3px rgba(0,0,0,0.3);
        ">
          ${size.toFixed(1)}"
        </div>
      </div>
    `,
    iconSize: [36, 46],
    iconAnchor: [18, 46],
    popupAnchor: [0, -46],
  });
};

// Component to update map view
function MapUpdater({ events }) {
  const map = useMap();
  
  useEffect(() => {
    if (events.length > 0) {
      const bounds = events.map(e => [e.lat, e.lon]);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 10 });
    }
  }, [events, map]);
  
  return null;
}

export default function HailMap() {
  const [hailEvents, setHailEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchZip, setSearchZip] = useState('');
  const [filteredEvents, setFilteredEvents] = useState([]);
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [dateRange, setDateRange] = useState('sample');
  const [customDate, setCustomDate] = useState('');
  const [error, setError] = useState(null);
  const [mapCenter, setMapCenter] = useState([32.7555, -97.3308]);
  const [zipFilter, setZipFilter] = useState(null);

  useEffect(() => {
    fetchHailData();
  }, [dateRange]);

  const fetchHailData = async () => {
    setLoading(true);
    setError(null);
    
    if (dateRange === 'sample') {
      loadSampleData();
      return;
    }

    try {
      let date = '';
      const today = new Date();
      
      if (dateRange === 'today') {
        date = formatDate(today);
      } else if (dateRange === 'yesterday') {
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        date = formatDate(yesterday);
      } else if (dateRange === 'custom' && customDate) {
        const [year, month, day] = customDate.split('-');
        const selectedDate = new Date(year, month - 1, day);
        date = formatDate(selectedDate);
      } else if (dateRange === 'custom' && !customDate) {
        setError('Please select a date');
        setLoading(false);
        loadSampleData();
        return;
      }

      const response = await fetch(
        `https://www.spc.noaa.gov/climo/reports/${date}_rpts_filtered_hail.csv`
      );

      if (!response.ok) {
        throw new Error(`No hail reports found for ${customDate || 'this date'}`);
      }

      const csvText = await response.text();
      const events = parseSPCCSV(csvText);
      
      if (events.length === 0) {
        throw new Error('No hail reports for this date');
      }

      setHailEvents(events);
      
      if (zipFilter) {
        const nearby = events.filter(event => {
          const distance = getDistance(zipFilter.lat, zipFilter.lon, event.lat, event.lon);
          return distance <= 50;
        });
        setFilteredEvents(nearby);
      } else {
        setFilteredEvents(events);
      }
      
      setLoading(false);
      setError(null);
    } catch (error) {
      console.error('Error fetching hail data:', error);
      setError(error.message + ' - Showing sample data instead');
      loadSampleData();
    }
  };

  const formatDate = (date) => {
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}${month}${day}`;
  };

  const parseSPCCSV = (csv) => {
    const lines = csv.trim().split('\n');
    const events = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      const parts = line.split(',');
      if (parts.length >= 6) {
        const sizeInHundredths = parseFloat(parts[1]) || 75;
        const actualSize = sizeInHundredths / 100;
        const lat = parseFloat(parts[5]) || 32.7555;
        const lon = parseFloat(parts[6]) || -97.3308;
        
        events.push({
          id: i,
          time: parts[0] || 'Unknown',
          size: actualSize,
          location: parts[2] || 'Unknown',
          county: parts[3] || 'Unknown',
          state: parts[4] || 'TX',
          lat: lat,
          lon: lon,
          comments: parts[7] || '',
          zipCode: null, // Load on demand
          estimatedPopulation: null, // Load on demand
        });
      }
    }

    return events;
  };

  // Get ZIP code and accurate population from Census Bureau
const getZipAndPopulation = async (lat, lon) => {
  try {
    const response = await fetch('https://weather-spectrum-notifications.alysonwalters22.workers.dev/census-lookup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ lat, lon }),
    });

    const data = await response.json();
    return {
      zip: data.zip || 'Unknown',
      population: data.population || 7383,
    };
  } catch (error) {
    console.error('Census lookup error:', error);
    return {
      zip: 'Unknown',
      population: 7383,
    };
  }
};

  const loadSampleData = () => {
    const samples = [
      {
        id: 1,
        time: '14:30 CST',
        size: 1.75,
        location: 'Fort Worth',
        county: 'Tarrant',
        state: 'TX',
        lat: 32.7555,
        lon: -97.3308,
        comments: 'Golf ball sized hail reported by trained spotter. Minor vehicle damage.',
        zipCode: '76102',
        estimatedPopulation: 12450,
      },
      {
        id: 2,
        time: '15:45 CST',
        size: 1.0,
        location: 'Arlington',
        county: 'Tarrant',
        state: 'TX',
        lat: 32.7357,
        lon: -97.1081,
        comments: 'Quarter sized hail observed near AT&T Stadium.',
        zipCode: '76011',
        estimatedPopulation: 8200,
      },
      {
        id: 3,
        time: '16:20 CST',
        size: 2.5,
        location: 'Dallas',
        county: 'Dallas',
        state: 'TX',
        lat: 32.7767,
        lon: -96.7970,
        comments: 'Baseball to softball sized hail. Multiple reports of vehicle and roof damage.',
        zipCode: '75201',
        estimatedPopulation: 18500,
      },
      {
        id: 4,
        time: '14:15 CST',
        size: 0.75,
        location: 'Grapevine',
        county: 'Tarrant',
        state: 'TX',
        lat: 32.9342,
        lon: -97.0781,
        comments: 'Pea sized hail near DFW Airport.',
        zipCode: '76051',
        estimatedPopulation: 6800,
      },
      {
        id: 5,
        time: '17:00 CST',
        size: 1.5,
        location: 'Plano',
        county: 'Collin',
        state: 'TX',
        lat: 33.0198,
        lon: -96.6989,
        comments: 'Ping pong ball sized hail. Tree damage reported.',
        zipCode: '75023',
        estimatedPopulation: 9100,
      },
    ];

    setHailEvents(samples);
    setFilteredEvents(samples);
    setZipFilter(null);
    setError(dateRange !== 'sample' ? 'Showing sample data for demonstration' : null);
    setLoading(false);
  };

  const handleSearch = async () => {
    if (searchZip.length !== 5) {
      alert('Please enter a valid 5-digit ZIP code');
      return;
    }

    try {
      const response = await fetch(`https://api.zippopotam.us/us/${searchZip}`);
      const data = await response.json();
      const zipLat = parseFloat(data.places[0].latitude);
      const zipLon = parseFloat(data.places[0].longitude);

      setZipFilter({ lat: zipLat, lon: zipLon });
      setMapCenter([zipLat, zipLon]);

      const nearby = hailEvents.filter(event => {
        const distance = getDistance(zipLat, zipLon, event.lat, event.lon);
        return distance <= 50;
      });

      setFilteredEvents(nearby);
      
      if (nearby.length === 0) {
        alert(`No hail events found within 50 miles of ZIP ${searchZip} for this date. Try a different date during spring/summer hail season!`);
      }
    } catch (error) {
      console.error('Zip search error:', error);
      alert('Could not find ZIP code. Please try again.');
    }
  };

  const clearZipFilter = () => {
    setZipFilter(null);
    setSearchZip('');
    setFilteredEvents(hailEvents);
    setMapCenter([32.7555, -97.3308]);
  };

  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 3959;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  const getSizeColor = (size) => {
    if (size >= 2) return 'bg-red-500';
    if (size >= 1.75) return 'bg-orange-500';
    if (size >= 1) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getSizeLabel = (size) => {
    if (size >= 2.75) return 'Softball';
    if (size >= 2) return 'Baseball';
    if (size >= 1.75) return 'Golf Ball';
    if (size >= 1.5) return 'Ping Pong Ball';
    if (size >= 1.25) return 'Half Dollar';
    if (size >= 1) return 'Quarter';
    if (size >= 0.88) return 'Nickel/Walnut';
    if (size >= 0.75) return 'Penny';
    return 'Pea';
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🧊 Hail Impact Map
          </h1>
          <p className="text-base text-gray-600">
            Free hail event tracking for insurance claims, damage assessment, and public awareness
          </p>
        </div>

        {/* Error/Info Banner */}
        {error && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 mb-6 flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
            <p className="text-blue-800 text-xs">{error}</p>
          </div>
        )}

        {/* Search & Filter */}
        <div className="bg-white rounded-2xl shadow-lg p-4 mb-6">
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                Search by ZIP Code (50 mile radius)
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={searchZip}
                  onChange={(e) => setSearchZip(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder="Enter ZIP"
                  maxLength="5"
                  className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                />
                <button
                  onClick={handleSearch}
                  className="px-3 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors"
                >
                  <Search className="w-4 h-4" />
                </button>
              </div>
              {zipFilter && (
                <button
                  onClick={clearZipFilter}
                  className="mt-2 text-xs text-orange-600 hover:text-orange-700 font-medium"
                >
                  Clear ZIP filter
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">
                Select Date
              </label>
              <select
                value={dateRange}
                onChange={(e) => {
                  setDateRange(e.target.value);
                  if (e.target.value !== 'custom') {
                    setCustomDate('');
                  }
                }}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent mb-2"
              >
                <option value="sample">Sample Data (Demo)</option>
                <option value="today">Today</option>
                <option value="yesterday">Yesterday</option>
                <option value="custom">Custom Date (2012-Present)</option>
              </select>
              
              {dateRange === 'custom' && (
                <div>
                  <input
                    type="date"
                    value={customDate}
                    onChange={(e) => setCustomDate(e.target.value)}
                    min="2012-01-01"
                    max={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => fetchHailData()}
                    className="w-full mt-2 px-3 py-2 text-sm bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-semibold"
                  >
                    Load Date
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center justify-center bg-orange-50 rounded-lg p-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-600">{filteredEvents.length}</p>
                <p className="text-xs text-gray-600">Hail Events Found</p>
              </div>
            </div>
          </div>
        </div>

        {/* Map + List */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Map */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-2xl shadow-lg overflow-hidden h-[600px]">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center">
                    <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
                    <p className="text-sm text-gray-500">Loading map...</p>
                  </div>
                </div>
              ) : (
                <MapContainer
                  center={mapCenter}
                  zoom={zipFilter ? 10 : 6}
                  style={{ height: '100%', width: '100%' }}
                  className="rounded-2xl"
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  <MapUpdater events={filteredEvents} />
                  {filteredEvents.map((event) => (
                    <React.Fragment key={event.id}>
                      <Marker
                        position={[event.lat, event.lon]}
                        icon={createHailIcon(event.size)}
                        eventHandlers={{
                          click: async () => {
                            // Show modal immediately with loading state
                            setSelectedEvent({ ...event, loading: true });
                            
                            // Load accurate ZIP/population if not already loaded
                            if (!event.zipCode) {
                              const locationData = await getZipAndPopulation(event.lat, event.lon);
                              event.zipCode = locationData.zip;
                              event.estimatedPopulation = locationData.population;
                              
                              // Update modal with real data
                              setSelectedEvent({ ...event, loading: false });
                            } else {
                              setSelectedEvent(event);
                            }
                          },
                        }}
                      >
                        <Popup>
                          <div className="p-2">
                            <p className="font-bold text-gray-900 text-sm">{event.location}, {event.state}</p>
                            <p className="text-xs text-gray-600">{event.time}</p>
                            <p className="text-xs font-semibold text-orange-600 mt-1">
                              {event.size.toFixed(2)}" ({getSizeLabel(event.size)})
                            </p>
                            {event.zipCode && event.zipCode !== 'Unknown' && (
                              <p className="text-xs text-gray-500 mt-1">ZIP: {event.zipCode}</p>
                            )}
                            {event.estimatedPopulation > 0 && (
                              <p className="text-xs text-gray-500">~{event.estimatedPopulation.toLocaleString()} people in 5mi radius</p>
                            )}
                          </div>
                        </Popup>
                      </Marker>
                      {/* Impact radius circle */}
                      <Circle
                        center={[event.lat, event.lon]}
                        radius={8046.72} // 5 miles in meters
                        pathOptions={{
                          color: event.size >= 2 ? '#ef4444' : event.size >= 1.75 ? '#f97316' : event.size >= 1 ? '#eab308' : '#22c55e',
                          fillColor: event.size >= 2 ? '#ef4444' : event.size >= 1.75 ? '#f97316' : event.size >= 1 ? '#eab308' : '#22c55e',
                          fillOpacity: 0.1,
                          weight: 1,
                          opacity: 0.3,
                        }}
                      />
                    </React.Fragment>
                  ))}
                </MapContainer>
              )}
            </div>
          </div>

          {/* Events List */}
          <div className="lg:col-span-1">
            <div className="bg-white rounded-2xl shadow-lg p-4 max-h-[600px] overflow-y-auto">
              <h3 className="text-base font-bold text-gray-900 mb-3 flex items-center gap-2">
                <Filter className="w-4 h-4" />
                Recent Events
              </h3>

              {loading ? (
                <div className="text-center py-12">
                  <div className="w-10 h-10 border-4 border-orange-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
                  <p className="text-sm text-gray-500 mt-3">Loading...</p>
                </div>
              ) : filteredEvents.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-sm text-gray-500">No hail events found</p>
                  <p className="text-xs text-gray-400 mt-2">Try a different date or location</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredEvents.map((event) => (
                    <div
                      key={event.id}
                      onClick={async () => {
                        setSelectedEvent({ ...event, loading: true });
                        if (!event.zipCode) {
                          const locationData = await getZipAndPopulation(event.lat, event.lon);
                          event.zipCode = locationData.zip;
                          event.estimatedPopulation = locationData.population;
                          setSelectedEvent({ ...event, loading: false });
                        } else {
                          setSelectedEvent(event);
                        }
                      }}
                      className="p-3 border border-gray-200 rounded-lg hover:border-orange-500 hover:shadow-md transition-all cursor-pointer"
                    >
                      <div className="flex items-start gap-2">
                        <div className={`w-2 h-2 rounded-full ${getSizeColor(event.size)} mt-1.5 flex-shrink-0`}></div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {event.location}, {event.state}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                            <Calendar className="w-3 h-3" />
                            <span>{event.time}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-600 mt-1">
                            <Ruler className="w-3 h-3" />
                            <span className="font-medium">{event.size.toFixed(2)}" ({getSizeLabel(event.size)})</span>
                          </div>
                          {event.zipCode && event.zipCode !== 'Unknown' && (
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                              <MapPinIcon className="w-3 h-3" />
                              <span>ZIP: {event.zipCode}</span>
                            </div>
                          )}
                          {event.estimatedPopulation > 0 && (
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                              <Users className="w-3 h-3" />
                              <span>~{event.estimatedPopulation.toLocaleString()} affected</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Legend */}
        <div className="mt-6 bg-white rounded-2xl shadow-lg p-4">
          <h3 className="text-sm font-bold text-gray-900 mb-3">Hail Size Legend</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-green-500"></div>
              <span className="text-xs text-gray-700">Pea/Penny (&lt;1")</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
              <span className="text-xs text-gray-700">Quarter (1-1.75")</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-orange-500"></div>
              <span className="text-xs text-gray-700">Golf Ball (1.75-2")</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500"></div>
              <span className="text-xs text-gray-700">Baseball/Softball (2"+)</span>
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="mt-6 text-center text-xs text-gray-500">
          <p>Data from NOAA Storm Prediction Center (2012-Present). Population data from US Census Bureau.</p>
          <p className="mt-1">FREE for insurance claims, damage assessment, and public awareness.</p>
        </div>
      </div>

      {/* Selected Event Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-[9999]" onClick={() => setSelectedEvent(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">Hail Event Details</h3>
              <button onClick={() => setSelectedEvent(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            {selectedEvent.loading ? (
              <div className="text-center py-12">
                <Loader className="w-8 h-8 text-orange-600 animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-500">Loading accurate data from US Census...</p>
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500">Location</label>
                  <p className="text-sm text-gray-900">{selectedEvent.location}, {selectedEvent.county} County, {selectedEvent.state}</p>
                </div>
                {selectedEvent.zipCode && selectedEvent.zipCode !== 'Unknown' && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500">ZIP Code</label>
                    <p className="text-sm text-gray-900">{selectedEvent.zipCode}</p>
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-gray-500">Time</label>
                  <p className="text-sm text-gray-900">{selectedEvent.time}</p>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500">Hail Size</label>
                  <p className="text-sm text-gray-900 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${getSizeColor(selectedEvent.size)}`}></span>
                    {selectedEvent.size.toFixed(2)}" diameter ({getSizeLabel(selectedEvent.size)})
                  </p>
                </div>
                {selectedEvent.estimatedPopulation > 0 && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500">Estimated Population Affected</label>
                    <p className="text-sm text-gray-900">~{selectedEvent.estimatedPopulation.toLocaleString()} people within 5-mile radius</p>
                    <p className="text-xs text-gray-500 mt-1">Based on 2020 US Census data for ZIP code {selectedEvent.zipCode}</p>
                  </div>
                )}
                {selectedEvent.comments && (
                  <div>
                    <label className="text-xs font-semibold text-gray-500">Report Details</label>
                    <p className="text-gray-900 text-xs leading-relaxed">{selectedEvent.comments}</p>
                  </div>
                )}
                <div>
                  <label className="text-xs font-semibold text-gray-500">Coordinates</label>
                  <p className="text-gray-900 font-mono text-xs">{selectedEvent.lat.toFixed(4)}°, {selectedEvent.lon.toFixed(4)}°</p>
                </div>
              </div>
            )}
            
            <button
              onClick={() => setSelectedEvent(null)}
              className="mt-5 w-full bg-orange-600 text-white px-4 py-2 text-sm rounded-lg hover:bg-orange-700 transition-colors font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}