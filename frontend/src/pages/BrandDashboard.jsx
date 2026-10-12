import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../components/ui/Toast';
import { PageHeader } from '../components/ui/PageHeader';
import { StatCard } from '../components/ui/StatCard';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Skeleton } from '../components/ui/Skeleton';
import { Menu } from '../components/ui/Menu';
import { Icon } from '../components/ui/Icon';
import StatusBadge from '../components/StatusBadge';
import MoneyText from '../components/MoneyText';
import { CountdownChip } from '../components/ui/CountdownChip';
import ConfirmModal from '../components/ConfirmModal';
import { Modal } from '../components/ui/Modal';
import { Textarea } from '../components/ui/Input';
import { validateInstagramUrl } from '../utils/instagram';
import { formatDateIST, formatRelativeTimeIST } from '../utils/date';
import { REVISION_NOTE_TEMPLATES, REJECT_NOTE_TEMPLATES } from '../constants/noteTemplates';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

export default function BrandDashboard() {
  useDocumentTitle('Brand Dashboard');
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [summary, setSummary] = useState(null);
  const [attention, setAttention] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');

  // Attention Action Center tab: 'applicants' | 'submissions'
  const [attentionTab, setAttentionTab] = useState('applicants');

  // Modals for Actions
  // 1. Approve Applicant Modal
  const [approveAppTarget, setApproveAppTarget] = useState(null);
  const [approveAppLoading, setApproveAppLoading] = useState(false);
  const [approveAppError, setApproveAppError] = useState('');

  // 2. Reject Applicant Modal
  const [rejectAppTarget, setRejectAppTarget] = useState(null);
  const [rejectAppReason, setRejectAppReason] = useState('');
  const [rejectAppLoading, setRejectAppLoading] = useState(false);
  const [rejectAppError, setRejectAppError] = useState('');

  // 3. Submission Review Modals (Approve, Revision, Reject)
  const [approveSubTarget, setApproveSubTarget] = useState(null);
  const [approveSubNote, setApproveSubNote] = useState('');
  const [approveSubLoading, setApproveSubLoading] = useState(false);
  const [approveSubError, setApproveSubError] = useState('');

  const [revisionSubTarget, setRevisionSubTarget] = useState(null);
  const [revisionSubNote, setRevisionSubNote] = useState('');
  const [revisionSubLoading, setRevisionSubLoading] = useState(false);
  const [revisionSubError, setRevisionSubError] = useState('');

  const [rejectSubTarget, setRejectSubTarget] = useState(null);
  const [rejectSubNote, setRejectSubNote] = useState('');
  const [rejectSubLoading, setRejectSubLoading] = useState(false);
  const [rejectSubError, setRejectSubError] = useState('');

  // 4. Cancel Campaign Modal
  const [cancelCampTarget, setCancelCampTarget] = useState(null);
  const [cancelCampReason, setCancelCampReason] = useState('');
  const [cancelCampLoading, setCancelCampLoading] = useState(false);
  const [cancelCampError, setCancelCampError] = useState('');

  useEffect(() => {
    fetchDashboardData();
  }, [statusFilter]);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const campUrl = statusFilter === 'all' ? '/campaigns/mine' : `/campaigns/mine?status=${statusFilter}`;
      const [sumRes, attRes, campRes] = await Promise.all([
        api.get('/campaigns/mine/summary'),
        api.get('/campaigns/mine/attention'),
        api.get(campUrl)
      ]);
      setSummary(sumRes.data);
      setAttention(attRes.data);
      setCampaigns(campRes.data);
    } catch {
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const refreshAll = async () => {
    try {
      const campUrl = statusFilter === 'all' ? '/campaigns/mine' : `/campaigns/mine?status=${statusFilter}`;
      const [sumRes, attRes, campRes] = await Promise.all([
        api.get('/campaigns/mine/summary'),
        api.get('/campaigns/mine/attention'),
        api.get(campUrl)
      ]);
      setSummary(sumRes.data);
      setAttention(attRes.data);
      setCampaigns(campRes.data);
    } catch {
      // Background refresh failure handled gracefully
    }
  };

  // ================= ACTION HANDLERS =================
  // 1. Approve Applicant
  const handleApproveApplicant = async () => {
    if (!approveAppTarget) return;
    setApproveAppLoading(true);
    setApproveAppError('');
    try {
      await api.post(`/applications/${approveAppTarget.applicationId}/approve`);
      toast.success(`Approved ${approveAppTarget.creator.name} for ${approveAppTarget.campaignTitle}`);
      setApproveAppTarget(null);
      await refreshAll();
    } catch (err) {
      setApproveAppError(err.response?.data?.message || 'Failed to approve application');
    } finally {
      setApproveAppLoading(false);
    }
  };

  // 2. Reject Applicant
  const handleRejectApplicant = async () => {
    if (!rejectAppTarget) return;
    setRejectAppLoading(true);
    setRejectAppError('');
    try {
      await api.post(`/applications/${rejectAppTarget.applicationId}/reject`, {
        note: rejectAppReason.trim() || undefined
      });
      toast.info(`Rejected application from ${rejectAppTarget.creator.name}`);
      setRejectAppTarget(null);
      setRejectAppReason('');
      await refreshAll();
    } catch (err) {
      setRejectAppError(err.response?.data?.message || 'Failed to reject application');
    } finally {
      setRejectAppLoading(false);
    }
  };

  // 3. Approve Submission
  const handleApproveSubmission = async () => {
    if (!approveSubTarget) return;
    setApproveSubLoading(true);
    setApproveSubError('');
    try {
      await api.post(`/submissions/${approveSubTarget.submissionId}/approve`, {
        note: approveSubNote.trim() || undefined
      });
      toast.success(`Approved submission for ${approveSubTarget.campaignTitle}`);
      setApproveSubTarget(null);
      setApproveSubNote('');
      await refreshAll();
    } catch (err) {
      setApproveSubError(err.response?.data?.message || 'Failed to approve submission');
    } finally {
      setApproveSubLoading(false);
    }
  };

  // 4. Request Revision
  const handleRequestRevision = async () => {
    if (!revisionSubTarget) return;
    if (revisionSubNote.trim().length < 5) {
      setRevisionSubError('Revision note must be at least 5 characters');
      return;
    }
    setRevisionSubLoading(true);
    setRevisionSubError('');
    try {
      await api.post(`/submissions/${revisionSubTarget.submissionId}/request-revision`, {
        note: revisionSubNote.trim()
      });
      toast.info(`Revision requested for ${revisionSubTarget.creator.name}`);
      setRevisionSubTarget(null);
      setRevisionSubNote('');
      await refreshAll();
    } catch (err) {
      setRevisionSubError(err.response?.data?.message || 'Failed to request revision');
    } finally {
      setRevisionSubLoading(false);
    }
  };

  // 5. Reject Submission
  const handleRejectSubmission = async () => {
    if (!rejectSubTarget) return;
    if (rejectSubNote.trim().length < 5) {
      setRejectSubError('Rejection note must be at least 5 characters');
      return;
    }
    setRejectSubLoading(true);
    setRejectSubError('');
    try {
      await api.post(`/submissions/${rejectSubTarget.submissionId}/reject`, {
        note: rejectSubNote.trim()
      });
      toast.error(`Rejected submission for ${rejectSubTarget.creator.name}`);
      setRejectSubTarget(null);
      setRejectSubNote('');
      await refreshAll();
    } catch (err) {
      setRejectSubError(err.response?.data?.message || 'Failed to reject submission');
    } finally {
      setRejectSubLoading(false);
    }
  };

  // 6. Cancel Campaign
  const handleCancelCampaign = async () => {
    if (!cancelCampTarget) return;
    setCancelCampLoading(true);
    setCancelCampError('');
    try {
      await api.post(`/campaigns/${cancelCampTarget._id}/cancel`, {
        cancelReason: cancelCampReason.trim()
      });
      toast.info(`Campaign "${cancelCampTarget.title}" was cancelled`);
      setCancelCampTarget(null);
      setCancelCampReason('');
      await refreshAll();
    } catch (err) {
      setCancelCampError(err.response?.data?.message || 'Failed to cancel campaign');
    } finally {
      setCancelCampLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 1) PageHeader */}
      <PageHeader
        title="Dashboard"
        subtitle={`Welcome back, ${user?.name}`}
        actions={
          <Link to="/brand/campaigns/new" className="w-full sm:w-auto">
            <Button variant="primary" fullWidth className="sm:w-auto">
              <Icon name="plus" className="w-4 h-4 mr-1.5" />
              Create campaign
            </Button>
          </Link>
        }
      />

      {/* 2) Summary StatCards */}
      {loading ? (
        <Skeleton variant="stat" count={4} />
      ) : summary ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <StatCard
            label="Active Campaigns"
            value={`${summary.activeCampaigns} / ${summary.totalCampaigns}`}
            subtext="Running campaigns"
            icon={<Icon name="home" className="w-4 h-4" />}
          />
          <StatCard
            label="Total Budget"
            value={<MoneyText paise={summary.totalBudgetPaise} />}
            subtext="Allocated across all"
            icon={<Icon name="wallet" className="w-4 h-4" />}
          />
          <StatCard
            label="Reserved"
            value={<MoneyText paise={summary.totalReservedPaise} />}
            subtext="Locked for creators"
            icon={<Icon name="clock" className="w-4 h-4 text-amber-500" />}
          />
          <StatCard
            label="Available"
            value={<MoneyText paise={summary.totalAvailablePaise} />}
            subtext="Remaining to spend"
            icon={<Icon name="check" className="w-4 h-4 text-emerald-500" />}
          />
        </div>
      ) : null}

      {/* 3) ACTION CENTER: "Needs your attention" */}
      <Card className="border-indigo-100 bg-gradient-to-b from-white to-indigo-50/20">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-gray-100 gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-600 animate-pulse" />
            <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
              Needs your attention
            </h2>
            {attention && attention.counts.total > 0 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                {attention.counts.total}
              </span>
            )}
          </div>

          {/* Sub-tabs: Applicants (n) and Submissions (n) */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setAttentionTab('applicants')}
              className={`min-h-11 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                attentionTab === 'applicants'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              Applicants ({attention?.counts.pendingApplicants || 0})
            </button>
            <button
              type="button"
              onClick={() => setAttentionTab('submissions')}
              className={`min-h-11 px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors ${
                attentionTab === 'submissions'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
              }`}
            >
              Submissions ({attention?.counts.pendingSubmissions || 0})
            </button>
          </div>
        </div>

        <div className="pt-4">
          {loading ? (
            <Skeleton variant="list" count={3} />
          ) : !attention || attention.counts.total === 0 ? (
            <div className="text-center py-8 text-gray-500 space-y-1">
              <p className="text-2xl">🎉</p>
              <p className="font-semibold text-gray-800">You are all caught up!</p>
              <p className="text-xs">No pending applicants or submissions require review.</p>
            </div>
          ) : attentionTab === 'applicants' ? (
            attention.applicants.length === 0 ? (
              <div className="text-center py-6 text-gray-500 text-sm">
                No pending applicants right now.
              </div>
            ) : (
              <div className="space-y-3">
                {attention.applicants.map((app) => (
                  <div
                    key={app.applicationId}
                    className="p-4 rounded-xl border border-gray-200 bg-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-gray-900 text-base">
                          {app.creator.name}
                        </span>
                        <span className="text-gray-400 text-xs">•</span>
                        <Link
                          to={`/brand/campaigns/${app.campaignId}?tab=applicants`}
                          className="text-xs sm:text-sm font-semibold text-indigo-600 hover:underline truncate max-w-xs"
                          title={app.campaignTitle}
                        >
                          {app.campaignTitle}
                        </Link>
                        <span className="text-gray-400 text-xs">•</span>
                        <span className="text-xs text-gray-500" title={formatDateIST(app.appliedAt)}>
                          {formatRelativeTimeIST(app.appliedAt)}
                        </span>
                      </div>

                      {app.pitch && (
                        <p className="text-xs sm:text-sm text-gray-600 line-clamp-2 break-words italic">
                          "{app.pitch}"
                        </p>
                      )}

                      <div className="pt-1 text-xs text-gray-500 flex items-center gap-3">
                        <span>
                          Per creator fee: <strong className="text-gray-800"><MoneyText paise={app.perCreatorFeePaise} /></strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full md:w-auto shrink-0">
                      <div>
                        <Button
                          variant="primary"
                          disabled={!app.canApprove}
                          onClick={() => setApproveAppTarget(app)}
                          className="w-full sm:w-auto text-sm px-3"
                        >
                          Approve
                        </Button>
                        {!app.canApprove && app.cannotApproveReason && (
                          <p className="mt-1 text-xs text-red-600 font-medium max-w-xs">
                            {app.cannotApproveReason}
                          </p>
                        )}
                      </div>

                      <Button
                        variant="secondary"
                        onClick={() => setRejectAppTarget(app)}
                        className="w-full sm:w-auto text-sm px-3 text-red-600 hover:text-red-700"
                      >
                        Reject
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : (
            attention.submissions.length === 0 ? (
              <div className="text-center py-6 text-gray-500 text-sm">
                No pending submissions right now.
              </div>
            ) : (
              <div className="space-y-3">
                {attention.submissions.map((sub) => {
                  const isInstagram = validateInstagramUrl(sub.postUrl);
                  return (
                    <div
                      key={sub.submissionId}
                      className="p-4 rounded-xl border border-gray-200 bg-white flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-gray-300 transition-colors"
                    >
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-gray-900 text-base">
                            {sub.creator.name}
                          </span>
                          <span className="text-gray-400 text-xs">•</span>
                          <Link
                            to={`/brand/campaigns/${sub.campaignId}?tab=submissions&focus=${sub.submissionId}`}
                            className="text-xs sm:text-sm font-semibold text-indigo-600 hover:underline truncate max-w-xs"
                            title={sub.campaignTitle}
                          >
                            {sub.campaignTitle}
                          </Link>
                          <span className="text-gray-400 text-xs">•</span>
                          <span className="text-xs text-gray-500" title={formatDateIST(sub.submittedAt)}>
                            {formatRelativeTimeIST(sub.submittedAt)}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-gray-600 flex-wrap">
                          {isInstagram ? (
                            <a
                              href={sub.postUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 font-semibold text-indigo-600 hover:text-indigo-800 underline break-all"
                            >
                              <Icon name="external-link" className="w-3.5 h-3.5" />
                              <span>Open post</span>
                            </a>
                          ) : (
                            <span className="text-gray-400 line-through">Invalid post URL</span>
                          )}

                          <span>
                            Revisions left: <strong className="text-gray-800">{sub.revisionsLeft}</strong> / 2
                          </span>

                          <span>
                            Payout fee: <strong className="text-gray-800"><MoneyText paise={sub.feePaise} /></strong>
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 w-full md:w-auto shrink-0">
                        <Button
                          variant="primary"
                          onClick={() => setApproveSubTarget(sub)}
                          className="flex-1 sm:flex-none text-xs px-3 min-h-11"
                        >
                          Approve
                        </Button>
                        <Button
                          variant="secondary"
                          disabled={sub.revisionsLeft <= 0}
                          onClick={() => setRevisionSubTarget(sub)}
                          className="flex-1 sm:flex-none text-xs px-3 min-h-11"
                        >
                          Request revision
                        </Button>
                        <Button
                          variant="danger"
                          onClick={() => setRejectSubTarget(sub)}
                          className="flex-1 sm:flex-none text-xs px-3 min-h-11"
                        >
                          Reject
                        </Button>
                        <Link
                          to={`/brand/campaigns/${sub.campaignId}?tab=submissions&focus=${sub.submissionId}`}
                          className="text-xs text-gray-500 hover:text-indigo-600 px-2 py-1"
                        >
                          Review in campaign &rarr;
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          )}
        </div>
      </Card>

      {/* 4) "My campaigns" list */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-xl font-bold text-gray-900 tracking-tight">
            My Campaigns
          </h2>

          {/* Status filter chips */}
          <div className="flex gap-2 overflow-x-auto no-scrollbar py-1">
            {['all', 'active', 'cancelled'].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`min-h-11 px-4 py-1.5 rounded-full text-xs sm:text-sm font-semibold capitalize whitespace-nowrap transition-colors ${
                  statusFilter === st
                    ? 'bg-indigo-600 text-white'
                    : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-100'
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <Skeleton variant="card" count={3} />
        ) : campaigns.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-500">
            No campaigns found in this filter.
          </div>
        ) : (
          <div className="space-y-4">
            {campaigns.map((camp) => (
              <Card key={camp._id} className="hover:border-gray-300 transition-colors space-y-4">
                <div className="flex justify-between items-start gap-3">
                  <div className="space-y-1">
                    <h3 className="text-lg sm:text-xl font-bold text-gray-900 break-words">
                      {camp.title}
                    </h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={camp.status} />
                      <CountdownChip isoString={camp.applicationDeadline} prefix="Apply" />
                      <CountdownChip isoString={camp.submissionDeadline} prefix="Submit" />
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Link to={`/brand/campaigns/${camp._id}`}>
                      <Button variant="primary" className="text-sm px-4">
                        View
                      </Button>
                    </Link>

                    {/* Kebab ⋯ Menu */}
                    <Menu
                      items={[
                        {
                          label: 'Edit campaign',
                          icon: 'edit',
                          disabled: camp.status === 'cancelled',
                          onClick: () => navigate(`/brand/campaigns/${camp._id}/edit`)
                        },
                        {
                          label: 'Duplicate campaign',
                          icon: 'copy',
                          onClick: () => navigate(`/brand/campaigns/new?duplicate=${camp._id}`)
                        },
                        {
                          label: 'Cancel campaign',
                          icon: 'close',
                          danger: true,
                          disabled: camp.status === 'cancelled',
                          onClick: () => setCancelCampTarget(camp)
                        }
                      ]}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t border-gray-100 text-xs sm:text-sm">
                  <div>
                    <span className="text-gray-500 block">Total Budget</span>
                    <strong className="text-gray-900 tabular-nums">
                      <MoneyText paise={camp.budgetPaise} />
                    </strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Available</span>
                    <strong className="text-emerald-600 tabular-nums">
                      <MoneyText paise={camp.availablePaise} />
                    </strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Slots Filled</span>
                    <strong className="text-gray-900">
                      {camp.approvedCount} / {camp.slots}
                    </strong>
                  </div>
                  <div>
                    <span className="text-gray-500 block">Pending Review</span>
                    <strong className="text-amber-600">
                      {camp.pendingReviewCount || camp.submissionCounts?.submitted || 0} submissions
                    </strong>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* ================= MODALS ================= */}
      {/* 1. Confirm Modal for Approve Applicant */}
      <ConfirmModal
        isOpen={Boolean(approveAppTarget)}
        title="Approve Creator Application"
        message={
          approveAppTarget ? (
            <div className="space-y-2">
              <p>
                Are you sure you want to approve <strong>{approveAppTarget.creator.name}</strong> for{' '}
                <strong>{approveAppTarget.campaignTitle}</strong>?
              </p>
              <div className="p-3 bg-gray-50 rounded-lg text-xs space-y-1">
                <p>
                  Reserved fee for this slot:{' '}
                  <strong className="text-gray-900"><MoneyText paise={approveAppTarget.perCreatorFeePaise} /></strong>
                </p>
                <p className="text-gray-500">
                  This fee will be locked from your campaign budget until the creator completes work.
                </p>
              </div>
            </div>
          ) : null
        }
        confirmText="Approve Creator"
        destructive={false}
        loading={approveAppLoading}
        error={approveAppError}
        onConfirm={handleApproveApplicant}
        onCancel={() => {
          setApproveAppTarget(null);
          setApproveAppError('');
        }}
      />

      {/* 2. Modal for Reject Applicant */}
      <ConfirmModal
        isOpen={Boolean(rejectAppTarget)}
        title="Reject Application"
        message={
          rejectAppTarget ? (
            <p>
              Are you sure you want to reject the application from <strong>{rejectAppTarget.creator.name}</strong>?
            </p>
          ) : null
        }
        requiresReason={false}
        confirmText="Reject Application"
        destructive={true}
        loading={rejectAppLoading}
        error={rejectAppError}
        onConfirm={handleRejectApplicant}
        onCancel={() => {
          setRejectAppTarget(null);
          setRejectAppReason('');
          setRejectAppError('');
        }}
      />

      {/* 3. Modal for Approve Submission */}
      <ConfirmModal
        isOpen={Boolean(approveSubTarget)}
        title="Approve Submission & Release Payout"
        message={
          approveSubTarget ? (
            <div className="space-y-2">
              <p>
                Approve work submitted by <strong>{approveSubTarget.creator.name}</strong>?
              </p>
              <p className="text-xs text-gray-600">
                This will finalize the review, release the locked payout (<MoneyText paise={approveSubTarget.feePaise} /> gross) into their wallet, and complete the milestone.
              </p>
            </div>
          ) : null
        }
        confirmText="Approve & Pay"
        destructive={false}
        loading={approveSubLoading}
        error={approveSubError}
        onConfirm={handleApproveSubmission}
        onCancel={() => {
          setApproveSubTarget(null);
          setApproveSubError('');
        }}
      />

      {/* 4. Modal for Request Revision (with quick note chips) */}
      <Modal
        isOpen={Boolean(revisionSubTarget)}
        onClose={() => {
          setRevisionSubTarget(null);
          setRevisionSubNote('');
          setRevisionSubError('');
        }}
        title="Request Post Revision"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            Explain what changes <strong>{revisionSubTarget?.creator.name}</strong> needs to make to their content.
          </p>

          {/* Quick note suggestion chips */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-500">Quick suggestions (tap to append):</p>
            <div className="flex flex-wrap gap-1.5">
              {REVISION_NOTE_TEMPLATES.map((tpl, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRevisionSubNote(prev => prev && prev.includes(tpl) ? prev : (prev ? `${prev} ${tpl}` : tpl))}
                  className="min-h-[44px] px-3 py-2 text-xs rounded-full bg-gray-100 hover:bg-indigo-50 hover:text-indigo-700 text-gray-700 border border-gray-200 text-left transition-colors flex items-center"
                >
                  + {tpl}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            id="revision-note-input"
            label="Revision feedback (min 5 characters)"
            required
            rows={3}
            value={revisionSubNote}
            onChange={(e) => setRevisionSubNote(e.target.value)}
            placeholder="Describe required adjustments..."
            error={revisionSubError}
          />

          <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sticky bottom-0 bg-white">
            <Button
              variant="secondary"
              onClick={() => {
                setRevisionSubTarget(null);
                setRevisionSubNote('');
                setRevisionSubError('');
              }}
              disabled={revisionSubLoading}
              fullWidth
              className="sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleRequestRevision}
              loading={revisionSubLoading}
              disabled={revisionSubNote.trim().length < 5}
              fullWidth
              className="sm:w-auto"
            >
              Send Revision Request
            </Button>
          </div>
        </div>
      </Modal>

      {/* 5. Modal for Reject Submission (with quick note chips) */}
      <Modal
        isOpen={Boolean(rejectSubTarget)}
        onClose={() => {
          setRejectSubTarget(null);
          setRejectSubNote('');
          setRejectSubError('');
        }}
        title="Reject Submission"
      >
        <div className="space-y-4">
          <p className="text-sm text-red-600">
            Rejection is final. The creator's reserved fee will be returned to your campaign's available budget.
          </p>

          {/* Quick note suggestion chips */}
          <div className="space-y-1.5">
            <p className="text-xs font-semibold text-gray-500">Quick suggestions (tap to append):</p>
            <div className="flex flex-wrap gap-1.5">
              {REJECT_NOTE_TEMPLATES.map((tpl, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setRejectSubNote(prev => prev && prev.includes(tpl) ? prev : (prev ? `${prev} ${tpl}` : tpl))}
                  className="min-h-[44px] px-3 py-2 text-xs rounded-full bg-gray-100 hover:bg-red-50 hover:text-red-700 text-gray-700 border border-gray-200 text-left transition-colors flex items-center"
                >
                  + {tpl}
                </button>
              ))}
            </div>
          </div>

          <Textarea
            id="reject-note-input"
            label="Rejection reason (min 5 characters)"
            required
            rows={3}
            value={rejectSubNote}
            onChange={(e) => setRejectSubNote(e.target.value)}
            placeholder="Explain why this submission is being rejected..."
            error={rejectSubError}
          />

          <div className="pt-2 flex flex-col-reverse sm:flex-row sm:justify-end gap-3 sticky bottom-0 bg-white">
            <Button
              variant="secondary"
              onClick={() => {
                setRejectSubTarget(null);
                setRejectSubNote('');
                setRejectSubError('');
              }}
              disabled={rejectSubLoading}
              fullWidth
              className="sm:w-auto"
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleRejectSubmission}
              loading={rejectSubLoading}
              disabled={rejectSubNote.trim().length < 5}
              fullWidth
              className="sm:w-auto"
            >
              Confirm Rejection
            </Button>
          </div>
        </div>
      </Modal>

      {/* 6. Cancel Campaign Modal */}
      <ConfirmModal
        isOpen={Boolean(cancelCampTarget)}
        title="Cancel Campaign"
        message={
          cancelCampTarget ? (
            <p>
              Are you sure you want to cancel "<strong>{cancelCampTarget.title}</strong>"? All approved creators will be notified and reserved funds will be returned.
            </p>
          ) : null
        }
        requiresReason={true}
        confirmText="Cancel Campaign"
        destructive={true}
        loading={cancelCampLoading}
        error={cancelCampError}
        onConfirm={handleCancelCampaign}
        onCancel={() => {
          setCancelCampTarget(null);
          setCancelCampReason('');
          setCancelCampError('');
        }}
      />
    </div>
  );
}
