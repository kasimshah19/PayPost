import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import StatusBadge from './StatusBadge';
import MoneyText from './MoneyText';
import FeeBreakdown from './FeeBreakdown';
import Spinner from './Spinner';
import { validateInstagramUrl } from '../utils/instagram';
import { formatDateIST, formatCountdown } from '../utils/date';

/**
 * SubmissionForm Component for Creators:
 * - When no submission: Submit work form with instant Instagram validation & deadline countdown.
 * - When submitted: Status timeline (Submitted -> Under review -> Approved/Rejected).
 * - When revision requested: Brand's note, revisions used (X of 2), revision deadline, resubmit form.
 * - When approved: Fee approval notification.
 * - When rejected: Final rejection reason.
 * - Full version & review history.
 */
function SubmissionForm({ applicationId, campaign, onSubmissionUpdated }) {
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Form fields
  const [postUrl, setPostUrl] = useState('');
  const [note, setNote] = useState('');
  const [urlValidation, setUrlValidation] = useState(null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (applicationId) {
      fetchSubmission();
    }
  }, [applicationId]);

  const fetchSubmission = async () => {
    setLoading(true);
    try {
      // Backend supports GET /api/applications/:id/submission
      const res = await api.get(`/applications/${applicationId}/submission`);
      setSubmission(res.data);
      if (res.data) {
        setPostUrl(res.data.postUrl || '');
      }
    } catch (err) {
      // 404 means no submission exists yet
      if (err.response?.status !== 404) {
        console.error('Error fetching submission:', err);
      }
      setSubmission(null);
    } finally {
      setLoading(false);
    }
  };

  const handleUrlChange = (value) => {
    setPostUrl(value);
    setTouched(true);
    if (!value.trim()) {
      setUrlValidation(null);
    } else {
      setUrlValidation(validateInstagramUrl(value));
    }
  };

  // Submit deliverable (first time)
  const handleSubmit = async (e) => {
    e.preventDefault();
    const validation = validateInstagramUrl(postUrl);
    if (!validation.isValid) {
      setUrlValidation(validation);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await api.post(`/applications/${applicationId}/submission`, {
        postUrl: validation.postUrl,
        note: note.trim() || undefined
      });
      setSubmission(res.data);
      setNote('');
      if (onSubmissionUpdated) onSubmissionUpdated(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit work');
    } finally {
      setSubmitting(false);
    }
  };

  // Resubmit deliverable
  const handleResubmit = async (e) => {
    e.preventDefault();
    const validation = validateInstagramUrl(postUrl);
    if (!validation.isValid) {
      setUrlValidation(validation);
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const res = await api.put(`/submissions/${submission._id}/resubmit`, {
        postUrl: validation.postUrl,
        note: note.trim() || undefined
      });
      setSubmission(res.data);
      setNote('');
      if (onSubmissionUpdated) onSubmissionUpdated(res.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to resubmit work');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <Spinner />;

  const isDeadlinePassed = campaign?.submissionDeadline && new Date() > new Date(campaign.submissionDeadline);
  const isRevisionOverdue = submission?.revisionDueAt && new Date() > new Date(submission.revisionDueAt);

  // Status timeline steps
  const getTimelineStep = (status) => {
    if (!status) return 0;
    if (status === 'submitted') return 1;
    if (status === 'revision_requested') return 1;
    if (status === 'approved' || status === 'rejected') return 2;
    return 0;
  };

  const currentStep = getTimelineStep(submission?.status);

  return (
    <div className="mt-8 bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
      <h3 className="text-xl font-bold text-gray-900 mb-4">Deliverable Submission</h3>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {/* Case 1: No submission yet -> Show "Submit your work" card */}
      {!submission && (
        <div>
          <div className="bg-indigo-50 border border-indigo-100 rounded-md p-4 mb-6">
            <h4 className="font-semibold text-indigo-900 mb-1">Submit Your Work</h4>
            <p className="text-sm text-indigo-700">
              Your application has been approved! Post your content on Instagram and submit the link below.
            </p>
            <div className="mt-2 text-sm font-medium text-indigo-800">
              Submission Deadline: {formatDateIST(campaign?.submissionDeadline)}{' '}
              <span className={`ml-1 font-semibold ${isDeadlinePassed ? 'text-red-600' : 'text-indigo-600'}`}>
                ({formatCountdown(campaign?.submissionDeadline)})
              </span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">Instagram Post URL *</label>
              <input
                type="url"
                required
                disabled={isDeadlinePassed || submitting}
                value={postUrl}
                onChange={(e) => handleUrlChange(e.target.value)}
                placeholder="https://www.instagram.com/p/..."
                className={`mt-1 block w-full px-3 py-2 border rounded-md shadow-sm sm:text-sm focus:outline-none ${
                  touched && urlValidation
                    ? urlValidation.isValid
                      ? 'border-green-500 focus:ring-green-500'
                      : 'border-red-500 focus:ring-red-500'
                    : 'border-gray-300 focus:ring-indigo-500'
                } ${isDeadlinePassed ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              />
              {touched && urlValidation && (
                <p className={`mt-1 text-xs ${urlValidation.isValid ? 'text-green-600' : 'text-red-600'}`}>
                  {urlValidation.isValid ? '✓ Valid Instagram link format' : urlValidation.error}
                </p>
              )}
              <p className="mt-1 text-xs text-gray-400">
                Supports posts, reels, and videos (e.g. https://www.instagram.com/reel/C123xyz/)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700">Note for Brand (Optional)</label>
              <textarea
                value={note}
                disabled={isDeadlinePassed || submitting}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                placeholder="Add any context, metrics or caption details..."
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm focus:ring-indigo-500 focus:border-indigo-500"
              />
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="submit"
                disabled={isDeadlinePassed || submitting || (touched && urlValidation && !urlValidation.isValid)}
                className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-colors"
              >
                {submitting ? 'Submitting...' : 'Submit Work'}
              </button>
              {isDeadlinePassed && (
                <span className="text-sm font-medium text-red-600">
                  Submission deadline has passed.
                </span>
              )}
            </div>
          </form>
        </div>
      )}

      {/* Case 2: Submission exists -> Show Status Timeline & Status Card */}
      {submission && (
        <div className="space-y-6">
          {/* Status Timeline */}
          <div className="border rounded-lg p-4 bg-gray-50">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Submission Progress</h4>
            <div className="flex items-center justify-between relative">
              <div className="flex flex-col items-center z-10">
                <div className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm bg-indigo-600 text-white">
                  1
                </div>
                <span className="text-xs font-medium text-gray-700 mt-1">Submitted</span>
              </div>

              <div className={`flex-1 h-1 mx-2 ${currentStep >= 1 ? 'bg-indigo-600' : 'bg-gray-200'}`} />

              <div className="flex flex-col items-center z-10">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  submission.status === 'submitted' || submission.status === 'revision_requested'
                    ? 'bg-amber-500 text-white'
                    : currentStep > 1
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  2
                </div>
                <span className="text-xs font-medium text-gray-700 mt-1">Under Review</span>
              </div>

              <div className={`flex-1 h-1 mx-2 ${currentStep >= 2 ? 'bg-indigo-600' : 'bg-gray-200'}`} />

              <div className="flex flex-col items-center z-10">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  submission.status === 'approved'
                    ? 'bg-green-600 text-white'
                    : submission.status === 'rejected'
                    ? 'bg-red-600 text-white'
                    : 'bg-gray-200 text-gray-500'
                }`}>
                  3
                </div>
                <span className="text-xs font-medium text-gray-700 mt-1">
                  {submission.status === 'rejected' ? 'Rejected' : 'Approved'}
                </span>
              </div>
            </div>
          </div>

          {/* Status specific view */}
          {submission.status === 'submitted' && (
            <div className="bg-blue-50 border border-blue-200 rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-semibold text-blue-900">Waiting for brand's review</span>
                <StatusBadge status="submitted" />
              </div>
              <p className="text-sm text-blue-800 mb-2">
                Your post is currently under review by the brand.
              </p>
              <div className="text-sm text-gray-700">
                <strong>Submitted Link:</strong>{' '}
                <a
                  href={submission.postUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-indigo-600 hover:underline break-all"
                >
                  {submission.postUrl}
                </a>
              </div>
            </div>
          )}

          {submission.status === 'revision_requested' && (
            <div className="bg-amber-50 border border-amber-200 rounded-md p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-amber-900">Revision Requested</h4>
                  <p className="text-xs text-amber-700">
                    Revision {submission.revisionCount} of 2 used ({submission.revisionsLeft} remaining)
                  </p>
                </div>
                <StatusBadge status="revision_requested" />
              </div>

              {/* Brand's note in highlighted box */}
              {submission.reviews && submission.reviews.length > 0 && (
                <div className="bg-white p-3 rounded border border-amber-300">
                  <p className="text-xs font-bold text-amber-800 uppercase">Brand's Feedback:</p>
                  <p className="text-sm text-gray-800 mt-1">
                    "{submission.reviews[submission.reviews.length - 1]?.note}"
                  </p>
                </div>
              )}

              <div className="text-sm font-medium text-amber-900">
                Resubmit Due By: {formatDateIST(submission.revisionDueAt)}{' '}
                <span className={`font-semibold ${isRevisionOverdue ? 'text-red-600' : 'text-amber-700'}`}>
                  ({formatCountdown(submission.revisionDueAt)})
                </span>
              </div>

              {/* Resubmit form */}
              <form onSubmit={handleResubmit} className="space-y-3 pt-2 border-t border-amber-200">
                <h5 className="font-semibold text-sm text-gray-800">Resubmit Deliverable</h5>
                <div>
                  <label className="block text-xs font-medium text-gray-700">Instagram Post URL *</label>
                  <input
                    type="url"
                    required
                    disabled={isRevisionOverdue || submitting}
                    value={postUrl}
                    onChange={(e) => handleUrlChange(e.target.value)}
                    className="mt-1 block w-full px-3 py-2 border rounded-md shadow-sm sm:text-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  {touched && urlValidation && (
                    <p className={`mt-1 text-xs ${urlValidation.isValid ? 'text-green-600' : 'text-red-600'}`}>
                      {urlValidation.isValid ? '✓ Valid Instagram link format' : urlValidation.error}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-gray-700">Note on Changes (Optional)</label>
                  <textarea
                    value={note}
                    disabled={isRevisionOverdue || submitting}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    placeholder="Describe what was updated..."
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm sm:text-sm focus:ring-indigo-500 focus:border-indigo-500"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isRevisionOverdue || submitting}
                  className="px-5 py-2 bg-amber-600 text-white font-medium text-sm rounded hover:bg-amber-700 disabled:opacity-50 shadow-sm"
                >
                  {submitting ? 'Resubmitting...' : 'Resubmit for Review'}
                </button>
              </form>
            </div>
          )}

          {submission.status === 'approved' && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-5">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-bold text-emerald-900 text-lg flex items-center gap-2">
                  <span className="text-xl">🎉</span> Deliverable Approved!
                </h4>
                <StatusBadge status="approved" />
              </div>
              <p className="text-emerald-900 text-sm mb-3">
                {submission.payoutBreakdown ? (
                  <>
                    <span className="font-extrabold text-base text-emerald-700">
                      <MoneyText paise={submission.payoutBreakdown.netPayoutPaise} />
                    </span>{' '}
                    has been credited to your wallet (from gross fee <MoneyText paise={submission.payoutBreakdown.grossFeePaise} />).
                  </>
                ) : (
                  <>Your deliverable has been approved and funds credited to your wallet.</>
                )}
              </p>

              {submission.payoutBreakdown && (
                <div className="my-3">
                  <FeeBreakdown breakdown={submission.payoutBreakdown} isCreator={true} compact={false} />
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-emerald-200/60 text-sm">
                <div className="text-gray-700">
                  <span className="font-semibold text-gray-800">Approved Post:</span>{' '}
                  <a
                    href={submission.postUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-700 font-medium underline break-all hover:text-emerald-900"
                  >
                    {submission.postUrl}
                  </a>
                </div>

                <Link
                  to="/creator/wallet"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-colors"
                >
                  Go to Wallet &rarr;
                </Link>
              </div>
            </div>
          )}

          {submission.status === 'rejected' && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-red-900">Submission Rejected</h4>
                <StatusBadge status="rejected" />
              </div>
              {submission.reviews && submission.reviews.length > 0 && (
                <div className="bg-white p-3 rounded border border-red-200 mb-2">
                  <p className="text-xs font-bold text-red-800 uppercase">Reason from Brand:</p>
                  <p className="text-sm text-gray-800 mt-1">
                    "{submission.reviews[submission.reviews.length - 1]?.note}"
                  </p>
                </div>
              )}
              <p className="text-xs font-medium text-red-700">
                This decision is final. The application slot and reservation have been released.
              </p>
            </div>
          )}

          {/* Full history timeline (Versions & Reviews) */}
          <div className="border-t pt-4">
            <h4 className="font-bold text-sm text-gray-900 mb-3">Version & Review History</h4>
            <div className="space-y-3">
              {submission.versions?.map((ver, idx) => (
                <div key={idx} className="bg-gray-50 border rounded p-3 text-sm">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-gray-800">Version {idx + 1}</span>
                    <span className="text-xs text-gray-500">{formatDateIST(ver.submittedAt)}</span>
                  </div>
                  <p className="text-gray-700 text-xs break-all">
                    URL: <a href={ver.postUrl} target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">{ver.postUrl}</a>
                  </p>
                  {ver.note && <p className="text-gray-600 text-xs mt-1 italic">Note: "{ver.note}"</p>}
                </div>
              ))}

              {submission.reviews?.map((rev, idx) => (
                <div key={idx} className="bg-white border-l-4 border-indigo-400 rounded-r p-3 text-sm shadow-xs">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-gray-800 capitalize">
                      Brand Action: <StatusBadge status={rev.action} />
                    </span>
                    <span className="text-xs text-gray-500">{formatDateIST(rev.at)}</span>
                  </div>
                  {rev.note && <p className="text-gray-700 text-xs mt-1">Feedback: "{rev.note}"</p>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default SubmissionForm;
