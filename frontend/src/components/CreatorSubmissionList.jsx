import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import StatusBadge from './StatusBadge';
import MoneyText from './MoneyText';
import Spinner from './Spinner';
import { formatDateIST, formatCountdown } from '../utils/date';
import { useRealtimeRefetch } from '../realtime/useRealtimeRefetch';

function CreatorSubmissionList() {
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchSubmissions();
  }, []);

  useRealtimeRefetch(['submission:changed', 'campaign:changed'], () => fetchSubmissions(true));

  const fetchSubmissions = async () => {
    setLoading(true);
    try {
      const res = await api.get('/submissions/mine');
      setSubmissions(res.data);
    } catch (err) {
      setError('Failed to load submissions');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <Spinner />;
  if (error) return <div className="text-red-500 text-sm">{error}</div>;
  if (submissions.length === 0) {
    return <div className="text-gray-500 text-sm">No submissions yet.</div>;
  }

  return (
    <div className="space-y-4">
      {submissions.map((sub) => {
        const campaignId = sub.campaign?.id || sub.campaign?._id;
        const isRevisionRequested = sub.status === 'revision_requested';

        return (
          <div key={sub._id || sub.id} className="border rounded-lg p-4 bg-white shadow-sm space-y-2">
            <div className="flex justify-between items-start">
              <div>
                <Link
                  to={`/creator/campaigns/${campaignId}`}
                  className="font-bold text-indigo-600 hover:underline"
                >
                  {sub.campaign?.title || 'Campaign'}
                </Link>
                <div className="text-xs text-gray-500 mt-0.5">
                  Revisions: {sub.revisionCount}/2 used ({sub.revisionsLeft} left)
                </div>
              </div>
              <StatusBadge status={sub.status} />
            </div>

            {isRevisionRequested && sub.revisionDueAt && (
              <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800">
                <span className="font-semibold">Revision Due:</span> {formatDateIST(sub.revisionDueAt)}{' '}
                <span className="font-medium text-amber-900">({formatCountdown(sub.revisionDueAt)})</span>
                {sub.latestReviewNote && (
                  <p className="mt-1 italic text-gray-700">Note: "{sub.latestReviewNote}"</p>
                )}
              </div>
            )}

            <div className="flex justify-between items-center text-xs text-gray-600 pt-1 border-t">
              <div>
                Fee: <span className="font-semibold text-gray-800"><MoneyText paise={sub.feePaise} /></span>
              </div>
              <Link
                to={`/creator/campaigns/${campaignId}`}
                className="text-indigo-600 font-medium hover:underline"
              >
                View Details &rarr;
              </Link>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default CreatorSubmissionList;
