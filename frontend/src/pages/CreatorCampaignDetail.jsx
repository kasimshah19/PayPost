import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import MoneyText from '../components/MoneyText';
import { formatDateIST } from '../utils/date';

function CreatorCampaignDetail() {
  const { id } = useParams();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchCampaign();
  }, [id]);

  const fetchCampaign = async () => {
    try {
      const res = await api.get(`/campaigns/${id}`);
      setCampaign(res.data);
    } catch (err) {
      setError('Failed to load campaign details');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <div className="p-8 text-red-500 text-center">{error}</div>;
  if (!campaign) return null;

  const [applyLoading, setApplyLoading] = useState(false);

  const handleApply = async () => {
    const pitch = prompt('Enter a short pitch for why you are a good fit (optional):');
    if (pitch === null) return;
    
    setApplyLoading(true);
    try {
      await api.post(`/campaigns/${id}/apply`, { pitch });
      await fetchCampaign(); // Refresh status
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to apply');
    } finally {
      setApplyLoading(false);
    }
  };

  const isClosed = campaign.status !== 'active' || campaign.slotsLeft <= 0 || new Date(campaign.applicationDeadline) < new Date();

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link to="/creator" className="text-indigo-600 hover:underline">&larr; Back to Dashboard</Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-6 md:p-8">
        <div className="flex flex-col md:flex-row justify-between items-start mb-6 gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{campaign.title}</h1>
            <p className="text-lg text-gray-600 mb-2">by {campaign.brand?.name}</p>
            <div className="flex gap-2">
              <StatusBadge status={campaign.status} />
              {campaign.myApplicationStatus && (
                <span className="text-xs font-semibold bg-purple-100 text-purple-800 px-2 py-1 rounded-full uppercase">
                  You: {campaign.myApplicationStatus}
                </span>
              )}
            </div>
          </div>
          
          <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-lg text-center min-w-[200px]">
            <p className="text-sm text-indigo-800 mb-1">Fee per Creator</p>
            <p className="text-2xl font-bold text-indigo-600"><MoneyText paise={campaign.perCreatorFeePaise} /></p>
          </div>
        </div>

        {isClosed && (
          <div className="bg-yellow-50 text-yellow-800 p-4 rounded-md mb-8 border border-yellow-100">
            This campaign is no longer accepting new applications.
          </div>
        )}

        <div className="prose max-w-none text-gray-700 mb-10 whitespace-pre-wrap">
          {campaign.description || <span className="italic text-gray-400">No description provided.</span>}
        </div>

        <div className="grid sm:grid-cols-3 gap-6 mb-8 border-t pt-8">
          <div>
            <p className="text-sm text-gray-500 mb-1">Slots Left</p>
            <p className="text-lg font-semibold">{campaign.slotsLeft} of {campaign.slots}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Apply By</p>
            <p className="text-md font-medium">{formatDateIST(campaign.applicationDeadline)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Submit Content By</p>
            <p className="text-md font-medium">{formatDateIST(campaign.submissionDeadline)}</p>
          </div>
        </div>

        <div className="border-t pt-6 flex justify-end">
          {(!campaign.myApplicationStatus || ['withdrawn', 'rejected', 'cancelled'].includes(campaign.myApplicationStatus)) ? (
            <button 
              onClick={handleApply}
              disabled={isClosed || applyLoading}
              className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-md hover:bg-indigo-700 disabled:opacity-50"
            >
              {applyLoading ? 'Applying...' : 'Apply Now'}
            </button>
          ) : (
            <div className="text-green-700 font-semibold bg-green-50 px-4 py-2 rounded-md">
              Application Status: {campaign.myApplicationStatus}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default CreatorCampaignDetail;
