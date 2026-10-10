import React, { useState, useEffect } from 'react';
import api from '../api/axios';
import StatusBadge from './StatusBadge';

function SubmissionForm({ applicationId }) {
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [postUrl, setPostUrl] = useState('');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSubmission();
  }, [applicationId]);

  const fetchSubmission = async () => {
    try {
      const res = await api.get(`/submissions/application/${applicationId}`);
      setSubmission(res.data);
      if (res.data) {
        setPostUrl(res.data.postUrl || '');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const res = await api.post(`/submissions/application/${applicationId}`, { postUrl, note });
      setSubmission(res.data);
      alert('Work submitted successfully!');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit work. Ensure it is a valid HTTPS Instagram URL.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div>Loading submission details...</div>;

  const canSubmit = !submission || submission.status === 'revision_requested';

  return (
    <div className="mt-8 bg-gray-50 p-6 rounded-lg border border-gray-200">
      <h3 className="text-xl font-bold text-gray-900 mb-4">Submission</h3>
      
      {submission && (
        <div className="mb-4 bg-white p-4 rounded border border-gray-200">
          <p className="text-sm font-semibold mb-2">Current Status: <StatusBadge status={submission.status} /></p>
          <p className="text-sm"><strong>Link:</strong> <a href={submission.postUrl} target="_blank" rel="noreferrer" className="text-indigo-600 underline">{submission.postUrl}</a></p>
          {submission.reviews && submission.reviews.length > 0 && (
            <div className="mt-4 pt-4 border-t">
              <h4 className="font-semibold text-sm mb-2">Review History</h4>
              <ul className="space-y-2 text-sm">
                {submission.reviews.map((rev, i) => (
                  <li key={i} className="bg-gray-100 p-2 rounded">
                    <strong>{rev.action}</strong> - {rev.note || 'No notes'}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {canSubmit ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="text-red-500 text-sm">{error}</div>}
          <div>
            <label className="block text-sm font-medium text-gray-700">Instagram Post URL</label>
            <input 
              type="url" 
              required
              value={postUrl}
              onChange={(e) => setPostUrl(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
              placeholder="https://www.instagram.com/p/..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Note (Optional)</label>
            <textarea 
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm"
              rows={3}
            />
          </div>
          <button 
            type="submit" 
            disabled={submitting}
            className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded shadow hover:bg-indigo-700 disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Submit Work'}
          </button>
        </form>
      ) : (
        <div className="text-gray-600 italic">
          Your submission is currently being reviewed by the brand, or has already been finalized.
        </div>
      )}
    </div>
  );
}

export default SubmissionForm;
