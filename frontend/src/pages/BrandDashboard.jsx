import React, { useState, useEffect, useContext } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import { AuthContext } from '../context/AuthContext';
import CampaignCard from '../components/CampaignCard';
import Spinner from '../components/Spinner';
import EmptyState from '../components/EmptyState';
import MoneyText from '../components/MoneyText';

function BrandDashboard() {
  const { user } = useContext(AuthContext);
  const [summary, setSummary] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetchData();
  }, [filter]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [sumRes, campRes] = await Promise.all([
        api.get('/campaigns/mine/summary'),
        api.get(`/campaigns/mine${filter ? `?status=${filter}` : ''}`)
      ]);
      setSummary(sumRes.data);
      setCampaigns(campRes.data);
    } catch (err) {
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <div className="p-8 text-red-500">{error}</div>;

  // Find oldest campaign with pending reviews
  const pendingCampaigns = campaigns
    .filter(c => (c.pendingReviewCount > 0) || (c.submissionCounts?.submitted > 0))
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  const oldestPendingCampaign = pendingCampaigns[0];

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold">Brand Dashboard</h1>
          <p className="text-gray-600 mt-1">Welcome back, {user.name}</p>
        </div>
        <Link to="/brand/campaigns/new" className="bg-indigo-600 text-white px-6 py-2 rounded-md hover:bg-indigo-700 font-medium transition-colors">
          + Create Campaign
        </Link>
      </div>

      {summary && summary.pendingReviewCount > 0 && (
        <div className="mb-8 bg-amber-50 border-l-4 border-amber-500 p-5 rounded-r-lg shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
              <h3 className="text-lg font-bold text-amber-900">Needs Your Review</h3>
            </div>
            <p className="text-sm text-amber-800 mt-1">
              You have <span className="font-bold text-amber-950">{summary.pendingReviewCount}</span> pending {summary.pendingReviewCount === 1 ? 'submission' : 'submissions'} awaiting your approval or feedback.
            </p>
          </div>
          {oldestPendingCampaign && (
            <Link
              to={`/brand/campaigns/${oldestPendingCampaign._id}`}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium text-sm rounded-md shadow-xs transition-colors shrink-0"
            >
              Review Oldest: {oldestPendingCampaign.title} &rarr;
            </Link>
          )}
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <p className="text-sm text-gray-500">Active</p>
            <p className="text-2xl font-bold">{summary.activeCampaigns} <span className="text-lg font-normal text-gray-400">/ {summary.totalCampaigns}</span></p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <p className="text-sm text-gray-500">Total Budget</p>
            <p className="text-xl font-bold text-indigo-700"><MoneyText paise={summary.totalBudgetPaise} /></p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <p className="text-sm text-gray-500">Reserved</p>
            <p className="text-xl font-bold text-orange-600"><MoneyText paise={summary.totalReservedPaise} /></p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <p className="text-sm text-gray-500">Paid Out</p>
            <p className="text-xl font-bold text-gray-700"><MoneyText paise={summary.totalPaidOutPaise} /></p>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <p className="text-sm text-gray-500">Available</p>
            <p className="text-xl font-bold text-green-600"><MoneyText paise={summary.totalAvailablePaise} /></p>
          </div>
        </div>
      )}

      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">My Campaigns</h2>
        <select 
          value={filter} 
          onChange={(e) => setFilter(e.target.value)}
          className="border-gray-300 rounded-md shadow-sm p-2 border"
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>

      {campaigns.length === 0 ? (
        <EmptyState message="No campaigns found" />
      ) : (
        <div className="grid gap-6">
          {campaigns.map(c => <CampaignCard key={c._id} campaign={c} isBrand={true} />)}
        </div>
      )}
    </div>
  );
}

export default BrandDashboard;
