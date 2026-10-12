import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import api from '../api/axios';
import StatusBadge from '../components/StatusBadge';
import MoneyText from '../components/MoneyText';
import FeeBreakdown from '../components/FeeBreakdown';
import SubmissionForm from '../components/SubmissionForm';
import { formatDateIST } from '../utils/date';
import { CountdownChip } from '../components/ui/CountdownChip';
import { PageHeader } from '../components/ui/PageHeader';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { Modal } from '../components/ui/Modal';
import { Textarea } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRealtimeRefetch } from '../realtime/useRealtimeRefetch';

export default function CreatorCampaignDetail() {
  const { id } = useParams();
  const toast = useToast();

  const [campaign, setCampaign] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Apply modal
  const [isApplyOpen, setIsApplyOpen] = useState(false);
  const [pitch, setPitch] = useState('');
  const [applyLoading, setApplyLoading] = useState(false);

  // Withdraw confirm
  const [isWithdrawOpen, setIsWithdrawOpen] = useState(false);
  const [withdrawLoading, setWithdrawLoading] = useState(false);

  useDocumentTitle(campaign ? campaign.title : 'Campaign Details');

  useEffect(() => {
    fetchCampaign();
  }, [id]);

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

  // Real-time updates for open campaign, application status, and submission block
  useRealtimeRefetch(
    ['campaign:changed', 'application:changed', 'submission:changed'],
    fetchCampaign,
    {
      filter: (payload) => {
        if (payload?.campaignId) {
          return String(payload.campaignId) === String(id);
        }
        return true;
      }
    }
  );

  const handleApplySubmit = async () => {
    setApplyLoading(true);
    try {
      await api.post(`/campaigns/${id}/apply`, { pitch: pitch.trim() || undefined });
      toast.success('Application submitted successfully!');
      setIsApplyOpen(false);
      setPitch('');
      await fetchCampaign();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to submit application');
    } finally {
      setApplyLoading(false);
    }
  };

  const handleWithdrawConfirm = async () => {
    setWithdrawLoading(true);
    try {
      await api.post(`/applications/${campaign.myApplicationId}/withdraw`);
      toast.info('Application withdrawn');
      setIsWithdrawOpen(false);
      await fetchCampaign();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to withdraw application');
    } finally {
      setWithdrawLoading(false);
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

  const isClosed =
    campaign.status !== 'active' ||
    campaign.slotsLeft <= 0 ||
    new Date(campaign.applicationDeadline) < new Date();

  const canApply =
    !campaign.myApplicationStatus ||
    ['withdrawn', 'rejected', 'cancelled'].includes(campaign.myApplicationStatus);

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <div>
        <Link to="/creator" className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1">
          &larr; Back to Dashboard
        </Link>
      </div>

      <PageHeader
        title={campaign.title}
        subtitle={
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <span>by <strong>{campaign.brand?.name}</strong></span>
            <span className="text-gray-400">•</span>
            <StatusBadge status={campaign.status} />
            <CountdownChip isoString={campaign.applicationDeadline} prefix="Apply" />
            <CountdownChip isoString={campaign.submissionDeadline} prefix="Submit" />
            {campaign.myApplicationStatus && (
              <span className="text-xs font-semibold bg-purple-100 text-purple-800 px-2.5 py-0.5 rounded-full uppercase">
                You: {campaign.myApplicationStatus}
              </span>
            )}
          </div>
        }
      />

      {/* Payout & Fee breakdown card */}
      <Card className="border-indigo-100 bg-gradient-to-br from-indigo-50/30 to-white space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Gross Fee Offered
            </span>
            <div className="text-2xl sm:text-3xl font-extrabold text-indigo-700 tracking-tight tabular-nums">
              <MoneyText paise={campaign.perCreatorFeePaise} />
            </div>
          </div>

          <div className="text-left sm:text-right text-xs text-gray-500">
            <div>Slots remaining: <strong className="text-gray-800">{campaign.slotsLeft} of {campaign.slots}</strong></div>
            <div>Submit work by: <strong className="text-gray-800">{formatDateIST(campaign.submissionDeadline)}</strong></div>
          </div>
        </div>

        {campaign.estimatedPayout && (
          <div className="pt-2 border-t border-indigo-100">
            <FeeBreakdown
              breakdown={{
                grossFeePaise: campaign.perCreatorFeePaise,
                netPayoutPaise: campaign.estimatedPayout.netPayoutPaise,
                platformFeePaise: campaign.estimatedPayout.platformFeePaise,
                gstPaise: campaign.estimatedPayout.gstPaise,
                tdsPaise: campaign.estimatedPayout.tdsPaise
              }}
              compact={true}
              isCreator={true}
              showExpandToggle={true}
            />
          </div>
        )}
      </Card>

      {isClosed && canApply && (
        <div className="p-4 bg-amber-50 text-amber-900 border border-amber-200 rounded-xl text-sm">
          This campaign is no longer accepting new applications.
        </div>
      )}

      {/* Brief */}
      <Card className="space-y-4">
        <h2 className="text-lg font-bold text-gray-900">Campaign Brief</h2>
        <div className="prose max-w-none text-gray-700 text-sm sm:text-base whitespace-pre-wrap break-words">
          {campaign.description || <span className="italic text-gray-400">No description provided.</span>}
        </div>
      </Card>

      {/* Submission timeline section */}
      {campaign.myApplicationId && ['approved', 'completed', 'rejected'].includes(campaign.myApplicationStatus) && (
        <div id="submissions" className="scroll-mt-6">
          <SubmissionForm
            applicationId={campaign.myApplicationId}
            campaign={campaign}
            onSubmissionUpdated={fetchCampaign}
          />
        </div>
      )}

      {/* Bottom Sticky Action Bar on Mobile / Inline on Desktop */}
      <div className="pt-4 border-t border-gray-100 flex items-center justify-between sticky bottom-16 md:static bg-white/95 backdrop-blur-sm sm:bg-transparent pb-safe z-10 -mx-4 px-4 sm:mx-0 sm:px-0">
        {canApply ? (
          <div className="w-full sm:w-auto ml-auto">
            <Button
              variant="primary"
              disabled={isClosed || applyLoading}
              onClick={() => setIsApplyOpen(true)}
              fullWidth
              className="sm:w-auto"
            >
              Apply to Campaign
            </Button>
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between w-full gap-3">
            <div className="p-2.5 bg-emerald-50 text-emerald-800 rounded-xl text-xs sm:text-sm font-semibold flex items-center gap-2">
              <span>Status:</span>
              <span className="capitalize">{campaign.myApplicationStatus}</span>
            </div>

            {campaign.myApplication?.canWithdraw && (
              <Button
                variant="secondary"
                onClick={() => setIsWithdrawOpen(true)}
                className="text-xs text-red-600 hover:text-red-700"
              >
                Withdraw Application
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Apply Bottom Sheet / Modal */}
      <Modal
        isOpen={isApplyOpen}
        onClose={() => setIsApplyOpen(false)}
        title={`Apply to ${campaign.title}`}
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Share an optional pitch with the brand explaining why you're a great fit.
          </p>

          <Textarea
            id="creator-pitch-input"
            label="Your Pitch (Optional)"
            rows={4}
            value={pitch}
            onChange={(e) => setPitch(e.target.value)}
            placeholder="Tell the brand about your audience, style, or past content experience..."
          />

          <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sticky bottom-0 bg-white">
            <Button
              variant="secondary"
              onClick={() => setIsApplyOpen(false)}
              disabled={applyLoading}
              fullWidth
              className="sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleApplySubmit}
              loading={applyLoading}
              fullWidth
              className="sm:w-auto"
            >
              Submit Application
            </Button>
          </div>
        </div>
      </Modal>

      {/* Withdraw Modal */}
      <Modal
        isOpen={isWithdrawOpen}
        onClose={() => setIsWithdrawOpen(false)}
        title="Withdraw Application"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Are you sure you want to withdraw your application? Any reserved slot will be released back to other creators.
          </p>

          <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sticky bottom-0 bg-white">
            <Button
              variant="secondary"
              onClick={() => setIsWithdrawOpen(false)}
              disabled={withdrawLoading}
              fullWidth
              className="sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleWithdrawConfirm}
              loading={withdrawLoading}
              fullWidth
              className="sm:w-auto"
            >
              Confirm Withdrawal
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
