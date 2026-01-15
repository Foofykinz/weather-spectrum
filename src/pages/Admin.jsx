import React, { useState, useEffect } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import AdminNotificationPanel from '../components/AdminNotificationPanel';

export default function Admin() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Check if already authenticated (stored in sessionStorage)
  useEffect(() => {
    const storedAuth = sessionStorage.getItem('adminAuth');
    if (storedAuth) {
      setIsAuthenticated(true);
    }
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // Store password in sessionStorage for this session
    sessionStorage.setItem('adminAuth', password);
    
    // Simple delay for UX
    setTimeout(() => {
      setIsAuthenticated(true);
      setLoading(false);
    }, 500);
  };

  const handleLogout = () => {
    sessionStorage.removeItem('adminAuth');
    setIsAuthenticated(false);
    setPassword('');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-orange-50 via-amber-50 to-yellow-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-3xl shadow-2xl border border-gray-200 overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-orange-600 to-amber-600 px-8 py-10 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-white/20 backdrop-blur-sm rounded-2xl mb-4">
                <Lock className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-3xl font-bold text-white mb-2">Admin Access</h2>
              <p className="text-orange-100">Enter password to continue</p>
            </div>

            {/* Login Form */}
            <form onSubmit={handleLogin} className="p-8 space-y-6">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Password
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter admin password"
                    className="w-full px-4 py-3 pr-12 border border-gray-300 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    {showPassword ? (
                      <EyeOff className="w-5 h-5" />
                    ) : (
                      <Eye className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>

              {error && (
                <div className="bg-red-50 text-red-800 px-4 py-3 rounded-xl border border-red-200 text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !password}
                className="w-full bg-gradient-to-r from-orange-600 to-amber-600 text-white px-6 py-3 rounded-xl font-semibold shadow-lg hover:shadow-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  <>
                    <Lock className="w-5 h-5" />
                    Login
                  </>
                )}
              </button>
            </form>

            {/* Footer */}
            <div className="px-8 py-6 bg-gray-50 border-t border-gray-200 text-center">
              <p className="text-sm text-gray-600">
                🔒 Protected area for authorized users only
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white py-12">
      {/* Logout Button */}
      <div className="max-w-4xl mx-auto px-6 mb-4">
        <button
          onClick={handleLogout}
          className="text-gray-600 hover:text-gray-900 font-medium text-sm flex items-center gap-2"
        >
          <Lock className="w-4 h-4" />
          Logout
        </button>
      </div>
      
      <AdminNotificationPanel />
    </div>
  );
}