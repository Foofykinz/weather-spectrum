import React, { useState, useEffect } from 'react';
import { Bell, Check } from 'lucide-react';
import { subscribeUser, isSubscribed } from '../utils/oneSignalConfig';

export default function PushNotificationButton({ variant = 'default' }) {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    checkSubscription();
  }, []);

  const checkSubscription = async () => {
    const status = await isSubscribed();
    setSubscribed(status);
  };

  const handleSubscribe = async () => {
    setLoading(true);
    const success = await subscribeUser();
    if (success) {
      setTimeout(() => {
        checkSubscription();
        setLoading(false);
      }, 1000);
    } else {
      setLoading(false);
    }
  };

  // Compact variant (for nav)
  if (variant === 'compact') {
    return (
      <button
        onClick={handleSubscribe}
        disabled={subscribed || loading}
        className={`p-2 rounded-lg transition-all ${
          subscribed 
            ? 'bg-green-100 text-green-600' 
            : 'bg-orange-100 text-orange-600 hover:bg-orange-200'
        }`}
        title={subscribed ? 'Subscribed to alerts' : 'Subscribe to weather alerts'}
      >
        {subscribed ? <Check className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
      </button>
    );
  }

  // Default large variant - IMPROVED VERSION
  return (
    <button
      onClick={handleSubscribe}
      disabled={subscribed || loading}
      className={`inline-flex items-center justify-center gap-3 px-8 py-4 rounded-2xl font-bold text-lg transition-all transform hover:scale-105 shadow-xl ${
        subscribed
          ? 'bg-white text-green-600 cursor-not-allowed'
          : 'bg-white text-orange-600 hover:shadow-2xl active:scale-95'
      }`}
    >
      {loading ? (
        <>
          <div className="w-6 h-6 border-3 border-orange-600 border-t-transparent rounded-full animate-spin" />
          <span>Setting up alerts...</span>
        </>
      ) : subscribed ? (
        <>
          <Check className="w-6 h-6" />
          <span>✓ Subscribed to Alerts</span>
        </>
      ) : (
        <>
          <Bell className="w-6 h-6" />
          <span>Get Weather Alerts</span>
        </>
      )}
    </button>
  );
}