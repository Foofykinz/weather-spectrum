import React, { useState, useEffect } from 'react';

export default function CookieConsent() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem('cookieConsent');
    
    if (consent === 'accepted') {
      // User previously accepted - load GA
      loadGoogleAnalytics();
    } else if (!consent) {
      // No choice made yet - show banner
      setShowBanner(true);
    }
    // If declined, do nothing (no GA loads)
  }, []);

  const loadGoogleAnalytics = () => {
    // Load GA script dynamically
    const script1 = document.createElement('script');
    script1.async = true;
    script1.src = 'https://www.googletagmanager.com/gtag/js?id=G-9JJV2KQ27V';
    document.head.appendChild(script1);

    // Initialize GA
    const script2 = document.createElement('script');
    script2.innerHTML = `
      window.dataLayer = window.dataLayer || [];
      function gtag(){dataLayer.push(arguments);}
      gtag('js', new Date());
      gtag('config', 'G-9JJV2KQ27V');
    `;
    document.head.appendChild(script2);
  };

  const handleAccept = () => {
    localStorage.setItem('cookieConsent', 'accepted');
    setShowBanner(false);
    loadGoogleAnalytics();
  };

  const handleDecline = () => {
    localStorage.setItem('cookieConsent', 'declined');
    setShowBanner(false);
    // GA never loads - fully compliant!
  };

  if (!showBanner) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-stone-900 text-white p-4 shadow-lg z-50 border-t-2 border-orange-500">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex-1 text-sm">
          <p className="font-semibold mb-1">🍪 We use cookies</p>
          <p className="text-stone-300">
            We use essential cookies for site functionality and analytics cookies to understand how you use our site. 
            By clicking "Accept", you consent to our use of cookies. 
            <a href="/privacy-policy" className="text-orange-400 hover:text-orange-300 ml-1 underline">
              Learn more
            </a>
          </p>
        </div>
        <div className="flex gap-3 flex-shrink-0">
          <button
            onClick={handleDecline}
            className="px-4 py-2 text-sm border border-stone-600 rounded-lg hover:bg-stone-800 transition-colors"
          >
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="px-4 py-2 text-sm bg-orange-600 rounded-lg hover:bg-orange-700 transition-colors font-semibold"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}