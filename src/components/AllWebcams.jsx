import React, { useState, useEffect } from 'react';
import { Camera, Loader, MapPin, ExternalLink } from 'lucide-react';
import customWebcams from '../data/webcams.json';

export default function AllWebcams({ lat, lon, maxDistance = 100 }) {
  const [allCams, setAllCams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const calculateDistance = (lat1, lon1, lat2, lon2) => {
    const R = 3959;
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

    const fetchAllWebcams = async () => {
      try {
        setLoading(true);
        let combinedCams = [];

        // 1. Fetch Windy cams
        try {
          const API_KEY = process.env.REACT_APP_WINDY_KEY;
          const windyResponse = await fetch(
            `https://api.windy.com/api/webcams/v2/list/nearby=${lat},${lon},${maxDistance}?show=webcams:image,location&key=${API_KEY}`
          );
          
          if (windyResponse.ok) {
            const windyData = await windyResponse.json();
            if (windyData.result && windyData.result.webcams) {
              const windyCams = windyData.result.webcams.map(cam => ({
                id: `windy-${cam.id}`,
                title: cam.title,
                image: cam.image.current.preview,
                city: cam.location.city,
                state: cam.location.region,
                latitude: cam.location.latitude,
                longitude: cam.location.longitude,
                distance: calculateDistance(lat, lon, cam.location.latitude, cam.location.longitude),
                source: 'Windy',
                type: 'live'
              }));
              combinedCams.push(...windyCams);
            }
          }
        } catch (err) {
          console.error('Windy fetch failed:', err);
        }

        // 2. Add custom webcams from JSON
        const customCams = customWebcams.custom
          .map(cam => ({
            ...cam,
            distance: calculateDistance(lat, lon, cam.latitude, cam.longitude),
            source: 'Custom'
          }))
          .filter(cam => cam.distance <= maxDistance);
        
        combinedCams.push(...customCams);

        // 3. Sort by distance
        combinedCams.sort((a, b) => a.distance - b.distance);

        setAllCams(combinedCams);
        setLoading(false);
      } catch (err) {
        console.error('Webcam fetch error:', err);
        setError('Unable to load webcams');
        setLoading(false);
      }
    };

    fetchAllWebcams();
  }, [lat, lon, maxDistance]);

  if (!lat || !lon) return null;

  if (loading) {
    return (
      <section className="max-w-7xl mx-auto px-6 py-16">
        <h3 className="text-4xl font-bold mb-10 text-stone-900">Live Webcams</h3>
        <div className="flex items-center justify-center py-20">
          <Loader className="w-12 h-12 text-orange-600 animate-spin" />
        </div>
      </section>
    );
  }

  if (allCams.length === 0) {
    return (
      <section className="max-w-7xl mx-auto px-6 py-16">
        <h3 className="text-4xl font-bold mb-10 text-stone-900">Live Webcams</h3>
        <div className="bg-white rounded-3xl p-10 shadow-xl border border-stone-200 text-center">
          <Camera className="w-16 h-16 text-stone-300 mx-auto mb-4" />
          <p className="text-stone-600">No webcams found within {maxDistance} miles of your location.</p>
          <p className="text-stone-500 text-sm mt-2">Try increasing your search radius or check back later.</p>
        </div>
      </section>
    );
  }

  return (
    <section className="max-w-7xl mx-auto px-6 py-16">
      <div className="flex items-center justify-between mb-10">
        <h3 className="text-4xl font-bold text-stone-900">Live Webcams</h3>
        <div className="flex items-center gap-2 text-stone-600">
          <MapPin className="w-5 h-5" />
          <span className="text-sm font-semibold">{allCams.length} cams within {maxDistance} miles</span>
        </div>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
        {allCams.map((cam) => (
          <div key={cam.id} className="group relative">
            <div className="absolute -inset-0.5 bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl opacity-0 group-hover:opacity-100 blur transition-opacity" />
            <div className="relative bg-white rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all border border-stone-200">
              
              {/* Webcam Image or Embed */}
              <div className="relative aspect-video bg-stone-900">
                {cam.image ? (
                  <img
                    src={cam.image}
                    alt={cam.title}
                    className="w-full h-full object-cover"
                  />
                ) : cam.url ? (
                  <div className="w-full h-full flex items-center justify-center">
                    <a 
                      href={cam.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-white hover:text-orange-400 transition-colors flex flex-col items-center gap-2"
                    >
                      <ExternalLink className="w-12 h-12" />
                      <span className="text-sm">View Camera</span>
                    </a>
                  </div>
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-stone-500">
                    <Camera className="w-12 h-12" />
                  </div>
                )}
                
                <div className="absolute top-3 right-3 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                  {cam.type || 'LIVE'}
                </div>

                <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm text-white px-2 py-1 rounded text-xs font-semibold">
                  {cam.source}
                </div>
              </div>

              {/* Webcam Info */}
              <div className="p-4">
                <h4 className="font-bold text-stone-900 mb-1">{cam.title}</h4>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-stone-600">
                    {cam.city}, {cam.state}
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

      <div className="mt-8 text-center text-sm text-stone-500">
        <p>Webcams from Windy.com and curated sources</p>
      </div>
    </section>
  );
}