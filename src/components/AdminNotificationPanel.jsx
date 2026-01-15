import React, { useState } from 'react';
import { Send, AlertTriangle, Tornado, Cloud, Zap, CheckCircle, XCircle } from 'lucide-react';

export default function AdminNotificationPanel() {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const WORKER_URL = 'https://weather-spectrum-notifications.alysonwalters22.workers.dev';

  const quickTemplates = [
    {
      icon: <AlertTriangle className="w-5 h-5" />,
      label: 'Severe Weather',
      title: '⚠️ Severe Weather Alert',
      message: 'Severe thunderstorm warning issued for your area. Seek shelter immediately.',
      color: 'bg-red-500'
    },
    {
      icon: <Tornado className="w-5 h-5" />,
      label: 'Tornado',
      title: '🌪️ Tornado Warning',
      message: 'TORNADO WARNING! Take shelter now in lowest floor interior room.',
      color: 'bg-purple-500'
    },
    {
      icon: <Cloud className="w-5 h-5" />,
      label: 'Daily Forecast',
      title: '☀️ Today\'s Weather',
      message: 'Good morning! Today will be sunny with highs in the mid-70s.',
      color: 'bg-blue-500'
    },
    {
      icon: <Zap className="w-5 h-5" />,
      label: 'Special Event',
      title: '✨ Rare Weather Event',
      message: 'Aurora borealis may be visible tonight! Check the sky after 10 PM.',
      color: 'bg-yellow-500'
    }
  ];

  const handleSendNotification = async () => {
    if (!title || !message) {
      setResult({ success: false, message: 'Title and message are required' });
      return;
    }

    // Get password from sessionStorage
    const adminPassword = sessionStorage.getItem('adminAuth');
    if (!adminPassword) {
      setResult({ success: false, message: 'Not authenticated' });
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const response = await fetch(`${WORKER_URL}/send-notification`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminPassword}`,
        },
        body: JSON.stringify({
          title,
          message,
          url: url || 'https://theweatherspectrum.com',
        }),
      });

      const data = await response.json();

      if (response.ok) {
        setResult({ 
          success: true, 
          message: `Notification sent to ${data.recipients || 'all'} subscribers!` 
        });
        // Clear form after success
        setTimeout(() => {
          setTitle('');
          setMessage('');
          setUrl('');
          setResult(null);
        }, 3000);
      } else {
        if (response.status === 401) {
          setResult({ success: false, message: 'Invalid password. Please log in again.' });
          setTimeout(() => {
            sessionStorage.removeItem('adminAuth');
            window.location.reload();
          }, 2000);
        } else {
          setResult({ success: false, message: data.error || 'Failed to send notification' });
        }
      }
    } catch (error) {
      setResult({ success: false, message: error.message });
    } finally {
      setLoading(false);
    }
  };

  const useTemplate = (template) => {
    setTitle(template.title);
    setMessage(template.message);
  };

  return (
    <div className="max-w-4xl mx-auto p-6">
      <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-orange-600 to-amber-600 px-8 py-6">
          <h2 className="text-3xl font-bold text-white flex items-center gap-3">
            <Send className="w-8 h-8" />
            Send Weather Alert
          </h2>
          <p className="text-orange-100 mt-2">
            Send push notifications to all subscribed users
          </p>
        </div>

        {/* Quick Templates */}
        <div className="p-8 bg-gray-50 border-b border-gray-200">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">QUICK TEMPLATES</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {quickTemplates.map((template, idx) => (
              <button
                key={idx}
                onClick={() => useTemplate(template)}
                className={`${template.color} text-white p-4 rounded-xl hover:opacity-90 transition-all flex flex-col items-center gap-2 text-sm font-medium`}
              >
                {template.icon}
                {template.label}
              </button>
            ))}
          </div>
        </div>

        {/* Form */}
        <div className="p-8 space-y-6">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Notification Title *
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., ⚠️ Severe Weather Alert"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              maxLength={100}
            />
            <p className="text-xs text-gray-500 mt-1">{title.length}/100 characters</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Message *
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g., Severe thunderstorm warning issued for your area..."
              rows={4}
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              maxLength={200}
            />
            <p className="text-xs text-gray-500 mt-1">{message.length}/200 characters</p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Link URL (optional)
            </label>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://theweatherspectrum.com/alerts"
              className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
          </div>

          {/* Result Message */}
          {result && (
            <div className={`flex items-center gap-3 p-4 rounded-xl ${
              result.success 
                ? 'bg-green-50 text-green-800 border border-green-200' 
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {result.success ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <XCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <p className="font-medium">{result.message}</p>
            </div>
          )}

          {/* Send Button */}
          <button
            onClick={handleSendNotification}
            disabled={loading || !title || !message}
            className="w-full bg-gradient-to-r from-orange-600 to-amber-600 text-white px-8 py-4 rounded-xl font-bold text-lg shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            {loading ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                Send to All Subscribers
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}