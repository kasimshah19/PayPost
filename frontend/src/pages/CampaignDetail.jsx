import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import StatusBadge from '../components/StatusBadge';
import MoneyText from '../components/MoneyText';
import ConfirmModal from '../components/ConfirmModal';
import ApplicationList from '../components/ApplicationList';
import SubmissionList from '../components/SubmissionList';
import { formatDateIST } from '../utils/date';
import { CountdownChip } from '../components/ui/CountdownChip';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Tabs } from '../components/ui/Tabs';
import { Skeleton } from '../components/ui/Skeleton';
import { useToast } from '../components/ui/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function CampaignDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const toast = useToast();

  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);

  const activeTab = searchParams.get('tab') || 'overview';
  const focusId = searchParams.get('focus');

  useDocumentTitle(campaign ? campaign.title : 'Campaign Details');

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
    } catch {
      setError('Failed to load campaign details');
    } finally {
      setLoading(false);
    }
  };

  // Deep link auto-scroll and highlight (?tab=submissions&focus=<id> and ?tab=applicants&focus=<id>)
  useEffect(() => {
    if (!focusId || loading) return;

    let attempts = 0;
    const maxAttempts = 25; // Poll up to 2.5s for async-loaded list cards
    const interval = setInterval(() => {
      attempts += 1;
      const el =
        document.getElementById(`item-${focusId}`) ||
        document.getElementById(`submission-${focusId}`) ||
        document.getElementById(`application-${focusId}`);

      if (el) {
        clearInterval(interval);
        const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({
          behavior: prefersReduced ? 'auto' : 'smooth',
          block: 'center'
        });
        el.classList.add('ring-2', 'ring-indigo-500', 'bg-indigo-50/50', 'transition-all', 'duration-500');
        setTimeout(() => {
          el.classList.remove('ring-2', 'ring-indigo-500', 'bg-indigo-50/50');
        }, 2000);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        // If focus item not found (already handled or invalid), quietly ignore without error
      }
    }, 100);

    return () => clearInterval(interval);
  }, [focusId, activeTab, loading]);

  const handleCancel = async (reason) => {
    setCancelError('');
    try {
      await api.post(`/campaigns/${id}/cancel`, { cancelReason: reason });
      setShowCancelModal(false);
      toast.info('Campaign has been cancelled');
      fetchCampaign();
    } catch (err) {
      setCancelError(err.response?.data?.message || 'Failed to cancel campaign');
    }
  };

  if (loading) return <Skeleton variant="card" count={2} />;
  if (error) {
    return (
      <div className="p-6 bg-red-50 text-red-700 rounded-xl border border-red-200 text-center">
        {error}
      </div>
    );
  }
  if (!campaign) return null;

  const tabsConfig = [
    { id: 'overview', label: 'Overview' },
    { id: 'applicants', label: 'Applicants', count: campaign.applicantCounts?.applied || 0 },
    {
      id: 'submissions',
      label: 'Submissions',
      count: campaign.pendingReviewCount ?? ((campaign.submissionCounts?.submitted || 0) + (campaign.submissionCounts?.revision_requested || 0))
    }
  ];

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <div>
        <Link to="/brand" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
          &larr; Back to Dashboard
        </Link>
      </div>

      {/* Header */}
      <PageHeader
        title={campaign.title}
        subtitle={
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <StatusBadge status={campaign.status} />
            <CountdownChip isoString={campaign.applicationDeadline} prefix="Apply" />
            <CountdownChip isoString={campaign.submissionDeadline} prefix="Submit" />
          </div>
        }
        actions={
          campaign.editRules?.canEdit && (
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <Link to={`/brand/campaigns/${id}/edit`} className="flex-1 sm:flex-none">
                <Button variant="secondary" fullWidth className="sm:w-auto text-sm">
                  Edit
                </Button>
              </Link>
              <Button
                variant="danger"
                onClick={() => setShowCancelModal(true)}
                fullWidth
                className="flex-1 sm:w-auto text-sm"
              >
                Cancel Campaign
              </Button>
            </div>
          )
        }
      />

      {campaign.status === 'cancelled' && (
        <div className="bg-red-50 text-red-800 p-4 rounded-xl border border-red-200 text-sm space-y-1">
          <p className="font-bold">Cancelled on {formatDateIST(campaign.cancelledAt)}</p>
          <p>Reason: {campaign.cancelReason}</p>
        </div>
      )}

      {/* Always Visible Money Breakdown Header (Refreshes dynamically) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="p-3 sm:p-4">
          <span className="text-xs text-gray-500 block">Total Budget</span>
          <strong className="text-base sm:text-lg font-bold text-gray-900 tabular-nums">
            <MoneyText paise={campaign.budgetPaise} />
          </strong>
        </Card>
        <Card className="p-3 sm:p-4">
          <span className="text-xs text-gray-500 block">Reserved</span>
          <strong className="text-base sm:text-lg font-bold text-amber-600 tabular-nums">
            <MoneyText paise={campaign.reservedPaise} />
          </strong>
        </Card>
        <Card className="p-3 sm:p-4">
          <span className="text-xs text-gray-500 block">Paid Out</span>
          <strong className="text-base sm:text-lg font-bold text-gray-700 tabular-nums">
            <MoneyText paise={campaign.paidOutPaise} />
          </strong>
        </Card>
        <Card className="p-3 sm:p-4">
          <span className="text-xs text-gray-500 block">Available</span>
          <strong className="text-base sm:text-lg font-bold text-emerald-600 tabular-nums">
            <MoneyText paise={campaign.availablePaise} />
          </strong>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs tabs={tabsConfig} defaultTab="overview" />

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          <Card className="space-y-4">
            <h3 className="text-lg font-bold text-gray-900">Campaign Brief & Guidelines</h3>
            <div className="prose max-w-none text-gray-700 text-sm sm:text-base whitespace-pre-wrap break-words">
              {campaign.description || <span className="italic text-gray-400">No description provided.</span>}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4 border-t border-gray-100 text-xs sm:text-sm">
              <div>
                <span className="text-gray-500 block">Fee per Creator</span>
                <strong className="text-gray-900 tabular-nums">
                  <MoneyText paise={campaign.perCreatorFeePaise} />
                </strong>
              </div>
              <div>
                <span className="text-gray-500 block">Slots Approved</span>
                <strong className="text-gray-900">
                  {campaign.approvedCount} / {campaign.slots} filled
                </strong>
              </div>
              <div>
                <span className="text-gray-500 block">Application Deadline</span>
                <strong className="text-gray-900">{formatDateIST(campaign.applicationDeadline)}</strong>
              </div>
              <div>
                <span className="text-gray-500 block">Submission Deadline</span>
                <strong className="text-gray-900">{formatDateIST(campaign.submissionDeadline)}</strong>
              </div>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'applicants' && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Creator Applications</h2>
            <span className="text-xs font-semibold text-gray-500">
              {campaign.applicantCounts?.applied || 0} pending
            </span>
          </div>
          <ApplicationList
            campaignId={id}
            onStatusChange={handleDataRefresh}
            refreshKey={refreshKey}
          />
        </Card>
      )}

      {activeTab === 'submissions' && (
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Content Submissions</h2>
            <span className="text-xs font-semibold text-amber-600">
              {campaign.pendingReviewCount ?? ((campaign.submissionCounts?.submitted || 0) + (campaign.submissionCounts?.revision_requested || 0))} pending review
            </span>
          </div>
          <SubmissionList
            campaignId={id}
            onStatusChange={handleDataRefresh}
          />
        </Card>
      )}

      {/* Cancel Confirmation Modal */}
      <ConfirmModal
        isOpen={showCancelModal}
        title="Cancel Campaign"
        message="Are you sure you want to cancel this campaign? Approved creators will be notified and reserved money will be released."
        confirmText="Cancel Campaign"
        requiresReason={true}
        error={cancelError}
        onConfirm={handleCancel}
        onCancel={() => {
          setShowCancelModal(false);
          setCancelError('');
        }}
      />
    </div>
  );
}
