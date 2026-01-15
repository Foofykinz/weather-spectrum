import React from 'react';
import { AlertTriangle, Cloud, Tornado, Zap, Bell } from 'lucide-react';
import PushNotificationButton from './PushNotificationButton';

export default function AlertTypesSection() {
  const alertTypes = [
    {
      icon: <AlertTriangle className="w-6 h-6" />,
      title: 'Severe Weather',
      color: 'text-red-500'
    },
    {
      icon: <Tornado className="w-6 h-6" />,
      title: 'Tornado Warnings',
      color: 'text-purple-500'
    },
    {
      icon: <Cloud className="w-6 h-6" />,
      title: 'Daily Updates',
      color: 'text-blue-500'
    },
    {
      icon: <Zap className="w-6 h-6" />,
      title: 'Special Events',
      color: 'text-yellow-500'
    }
  ];

  return (
    <section className="max-w-7xl mx-auto px-6 py-16">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-600 via-amber-600 to-yellow-600 shadow-2xl">
        {/* Subtle background pattern */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-10 right-10 w-64 h-64 bg-white rounded-full blur-3xl"></div>
          <div className="absolute bottom-10 left-10 w-96 h-96 bg-white rounded-full blur-3xl"></div>
        </div>

        <div className="relative px-8 py-12 md:py-16">
          {/* Main content */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl mb-6 animate-pulse">
              <Bell className="w-8 h-8 text-white" />
            </div>
            
            <h2 className="text-4xl md:text-5xl font-bold text-white mb-4">
              Never Miss Critical Weather
            </h2>
            <p className="text-white/90 text-lg md:text-xl mb-8 max-w-2xl mx-auto">
              Get instant alerts for severe weather, tornadoes, and daily forecasts—right on your device
            </p>
            
            <PushNotificationButton />
          </div>

          {/* Alert types - compact inline version */}
          <div className="flex flex-wrap justify-center gap-4 mt-10">
            {alertTypes.map((alert, index) => (
              <div
                key={index}
                className="flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/20 rounded-full px-4 py-2"
              >
                <div className={`${alert.color}`}>
                  {alert.icon}
                </div>
                <span className="text-white text-sm font-medium">
                  {alert.title}
                </span>
              </div>
            ))}
          </div>

          {/* Small disclaimer */}
          <p className="text-center text-white/70 text-sm mt-8">
            Customize your alerts anytime in browser settings • Works on all devices
          </p>
        </div>
      </div>
    </section>
  );
}