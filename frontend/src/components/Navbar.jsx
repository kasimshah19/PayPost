import React, { useContext, useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import api from '../api/axios';
import MoneyText from './MoneyText';

const Navbar = () => {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();
  const location = useLocation();
  const [walletBalance, setWalletBalance] = useState(null);

  useEffect(() => {
    const fetchBalance = () => {
      if (user && user.role === 'creator') {
        api.get('/wallet')
          .then(res => setWalletBalance(res.data.balancePaise))
          .catch(() => {});
      } else {
        setWalletBalance(null);
      }
    };

    fetchBalance();
    window.addEventListener('wallet_updated', fetchBalance);
    return () => window.removeEventListener('wallet_updated', fetchBalance);
  }, [user, location.pathname]);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 px-6 py-4 flex justify-between items-center">
      <Link to="/" className="text-2xl font-bold text-indigo-600">PayPost</Link>
      
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
