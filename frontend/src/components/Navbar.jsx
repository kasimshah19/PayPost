import React, { useContext, useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../api/axios';
import MoneyText from './MoneyText';
import { usePolling } from '../hooks/usePolling';
import ConnectionBadge from './ConnectionBadge';
import { useSocket } from '../realtime/SocketProvider';
import { useRealtimeRefetch } from '../realtime/useRealtimeRefetch';

const Navbar = () => {
  const { user, logout } = useContext(AuthContext);
  const { connected } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();
  const [walletBalance, setWalletBalance] = useState(null);
  const [heldCount, setHeldCount] = useState(0);

  const fetchBalanceAndHeld = useCallback(async () => {
    if (user) {
      if (user.role === 'creator') {
        try {
          const res = await api.get('/wallet');
          setWalletBalance(res.data.balancePaise);
        } catch {
          // ignore error
        }
      } else {
        setWalletBalance(null);
      }

      try {
        const res = await api.get('/notifications/status');
        setHeldCount(res.data.heldCount || 0);
      } catch {
        // ignore error
      }
    } else {
      setWalletBalance(null);
      setHeldCount(0);
    }
  }, [user]);

  // Initial and on route change fetch
  useEffect(() => {
    fetchBalanceAndHeld();
    window.addEventListener('wallet_updated', fetchBalanceAndHeld);
    return () => {
      window.removeEventListener('wallet_updated', fetchBalanceAndHeld);
    };
  }, [fetchBalanceAndHeld, location.pathname]);

  // Real-time updates for wallet balance and held notification counter
  useRealtimeRefetch(['wallet:changed', 'notification:changed'], fetchBalanceAndHeld);

  // Polling is FALLBACK only when socket is NOT connected
  usePolling(fetchBalanceAndHeld, { intervalMs: 10000, enabled: Boolean(user) && !connected });

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 px-4 sm:px-6 py-3.5 flex justify-between items-center gap-2">
      <div className="flex items-center gap-2 sm:gap-3 shrink-0">
        <Link to="/" className="text-xl sm:text-2xl font-bold text-indigo-600">PayPost</Link>
        {user && <ConnectionBadge />}
      </div>
      
      <div>
        {user ? (
          <div className="flex items-center gap-4">
            {user.role === 'creator' && walletBalance !== null && (
              <Link
                to="/creator/wallet"
                title="View Creator Wallet"
                className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-full text-xs font-semibold transition-colors shadow-sm"
              >
                <svg className="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                <span>Wallet:</span>
                <MoneyText paise={walletBalance} />
              </Link>
            )}

            {/* Notifications Link with Held Badge */}
            <Link
              to="/notifications"
              className="relative text-sm text-gray-600 hover:text-indigo-600 font-medium flex items-center gap-1"
              title="Notifications"
            >
              <span>Notifications</span>
              {heldCount > 0 && (
                <span 
                  className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"
                  title={`${heldCount} notification(s) held for quiet hours`}
                />
              )}
            </Link>

            {/* Notification Settings Link */}
            <Link
              to="/settings/notifications"
              className="text-gray-400 hover:text-gray-600"
              title="Notification Settings"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>

            <span className="text-gray-700 text-sm">
              {user.name} 
              <span className="ml-2 text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full capitalize font-medium">
                {user.role}
              </span>
            </span>

            <button 
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              Logout
            </button>
          </div>
        ) : (
          <div className="flex gap-4">
            <Link to="/login" className="text-gray-600 hover:text-gray-900 font-medium py-2">Login</Link>
            <Link to="/signup" className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 font-medium transition-colors">Sign up</Link>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;
