import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import StatusBadge from './StatusBadge';
import MoneyText from './MoneyText';
import Spinner from './Spinner';
import ConfirmModal from './ConfirmModal';
import FeeBreakdown from './FeeBreakdown';
import { validateInstagramUrl } from '../utils/instagram';
import { formatDateIST, formatCountdown } from '../utils/date';

/**
 * SubmissionList component for Brand CampaignDetail:
 * - Status filter tabs with dynamic counts (All, Needs review, Revision requested, Approved, Rejected)
 * - Details per card: Creator name, Open post link (verified), StatusBadge, Revisions used, Versions & Reviews history, locked fee
 * - Review action modals: Approve, Request Revision (max 2), Reject (final)
 * - Instant refresh on action and 409 error alerts
 */
function SubmissionList({ campaignId, onStatusChange }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('all');

  // Modals state
  const [approveTarget, setApproveTarget] = useState(null);
  const [approveBreakdown, setApproveBreakdown] = useState(null);
  const [revisionTarget, setRevisionTarget] = useState(null);
  const [rejectTarget, setRejectTarget] = useState(null);

  // Modal form states
  const [actionNote, setActionNote] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [modalError, setModalError] = useState('');

  useEffect(() => {
    fetchSubmissions();
  }, [campaignId]);

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/campaigns/${campaignId}/submissions`);
      setSubmissions(res.data);
    } catch (err) {
      setError('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (approveTarget?.feePaise) {
      api.get('/fees/preview', { params: { feePaise: approveTarget.feePaise } })
        .then(res => setApproveBreakdown(res.data))
        .catch(() => setApproveBreakdown(null));
    } else {
      setApproveBreakdown(null);
    }
  }, [approveTarget]);

  // 1. APPROVE ACTION
  const handleApprove = async () => {
    if (!approveTarget) return;
    setActionLoading(true);
    setModalError('');
    try {
      await api.post(`/submissions/${approveTarget._id}/approve`, {
        note: actionNote.trim() || undefined
      });
      setApproveTarget(null);
      setActionNote('');
      await fetchSubmissions();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to approve submission';
      setModalError(msg);
      alert(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // 2. REQUEST REVISION ACTION
  const handleRequestRevision = async (e) => {
    e.preventDefault();
    if (!revisionTarget) return;
    if (actionNote.trim().length < 5) {
      setModalError('Revision note must be at least 5 characters');
      return;
    }

    setActionLoading(true);
    setModalError('');
    try {
      await api.post(`/submissions/${revisionTarget._id}/request-revision`, {
        note: actionNote.trim()
      });
      setRevisionTarget(null);
      setActionNote('');
      await fetchSubmissions();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to request revision';
      setModalError(msg);
      alert(msg);
    } finally {
      setActionLoading(false);
    }
  };

  // 3. REJECT ACTION
  const handleReject = async (e) => {
    e.preventDefault();
    if (!rejectTarget) return;
    if (actionNote.trim().length < 5) {
      setModalError('Rejection note must be at least 5 characters');
      return;
    }

    setActionLoading(true);
    setModalError('');
    try {
      await api.post(`/submissions/${rejectTarget._id}/reject`, {
        note: actionNote.trim()
      });
      setRejectTarget(null);
      setActionNote('');
      await fetchSubmissions();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to reject submission';
      setModalError(msg);
      alert(msg);
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <div className="text-red-500 p-4">{error}</div>;

  // Filter tab counts
  const counts = {
    all: submissions.length,
    submitted: submissions.filter(s => s.status === 'submitted').length,
    revision_requested: submissions.filter(s => s.status === 'revision_requested').length,
    approved: submissions.filter(s => s.status === 'approved').length,
    rejected: submissions.filter(s => s.status === 'rejected').length
  };

  const filteredSubmissions = submissions.filter(s => {
    if (activeTab === 'all') return true;
    return s.status === activeTab;
  });

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto text-sm">
        <button
          onClick={() => setActiveTab('all')}
          className={`py-2 px-3 font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'all'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          All ({counts.all})
        </button>
        <button
          onClick={() => setActiveTab('submitted')}
          className={`py-2 px-3 font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'submitted'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Needs Review ({counts.submitted})
        </button>
        <button
          onClick={() => setActiveTab('revision_requested')}
          className={`py-2 px-3 font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'revision_requested'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Revision Requested ({counts.revision_requested})
        </button>
        <button
          onClick={() => setActiveTab('approved')}
          className={`py-2 px-3 font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'approved'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Approved ({counts.approved})
        </button>
        <button
          onClick={() => setActiveTab('rejected')}
          className={`py-2 px-3 font-medium border-b-2 whitespace-nowrap transition-colors ${
            activeTab === 'rejected'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          Rejected ({counts.rejected})
        </button>
      </div>

      {/* Submissions list */}
      {filteredSubmissions.length === 0 ? (
        <div className="p-8 bg-gray-50 border border-dashed rounded-lg text-center text-gray-500">
          No submissions found for this filter.
        </div>
      ) : (
        <div className="space-y-6">
          {filteredSubmissions.map(sub => {
            const isUrlValid = validateInstagramUrl(sub.postUrl).isValid;
            const feeRupees = (sub.feePaise / 100).toLocaleString('en-IN');
            const canReview = sub.status === 'submitted';
            const hasRevisionsLeft = sub.revisionsLeft > 0;

            return (
              <div key={sub._id} className="border rounded-lg bg-white p-5 shadow-sm space-y-4">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-3 border-b">
                  <div>
                    <h4 className="font-bold text-gray-900 text-base">{sub.creator?.name || 'Creator'}</h4>
                    <p className="text-xs text-gray-500">
                      Submitted on {formatDateIST(sub.createdAt)}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-600">
                      Revisions used: <span className="font-semibold text-gray-900">{sub.revisionCount}/2</span>
                    </span>
                    <StatusBadge status={sub.status} />
                  </div>
                </div>

                {/* Content & URL */}
                <div className="grid sm:grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase">Deliverable Link</span>
                    <div className="mt-1">
                      {isUrlValid ? (
                        <a
                          href={sub.postUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-indigo-600 hover:text-indigo-800 font-medium hover:underline break-all"
                        >
                          <span>Open post on Instagram ↗</span>
                        </a>
                      ) : (
                        <span className="text-gray-500 italic">Invalid Instagram link</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase">Locked Creator Fee</span>
                    <div className="mt-1 text-base font-bold text-gray-800">
                      <MoneyText paise={sub.feePaise} />
                    </div>
                  </div>
                </div>

                {/* Approved submission fee breakdown (collapsed by default) */}
                {sub.status === 'approved' && sub.payoutBreakdown && (
                  <div className="bg-emerald-50/50 border border-emerald-100 rounded-lg p-2.5">
                    <FeeBreakdown
                      breakdown={sub.payoutBreakdown}
                      compact={true}
                      isCreator={false}
                      showExpandToggle={true}
                    />
                  </div>
                )}

                {/* Revision due date banner if status is revision_requested */}
                {sub.status === 'revision_requested' && sub.revisionDueAt && (
                  <div className="bg-amber-50 border border-amber-200 rounded p-3 text-xs text-amber-800">
                    <span className="font-semibold">Revision Due By:</span> {formatDateIST(sub.revisionDueAt)}{' '}
                    <span className="font-medium text-amber-900">({formatCountdown(sub.revisionDueAt)})</span>
                  </div>
                )}

                {/* Version history & reviews */}
                <div className="bg-gray-50 p-3 rounded text-xs space-y-2 border">
                  <div className="font-semibold text-gray-700">History ({sub.versions?.length || 1} versions):</div>
                  <div className="space-y-1.5 pl-2 border-l-2 border-gray-300">
                    {sub.versions?.map((ver, idx) => (
                      <div key={idx} className="text-gray-600">
                        <span className="font-semibold">v{idx + 1}:</span> {formatDateIST(ver.submittedAt)}
                        {ver.note && <span className="italic ml-2">"{ver.note}"</span>}
                      </div>
                    ))}
                    {sub.reviews?.map((rev, idx) => (
                      <div key={`rev-${idx}`} className="text-indigo-700 font-medium">
                        <span className="uppercase font-semibold">[{rev.action}]:</span> "{rev.note}" - {formatDateIST(rev.at)}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Review action buttons for status 'submitted' */}
                {canReview && (
                  <div className="pt-3 border-t flex flex-wrap items-center gap-3">
                    <button
                      onClick={() => {
                        setApproveTarget(sub);
                        setActionNote('');
                        setModalError('');
                      }}
                      className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded hover:bg-green-700 shadow-xs transition-colors"
                    >
                      Approve Deliverable
                    </button>

                    <button
                      onClick={() => {
                        setRevisionTarget(sub);
                        setActionNote('');
                        setModalError('');
                      }}
                      disabled={!hasRevisionsLeft}
                      className={`px-4 py-2 text-sm font-semibold rounded shadow-xs transition-colors ${
                        hasRevisionsLeft
                          ? 'bg-amber-500 text-white hover:bg-amber-600'
                          : 'bg-gray-200 text-gray-500 cursor-not-allowed'
                      }`}
                      title={!hasRevisionsLeft ? 'Maximum 2 revisions already used.' : ''}
                    >
                      {hasRevisionsLeft ? 'Request Revision' : 'Maximum 2 revisions used. Approve or reject.'}
                    </button>

                    <button
                      onClick={() => {
                        setRejectTarget(sub);
                        setActionNote('');
                        setModalError('');
                      }}
                      className="px-4 py-2 bg-red-600 text-white text-sm font-semibold rounded hover:bg-red-700 shadow-xs transition-colors"
                    >
                      Reject Deliverable
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 1. APPROVE MODAL */}
      {Boolean(approveTarget) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Approve Deliverable</h3>
            <p className="text-sm text-gray-600 mb-3">
              Approve and release <span className="font-semibold text-gray-900"><MoneyText paise={approveTarget.feePaise} /></span> from your budget?{' '}
              {approveBreakdown && (
                <>Creator receives <span className="font-bold text-emerald-600"><MoneyText paise={approveBreakdown.netPayoutPaise} /></span>.</>
              )}
            </p>

            {modalError && (
              <div className="mb-4 text-red-600 bg-red-50 p-2.5 rounded text-sm border border-red-200">
                {modalError}
              </div>
            )}

            {approveBreakdown ? (
              <div className="mb-4">
                <FeeBreakdown breakdown={approveBreakdown} isCreator={false} compact={false} />
              </div>
            ) : (
              <div className="p-4 flex justify-center"><Spinner /></div>
            )}

            <div className="mb-4">
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Optional praise or feedback for creator:
              </label>
              <textarea
                rows={2}
                value={actionNote}
                onChange={(e) => setActionNote(e.target.value)}
                placeholder="Great job! The deliverable matches our brief perfectly..."
                className="w-full border-gray-300 rounded-md shadow-sm p-2 border text-xs focus:ring-green-500 focus:border-green-500"
              />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t">
              <button
                type="button"
                onClick={() => {
                  setApproveTarget(null);
                  setActionNote('');
                  setModalError('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={actionLoading}
                onClick={handleApprove}
                className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-semibold hover:bg-green-700 disabled:opacity-50"
              >
                {actionLoading ? 'Approving...' : 'Approve & Release Funds'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. REQUEST REVISION MODAL */}
      {Boolean(revisionTarget) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Request Revision</h3>
            <p className="text-sm text-gray-600 mb-4">
              Creator will have at least 48 hours to update and resubmit their deliverable.
              (Revision {revisionTarget.revisionCount + 1} of 2)
            </p>

            {modalError && (
              <div className="mb-4 text-red-600 bg-red-50 p-2.5 rounded text-sm border border-red-200">
                {modalError}
              </div>
            )}

            <form onSubmit={handleRequestRevision}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Revision Feedback (Required, min 5 chars) *
                </label>
                <textarea
                  required
                  rows={4}
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder="Explain clearly what changes or adjustments are required..."
                  className="w-full border-gray-300 rounded-md shadow-sm p-2.5 border sm:text-sm focus:ring-amber-500 focus:border-amber-500"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRevisionTarget(null);
                    setModalError('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || actionNote.trim().length < 5}
                  className="px-4 py-2 bg-amber-600 text-white rounded-md hover:bg-amber-700 disabled:opacity-50 text-sm font-medium shadow-xs"
                >
                  {actionLoading ? 'Sending...' : 'Send Revision Request'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. REJECT MODAL */}
      {Boolean(rejectTarget) && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-red-700 mb-2">Reject Submission</h3>
            <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded-md mb-4">
              <strong>Warning:</strong> This decision is final. The reserved ₹
              {(rejectTarget.feePaise / 100).toLocaleString('en-IN')} will return to your available budget and the slot will reopen.
            </div>

            {modalError && (
              <div className="mb-4 text-red-600 bg-red-50 p-2.5 rounded text-sm border border-red-200">
                {modalError}
              </div>
            )}

            <form onSubmit={handleReject}>
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason for Rejection (Required, min 5 chars) *
                </label>
                <textarea
                  required
                  rows={4}
                  value={actionNote}
                  onChange={(e) => setActionNote(e.target.value)}
                  placeholder="Explain why this deliverable was rejected..."
                  className="w-full border-gray-300 rounded-md shadow-sm p-2.5 border sm:text-sm focus:ring-red-500 focus:border-red-500"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setRejectTarget(null);
                    setModalError('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading || actionNote.trim().length < 5}
                  className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 text-sm font-medium shadow-xs"
                >
                  {actionLoading ? 'Rejecting...' : 'Reject Deliverable'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default SubmissionList;
