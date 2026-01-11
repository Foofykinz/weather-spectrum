import React, { useState, useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

export default function WeatherAlerts({ lat, lon }) {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dismissed, setDismissed] = useState([]);

  useEffect(() => {
    if (!lat || !lon) return;

    const fetchAlerts = async () => {
      try {
        const response = await fetch(
          `https://api.weather.gov/alerts/active?point=${lat},${lon}`
        );
        const data = await response.json();
        
        if (data.features && data.features.length > 0) {
          setAlerts(data.features);
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching alerts:', error);
        setLoading(false);
      }
    };

    fetchAlerts();
    // Refresh alerts every 2 minutes
    const interval = setInterval(fetchAlerts, 120000);
    return () => clearInterval(interval);
  }, [lat, lon]);

  const getAlertColor = (severity, urgency) => {
    // Tornado/Severe warnings - red
    if (severity === 'Extreme' || urgency === 'Immediate') {
      return {
        bg: 'bg-red-600',
        border: 'border-red-700',
        text: 'text-white',
        icon: 'text-white'
      };
    }
    // Watches and less severe warnings - orange
    if (severity === 'Severe' || urgency === 'Expected') {
      return {
        bg: 'bg-orange-600',
        border: 'border-orange-700',
        text: 'text-white',
        icon: 'text-white'
      };
    }
    // Advisories - yellow
    return {
      bg: 'bg-yellow-500',
      border: 'border-yellow-600',
      text: 'text-stone-900',
      icon: 'text-stone-900'
    };
  };

  const handleDismiss = (alertId) => {
    setDismissed([...dismissed, alertId]);
  };

  const activeAlerts = alerts.filter(
    alert => !dismissed.includes(alert.id)
  );

  if (loading || activeAlerts.length === 0) return null;

  return (
    <div className="fixed top-20 left-0 right-0 z-40 px-6 max-w-7xl mx-auto">
      <div className="space-y-3">
        {activeAlerts.map((alert) => {
          const props = alert.properties;
          const colors = getAlertColor(props.severity, props.urgency);
          
          return (
            <div
              key={alert.id}
              className={`${colors.bg} ${colors.border} border-2 rounded-xl shadow-2xl animate-pulse`}
              style={{ animationDuration: '2s' }}
            >
              <div className="p-4 flex items-start gap-4">
                <AlertTriangle className={`w-6 h-6 ${colors.icon} flex-shrink-0 mt-1`} />
                
                <div className="flex-1">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className={`text-lg font-bold ${colors.text} mb-1`}>
                        {props.event}
                      </h3>
                      <p className={`text-sm ${colors.text} opacity-90 mb-2`}>
                        {props.areaDesc}
                      </p>
                      <p className={`text-sm ${colors.text} opacity-80`}>
                        {props.headline}
                      </p>
                    </div>
                    
                    <button
                      onClick={() => handleDismiss(alert.id)}
                      className={`${colors.text} hover:opacity-70 transition-opacity`}
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                  
                  {props.instruction && (
                    <details className="mt-3">
                      <summary className={`text-sm ${colors.text} font-semibold cursor-pointer hover:opacity-80`}>
                        Safety Instructions
                      </summary>
                      <p className={`text-sm ${colors.text} opacity-90 mt-2 leading-relaxed`}>
                        {props.instruction}
                      </p>
                    </details>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}