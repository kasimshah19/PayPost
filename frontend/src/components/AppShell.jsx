import React, { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../api/axios';
import MoneyText from './MoneyText';
import { Icon } from './ui/Icon';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { usePolling } from '../hooks/usePolling';
import { useSocket } from '../realtime/SocketProvider';
import { useRealtimeRefetch } from '../realtime/useRealtimeRefetch';

export default function AppShell({ children }) {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const navigate = useNavigate();
  const location = useLocation();

  const [walletBalance, setWalletBalance] = useState(null);
  const [heldCount, setHeldCount] = useState(0);
  const [isMoreOpen, setIsMoreOpen] = useState(false);

  const fetchStatus = async () => {
    if (!user) {
      setWalletBalance(null);
      setHeldCount(0);
      return;
    }

    try {
      if (user.role === 'creator') {
        const walletRes = await api.get('/wallet');
        setWalletBalance(walletRes.data.balancePaise);
      } else {
        setWalletBalance(null);
      }

      const notifRes = await api.get('/notifications/status');
      setHeldCount(notifRes.data.heldCount || 0);
    } catch {
      // Ignore background fetch errors
    }
  };

  // Real-time updates for wallet and notifications
  useRealtimeRefetch(['wallet:changed', 'notification:changed'], fetchStatus);

  // Fallback polling only when socket is disconnected
  usePolling(fetchStatus, 10000, Boolean(user) && !connected);

  useEffect(() => {
    fetchStatus();
    const handleWalletUpdated = () => fetchStatus();
    window.addEventListener('wallet_updated', handleWalletUpdated);
    return () => window.removeEventListener('wallet_updated', handleWalletUpdated);
  }, [user, location.pathname]);

  const handleLogout = () => {
    setIsMoreOpen(false);
    logout();
    navigate('/');
  };

  const isActive = (path) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 text-gray-900 pb-20 md:pb-8">
      {/* ================= DESKTOP NAVBAR (md and up) ================= */}
      <header className="hidden md:block bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <Link to="/" className="text-2xl font-bold text-indigo-600 tracking-tight">
              PayPost
            </Link>

            {user && (
              <nav className="flex items-center gap-1">
                {user.role === 'brand' && (
                  <>
                    <Link
                      to="/brand"
                      className={`min-h-11 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center ${
                        isActive('/brand') && location.pathname !== '/brand/campaigns/new'
                          ? 'text-indigo-600 bg-indigo-50 font-semibold'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      Dashboard
                    </Link>
                    <Link
                      to="/brand/campaigns/new"
                      className={`min-h-11 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center ${
                        isActive('/brand/campaigns/new')
                          ? 'text-indigo-600 bg-indigo-50 font-semibold'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      New campaign
                    </Link>
                  </>
                )}

                {user.role === 'creator' && (
                  <>
                    <Link
                      to="/creator"
                      className={`min-h-11 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center ${
                        isActive('/creator') && location.pathname !== '/creator/wallet'
                          ? 'text-indigo-600 bg-indigo-50 font-semibold'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      Dashboard
                    </Link>
                    <Link
                      to="/creator/wallet"
                      className={`min-h-11 px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center ${
                        isActive('/creator/wallet')
                          ? 'text-indigo-600 bg-indigo-50 font-semibold'
                          : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                      }`}
                    >
                      Wallet
                    </Link>
                  </>
                )}

                <Link
                  to="/notifications"
                  className={`min-h-11 px-3 py-2 rounded-lg text-sm font-medium transition-colors relative flex items-center gap-1.5 ${
                    isActive('/notifications')
                      ? 'text-indigo-600 bg-indigo-50 font-semibold'
                      : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  <span>Notifications</span>
                  {heldCount > 0 && (
                    <span
                      className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"
                      title={`${heldCount} notification(s) held for quiet hours`}
                    />
                  )}
                </Link>
              </nav>
            )}
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                {user.role === 'creator' && walletBalance !== null && (
                  <Link
                    to="/creator/wallet"
                    title="Creator Wallet Balance"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full text-xs font-semibold transition-colors shadow-sm min-h-9"
                  >
                    <Icon name="wallet" className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Balance:</span>
                    <MoneyText paise={walletBalance} />
                  </Link>
                )}

                <Link
                  to="/settings/notifications"
                  className="min-h-11 min-w-11 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                  title="Notification settings"
                  aria-label="Notification settings"
                >
                  <Icon name="settings" className="w-5 h-5" />
                </Link>

                <div className="text-right text-xs">
                  <p className="font-semibold text-gray-800 leading-tight">{user.name}</p>
                  <span className="text-indigo-600 capitalize">{user.role}</span>
                </div>

                <Button variant="ghost" onClick={handleLogout} className="text-sm">
                  Logout
                </Button>
              </>
            ) : (
              <div className="flex items-center gap-2">
                <Link to="/login">
                  <Button variant="ghost" className="text-sm">
                    Login
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button variant="primary" className="text-sm">
                    Sign up
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ================= MOBILE TOP BAR (below md) ================= */}
      <header className="md:hidden bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="px-4 h-14 flex items-center justify-between">
          <Link to="/" className="text-xl font-bold text-indigo-600 tracking-tight">
            PayPost
          </Link>

          <div className="flex items-center gap-2">
            {user && user.role === 'creator' && walletBalance !== null && (
              <Link
                to="/creator/wallet"
                className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-full text-xs font-semibold min-h-9"
              >
                <Icon name="wallet" className="w-3.5 h-3.5 text-emerald-600" />
                <MoneyText paise={walletBalance} />
              </Link>
            )}

            {!user && (
              <div className="flex items-center gap-1.5">
                <Link to="/login">
                  <Button variant="ghost" className="text-xs px-2.5 min-h-9 min-w-9">
                    Login
                  </Button>
                </Link>
                <Link to="/signup">
                  <Button variant="primary" className="text-xs px-2.5 min-h-9 min-w-9">
                    Sign up
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* ================= MAIN CONTAINER ================= */}
      <main className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* ================= MOBILE BOTTOM TAB BAR (below md, logged-in only) ================= */}
      {user && (
        <nav
          className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-gray-200 pb-safe shadow-lg"
          aria-label="Mobile navigation"
        >
          <div className="grid grid-cols-4 h-16">
            {/* Tab 1: Home */}
            <Link
              to={user.role === 'brand' ? '/brand' : '/creator'}
              className={`flex flex-col items-center justify-center min-h-11 transition-colors ${
                (user.role === 'brand' ? isActive('/brand') && location.pathname !== '/brand/campaigns/new' : isActive('/creator') && location.pathname !== '/creator/wallet')
                  ? 'text-indigo-600 font-bold'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <Icon name="home" className="w-5 h-5 mb-0.5" />
              <span className="text-[11px] leading-tight">Home</span>
            </Link>

            {/* Tab 2: Action or Wallet */}
            {user.role === 'brand' ? (
              <Link
                to="/brand/campaigns/new"
                className={`flex flex-col items-center justify-center min-h-11 transition-colors ${
                  isActive('/brand/campaigns/new') ? 'text-indigo-600 font-bold' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <Icon name="plus" className="w-5 h-5 mb-0.5" />
                <span className="text-[11px] leading-tight">New</span>
              </Link>
            ) : (
              <Link
                to="/creator/wallet"
                className={`flex flex-col items-center justify-center min-h-11 transition-colors ${
                  isActive('/creator/wallet') ? 'text-indigo-600 font-bold' : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                <Icon name="wallet" className="w-5 h-5 mb-0.5" />
                <span className="text-[11px] leading-tight">Wallet</span>
              </Link>
            )}

            {/* Tab 3: Alerts / Notifications */}
            <Link
              to="/notifications"
              className={`flex flex-col items-center justify-center min-h-11 transition-colors relative ${
                isActive('/notifications') ? 'text-indigo-600 font-bold' : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              <div className="relative">
                <Icon name="bell" className="w-5 h-5 mb-0.5" />
                {heldCount > 0 && (
                  <span className="absolute -top-0.5 -right-1 w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                )}
              </div>
              <span className="text-[11px] leading-tight">Alerts</span>
            </Link>

            {/* Tab 4: More */}
            <button
              type="button"
              onClick={() => setIsMoreOpen(true)}
              className="flex flex-col items-center justify-center min-h-11 text-gray-500 hover:text-gray-900 transition-colors"
            >
              <Icon name="more" className="w-5 h-5 mb-0.5" />
              <span className="text-[11px] leading-tight">More</span>
            </button>
          </div>
        </nav>
      )}

      {/* ================= MORE BOTTOM SHEET (Mobile) ================= */}
      <Modal isOpen={isMoreOpen} onClose={() => setIsMoreOpen(false)} title="Account & Settings">
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 rounded-xl">
            <p className="font-bold text-gray-900 text-base">{user?.name}</p>
            <p className="text-xs text-gray-500">{user?.email}</p>
            <span className="mt-1 inline-block text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full capitalize font-semibold">
              {user?.role}
            </span>
          </div>

          <div className="space-y-2">
            <Link
              to="/settings/notifications"
              onClick={() => setIsMoreOpen(false)}
              className="w-full min-h-11 px-3 py-2 rounded-xl flex items-center justify-between text-gray-700 hover:bg-gray-100 active:bg-gray-200 transition-colors"
            >
              <div className="flex items-center gap-3">
                <Icon name="settings" className="w-5 h-5 text-gray-500" />
                <span className="text-sm font-medium">Notification settings</span>
              </div>
              <Icon name="chevron-down" className="w-4 h-4 -rotate-90 text-gray-400" />
            </Link>
          </div>

          <div className="pt-2 border-t border-gray-100">
            <Button variant="danger" fullWidth onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
