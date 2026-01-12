import React, { useState, useEffect } from 'react';
import { Camera, Loader, MapPin } from 'lucide-react';

export default function NearbyWebcams({ lat, lon, maxDistance = 50 }) {
  const [webcams, setWebcams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Calculate distance between two coordinates (Haversine formula)
  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 3959; // Earth's radius in miles
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  };

  useEffect(() => {
    if (!lat || !lon) return;

    const fetchWebcams = async () => {
      try {
        setLoading(true);
        
        // Windy.com webcams API - free tier
        const API_KEY = process.env.REACT_APP_WINDY_KEY;
        const response = await fetch(
          `https://api.windy.com/api/webcams/v2/list/nearby=${lat},${lon},${maxDistance}?show=webcams:image,location&key=${API_KEY}`
        );
        
        if (!response.ok) throw new Error('Failed to fetch webcams');
        
        const data = await response.json();
        
        if (data.result && data.result.webcams) {
          // Sort by distance
          const sorted = data.result.webcams
            .map(cam => ({
              ...cam,
              distance: calculateDistance(
                lat, lon,
                cam.location.latitude,
                cam.location.longitude
              )
            }))
            .sort((a, b) => a.distance - b.distance)
            .slice(0, 6); // Show top 6 closest
          
          setWebcams(sorted);
        }
        
        setLoading(false);
      } catch (err) {
        console.error('Webcam fetch error:', err);
        setError('Unable to load nearby webcams');
        setLoading(false);
      }
    };

    fetchWebcams();
  }, [lat, lon, maxDistance]);

  if (!lat || !lon) return null;

  if (loading) {
    return (
      <section className="max-w-7xl mx-auto px-6 py-16">
        <h3 className="text-4xl font-bold mb-10 text-stone-900">Nearby Webcams</h3>
        <div className="flex items-center justify-center py-20">
          <Loader className="w-12 h-12 text-orange-600 animate-spin" />
        </div>
      </section>
    );
  }

  if (error || webcams.length === 0) {
    return (
      <section className="max-w-7xl mx-auto px-6 py-16">
        <h3 className="text-4xl font-bold mb-10 text-stone-900">Nearby Webcams</h3>
        <div className="bg-white rounded-3xl p-10 shadow-xl border border-stone-200 text-center">
          <Camera className="w-16 h-16 text-stone-300 mx-auto mb-4" />
          <p className="text-stone-600">No webcams found within {maxDistance} miles of your location.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-7xl mx-auto px-6 py-16">
      <div className="flex items-center justify-between mb-10">
        <h3 className="text-4xl font-bold text-stone-900">Nearby Webcams</h3>
        <div className="flex items-center gap-2 text-stone-600">
          <MapPin className="w-5 h-5" />
          <span className="text-sm font-semibold">Within {maxDistance} miles</span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {webcams.map((cam, idx) => (
          <div key={cam.id} className="group relative">
            <div className="absolute -inset-0.5 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl opacity-0 group-hover:opacity-100 blur transition-opacity" />
            <div className="relative bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all border border-stone-200">
              {/* Webcam Image */}
              <div className="relative aspect-video bg-stone-900">
                <img
                  src={cam.image.current.preview}
                  alt={cam.title}
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 right-3 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  LIVE
                </div>
              </div>

              {/* Webcam Info */}
              <div className="p-4">
                <h4 className="font-bold text-stone-900 mb-1">{cam.title}</h4>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-600">
                    {cam.location.city}, {cam.location.region}
                  </span>
                  <span className="text-orange-600 font-semibold">
                    {cam.distance.toFixed(1)} mi
                  </span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 text-center">
        <p className="text-sm text-stone-500">
          Webcams provided by <a href="https://windy.com" target="_blank" rel="noopener noreferrer" className="text-orange-600 hover:underline">Windy.com</a>
        </p>
      </div>
    </section>
  );
}