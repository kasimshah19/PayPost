import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../api/axios';
import StatusBadge from '../components/StatusBadge';
import Spinner from '../components/Spinner';
import MoneyText from '../components/MoneyText';
import ConfirmModal from '../components/ConfirmModal';
import ApplicationList from '../components/ApplicationList';
import { formatDateIST } from '../utils/date';
import SubmissionList from '../components/SubmissionList';

function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetchCampaign();
  }, [id, refreshKey]);

  const handleDataRefresh = () => {
    setRefreshKey(k => k + 1);
  };

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

  const handleCancel = async (reason) => {
    setCancelError('');
    try {
      await api.post(`/campaigns/${id}/cancel`, { cancelReason: reason });
      setShowCancelModal(false);
      fetchCampaign(); // Refresh data
    } catch (err) {
      setCancelError(err.response?.data?.message || 'Failed to cancel campaign');
    }
  };

  if (loading) return <Spinner />;
  if (error) return <div className="p-8 text-red-500 text-center">{error}</div>;
  if (!campaign) return null;

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <Link to="/brand" className="text-indigo-600 hover:underline">&larr; Back to Dashboard</Link>
      </div>

      <div className="bg-white rounded-lg shadow-sm border p-6 mb-8">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{campaign.title}</h1>
            <StatusBadge status={campaign.status} />
          </div>
          
          {campaign.editRules?.canEdit && (
            <div className="flex gap-3">
              <Link 
                to={`/brand/campaigns/${id}/edit`}
                className="px-4 py-2 border border-gray-300 rounded text-gray-700 hover:bg-gray-50"
              >
                Edit
              </Link>
              <button 
                onClick={() => setShowCancelModal(true)}
                className="px-4 py-2 bg-red-50 text-red-700 rounded hover:bg-red-100"
              >
                Cancel Campaign
              </button>
            </div>
          )}
        </div>

        {campaign.status === 'cancelled' && (
          <div className="bg-red-50 text-red-800 p-4 rounded-md mb-6 border border-red-100">
            <strong>Cancelled:</strong> {campaign.cancelReason} <br />
            <span className="text-sm opacity-75">on {formatDateIST(campaign.cancelledAt)}</span>
          </div>
        )}

        <div className="prose max-w-none text-gray-700 mb-8 whitespace-pre-wrap">
          {campaign.description || <span className="italic text-gray-400">No description provided.</span>}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 bg-gray-50 p-6 rounded-lg border">
          <div>
            <p className="text-sm text-gray-500 mb-1">Total Budget</p>
            <p className="text-lg font-bold"><MoneyText paise={campaign.budgetPaise} /></p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Reserved</p>
            <p className="text-lg font-bold text-orange-600"><MoneyText paise={campaign.reservedPaise} /></p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Paid Out</p>
            <p className="text-lg font-bold text-gray-700"><MoneyText paise={campaign.paidOutPaise} /></p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Available</p>
            <p className="text-lg font-bold text-green-600"><MoneyText paise={campaign.availablePaise} /></p>
          </div>

          <div>
            <p className="text-sm text-gray-500 mb-1">Fee per Creator</p>
            <p className="text-md font-semibold"><MoneyText paise={campaign.perCreatorFeePaise} /></p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Slots</p>
            <p className="text-md font-semibold">{campaign.approvedCount} / {campaign.slots} filled</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Application Deadline</p>
            <p className="text-sm font-medium">{formatDateIST(campaign.applicationDeadline)}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 mb-1">Submission Deadline</p>
            <p className="text-sm font-medium">{formatDateIST(campaign.submissionDeadline)}</p>
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-xl font-bold mb-4">Applicants</h2>
          <p className="text-gray-600 mb-4">Total Applied: {campaign.applicantCounts?.applied || 0}</p>
          <ApplicationList 
            campaignId={id} 
            onStatusChange={handleDataRefresh} 
            refreshKey={refreshKey} 
          />
        </div>
        
        <div className="bg-white rounded-lg shadow-sm border p-6">
          <h2 className="text-xl font-bold mb-4">Submissions</h2>
          <p className="text-gray-600 mb-4">
            Pending Review: {campaign.pendingReviewCount ?? ((campaign.submissionCounts?.submitted || 0) + (campaign.submissionCounts?.revision_requested || 0))}
          </p>
          <SubmissionList 
            campaignId={id} 
            onStatusChange={handleDataRefresh} 
          />
        </div>
      </div>

      <ConfirmModal 
        isOpen={showCancelModal}
        title="Cancel Campaign"
        message="Are you sure you want to cancel this campaign? Approved creators will be notified and reserved money will be released."
        confirmText="Cancel Campaign"
        requiresReason={true}
        error={cancelError}
        onConfirm={handleCancel}
        onCancel={() => { setShowCancelModal(false); setCancelError(''); }}
      />
    </div>
  );
}

export default CampaignDetail;
