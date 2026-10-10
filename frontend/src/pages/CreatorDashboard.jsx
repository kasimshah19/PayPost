import React, { useState, useEffect, useContext } from 'react';
import api from '../api/axios';
import { AuthContext } from '../context/AuthContext';
import CampaignCard from '../components/CampaignCard';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';

function CreatorDashboard() {
  const { user } = useContext(AuthContext);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCampaigns();
  }, []);

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
            <h2 className="text-xl font-bold mb-4">My Applications (Phase 4)</h2>
            <div className="text-sm text-gray-500 text-center p-4 border border-dashed rounded bg-gray-50">
              Applications placeholder
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-xl font-bold mb-4">My Submissions (Phase 5)</h2>
            <div className="text-sm text-gray-500 text-center p-4 border border-dashed rounded bg-gray-50">
              Submissions placeholder
            </div>
          </div>
          
          <div className="bg-white rounded-lg shadow-sm border p-6">
            <h2 className="text-xl font-bold mb-4">Wallet (Phase 6)</h2>
            <div className="text-sm text-gray-500 text-center p-4 border border-dashed rounded bg-gray-50">
              Wallet placeholder
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CreatorDashboard;
