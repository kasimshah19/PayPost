import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import StatusBadge from './StatusBadge';
import MoneyText from './MoneyText';

function SubmissionList({ campaignId, onStatusChange }) {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Review state
  const [reviewingId, setReviewingId] = useState(null);
  const [action, setAction] = useState('approved');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchSubmissions();
  }, [campaignId]);

  const fetchSubmissions = async () => {
    try {
      const res = await api.get(`/submissions/campaign/${campaignId}`);
      setSubmissions(res.data);
    } catch (err) {
      setError('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (e, submissionId) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post(`/submissions/${submissionId}/review`, { action, note });
      setReviewingId(null);
      setNote('');
      setAction('approved');
      await fetchSubmissions();
      if (onStatusChange) onStatusChange();
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to submit review');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>Loading submissions...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  if (submissions.length === 0) {
    return (
      <div className="p-4 bg-gray-50 border border-dashed rounded text-center text-gray-500">
        No submissions yet
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {submissions.map(sub => (
        <div key={sub._id} className="border p-4 rounded-md bg-gray-50">
          <div className="flex justify-between items-start mb-2">
            <div>
              <p className="font-semibold">{sub.creator.name}</p>
              <p className="text-xs text-gray-500">Submitted: {new Date(sub.createdAt).toLocaleDateString()}</p>
            </div>
            <StatusBadge status={sub.status} />
          </div>
          
          <div className="mb-4 text-sm">
            <strong>Link:</strong> <a href={sub.postUrl} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline">{sub.postUrl}</a>
          </div>

          {['submitted', 'revision_requested'].includes(sub.status) && (
            <div className="mt-4 border-t pt-4">
              {reviewingId === sub._id ? (
                <form onSubmit={(e) => handleReview(e, sub._id)} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Action</label>
                    <select 
                      value={action} 
                      onChange={e => setAction(e.target.value)}
                      className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                    >
                      <option value="approved">Approve & Release Payment</option>
                      <option value="revision_requested">Request Revision</option>
                      <option value="rejected">Reject</option>
                    </select>
                  </div>
                  {(action === 'revision_requested' || action === 'rejected') && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Reason / Note <span className="text-red-500">*</span></label>
                      <textarea 
                        required
                        value={note}
                        onChange={e => setNote(e.target.value)}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md"
                        rows={2}
                      />
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button type="submit" disabled={submitting} className="px-3 py-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 text-sm">
                      {submitting ? 'Saving...' : 'Submit Review'}
                    </button>
                    <button type="button" onClick={() => setReviewingId(null)} className="px-3 py-1 bg-gray-200 text-gray-800 rounded hover:bg-gray-300 text-sm">
                      Cancel
                    </button>
                  </div>
                </form>
              ) : (
                <button 
                  onClick={() => setReviewingId(sub._id)}
                  className="text-sm px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Review Submission
                </button>
              )}
            </div>
          )}

          {sub.status === 'approved' && sub.payoutBreakdown && (
            <div className="mt-4 bg-green-50 p-3 rounded text-sm text-green-800">
              <p><strong>Approved on:</strong> {new Date(sub.decidedAt).toLocaleDateString()}</p>
              <p>Payout of <MoneyText paise={sub.payoutBreakdown.grossFeePaise} /> has been released to the creator.</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default SubmissionList;
