import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { AuthContext } from '../context/AuthContext';
import CampaignCard from '../components/CampaignCard';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import MoneyText from '../components/MoneyText';

import CreatorApplicationList from '../components/CreatorApplicationList';
import CreatorSubmissionList from '../components/CreatorSubmissionList';

function CreatorDashboard() {
  const { user } = useContext(AuthContext);
  const [campaigns, setCampaigns] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCampaigns();
    fetchWallet();
  }, []);

  const fetchWallet = async () => {
    try {
      const res = await api.get('/wallet');
      setWallet(res.data);
    } catch (err) {
      console.error('Failed to load wallet summary:', err);
    }
  };

  const fetchCampaigns = async () => {
    try {
      const res = await api.get('/campaigns');
      setCampaigns(res.data);
    } catch (err) {
      setError('Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold">Creator Dashboard</h1>
        <p className="text-gray-600 mt-1">Welcome back, {user.name}</p>
      </div>

      <div className="grid md:grid-cols-3 gap-8">
        <div className="md:col-span-2">
          <h2 className="text-2xl font-bold mb-6">Browse Active Campaigns</h2>
          
          {loading ? (
            <Spinner />
          ) : error ? (
            <div className="text-red-500">{error}</div>
          ) : campaigns.length === 0 ? (
            <EmptyState message="No active campaigns available right now. Check back later!" />
          ) : (
            <div className="grid gap-6">
              {campaigns.map(c => <CampaignCard key={c._id} campaign={c} isBrand={false} />)}
            </div>
          )}
        </div>
        
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-xl font-bold mb-4">My Applications</h2>
            <CreatorApplicationList />
          </div>
          
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-xl font-bold mb-4">My Submissions</h2>
            <CreatorSubmissionList />
          </div>
          
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-gray-900">My Wallet</h2>
              <Link to="/creator/wallet" className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold">
                View Ledger &rarr;
              </Link>
            </div>
            
            <div className="bg-emerald-50/70 border border-emerald-200 rounded-lg p-4 mb-3">
              <div className="text-xs uppercase font-semibold text-emerald-800">Available Balance</div>
              <div className="text-2xl font-extrabold text-emerald-600 mt-1">
                <MoneyText paise={wallet?.balancePaise ?? 0} />
              </div>
            </div>

            {wallet?.heldPaise > 0 && (
              <div className="bg-amber-50/60 border border-amber-200 rounded-lg p-3 mb-3 flex items-center justify-between text-xs">
                <span className="text-amber-800 font-medium">On Hold (Withdrawal):</span>
                <span className="font-bold text-amber-900 font-mono"><MoneyText paise={wallet.heldPaise} /></span>
              </div>
            )}

            {wallet?.activeWithdrawal && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 mb-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-indigo-900">Withdrawal In Progress</span>
                  <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-200 text-indigo-900 uppercase">
                    {wallet.activeWithdrawal.status}
                  </span>
                </div>
                <div className="text-indigo-700 mt-1 text-[11px]">
                  Processing <MoneyText paise={wallet.activeWithdrawal.amountPaise} /> to UPI
                </div>
              </div>
            )}

            <div className="flex justify-between items-center text-xs text-gray-500 pt-1">
              <span>Expected: <span className="font-semibold text-gray-700"><MoneyText paise={wallet?.expectedPaise ?? 0} /></span></span>
              <span>Lifetime: <span className="font-semibold text-gray-700"><MoneyText paise={wallet?.lifetimeEarnedPaise ?? 0} /></span></span>
            </div>
            <Link
              to="/creator/wallet"
              className="mt-4 block w-full text-center py-2 px-3 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
            >
              Open Full Wallet &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreatorDashboard;
